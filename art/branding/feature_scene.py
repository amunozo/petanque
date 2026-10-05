"""
The Play Store feature-graphic scene: a low camera on a gravel pétanque court in a Provençal
village square, late afternoon. Two boules and the jack rest in sharp focus in the foreground,
a third boule drops in mid-flight (motion blurred); the square (limestone and ochre facades with
painted shutters, plane trees, a café awning) is soft behind them (depth of field).

Natural, realistic-leaning colours (no candy saturation). Self-contained: it does not load the
game's scenery assets, so it stays stable while those evolve. Real scale: metres.
"""
from __future__ import annotations

import math

import bpy

from lib.mesh import MeshData, box, icosphere, to_object, tube
from lib.rand import Rng
from stage import bl, boule, camera, gravel, jack, lin, mix, palette_material, scale, sky_world, sun

BOULE_R = 0.0375
JACK_R = 0.016

GRAVEL_DARK = "#a67a52"
GRAVEL_LIGHT = "#cfa77a"
EARTH = "#b88a5c"
TIMBER = "#7a5232"
RENDERS = ["#e2d3b4", "#d6ad73", "#d9b38c", "#cf9a7c", "#e6dcc6", "#c9a47a"]
SHUTTERS = ["#5a7fa3", "#7c977a", "#4f6f8f", "#8a8aa6", "#6f8a6a"]
ROOF = "#a65a3c"
GLASS = "#2b323c"
STONE = "#c4b79c"
LEAF = ["#4f6f2e", "#5f7f36", "#6d8c3c", "#3f5c28"]
BARK = ["#8f8a72", "#b3ab8c", "#77705a"]
AWNING = "#b2463a"

BLUE_STEEL = "#a6bfe6"
RED_STEEL = "#e8c9b4"
JACK = "#f4c21c"

# camera / focus
CAM = (0.0, 0.09, 0.78)
LOOK_AT = (0.2, 0.17, -0.6)
LENS = 24.0
FOCUS_DIST = 0.6
FSTOP = 2.8


