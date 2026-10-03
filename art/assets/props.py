"""
props.glb: the square's furniture beyond the far end of the court, left of the belvedere (the
café terrace is on the right, cafe.py): a low dry-stone wall holding a raised lavender bed, a
wooden bench with cast-iron ends in front of it, two old cast-iron lamp posts with lanterns, a few
lavender planters, and the belvedere parapet (dressed limestone, ball-topped end posts) closing
the gap in the far row of houses. Game coordinates, all outside the court.
"""
from __future__ import annotations

import math

from lib.materials import palette_material
from lib.mesh import MeshData, box, icosphere, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.props import cylinder, lavender_bush, lavender_planter
from lib.rand import Rng

NAME = "props"

# Wall: from (x, z) running `length` m toward -X; the lavender bed is behind it (toward -Z).
WALL = {"x": -3.1, "z": -13.4, "length": 4.6, "height": 0.62, "thick": 0.5, "bed_depth": 1.0}
BENCH = {"x": -5.0, "z": -12.75, "yaw": 0.0}            # faces +Z (the court)
LAMPS = [(-2.75, -13.5), (6.3, 1.2)]
PARAPET = {"x0": -3.4, "x1": 3.4, "z": -16.9, "height": 0.95, "thick": 0.45}
PLANTERS = [(-8.3, -12.9, 0.9), (-2.3, -12.7, 0.75)]

PREVIEW = {
    "views": [
        ("bench", (-2.0, 1.8, -8.0), (-5.0, 0.6, -13.2), 34),
        ("belvedere", (0.5, 2.2, -9.0), (-1.5, 1.4, -15.5), 34),
    ],
    "ground_size": 24.0,
    "ground_color": (0.50, 0.36, 0.22),
}


def _stone_color(rng: Rng):
    c = mix(P["limestone"], rng.pick([P["stone_grey"], P["limestone_dark"], P["render_sand"], P["ochre_light"]]),
            rng.uniform(0.2, 0.8))
    return scale(c, 1.0 + rng.jitter(0.08))


def build_wall(rng: Rng) -> MeshData:
    """
    Dry-stone wall: courses of irregular stones (jittered boxes), flat capping stones, end pillars,
    with a raised bed of lavender behind it. Built along local -Z, then turned to run along -X.
    """
    w = WALL
    m = MeshData()
    length = w["length"]
    courses = 3
    ch = (w["height"] - 0.12) / courses
    for c in range(courses):
        y0 = -0.08 + c * ch
        s = rng.uniform(0.0, 0.3)
        while s < length:
            ln = min(rng.uniform(0.32, 0.62), length - s)
            if ln < 0.12:
                break
            hh = ch * rng.uniform(0.85, 1.05)
            m.append(box(rng.jitter(0.03), y0 + hh / 2 + 0.04, -(s + ln / 2), w["thick"] + rng.jitter(0.05), hh, ln - 0.03,
                         _stone_color(rng)))
            s += ln
    s = 0.0
    while s < length - 0.05:
        ln = min(rng.uniform(0.4, 0.7), length - s)
        c = scale(mix(P["limestone"], P["cream"], 0.4), 1.0 + rng.jitter(0.06))
        m.append(box(rng.jitter(0.02), w["height"] - 0.05 + rng.jitter(0.015), -(s + ln / 2), w["thick"] + 0.1, 0.12,
                     ln - 0.02, c, top_color=scale(c, 1.06)))
        s += ln
    for z in (0.0, -length):
        m.append(box(0.0, w["height"] / 2 + 0.05, z, w["thick"] + 0.16, w["height"] + 0.25, 0.5, _stone_color(rng),
                     top_color=P["cream"]))
    # raised bed: earth fill + a row of lavender bushes (local +X = toward the houses once turned)
    d = w["bed_depth"]
    m.append(box(w["thick"] / 2 + d / 2, w["height"] - 0.12, -length / 2, d, 0.1, length, P["earth_dark"]))
    n = max(3, round(length / 0.75))
    for k in range(n):
        z = -length * (k + 0.5) / n + rng.jitter(0.08)
        lavender_bush(m, w["thick"] / 2 + d / 2 + rng.jitter(0.12), w["height"] - 0.12, z, 0.36 + rng.jitter(0.05), rng)
    return _place(m, w["x"], w["z"], 90.0)


