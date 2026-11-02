"""
Shape helpers for the alpine (Derborence) venue: angular limestone stones (convex hulls of jittered,
boxy point clouds), weathered round logs with checks along the grain (per-vertex colours), forest
litter (small fallen leaves, dry grass tufts) and simple shading helpers. Game coordinates
(metres, Y up). Colours from lib/palette.py only.
"""
from __future__ import annotations

import math

import bmesh

from .mesh import MeshData
from .palette import Color, P, mix, scale
from .rand import Rng, fbm, value_noise


def ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def norm(v):
    ln = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / ln, v[1] / ln, v[2] / ln)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


class VMesh:
    """MeshData + one colour per vertex (smooth meshes with painted detail)."""

    def __init__(self) -> None:
        self.m = MeshData()
        self.vcol: list[Color] = []

    def vert(self, p, c: Color) -> int:
        self.m.verts.append(p)
        self.vcol.append(c)
        return len(self.m.verts) - 1

    def face(self, idx) -> None:
        self.m.add_face(tuple(idx), (0.5, 0.5, 0.5))


class NMesh(VMesh):
    """VMesh with a normal per vertex: flat-coloured faces (unshared vertices) on smooth normals, so
    painted detail (grain, bark plates) stays crisp on a round surface. to_object(normals=...)."""

    def __init__(self) -> None:
        super().__init__()
        self.normals: list = []

    def vert(self, p, c: Color, n=(0.0, 1.0, 0.0)) -> int:
        self.normals.append(n)
        return super().vert(p, c)

    def quad(self, ps, ns, c: Color) -> None:
        self.face([self.vert(p, c, n) for p, n in zip(ps, ns)])


# --- stones ---------------------------------------------------------------------------------

