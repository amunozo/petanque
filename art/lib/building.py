"""
Low-poly Provencal house builder (shared by the village assets).

A house is modelled in a LOCAL frame: the facade runs along +X from x=0 to x=width, faces +Z
(toward the square) at z=0, the body goes back to z=-depth, and the ground is y=0. `place()`
moves the finished MeshData into game coordinates (translation + rotation about Y).

Details, all flat per-face colours from the shared palette: weathered render in a coarse grid
(darker under the eaves and at the foot = baked ambient occlusion), stone plinth, optional corner
quoins, framed windows with painted shutters (open or closed), doors, window boxes with
geraniums, small wrought-iron balconies, a stepped "genoise" eave, and a low-pitched terracotta
roof made of overlapping tile courses with a ridge cap.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .mesh import MeshData, box, icosphere
from .palette import Color, P, mix, scale
from .rand import Rng, fbm

GROUND_FLOOR_H = 3.3
UPPER_FLOOR_H = 2.85
PARAPET = 0.4           # wall above the top floor windows, up to the eave
SINK = 0.25             # walls continue below ground (the square is not perfectly flat)


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


@dataclass
class HouseSpec:
    width: float
    depth: float = 7.0
    floors: int = 2
    render: str = "render_ochre"
    shutter: str = "shutter_sage"
    door_slot: int = 0                 # which window slot of the ground floor is the door (-1: none)
    door_color: str | None = None      # None = same as the shutters
    quoins: bool = False
    window_boxes: float = 0.25         # probability per upper window
    closed: float = 0.35               # probability a shutter pair is closed
    balcony_slot: int = -1             # first-floor slot with a small balcony (-1: none)
    roof_rise: float = 1.1
    shop: str | None = None            # "cafe": glazed shopfront + striped awning on the ground floor
    awning: tuple[str, str] = ("canvas_red", "canvas_white")
    left_gable: bool = True            # draw the side walls / gable triangles (False when hidden by a neighbour)
    right_gable: bool = True
    seed: int = 1
    slots: int = 0                     # windows per floor (0 = from the width)
    extra: dict = field(default_factory=dict)


def place(m: MeshData, origin: tuple[float, float, float], yaw_deg: float) -> MeshData:
    """Rotate about +Y by yaw (local +Z -> world (sin yaw, 0, cos yaw)), then translate."""
    a = math.radians(yaw_deg)
    c, s = math.cos(a), math.sin(a)
    ox, oy, oz = origin
    return m.transformed(lambda v: (ox + v[0] * c + v[2] * s, oy + v[1], oz - v[0] * s + v[2] * c))


def quad(m: MeshData, a, b, c, d, color: Color) -> None:
    """Quad a-b-c-d, counter-clockwise seen from the side it faces."""
    i = [m.add_vert(p) for p in (a, b, c, d)]
    m.add_face(tuple(i), color)


def tri(m: MeshData, a, b, c, color: Color) -> None:
    i = [m.add_vert(p) for p in (a, b, c)]
    m.add_face(tuple(i), color)


def jit(c: Color, rng: Rng, amount: float = 0.04) -> Color:
    return scale(c, 1.0 + rng.jitter(amount))


def house_height(spec: HouseSpec) -> float:
    return GROUND_FLOOR_H + UPPER_FLOOR_H * (spec.floors - 1) + PARAPET


def _slots(spec: HouseSpec) -> list[float]:
    n = spec.slots or max(1, round(spec.width / 2.1))
    return [(i + 0.5) * spec.width / n for i in range(n)]


# --- walls --------------------------------------------------------------------------------

def _facade(m: MeshData, spec: HouseSpec, rng: Rng, H: float) -> None:
    """Front wall as a coarse grid of render patches (weathering + baked eave/foot shading)."""
    base = P[spec.render]
    nx = max(2, round(spec.width / 1.2))
    ny = max(3, round((H + SINK) / 1.1))
    xs = [spec.width * i / nx for i in range(nx + 1)]
    ys = [-SINK + (H + SINK) * j / ny for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            n = fbm(cx * 0.45 + spec.seed * 3.1, cy * 0.45, 0.0, spec.seed, 2)
            c = mix(base, P["cream"], _ss(0.6, 0.85, n) * 0.2)         # sun-bleached patches
            c = mix(c, P["ochre_dark"], _ss(0.4, 0.15, n) * 0.14)       # stained patches
            c = scale(c, 1.0 - 0.06 * _ss(1.2, 0.0, cy))                # dusty foot (eave shade is baked)
            quad(m, (xs[i], ys[j], 0.0), (xs[i + 1], ys[j], 0.0), (xs[i + 1], ys[j + 1], 0.0), (xs[i], ys[j + 1], 0.0),
                 jit(c, rng, 0.012))
    # Stone plinth along the foot.
    m.append(box(spec.width / 2, (0.45 - SINK) / 2, 0.02, spec.width, 0.45 + SINK, 0.04,
                 jit(mix(P["stone_grey"], base, 0.35), rng), top_color=jit(mix(P["limestone"], base, 0.3), rng)))


def _sides_and_back(m: MeshData, spec: HouseSpec, rng: Rng, H: float, rise: float) -> None:
    w, d = spec.width, spec.depth
    side = scale(P[spec.render], 0.97)
    ridge_z = -d / 2
    if spec.left_gable:
        quad(m, (0, -SINK, -d), (0, -SINK, 0), (0, H, 0), (0, H, -d), jit(side, rng, 0.03))
        tri(m, (0, H, -d), (0, H, 0), (0, H + rise, ridge_z), jit(side, rng, 0.03))
    if spec.right_gable:
        quad(m, (w, -SINK, 0), (w, -SINK, -d), (w, H, -d), (w, H, 0), jit(side, rng, 0.03))
        tri(m, (w, H, 0), (w, H, -d), (w, H + rise, ridge_z), jit(side, rng, 0.03))
    quad(m, (w, -SINK, -d), (0, -SINK, -d), (0, H, -d), (w, H, -d), jit(scale(side, 0.9), rng, 0.03))


def _quoins(m: MeshData, spec: HouseSpec, rng: Rng, H: float) -> None:
    stone = P["limestone"]
    y = 0.45
    k = 0
    while y + 0.32 < H - 0.3:
        long = k % 2 == 0
        for x0, sgn in ((0.0, 1), (spec.width, -1)):
            wdt = 0.55 if long else 0.32
            m.append(box(x0 + sgn * wdt / 2, y + 0.16, 0.015, wdt, 0.3, 0.03, jit(stone, rng, 0.05)))
        y += 0.34
        k += 1


# --- openings -------------------------------------------------------------------------------

def _glass(m: MeshData, x0, x1, y0, y1, z, rng: Rng, warm: bool = False) -> None:
    """
    Window pane, split diagonally: a lighter upper triangle reads as a sky reflection. `warm` panes
    (the cafe) show a lit interior instead of a dark room.
    """
    g = mix(P["glass"], P["timber"], 0.75) if warm else P["glass"]
    hi = mix(g, P["ochre_light"], 0.35) if warm else mix(g, P["shutter_blue"], 0.35)
    tri(m, (x0, y0, z), (x1, y0, z), (x0, y1, z), jit(g, rng, 0.05))
    tri(m, (x1, y0, z), (x1, y1, z), (x0, y1, z), jit(hi, rng, 0.05))


def _shutter(m: MeshData, cx, y0, w, h, z, color: Color, rng: Rng) -> None:
    """A painted shutter (box) with two darker slat bands on its face."""
    t = 0.04
    m.append(box(cx, y0 + h / 2, z + t / 2, w, h, t, color))
    for f in (0.3, 0.68):
        yy = y0 + h * f
        quad(m, (cx - w / 2 + 0.04, yy, z + t + 0.002), (cx + w / 2 - 0.04, yy, z + t + 0.002),
             (cx + w / 2 - 0.04, yy + 0.05, z + t + 0.002), (cx - w / 2 + 0.04, yy + 0.05, z + t + 0.002), scale(color, 0.8))


def _window(m: MeshData, cx: float, sill: float, w: float, h: float, spec: HouseSpec, rng: Rng,
            closed: bool, flower_box: bool) -> None:
    frame = jit(mix(P["limestone"], P["cream"], 0.5), rng, 0.04)
    sh = jit(P[spec.shutter], rng, 0.05)
    x0, x1 = cx - w / 2, cx + w / 2
    _glass(m, x0, x1, sill, sill + h, 0.006, rng)
    # frame: lintel, jambs, protruding sill
    m.append(box(cx, sill + h + 0.07, 0.03, w + 0.24, 0.14, 0.06, frame))
    m.append(box(x0 - 0.06, sill + h / 2, 0.025, 0.12, h, 0.05, frame))
    m.append(box(x1 + 0.06, sill + h / 2, 0.025, 0.12, h, 0.05, frame))
    m.append(box(cx, sill - 0.04, 0.06, w + 0.3, 0.08, 0.12, frame))
    if closed:
        _shutter(m, cx - w / 4, sill, w / 2 - 0.01, h, 0.05, sh, rng)
        _shutter(m, cx + w / 4, sill, w / 2 - 0.01, h, 0.05, sh, rng)
    else:
        _shutter(m, x0 - 0.12 - w / 4, sill, w / 2, h, 0.0, sh, rng)
        _shutter(m, x1 + 0.12 + w / 4, sill, w / 2, h, 0.0, sh, rng)
    if flower_box:
        bw = w + 0.1
        m.append(box(cx, sill - 0.2, 0.2, bw, 0.18, 0.2, jit(P["terracotta"], rng)))
        verts, faces = icosphere(0)
        for k in range(3):
            fx = cx - bw / 2 + bw * (k + 0.5) / 3 + rng.jitter(0.05)
            r = 0.13 + rng.jitter(0.02)
            col = P["geranium"] if k != 1 or rng.random() < 0.5 else P["lavender"]
            base = len(m.verts)
            for v in verts:
                m.verts.append((fx + v[0] * r, sill - 0.06 + v[1] * r * 0.8, 0.22 + v[2] * r))
            for f in faces:
                fc = tuple(base + i for i in f)
                ny = sum(m.verts[i][1] for i in fc) / 3 - (sill - 0.06)
                m.add_face(fc, jit(col if ny > -0.02 else P["leaf_dark"], rng, 0.04), smooth=True)


def _door(m: MeshData, cx: float, spec: HouseSpec, rng: Rng) -> None:
    w, h = 1.05, 2.35
    col = jit(P[spec.door_color or spec.shutter], rng, 0.04)
    frame = jit(mix(P["limestone"], P["cream"], 0.4), rng, 0.04)
    m.append(box(cx, h / 2, 0.03, w, h, 0.03, scale(col, 0.95)))
    # two raised panels
    for dx in (-w / 4, w / 4):
        m.append(box(cx + dx, h * 0.62, 0.05, w / 2 - 0.14, h * 0.5, 0.02, col))
        m.append(box(cx + dx, h * 0.2, 0.05, w / 2 - 0.14, h * 0.25, 0.02, col))
    # transom light + stone surround with a keystone
    _glass(m, cx - w / 2, cx + w / 2, h, h + 0.45, 0.006, rng)
    m.append(box(cx, h + 0.55, 0.035, w + 0.36, 0.2, 0.07, frame))
    m.append(box(cx - w / 2 - 0.09, (h + 0.45) / 2, 0.03, 0.18, h + 0.45, 0.06, frame))
    m.append(box(cx + w / 2 + 0.09, (h + 0.45) / 2, 0.03, 0.18, h + 0.45, 0.06, frame))
    m.append(box(cx, 0.06, 0.18, w + 0.4, 0.12, 0.36, jit(P["limestone_dark"], rng)))  # step


def _balcony(m: MeshData, cx: float, floor_y: float, rng: Rng) -> None:
    w, dz = 1.6, 0.6
    iron = P["iron"]
    m.append(box(cx, floor_y - 0.05, dz / 2, w, 0.1, dz, jit(P["limestone"], rng), bottom=True))
    # rail + a few bars
    m.append(box(cx, floor_y + 0.9, dz - 0.02, w, 0.04, 0.04, iron))
    for sx in (-1, 1):
        m.append(box(cx + sx * (w / 2 - 0.02), floor_y + 0.9, dz / 2, 0.04, 0.04, dz, iron))
    for k in range(7):
        x = cx - w / 2 + 0.02 + (w - 0.04) * k / 6
        m.append(box(x, floor_y + 0.45, dz - 0.02, 0.025, 0.9, 0.025, iron))


def _cafe_front(m: MeshData, spec: HouseSpec, rng: Rng) -> None:
    """Glazed shopfront across most of the ground floor + striped awning + a sign board."""
    w = spec.width
    x0, x1 = 0.35, w - 0.35
    h = 2.6
    frame = jit(P[spec.shutter], rng, 0.03)
    _glass(m, x0, x1, 0.4, h, 0.006, rng, warm=True)
    m.append(box((x0 + x1) / 2, 0.2, 0.04, x1 - x0, 0.4, 0.08, frame))       # stall riser
    # glazed double door in the middle
    m.append(box(w / 2, 1.15, 0.05, 1.3, 2.3, 0.04, scale(frame, 0.85)))
    _glass(m, w / 2 - 0.55, w / 2 + 0.55, 0.15, 2.15, 0.075, rng, warm=True)
    m.append(box(w / 2, 1.15, 0.08, 0.06, 2.0, 0.02, frame))
    m.append(box((x0 + x1) / 2, h + 0.06, 0.04, x1 - x0 + 0.1, 0.12, 0.08, frame))
    n = max(2, round((x1 - x0) / 1.3))
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        m.append(box(x, h / 2, 0.04, 0.09, h, 0.08, frame))
    # sign board
    m.append(box(w / 2, h + 0.55, 0.05, min(3.2, w - 1.0), 0.5, 0.06, jit(P["olive_dark"], rng)))
    m.append(box(w / 2, h + 0.55, 0.085, min(2.4, w - 1.6), 0.18, 0.01, P["cream"]))
    # striped awning: sloped panel from the wall out to 1.9 m, with a scalloped-less valance
    y_top, y_low, out = h + 0.3, h - 0.25, 1.9
    stripes = max(6, round((x1 - x0) / 0.38))
    for k in range(stripes):
        xa = x0 - 0.1 + (x1 - x0 + 0.2) * k / stripes
        xb = x0 - 0.1 + (x1 - x0 + 0.2) * (k + 1) / stripes
        col = P[spec.awning[k % 2]]
        quad(m, (xa, y_low, out), (xb, y_low, out), (xb, y_top, 0.0), (xa, y_top, 0.0), jit(col, rng, 0.03))
        quad(m, (xb, y_low, out), (xa, y_low, out), (xa, y_top, 0.0), (xb, y_top, 0.0), scale(col, 0.6))  # underside
        quad(m, (xa, y_low - 0.22, out), (xb, y_low - 0.22, out), (xb, y_low, out), (xa, y_low, out), jit(col, rng, 0.03))
    # awning side cheeks
    for x in (x0 - 0.1, x1 + 0.1):
        tri(m, (x, y_low, out), (x, y_top, 0.0), (x, y_low, 0.0), scale(P[spec.awning[0]], 0.85))
        tri(m, (x, y_low, out), (x, y_low, 0.0), (x, y_top, 0.0), scale(P[spec.awning[0]], 0.85))


# --- roof --------------------------------------------------------------------------------------

def _roof(m: MeshData, spec: HouseSpec, rng: Rng, H: float, rise: float) -> None:
    """Low-pitched canal-tile roof: overlapping courses on the front slope, plain back slope."""
    w, d = spec.width, spec.depth
    ov_front, ov_back, ov_side = 0.42, 0.3, 0.12
    half = d / 2
    slope = rise / half
    ridge_y = H + rise
    eave_y = H - ov_front * slope
    xa, xb = -ov_side, w + ov_side
    courses = 6
    segs = max(2, round((xb - xa) / 1.1))
    lift = 0.06
    tile = P["terracotta"]
    for k in range(courses):
        t0, t1 = k / courses, (k + 1) / courses
        z0 = ov_front + (-half - ov_front) * t0
        z1 = ov_front + (-half - ov_front) * t1
        y0 = eave_y + (ridge_y - eave_y) * t0
        y1 = eave_y + (ridge_y - eave_y) * t1
        for s in range(segs):
            x0 = xa + (xb - xa) * s / segs
            x1 = xa + (xb - xa) * (s + 1) / segs
            n = fbm(x0 * 0.7 + spec.seed, k * 0.6, 0.0, spec.seed + 5, 2)
            c = mix(tile, P["terracotta_light"], _ss(0.55, 0.8, n) * 0.7)
            c = mix(c, P["terracotta_dark"], _ss(0.4, 0.15, n) * 0.6)
            c = mix(c, P["ochre"], 0.15 if rng.random() < 0.08 else 0.0)  # a few lichen-y, paler tiles
            c = jit(c, rng, 0.05)
            # the lower edge of each course sits proud of the course below (shingle step)
            quad(m, (x0, y0 + lift, z0), (x1, y0 + lift, z0), (x1, y1, z1), (x0, y1, z1), c)
            quad(m, (x0, y0, z0), (x1, y0, z0), (x1, y0 + lift, z0), (x0, y0 + lift, z0), scale(c, 0.62))
    # back slope (seen only from above / far away)
    zb = -d - ov_back
    yb = H - ov_back * slope
    quad(m, (xb, yb, zb), (xa, yb, zb), (xa, ridge_y, -half), (xb, ridge_y, -half), jit(scale(tile, 0.85), rng))
    # ridge cap
    m.append(box((xa + xb) / 2, ridge_y + 0.06, -half, xb - xa + 0.04, 0.14, 0.26, jit(P["terracotta_dark"], rng),
                 top_color=jit(scale(P["terracotta"], 0.95), rng)))
    # soffit under the front overhang and the gable verges
    soffit = scale(P["timber_dark"], 0.9)
    quad(m, (xb, eave_y, ov_front), (xa, eave_y, ov_front), (xa, H, 0.0), (xb, H, 0.0), soffit)
    for x, sgn in ((xa, -1), (xb, 1)):
        # verge: the thick end of the roof plane over the gable
        a, b = (x, eave_y + lift, ov_front), (x, ridge_y + lift, -half)
        c2, d2 = (x, ridge_y - 0.1, -half), (x, eave_y - 0.1, ov_front)
        if sgn < 0:
            quad(m, a, d2, c2, b, scale(tile, 0.7))
        else:
            quad(m, a, b, c2, d2, scale(tile, 0.7))
        a, b = (x, yb + lift, zb), (x, ridge_y + lift, -half)
        c2, d2 = (x, ridge_y - 0.1, -half), (x, yb - 0.1, zb)
        if sgn < 0:
            quad(m, a, b, c2, d2, scale(tile, 0.7))
        else:
            quad(m, a, d2, c2, b, scale(tile, 0.7))
    # genoise: three stepped courses under the eave, each further out
    for k, (dy, out, key) in enumerate(((0.36, 0.08, "terracotta"), (0.24, 0.18, "cream"), (0.12, 0.3, "terracotta_dark"))):
        m.append(box(w / 2, H - dy + 0.06, out / 2, w, 0.12, out, jit(P[key], rng, 0.03), bottom=True))


# --- house ---------------------------------------------------------------------------------------

def build_house(spec: HouseSpec) -> MeshData:
    rng = Rng(spec.seed)
    m = MeshData()
    H = house_height(spec)
    rise = spec.roof_rise
    _facade(m, spec, rng, H)
    _sides_and_back(m, spec, rng, H, rise)
    if spec.quoins:
        _quoins(m, spec, rng, H)
    slots = _slots(spec)
    # ground floor
    if spec.shop == "cafe":
        _cafe_front(m, spec, rng)
    else:
        for i, x in enumerate(slots):
            if i == spec.door_slot:
                _door(m, x, spec, rng)
            else:
                _window(m, x, 0.95, 0.95, 1.4, spec, rng, rng.random() < spec.closed, False)
    # upper floors
    for f in range(1, spec.floors):
        fy = GROUND_FLOOR_H + UPPER_FLOOR_H * (f - 1)
        for i, x in enumerate(slots):
            if f == 1 and i == spec.balcony_slot:
                _balcony(m, x, fy, rng)
                _window(m, x, fy + 0.05, 0.9, 2.0, spec, rng, False, False)  # french window
                continue
            _window(m, x, fy + 0.85, 0.85, 1.3, spec, rng, rng.random() < spec.closed, rng.random() < spec.window_boxes)
    _roof(m, spec, rng, H, rise)
    return m
