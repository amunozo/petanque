"""
court.glb (derborence): the playing surface, its frame of weathered round logs, the row of
limestone stones around it and the forest floor of the clearing.

The court rectangle matches the shared physics arena (src/tuning/config.ts: x -2..2, z -9.5..5.5)
and its top is exactly y = 0; the logs stand where the village's boards are (their inner side
touches the arena line). Objects:
  court_gravel    grey fine gravel, worn grey down the middle, fallen larch needles drifted
                  toward the logs, the corners and the ends (ground lightmap)
  court_surround  forest floor of the clearing: needle litter, dry grass, moss, soil (ground
                  lightmap); leaves a hole where the bank / terrace mesh is (terrain.py)
  court_litter    small yellow birch / aspen leaves and dry grass tufts (ground lightmap)
  court_logs      silver-grey round logs, half sunk, mitred corners, checks along the grain (atlas)
  court_rocks     angular bluish-grey limestone stones lining the outside of the logs (atlas)
"""
from __future__ import annotations

import math
import os

from lib import venues
from lib.alpine import NMesh, add_leaf, add_log, add_stone, add_tuft, ss, to_object_flat, weld, stone_object
from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm, value_noise
from lib.textures import ground_detail

from . import site

NAME = "court"
SEED = 307

ARENA = site.ARENA
R = site.LOG_R

PREVIEW = {
    "views": [
        ("aim", (0.0, 2.3, 7.0), (0.0, 0.0, 1.6), 30),
        ("overview", (7.0, 7.0, 14.0), (0.0, 0.0, -4.0), 30),
        ("corner", (-3.2, 1.3, 7.6), (0.0, 0.0, 4.6), 32),
        ("far", (1.5, 1.6, -5.0), (-1.0, 0.0, -10.0), 34),
        ("log", (2.9, 0.55, 6.6), (2.0, 0.0, 4.8), 40),
    ],
    "context": ["terrain"],
    "ground_size": 0.0,
}


# --- gravel -------------------------------------------------------------------------------

def needle_density(x: float, z: float) -> float:
    """0..1: how much of the gravel is covered by fallen larch needles."""
    x0, x1, z0, z1 = ARENA["min_x"], ARENA["max_x"], ARENA["min_z"], ARENA["max_z"]
    dside = min(x - x0, x1 - x)
    dend = min(z - z0, z1 - z)
    edge = ss(0.9, 0.0, dside) * 0.75 + ss(1.4, 0.0, dend) * 0.7
    corner = ss(2.2, 0.3, math.hypot(min(dside, 2.5), min(dend, 2.5))) * 0.6
    far = ss(-6.5, -9.4, z) * 0.2 + ss(3.0, 5.4, z) * 0.3
    patches = ss(0.48, 0.72, fbm(x * 0.55 + 3.0, z * 0.22, 0, SEED + 1, 3)) * 0.75
    d = edge + corner + far + patches
    # the worn grey lane down the middle, where the boules land and roll
    lane = ss(1.45, 0.55, abs(x + 0.15 * math.sin(z * 0.3))) * ss(-8.6, -6.4, z) * ss(4.6, 2.6, z)
    d *= 1.0 - 0.7 * lane
    return max(0.0, min(1.0, d))


def gravel_color(x: float, z: float, rng: Rng):
    patch = fbm(x * 0.5, z * 0.5, 0.0, SEED, 3)
    c = mix(P["d_gravel"], P["d_gravel_light"], ss(0.55, 0.85, patch) * 0.45)
    c = mix(c, P["d_gravel_dark"], ss(0.45, 0.15, patch) * 0.35)
    nd = needle_density(x, z)
    if nd > 0.0:
        fine = value_noise(x * 7.0, z * 7.0, 0.0, SEED + 7) * 0.6 + value_noise(x * 2.5, z * 2.5, 0.0, SEED + 8) * 0.4
        cover = ss(0.0, 0.5, nd + (fine - 0.5) * 0.7) * min(1.0, nd * 1.6)
        tone = fbm(x * 1.4, z * 1.4, 1.0, SEED + 9, 2)
        needles = mix(P["d_needles"], P["d_needles_gold"], ss(0.45, 0.7, tone))
        needles = mix(needles, P["d_needles_dark"], ss(0.45, 0.25, tone) * 0.3)
        c = mix(c, needles, cover * 0.75)
    # damp, darker gravel along the logs (their shade and the needles' tannin)
    dside = min(x - ARENA["min_x"], ARENA["max_x"] - x, z - ARENA["min_z"], ARENA["max_z"] - z)
    c = scale(c, 1.0 - 0.08 * ss(0.35, 0.0, dside))
    return c


