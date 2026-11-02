"""
terrain.glb (derborence): the bank behind the far end of the court and the chalet's terrace.

A dry-stone retaining wall of grey limestone runs along the foot of the bank; above it a slope of
dry grass, yellowing ferns and moss with a few stones climbs ~2 m to the terrace, where a path of
packed earth leads from the top of the steps (stone treads with half-sunk log nosings, left of the
court axis) to the chalet. Behind the chalet the forest floor keeps rising.

Objects (all on the lightmap atlas, since a planar map at y = 0 would put their shadows metres off):
  terrain          the ground inside site.TERRAIN_RECT (smooth, per-vertex colour patches); its
                   edge vertices are exactly the planar surround's (court.py), so they meet seamlessly
  terrain_stones   the retaining wall, the step treads and the stones on the slope (flat shaded)
  terrain_wood     the log nosings of the steps
"""
from __future__ import annotations

import math

from lib.alpine import NMesh, add_log, add_stone, ss, to_object_flat, weld, stone_object
from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

from . import site

NAME = "terrain"
SEED = 401

PREVIEW = {
    "views": [
        ("front", (0.0, 2.3, 7.0), (-1.0, 1.2, -12.0), 40),
        ("bank", (-1.0, 2.0, -6.5), (-2.5, 1.0, -13.0), 34),
        ("high", (6.0, 9.0, 4.0), (-3.0, 0.0, -16.0), 30),
    ],
    "context": ["court"],
    "ground_size": 0.0,
}


def terrain_axes() -> tuple[list[float], list[float]]:
    """Grid lines of the terrain mesh (shared with the surround along the rectangle's edges)."""
    tr = site.TERRAIN_RECT
    nx = round((tr["x1"] - tr["x0"]) / 0.8)
    xs = [tr["x0"] + (tr["x1"] - tr["x0"]) * i / nx for i in range(nx + 1)]
    # extra lines along the steps, so the ramp under them is carved out of the bank
    sx, hw = site.STEPS["x"], site.STEPS["w"] / 2
    extra = [sx - hw - 0.4, sx - hw - 0.05, sx, sx + hw + 0.05, sx + hw + 0.4]
    xs = sorted(set(round(x, 4) for x in xs + extra))
    xs = [x for i, x in enumerate(xs) if i == 0 or x - xs[i - 1] > 0.12]
    zs = []
    # back part (the terrace, behind the chalet) at ~1.1 m, the bank (foot ~ -12, terrace edge ~ -14.3) finer
    nback = round((-15.4 - tr["z0"]) / 1.1)
    zs += [tr["z0"] + (-15.4 - tr["z0"]) * k / nback for k in range(nback)]
    zs.append(-15.4)
    nb = 14
    zs += [-15.4 + (tr["z1"] + 15.4) * k / nb for k in range(1, nb + 1)]
    return xs, zs


def ground_color(x: float, z: float, y: float, rng: Rng):
    zf = site.bank_foot(x)
    t = zf - z                      # metres behind the foot of the bank
    w = site.bank_weight(x)
    n1 = fbm(x * 0.35, z * 0.35, 0.0, SEED + 1, 3)
    n2 = fbm(x * 1.1, z * 1.1, 2.0, SEED + 3, 2)
    n3 = fbm(x * 0.2 + 3.0, z * 0.2, 5.0, SEED + 5, 2)
    # base: forest floor
    c = mix(P["d_litter"], P["d_soil"], ss(0.4, 0.65, n2) * 0.6)
    c = mix(c, P["d_needles"], ss(0.6, 0.8, n2) * 0.3)
    # the slope: dry grass, yellowing ferns, moss (photo: grassy bank with bracken)
    slope = ss(-0.1, 0.4, t) * ss(site.BANK_RUN + 0.5, site.BANK_RUN - 0.1, t) * w
    grass = mix(P["d_grass"], P["d_grass_green"], ss(0.4, 0.7, n3) * 0.7)
    grass = mix(grass, P["d_grass_dry"], ss(0.55, 0.75, n1) * 0.6)
    grass = mix(grass, P["d_fern"], ss(0.6, 0.75, n2) * 0.45)
    grass = mix(grass, P["d_moss_dark"], ss(0.62, 0.8, n1 * 0.5 + n2 * 0.5) * 0.55)
    grass = mix(grass, P["d_soil"], ss(0.42, 0.25, n2) * 0.5)
    grass = scale(grass, 0.88)
    c = mix(c, grass, slope * 0.92)
    # behind the wall stones: dark soil
    c = mix(c, P["d_soil_dark"], ss(0.45, 0.05, t) * ss(-0.2, 0.05, t) * 0.7 * w)
    # the terrace: grass and needle litter, a path of packed earth from the steps to the chalet door
    terrace = ss(site.BANK_RUN - 0.2, site.BANK_RUN + 0.4, t) * w
    tcol = mix(P["d_grass"], P["d_litter"], ss(0.4, 0.6, n1))
    tcol = mix(tcol, P["d_grass_green"], ss(0.6, 0.75, n3) * 0.4)
    tcol = mix(tcol, P["d_needles_dark"], ss(0.6, 0.8, n2) * 0.35)
    c = mix(c, tcol, terrace * 0.8)
    cx = site.CHALET["x"]
    path = ss(1.0, 0.45, abs(x - site.STEPS["x"])) * terrace * ss(site.CHALET["z"] - 0.2, site.CHALET["z"] + 0.6, z)
    hw = site.CHALET["w"] / 2
    front = ss(0.6, 0.0, abs(z - (site.CHALET["z"] + 0.65))) * ss(hw + 0.8, hw, abs(x - cx))
    c = mix(c, mix(P["d_soil"], P["d_gravel_dark"], 0.35), max(path, front * terrace) * 0.75)
    # under the chalet / its eaves: dry dusty earth
    under = ss(0.6, 0.0, max(abs(x - cx) - hw, site.CHALET["z"] - site.CHALET["d"] - z, z - site.CHALET["z"]))
    c = mix(c, P["d_soil_dark"], under * 0.6)
    # steps: worn earth around them
    c = mix(c, P["d_soil"], site.steps_weight(x) * slope * 0.6)
    # beyond the terrace edges and far back: the forest's deep shade
    c = scale(c, 1.0 - 0.35 * ss(-24.0, -32.0, z) - 0.3 * ss(4.0, 10.5, abs(x + 4.0) - 6.0))
    return scale(c, 1.0 + rng.jitter(0.04))


