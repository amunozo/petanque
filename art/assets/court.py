"""
court.glb: the playing surface + boards + the ground of the village square around it.

The court rectangle matches the physics arena in src/tuning/config.ts (x -2..2, z -9.5..5.5)
and its top is exactly y = 0 (balls roll on it). Keep ARENA in sync with that config.
Objects: court_gravel (y=0), court_boards (+ stakes), court_surround (packed earth of the square,
limestone pavements in front of the houses of art/assets/houses.py, fields beyond the village).
The ground (gravel + surround) is smooth shaded with soft per-vertex colour patches; its grain comes
from a small tiling detail texture (public/models/ground_detail.png, written here) and its light
from the ground lightmap (lib/bake.py). The boards stay flat shaded.
"""
from __future__ import annotations

import math

import os

from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale, tint
from lib.rand import Rng, fbm, value_noise
from lib.textures import ground_detail

NAME = "court"
SEED = 7

ARENA = {"min_x": -2.0, "max_x": 2.0, "min_z": -9.5, "max_z": 5.5}

BOARD_T = 0.06   # board thickness (m)
BOARD_H = 0.08   # board height above the ground (m)
BOARD_SINK = 0.05  # boards continue below ground so no seam shows
SURROUND_EDGE_Y = -0.012  # surround just below the court top at the boards

