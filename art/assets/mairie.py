"""
mairie.glb: the town hall that closes the far end of the square, centred on the court axis in the
far row of houses (facade at z = -16, between the houses at |x| = 3.4, see houses.py).

A small, symmetrical Provencal mairie: pale limestone, a rusticated (grooved) ground floor with a
wide arched door up a few steps, a moulded band course (dentils) above it, a balcony with an iron
railing on the first floor, tall windows in stone surrounds, a full-width pediment with a clock, a bell gable (clocher-mur) with its bell on
the ridge, and two clipped bay trees in boxes by the steps.

It is the backdrop behind the jack in the aim view, so the parts low and on the axis stay mid-dark
(grey-stone rustication, steps, a deep green door) and nothing bright yellow sits there.
Game coordinates, one object, one shared vertex-colour material.
"""
from __future__ import annotations

import math

from lib.building import quad, tri
from lib.materials import palette_material
from lib.mesh import MeshData, box, icosphere, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.props import cylinder
from lib.rand import Rng, fbm

NAME = "mairie"

FAR_Z = -16.0       # facade line (keep in sync with houses.py FAR_Z)
HALF_W = 3.4        # half width = the gap left between the far-row houses (houses.py GAP_HALF)
DEPTH = 10.0
SINK = 0.25         # walls continue below the ground
G = 4.05            # ground floor height (rusticated)
F1 = 3.7            # first floor height
ENT = 0.55          # entablature (frieze + cornice) above the first floor
PED_RISE = 1.75     # pediment height
STEP_N, STEP_RISE, STEP_RUN, STEP_HALF_W = 3, 0.15, 0.36, 1.55
DOOR_W, DOOR_H = 1.8, 2.35            # door width, height of the straight part
DOOR_RISE = 0.55                      # rise of the basket-handle (elliptical) arch on top
DOOR_SPRING = STEP_N * STEP_RISE + DOOR_H
VOUSSOIR = 0.28                       # depth of the stone arch ring around the door

# Colours (all from the palette). Pale limestone above, a darker grey stone low down on the axis.
STONE = mix(P["limestone"], P["cream"], 0.25)
STONE_TRIM = mix(P["cream"], P["limestone"], 0.2)
RUSTIC = mix(P["limestone"], P["stone_grey"], 0.5)
GROOVE = scale(mix(P["stone_grey"], P["limestone_dark"], 0.5), 0.62)
STEP = mix(P["stone_grey"], P["limestone_dark"], 0.4)
DOOR = scale(mix(P["olive_dark"], P["shutter_teal"], 0.35), 0.8)    # deep green double door
JOINERY = mix(P["shutter_blue"], P["stone_grey"], 0.55)              # grey-blue window frames

PREVIEW = {
    "views": [
        # roughly the in-game aim view (camera behind the throwing circle, looking down the court)
        ("aim", (0.0, 2.3, 7.0), (0.0, 3.2, -16.0), 30),
        ("front", (0.0, 5.0, -4.0), (0.0, 6.0, -16.0), 38),
        ("flight", (1.2, 1.4, -5.5), (0.0, 7.5, -16.0), 30),
    ],
    "ground_size": 0.0,
    # rendered together with its neighbours, to judge it in place (not exported with it)
    "context": ["court", "houses", "cafe", "props"],
}


# --- small geometry helpers ---------------------------------------------------------------------

def prism(m: MeshData, pts, z0: float, z1: float, color, side_color=None, back: bool = False) -> None:
    """Extrude a convex polygon given counter-clockwise in the x-y plane from z0 (back) to z1 (front)."""
    front = [m.add_vert((x, y, z1)) for x, y in pts]
    m.add_face(tuple(front), color)
    n = len(pts)
    for k in range(n):
        (xa, ya), (xb, yb) = pts[k], pts[(k + 1) % n]
        quad(m, (xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1), side_color or color)
    if back:
        m.add_face(tuple(m.add_vert((x, y, z0)) for x, y in reversed(pts)), side_color or color)


def disc(m: MeshData, cx, cy, z, r, n, color) -> None:
    """Flat n-gon facing +Z."""
    m.add_face(tuple(m.add_vert((cx + r * math.cos(math.tau * k / n), cy + r * math.sin(math.tau * k / n), z))
                     for k in range(n)), color)


