"""
pine.glb (derborence): the big pine beside the far end of the court, with the floodlight.

`pine_a` (trunk base at the origin; instanced at layout_derborence.PINES): a thick, straight trunk
of reddish-grey bark plates split by dark fissures (greyer and more deeply cracked low down,
warmer higher up), bare to ~7 m but for a few dead stubs; then long limbs sweeping up and out,
the crown a loose, flat-topped mass of needle tufts (`pine_a_leaves`, lib/conifer.py tile "pine").
A small floodlight is bolted to the trunk at ~4.4 m, aimed toward -X (the game turns the tree so
it points at the court).
"""
from __future__ import annotations

import math

from lib.alpine import NMesh, VMesh, add, norm, ss
from lib.conifer import TILES, Cards, conifer_atlas_files, crown_normal, tube, tube_flat
from lib.materials import leaf_material, palette_material
from lib.mesh import to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm, value_noise

NAME = "pine"
SEED = 61
H = 20.0
R0 = 0.34
BARE = 7.0

PREVIEW = {
    "views": [
        ("all", (0.0, 7.0, 30.0), (0.0, 9.0, 0.0), 38),
        ("trunk", (-2.6, 1.7, 3.0), (0.0, 2.5, 0.0), 40),
        ("crown", (-6.0, 2.0, 8.0), (0.0, 11.0, 0.0), 36),
    ],
    "ground_size": 12.0,
    "ground_color": (0.24, 0.2, 0.15),
}


def _bark(v, r, k):
    """Smooth bark colour (limbs): reddish-grey, darker fissured patches."""
    x, y, z = v
    fiss = fbm(x * 3.0, y * 2.0, z * 3.0, SEED + 2, 2)
    c = mix(P["d_bark_pine_grey"], P["d_bark_pine"], ss(2.0, 9.0, y) * 0.8)
    return mix(c, P["d_bark_deep"], ss(0.55, 0.7, fiss) * 0.5)


def _plate(ctr, r, k):
    """Trunk faces: long vertical bark plates (one tone per plate) between thin dark fissures that
    wander sideways from one band of plates to the next (a fissure is one narrow face column)."""
    x, y, z = ctr
    band = int((y + 0.31 * (k % 5)) / 0.8)               # plates ~0.8 m long, staggered
    phase = int(value_noise(band * 1.0, 0.0, 2.0, SEED + 3) * 4.0)
    plate = (k + phase) // 4
    tone = value_noise(plate * 1.0, band * 1.0, 0.0, SEED + 1)
    warm = ss(1.5, 8.0, y)
    c = mix(scale(P["d_bark_pine_grey"], 0.86), scale(P["d_bark_pine"], 0.92), warm * 0.8 + 0.15 * tone)
    c = scale(c, 0.93 + 0.12 * tone)
    if (k + phase) % 4 == 0:
        c = mix(c, P["d_bark_deep"], 0.7)
    c = mix(c, P["d_lichen"], ss(0.9, 0.98, value_noise(plate * 1.3, band * 1.7, 5.0, SEED + 6)) * 0.3)
    return mix(c, P["d_moss_dark"], ss(1.0, 0.0, y) * 0.35)