def build_gravel(rng: Rng) -> MeshData:
    cols, rows = 32, 100
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    m = MeshData()
    zs = []
    for j in range(rows + 1):
        z = z0 + (z1 - z0) * j / rows
        if 0 < j < rows:
            z += rng.jitter(0.025)
        zs.append(z)
    grid = [[m.add_vert((x0 + (x1 - x0) * i / cols, 0.0, zs[j])) for i in range(cols + 1)] for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols):
            cx = x0 + (x1 - x0) * (i + 0.5) / cols
            cz = (zs[j] + zs[j + 1]) / 2
            c = gravel_color(cx, cz, rng)
            a, b, d, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            m.add_face((a, e, d), scale(c, 1.0 + rng.jitter(0.02)))
            m.add_face((a, d, b), scale(c, 1.0 + rng.jitter(0.02)))
    return m


# --- surround -----------------------------------------------------------------------------

def _axis(breaks: list[float], step_for) -> list[float]:
    out = [breaks[0]]
    for a, b in zip(breaks, breaks[1:]):
        n = max(1, math.ceil((b - a) / step_for(a, b) - 1e-6))
        out += [a + (b - a) * k / n for k in range(1, n + 1)]
    return out


def surround_axes():
    """Grid lines of the surround; inside the terrain rectangle's spans they are the terrain's own."""
    from .terrain import terrain_axes

    txs, tzs = terrain_axes()
    tr = site.TERRAIN_RECT

    def step(a, b):
        m = max(abs(a), abs(b))
        return 0.75 if m <= 22.0 else (3.0 if m <= 32.0 else 10.0)

    def stepz(a, b):
        if a >= -30.0 and b <= 14.0:
            return 1.0
        return 3.0 if a >= -40.0 and b <= 24.0 else 10.0

    xs = _axis([-70.0, -40.0, -30.0, -22.0, tr["x0"]], step)[:-1] + txs + \
        _axis([tr["x1"], 22.0, 30.0, 40.0, 70.0], step)[1:]
    zs = _axis([-80.0, -50.0, -40.0, tr["z0"]], stepz)[:-1] + tzs + \
        _axis([tr["z1"], ARENA["min_z"], ARENA["max_z"], 14.0, 24.0, 40.0], stepz)[1:]
    return xs, zs


def floor_color(x: float, z: float, rng: Rng):
    """Forest floor: needle litter and soil, dry grass patches, moss, gravel spilled near the court."""
    d = site.dist_to_court(x, z)
    n1 = fbm(x * 0.22, z * 0.22, 0.0, SEED + 21, 3)
    n2 = fbm(x * 0.8, z * 0.8, 2.0, SEED + 23, 2)
    n3 = fbm(x * 0.12 + 5.0, z * 0.12, 4.0, SEED + 25, 2)
    c = mix(P["d_litter"], P["d_soil"], ss(0.35, 0.65, n2) * 0.6)
    c = mix(c, P["d_needles"], ss(0.55, 0.8, n2) * 0.15)
    grass = ss(0.5, 0.68, n1) * (0.55 + 0.45 * ss(1.0, 4.0, d))
    gcol = mix(P["d_grass_dry"], P["d_grass"], ss(0.4, 0.7, n2))
    gcol = mix(gcol, P["d_grass_green"], ss(0.6, 0.8, n3) * 0.6)
    c = mix(c, gcol, grass)
    c = mix(c, mix(P["d_moss"], P["d_moss_dark"], n2), ss(0.62, 0.78, n3) * 0.55)
    # needle drift + spilled grey gravel right around the court
    c = mix(c, mix(P["d_needles"], P["d_gravel_dark"], ss(0.4, 0.6, n2) * 0.6), ss(1.1, 0.25, d) * 0.6)
    # damp, darker soil at the foot of the bank
    c = mix(c, P["d_soil_dark"], ss(1.5, 0.0, abs(z - site.bank_foot(x))) * 0.35 * site.bank_weight(x))
    # far away: the forest's deep shade (beyond the ground lightmap the floor is lit as open sun)
    c = scale(c, 1.0 - 0.45 * ss(16.0, 30.0, max(abs(x), abs(z + 8.0))))
    return scale(c, 1.0 + rng.jitter(0.04))