def ring(m: MeshData, cx, cy, z0, z1, r0, r1, n, color, side_color=None) -> None:
    """Flat annulus (r0..r1) facing +Z at z1, with an outer rim back to z0."""
    for k in range(n):
        a0, a1 = math.tau * k / n, math.tau * (k + 1) / n
        p = lambda r, a, z: (cx + r * math.cos(a), cy + r * math.sin(a), z)  # noqa: E731
        quad(m, p(r0, a0, z1), p(r1, a0, z1), p(r1, a1, z1), p(r0, a1, z1), color)
        quad(m, p(r1, a0, z1), p(r1, a0, z0), p(r1, a1, z0), p(r1, a1, z1), side_color or color)


def arch_pts(cx, y_spring, r, n=6, rise=None):
    """Points of a semicircular (or, with `rise`, elliptical) arch from the right springing point to the left one."""
    ry = r if rise is None else rise
    return [(cx + r * math.cos(math.pi * k / n), y_spring + ry * math.sin(math.pi * k / n)) for k in range(n + 1)]


def jit(c, rng: Rng, a=0.04):
    return scale(c, 1.0 + rng.jitter(a))


# --- walls ---------------------------------------------------------------------------------------

def _door_hole(y: float) -> float:
    """Half width of the hole the grooved wall leaves for the door arch (inside the voussoir band)."""
    r = DOOR_W / 2 + VOUSSOIR / 2
    ry = DOOR_RISE + VOUSSOIR / 2
    ys = DOOR_SPRING
    if y <= ys:
        return r
    return r * math.sqrt(max(0.0, 1.0 - ((y - ys) / ry) ** 2))


def _wall_piece(m: MeshData, xa, xb, ya, yb, z, color) -> None:
    """Wall quad from xa..xb, ya..yb with the door hole cut out (as trapezoids)."""
    ha, hb = _door_hole(ya), _door_hole(yb)
    if ha <= 0.0 and hb <= 0.0:
        quad(m, (xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z), color)
        return
    # left of the hole
    la, lb = min(xb, -ha), min(xb, -hb)
    if la > xa + 0.005 or lb > xa + 0.005:
        quad(m, (xa, ya, z), (max(xa, la), ya, z), (max(xa, lb), yb, z), (xa, yb, z), color)
    ra, rb = max(xa, ha), max(xa, hb)
    if ra < xb - 0.005 or rb < xb - 0.005:
        quad(m, (min(xb, ra), ya, z), (xb, ya, z), (xb, yb, z), (min(xb, rb), yb, z), color)


def _rusticated_ground(m: MeshData, rng: Rng) -> None:
    """Grooved stone courses (bossage), a dark joint under each, and a plinth."""
    rows = 8
    y0, y1 = 0.5, G - 0.35
    h = (y1 - y0) / rows
    for r in range(rows):
        ya, yb = y0 + r * h, y0 + (r + 1) * h
        x = -HALF_W
        long = r % 2 == 0
        while x < HALF_W - 0.01:
            ln = min(1.25 if long else 0.85, HALF_W - x)
            long = not long
            c = jit(mix(RUSTIC, STONE, 0.15 + 0.3 * fbm(x * 0.6, ya * 0.6, 0, 31, 2)), rng, 0.035)
            c = scale(c, 1.0 - 0.08 * (1 - r / rows))                     # dusty foot
            _wall_piece(m, x, x + ln, ya + 0.045, yb, 0.0, c)
            _wall_piece(m, x, x + ln, ya, ya + 0.045, -0.02, GROOVE)
            x += ln
    # below the first course: plinth of big grey blocks (either side of the door)
    hw = DOOR_W / 2
    for sx in (-1, 1):
        m.append(box(sx * (HALF_W + hw) / 2, (0.5 - SINK) / 2, 0.04, HALF_W - hw, 0.5 + SINK, 0.08, jit(STEP, rng),
                     top_color=jit(mix(STEP, STONE, 0.4), rng)))
    # top course under the band (plain)
    _wall_piece(m, -HALF_W, HALF_W, y1, G, 0.0, jit(scale(RUSTIC, 1.03), rng))


