"""
props.glb (derborence): the clearing's furniture, all weathered wood and dry stone, outside the court:
  - half-log benches on two stumps: behind the far end (left of centre) and along the right side
    by the big pine; a split stump seat next to it
  - the dry-stone barbecue / table with a big slab on top, at the foot of the bank (right)
  - the small plank shed with its wooden barrel on a cradle (left of the court)
  - a pile of two big logs in front of the huge boulder, a low dry-stone wall on the left,
    a few old cut stumps and exposed roots
Two objects on the lightmap atlas: `props` (flat shaded: stone, planks, stumps) and `props_wood`
(round logs: flat-coloured grain on smooth normals, lib/alpine.add_log).
"""
from __future__ import annotations

import math

from lib.alpine import NMesh, add_log, add_stone, to_object_flat, weld
from lib.building import place
from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng

from . import site

NAME = "props"
SEED = 701

BENCH_FAR = {"x": -0.9, "z": -10.62, "len": 2.2, "yaw": 0.0}      # along X
BENCH_SIDE = {"x": 3.08, "z": -5.75, "len": 1.9, "yaw": 90.0}     # along Z, right side
SPLIT_STUMP = (2.9, -4.35)
LOG_PILE = ((4.4, -9.75), (8.9, -10.5))
STUMPS = [(-3.8, -7.2, 0.26), (6.0, 6.3, 0.3), (-8.4, 1.2, 0.24), (8.2, -4.0, 0.22)]
LOW_WALL = ((-10.8, -11.4), (-9.7, -5.4))
ROOTS = [
    # from a tree base (x, z) toward (dx, dz), length, radius
    (site.PINE[0], site.PINE[1], -0.9, 0.5, 1.6, 0.09),
    (site.PINE[0], site.PINE[1], -0.5, -0.9, 1.3, 0.08),
    (site.PINE[0], site.PINE[1], 0.8, 0.6, 1.4, 0.08),
    (-6.4, 3.4, 0.9, -0.3, 1.5, 0.07),
    (-6.4, 3.4, 0.4, 0.9, 1.2, 0.06),
    (6.0, 1.4, -0.95, 0.2, 1.4, 0.07),
    (-6.8, -1.8, 0.9, 0.4, 1.3, 0.06),
]

PREVIEW = {
    "views": [
        ("far", (0.5, 1.6, -6.0), (0.5, 0.4, -11.0), 34),
        ("side", (0.5, 1.5, -2.0), (3.0, 0.5, -6.0), 34),
        ("shed", (-3.0, 2.0, 0.5), (-7.0, 1.0, -3.6), 34),
        ("bbq", (1.5, 1.6, -9.0), (4.0, 0.6, -12.6), 34),
    ],
    "context": ["court", "terrain", "boulders"],
    "ground_size": 0.0,
}


def _wood(rng: Rng, base: str = "d_log", k: float = 0.0):
    c = mix(P[base], P["d_log_grey"], rng.random() * 0.6)
    return scale(c, 1.0 + rng.jitter(0.06) - k)


def stump(m: MeshData, x: float, z: float, r: float, h: float, rng: Rng, cut_top: bool = True) -> None:
    """A round stump: grey weathered sides (vertical cracks), pale end grain on top."""
    y = site.ground_y(x, z)
    n = 10
    side = _wood(rng, "d_log_grey")
    for k in range(n):
        a0, a1 = math.tau * k / n, math.tau * (k + 1) / n
        c = side if rng.random() > 0.25 else scale(P["d_log_dark"], 0.9)
        p = [(x + r * math.cos(a), y + yy, z + r * math.sin(a))
             for a, yy in ((a0, -0.15), (a1, -0.15), (a1, h), (a0, h))]
        idx = [m.add_vert(q) for q in p]
        m.add_face((idx[0], idx[3], idx[2], idx[1]), scale(c, 1.0 + rng.jitter(0.08)))
    if cut_top:
        top = [m.add_vert((x + r * math.cos(math.tau * k / n), y + h, z + r * math.sin(math.tau * k / n)))
               for k in range(n)]
        m.add_face(tuple(reversed(top)), mix(P["d_log_end"], P["d_log_grey"], 0.4))


