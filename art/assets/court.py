"""
court.glb: the playing surface + boards + the ground around it.

The court rectangle matches the physics arena in src/tuning/config.ts (x -2..2, z -9.5..5.5)
and its top is exactly y = 0 (balls roll on it). Keep ARENA in sync with that config.
Objects: court_gravel (y=0), court_boards (+ stakes), court_surround (packed earth, worn
grass, a strip of limestone paving behind the throwing end). All flat per-face colours.
"""
from __future__ import annotations

import math

from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale, tint
from lib.rand import Rng, fbm, value_noise

NAME = "court"
SEED = 7

ARENA = {"min_x": -2.0, "max_x": 2.0, "min_z": -9.5, "max_z": 5.5}

BOARD_T = 0.06   # board thickness (m)
BOARD_H = 0.08   # board height above the ground (m)
BOARD_SINK = 0.05  # boards continue below ground so no seam shows
SURROUND_EDGE_Y = -0.012  # surround just below the court top at the boards

PREVIEW = {
    "views": [
        ("overview", (7.5, 5.0, 13.0), (0.0, 0.0, -2.5), 32),
        ("aim", (0.0, 2.3, 7.0), (0.0, 0.0, 3.6), 40),
        ("far", (-4.5, 3.0, -2.0), (0.5, 0.0, -9.0), 34),
    ],
    "ground_size": 0.0,
}


