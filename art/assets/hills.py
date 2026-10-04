"""
hills.glb: the distant landscape seen above the roofs and through the side streets: two faceted
ridges (a nearer blue-green one and a taller, hazier lavender one, like the Luberon) on an arc
around the far end of the square. Colours are pre-hazed (atmospheric perspective, lighter toward
the horizon) because the game draws them unlit and without fog (src/render/scenery.ts).

Kept within ~85 m of every camera position (the game camera's far plane is 90 m).
"""
from __future__ import annotations

import math

from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

NAME = "hills"

CENTRE = (0.0, -8.0)   # arc centre (x, z)
LAYERS = [
    # radius, base height, amplitude, colour, haze at the foot, angular span (deg either side of -Z), segments, seed,
    # valley: height factor straight ahead
    {"radius": 63.0, "base": 6.0, "amp": 26.0, "color": "hill_far", "haze": 0.5, "span": 112, "segs": 60, "seed": 3,
     "valley": 0.2},
    {"radius": 54.0, "base": 3.0, "amp": 10.0, "color": "hill_near", "haze": 0.3, "span": 112, "segs": 64, "seed": 8,
     "valley": 0.32},
]

PREVIEW = {
    "views": [
        ("front", (0.0, 3.0, 6.0), (0.0, 12.0, -60.0), 24),
    ],
    "ground_size": 0.0,
}


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


SUN = (0.73, 0.53, 0.39)  # toward the sun (matches the game's default look), for baked facet light


def _face_light(a, b, c) -> float:
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
    ln = math.sqrt(sum(k * k for k in n)) or 1.0
    return max(0.0, sum(n[k] / ln * SUN[k] for k in range(3)))


def build_layer(L: dict, rng: Rng) -> MeshData:
    m = MeshData()
    cx, cz = CENTRE
    R = L["radius"]
    segs = L["segs"]
    span = math.radians(L["span"])
    haze_col = P["sky_horizon"]
    rows = [-2.0, 0.3, 0.6, 0.85, 1.0]  # fractions of the local ridge height (first = below ground)
    grid = []
    for i in range(segs + 1):
        a = -span + 2 * span * i / segs
        # ridge height: broad swells + smaller peaks
        n = fbm(i * 0.11 + L["seed"], 0.0, 0.0, L["seed"], 3)
        p = fbm(i * 0.35, 3.0, 0.0, L["seed"] + 9, 2)
        h = L["base"] + L["amp"] * (0.25 + 0.75 * n) * (0.45 + 0.9 * p)
        # lower straight ahead (behind the mairie, so its bell gable has sky around it), higher
        # ridges to the sides
        h *= L["valley"] + (1 - L["valley"]) * _ss(0.08, 0.5, abs(a)) * (0.7 + 0.3 * math.cos(a * 0.75))
        col = []
        for k, f in enumerate(rows):
            edge = k in (0, len(rows) - 1)
            r = R + (0.0 if edge else rng.jitter(2.0)) - f * 5.0
            y = f * h if f > 0 else f
            # direction from the centre: angle 0 = -Z
            col.append((cx + r * math.sin(a), y + (0.0 if edge else rng.jitter(0.12 * h)), cz - r * math.cos(a)))
        grid.append(col)
    base_c = P[L["color"]]
    for i in range(segs):
        for k in range(len(rows) - 1):
            a0, a1 = grid[i][k], grid[i + 1][k]
            b0, b1 = grid[i][k + 1], grid[i + 1][k + 1]
            hf = (rows[k] + rows[k + 1]) / 2
            haze = L["haze"] * (1 - _ss(-0.5, 1.0, hf))
            # facing the centre of the arc (toward the cameras); sun-facing facets lighter
            for tri in ((a0, b1, b0), (a0, a1, b1)):
                lit = _face_light(*tri)
                c = mix(scale(base_c, 0.82 + 0.45 * lit), haze_col, haze)
                m.add_face(tuple(m.add_vert(v) for v in tri), scale(c, 1.0 + rng.jitter(0.02)))
    return m


def build():
    rng = Rng(21)
    mat = palette_material()
    m = MeshData()
    for L in LAYERS:
        m.append(build_layer(L, rng))
    o = to_object(m, "hills", mat)
    triangulate(o)
    return [o]