def bench(m: MeshData, wood: NMesh, spec: dict, rng: Rng) -> None:
    """Half log, flat side up, resting on two stumps."""
    L = spec["len"]
    a = math.radians(spec["yaw"])
    ux, uz = math.cos(a), -math.sin(a)  # along the bench
    cx, cz = spec["x"], spec["z"]
    y = site.ground_y(cx, cz)
    for s in (-L * 0.32, L * 0.32):
        stump(m, cx + ux * s, cz + uz * s, 0.15, 0.36, rng)
    r = 0.15
    yc = y + 0.36 + 0.02
    pa = (cx - ux * L / 2, yc, cz - uz * L / 2)
    pb = (cx + ux * L / 2, yc, cz + uz * L / 2)
    add_log(wood, pa, pb, r, SEED + int(cx * 10), sides=12, seg_len=0.3, arc=(180.0, 360.0), cracks=2)
    # the flat (sawn) top
    side = (-uz, 0.0, ux)
    q = [(pa[0] - side[0] * r, yc, pa[2] - side[2] * r), (pb[0] - side[0] * r, yc, pb[2] - side[2] * r),
         (pb[0] + side[0] * r, yc, pb[2] + side[2] * r), (pa[0] + side[0] * r, yc, pa[2] + side[2] * r)]
    n = 6
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        a0 = tuple(q[0][i] + (q[1][i] - q[0][i]) * t0 for i in range(3))
        a1 = tuple(q[0][i] + (q[1][i] - q[0][i]) * t1 for i in range(3))
        b1 = tuple(q[3][i] + (q[2][i] - q[3][i]) * t1 for i in range(3))
        b0 = tuple(q[3][i] + (q[2][i] - q[3][i]) * t0 for i in range(3))
        c = mix(P["d_log_light"], P["d_log"], rng.random() * 0.5)
        tri = (a0, a1, b1, b0)
        # wind it to face up
        e1 = (a1[0] - a0[0], a1[2] - a0[2])
        e2 = (b0[0] - a0[0], b0[2] - a0[2])
        if e1[1] * e2[0] - e1[0] * e2[1] < 0:
            tri = tuple(reversed(tri))
        wood.face([wood.vert(p, c, (0.0, 1.0, 0.0)) for p in tri])


def split_stump(m: MeshData, x: float, z: float, rng: Rng) -> None:
    """A thick stump split down the middle: one half taller (a seat with a back)."""
    y = site.ground_y(x, z)
    r = 0.21
    n = 6
    for half, h in ((0, 0.62), (1, 0.44)):
        a0 = math.pi * half + 0.4
        ring_b, ring_t = [], []
        for k in range(n + 1):
            a = a0 + math.pi * k / n
            ring_b.append((x + r * math.cos(a), y - 0.15, z + r * math.sin(a)))
            ring_t.append((x + r * math.cos(a), y + h + rng.jitter(0.02), z + r * math.sin(a)))
        off = (math.cos(a0 + math.pi / 2) * 0.025, math.sin(a0 + math.pi / 2) * 0.025)
        ring_b = [(p[0] + off[0], p[1], p[2] + off[1]) for p in ring_b]
        ring_t = [(p[0] + off[0], p[1], p[2] + off[1]) for p in ring_t]
        side = _wood(rng, "d_log_grey", 0.05)
        for k in range(n):
            idx = [m.add_vert(p) for p in (ring_b[k], ring_b[k + 1], ring_t[k + 1], ring_t[k])]
            m.add_face((idx[0], idx[3], idx[2], idx[1]), scale(side, 1.0 + rng.jitter(0.1)))
        # split face (flat, darker, cracked) and top
        sp = [m.add_vert(p) for p in (ring_b[0], ring_t[0], ring_t[-1], ring_b[-1])]
        m.add_face(tuple(sp), scale(P["d_log_dark"], 1.1))
        top = [m.add_vert(p) for p in ring_t]
        m.add_face(tuple(reversed(top)), mix(P["d_log_end"], P["d_log_dark"], 0.35))