PREVIEW = {
    "views": [
        ("overview", (9.0, 8.0, 16.0), (0.0, 0.0, -5.0), 32),
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
    """
    Calm raked gravel: small, nearly square facets with low colour variation (so the jack and the
    boules pop), broad soft patches and faint rake lines; slightly darker along the boards.
    """
    cols, rows = 36, 120
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    m = MeshData()
    zs = []
    for j in range(rows + 1):
        z = z0 + (z1 - z0) * j / rows
        if 0 < j < rows:
            z += rng.jitter(0.025)  # wobbly rows; edges stay exact
        zs.append(z)
    grid = [[m.add_vert((x0 + (x1 - x0) * i / cols, 0.0, zs[j])) for i in range(cols + 1)] for j in range(rows + 1)]

    base = P["dust"]
    warm = mix(P["dust"], P["ochre_light"], 0.5)
    cool = mix(P["dust_dark"], P["bark_grey"], 0.3)
    for j in range(rows):
        for i in range(cols):
            cx = x0 + (x1 - x0) * (i + 0.5) / cols
            cz = (zs[j] + zs[j + 1]) / 2
            patch = fbm(cx * 0.45, cz * 0.45, 0.0, SEED, 3)
            c = mix(base, warm, _smoothstep(0.5, 0.8, patch) * 0.35)
            c = mix(c, cool, _smoothstep(0.5, 0.2, patch) * 0.3)
            # Faint, broken rake lines (kept subtle: strong continuous stripes read as floorboards).
            rake = 1.0 + (0.008 if (i // 2) % 2 == 0 else -0.008) * (1.0 if value_noise(i * 0.3, j * 0.5, 0, SEED + 3) > 0.45 else 0.0)
            # Worn, slightly darker band along the boards.
            edge = 1.0 - 0.06 * _smoothstep(0.5, 0.0, min(i, cols - 1 - i) / 5.0)
            c = scale(c, rake * edge)
            a, b, d, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            # Winding must face +Y (up): (a, e, d) and (a, d, b) in x/z-plane with z increasing.
            m.add_face((a, e, d), _jitter_color(c, rng, 0.012))
            m.add_face((a, d, b), _jitter_color(c, rng, 0.012))
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

def _axis(breaks: list[float], cell_for) -> list[float]:
    out = [breaks[0]]
    for a, b in zip(breaks, breaks[1:]):
        n = max(1, math.ceil((b - a) / cell_for(a, b)))
        out += [a + (b - a) * k / n for k in range(1, n + 1)]
    return out


def _dist_to_court(x: float, z: float) -> float:
    dx = max(ARENA["min_x"] - x, 0.0, x - ARENA["max_x"])
    dz = max(ARENA["min_z"] - z, 0.0, z - ARENA["max_z"])
    return math.hypot(dx, dz)


# The village around the square (keep in sync with art/assets/houses.py).
FAR_FACADE_Z = -16.0
SIDE_FACADE_X = 10.5
SIDE_ROW_Z0 = -10.0
VILLAGE_HALF_W = 17.6   # far row spans x -17.1 .. 17.1
PAVEMENT = 1.4          # limestone pavement in front of the facades (and the mairie in the middle)


def build_surround(rng: Rng) -> MeshData:
    x0, x1 = ARENA["min_x"], ARENA["max_x"]
    z0, z1 = ARENA["min_z"], ARENA["max_z"]
    W, F, S = VILLAGE_HALF_W, FAR_FACADE_Z, SIDE_FACADE_X

    def cell_x(a, b):
        return 1.6 if max(abs(a), abs(b)) <= W + 0.1 else 14.0

    def cell_z(a, b):
        return 1.6 if min(a, b) >= -23.1 else 14.0

    right = [x1, 2.6, 3.4, 6.0, S - PAVEMENT, S, W, 24.0, 44.0, 72.0]
    xs = [-v for v in reversed(right)]
    xs = _axis(xs, cell_x) + _axis(right, cell_x)
    zs = _axis([-78.0, -50.0, -30.0, -23.0, F, F + PAVEMENT, -12.5, -11.0, z0], cell_z) + \
        _axis([z1, 6.6, 8.5, 12.0, 20.0], cell_z)
    m = MeshData()
    idx: dict[tuple[int, int], int] = {}

    def vert(i: int, j: int) -> int:
        key = (i, j)
        if key in idx:
            return idx[key]
        x, z = xs[i], zs[j]
        on_court_line = x in (x0, x1) or z in (z0, z1)
        far = abs(x) > W + 0.1 or z < -23.1
        if far and 0 < i < len(xs) - 1 and 0 < j < len(zs) - 1:
            x += rng.jitter(0.2 * min(xs[i] - xs[i - 1], xs[i + 1] - xs[i]))
            z += rng.jitter(0.2 * min(zs[j] - zs[j - 1], zs[j + 1] - zs[j]))
        d = _dist_to_court(x, z)
        ramp = _smoothstep(1.0, 6.0, d)
        y = SURROUND_EDGE_Y + ramp * (fbm(x * 0.35, z * 0.35, 0, SEED + 11, 3) - 0.5) * 0.08
        if far:
            y += (fbm(x * 0.05, z * 0.05, 0, SEED + 13, 2) - 0.4) * 2.5 * _smoothstep(30.0, 50.0, math.hypot(x, z + 8))
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
            for k, tri in enumerate(((a, e, d_), (a, d_, b))):
                m.add_face(tri, _surround_color(cx, cz, k, rng))
    return m


def _surround_color(x: float, z: float, k: int, rng: Rng):
    W, F, S = VILLAGE_HALF_W, FAR_FACADE_Z, SIDE_FACADE_X
    d = _dist_to_court(x, z)
    n = fbm(x * 0.3, z * 0.3, 0, SEED + 21, 3)
    # Packed earth of the square: warm, a bit darker and redder than the court; worn ring round the boards.
    earth = mix(P["earth"], P["ochre_light"], _smoothstep(0.55, 0.85, n) * 0.4)
    earth = mix(earth, P["earth_dark"], _smoothstep(0.45, 0.15, n) * 0.5)
    earth = mix(earth, P["dust_dark"], _smoothstep(1.2, 0.2, d) * 0.35)
    c = earth
    in_far_pavement = F <= z <= F + PAVEMENT and abs(x) <= W
    in_side_pavement = S - PAVEMENT <= abs(x) <= S and SIDE_ROW_Z0 <= z <= 12.0
    in_street = abs(x) >= S and F <= z <= SIDE_ROW_Z0 and abs(x) <= W
    if in_far_pavement or in_side_pavement or in_street:
        flag = rng.random()
        c = mix(P["limestone"], P["limestone_dark"], flag * 0.6)
        c = mix(c, P["render_sand"], 0.25 if k == 1 else 0.0)
    elif abs(x) > W + 0.1 or z < -23.1 or (abs(x) > S and z > SIDE_ROW_Z0) or z < F:
        # countryside beyond the village (seen through the streets and around the hills)
        g = fbm(x * 0.06, z * 0.06, 9, SEED + 41, 3)
        c = mix(P["straw"], P["sage"], _smoothstep(0.35, 0.6, g))
        c = mix(c, P["olive"], _smoothstep(0.6, 0.8, g) * 0.9)
        if _smoothstep(0.62, 0.7, fbm(x * 0.1 + 4, z * 0.1, 2, SEED + 43, 2)) > 0.5:
            c = mix(c, P["lavender"], 0.7)  # a lavender field
    return scale(c, 1.0 + rng.jitter(0.03))


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def build():
    rng = Rng(SEED)
    ground_detail(os.path.join(ROOT, "public", "models", "ground_detail.png"))
    mat = palette_material()
    objs = []
    for name, data, smooth in (("court_gravel", build_gravel(rng), True), ("court_boards", build_boards(rng), False),
                               ("court_surround", build_surround(rng), True)):
        o = to_object(data, name, mat, smooth=smooth)
        triangulate(o)
        objs.append(o)
    return objs