def _facade_row(m: MeshData, rng: Rng, z: float, x0: float, x1: float, facing: float = 1.0) -> None:
    """A row of 2-3 storey houses with their facade on plane z, facing +z (toward the camera)."""
    x = x0
    while x < x1:
        w = rng.uniform(4.0, 6.5)
        h = rng.choice([7.0, 8.5, 10.0]) + rng.jitter(0.4)
        render = lin(rng.choice(RENDERS))
        shutter = lin(rng.choice(SHUTTERS))
        d = 6.0
        m.append(box(x + w / 2, h / 2, z - d / 2, w, h, d, render))
        # roof overhang + tiles
        m.append(box(x + w / 2, h + 0.12, z - d / 2 + 0.2, w + 0.3, 0.25, d + 0.5, lin(ROOF)))
        m.append(box(x + w / 2, h + 0.7, z - d / 2 - 0.4, w + 0.2, 1.0, d - 1.6, scale(lin(ROOF), 0.85)))
        floors = int(h // 2.9)
        cols = max(2, int(w // 1.7))
        for f in range(floors):
            wy = 1.5 + f * 2.8 + (0.4 if f else 0.0)
            for c in range(cols):
                wx = x + (c + 0.5) * w / cols
                if f == 0 and c == cols // 2:  # a door on the ground floor
                    m.append(box(wx, 1.15, z + 0.02, 1.1, 2.3, 0.06, scale(shutter, 0.8)))
                    continue
                m.append(box(wx, wy, z + 0.02, 0.85, 1.35, 0.06, lin(GLASS)))
                for side in (-1, 1):
                    m.append(box(wx + side * 0.66, wy, z + 0.06, 0.45, 1.4, 0.05, shutter))
                m.append(box(wx, wy - 0.75, z + 0.08, 1.0, 0.08, 0.16, lin(STONE)))
        x += w + rng.uniform(0.0, 0.15)


def _tree(rng: Rng, at, height: float):
    """A plane tree: pale mottled trunk and a broad canopy of soft faceted clumps."""
    m = MeshData()
    tx, _, tz = at
    # round, slightly tapering trunk with mottled bark (plane-tree camouflage patches)
    path = [(tx + 0.05 * math.sin(k * 0.9), height * 0.72 * k / 8, tz) for k in range(9)]
    radii = [0.26 - 0.012 * k for k in range(9)]
    tv, tf, _ = tube(path, radii, 10, up_hint=(1.0, 0.0, 0.0))
    base = len(m.verts)
    m.verts.extend(tv)
    for f in tf:
        m.faces.append(tuple(base + i for i in f))
        m.colors.append(lin(rng.choice(BARK)))
    verts, faces = icosphere(2)
    for _ in range(9):
        cx = tx + rng.jitter(2.6)
        cz = tz + rng.jitter(2.6)
        cy = height * rng.uniform(0.75, 1.0)
        r = rng.uniform(1.4, 2.1)
        col = lin(rng.choice(LEAF))
        base = len(m.verts)
        for v in verts:
            k = 1 + rng.jitter(0.08)
            m.verts.append((cx + v[0] * r * k, cy + v[1] * r * 0.75 * k, cz + v[2] * r * k))
        for f in faces:
            m.faces.append(tuple(base + i for i in (f[0], f[2], f[1])))
            m.colors.append(scale(col, 1 + rng.jitter(0.12)))
    return m


def build() -> list:
    rng = Rng(7)
    mat = palette_material()
    sky_world(zenith="#4f86c9", horizon="#e4ecef", ground=EARTH, strength=1.0)
    sun((-0.45, 0.95, 0.6), energy=4.2, color="#fff0d6", angle_deg=1.5)
    objs = []

    # ground: fine gravel court inside timber boards, packed earth around
    objs.append(gravel("court", half=6.0, cell=0.09, colors=[lin(GRAVEL_DARK), lin(GRAVEL_LIGHT)], seed=3,
                       height=0.004, center=(0.0, -3.0), shade_jitter=0.05, noise_scale=0.05))
    objs.append(gravel("square", half=40.0, cell=1.2, colors=[lin(EARTH), lin("#c79a6a")], seed=5,
                       height=0.0, center=(0.0, -20.0), shade_jitter=0.03))
    objs[-1].location.z -= 0.01
    b = MeshData()
    for side in (-1, 1):
        b.append(box(side * 2.0, 0.05, -3.0, 0.08, 0.12, 30.0, lin(TIMBER)))
    objs.append(to_object(b, "boards", mat))

    # the square: facades closing the far end and both sides
    m = MeshData()
    _facade_row(m, rng, -17.0, -16.0, 16.0)
    objs.append(to_object(m, "far_row", mat))
    for side in (-1, 1):
        s = MeshData()
        _facade_row(s, rng, 0.0, -2.0, 18.0)
        o = to_object(s, f"side_row_{side}", mat)
        o.rotation_euler = (0, 0, math.radians(90 * side))
        o.location = bl((side * 10.5, 0.0, -16.0))
        objs.append(o)
    # café awning (muted red) on the far row
    aw = MeshData()
    aw.append(box(4.5, 3.1, -16.2, 5.0, 0.12, 1.6, lin(AWNING)))
    aw.append(box(4.5, 2.95, -15.42, 5.0, 0.3, 0.05, lin("#e8e0cf")))
    objs.append(to_object(aw, "awning", mat))

    # plane trees along both sides of the court (and one framing the top right)
    for i, (x, z) in enumerate([(-5.2, -12.0), (5.4, -11.0), (-5.6, -6.0), (5.5, -5.5), (5.0, -1.0), (-5.4, -0.5)]):
        objs.append(to_object(_tree(Rng(20 + i), (x, 0.0, z), 6.8), f"tree_{i}", mat))

    # boules and jack in the foreground, one boule dropping in
    objs.append(jack("jack", (0.245, JACK_R, 0.29), JACK_R, JACK))
    objs.append(boule("boule_a", (0.375, BOULE_R, 0.24), BOULE_R, BLUE_STEEL, rot_deg=(60, 10, -20), roughness=0.28,
                      grooves=(-0.38, 0.38), width=0.055))
    objs.append(boule("boule_b", (0.2, BOULE_R, 0.19), BOULE_R, RED_STEEL, rot_deg=(-50, 0, 40), roughness=0.28,
                      grooves=(-0.38, 0.38), width=0.055))
    flying = boule("boule_fly", (0.515, 0.33, -0.08), BOULE_R, BLUE_STEEL, rot_deg=(20, 30, 0), roughness=0.28,
                   grooves=(-0.38, 0.38), width=0.055)
    objs.append(flying)
    _motion(flying, (0.515, 0.345, -0.11), (0.515, 0.325, -0.065))

    cam = camera(CAM, LOOK_AT, LENS)
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = FOCUS_DIST
    cam.data.dof.aperture_fstop = FSTOP
    return objs


def _motion(obj, at_shutter_open, at_shutter_close) -> None:
    """Keyframes frame 1 -> 2 so Cycles' motion blur smears the flying boule along its path."""
    scene = bpy.context.scene
    scene.frame_start = scene.frame_end = 1
    obj.location = bl(at_shutter_open)
    obj.keyframe_insert("location", frame=1)
    obj.location = bl(at_shutter_close)
    obj.keyframe_insert("location", frame=2)
    scene.frame_set(1)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 1.0
    scene.render.motion_blur_position = "START"