def bbq(m: MeshData, rng: Rng) -> None:
    """Dry-stone block (stacked stones over a dark core) with a big flat slab on top."""
    x, z = site.BBQ
    y = site.ground_y(x, z)
    w, d, h = 1.5, 1.0, 0.92
    m.append(box(x, y + h / 2 - 0.1, z, w - 0.1, h + 0.2, d - 0.1, scale(P["d_soil_dark"], 0.8)))
    for face in range(3):  # front (+z), left (-x), right (+x)
        L = w if face == 0 else d
        yy = y - 0.05
        row = 0
        while yy < y + h - 0.08:
            sh = rng.uniform(0.15, 0.24)
            s = -L / 2 + (rng.uniform(0.0, 0.15) if row % 2 else 0.0)
            while s < L / 2 - 0.05:
                sl = min(rng.uniform(0.25, 0.45), L / 2 - s)
                sc = s + sl / 2
                if face == 0:
                    c = (x + sc, yy + sh / 2, z + d / 2 - 0.08)
                    r = (sl / 2, sh / 2, 0.12)
                elif face == 1:
                    c = (x - w / 2 + 0.08, yy + sh / 2, z + sc)
                    r = (0.12, sh / 2, sl / 2)
                else:
                    c = (x + w / 2 - 0.08, yy + sh / 2, z + sc)
                    r = (0.12, sh / 2, sl / 2)
                add_stone(m, c, r, rng.jitter(4.0), rng, tilt=0.04, moss=0.3, lichen=0.3, block=True)
                s += sl
            yy += sh * 0.92
            row += 1
    # slab
    add_stone(m, (x, y + h + 0.06, z + 0.05), (w * 0.58, 0.07, d * 0.6), 4.0, rng, n=16, boxy=6.0, tilt=0.01,
              moss=0.25, lichen=0.4, flat_base=1.0)