def _smoothstep(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _jitter_color(c, rng: Rng, amount: float):
    return scale(c, 1.0 + rng.jitter(amount))


# --- gravel -------------------------------------------------------------------------------

def build_gravel(rng: Rng) -> MeshData:
    cols, rows = 40, 50
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    m = MeshData()
    zs = []
    for j in range(rows + 1):
        z = z0 + (z1 - z0) * j / rows
        if 0 < j < rows:
            z += rng.jitter(0.06)  # wobbly rows; edges stay exact
        zs.append(z)
    grid = [[m.add_vert((x0 + (x1 - x0) * i / cols, 0.0, zs[j])) for i in range(cols + 1)] for j in range(rows + 1)]

    base = mix(P["dust"], P["limestone"], 0.4)
    warm = P["ochre_light"]
    cool = mix(P["dust_dark"], P["bark_grey"], 0.25)
    for j in range(rows):
        for i in range(cols):
            cx = x0 + (x1 - x0) * (i + 0.5) / cols
            cz = (zs[j] + zs[j + 1]) / 2
            patch = fbm(cx * 0.55, cz * 0.55, 0.0, SEED, 3)
            c = mix(base, warm, _smoothstep(0.45, 0.8, patch) * 0.4)
            c = mix(c, cool, _smoothstep(0.55, 0.15, patch) * 0.45)
            # Rake lines: alternate columns, broken up here and there.
            rake = 1.0 + (0.045 if (i // 2) % 2 == 0 else -0.045) * (1.0 if value_noise(i * 0.25, j * 0.35, 0, SEED + 3) > 0.25 else 0.0)
            # Worn, slightly darker band along the boards.
            edge = 1.0 - 0.06 * _smoothstep(0.5, 0.0, min(i, cols - 1 - i) / 6.0)
            c = scale(c, rake * edge)
            a, b, d, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            # Winding must face +Y (up): (a, e, d) and (a, d, b) in x/z-plane with z increasing.
            m.add_face((a, e, d), _jitter_color(c, rng, 0.025 if rng.random() > 0.07 else 0.10))
            m.add_face((a, d, b), _jitter_color(c, rng, 0.025 if rng.random() > 0.07 else 0.10))
    return m


# --- boards -------------------------------------------------------------------------------

def build_boards(rng: Rng) -> MeshData:
    m = MeshData()
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    h = BOARD_H + BOARD_SINK
    cy = (BOARD_H - BOARD_SINK) / 2

    def plank(cx, cz, sx, sz):
        base = mix(P["timber"], P["timber_light"], rng.random())
        base = scale(base, 1 + rng.jitter(0.08))
        top = tint(scale(base, 1.18), 0.15)  # sun-bleached top
        lift = rng.uniform(0.0, 0.004)
        m.append(box(cx, cy + lift / 2, cz, sx, h + lift, sz, base, top_color=top))

    seg = 2.5
    n = round((z1 - z0) / seg)
    for side in (-1, 1):
        cx = side * (x1 + BOARD_T / 2)
        for k in range(n):
            za, zb = z0 + (z1 - z0) * k / n, z0 + (z1 - z0) * (k + 1) / n
            plank(cx, (za + zb) / 2, BOARD_T, zb - za - 0.004)
    # Short end boards (just outside the arena, visual only).
    for z in (z0 - BOARD_T / 2, z1 + BOARD_T / 2):
        for k in range(2):
            xa, xb = x0 - BOARD_T + (x1 - x0 + 2 * BOARD_T) * k / 2, x0 - BOARD_T + (x1 - x0 + 2 * BOARD_T) * (k + 1) / 2
            plank((xa + xb) / 2, z, xb - xa - 0.004, BOARD_T)
    # Stakes on the outside of the side boards, at the plank joints.
    stake = 0.07
    for side in (-1, 1):
        for k in range(n + 1):
            z = z0 + (z1 - z0) * k / n
            c = scale(mix(P["timber_dark"], P["timber"], rng.random() * 0.6), 1 + rng.jitter(0.06))
            m.append(box(side * (x1 + BOARD_T + stake / 2), 0.07 - BOARD_SINK / 2, z, stake, 0.14 + BOARD_SINK, stake, c,
                         top_color=scale(c, 1.25)))
    return m


# --- surround -----------------------------------------------------------------------------

def _axis(breaks: list[float], max_cell: float) -> list[float]:
    out = [breaks[0]]
    for a, b in zip(breaks, breaks[1:]):
        n = max(1, math.ceil((b - a) / max_cell))
        out += [a + (b - a) * k / n for k in range(1, n + 1)]
    return out


def _dist_to_court(x: float, z: float) -> float:
    dx = max(ARENA["min_x"] - x, 0.0, x - ARENA["max_x"])
    dz = max(ARENA["min_z"] - z, 0.0, z - ARENA["max_z"])
    return math.hypot(dx, dz)


def build_surround(rng: Rng) -> MeshData:
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    xs = _axis([-44, -26, -14, -8, -5, -3.4, -2.6, x0], 2.6)[:-1] + _axis([x1, 2.6, 3.4, 5, 8, 14, 26, 44], 2.6)
    zs = _axis([-64, -40, -24, -16, -12.5, -11, z0], 2.6)[:-1] + _axis([z1, 6.6, 8.5, 12, 18, 28], 2.6)
    # Make sure the hole edges are exactly the court edges.
    m = MeshData()
    idx: dict[tuple[int, int], int] = {}

    def vert(i: int, j: int) -> int:
        key = (i, j)
        if key in idx:
            return idx[key]
        x, z = xs[i], zs[j]
        on_court_line = x in (x0, x1) or z in (z0, z1)
        if not on_court_line and 0 < i < len(xs) - 1 and 0 < j < len(zs) - 1:
            x += rng.jitter(0.22 * min(xs[i] - xs[i - 1], xs[i + 1] - xs[i]))
            z += rng.jitter(0.22 * min(zs[j] - zs[j - 1], zs[j + 1] - zs[j]))
        d = _dist_to_court(x, z)
        ramp = _smoothstep(1.0, 6.0, d)
        y = SURROUND_EDGE_Y + ramp * (fbm(x * 0.35, z * 0.35, 0, SEED + 11, 3) - 0.45) * 0.14
        if on_court_line and d == 0.0:
            y = SURROUND_EDGE_Y
        idx[key] = m.add_vert((x, y, z))
        return idx[key]

    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            if xs[i] >= x0 and xs[i + 1] <= x1 and zs[j] >= z0 and zs[j + 1] <= z1:
                continue  # the court itself
            cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            a, b, d_, e = vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)
            for tri in ((a, e, d_), (a, d_, b)):
                m.add_face(tri, _surround_color(cx + rng.jitter(0.6), cz + rng.jitter(0.6), rng))
    return m


def _surround_color(x: float, z: float, rng: Rng):
    d = _dist_to_court(x, z)
    n = fbm(x * 0.28, z * 0.28, 0, SEED + 21, 3)
    # Packed earth near the court, worn grass further out, with ragged edges.
    grass = _smoothstep(2.0, 6.5, d + (n - 0.5) * 5.0)
    earth = mix(P["dust"], P["ochre_light"], _smoothstep(0.35, 0.8, n) * 0.6)
    earth = mix(earth, P["terracotta"], _smoothstep(0.7, 0.95, fbm(x * 0.5, z * 0.5, 3, SEED + 31, 2)) * 0.35)
    earth = mix(earth, P["dust_dark"], _smoothstep(0.5, 0.1, n) * 0.5)
    g = fbm(x * 0.4, z * 0.4, 9, SEED + 41, 2)
    green = mix(mix(P["straw"], P["sage"], 0.45), P["sage"], _smoothstep(0.3, 0.65, g))
    green = mix(green, P["olive"], _smoothstep(0.65, 0.95, g) * 0.8)
    c = mix(earth, green, grass)
    # Limestone paving strip behind the throwing end.
    if z > ARENA["max_z"] and abs(x) < 6.0:
        pave = _smoothstep(1.4, 0.3, d) * _smoothstep(6.5, 4.5, abs(x))
        c = mix(c, mix(P["limestone"], P["limestone_dark"], n), pave * 0.9)
    # A few lavender tufts in the grass.
    if grass > 0.7 and rng.random() < 0.012:
        c = mix(c, P["lavender"], 0.55)
    return scale(c, 1.0 + rng.jitter(0.05))


def build():
    rng = Rng(SEED)
    mat = palette_material()
    objs = []
    for name, data in (("court_gravel", build_gravel(rng)), ("court_boards", build_boards(rng)), ("court_surround", build_surround(rng))):
        o = to_object(data, name, mat)
        triangulate(o)
        objs.append(o)
    return objs
