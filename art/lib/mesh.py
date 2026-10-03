"""
Tiny mesh builder + low-poly shape generators.

Geometry is written in GAME coordinates (metres, Y up, player throws toward -Z) and
converted to Blender's Z-up internally: game (x, y, z) -> Blender (x, -z, y). The glTF
exporter converts back (Y-up), so a vertex ends up exactly where you wrote it.
Colours are per face (linear RGB), so every face is flat-coloured.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import bpy

from .palette import Color

V3 = tuple[float, float, float]


@dataclass
class MeshData:
    verts: list[V3] = field(default_factory=list)
    faces: list[tuple[int, ...]] = field(default_factory=list)
    colors: list[Color] = field(default_factory=list)  # one per face

    def add_vert(self, v: V3) -> int:
        self.verts.append(v)
        return len(self.verts) - 1

    def add_face(self, idx: tuple[int, ...], color: Color) -> None:
        self.faces.append(idx)
        self.colors.append(color)

    def append(self, other: "MeshData", color: Color | None = None) -> None:
        """Merge another MeshData in (optionally overriding its face colours)."""
        base = len(self.verts)
        self.verts.extend(other.verts)
        for f, c in zip(other.faces, other.colors):
            self.faces.append(tuple(i + base for i in f))
            self.colors.append(color if color is not None else c)

    def transformed(self, fn) -> "MeshData":
        out = MeshData(verts=[fn(v) for v in self.verts], faces=list(self.faces), colors=list(self.colors))
        return out

    def tri_count(self) -> int:
        return sum(len(f) - 2 for f in self.faces)

    def face_center(self, i: int) -> V3:
        f = self.faces[i]
        n = len(f)
        return (
            sum(self.verts[j][0] for j in f) / n,
            sum(self.verts[j][1] for j in f) / n,
            sum(self.verts[j][2] for j in f) / n,
        )

    def face_normal(self, i: int) -> V3:
        """Unit normal of face i (Newell's method)."""
        f = self.faces[i]
        nx = ny = nz = 0.0
        for k in range(len(f)):
            a, b = self.verts[f[k]], self.verts[f[(k + 1) % len(f)]]
            nx += (a[1] - b[1]) * (a[2] + b[2])
            ny += (a[2] - b[2]) * (a[0] + b[0])
            nz += (a[0] - b[0]) * (a[1] + b[1])
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        return (nx / ln, ny / ln, nz / ln)


def to_object(data: MeshData, name: str, material, location_game: V3 = (0.0, 0.0, 0.0)):
    """Creates a flat-shaded Blender object with a per-face-corner colour attribute 'Col'."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, -z, y) for x, y, z in data.verts], [], [list(f) for f in data.faces])
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = False
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    flat: list[float] = []
    for poly, col in zip(mesh.polygons, data.colors):
        for _ in range(poly.loop_total):
            flat.extend((col[0], col[1], col[2], 1.0))
    attr.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = 0
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (location_game[0], -location_game[2], location_game[1])
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --- shape generators (game coordinates) ------------------------------------------------

def box(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float, color: Color,
        bottom: bool = False, top_color: Color | None = None) -> MeshData:
    """Axis-aligned box centred at (cx, cy, cz). The bottom face is skipped unless asked for."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    m = MeshData()
    v = [m.add_vert((cx + dx * hx, cy + dy * hy, cz + dz * hz)) for dy in (-1, 1) for dz in (-1, 1) for dx in (-1, 1)]
    # index = dy*4 + dz*2 + dx  (each of dx,dz,dy in {0:-1, 1:+1})
    def i(dx, dy, dz):
        return v[dy * 4 + dz * 2 + dx]
    m.add_face((i(0, 1, 0), i(0, 1, 1), i(1, 1, 1), i(1, 1, 0)), top_color or color)  # +y
    m.add_face((i(0, 0, 1), i(1, 0, 1), i(1, 1, 1), i(0, 1, 1)), color)  # +z
    m.add_face((i(1, 0, 0), i(0, 0, 0), i(0, 1, 0), i(1, 1, 0)), color)  # -z
    m.add_face((i(1, 0, 1), i(1, 0, 0), i(1, 1, 0), i(1, 1, 1)), color)  # +x
    m.add_face((i(0, 0, 0), i(0, 0, 1), i(0, 1, 1), i(0, 1, 0)), color)  # -x
    if bottom:
        m.add_face((i(0, 0, 0), i(1, 0, 0), i(1, 0, 1), i(0, 0, 1)), color)  # -y
    return m


def icosphere(subdiv: int = 1) -> tuple[list[V3], list[tuple[int, int, int]]]:
    """Unit icosphere: subdiv 0 = 20 faces, 1 = 80, 2 = 320."""
    t = (1 + 5 ** 0.5) / 2
    raw = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    verts = [tuple(c / math.sqrt(x * x + y * y + z * z) for c in (x, y, z)) for x, y, z in raw]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5),
             (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(subdiv):
        cache: dict[tuple[int, int], int] = {}

        def mid(a: int, b: int) -> int:
            key = (min(a, b), max(a, b))
            if key not in cache:
                x, y, z = (verts[a][k] + verts[b][k] for k in range(3))
                ln = math.sqrt(x * x + y * y + z * z)
                verts.append((x / ln, y / ln, z / ln))
                cache[key] = len(verts) - 1
            return cache[key]

        new = []
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new
    return verts, faces


def tube(path: list[V3], radii: list[float], sides: int, ring_fn=None, cap_top: bool = True,
         up_hint: V3 = (0.0, 0.0, 1.0)) -> tuple[list[V3], list[tuple[int, ...]], list[int]]:
    """
    Tapered tube along a polyline. Returns (verts, quad/tri faces, ring_index_per_face).
    ring_fn(ring, k, angle) -> radial scale multiplier lets callers add irregularity.
    """
    verts: list[V3] = []
    faces: list[tuple[int, ...]] = []
    face_ring: list[int] = []
    n = len(path)
    for r in range(n):
        p = path[r]
        a = path[max(r - 1, 0)]
        b = path[min(r + 1, n - 1)]
        d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        ln = math.sqrt(sum(c * c for c in d)) or 1.0
        d = (d[0] / ln, d[1] / ln, d[2] / ln)
        # any perpendicular basis
        ref = up_hint if abs(d[0] * up_hint[0] + d[1] * up_hint[1] + d[2] * up_hint[2]) < 0.9 else (1.0, 0.0, 0.0)
        u = (d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0])
        lu = math.sqrt(sum(c * c for c in u)) or 1.0
        u = (u[0] / lu, u[1] / lu, u[2] / lu)
        w = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            rad = radii[r] * (ring_fn(r, k, ang) if ring_fn else 1.0)
            c, s = math.cos(ang) * rad, math.sin(ang) * rad
            verts.append((p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s))
    for r in range(n - 1):
        for k in range(sides):
            a0, a1 = r * sides + k, r * sides + (k + 1) % sides
            b0, b1 = (r + 1) * sides + k, (r + 1) * sides + (k + 1) % sides
            faces.append((a0, a1, b1, b0))
            face_ring.append(r)
    if cap_top:
        top = (n - 1) * sides
        faces.append(tuple(top + k for k in range(sides)))
        face_ring.append(n - 2)
    return verts, faces, face_ring
