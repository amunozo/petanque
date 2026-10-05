"""
The app-icon scene: two steel boules (Provence-blue steel and red-bronze steel, the two team
tints of the game) and the yellow jack on a faceted terracotta gravel ground, seen from above
in warm late-afternoon light. Boule radius = 1 unit (the jack is a little oversized so it reads
at 48 px).

`build(ground=True)` builds the scene and camera; `SUBJECT` lists the balls (for the vector
favicon / monochrome icon, which are drawn from the same layout).
"""
from __future__ import annotations

import math

from stage import boule, camera, gravel, jack, lin, mix, scale, sky_world, sun

# Colours (sRGB hex), natural and realistic-leaning: sun-warmed terracotta gravel, polished steel
# with a faint team tint (cool blue steel / warm bronze steel, as in the game), a painted yellow jack.
GROUND_DARK = "#93472a"
GROUND_LIGHT = "#c47a47"
BLUE_STEEL = "#a6bfe6"
RED_STEEL = "#e8c9b4"
JACK = "#f4c21c"
GROOVE = "#1a1c20"

# name, kind, centre (game xyz), radius, rotation (deg, Blender xyz) for the grooves
SUBJECT = [
    ("boule_blue", "boule", (-0.78, 1.0, 0.42), 1.0, (62, 0, -28)),
    ("boule_red", "boule", (0.95, 1.0, -0.78), 1.0, (-58, 0, 35)),
    ("jack", "jack", (0.92, 0.46, 0.98), 0.46, (0, 0, 0)),
]
TARGET = (0.05, 0.6, 0.05)
CAM_ELEVATION_DEG = 58
CAM_DISTANCE = 14.0
LENS_MM = 55.0  # wide: the master frame also covers the adaptive-icon canvas (subject ~ 61%)


def _vignette(x: float, z: float, c):
    r2 = ((x - 0.1) ** 2 + (z - 0.1) ** 2) / 18.0
    return scale(c, max(0.5, 1.12 - 0.62 * r2))


def build(ground: bool = True, shadow_catcher: bool = False):
    sky_world(zenith="#5f93d6", horizon="#f4e8d2", ground=GROUND_DARK, strength=0.7)
    sun((-0.75, 1.15, -0.55), energy=4.6, color="#fff2dc", angle_deg=2.5)
    objs = []
    if ground:
        g = gravel("ground", half=9.0, cell=0.42, colors=[lin(GROUND_DARK), lin(GROUND_LIGHT)], seed=11,
                   height=0.02, color_fn=_vignette, shade_jitter=0.04, noise_scale=0.12)
        if shadow_catcher:
            g.is_shadow_catcher = True
        objs.append(g)
    tints = {"boule_blue": BLUE_STEEL, "boule_red": RED_STEEL}
    for name, kind, c, r, rot in SUBJECT:
        if kind == "boule":
            objs.append(boule(name, c, r, tints[name], rot_deg=rot, roughness=0.3, groove=GROOVE, grooves=(-0.38, 0.38), width=0.055))
        else:
            objs.append(jack(name, c, r, JACK))
    el = math.radians(CAM_ELEVATION_DEG)
    cam_loc = (TARGET[0], TARGET[1] + CAM_DISTANCE * math.sin(el), TARGET[2] + CAM_DISTANCE * math.cos(el))
    camera(cam_loc, TARGET, LENS_MM)
    return objs


__all__ = ["build", "SUBJECT", "GROUND_DARK", "GROUND_LIGHT", "BLUE_STEEL", "RED_STEEL", "JACK", "GROOVE", "mix"]
