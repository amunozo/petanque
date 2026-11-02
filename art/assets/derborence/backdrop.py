"""
backdrop.glb (derborence): the cirque of Derborence around the clearing, pre-lit and pre-hazed (the
game draws it unlit, without fog or tone mapping, like the village hills):

  - pale limestone cliffs on an arc beyond the far end: near-vertical walls with horizontal strata
    (ledges catch the light), a jagged crest of towers and notches, scree fans at their feet.
    Late afternoon: the valley is already in shade, so the lower walls are a cool hazy blue-grey;
    higher up a warm golden light rakes across them (the shadow line climbs from left to right).
  - a band of distant forest in front of them: a sawtooth of dark spruce tips with a few golden
    larches, in shade, hazed toward the horizon colour.

Colours: palette "d_cliff_*", "d_forest_far*", "d_larch_far", hazed toward "d_sky_horizon" (keep it
in sync with the derborence sky in src/render/venues.ts). The sun direction for the facet light is
the venue's (lib/layout_derborence.py). Everything stays within ~85 m of the cameras (far plane 90 m).
"""
from __future__ import annotations

import math

from lib import venues
from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

from . import site

NAME = "backdrop"
SEED = 801

CENTRE = (0.0, -12.0)
CLIFF = {"radius": 52.0, "span": 118.0, "segs": 84}
FOREST = {"radius": 37.0, "span": 150.0, "teeth": 130}

PREVIEW = {
    "views": [
        ("front", (0.0, 2.3, 7.0), (0.0, 14.0, -60.0), 24),
        ("overview", (7.0, 7.0, 14.0), (0.0, 10.0, -50.0), 26),
        ("wide", (0.0, 6.0, 12.0), (0.0, 20.0, -50.0), 14),
    ],
    "ground_size": 0.0,
}


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _sun():
    return venues.current().layout().sun_direction()


def _lit(a, b, c, sun) -> float:
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
    ln = math.sqrt(sum(k * k for k in n)) or 1.0
    return max(0.0, sum(n[k] / ln * sun[k] for k in range(3)))


def _at(angle: float, r: float, y: float):
    cx, cz = CENTRE
    return (cx + r * math.sin(angle), y, cz - r * math.cos(angle))


def crest(a: float) -> float:
    """Height of the cliff tops at angle a (rad, 0 = straight down the court)."""
    base = 28.0 + 16.0 * fbm(a * 1.4 + 3.0, 0.0, 0.0, SEED, 3)
    towers = 9.0 * _ss(0.55, 0.8, fbm(a * 7.0, 1.0, 0.0, SEED + 1, 2))
    notch = -7.0 * _ss(0.62, 0.8, fbm(a * 5.0, 2.0, 0.0, SEED + 2, 2))
    side = 6.0 * _ss(0.3, 1.2, abs(a))  # the walls close in higher on the sides
    return base + towers + notch + side


def shadow_line(a: float) -> float:
    """Height (m) above which the cliffs are still in the sun."""
    return 11.0 + 6.0 * math.sin(a * 0.9 - 0.3) + 4.0 * (fbm(a * 3.0, 5.0, 0.0, SEED + 3, 2) - 0.5)