def hull(points) -> list[tuple[tuple[float, float, float], ...]]:
    """Convex hull of 3D points -> list of faces (vertex positions), wound counter-clockwise outside."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    # drop interior leftovers
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    out = [tuple(tuple(v.co) for v in f.verts) for f in bm.faces]
    bm.free()
    return out


def stone_points(rng: Rng, radii, n: int = 14, boxy: float = 3.0, flat_base: float = 0.35):
    """Point cloud for an angular stone: superellipsoid directions (boxy > 2 = blockier), jittered."""
    pts = []
    for _ in range(n):
        d = norm((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
        k = (abs(d[0]) ** boxy + abs(d[1]) ** boxy + abs(d[2]) ** boxy) ** (-1.0 / boxy)
        j = 1.0 + rng.jitter(0.18)
        p = (d[0] * k * radii[0] * j, d[1] * k * radii[1] * j, d[2] * k * radii[2] * j)
        if p[1] < -radii[1] * flat_base:
            p = (p[0] * 0.92, -radii[1] * flat_base - rng.uniform(0, 0.15) * radii[1], p[2] * 0.92)
        pts.append(p)
    return pts


def block_points(rng: Rng, radii, chamfer: float = 0.22, jitter: float = 0.1):
    """Point cloud for a roughly squared building stone: chamfered, jittered box corners plus slightly
    bulging face centres (its hull reads as a dressed block, not a shard)."""
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                for axis in (0, 2):  # chamfer the vertical edges (and so the corners)
                    c = [sx * radii[0], sy * radii[1], sz * radii[2]]
                    c[axis] *= 1.0 - chamfer * rng.uniform(0.6, 1.4)
                    pts.append(tuple(v * (1.0 + rng.jitter(jitter)) for v in c))
    for axis in range(3):
        for sgn in (-1, 1):
            c = [0.0, 0.0, 0.0]
            c[axis] = sgn * radii[axis] * (1.0 + rng.uniform(0.0, 0.08))
            pts.append((c[0] + rng.jitter(0.2) * radii[0], c[1] + rng.jitter(0.2) * radii[1] * (axis != 1),
                        c[2] + rng.jitter(0.2) * radii[2]))
    return pts


def rock_color(rng: Rng, ny: float, y: float, base: str = "d_rock", moss: float = 0.0, lichen: float = 0.15,
               x: float = 0.0, z: float = 0.0) -> Color:
    """Bluish-grey limestone: lighter, weathered tops; darker, damp undersides; lichen / moss spots."""
    c = mix(P[base], rng.pick([P["d_rock_light"], P["d_rock_dark"], P["d_rock_warm"], P["d_rock"]]),
            rng.uniform(0.1, 0.55))
    c = mix(c, P["d_rock_light"], ss(0.3, 0.95, ny) * 0.3)
    c = mix(c, P["d_rock_dark"], ss(-0.1, -0.8, ny) * 0.55)
    if rng.random() < lichen:
        c = mix(c, P["d_lichen"], rng.uniform(0.3, 0.7))
    if moss > 0 and ny > 0.1:
        mz = fbm(x * 2.0, y * 2.0, z * 2.0, 77, 2)
        c = mix(c, mix(P["d_moss"], P["d_moss_dark"], rng.random()), ss(0.45, 0.6, mz) * moss)
    return scale(c, 1.0 + rng.jitter(0.06))


def add_stone(m: MeshData, centre, radii, yaw_deg: float, rng: Rng, n: int = 14, boxy: float = 3.0,
              tilt: float = 0.15, base: str = "d_rock", moss: float = 0.0, lichen: float = 0.15,
              flat_base: float = 0.35, block: bool = False) -> None:
    """An angular limestone stone (flat shaded, per-face colours) centred at `centre`; `block`: a
    squared building stone (walls, steps) instead of a field stone."""
    pts = block_points(rng, radii) if block else stone_points(rng, radii, n, boxy, flat_base)
    a = math.radians(yaw_deg)
    ca, sa = math.cos(a), math.sin(a)
    tx, tz = rng.jitter(tilt), rng.jitter(tilt)
    out = []
    for x, y, z in pts:
        # small tilt, then yaw, then translate
        y2 = y + x * tx + z * tz
        out.append((centre[0] + x * ca + z * sa, centre[1] + y2, centre[2] - x * sa + z * ca))
    for f in hull(out):
        idx = tuple(m.add_vert(v) for v in f)
        fi = len(m.faces)
        m.add_face(idx, (0.5, 0.5, 0.5))
        nrm = m.face_normal(fi)
        c = m.face_center(fi)
        m.colors[fi] = rock_color(rng, nrm[1], c[1] - centre[1], base, moss, lichen, c[0], c[2])


# --- logs -----------------------------------------------------------------------------------

def log_color(seed: int, along: float, ang: float, col_k: int, sides: int, up: float, crack: float,
              ground_y: float) -> Color:
    """Silver-grey weathered log: fine dark checks along the grain, bleached top, darker, mossy foot."""
    grain = value_noise(col_k * 1.0, along * 0.9, 0.0, seed + 3)
    fine = value_noise(col_k * 1.0 + 0.5, along * 2.7, 3.0, seed + 4)
    streak = fbm(col_k * 0.45, along * 0.3, 0.0, seed + 5, 2)
    c = mix(P["d_log"], P["d_log_grey"], ss(0.35, 0.7, streak) * 0.9)
    c = mix(c, P["d_log_light"], ss(0.25, 0.9, up) * 0.35)                  # sun-bleached top
    c = mix(c, P["d_log_dark"], ss(0.5, 0.78, grain) * 0.85)                # dark grain lines / checks
    c = mix(c, P["d_log_crack"], ss(0.8, 0.95, fine) * 0.45)
    c = mix(c, P["d_log_light"], ss(0.3, 0.08, grain) * 0.4 * ss(-0.2, 0.5, up))
    c = mix(c, P["d_log_dark"], ss(0.15, -0.6, up) * 0.6)                   # shaded, damp underside
    c = mix(c, P["d_moss_dark"], ss(0.0, -0.7, up) * 0.35 * ss(0.4, 0.7, fbm(along, col_k * 0.3, 1, seed + 9, 2)))
    c = mix(c, P["d_log_crack"], crack)
    return c


def add_log(vm: "NMesh", a, b, r: float, seed: int, ext_a=None, ext_b=None, sides: int = 20, seg_len: float = 0.3,
            arc=(-60.0, 240.0), cap_a: bool = True, cap_b: bool = True, cracks: int = 4, taper: float = 0.0,
            wobble: float = 0.012, ground_y: float = 0.0, tint=None) -> None:
    """
    Round log from a to b (centre line, game coords; horizontal or sloping). Only the arc of the
    circumference given by `arc` (degrees, 0 = toward the log's right side, 90 = up) is built, so a
    half-sunk log has no hidden underside. `ext_a(u)` / `ext_b(u)` -> axial extension (m) of the end
    at sideways offset u (mitred corners: ext = +-u). Checks: a few deep cracks along the grain.
    Flat-coloured faces on smooth normals (crisp grain lines). `tint`: (palette key, amount).
    """
    rng = Rng(seed)
    d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    L = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
    d = norm(d)
    side = norm(cross(d, (0.0, 1.0, 0.0)))  # right of the log
    up = norm(cross(side, d))
    full = (arc[1] - arc[0]) >= 359.0
    nk = sides if full else sides + 1
    angs = [math.radians(arc[0] + (arc[1] - arc[0]) * k / (sides if full else sides)) for k in range(nk)]
    crack_cols = [(rng.randrange(nk), rng.uniform(0.0, 1.0), rng.uniform(0.3, 0.9)) for _ in range(cracks)]
    nseg = max(2, math.ceil(L / seg_len))
    pos, nrm, crk = [], [], []
    for s in range(nseg + 1):
        t = s / nseg
        pr, nr, cr = [], [], []
        for k, ang in enumerate(angs):
            u, v = math.cos(ang), math.sin(ang)
            rr = r * (1.0 - taper * t) * (1.0 + rng.jitter(wobble))
            crack = 0.0
            for ck, c0, clen in crack_cols:
                if ck == k and c0 <= t <= min(1.0, c0 + clen):
                    crack = ss(0.0, 0.05, min(t - c0, c0 + clen - t))
            rr *= 1.0 - 0.14 * crack
            along = t * L
            if s == 0 and ext_a is not None:
                along = -ext_a(u * rr)
            if s == nseg and ext_b is not None:
                along = L + ext_b(u * rr)
            pr.append(add(add(add(a, d, along), side, u * rr), up, v * rr))
            nr.append(norm(add(add((0.0, 0.0, 0.0), side, u), up, v)))
            cr.append(crack)
        pos.append(pr)
        nrm.append(nr)
        crk.append(cr)
    nk2 = nk if full else nk - 1
    for s in range(nseg):
        along = (s + 0.5) / nseg * L
        for k in range(nk2):
            k2 = (k + 1) % nk
            vmid = math.sin(angs[k] + (angs[1] - angs[0]) / 2)
            crack = max(crk[s][k], crk[s + 1][k]) * 0.85
            c = log_color(seed, along, angs[k], k, nk, vmid, crack, ground_y)
            if tint:
                c = mix(c, P[tint[0]], tint[1])
            vm.quad((pos[s][k], pos[s + 1][k], pos[s + 1][k2], pos[s][k2]),
                    (nrm[s][k], nrm[s + 1][k], nrm[s + 1][k2], nrm[s][k2]), c)
    # end grain caps (pale, with a darker heart and ring)
    for cap, s, flip in ((cap_a, 0, False), (cap_b, nseg, True)):
        if not cap:
            continue
        ring = pos[s]
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        cz = sum(p[2] for p in ring) / len(ring)
        n = d if flip else (-d[0], -d[1], -d[2])
        for k in range(nk2):
            k2 = (k + 1) % nk
            c = mix(P["d_log_end"], P["d_log_grey"], 0.25 + 0.3 * rng.random())
            tri = ((cx, cy, cz), ring[k], ring[k2]) if not flip else ((cx, cy, cz), ring[k2], ring[k])
            vm.face([vm.vert(p, c, n) for p in tri])


# --- litter ---------------------------------------------------------------------------------

LEAF_KEYS = ["d_leaf_yellow", "d_leaf_yellow", "d_leaf_gold", "d_leaf_pale", "d_leaf_brown", "d_leaf_gold"]


def add_leaf(m: MeshData, normals: list, x: float, y: float, z: float, rng: Rng, size: float = 0.045,
             red: float = 0.0) -> None:
    """A small fallen birch / aspen leaf: a slightly curled diamond, both windings, normals up."""
    a = rng.uniform(0, math.tau)
    ca, sa = math.cos(a), math.sin(a)
    L = size * rng.uniform(0.8, 1.2)
    W = L * rng.uniform(0.55, 0.75)
    curl = rng.uniform(0.0, 0.25) * L
    pts = [(-L * 0.5, curl * 0.6), (0.0, -W * 0.5), (L * 0.5, curl), (0.0, W * 0.5)]
    lift = [0.0045 + curl * 0.4, 0.003, 0.0045 + curl, 0.003]
    vs = [(x + px * ca - pz * sa, y + ly, z + px * sa + pz * ca) for (px, pz), ly in zip(pts, lift)]
    key = "d_leaf_red" if rng.random() < red else rng.pick(LEAF_KEYS)
    c = scale(P[key], 1.0 + rng.jitter(0.12))
    if rng.random() < 0.2:
        c = mix(c, P["d_leaf_brown"], 0.5)
    base = len(m.verts)
    for v in vs:
        m.verts.append(v)
        normals.append((0.0, 1.0, 0.0))
    m.add_face((base, base + 3, base + 2, base + 1), c)  # up (counter-clockwise from above); never seen from below


VIEW = (0.0, 2.5, 9.0)  # the game cameras all look down the court from behind its near end


def add_tuft(m: MeshData, normals: list, x: float, y: float, z: float, rng: Rng, height: float = 0.2,
             blades: int = 6, keys=("d_grass_dry", "d_grass", "d_grass_dry", "d_fern")) -> None:
    """
    Dry grass tuft: thin leaning blades, normals up so it shades like the ground. One-sided: each
    blade is wound to face the cameras (VIEW), which never see the clearing from the far side.
    """
    for _ in range(blades):
        a = rng.uniform(0, math.tau)
        lean = rng.uniform(0.25, 0.85)
        h = height * rng.uniform(0.6, 1.15)
        w = rng.uniform(0.012, 0.022)
        ox, oz = rng.jitter(0.03), rng.jitter(0.03)
        ca, sa = math.cos(a), math.sin(a)
        b0 = (x + ox - sa * w, y - 0.01, z + oz + ca * w)
        b1 = (x + ox + sa * w, y - 0.01, z + oz - ca * w)
        tip = (x + ox + ca * h * lean, y + h * (1 - 0.35 * lean), z + oz + sa * h * lean)
        c = scale(P[rng.pick(list(keys))], 1.0 + rng.jitter(0.12))
        ct = mix(c, P["d_grass_dry"], 0.4)
        base = len(m.verts)
        for v in (b0, b1, tip):
            m.verts.append(v)
            normals.append((0.0, 1.0, 0.0))
        e1 = (b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2])
        e2 = (tip[0] - b0[0], tip[1] - b0[1], tip[2] - b0[2])
        fn = cross(e1, e2)
        to_view = (VIEW[0] - x, VIEW[1] - y, VIEW[2] - z)
        facing = fn[0] * to_view[0] + fn[1] * to_view[1] + fn[2] * to_view[2]
        m.add_face((base, base + 1, base + 2) if facing > 0 else (base, base + 2, base + 1), mix(c, ct, 0.5))


# --- boulders -------------------------------------------------------------------------------

def add_boulder(m: MeshData, centre, radii, yaw_deg: float, rng: Rng, n: int = 40, boxy: float = 4.0,
                cuts: int = 2, rough: float = 0.04, moss: float = 0.5, seed: int = 0, sink: float = 0.15,
                base: str = "d_rock") -> None:
    """
    A big angular limestone block: convex hull of a boxy point cloud, its faces subdivided and
    roughened with noise, flat shaded. Colours per small face: pale bluish grey, darker vertical
    water streaks on steep faces, lichen, moss on the up-facing parts, darker toward the ground.
    """
    pts = stone_points(rng, radii, n, boxy, flat_base=0.9)
    a = math.radians(yaw_deg)
    ca, sa = math.cos(a), math.sin(a)
    bm = bmesh.new()
    for x, y, z in pts:
        bm.verts.new((x * ca + z * sa, y, -x * sa + z * ca))
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    size = max(radii)
    for v in bm.verts:
        nrm = v.normal
        k = (fbm(v.co.x * 1.3 / size * 3, v.co.y * 1.3 / size * 3, v.co.z * 1.3 / size * 3, seed + 11, 3) - 0.5)
        v.co += nrm * (k * rough * size * 2.0)
    bm.normal_update()
    cx, cy, cz = centre
    for f in bm.faces:
        idx = tuple(m.add_vert((cx + v.co.x, cy + v.co.y - sink * radii[1], cz + v.co.z)) for v in f.verts)
        nrm = f.normal
        c0 = f.calc_center_median()
        wx, wy, wz = cx + c0.x, cy + c0.y, cz + c0.z
        col = mix(P[base], P["d_rock_light"], ss(0.35, 0.7, fbm(wx * 0.6, wy * 0.6, wz * 0.6, seed + 1, 3)) * 0.5)
        col = mix(col, P["d_rock_warm"], ss(0.5, 0.75, fbm(wx * 0.3, wy * 0.3, wz * 0.3, seed + 2, 2)) * 0.35)
        streak = fbm(wx * 2.5 + wz * 2.5, wy * 0.25, 0.0, seed + 3, 2)
        steep = 1.0 - abs(nrm.y)
        col = mix(col, P["d_rock_dark"], ss(0.55, 0.75, streak) * 0.6 * steep)
        col = mix(col, P["d_lichen"], ss(0.7, 0.85, fbm(wx * 1.7, wy * 1.7, wz * 1.7, seed + 4, 2)) * 0.5)
        mz = fbm(wx * 0.9, wy * 0.9, wz * 0.9, seed + 5, 3)
        mcol = mix(P["d_moss"], P["d_moss_dark"], ss(0.5, 0.7, mz))
        col = mix(col, mcol, ss(0.15, 0.6, nrm.y) * ss(0.4, 0.62, mz) * moss)
        col = mix(col, P["d_rock_dark"], ss(radii[1] * 0.4, -radii[1] * 0.3, c0.y) * 0.45)
        m.add_face(idx, scale(col, 1.0 + rng.jitter(0.05)))
    bm.free()


# --- export helpers -------------------------------------------------------------------------

def weld(m: MeshData, eps: float = 1e-4) -> MeshData:
    """Merges coincident vertices (faces keep their own colours). Flat-shaded meshes built face by
    face otherwise unwrap into one lightmap island per face (the atlas packer then overflows)."""
    out = MeshData()
    index: dict = {}
    remap = []
    for v in m.verts:
        key = (round(v[0] / eps), round(v[1] / eps), round(v[2] / eps))
        if key not in index:
            index[key] = out.add_vert(v)
        remap.append(index[key])
    for fi, (f, c) in enumerate(zip(m.faces, m.colors)):
        g = []
        for i in f:
            j = remap[i]
            if j not in g:
                g.append(j)
        if len(g) >= 3:
            out.add_face(tuple(g), c, smooth=fi in m.smooth)
    return out


def to_object_flat(nm: "NMesh", name: str, material, eps: float = 1e-4):
    """
    An NMesh (flat colour per face on smooth custom normals) as a Blender object with welded
    vertices (one lightmap island per surface, not per face): vertices merge where both position and
    normal agree, and the colour attribute is written per face corner.
    """
    from .mesh import to_object

    m = MeshData()
    normals: list = []
    index: dict = {}
    face_cols = []
    for f in nm.m.faces:
        g = []
        for i in f:
            v, n = nm.m.verts[i], nm.normals[i]
            key = (round(v[0] / eps), round(v[1] / eps), round(v[2] / eps),
                   round(n[0] * 50), round(n[1] * 50), round(n[2] * 50))
            if key not in index:
                index[key] = m.add_vert(v)
                normals.append(n)
            j = index[key]
            if j not in g:
                g.append(j)
        if len(g) >= 3:
            c = nm.vcol[f[0]]
            m.add_face(tuple(g), c)
            face_cols.append(c)
    obj = to_object(m, name, material, normals=normals)
    attr = obj.data.color_attributes["Col"]
    flat: list[float] = []
    for poly, c in zip(obj.data.polygons, face_cols):
        for _ in range(poly.loop_total):
            flat.extend((c[0], c[1], c[2], 1.0))
    attr.data.foreach_set("color", flat)
    return obj