def _upper_wall(m: MeshData, rng: Rng) -> None:
    """Smooth ashlar first floor + frieze, weathered in a coarse grid, shaded under the cornice."""
    nx, ny = 6, 4
    ya, yb = G, G + F1 + ENT - 0.25
    for j in range(ny):
        for i in range(nx):
            x0 = -HALF_W + 2 * HALF_W * i / nx
            x1 = -HALF_W + 2 * HALF_W * (i + 1) / nx
            y0 = ya + (yb - ya) * j / ny
            y1 = ya + (yb - ya) * (j + 1) / ny
            n = fbm((x0 + x1) * 0.4, (y0 + y1) * 0.4, 0, 33, 2)
            c = mix(STONE, P["cream"], max(0.0, n - 0.55) * 0.8)
            c = mix(c, P["limestone_dark"], max(0.0, 0.42 - n) * 0.9)
            c = scale(c, 1.0 - 0.14 * (j == ny - 1))
            quad(m, (x0, y0, 0.0), (x1, y0, 0.0), (x1, y1, 0.0), (x0, y1, 0.0), jit(c, rng, 0.02))


def _pilasters(m: MeshData, rng: Rng) -> None:
    """Flat pilasters at the corners and either side of the central bay; quoined on the ground floor."""
    for cx, w in ((-HALF_W + 0.2, 0.4), (HALF_W - 0.2, 0.4), (-1.42, 0.3), (1.42, 0.3)):
        # ground floor: alternating long/short quoin blocks proud of the grooved wall
        y = 0.5
        k = 0
        while y < G - 0.4:
            hh = 0.48
            ww = w + (0.12 if k % 2 == 0 else 0.0)
            m.append(box(cx, y + hh / 2, 0.05, ww, hh - 0.05, 0.1, jit(mix(RUSTIC, STONE, 0.45), rng, 0.04)))
            y += hh
            k += 1
        # first floor: plain shaft + capital
        m.append(box(cx, G + F1 / 2 + 0.1, 0.04, w, F1 - 0.1, 0.08, jit(STONE_TRIM, rng, 0.03)))
        m.append(box(cx, G + F1 - 0.02, 0.06, w + 0.12, 0.14, 0.12, jit(STONE_TRIM, rng, 0.03), bottom=True))


def _band_and_cornice(m: MeshData, rng: Rng) -> None:
    # band course between the floors: a plain frieze with a bead below, a sunk fillet line and a row
    # of dentils under the moulded top
    W = 2 * HALF_W + 0.1
    m.append(box(0, G - 0.15, 0.06, W, 0.44, 0.12, jit(STONE_TRIM, rng, 0.02)))
    m.append(box(0, G - 0.34, 0.09, W + 0.06, 0.08, 0.18, jit(scale(STONE_TRIM, 1.03), rng, 0.02), bottom=True))
    quad(m, (-W / 2, G - 0.2, 0.121), (W / 2, G - 0.2, 0.121), (W / 2, G - 0.17, 0.121), (-W / 2, G - 0.17, 0.121),
         scale(STONE_TRIM, 0.72))
    n = round(W / 0.24)
    for k in range(n):
        x = -W / 2 + W * (k + 0.5) / n
        m.append(box(x, G - 0.03, 0.15, 0.11, 0.1, 0.06, jit(STONE_TRIM, rng, 0.03), bottom=True))
    m.append(box(0, G + 0.1, 0.1, 2 * HALF_W + 0.2, 0.12, 0.2, jit(scale(STONE_TRIM, 1.04), rng, 0.02), bottom=True))
    # entablature: frieze is the wall; architrave fillet + projecting cornice with a dark soffit
    top = G + F1 + ENT
    m.append(box(0, G + F1 + 0.08, 0.05, 2 * HALF_W, 0.16, 0.1, jit(STONE_TRIM, rng, 0.02)))
    m.append(box(0, top - 0.17, 0.12, 2 * HALF_W + 0.2, 0.12, 0.24, jit(STONE_TRIM, rng, 0.02), bottom=True))
    m.append(box(0, top - 0.04, 0.2, 2 * HALF_W + 0.36, 0.16, 0.4, jit(scale(STONE_TRIM, 1.05), rng, 0.02), bottom=True))
    # shadow line under the cornice
    quad(m, (-HALF_W, top - 0.3, 0.005), (HALF_W, top - 0.3, 0.005), (HALF_W, top - 0.23, 0.005),
         (-HALF_W, top - 0.23, 0.005), scale(STONE, 0.7))


# --- openings ------------------------------------------------------------------------------------