def build_surround(rng: Rng) -> MeshData:
    xs, zs = surround_axes()
    tr = site.TERRAIN_RECT
    m = MeshData()
    idx: dict[tuple[int, int], int] = {}
    x0, x1, z0, z1 = ARENA["min_x"], ARENA["max_x"], ARENA["min_z"], ARENA["max_z"]

    def vert(i: int, j: int) -> int:
        if (i, j) not in idx:
            x, z = xs[i], zs[j]
            y = site.ground_y(x, z)
            if site.dist_to_court(x, z) == 0.0:
                y = site.SURROUND_EDGE_Y
            idx[(i, j)] = m.add_vert((x, y, z))
        return idx[(i, j)]

    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            xa, xb, za, zb = xs[i], xs[i + 1], zs[j], zs[j + 1]
            if xa >= x0 - 1e-6 and xb <= x1 + 1e-6 and za >= z0 - 1e-6 and zb <= z1 + 1e-6:
                continue  # the court
            if xa >= tr["x0"] - 1e-6 and xb <= tr["x1"] + 1e-6 and za >= tr["z0"] - 1e-6 and zb <= tr["z1"] + 1e-6:
                continue  # the bank / terrace (terrain.py)
            cx, cz = (xa + xb) / 2, (za + zb) / 2
            a, b, d_, e = vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)
            c = floor_color(cx, cz, rng)
            m.add_face((a, e, d_), c)
            m.add_face((a, d_, b), scale(c, 1.0 + rng.jitter(0.03)))
    return m


# --- logs ---------------------------------------------------------------------------------

def build_logs() -> NMesh:
    vm = NMesh()
    x1, z0, z1 = ARENA["max_x"], ARENA["min_z"], ARENA["max_z"]
    cx = x1 + R
    zf, zn = z0 - R, z1 + R
    y = site.LOG_Y
    gap = 0.006

    def outer(u):  # mitre: the outer side reaches the corner
        return u - gap

    def inner(u):
        return -u - gap

    # side logs (two per side, butt-jointed), running toward -Z: their right side is +X
    for side, split, seed in ((1, -1.7, 11), (-1, -2.4, 23)):
        x = side * cx
        ext = outer if side > 0 else inner
        add_log(vm, (x, y, zn), (x, y, split + 0.012), R * 1.02, seed, ext_a=ext, cap_a=False, cracks=6, sides=18,
                seg_len=0.45)
        add_log(vm, (x, y + 0.004, split - 0.012), (x, y + 0.004, zf), R * 0.97, seed + 1, ext_b=ext, cap_b=False,
                cracks=5, sides=18, seg_len=0.45)
    # end logs, running toward +X: their right side is +Z
    add_log(vm, (-cx, y, zf), (cx, y, zf), R, 31, ext_a=inner, ext_b=inner, cap_a=False, cap_b=False, cracks=3,
            sides=18, seg_len=0.45)
    add_log(vm, (-cx, y, zn), (cx, y, zn), R * 1.03, 37, ext_a=outer, ext_b=outer, cap_a=False, cap_b=False, cracks=3,
            sides=18, seg_len=0.45)
    return vm


# --- stones -------------------------------------------------------------------------------

def build_rocks(rng: Rng) -> tuple[MeshData, list]:
    """The row of stones along the outside of the logs. Returns the mesh and the (x, z, r) footprints."""
    m = MeshData()
    feet = []
    off = ARENA["max_x"] + 2 * R + 0.02
    z0, z1 = ARENA["min_z"] - 2 * R, ARENA["max_z"] + 2 * R

    def row(points_along, place):
        t = points_along[0]
        while t < points_along[1]:
            big = 1.0 + 0.6 * ss(1.5, 0.0, min(t - points_along[0], points_along[1] - t))
            r = rng.uniform(0.09, 0.17) * big
            if rng.random() < 0.08:
                t += r * rng.uniform(0.8, 2.5)  # an occasional gap
            x, z, yaw = place(t, r)
            h = r * rng.uniform(0.5, 0.75)
            add_stone(m, (x, h * 0.15, z), (r, h, r * rng.uniform(0.7, 1.0)), yaw, rng, n=rng.randrange(16, 20),
                      boxy=rng.uniform(1.8, 2.2), moss=0.25, lichen=0.15)
            feet.append((x, z, r))
            t += r * 2.0 + rng.uniform(0.0, 0.07)

    for side in (-1, 1):
        row((z0 - 0.1, z1 + 0.1), lambda t, r, s=side: (s * (off + r * 0.9 + rng.jitter(0.03)), t, rng.uniform(0, 360)))
    # near end (behind the throwing circle): a full row
    row((-off - 0.05, off + 0.05), lambda t, r: (t, z1 + r * 0.9 + 0.02 + rng.jitter(0.03), rng.uniform(0, 360)))
    # far end: only the corners (the bench stands behind the middle)
    for a, b in ((-off - 0.05, -0.9), (1.7, off + 0.05)):
        row((a, b), lambda t, r: (t, z0 - 2 * R - r * 0.9 - 0.02 + rng.jitter(0.03), rng.uniform(0, 360)))
    return m, feet


