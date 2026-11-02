"""
backdrop.glb (derborence): the cirque of Derborence around the clearing, pre-lit and pre-hazed (the
game draws it unlit, without fog or tone mapping, like the village hills). Layers, near to far:

  - forest: two rows of dark spruce tips with golden larches, in the valley's shade
  - tawny grass and scree slopes rising from behind the forest to the foot of the cliffs, dotted
    with golden larches; scree fans under the gullies
  - the cliff band: massive grey limestone in stacked strata (vertical walls, narrow ledges that
    catch the sky and a dusting of snow), cut by buttresses and gullies; their flanks turned to
    the low sun glow warm, the others stay blue-grey. The valley floor is already in shade, the
    shadow line climbs the walls. Above the crest, grassy-snowy shoulders lead back to
  - the peaks set behind: a blocky, flat-topped summit tower left of centre and a stratified
    pyramid to the right, paler and bluer with the distance (aerial perspective)

Colours: palette "d_cliff_*", "d_scree", "d_grass_far*", "d_snow*", "d_forest_far*", "d_larch_far",
hazed toward "d_sky_horizon" (keep it in sync with the derborence sky in src/render/venues.ts). The
facet light uses the venue's sun (lib/layout_derborence.py). Everything stays within ~85 m of the
cameras (far plane 90 m).
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
CLIFF = {"radius": 50.0, "span": 118.0, "segs": 108}
FOREST = {"radius": 36.0, "span": 150.0, "teeth": 120}
# strata of the cliff band: (fraction of the wall height where the stratum's wall starts, ledge depth m)
STRATA = [(0.0, 0.0), (0.16, 1.4), (0.3, 0.8), (0.43, 2.0), (0.56, 0.9), (0.68, 1.6), (0.8, 0.8), (0.9, 1.2)]

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


def _normal(a, b, c):
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
    ln = math.sqrt(sum(k * k for k in n)) or 1.0
    return (n[0] / ln, n[1] / ln, n[2] / ln)


def _lit(a, b, c, sun) -> float:
    n = _normal(a, b, c)
    return max(0.0, sum(n[k] * sun[k] for k in range(3)))


def _at(angle: float, r: float, y: float):
    cx, cz = CENTRE
    return (cx + r * math.sin(angle), y, cz - r * math.cos(angle))


def _cam_dist(p) -> float:
    return math.hypot(p[0], p[2] - 8.0)


def _haze(c, p, extra: float = 0.0):
    """Aerial perspective: farther and lower = paler and bluer (toward the horizon colour)."""
    k = 0.04 + 0.2 * _ss(45.0, 88.0, _cam_dist(p)) - 0.05 * _ss(8.0, 45.0, p[1]) + extra
    return mix(c, P["d_sky_horizon"], max(0.0, min(0.75, k)))


def rock_shade(n, cy: float, sl: float, sun, tone: float):
    """Limestone pre-lit: warm near-white where the low sun reaches (above the valley's shadow line,
    on faces turned to it), cool blue-grey in shade with a little sky light from above."""
    lit = max(0.0, sum(n[k] * sun[k] for k in range(3)))
    rock = mix(P["d_cliff_shade"], P["d_cliff_dark"], tone * 0.7)
    shade = scale(rock, 0.7 + 0.2 * max(0.0, n[1]) + 0.08 * lit)
    sunlit = mix(P["d_cliff_lit"], P["d_cliff_lit_pale"], 0.1 + 0.3 * (1.0 - tone))
    sunlit = mix(sunlit, P["d_cliff_dark"], 0.4 * tone)
    sunlit = scale(sunlit, 0.5 + 0.42 * lit)
    inlight = _ss(sl - 1.2, sl + 1.2, cy) * _ss(0.05, 0.3, lit)
    return mix(shade, sunlit, inlight), inlight


def crest(a: float) -> float:
    """Height of the cliff tops at angle a (rad, 0 = straight down the court)."""
    base = 30.0 + 12.0 * fbm(a * 1.3 + 3.0, 0.0, 0.0, SEED, 3)
    towers = 7.0 * _ss(0.55, 0.8, fbm(a * 6.0, 1.0, 0.0, SEED + 1, 2))
    notch = -6.0 * _ss(0.62, 0.8, fbm(a * 4.5, 2.0, 0.0, SEED + 2, 2))
    side = 7.0 * _ss(0.3, 1.2, abs(a))  # the walls close in higher on the sides
    return base + towers + notch + side


def shadow_line(a: float) -> float:
    """Height (m) above which the cliffs are still in the sun (climbing from left to right)."""
    return 19.0 + 8.0 * math.sin(a * 0.9 - 0.3) + 5.0 * (fbm(a * 3.0, 5.0, 0.0, SEED + 3, 2) - 0.5)


def buttress(a: float, y: float) -> float:
    """Radial relief (m) of the walls: sharp buttresses (negative = toward the cameras) between
    rounded gullies, drifting a little with height so they do not read as ruled columns."""
    n = fbm(a * 9.0 + y * 0.012, 0.0, 0.0, SEED + 7, 2)
    ridge = 1.0 - abs(2.0 * n - 1.0)  # 1 on the buttress crests
    big = fbm(a * 3.2, 4.0, 0.0, SEED + 9, 2)
    return -4.5 * ridge ** 2 - 2.5 * _ss(0.5, 0.75, big) + 1.6


def _rows(top: float, foot: float):
    """(height, setback) rows of one column: per stratum the foot of its wall (after the ledge)
    and the top of its wall; the setbacks accumulate upward (the face steps back stratum by stratum)."""
    rows = []
    back = 0.0
    H = top - foot
    for k, (f, ledge) in enumerate(STRATA):
        f1 = STRATA[k + 1][0] if k + 1 < len(STRATA) else 1.0
        y0 = foot + H * f
        y1 = foot + H * f1
        back += ledge
        rows.append((y0 + (0.25 if k else 0.0), back))       # foot of the wall, set back by its ledge
        rows.append((y1 - 0.35, back + 0.5 + 0.3 * f1))       # its top (a slight batter)
    return rows


def build_cliffs(rng: Rng) -> MeshData:
    m = MeshData()
    sun = _sun()
    span = math.radians(CLIFF["span"])
    segs = CLIFF["segs"]
    R = CLIFF["radius"]
    grid = []
    tops = []
    for i in range(segs + 1):
        a = -span + 2 * span * i / segs
        top = crest(a)
        foot = 4.0 + 3.0 * fbm(a * 2.0, 7.0, 0.0, SEED + 4, 2)
        col = []
        for y, back in _rows(top, foot):
            r = R + back + buttress(a, y) + rng.jitter(0.2)
            col.append(_at(a, r, y + rng.jitter(0.15)))
        # shoulders above the crest: a grassy, snow-dusted slope stepping back to the skyline
        r_top = R + _rows(top, foot)[-1][1] + buttress(a, top)
        col.append(_at(a, r_top + 1.5, top + 0.6))
        col.append(_at(a, r_top + 7.0, top + 3.5 + 2.0 * fbm(a * 5.0, 9.0, 0.0, SEED + 10, 2)))
        grid.append(col)
        tops.append(top)
    nrow = len(grid[0])
    nwall = nrow - 2
    for i in range(segs):
        a = -span + 2 * span * (i + 0.5) / segs
        sl = shadow_line(a)
        for k in range(nrow - 1):
            a0, a1 = grid[i][k], grid[i + 1][k]
            b0, b1 = grid[i][k + 1], grid[i + 1][k + 1]
            for tri in ((a0, b1, b0), (a0, a1, b1)):
                n = _normal(*tri)
                cy = sum(p[1] for p in tri) / 3
                cp = (sum(p[0] for p in tri) / 3, cy, sum(p[2] for p in tri) / 3)
                # each stratum its own shade of grey (the bedding reads as bands), mottled along it
                band = (0.15, 0.7, 0.3, 0.85, 0.45, 0.65, 0.2, 0.55)[min(k // 2, 7)]
                tone = min(1.0, 0.35 * _ss(0.3, 0.7, fbm(a * 4.0, cy * 0.15, 0.0, SEED + 5, 2)) + 0.75 * band)
                c, inlight = rock_shade(n, cy, sl, sun, tone)
                if k >= nwall - 1 or n[1] > 0.55:
                    # ledges and shoulders: tawny grass with a dusting of snow (more of it up high)
                    grass = mix(P["d_grass_far"], P["d_grass_far_dry"], tone)
                    g_lit = scale(mix(grass, P["d_cliff_lit"], 0.15), 0.85 + 0.35 * max(0.0, sum(n[j] * sun[j] for j in range(3))))
                    g_sh = scale(mix(grass, P["d_cliff_shade"], 0.55), 0.85)
                    g = mix(g_sh, g_lit, inlight if k < nwall - 1 else _ss(0.05, 0.3, sum(n[j] * sun[j] for j in range(3))))
                    snow = _ss(0.42, 0.62, fbm(cp[0] * 0.3, cy * 0.2, cp[2] * 0.3, SEED + 11, 2)) * _ss(16.0, 34.0, cy)
                    c = mix(g, mix(P["d_snow_shade"], P["d_snow"], inlight), snow * 0.85)
                # dark water streaks down the steep walls
                c = scale(c, 1.0 - 0.2 * _ss(0.55, 0.72, fbm(a * 26.0, cy * 0.02, 0.0, SEED + 6, 2)) * (n[1] < 0.5))
                m.add_face(tuple(m.add_vert(v) for v in tri), _haze(scale(c, 1.0 + rng.jitter(0.02)), cp))
    return m


def build_slopes(rng: Rng) -> MeshData:
    """Tawny grass and scree slopes from behind the forest up to the cliff foot, with larches."""
    m = MeshData()
    sun = _sun()
    span = math.radians(CLIFF["span"])
    segs = CLIFF["segs"] // 2
    R = CLIFF["radius"]
    rad = [R - 10.0, R - 5.0, R - 1.5, R + 1.5]
    grid = []
    for i in range(segs + 1):
        a = -span + 2 * span * i / segs
        foot = 4.0 + 3.0 * fbm(a * 2.0, 7.0, 0.0, SEED + 4, 2)
        hs = [-1.0, foot * 0.35 + 1.0, foot * 0.8 + 1.5, foot + 0.6]
        grid.append([_at(a, r + rng.jitter(0.4) * (0 < k < 3), h + rng.jitter(0.3) * (0 < k < 3))
                     for k, (r, h) in enumerate(zip(rad, hs))])
    for i in range(segs):
        a = -span + 2 * span * (i + 0.5) / segs
        scree = _ss(0.55, 0.75, fbm(a * 9.0, 3.0, 0.0, SEED + 12, 2))  # fans under the gullies
        for k in range(len(rad) - 1):
            a0, a1 = grid[i][k], grid[i + 1][k]
            b0, b1 = grid[i][k + 1], grid[i + 1][k + 1]
            for tri in ((a0, b1, b0), (a0, a1, b1)):
                n = _normal(*tri)
                lit = max(0.0, sum(n[j] * sun[j] for j in range(3)))
                cp = tuple(sum(p[j] for p in tri) / 3 for j in range(3))
                g = mix(P["d_grass_far"], P["d_grass_far_dry"], fbm(cp[0] * 0.2, cp[2] * 0.2, 1.0, SEED + 13, 2))
                g = mix(g, P["d_scree"], scree * (0.4 + 0.5 * k / 2))
                c = scale(mix(g, P["d_cliff_shade"], 0.3), 0.7 + 0.2 * lit)  # in the valley's shade
                m.add_face(tuple(m.add_vert(v) for v in tri), _haze(c, cp))
    # golden larches dotted on the slopes and the lower ledges (two-triangle cones)
    for _ in range(170):
        a = rng.uniform(-span * 0.97, span * 0.97)
        if rng.random() < 0.6:
            r, base = rng.uniform(R - 8.0, R + 0.5), None
        else:
            # on a ledge of the lower strata
            top = crest(a)
            foot = 4.0 + 3.0 * fbm(a * 2.0, 7.0, 0.0, SEED + 4, 2)
            k = rng.choice([1, 2, 3])
            y0, back = _rows(top, foot)[2 * k]
            r, base = R + back + buttress(a, y0) - 0.3, y0 - 0.2
        if base is None:
            t = (r - (R - 10.0)) / 11.5
            foot = 4.0 + 3.0 * fbm(a * 2.0, 7.0, 0.0, SEED + 4, 2)
            base = -1.0 + max(0.0, t) * (foot + 1.6) - 0.2
        h = rng.uniform(1.8, 3.2)
        w = h * 0.28
        da = w / r
        lit = base > shadow_line(a) - 1.0  # trees on the ledges up in the sun glow gold
        spruce = rng.random() < 0.4
        if spruce:
            c = scale(P["d_forest_far"], 1.1 + rng.jitter(0.1))
        else:
            c = mix(P["d_larch_far"], P["d_forest_far"], 0.05 if lit else 0.45)
            c = scale(c, (1.1 if lit else 0.85) + rng.jitter(0.08))
        p0, p1, tip = _at(a - da, r, base), _at(a + da, r, base), _at(a + rng.jitter(da * 0.3), r - 0.2, base + h)
        m.add_face(tuple(m.add_vert(v) for v in (p0, p1, tip)), _haze(c, tip))
    return m


def _peak_ring(cx: float, cz: float, rx: float, rz: float, y: float, n: int, rng: Rng, jit: float, rot: float):
    out = []
    for k in range(n):
        t = rot + math.tau * k / n
        rr = 1.0 + rng.jitter(jit)
        out.append((cx + rx * rr * math.cos(t), y, cz + rz * rr * math.sin(t)))
    return out


def _loft(m: MeshData, rings, colour_fn) -> None:
    """Faces between consecutive rings (same vertex count, counter-clockwise from above), and a cap."""
    n = len(rings[0])
    for r in range(len(rings) - 1):
        lo, hi = rings[r], rings[r + 1]
        for k in range(n):
            k2 = (k + 1) % n
            for tri in ((lo[k], lo[k2], hi[k2]), (lo[k], hi[k2], hi[k])):
                if len({tuple(round(c, 4) for c in v) for v in tri}) < 3:
                    continue
                m.add_face(tuple(m.add_vert(v) for v in tri), colour_fn(tri, r))
    top = rings[-1]
    ctr = tuple(sum(v[j] for v in top) / n for j in range(3))
    for k in range(n):
        tri = (top[k], top[(k + 1) % n], ctr)
        m.add_face(tuple(m.add_vert(v) for v in tri), colour_fn(tri, len(rings) - 1))


def build_peaks(rng: Rng) -> MeshData:
    """The summits set back behind the cliff band, paler and bluer with the distance."""
    m = MeshData()
    sun = _sun()

    def colour(extra_haze: float, snow_from: float):
        def fn(tri, ring):
            n = _normal(*tri)
            cp = tuple(sum(p[j] for p in tri) / 3 for j in range(3))
            tone = _ss(0.4, 0.7, fbm(cp[0] * 0.1, cp[1] * 0.12, cp[2] * 0.1, SEED + 14, 2))
            c, inl = rock_shade(n, cp[1], 0.0, sun, tone)  # the summits are all in the sun
            if n[1] > 0.45:
                snow = _ss(0.45, 0.65, fbm(cp[0] * 0.25, cp[1] * 0.3, cp[2] * 0.25, SEED + 15, 2)) * _ss(snow_from, snow_from + 8, cp[1])
                c = mix(c, mix(P["d_snow_shade"], P["d_snow"], inl), 0.4 + 0.5 * snow)
            return _haze(c, cp, extra_haze)
        return fn

    # the blocky summit tower (left of centre): steep stratified walls on a broad snowy shoulder
    a = -0.28
    cx, _, cz = _at(a, 60.0, 0.0)
    rings = [_peak_ring(cx, cz, 20.0, 7.0, 28.0, 12, rng, 0.08, 0.3)]
    rings.append(_peak_ring(cx, cz, 17.0, 6.0, 42.0, 12, rng, 0.08, 0.3))  # snowy shoulder
    rings.append(_peak_ring(cx + 1.0, cz - 0.5, 11.0, 4.2, 46.0, 12, rng, 0.08, 0.3))
    rings.append(_peak_ring(cx + 1.0, cz - 0.5, 10.2, 3.9, 55.0, 12, rng, 0.08, 0.3))  # tower walls
    rings.append(_peak_ring(cx + 1.2, cz - 0.5, 9.4, 3.6, 56.0, 12, rng, 0.08, 0.3))
    rings.append(_peak_ring(cx + 1.4, cz - 0.6, 8.4, 3.2, 65.0, 12, rng, 0.08, 0.3))
    rings.append(_peak_ring(cx + 1.4, cz - 0.6, 6.0, 2.4, 67.0, 12, rng, 0.12, 0.3))  # flat-ish top
    _loft(m, rings, colour(0.08, 40.0))
    # the stratified pyramid (right): ledges ring by ring up to a sharp summit
    a = 0.42
    cx, _, cz = _at(a, 59.0, 0.0)
    rings = []
    for k, (rx, y) in enumerate(((22.0, 24.0), (17.5, 34.0), (16.3, 35.0), (12.5, 44.0), (11.3, 45.0), (7.5, 54.0),
                                  (6.3, 55.0), (2.5, 61.0))):
        rings.append(_peak_ring(cx, cz, rx, rx * 0.55, y, 9, rng, 0.07, 1.1))
    rings.append([(cx + 0.6, 65.0, cz - 0.5)] * 9)
    _loft(m, rings, colour(0.1, 33.0))
    return m


def build_forest(rng: Rng) -> MeshData:
    """Two rows of far conifer tips in the valley's shade (golden larches among the spruces)."""
    m = MeshData()
    sun = _sun()
    span = math.radians(FOREST["span"])
    n = FOREST["teeth"]
    for row, (R, hmin, hmax) in enumerate(((FOREST["radius"], 6.0, 11.5), (FOREST["radius"] + 5.5, 7.5, 13.0))):
        for i in range(n if row == 0 else n * 2 // 3):
            nn = n if row == 0 else n * 2 // 3
            a = -span + 2 * span * (i + rng.uniform(0.1, 0.9)) / nn
            r = R + rng.uniform(-2.5, 3.0)
            x, _, z = _at(a, r, 0.0)
            ground = site.ground_y(x, z) + (0.0 if row == 0 else 1.5)
            h = rng.uniform(hmin, hmax)
            w = rng.uniform(1.2, 2.0) * (r / R)
            larch = rng.random() < (0.18 if row == 0 else 0.3)
            da = w / r
            prof = [(0.0, 1.0), (0.42, 0.66), (0.24, 0.62), (0.78, 0.33), (0.5, 0.3), (1.0, 0.08), (0.95, -0.12)]
            jit = [(1.0 + rng.jitter(0.12), rng.jitter(0.03)) for _ in prof]
            left = [_at(a - da * px * jx, r, ground + h * (py + jy)) for (px, py), (jx, jy) in zip(prof, jit)]
            right = [_at(a + da * px * jx, r, ground + h * (py + jy * 0.7)) for (px, py), (jx, jy) in zip(prof, jit)]
            lit = _lit(left[5], right[5], left[0], sun)
            if larch:
                c = mix(P["d_larch_far"], P["d_forest_far"], 0.35)
            else:
                c = mix(P["d_forest_far"], P["d_forest_far_lit"], 0.12 * (0.5 + lit))
            c = scale(c, 1.0 + rng.jitter(0.1))
            hz = 0.05 + 0.06 * row
            top_c = mix(c, P["d_sky_horizon"], hz)
            body_c = mix(scale(c, 0.82), P["d_sky_horizon"], hz + 0.02)
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
    m.append(build_slopes(Rng(SEED + 2)))
    m.append(build_peaks(Rng(SEED + 3)))
    m.append(build_forest(Rng(SEED + 1)))
    o = to_object(m, "backdrop", palette_material())
    triangulate(o)
    return [o]