def _glass(m: MeshData, x0, x1, y0, y1, z, rng: Rng) -> None:
    g = P["glass"]
    hi = mix(g, P["shutter_blue"], 0.35)
    tri(m, (x0, y0, z), (x1, y0, z), (x0, y1, z), jit(g, rng, 0.04))
    tri(m, (x1, y0, z), (x1, y1, z), (x0, y1, z), jit(hi, rng, 0.04))


def _window(m: MeshData, cx, sill, w, h, rng: Rng, hood: bool, rail: bool, transom: float = 0.72) -> None:
    """Tall window: dark panes, grey-blue casement frame (mullion + transom), stone surround."""
    x0, x1 = cx - w / 2, cx + w / 2
    _glass(m, x0, x1, sill, sill + h, 0.006, rng)
    # shadow of the lintel on the panes (the panes read as set back in the wall)
    quad(m, (x0, sill + h - 0.22, 0.008), (x1, sill + h - 0.12, 0.008), (x1, sill + h, 0.008), (x0, sill + h, 0.008),
         scale(P["glass"], 0.7))
    # casement frame
    f = jit(JOINERY, rng, 0.03)
    m.append(box(cx, sill + h / 2, 0.025, 0.06, h, 0.03, f))
    m.append(box(cx, sill + h * transom, 0.025, w, 0.06, 0.03, f))
    for x in (x0 + 0.03, x1 - 0.03):
        m.append(box(x, sill + h / 2, 0.025, 0.06, h, 0.03, f))
    m.append(box(cx, sill + h - 0.03, 0.025, w, 0.06, 0.03, f))
    # stone surround: jambs, lintel with keystone, sill
    s = jit(STONE_TRIM, rng, 0.03)
    for x in (x0 - 0.08, x1 + 0.08):
        m.append(box(x, sill + h / 2, 0.03, 0.16, h, 0.06, s))
    m.append(box(cx, sill + h + 0.09, 0.03, w + 0.32, 0.18, 0.06, s))
    m.append(box(cx, sill + h + 0.11, 0.06, 0.2, 0.26, 0.06, scale(s, 1.04)))
    m.append(box(cx, sill - 0.05, 0.07, w + 0.4, 0.1, 0.14, s, bottom=True))
    if hood:  # small cornice on consoles
        m.append(box(cx, sill + h + 0.28, 0.1, w + 0.5, 0.1, 0.2, scale(s, 1.05), bottom=True))
    if rail:  # low iron guard rail (garde-corps) across the lower part
        iron = P["iron"]
        m.append(box(cx, sill + 0.75, 0.1, w + 0.1, 0.04, 0.04, iron))
        m.append(box(cx, sill + 0.15, 0.1, w + 0.1, 0.03, 0.03, iron))
        for k in range(6):
            x = x0 + w * (k + 0.5) / 6
            m.append(box(x, sill + 0.45, 0.1, 0.025, 0.6, 0.025, iron))