def shed(m: MeshData, rng: Rng) -> None:
    """Small plank shed (2.0 x 1.5 m) on stone pads, door toward the court (+X), shingled gable roof."""
    lm = MeshData()
    W, D, Hw = 1.5, 2.1, 1.75   # local: x = width (door side faces +x), z = depth
    plank = [P["d_chalet_grey"], P["d_log_grey"], P["d_log_dark"], P["d_chalet"]]
    # walls: vertical planks on four sides
    sides = [((W / 2, 0.0, -D / 2), (0.0, 0.0, 1.0), D, (1.0, 0.0, 0.0)),    # +x front (door)
             ((-W / 2, 0.0, D / 2), (0.0, 0.0, -1.0), D, (-1.0, 0.0, 0.0)),  # -x back
             ((W / 2, 0.0, D / 2), (-1.0, 0.0, 0.0), W, (0.0, 0.0, 1.0)),    # +z
             ((-W / 2, 0.0, -D / 2), (1.0, 0.0, 0.0), W, (0.0, 0.0, -1.0))]  # -z
    for o, u, L, n in sides:
        k = 0
        s = 0.0
        while s < L - 1e-6:
            pw = min(rng.uniform(0.14, 0.2), L - s)
            # gable walls (+-z) go up to the ridge
            top0 = top1 = Hw
            if abs(n[2]) > 0.5:
                def roof_h(t):
                    xx = o[0] + u[0] * t
                    return Hw + 0.55 * (1 - abs(xx) / (W / 2))
                top0, top1 = roof_h(s), roof_h(s + pw)
            c = scale(mix(rng.pick(plank), P["d_log"], rng.random() * 0.3), 1.0 + rng.jitter(0.06))
            p0 = (o[0] + u[0] * s, -0.1, o[2] + u[2] * s)
            p1 = (o[0] + u[0] * (s + pw), -0.1, o[2] + u[2] * (s + pw))
            q = [p1, p0, (p0[0], top0, p0[2]), (p1[0], top1, p1[2])]  # outward
            lm.add_face(tuple(lm.add_vert(v) for v in q), c)
            s += pw
            k += 1
    # door on the +x side (darker planks, a frame, iron hinges)
    lm.append(box(W / 2 + 0.02, 0.85, -0.1, 0.04, 1.5, 0.8, scale(P["d_chalet_dark"], 1.1)))
    lm.append(box(W / 2 + 0.045, 1.12, -0.1, 0.012, 0.05, 0.6, P["iron"]))
    lm.append(box(W / 2 + 0.045, 0.45, -0.1, 0.012, 0.05, 0.6, P["iron"]))
    # roof: two planes of shingles (rows of darker / lighter wood), overhanging
    oh = 0.25
    ridge = Hw + 0.55 + 0.05
    for side in (-1, 1):
        rows = 6
        for r in range(rows):
            t0, t1 = r / rows, (r + 1) / rows
            x0 = side * (W / 2 + oh) * (1 - t0)
            x1 = side * (W / 2 + oh) * (1 - t1)
            y0 = ridge - 0.55 * (1 + oh / (W / 2)) * (1 - t0) - 0.0
            y1 = ridge - 0.55 * (1 + oh / (W / 2)) * (1 - t1)
            c = scale(mix(P["d_roof"], P["d_chalet_grey"], 0.5 + 0.3 * rng.random()), 1.0 + (0.08 if r % 2 else -0.04))
            q = [(x0, y0, -D / 2 - oh), (x0, y0, D / 2 + oh), (x1, y1, D / 2 + oh), (x1, y1, -D / 2 - oh)]
            if side > 0:
                q = [q[0], q[3], q[2], q[1]]
            lm.add_face(tuple(lm.add_vert(v) for v in q), c)
            # underside
            lm.add_face(tuple(lm.add_vert((v[0], v[1] - 0.04, v[2])) for v in reversed(q)), scale(P["d_chalet"], 0.7))
    x, z = site.SHED
    y = site.ground_y(x, z) + 0.12
    m.append(place(lm, (x, y, z), 0.0))
    # stone pads under the corners
    for dx in (-W / 2, W / 2):
        for dz in (-D / 2, D / 2):
            add_stone(m, (x + dx, y - 0.08, z + dz), (0.16, 0.12, 0.16), rng.uniform(0, 360), rng, n=12)


def barrel(m: MeshData, rng: Rng) -> None:
    """Wooden barrel lying on its side on a little cradle beside the shed (axis along Z)."""
    x, z = site.SHED[0] + 1.2, site.SHED[1] + 1.55
    y = site.ground_y(x, z)
    R, L, n = 0.36, 0.95, 14
    cy = y + 0.3 + R
    rings = 7
    verts = []
    for i in range(rings + 1):
        t = i / rings
        rr = R * (0.86 + 0.14 * math.sin(math.pi * t))
        zz = z - L / 2 + L * t
        verts.append([(x + rr * math.cos(math.tau * k / n), cy + rr * math.sin(math.tau * k / n), zz)
                      for k in range(n)])
    staves = [scale(mix(P["d_chalet"], P["d_chalet_grey"], rng.random() * 0.6), 1.0 + rng.jitter(0.08))
              for _ in range(n)]
    for i in range(rings):
        hoop = i in (0, 1, rings - 2, rings - 1) and (i in (1, rings - 2))
        for k in range(n):
            k2 = (k + 1) % n
            c = scale(P["iron"], 1.2) if hoop else staves[k]
            q = [verts[i][k], verts[i][k2], verts[i + 1][k2], verts[i + 1][k]]
            m.add_face(tuple(m.add_vert(v) for v in q), c)
    for i, flip in ((0, True), (rings, False)):
        q = verts[i] if not flip else list(reversed(verts[i]))
        m.add_face(tuple(m.add_vert(v) for v in q), scale(P["d_chalet"], 1.15))
    # cradle: two cross beams on legs
    for dz in (-0.3, 0.3):
        m.append(box(x, y + 0.24, z + dz, 0.9, 0.1, 0.1, _wood(rng, "d_chalet_grey"), top_color=_wood(rng, "d_log")))
        for dx in (-0.35, 0.35):
            m.append(box(x + dx, y + 0.1, z + dz, 0.08, 0.36, 0.08, _wood(rng, "d_chalet_grey")))