# --- litter -------------------------------------------------------------------------------

def build_litter(rng: Rng, feet) -> tuple[MeshData, list]:
    m = MeshData()
    normals: list = []
    x0, x1, z0, z1 = ARENA["min_x"], ARENA["max_x"], ARENA["min_z"], ARENA["max_z"]
    # leaves on the court: more where the needles are
    n = 0
    while n < 500:
        x, z = rng.uniform(x0 + 0.03, x1 - 0.03), rng.uniform(z0 + 0.03, z1 - 0.03)
        if rng.random() > 0.25 + 0.75 * needle_density(x, z):
            continue
        add_leaf(m, normals, x, 0.0, z, rng, size=rng.uniform(0.035, 0.055), red=0.01)
        n += 1

    def free(x, z, margin):
        for fx, fz, fr in feet:
            if (x - fx) ** 2 + (z - fz) ** 2 < (fr + margin) ** 2:
                return False
        return True

    # leaves around the court, thinning out with the distance; none under the terrain mesh
    tr = site.TERRAIN_RECT
    n = 0
    while n < 950:
        x, z = rng.uniform(-14.0, 14.0), rng.uniform(-12.0, 12.0)
        d = site.dist_to_court(x, z)
        if d < 2 * R + 0.02:
            continue
        if tr["x0"] < x < tr["x1"] and tr["z0"] < z < tr["z1"] + 0.3:
            continue
        if rng.random() > 1.2 * math.exp(-d / 3.0) + 0.04:
            continue
        if not free(x, z, 0.0):
            continue
        add_leaf(m, normals, x, site.ground_y(x, z), z, rng, size=rng.uniform(0.04, 0.065), red=0.02)
        n += 1
    # dry grass tufts on the forest floor (in the grassy patches, never on the court or the stones)
    n = 0
    tries = 0
    while n < 320 and tries < 30000:
        tries += 1
        x, z = rng.uniform(-13.0, 13.0), rng.uniform(-11.6, 11.0)
        d = site.dist_to_court(x, z)
        if d < 0.62:
            continue
        if tr["x0"] < x < tr["x1"] and tr["z0"] < z < tr["z1"] + 0.3:
            continue
        g = fbm(x * 0.22, z * 0.22, 0.0, SEED + 21, 3)
        if rng.random() > ss(0.42, 0.62, g) * (0.4 + 0.6 * math.exp(-d / 6.0)) + 0.03:
            continue
        if not free(x, z, 0.06):
            continue
        add_tuft(m, normals, x, site.ground_y(x, z), z, rng, height=rng.uniform(0.1, 0.22), blades=rng.randrange(5, 8))
        n += 1
    return m, normals


def build():
    rng = Rng(SEED)
    # gravel grain (the venue's models dir)
    ground_detail(os.path.join(venues.models_dir(), "ground_detail.png"))
    mat = palette_material()
    objs = []
    o = to_object(build_gravel(rng), "court_gravel", mat, smooth=True)
    triangulate(o)
    objs.append(o)
    o = to_object(build_surround(Rng(SEED + 1)), "court_surround", mat, smooth=True)
    triangulate(o)
    objs.append(o)
    rocks, feet = build_rocks(Rng(SEED + 2))
    litter, normals = build_litter(Rng(SEED + 3), feet)
    o = to_object(litter, "court_litter", mat, normals=normals)
    triangulate(o)
    objs.append(o)
    logs = build_logs()
    o = to_object_flat(logs, "court_logs", mat, blend=0.5)
    triangulate(o)
    objs.append(o)
    o = stone_object(rocks, "court_rocks", mat)
    objs.append(o)
    return objs