def _door(m: MeshData, rng: Rng) -> None:
    """Wide arched double door in a recessed stone arch (voussoirs + keystone), fanlight on top."""
    w, h_rect = DOOR_W, DOOR_H
    r = w / 2
    y_spring = DOOR_SPRING
    base = STEP_N * STEP_RISE
    rec = -0.22
    # recess sides + soffit (dark, in shade)
    shade = scale(RUSTIC, 0.6)
    quad(m, (-r, base, 0.0), (-r, base, rec), (-r, y_spring, rec), (-r, y_spring, 0.0), shade)
    quad(m, (r, base, rec), (r, base, 0.0), (r, y_spring, 0.0), (r, y_spring, rec), shade)
    rise = DOOR_RISE
    pts = arch_pts(0.0, y_spring, r, 8, rise)
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        quad(m, (xa, ya, 0.0), (xb, yb, 0.0), (xb, yb, rec), (xa, ya, rec), scale(shade, 0.85))
    quad(m, (-r, base, 0.0), (r, base, 0.0), (r, base, rec), (-r, base, rec), mix(STEP, P["limestone"], 0.45))  # threshold
    # door leaves: two panelled leaves
    m.append(box(0, base + h_rect / 2, rec + 0.02, w, h_rect, 0.04, DOOR))
    for sx in (-1, 1):
        cx = sx * w / 4
        for yc, hh in ((base + h_rect * 0.66, h_rect * 0.48), (base + h_rect * 0.2, h_rect * 0.26)):
            m.append(box(cx, yc, rec + 0.05, w / 2 - 0.22, hh, 0.03, scale(DOOR, 1.25)))
        m.append(box(cx - sx * 0.12, base + h_rect * 0.48, rec + 0.08, 0.05, 0.05, 0.04, P["iron"]))  # knob
    m.append(box(0, base + h_rect / 2, rec + 0.05, 0.05, h_rect, 0.04, scale(DOOR, 0.7)))         # meeting stile
    m.append(box(0, y_spring - 0.04, rec + 0.04, w, 0.08, 0.05, scale(DOOR, 0.9)))               # transom bar
    # fanlight: dark glass half disc with iron rays
    fan = [(0.0, y_spring)] + arch_pts(0.0, y_spring, r, 8, rise)
    m.add_face(tuple(m.add_vert((x, y, rec + 0.01)) for x, y in _ccw(fan)), scale(P["glass"], 1.1))
    for k in range(1, 4):
        a = math.pi * k / 4
        x1, y1 = r * 0.95 * math.cos(a), rise * 0.95 * math.sin(a)
        mx, my = x1 / 2, y_spring + y1 / 2
        ln = math.hypot(x1, y1)
        local = box(0, 0, 0, ln, 0.035, 0.02, P["iron"])
        ca, sa = x1 / ln, y1 / ln
        m.append(local.transformed(lambda v, mx=mx, my=my, ca=ca, sa=sa: (mx + v[0] * ca - v[1] * sa, my + v[0] * sa + v[1] * ca,
                                                                            rec + 0.03 + v[2])))
    # surround: jambs + voussoirs + keystone, proud of the grooved wall
    s = jit(mix(STONE_TRIM, RUSTIC, 0.25), rng, 0.03)
    for sx in (-1, 1):
        m.append(box(sx * (r + VOUSSOIR / 2), (base + y_spring) / 2, 0.06, VOUSSOIR, y_spring - base, 0.12, s))
    n = 9
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        key = 0.05 if k == n // 2 else 0.0
        e = lambda a, d: (math.cos(a) * (r + d), y_spring + math.sin(a) * (rise + d))  # noqa: E731
        p = [e(a0, 0.0), e(a0, VOUSSOIR + key), e(a1, VOUSSOIR + key), e(a1, 0.0)]
        prism(m, _ccw(p), 0.0, 0.12 + (0.04 if key else 0.0), jit(s, rng, 0.03), scale(s, 0.8))
    # wall lanterns either side
    for sx in (-1, 1):
        x = sx * 1.42
        y = 2.9
        iron = P["iron"]
        m.append(box(x, y - 0.05, 0.22, 0.04, 0.04, 0.3, iron))
        m.append(box(x, y - 0.25, 0.38, 0.2, 0.3, 0.2, mix(P["cream"], P["ochre_light"], 0.3)))
        m.append(box(x, y - 0.08, 0.38, 0.26, 0.05, 0.26, iron, bottom=True))
        m.append(box(x, y - 0.42, 0.38, 0.22, 0.04, 0.22, iron, bottom=True))


def _steps(m: MeshData, rng: Rng) -> None:
    for k in range(STEP_N):
        y_top = (k + 1) * STEP_RISE
        depth = (STEP_N - k) * STEP_RUN
        hw = STEP_HALF_W - 0.06 * k
        c = jit(STEP, rng, 0.03)
        m.append(box(0, (y_top - 0.1) / 2, depth / 2, 2 * hw, y_top + 0.1, depth, c,
                     top_color=jit(mix(STEP, P["limestone"], 0.45), rng, 0.03)))


# --- balcony ---------------------------------------------------------------------------------------