def build_ground(rng: Rng) -> MeshData:
    xs, zs = terrain_axes()
    m = MeshData()
    grid = [[m.add_vert((x, site.ground_y(x, z), z)) for x in xs] for z in zs]
    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            c = ground_color(cx, cz, site.ground_y(cx, cz), rng)
            a, b, d, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            m.add_face((a, e, d), c)
            m.add_face((a, d, b), scale(c, 1.0 + rng.jitter(0.03)))
    return m


def build_wall(m: MeshData, rng: Rng) -> None:
    """Dry-stone retaining wall along the foot of the bank: courses of flattish blocks, leaning back."""
    sx, sw = site.STEPS["x"], site.STEPS["w"]
    x = site.WALL_X[0] - 0.4
    while x < site.WALL_X[1] + 0.4:
        L = rng.uniform(0.38, 0.7)
        xc = x + L / 2
        if abs(xc - sx) < sw / 2 + 0.12:
            x = sx + sw / 2 + 0.12
            continue
        wh = site.wall_height(xc)
        if wh < 0.12:
            x += L
            continue
        zf = site.bank_foot(xc)
        y = site.ground_y(xc, zf + 0.3) - 0.04
        course = 0
        while y < wh - 0.06:
            h = rng.uniform(0.19, 0.29)
            ln = L * rng.uniform(0.85, 1.1) if course else L
            off = 0.0 if course % 2 == 0 else rng.jitter(0.1)
            back = 0.08 * (y / max(wh, 0.1))  # battered face
            add_stone(m, (xc + off, y + h * 0.45, zf - 0.2 - back), (ln * 0.52, h * 0.52, 0.27), rng.jitter(4.0), rng,
                      tilt=0.04, moss=0.35, lichen=0.3, block=True)
            y += h * rng.uniform(0.86, 0.95)
            course += 1
        x += L * rng.uniform(0.85, 1.0)


def build_steps(m: MeshData, wood: NMesh, rng: Rng) -> None:
    """Stone treads on riser stones, with cheek stones either side and half-sunk log nosings, foot of
    the bank -> terrace."""
    sx, sw, n = site.STEPS["x"], site.STEPS["w"], site.STEPS["n"]
    zf = site.bank_foot(sx)
    run = site.BANK_RUN / n
    for k in range(n):
        z_front = zf - k * run + 0.06
        top = site.SURROUND_EDGE_Y + site.BANK_H * (k + 1) / n - 0.01
        # tread: two or three flat stones side by side
        parts = 2 if k % 2 else 3
        for p in range(parts):
            w = sw / parts
            px = sx - sw / 2 + w * (p + 0.5) + rng.jitter(0.04)
            add_stone(m, (px, top - 0.09, z_front - run * 0.55), (w * 0.52, 0.1, run * 0.5), rng.jitter(5.0), rng,
                      tilt=0.02, moss=0.2, lichen=0.2, block=True)
        # riser stones under the front edge, down into the slope (the tread rests on them), and a
        # cheek stone either side holding the step into the bank
        rise = site.BANK_H / n
        add_stone(m, (sx, top - 0.1 - rise * 0.5, z_front - 0.07), (sw * 0.5, rise * 0.5 + 0.08, 0.1), rng.jitter(2.0),
                  rng, tilt=0.01, moss=0.15, lichen=0.2, block=True, base="d_rock_dark")
        for side in (-1, 1):
            add_stone(m, (sx + side * (sw / 2 + 0.13), top - 0.1, z_front - run * 0.5),
                      (0.14, 0.17, run * 0.55), rng.jitter(4.0), rng, tilt=0.03, moss=0.3, lichen=0.2, block=True)
        # log nosing at the front edge of the tread, mostly sunk
        add_log(wood, (sx - sw / 2 - 0.08, top - 0.06, z_front + 0.02),
                (sx + sw / 2 + 0.08, top - 0.05, z_front + 0.02), 0.075, SEED + 50 + k, sides=10, seg_len=0.35,
                arc=(-40.0, 220.0), cracks=2)
    # a few boulders flanking the steps
    for dx in (-sw / 2 - 0.35, sw / 2 + 0.3):
        for k in (1, 4):
            z = zf - k * run - 0.1
            add_stone(m, (sx + dx + rng.jitter(0.08), site.ground_y(sx + dx, z) + 0.05, z), (0.28, 0.2, 0.25),
                      rng.uniform(0, 360), rng, n=14, boxy=2.6, moss=0.2, base="d_rock_light")