def low_wall(m: MeshData, rng: Rng) -> None:
    (x0, z0), (x1, z1) = LOW_WALL
    L = math.hypot(x1 - x0, z1 - z0)
    ux, uz = (x1 - x0) / L, (z1 - z0) / L
    s = 0.0
    while s < L:
        sl = rng.uniform(0.3, 0.55)
        x, z = x0 + ux * (s + sl / 2), z0 + uz * (s + sl / 2)
        gy = site.ground_y(x, z)
        hh = 0.55 + 0.1 * math.sin(s * 0.8)
        yy = gy - 0.05
        while yy < gy + hh:
            sh = rng.uniform(0.15, 0.24)
            add_stone(m, (x + rng.jitter(0.05), yy + sh / 2, z + rng.jitter(0.05)), (0.24, sh / 2, sl / 2),
                      math.degrees(math.atan2(ux, uz)) + 90 + rng.jitter(6), rng, tilt=0.06, moss=0.5, block=True)
            yy += sh * 0.9
        s += sl * 0.95


def build():
    rng = Rng(SEED)
    m = MeshData()
    wood = NMesh()
    bench(m, wood, BENCH_FAR, rng)
    bench(m, wood, BENCH_SIDE, rng)
    split_stump(m, *SPLIT_STUMP, rng)
    bbq(m, rng)
    shed(m, rng)
    barrel(m, rng)
    low_wall(m, rng)
    for x, z, r in STUMPS:
        stump(m, x, z, r, rng.uniform(0.25, 0.45), rng)
    # log pile: two big logs, one on the other, in front of the huge boulder
    (ax, az), (bx, bz) = LOG_PILE
    ya = site.ground_y((ax + bx) / 2, (az + bz) / 2) + 0.18
    add_log(wood, (ax, ya, az), (bx, ya + 0.1, bz), 0.24, SEED + 3, sides=16, seg_len=0.4, arc=(-40.0, 220.0), cracks=4,
            taper=0.12)
    add_log(wood, (ax + 0.3, ya + 0.4, az - 0.05), (bx - 0.4, ya + 0.48, bz - 0.04), 0.21, SEED + 4, sides=16,
            seg_len=0.4, arc=(-60.0, 240.0), cracks=4, taper=0.1)
    # exposed roots running out from the tree bases, half buried
    for x, z, dx, dz, L, r in ROOTS:
        ln = math.hypot(dx, dz)
        dx, dz = dx / ln, dz / ln
        p0 = (x + dx * 0.35, site.ground_y(x, z) + r * 0.2, z + dz * 0.35)
        p1 = (x + dx * (0.35 + L), site.ground_y(x + dx * L, z + dz * L) - r * 0.4, z + dz * (0.35 + L))
        add_log(wood, p0, p1, r, SEED + int(L * 100), sides=8, seg_len=0.25, arc=(0.0, 180.0), cracks=0, taper=0.65,
                cap_a=False, tint=("d_root", 0.55))
    objs = []
    o = to_object(weld(m), "props", palette_material())
    triangulate(o)
    objs.append(o)
    o = to_object_flat(wood, "props_wood", palette_material())
    triangulate(o)
    objs.append(o)
    return objs