def _balcony(m: MeshData, rng: Rng) -> None:
    w, out, y = 3.0, 0.75, G + 0.16
    iron = P["iron"]
    m.append(box(0, y - 0.08, out / 2, w, 0.16, out, jit(STONE_TRIM, rng, 0.02), bottom=True))
    # consoles at the ends
    for sx in (-1, 1):
        m.append(box(sx * 1.32, y - 0.32, 0.25, 0.18, 0.32, 0.5, jit(STONE_TRIM, rng, 0.03)))
    # railing: top rail, bottom rail, bars, and a simple lozenge pattern in the middle
    m.append(box(0, y + 0.95, out - 0.04, w - 0.04, 0.05, 0.05, iron))
    m.append(box(0, y + 0.12, out - 0.04, w - 0.04, 0.04, 0.04, iron))
    for sx in (-1, 1):
        m.append(box(sx * (w / 2 - 0.03), y + 0.95, out / 2, 0.05, 0.05, out, iron))
        m.append(box(sx * (w / 2 - 0.03), y + 0.5, out - 0.04, 0.05, 0.9, 0.05, iron))
        m.append(box(sx * (w / 2 - 0.03), y + 0.5, 0.05, 0.05, 0.9, 0.05, iron))
    n = 13
    for k in range(1, n):
        x = -w / 2 + w * k / n
        m.append(box(x, y + 0.53, out - 0.04, 0.025, 0.82, 0.025, iron))
    for sx in (-1, 1):
        m.append(box(sx * w / 4, y + 0.53, out - 0.03, 0.7, 0.03, 0.03, iron))


# --- pediment, clock, roof, bell gable ---------------------------------------------------------

def _pediment(m: MeshData, rng: Rng) -> float:
    """Full-width pediment with raking cornices and a clock in the tympanum. Returns the apex y."""
    yb = G + F1 + ENT
    hw = HALF_W + 0.18
    apex = yb + PED_RISE
    # tympanum (recessed a little behind the cornice line)
    tri(m, (-HALF_W, yb, 0.0), (HALF_W, yb, 0.0), (0.0, apex - 0.1, 0.0), jit(scale(STONE, 0.95), rng, 0.02))
    # raking cornices: sloped slabs along both edges
    th, out = 0.26, 0.42
    for sx in (-1, 1):
        x_eave = sx * (hw + 0.02)
        pts = [(x_eave, yb - 0.05), (0.0, apex - 0.18), (0.0, apex + th - 0.05), (x_eave, yb - 0.05 + th)]
        pts = _ccw(pts)
        prism(m, pts, -0.3, out - 0.2, jit(scale(STONE_TRIM, 1.04), rng, 0.02), scale(STONE_TRIM, 0.78))
    # clock: stone ring, cream dial, hour marks, hands (ten past five)
    cy = yb + 0.72
    ring(m, 0.0, cy, 0.0, 0.08, 0.5, 0.64, 16, jit(STONE_TRIM, rng, 0.02), scale(STONE_TRIM, 0.8))
    disc(m, 0.0, cy, 0.04, 0.5, 16, mix(P["cream"], P["canvas_white"], 0.5))
    ring(m, 0.0, cy, 0.04, 0.05, 0.44, 0.5, 16, scale(P["iron"], 1.2))
    for k in range(12):
        a = math.pi / 2 - math.tau * k / 12
        r0, r1 = (0.33, 0.43) if k % 3 == 0 else (0.38, 0.43)
        wdt = 0.035 if k % 3 == 0 else 0.02
        ca, sa = math.cos(a), math.sin(a)
        px, py = -sa * wdt, ca * wdt
        quad(m, (r0 * ca - px, cy + r0 * sa - py, 0.055), (r1 * ca - px, cy + r1 * sa - py, 0.055),
             (r1 * ca + px, cy + r1 * sa + py, 0.055), (r0 * ca + px, cy + r0 * sa + py, 0.055), P["iron"])
    for ang, ln, wdt in ((math.pi / 2 - math.tau * (5 + 10 / 60) / 12, 0.24, 0.035),
                         (math.pi / 2 - math.tau * 10 / 60, 0.38, 0.022)):
        ca, sa = math.cos(ang), math.sin(ang)
        px, py = -sa * wdt, ca * wdt
        quad(m, (-0.06 * ca - px, cy - 0.06 * sa - py, 0.065), (ln * ca - px, cy + ln * sa - py, 0.065),
             (ln * ca + px, cy + ln * sa + py, 0.065), (-0.06 * ca + px, cy - 0.06 * sa + py, 0.065), P["iron"])
    disc(m, 0.0, cy, 0.07, 0.04, 6, P["iron"])
    return apex


def _ccw(pts):
    area = sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1] for k in range(len(pts)))
    return pts if area > 0 else list(reversed(pts))