def build_slope_rocks(m: MeshData, rng: Rng) -> None:
    """Grey stones half-buried on the bank and the terrace (more near the wall)."""
    n = 0
    tries = 0
    while n < 34 and tries < 3000:
        tries += 1
        x = rng.uniform(-14.0, 7.0)
        zf = site.bank_foot(x)
        z = zf - rng.uniform(0.4, 5.0)
        if site.bank_weight(x) < 0.3 or site.steps_weight(x) > 0.05:
            continue
        cx, cz = site.CHALET["x"], site.CHALET["z"]
        if abs(x - cx) < site.CHALET["w"] / 2 + 1.0 and z < cz + 1.2:
            continue
        r = rng.uniform(0.12, 0.32) if rng.random() < 0.85 else rng.uniform(0.35, 0.55)
        y = site.ground_y(x, z)
        add_stone(m, (x, y + r * 0.3, z), (r, r * rng.uniform(0.5, 0.75), r * rng.uniform(0.7, 1.0)),
                  rng.uniform(0, 360), rng, n=rng.randrange(12, 17), boxy=rng.uniform(2.2, 3.4), moss=0.2, lichen=0.3,
                  base="d_rock_light")  # pale like the wall: half-buried, they get little sky
        n += 1


def build_ferns(m: MeshData, rng: Rng) -> None:
    """Clumps of yellowing bracken / ferns and dead fronds on the bank (flat shaded, facing up)."""
    n = 0
    tries = 0
    while n < 70 and tries < 4000:
        tries += 1
        x = rng.uniform(-13.5, 6.0)
        t = rng.uniform(0.35, site.BANK_RUN + 0.6)
        z = site.bank_foot(x) - t
        if site.bank_weight(x) < 0.4 or site.steps_weight(x) > 0.02:
            continue
        if abs(x - site.CHALET["x"]) < site.CHALET["w"] / 2 + 0.6 and z < site.CHALET["z"] + 0.9:
            continue
        cy = site.ground_y(x, z)
        centre = m.add_vert((x, cy - 0.02, z))
        fronds = rng.randrange(6, 10)
        col0 = rng.pick([P["d_fern"], P["d_fern"], P["d_grass_green"], P["d_needles"], P["d_grass_dry"]])
        size = rng.uniform(0.35, 0.65)
        for k in range(fronds):
            a = math.tau * k / fronds + rng.jitter(0.4)
            L = size * rng.uniform(0.75, 1.15)
            w = L * 0.16
            ca, sa = math.cos(a), math.sin(a)
            lift = rng.uniform(0.15, 0.35) * L
            mid = (x + ca * L * 0.5, cy + lift, z + sa * L * 0.5)
            ml = (mid[0] - sa * w, mid[1], mid[2] + ca * w)
            mr = (mid[0] + sa * w, mid[1], mid[2] - ca * w)
            tip = (x + ca * L, cy + lift * 0.3, z + sa * L)
            c = scale(mix(col0, P["d_fern"], rng.random() * 0.4), 1.0 + rng.jitter(0.12))
            il, ir, it = m.add_vert(ml), m.add_vert(mr), m.add_vert(tip)
            # both triangles wound to face up
            for tri in ((centre, il, ir), (il, it, ir)):
                p = [m.verts[i] for i in tri]
                ny = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2])
                m.add_face(tri if ny > 0 else tuple(reversed(tri)), c)
        n += 1


def build():
    rng = Rng(SEED)
    mat = palette_material()
    objs = []
    o = to_object(build_ground(rng), "terrain", mat, smooth=True)
    triangulate(o)
    objs.append(o)
    stones = MeshData()
    wood = NMesh()
    build_wall(stones, Rng(SEED + 1))
    build_steps(stones, wood, Rng(SEED + 2))
    build_slope_rocks(stones, Rng(SEED + 3))
    build_ferns(stones, Rng(SEED + 4))
    o = stone_object(stones, "terrain_stones", mat)
    objs.append(o)
    o = to_object_flat(wood, "terrain_wood", mat, blend=0.5)
    triangulate(o)
    objs.append(o)
    return objs
