"""
cafe.glb: the café terrace in front of the café (far row, right of centre): round bistro tables,
rattan chairs, two striped parasols, a chalk menu board and two lavender planters.

Game coordinates; it sits on the square between the far end of the court (z = -9.5) and the
houses (z = -16), right of the court (x > 3), so it frames the aim view without touching the
area around the jack.
"""
from __future__ import annotations

import math

from lib.building import quad, tri
from lib.props import cylinder, lavender_planter, ring
from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng

NAME = "cafe"

# (x, z, chair count, rotation deg)
TABLES = [(3.9, -11.6, 2, 20), (5.9, -11.0, 3, -10), (4.6, -13.6, 3, 40), (6.9, -13.2, 2, 0)]
PARASOLS = [((4.3, -12.5), ("canvas_red", "canvas_white")), ((6.6, -12.1), ("canvas_green", "canvas_white"))]
MENU_BOARD = (3.2, -14.8, 25.0)
PLANTERS = [(2.9, -15.3), (8.8, -15.2)]

PREVIEW = {
    "views": [
        ("terrace", (1.0, 2.6, -6.0), (5.4, 0.8, -12.8), 32),
        ("top", (5.4, 9.0, -6.5), (5.4, 0.0, -12.5), 34),
    ],
    "ground_size": 12.0,
    "ground_color": (0.50, 0.36, 0.22),
}


def _table(m: MeshData, x, z, rng: Rng):
    marble = mix(P["cream"], P["limestone"], 0.3)
    iron = P["iron"]
    cylinder(m, x, z, 0.70, 0.74, 0.36, 0.36, 10, scale(marble, 0.9), top_color=marble)
    cylinder(m, x, z, 0.0, 0.70, 0.035, 0.035, 5, iron, cap=False)
    cylinder(m, x, z, 0.0, 0.04, 0.24, 0.22, 6, iron)
    # a carafe of rosé and a glass of pastis
    cylinder(m, x + 0.1, z - 0.05, 0.74, 0.95, 0.05, 0.03, 5, mix(P["render_pink"], P["geranium"], 0.3))
    cylinder(m, x - 0.12, z + 0.08, 0.74, 0.84, 0.03, 0.03, 5, P["ochre_light"])


def _chair(m: MeshData, x, z, yaw, rng: Rng):
    """Bistro chair facing the table: rattan seat + back, dark legs."""
    seat = mix(P["timber_light"], P["straw"], 0.5)
    weave = mix(P["timber"], P["straw"], 0.3)
    local = MeshData()
    local.append(box(0, 0.46, 0, 0.42, 0.05, 0.42, seat, bottom=True))
    for sx in (-1, 1):
        for sz in (-1, 1):
            local.append(box(sx * 0.17, 0.23, sz * 0.17, 0.035, 0.46, 0.035, P["timber_dark"]))
    local.append(box(0, 0.8, 0.2, 0.42, 0.32, 0.04, weave))
    for sx in (-1, 1):
        local.append(box(sx * 0.19, 0.67, 0.2, 0.035, 0.42, 0.035, P["timber_dark"]))
    a = math.radians(yaw)
    c, s = math.cos(a), math.sin(a)
    m.append(local.transformed(lambda v: (x + v[0] * c + v[2] * s, v[1], z - v[0] * s + v[2] * c)))


def _parasol(m: MeshData, x, z, colors, rng: Rng):
    n = 10
    r, h_edge, h_top = 1.35, 2.15, 2.75
    cylinder(m, x, z, 0.0, 2.8, 0.03, 0.03, 5, P["timber_light"], cap=False)
    cylinder(m, x, z, 0.0, 0.08, 0.28, 0.26, 6, scale(P["stone_grey"], 0.9))
    rim = ring(x, h_edge, z, r, n, phase=0.2)
    apex = (x, h_top, z)
    for k in range(n):
        a, b = rim[k], rim[(k + 1) % n]
        col = P[colors[k % 2]]
        tri(m, b, a, apex, scale(col, 1.0 + rng.jitter(0.03)))
        tri(m, a, b, apex, scale(col, 0.55))  # underside (seen from below, in its own shade)
        # short valance
        a2, b2 = (a[0], a[1] - 0.16, a[2]), (b[0], b[1] - 0.16, b[2])
        quad(m, b2, a2, a, b, col)
        quad(m, a2, b2, b, a, scale(col, 0.6))


def _menu_board(m: MeshData, x, z, yaw):
    local = MeshData()
    local.append(box(0, 0.6, 0.12, 0.6, 0.9, 0.04, P["timber"]))
    local.append(box(0, 0.65, 0.145, 0.5, 0.7, 0.01, P["iron"]))
    for k in range(4):
        local.append(box(-0.05 + 0.03 * (k % 2), 0.85 - k * 0.14, 0.152, 0.3 - 0.06 * (k % 2), 0.025, 0.004, P["cream"]))
    local.append(box(0, 0.5, -0.12, 0.6, 1.0, 0.04, P["timber"]))
    a = math.radians(yaw)
    c, s = math.cos(a), math.sin(a)
    m.append(local.transformed(lambda v: (x + v[0] * c + v[2] * s, v[1], z - v[0] * s + v[2] * c)))


def build_terrace() -> MeshData:
    rng = Rng(3)
    m = MeshData()
    for x, z, n, rot in TABLES:
        _table(m, x, z, rng)
        for k in range(n):
            a = math.radians(rot) + math.tau * k / n
            cx, cz = x + 0.62 * math.sin(a), z + 0.62 * math.cos(a)
            # the chair's back faces away from the table: local +Z (back) points along a
            _chair(m, cx, cz, math.degrees(a) + rng.jitter(12), rng)
    for (x, z), cols in PARASOLS:
        _parasol(m, x, z, cols, rng)
    _menu_board(m, *MENU_BOARD)
    for x, z in PLANTERS:
        lavender_planter(m, x, z, rng)
    return m


def build():
    mat = palette_material()
    o = to_object(build_terrace(), "cafe_terrace", mat)
    triangulate(o)
    return [o]