def _roof_and_body(m: MeshData, rng: Rng, apex: float) -> None:
    """Side walls, back gable and a two-slope tiled roof with its ridge along the court axis."""
    yb = G + F1 + ENT
    D = DEPTH
    side = scale(STONE, 0.95)
    for sx in (-1, 1):
        x = sx * HALF_W
        a, b, c, d = (x, -SINK, 0.0), (x, -SINK, -D), (x, yb, -D), (x, yb, 0.0)
        if sx > 0:
            quad(m, a, b, c, d, jit(side, rng, 0.03))
        else:
            quad(m, b, a, d, c, jit(side, rng, 0.03))
    quad(m, (HALF_W, -SINK, -D), (-HALF_W, -SINK, -D), (-HALF_W, yb, -D), (HALF_W, yb, -D), scale(side, 0.9))
    tri(m, (HALF_W, yb, -D), (-HALF_W, yb, -D), (0.0, apex - 0.1, -D), scale(side, 0.9))
    # roof slopes in tile courses (bands parallel to the eave), from just behind the pediment
    tile = P["terracotta"]
    ov = 0.25
    courses = 5
    segs = 5
    z_front, z_back = -0.25, -D - 0.3
    for sx in (-1, 1):
        for k in range(courses):
            f0, f1 = k / courses, (k + 1) / courses
            x0 = sx * (HALF_W + ov) * (1 - f0)
            x1 = sx * (HALF_W + ov) * (1 - f1)
            y0 = yb - ov * PED_RISE / HALF_W + (apex - 0.02 - yb + ov * PED_RISE / HALF_W) * f0
            y1 = yb - ov * PED_RISE / HALF_W + (apex - 0.02 - yb + ov * PED_RISE / HALF_W) * f1
            for s in range(segs):
                za = z_front + (z_back - z_front) * s / segs
                zb = z_front + (z_back - z_front) * (s + 1) / segs
                n = fbm(x0 * 0.7, za * 0.5, 0, 37, 2)
                c = mix(tile, P["terracotta_light"], max(0.0, n - 0.55) * 2.0)
                c = mix(c, P["terracotta_dark"], max(0.0, 0.42 - n) * 2.0)
                c = jit(c, rng, 0.05)
                if sx > 0:
                    quad(m, (x0, y0 + 0.05, za), (x0, y0 + 0.05, zb), (x1, y1, zb), (x1, y1, za), c)
                else:
                    quad(m, (x0, y0 + 0.05, zb), (x0, y0 + 0.05, za), (x1, y1, za), (x1, y1, zb), c)
    m.append(box(0, apex + 0.04, (z_front + z_back) / 2, 0.28, 0.14, z_front - z_back, jit(P["terracotta_dark"], rng),
                 top_color=jit(scale(tile, 0.95), rng)))


def _bell_gable(m: MeshData, rng: Rng, apex: float) -> None:
    """Clocher-mur on the ridge just behind the pediment: a pierced wall with one bell, a small gable cap."""
    z0, z1 = -0.75, -0.35
    w, hw = 1.7, 0.85
    y0 = apex - 0.9
    y_open0, y_open1 = apex + 0.15, apex + 1.35
    r = 0.36
    y_top = y_open1 + r + 0.35
    s = jit(STONE_TRIM, rng, 0.02)
    sd = scale(STONE_TRIM, 0.8)
    # piers
    for sx in (-1, 1):
        xa, xb = sorted((sx * hw, sx * r))
        prism(m, [(xa, y0), (xb, y0), (xb, y_open1), (xa, y_open1)], z0, z1, s, sd, back=True)
    # sill under the opening
    prism(m, [(-r, y0), (r, y0), (r, y_open0), (-r, y_open0)], z0, z1, s, sd, back=True)
    # arch head: the block above the springing with a semicircular hole (as wedge pieces)
    n = 6
    pts = arch_pts(0.0, y_open1, r, n)
    for k in range(n):
        (xa, ya), (xb, yb) = pts[k], pts[k + 1]
        prism(m, _ccw([(xa, ya), (xb, yb), (xb, y_top), (xa, y_top)]), z0, z1, s, sd, back=True)
    # the corner fills beside the arch (between |x| = r and hw, from the springing to the top)
    for sx in (-1, 1):
        xa, xb = sorted((sx * hw, sx * r))
        prism(m, [(xa, y_open1), (xb, y_open1), (xb, y_top), (xa, y_top)], z0, z1, s, sd, back=True)
    # cornice + gable cap + iron finial
    m.append(box(0, y_top + 0.06, (z0 + z1) / 2, w + 0.2, 0.12, z1 - z0 + 0.16, scale(s, 1.04), bottom=True))
    prism(m, [(-hw - 0.1, y_top + 0.12), (hw + 0.1, y_top + 0.12), (0.0, y_top + 0.62)], z0 - 0.08, z1 + 0.08,
          scale(s, 1.02), sd, back=True)
    iron = P["iron"]
    # weathervane: spike, ball, and a small pennant plate on one side (not a cross: this is the mairie)
    zc = (z0 + z1) / 2
    m.append(box(0, y_top + 1.0, zc, 0.04, 0.8, 0.04, iron))
    cylinder(m, 0.0, zc, y_top + 0.66, y_top + 0.8, 0.08, 0.08, 6, iron)
    m.append(box(0.22, y_top + 1.18, zc, 0.38, 0.2, 0.02, iron))
    prism(m, _ccw([(-0.24, y_top + 1.16), (0.0, y_top + 1.12), (0.0, y_top + 1.2)]), zc - 0.01, zc + 0.01, iron, back=True)
    # the bell (dark bronze), its yoke and wheel axle
    bronze = scale(mix(P["ochre_dark"], P["timber_dark"], 0.5), 0.75)
    bz = (z0 + z1) / 2
    by = y_open1 + 0.05
    cylinder(m, 0.0, bz, by - 0.55, by - 0.1, 0.27, 0.15, 8, bronze, cap=False)
    cylinder(m, 0.0, bz, by - 0.1, by, 0.15, 0.06, 8, bronze)
    cylinder(m, 0.0, bz, by - 0.6, by - 0.55, 0.3, 0.27, 8, scale(bronze, 0.85), cap=False)
    m.append(box(0, by + 0.04, bz, 2 * r + 0.04, 0.08, 0.1, P["timber_dark"]))