def build_pine():
    rng = Rng(SEED)
    wood = VMesh()
    hs = [-0.45, -0.15, 0.1, 0.35, 0.7] + [0.7 + 0.2 * k for k in range(1, 37)] + \
        [7.9 + (H - 2.0 - 7.9) * k / 10 for k in range(1, 11)]
    path = [(0.06 * math.sin(h * 0.22), h, 0.05 * math.sin(h * 0.17 + 1.0)) for h in hs]
    radii = [R0 * (1.0 - max(h, 0.0) / (H + 2.0)) ** 0.7 * (1.0 + 0.55 * math.exp(-max(h, 0.0) / 0.4)) for h in hs]
    lobes = [(math.tau * i / 5 + rng.jitter(0.4), rng.uniform(0.6, 1.0)) for i in range(5)]

    def roots(ring, ang):
        h = hs[ring]
        w = 0.5 * math.exp(-max(h, 0.0) / 0.3) + (0.4 * -h if h < 0 else 0.0)
        return 1.0 + w * (sum(s * max(0.0, math.cos(ang - a)) ** 8 for a, s in lobes) - 0.2)

    trunk = NMesh()
    tube_flat(trunk, path, radii, 24, _plate, rng, jitter=0.015, radial=roots)
    # dead stubs on the bare trunk
    for _ in range(9):
        yy = rng.uniform(2.5, BARE)
        az = rng.uniform(0, math.tau)
        d = (math.cos(az), rng.uniform(-0.2, 0.15), math.sin(az))
        r = R0 * (1 - yy / H)
        s = add((0.0, yy, 0.0), (d[0], 0, d[2]), r * 0.8)
        tube(wood, [s, add(s, d, rng.uniform(0.12, 0.45))], [0.035, 0.015], 4, lambda p, rr, k: P["d_bark_pine_grey"],
             rng, cap=True)
    # the floodlight on its bracket, facing -X
    fy = 4.4
    rr = R0 * (1 - fy / (H + 2.0)) ** 0.7
    lamp = scale(P["d_roof"], 0.9)
    _box(wood, (-rr - 0.08, fy, 0.0), (0.16, 0.05, 0.05), P["d_log_dark"])           # bracket
    _box(wood, (-rr - 0.24, fy - 0.03, 0.0), (0.12, 0.2, 0.3), lamp)                 # housing
    _box(wood, (-rr - 0.305, fy - 0.03, 0.0), (0.012, 0.16, 0.26), P["d_white"])     # glass
    _box(wood, (-rr - 0.02, fy + 0.25, 0.0), (0.04, 0.45, 0.04), P["d_log_dark"])     # cable

    cards = Cards()
    nfn = crown_normal(0.0, 0.0, BARE, H, up=0.8)
    clusters = []
    nl = 7
    for i in range(nl):
        az = math.tau * i / nl + rng.jitter(0.4)
        yy = BARE + (H - BARE - 4.0) * (i / nl) + rng.jitter(0.5)
        L = rng.uniform(3.0, 4.6) * (1.0 - 0.35 * i / nl)
        if i == 1:
            az, L, yy = math.pi + 0.15, 5.2, BARE - 0.6   # the long low limb sweeping over the court side
        r = R0 * (1 - yy / (H + 2.0)) ** 0.7
        start = (math.cos(az) * r * 0.5, yy, math.sin(az) * r * 0.5)
        rise = rng.uniform(0.45, 0.8)
        p1 = add(start, (math.cos(az), rise * 0.6, math.sin(az)), L * 0.45)
        p2 = add(p1, (math.cos(az + 0.2), rise * 0.35, math.sin(az + 0.2)), L * 0.55)
        tube(wood, [start, p1, p2], [r * 0.3, r * 0.16, 0.035], 6,
             lambda p, rr_, k: mix(_bark(p, 0, 0), P["d_bark_pine_grey"], 0.4), rng, cap=False)
        clusters.append((p2, 1.5))
        clusters.append((add(p1, (0.0, 0.5, 0.0)), 1.1))
        for _ in range(2):
            b = add(p1, (math.cos(az + rng.jitter(1.2)), rng.uniform(0.2, 0.6), math.sin(az + rng.jitter(1.2))),
                    rng.uniform(1.0, 2.0))
            tube(wood, [p1, b], [0.07, 0.025], 4, lambda p, rr_, k: P["d_bark_pine"], rng, cap=False)
            clusters.append((b, 1.0))
    clusters.append(((0.0, H - 0.8, 0.0), 1.7))
    clusters.append(((0.3, H - 2.8, -0.4), 1.8))
    # tufts: cards on the upper shells of the clusters (flat-topped clouds)
    for (cx, cy, cz), cr in clusters:
        n = int(22 * cr * cr) + 8
        for _ in range(n):
            d = norm((rng.gauss(0, 1), abs(rng.gauss(0, 1)) * 0.8 - 0.15, rng.gauss(0, 1)))
            p = (cx + d[0] * cr, cy + d[1] * cr * 0.55, cz + d[2] * cr)
            along = norm((d[0] + rng.jitter(0.6), 0.25 + rng.jitter(0.3), d[2] + rng.jitter(0.6)))
            across = norm((-along[2], rng.jitter(0.6), along[0]))
            ln = rng.uniform(1.0, 1.45)
            ao = (0.62 + 0.38 * ss(-0.5, 0.8, d[1])) * (0.8 + 0.2 * ss(BARE, H, p[1]))
            col = scale(mix((1, 1, 1), (0.92, 0.97, 1.0), rng.random()), ao * (1.0 + rng.jitter(0.06)))
            cards.card(p, along, across, ln, ln * 0.75, TILES["pine"], nfn, col)
    return trunk, wood, cards


def _box(vm: VMesh, c, size, col) -> None:
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    v = [vm.vert((c[0] + dx * hx, c[1] + dy * hy, c[2] + dz * hz), col)
         for dy in (-1, 1) for dz in (-1, 1) for dx in (-1, 1)]

    def i(dx, dy, dz):
        return v[dy * 4 + dz * 2 + dx]
    for f in ((i(0, 1, 0), i(0, 1, 1), i(1, 1, 1), i(1, 1, 0)), (i(0, 0, 1), i(1, 0, 1), i(1, 1, 1), i(0, 1, 1)),
              (i(1, 0, 0), i(0, 0, 0), i(0, 1, 0), i(1, 1, 0)), (i(1, 0, 1), i(1, 0, 0), i(1, 1, 0), i(1, 1, 1)),
              (i(0, 0, 0), i(0, 0, 1), i(0, 1, 1), i(0, 1, 0)), (i(0, 0, 0), i(1, 0, 0), i(1, 0, 1), i(0, 0, 1))):
        vm.face(f)


def _smooth_normals(vm: VMesh, out: list, base: int) -> None:
    """Area-weighted vertex normals of vm's faces, written into out[base + i]."""
    acc = [[0.0, 0.0, 0.0] for _ in vm.m.verts]
    for fi, f in enumerate(vm.m.faces):
        n = vm.m.face_normal(fi)
        for i in f:
            acc[i][0] += n[0]
            acc[i][1] += n[1]
            acc[i][2] += n[2]
    for i, a in enumerate(acc):
        out[base + i] = norm(tuple(a))


def build():
    leaf_path = conifer_atlas_files()
    mat = palette_material()
    lmat = leaf_material(leaf_path)
    trunk, wood, cards = build_pine()
    # one object: the trunk's flat-coloured plates (own normals) + the limbs and lamp (smooth normals)
    nm = trunk
    for i, (p, c) in enumerate(zip(wood.m.verts, wood.vcol)):
        nm.vert(p, c, (0.0, 0.0, 0.0))
    base = len(trunk.m.verts) - len(wood.m.verts)
    _smooth_normals(wood, nm.normals, base)
    for f in wood.m.faces:
        nm.face(tuple(base + i for i in f))
    o = to_object(nm.m, "pine_a", mat, normals=nm.normals, vertex_colors=nm.vcol)
    triangulate(o)
    o2 = to_object(cards.m, "pine_a_leaves", lmat, uvs=cards.uvs, normals=cards.normals, vertex_colors=cards.vcol)
    triangulate(o2)
    return [o, o2]
