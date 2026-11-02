"""
Site plan of the Derborence venue, shared by its asset scripts (not an asset itself): where the
bank, the chalet, the props and the boulders are, and the height of the ground everywhere.

Game coordinates (metres, Y up, the player throws toward -Z). The court (x -2..2, z -9.5..5.5,
top y = 0) is the shared physics arena. Behind its far end the ground rises in a bank (a dry-stone
retaining wall at its foot, then a grassy slope) to the terrace of the chalet, ~2 m up; steps lead
up the bank left of the court axis. The big pine stands right of the far end, the huge limestone
boulder beyond it; the shed is on the left.

The ground is split in two meshes that meet exactly (same height function on their shared edge):
  court_surround (court.py)  flat forest floor around the court, on the planar ground lightmap
  terrain (terrain.py)       the bank and the chalet terrace inside TERRAIN_RECT, on the atlas
                             (a planar map at y = 0 would put its shadows metres off)
"""
from __future__ import annotations

import math

from lib.rand import fbm

ARENA = {"min_x": -2.0, "max_x": 2.0, "min_z": -9.5, "max_z": 5.5}
SEED = 101

LOG_R = 0.13          # radius of the court's frame logs
LOG_Y = 0.02         # centre height of the logs (about two thirds of them show)
SURROUND_EDGE_Y = -0.012

# The bank: foot line z (wavy), its height, how far back the terrace edge is.
BANK_FOOT_Z = -12.0
BANK_RUN = 2.3        # foot -> terrace edge (m, along -Z)
BANK_H = 2.0          # terrace height above the court
BANK_X = (-13.0, 4.6)  # full height between these x; tapers to 0 over BANK_TAPER beyond them
BANK_TAPER = 5.0
WALL_X = (-10.5, 2.3)  # dry-stone retaining wall along the foot

# Terrain mesh (atlas-lit) rectangle; the planar surround leaves a hole here.
TERRAIN_RECT = {"x0": -18.8, "x1": 10.8, "z0": -32.0, "z1": -11.2}  # x lines every 0.8 m hit +-2

# The chalet: gable facing the court; front of the stone foundation at z = CHALET["z"].
CHALET = {"x": -2.6, "z": -15.6, "w": 7.6, "d": 9.2, "yaw": 0.0}
STEPS = {"x": -2.9, "w": 1.35, "n": 7}   # centre x, width and count of the steps up the bank

PINE = (3.15, -7.7)              # the big pine with the floodlight (instanced, see layout_derborence)
BOULDER = (8.0, -11.9)           # the huge limestone block
BBQ = (3.15, -12.35)             # dry-stone barbecue / table at the foot of the bank, right
SHED = (-6.95, -4.05)            # small wooden shed (door toward the court, +X), clear of the larch at (-6.8, -1.8)


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def dist_to_court(x: float, z: float) -> float:
    dx = max(ARENA["min_x"] - x, 0.0, x - ARENA["max_x"])
    dz = max(ARENA["min_z"] - z, 0.0, z - ARENA["max_z"])
    return math.hypot(dx, dz)


def bank_foot(x: float) -> float:
    """z of the foot of the bank (the retaining wall's face) at x."""
    return BANK_FOOT_Z + 0.25 * math.sin(x * 0.45 + 1.0) + 0.12 * math.sin(x * 1.3)


def bank_weight(x: float) -> float:
    """1 where the bank has its full height, tapering to 0 at its ends."""
    return _ss(BANK_X[0] - BANK_TAPER, BANK_X[0], x) * _ss(BANK_X[1] + BANK_TAPER, BANK_X[1], x)


def steps_weight(x: float) -> float:
    """1 under the steps, fading out just beside them."""
    return _ss(STEPS["w"] / 2 + 0.45, STEPS["w"] / 2 + 0.05, abs(x - STEPS["x"]))


def wall_height(x: float) -> float:
    """Height of the retaining wall at x (0 outside it)."""
    if not (WALL_X[0] - 0.6 <= x <= WALL_X[1] + 0.6):
        return 0.0
    k = _ss(WALL_X[0] - 0.6, WALL_X[0] + 0.4, x) * _ss(WALL_X[1] + 0.6, WALL_X[1] - 0.4, x)
    return (0.74 + 0.12 * math.sin(x * 0.7)) * k


def ground_y(x: float, z: float) -> float:
    """Height of the ground (both meshes, and everything that stands on them)."""
    d = dist_to_court(x, z)
    # small undulations, none at the court's edge
    y = SURROUND_EDGE_Y + _ss(0.6, 5.0, d) * (fbm(x * 0.33, z * 0.33, 0, SEED, 3) - 0.5) * 0.22
    # the bank: retaining wall (steep, behind the stones) then a slope up to the terrace
    zf = bank_foot(x)
    w = bank_weight(x)
    if w > 0 and z < zf + 0.05:
        t = (zf - z)  # metres behind the foot
        wh = wall_height(x)
        steep = wh * _ss(-0.05, 0.35, t)
        slope = (BANK_H - wh) * _ss(0.3, BANK_RUN, t)
        rise = steep + slope
        # under the steps: an even ramp just below the treads
        ws = steps_weight(x)
        if ws > 0:
            ramp = BANK_H * max(0.0, min(1.0, t / BANK_RUN))
            ramp -= 0.1 * _ss(0.0, 0.3, t) * _ss(BANK_RUN + 0.2, BANK_RUN - 0.2, t)
            rise = rise + (ramp - rise) * ws
        # behind the terrace (beyond the chalet) the forest floor keeps rising gently
        rise += 0.11 * max(0.0, -(z + 27.5)) * _ss(-27.0, -29.0, z)
        y += w * rise
    # beyond the clearing the valley floor rises toward the cliffs and on the sides
    back = _ss(-28.0, -60.0, z) * 5.0 + _ss(16.0, 40.0, abs(x)) * 3.0
    y += back * (0.7 + 0.6 * fbm(x * 0.05, z * 0.05, 3, SEED + 5, 2))
    return y


def terrace_y() -> float:
    """Top of the chalet terrace (flat under the chalet)."""
    return SURROUND_EDGE_Y + BANK_H