# --- bay trees ---------------------------------------------------------------------------------

def _bay_tree(m: MeshData, x: float, z: float, rng: Rng) -> None:
    """Clipped bay laurel ball on a stem, in a painted wooden planter box."""
    box_col = scale(mix(P["olive_dark"], P["shutter_teal"], 0.35), 0.95)
    m.append(box(x, 0.32, z, 0.62, 0.64, 0.62, box_col, top_color=P["earth_dark"]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.append(box(x + sx * 0.3, 0.36, z + sz * 0.3, 0.08, 0.72, 0.08, scale(box_col, 0.8)))
            m.append(box(x + sx * 0.3, 0.74, z + sz * 0.3, 0.1, 0.06, 0.1, mix(P["ochre_dark"], P["stone_grey"], 0.5)))
    cylinder(m, x, z, 0.62, 1.25, 0.04, 0.035, 5, P["bark_dark"], cap=False)
    verts, faces = icosphere(1)
    base = len(m.verts)
    R, cy = 0.46, 1.6
    for v in verts:
        j = 1.0 + rng.jitter(0.06)
        m.verts.append((x + v[0] * R * j, cy + v[1] * R * j, z + v[2] * R * j))
    for f in faces:
        fc = tuple(base + i for i in f)
        ny = sum(m.verts[i][1] for i in fc) / 3 - cy
        c = mix(P["leaf_dark"], P["leaf_mid"], max(0.0, ny / R) * 0.7)
        m.add_face(fc, jit(c, rng, 0.04), smooth=True)


def build():
    rng = Rng(17)
    mat = palette_material()
    m = MeshData()
    _rusticated_ground(m, rng)
    _upper_wall(m, rng)
    _pilasters(m, rng)
    _band_and_cornice(m, rng)
    _door(m, rng)
    _steps(m, rng)
    for sx in (-1, 1):
        x = sx * 2.3
        _window(m, x, 0.95, 0.95, 2.25, rng, hood=False, rail=False)
        _window(m, x, G + 0.6, 0.95, 2.3, rng, hood=True, rail=True)
    _window(m, 0.0, G + 0.18, 1.2, 2.85, rng, hood=True, rail=False, transom=0.78)
    _balcony(m, rng)
    apex = _pediment(m, rng)
    _roof_and_body(m, rng, apex)
    _bell_gable(m, rng, apex)
    m = m.transformed(lambda v: (v[0], v[1], v[2] + FAR_Z))
    for sx in (-1, 1):
        _bay_tree(m, sx * 2.25, FAR_Z + 0.75, rng)
    o = to_object(m, "mairie", mat)
    triangulate(o)
    return [o]