def build_cliffs(rng: Rng) -> MeshData:
    m = MeshData()
    sun = _sun()
    span = math.radians(CLIFF["span"])
    segs = CLIFF["segs"]
    R = CLIFF["radius"]
    haze = P["d_sky_horizon"]
    # rows: fractions of the local wall height; ledges set the face back a little at each stratum
    rows = [-0.25, 0.0, 0.1, 0.2, 0.31, 0.42, 0.54, 0.66, 0.78, 0.9, 1.0]
    grid = []
    for i in range(segs + 1):
        a = -span + 2 * span * i / segs
        top = crest(a)
        gx, _, gz = _at(a, R, 0.0)
        foot = site.ground_y(gx, gz) - 3.0 + 3.0 * fbm(a * 2.0, 7.0, 0.0, SEED + 4, 2)
        col = []
        for k, f in enumerate(rows):
            y = foot + (top - foot) * max(f, 0.0) + (f if f < 0 else 0.0) * 20.0
            setback = 2.2 * f + 1.4 * math.sin(f * 17.0 + a * 3.0) * (0 < f < 1)
            # vertical buttresses and gullies (a few metres wide) + strata ledges; little random jitter
            gully = 1.6 * (fbm(a * 14.0, 0.0, 0.0, SEED + 7, 2) - 0.5)
            r = R + setback + gully + rng.jitter(0.25) * (0 < k < len(rows) - 1)
            col.append(_at(a, r, y + rng.jitter(0.25) * (0 < f < 1)))
        grid.append(col)
    for i in range(segs):
        a = -span + 2 * span * (i + 0.5) / segs
        sl = shadow_line(a)
        for k in range(len(rows) - 1):
            a0, a1 = grid[i][k], grid[i + 1][k]
            b0, b1 = grid[i][k + 1], grid[i + 1][k + 1]
            for tri in ((a0, b1, b0), (a0, a1, b1)):
                cy = sum(p[1] for p in tri) / 3
                lit = _lit(*tri, sun)
                stratum = fbm(a * 4.0, cy * 0.18, 0.0, SEED + 5, 2)
                rock = mix(P["d_cliff_shade"], P["d_cliff_dark"], _ss(0.45, 0.7, stratum) * 0.6)
                sunlit = mix(P["d_cliff_lit"], P["d_cliff_lit_pale"], _ss(0.4, 0.7, stratum) * 0.7)
                sunlit = scale(sunlit, 0.8 + 0.35 * lit)
                inlight = _ss(sl - 1.5, sl + 1.5, cy) * _ss(0.0, 0.15, lit)
                c = mix(scale(rock, 0.76 + 0.22 * lit), sunlit, inlight)
                # dark water streaks down the walls, paler strata
                c = scale(c, 1.0 - 0.16 * _ss(0.55, 0.7, fbm(a * 22.0, 0.0, 0.0, SEED + 6, 2)))
                c = scale(c, 0.94 + 0.12 * _ss(0.4, 0.6, fbm(a * 1.5, cy * 0.35, 3.0, SEED + 8, 2)))
                # aerial perspective: lower parts hazier
                c = mix(c, haze, 0.2 - 0.1 * _ss(10.0, 50.0, cy))
                m.add_face(tuple(m.add_vert(v) for v in tri), scale(c, 1.0 + rng.jitter(0.025)))
    # scree fans at the foot
    for _ in range(14):
        a = rng.uniform(-span * 0.95, span * 0.95)
        w = math.radians(rng.uniform(2.5, 5.0))
        apex = _at(a, R + 1.0, 4.0 + rng.uniform(6.0, 12.0))
        l = _at(a - w, R - 9.0, 2.0)
        r = _at(a + w, R - 9.0, 2.0)
        c = mix(P["d_scree"], P["d_cliff_shade"], 0.35)
        c = mix(c, haze, 0.3)
        m.add_face(tuple(m.add_vert(v) for v in (l, r, apex)), c)
    return m


def build_forest(rng: Rng) -> MeshData:
    """Sawtooth band of far conifer tips in shade (a few larches catching the low sun)."""
    m = MeshData()
    sun = _sun()
    span = math.radians(FOREST["span"])
    n = FOREST["teeth"]
    R = FOREST["radius"]
    haze = P["d_sky_horizon"]
    for i in range(n):
        a = -span + 2 * span * (i + rng.uniform(0.1, 0.9)) / n
        r = R + rng.uniform(-3.0, 6.0)
        x, _, z = _at(a, r, 0.0)
        ground = site.ground_y(x, z)
        h = rng.uniform(6.0, 11.5)
        w = rng.uniform(1.2, 2.0) * (r / R)
        larch = rng.random() < 0.16
        da = w / r
        # silhouette: a spire with two tiers of drooping branches (jagged, not a plain triangle)
        prof = [(0.0, 1.0), (0.42, 0.66), (0.24, 0.62), (0.78, 0.33), (0.5, 0.3), (1.0, 0.08), (0.95, -0.12)]
        jit = [(1.0 + rng.jitter(0.12), rng.jitter(0.03)) for _ in prof]
        left = [_at(a - da * px * jx, r, ground + h * (py + jy)) for (px, py), (jx, jy) in zip(prof, jit)]
        right = [_at(a + da * px * jx, r, ground + h * (py + jy * 0.7)) for (px, py), (jx, jy) in zip(prof, jit)]
        lit = _lit(left[5], right[5], left[0], sun)
        top_light = _ss(8.0, 11.0, h)  # the tallest tips catch the sun
        if larch:
            c = mix(P["d_larch_far"], P["d_forest_far"], 0.3 - 0.2 * top_light)
        else:
            c = mix(P["d_forest_far"], P["d_forest_far_lit"], top_light * 0.3 * (0.5 + lit))
        c = scale(c, 1.0 + rng.jitter(0.1))
        hz = 0.07 + 0.08 * _ss(R - 3, R + 6, r)
        top_c = mix(c, haze, hz)
        body_c = mix(scale(c, 0.82), haze, hz + 0.02)
        # strip from the tip down, wound to face the centre (the cameras)
        quads = [(left[i + 1], right[i + 1], right[i], left[i]) for i in range(1, len(prof) - 1)]
        quads.append((_at(a - da * 0.9, r, ground - 2.0), _at(a + da * 0.9, r, ground - 2.0), right[-1], left[-1]))
        m.add_face(tuple(m.add_vert(v) for v in (left[1], right[1], left[0])), top_c)
        for q in quads:
            col = top_c if (q[2][1] + q[3][1]) / 2 > ground + h * 0.5 else body_c
            m.add_face(tuple(m.add_vert(v) for v in q), col)
    return m


def build():
    rng = Rng(SEED)
    m = build_cliffs(rng)
    m.append(build_forest(Rng(SEED + 1)))
    o = to_object(m, "backdrop", palette_material())
    triangulate(o)
    return [o]
