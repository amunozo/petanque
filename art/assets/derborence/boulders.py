"""
boulders.glb (derborence): the huge limestone block beside the far end of the court (several metres
high, mossy on top, dark water streaks down its faces), the smaller boulders around the clearing
and a few stones scattered in the forest floor. Angular convex blocks, subdivided and roughened
(lib/alpine.add_boulder), flat shaded, on the lightmap atlas.
"""
from __future__ import annotations

from lib.alpine import add_boulder, add_stone, weld
from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.rand import Rng

from . import site

NAME = "boulders"
SEED = 601

# (x, z, radii (x, y, z), yaw, cuts, moss); y is set on the ground
BIG = [
    (site.BOULDER[0], site.BOULDER[1], (3.4, 2.7, 2.5), 18.0, 3, 0.55),
]
MEDIUM = [
    (4.85, -9.15, (0.85, 0.6, 0.7), 40.0, 1, 0.8),      # mossy rock right of the far end (photo: by the bench)
    (5.0, -13.9, (1.1, 0.8, 0.9), 75.0, 1, 0.7),        # against the bank behind the barbecue
    (3.75, -3.6, (0.5, 0.36, 0.45), 10.0, 1, 0.6),      # right side, mid court
    (-5.2, -10.9, (0.7, 0.45, 0.6), 130.0, 1, 0.7),
    (-4.6, 2.6, (0.55, 0.35, 0.5), 60.0, 1, 0.6),
    (9.6, -9.0, (1.3, 0.9, 1.0), 200.0, 1, 0.6),
    (-11.5, -7.5, (1.2, 0.8, 1.0), 300.0, 1, 0.7),
    (11.2, 2.0, (1.0, 0.7, 0.9), 20.0, 1, 0.6),
    (-9.5, 6.5, (0.9, 0.6, 0.8), 160.0, 1, 0.6),
]

PREVIEW = {
    "views": [
        ("big", (2.0, 2.2, -3.0), (7.0, 2.0, -11.6), 32),
        ("court", (0.0, 2.3, 7.0), (2.0, 1.0, -8.0), 30),
    ],
    "context": ["court"],
    "ground_size": 0.0,
}


def build():
    rng = Rng(SEED)
    m = MeshData()
    for i, (x, z, r, yaw, cuts, moss) in enumerate(BIG + MEDIUM):
        y = site.ground_y(x, z) + r[1] * 0.75
        add_boulder(m, (x, y, z), r, yaw, rng, n=56 if i == 0 else 26, boxy=7.0 if i == 0 else 3.2, cuts=cuts,
                    rough=0.045 if i == 0 else 0.05, moss=moss, seed=SEED + i * 7, sink=0.12,
                    base="d_rock_dark" if i == 0 else "d_rock")
    # loose stones scattered in the clearing (away from the court and its stone row)
    n = 0
    while n < 40:
        x, z = rng.uniform(-13.0, 13.0), rng.uniform(-11.0, 11.0)
        if site.dist_to_court(x, z) < 1.1:
            continue
        tr = site.TERRAIN_RECT
        if tr["x0"] < x < tr["x1"] and z < tr["z1"] + 0.2:
            continue
        r = rng.uniform(0.07, 0.2)
        radii = (r, r * rng.uniform(0.45, 0.75), r * rng.uniform(0.6, 1.0))
        add_stone(m, (x, site.ground_y(x, z) + r * 0.05, z), radii, rng.uniform(0, 360), rng, n=12, boxy=2.6, moss=0.3)
        n += 1
    o = to_object(weld(m), "boulders", palette_material())
    triangulate(o)
    return [o]