def build_parapet(rng: Rng) -> MeshData:
    """Belvedere parapet: dressed limestone blocks, a moulded coping and two ball-topped posts."""
    w = PARAPET
    m = MeshData()
    length = w["x1"] - w["x0"]
    n = max(4, round(length / 0.9))
    for row, (y0, hh) in enumerate(((-0.1, 0.45), (0.35, 0.42))):
        off = 0.45 if row % 2 else 0.0
        xs = [w["x0"]] + [w["x0"] + off + length * k / n for k in range(1, n + 1) if w["x0"] + off + length * k / n < w["x1"] - 0.2] + [w["x1"]]
        for a, b in zip(xs, xs[1:]):
            c = scale(mix(P["limestone"], P["render_sand"], rng.uniform(0.0, 0.5)), 1.0 + rng.jitter(0.05))
            m.append(box((a + b) / 2, y0 + hh / 2, w["z"], b - a - 0.02, hh - 0.02, w["thick"], c))
    cap = mix(P["limestone"], P["cream"], 0.5)
    m.append(box((w["x0"] + w["x1"]) / 2, w["height"] - 0.1, w["z"], length, 0.1, w["thick"] + 0.12, scale(cap, 0.95),
                 bottom=True, top_color=cap))
    for x in (w["x0"] - 0.2, w["x1"] + 0.2):
        m.append(box(x, 0.6, w["z"], 0.5, 1.3, 0.55, scale(cap, 0.97), top_color=cap))
        m.append(box(x, 1.3, w["z"], 0.6, 0.1, 0.62, scale(cap, 0.9), bottom=True, top_color=cap))
        cylinder(m, x, w["z"], 1.35, 1.45, 0.12, 0.12, 6, scale(cap, 0.9))
        verts, faces = icosphere(1)
        base = len(m.verts)
        for v in verts:
            m.verts.append((x + v[0] * 0.2, 1.62 + v[1] * 0.2, w["z"] + v[2] * 0.2))
        for f in faces:
            m.add_face(tuple(base + i for i in f), scale(cap, 1.0 + rng.jitter(0.04)))
    return m


def _place(local: MeshData, x, z, yaw_deg) -> MeshData:
    a = math.radians(yaw_deg)
    c, s = math.cos(a), math.sin(a)
    return local.transformed(lambda v: (x + v[0] * c + v[2] * s, v[1], z - v[0] * s + v[2] * c))


def build_bench(rng: Rng) -> MeshData:
    """Local frame: seat along X, sitter faces +Z."""
    m = MeshData()
    iron = mix(P["iron"], P["olive_dark"], 0.35)
    L = 1.9
    for k in range(3):  # seat slats
        c = scale(mix(P["timber_light"], P["timber"], rng.random() * 0.5), 1.0 + rng.jitter(0.05))
        m.append(box(0, 0.45, 0.16 - k * 0.15, L, 0.04, 0.12, c, bottom=True, top_color=scale(c, 1.12)))
    for k in range(2):  # back slats
        c = scale(mix(P["timber_light"], P["timber"], rng.random() * 0.5), 1.0 + rng.jitter(0.05))
        m.append(box(0, 0.66 + k * 0.17, -0.22 - k * 0.03, L, 0.12, 0.04, c))
    for x in (-L / 2 + 0.15, L / 2 - 0.15):  # cast-iron ends
        m.append(box(x, 0.22, 0.12, 0.06, 0.44, 0.06, iron))
        m.append(box(x, 0.4, -0.2, 0.06, 0.8, 0.06, iron))
        m.append(box(x, 0.43, -0.02, 0.06, 0.05, 0.42, iron))
        m.append(box(x, 0.62, 0.1, 0.05, 0.05, 0.3, iron))
    return _place(m, BENCH["x"], BENCH["z"], BENCH["yaw"])


def build_lamp(x: float, z: float) -> MeshData:
    m = MeshData()
    iron = mix(P["iron"], P["olive_dark"], 0.25)
    cylinder(m, x, z, 0.0, 0.5, 0.17, 0.12, 8, iron)
    cylinder(m, x, z, 0.5, 0.6, 0.12, 0.08, 8, scale(iron, 1.1), cap=False)
    cylinder(m, x, z, 0.6, 3.3, 0.07, 0.045, 6, iron, cap=False)
    cylinder(m, x, z, 3.3, 3.4, 0.09, 0.09, 6, iron)
    # lantern: tapered glass box, wide at the top, warm glow + pyramid cap + finial
    glow = mix(P["cream"], P["ochre_light"], 0.5)
    y0, y1 = 3.42, 3.95
    for k in range(4):
        a0 = math.pi / 4 + k * math.pi / 2
        a1 = a0 + math.pi / 2
        p = [(x + r * math.cos(a), y, z + r * math.sin(a)) for (r, y, a) in ((0.11, y0, a1), (0.11, y0, a0), (0.2, y1, a0), (0.2, y1, a1))]
        i = [m.add_vert(v) for v in p]
        m.add_face(tuple(i), glow)
    cylinder(m, x, z, y1, y1 + 0.05, 0.24, 0.24, 4, iron)
    cylinder(m, x, z, y1 + 0.05, y1 + 0.3, 0.22, 0.02, 4, iron)
    cylinder(m, x, z, y1 + 0.3, y1 + 0.42, 0.025, 0.0, 4, iron, cap=False)
    return m


def build():
    rng = Rng(9)
    mat = palette_material()
    m = MeshData()
    m.append(build_wall(rng))
    m.append(build_parapet(rng))
    m.append(build_bench(rng))
    for x, z in LAMPS:
        m.append(build_lamp(x, z))
    for x, z, s in PLANTERS:
        lavender_planter(m, x, z, rng, s)
    o = to_object(m, "props", mat)
    triangulate(o)
    return [o]
