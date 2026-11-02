"""
chalet.glb (derborence): the old Valais log chalet (blockbau) on its terrace behind the far end.

Modelled in a local frame (gable front facing +Z at z = 0, width along X centred on 0, body back to
z = -DEPTH, terrace level y = 0), then placed at site.CHALET on the terrace. Flat shaded, colours
from the palette:
  - a pale grey stone foundation (irregular blocks a little proud of darker mortar)
  - walls of dark weathered squared logs in courses with shadowed grooves, the log ends stacked
    out at the corners (lighter end grain)
  - the gable front: a wide band of four pale honey shutters (louvred above, boarded below) on the
    ground floor, a white frieze with a row of small tabs at the eaves line, two small shuttered
    windows in the gable and the carved beam "1920" between them
  - a low-pitched dark roof with standing seams and wide eaves, plank soffits, purlin ends with
    brackets under the gable overhang, a stone chimney
  - a plank bench along the foundation; smaller shuttered windows and a door on the sides
No satellite dish, no tarps.
"""
from __future__ import annotations

from lib.alpine import weld
from lib.building import place
from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

from . import site

NAME = "chalet"
SEED = 503

W = site.CHALET["w"]     # 7.6
DEPTH = site.CHALET["d"]  # 9.2
FOUND = 1.0              # stone foundation height above the terrace
SINK = 0.45              # below the terrace (the ground undulates)
COURSE = 0.21            # log course height
EAVE = 4.05              # top of the side walls
RISE = 2.25              # gable rise (eaves -> ridge)
OH_FRONT = 1.15          # roof overhang at the gable front / back
OH_SIDE = 0.85           # at the eaves
ROOF_T = 0.14

PREVIEW = {
    "views": [
        ("front", (-2.0, 3.4, -5.5), (-2.6, 3.6, -15.6), 34),
        ("court", (0.0, 2.3, 7.0), (-1.5, 3.0, -15.6), 30),
        ("side", (6.0, 4.0, -9.0), (-2.6, 3.0, -19.0), 32),
    ],
    "context": ["terrain"],
    "ground_size": 0.0,
}


def _ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


class Frame:
    """A wall's local frame: s along the wall (to the right seen from outside), y up, `out` outward."""

    def __init__(self, origin, ux) -> None:
        self.o = origin
        self.ux = ux
        self.n = (ux[1] * 0 - ux[2] * 1, ux[2] * 0 - ux[0] * 0, ux[0] * 1 - ux[1] * 0)  # ux x up

    def p(self, s, y, out):
        o, u, n = self.o, self.ux, self.n
        return (o[0] + u[0] * s + n[0] * out, o[1] + y, o[2] + u[2] * s + n[2] * out)

    def quad(self, m: MeshData, s0, y0, s1, y1, out, col, y0b=None, y1b=None) -> None:
        """Rect (or trapezoid: right-hand edge heights y0b..y1b) at depth `out`, facing outward."""
        y0b = y0 if y0b is None else y0b
        y1b = y1 if y1b is None else y1b
        i = [m.add_vert(self.p(s, y, out)) for s, y in ((s0, y0), (s1, y0b), (s1, y1b), (s0, y1))]
        m.add_face(tuple(i), col)

    def box(self, m: MeshData, s0, y0, s1, y1, out0, out1, col, top=None, bottom: bool = True, end=None,
            ends=None) -> None:
        """A box proud of the wall, from depth out0 to out1 (local box -> frame). `end`: colour of its
        outward face; `ends`: (colour of the -s face, colour of the +s face) or None each."""
        b = box((s0 + s1) / 2, (y0 + y1) / 2, (out0 + out1) / 2, s1 - s0, y1 - y0, out1 - out0, col, bottom=bottom,
                top_color=top)
        if end is not None:
            b.colors[1] = end  # the +out face (index 1 is +z in mesh.box)
        if ends is not None:
            if ends[0] is not None:
                b.colors[4] = ends[0]  # -x
            if ends[1] is not None:
                b.colors[3] = ends[1]  # +x
        m.append(b.transformed(lambda v: self.p(v[0], v[1], v[2])))


def log_tone(rng: Rng, s: float, course: int, seed: int):
    """Dark weathered larch / spruce logs: brown-black with grey sun-bleached streaks."""
    n = fbm(s * 0.6, course * 0.35, 0.0, seed, 2)
    c = mix(P["d_chalet"], P["d_chalet_grey"], _ss(0.5, 0.75, n) * 0.7)
    c = mix(c, P["d_chalet_dark"], _ss(0.45, 0.25, n) * 0.6)
    return scale(c, 1.0 + rng.jitter(0.07))


def build_walls(m: MeshData, rng: Rng) -> None:
    hw = W / 2
    walls = [
        Frame((-hw, 0.0, 0.0), (1.0, 0.0, 0.0)),            # front (gable), faces +Z
        Frame((hw, 0.0, 0.0), (0.0, 0.0, -1.0)),            # right side, faces +X
        Frame((hw, 0.0, -DEPTH), (-1.0, 0.0, 0.0)),         # back (gable), faces -Z
        Frame((-hw, 0.0, -DEPTH), (0.0, 0.0, 1.0)),         # left side, faces -X
    ]
    lengths = [W, DEPTH, W, DEPTH]
    for wi, (f, L) in enumerate(zip(walls, lengths)):
        gable = wi in (0, 2)
        # foundation: pale stone blocks in rough courses over darker mortar
        f.quad(m, 0.0, -SINK, L, FOUND, -0.015, scale(P["d_stone_wall_dark"], 0.8))
        y = -SINK
        row = 0
        while y < FOUND - 0.02:
            h = min(rng.uniform(0.2, 0.32), FOUND - y)
            s = -rng.uniform(0.0, 0.2) if row % 2 else 0.0
            while s < L:
                w = rng.uniform(0.3, 0.62)
                s0, s1 = max(0.0, s + 0.012), min(L, s + w - 0.012)
                if s1 - s0 > 0.05:
                    c = mix(P["d_stone_wall"], P["d_stone_wall_dark"], rng.random() * 0.55)
                    c = mix(c, P["d_rock"], rng.random() * 0.25)
                    f.quad(m, s0, y + 0.012, s1, y + h - 0.012, rng.uniform(0.0, 0.025), scale(c, 1 + rng.jitter(0.05)))
                s += w
            y += h
            row += 1
        # top of the foundation: a slightly proud sill
        f.box(m, -0.05, FOUND - 0.06, L + 0.05, FOUND, 0.0, 0.07, P["d_stone_wall_dark"], top=P["d_stone_wall"])
        # log courses
        top = EAVE + (RISE if gable else 0.0)
        c_i = 0
        y = FOUND
        while y < top - 0.02:
            y1 = min(y + COURSE, top)
            if gable and y >= EAVE - 1e-6:
                # gable courses follow the roof slope
                k0 = 1.0 - (y - EAVE) / RISE
                k1 = 1.0 - (y1 - EAVE) / RISE
                a0, a1 = L / 2 - hw * k0, L / 2 - hw * k1
                if hw * k1 < 0.05:
                    break
                seg_edges = [a0] + [x for x in _segs(rng, a0, L - a0)] + [L - a0]
            else:
                a0 = a1 = 0.0
                seg_edges = [0.0] + _segs(rng, 0.0, L) + [L]
            for sa, sb in zip(seg_edges, seg_edges[1:]):
                col = log_tone(rng, (sa + sb) / 2, c_i, SEED + wi)
                if gable and y >= EAVE - 1e-6:
                    # trapezoid ends at the slope (left edge sa..a1 side, right edge)
                    l_top = max(sa, a1) if sa <= a1 + 1e-6 else sa
                    r_top = min(sb, L - a1) if sb >= L - a1 - 1e-6 else sb
                    _course_trap(m, f, sa, sb, l_top, r_top, y, y1, col)
                else:
                    f.quad(m, sa, y + 0.035, sb, y1, 0.0, col)
                    f.quad(m, sa, y, sb, y + 0.035, -0.02, scale(col, 0.5))   # shadowed groove
            y = y1
            c_i += 1
        # corner log ends (alternate courses run along this wall and stick out past its ends)
        if True:
            y = FOUND
            c_i = 0
            while y < EAVE - 0.02:
                y1 = min(y + COURSE, EAVE)
                if c_i % 2 == wi % 2:
                    for s_end, sgn in ((0.0, -1.0), (L, 1.0)):
                        ext = rng.uniform(0.16, 0.24)
                        s0, s1 = (s_end - ext, s_end) if sgn < 0 else (s_end, s_end + ext)
                        col = log_tone(rng, s_end, c_i, SEED + 9)
                        endc = mix(P["d_chalet_grey"], P["d_log_end"], 0.35)
                        f.box(m, s0, y + 0.01, s1, y1 - 0.005, -0.21, 0.0, col, top=scale(col, 1.1),
                              ends=(endc, None) if sgn < 0 else (None, endc))
                y = y1
                c_i += 1


def _segs(rng: Rng, a: float, b: float) -> list[float]:
    """Inner split points of a course (logs are not one tone along their whole length)."""
    out = []
    s = a + rng.uniform(0.6, 1.4)
    while s < b - 0.4:
        out.append(s)
        s += rng.uniform(0.7, 1.6)
    return out


def _course_trap(m, f: Frame, sa, sb, lt, rt, y0, y1, col) -> None:
    i = [m.add_vert(f.p(s, y, 0.0)) for s, y in ((sa, y0), (sb, y0), (rt, y1), (lt, y1))]
    m.add_face(tuple(i), col)
    f.quad(m, sa, y0, sb, y0 + 0.03, -0.02, scale(col, 0.5))


def shutter(m: MeshData, f: Frame, s0, y0, w, h, rng: Rng, louvres: bool = True) -> None:
    """One closed shutter leaf: honey frame, louvred upper half (slats), boarded lower half."""
    base = scale(mix(P["d_shutter"], P["d_shutter_dark"], rng.random() * 0.35), 1 + rng.jitter(0.04))
    dark = scale(P["d_shutter_dark"], 0.8)
    f.box(m, s0, y0, s0 + w, y0 + h, 0.0, 0.045, base)
    fr = 0.06
    if louvres:
        ym = y0 + h * 0.48
        n = max(4, int((y0 + h - fr - ym) / 0.07))
        for k in range(n):
            ya = ym + (y0 + h - fr - ym) * k / n
            yb = ym + (y0 + h - fr - ym) * (k + 1) / n
            f.quad(m, s0 + fr, ya, s0 + w - fr, ya + (yb - ya) * 0.45, 0.047, dark)
            f.quad(m, s0 + fr, ya + (yb - ya) * 0.45, s0 + w - fr, yb, 0.05, scale(base, 1.12))
        top_lower = ym - 0.02
    else:
        top_lower = y0 + h - fr
    # boards of the lower panel
    nb = 3
    for k in range(nb):
        sa = s0 + fr + (w - 2 * fr) * k / nb
        sb = s0 + fr + (w - 2 * fr) * (k + 1) / nb
        f.quad(m, sa + 0.006, y0 + fr, sb - 0.006, top_lower, 0.049, scale(base, 0.95 + 0.1 * rng.random()))


def window(m: MeshData, f: Frame, sc, y0, w, h, leaves: int, rng: Rng, louvres: bool = True) -> None:
    """Window opening framed in honey wood, closed by `leaves` shutters."""
    frame = scale(P["d_shutter_dark"], 0.85)
    f.box(m, sc - w / 2 - 0.08, y0 - 0.08, sc + w / 2 + 0.08, y0 + h + 0.08, 0.0, 0.03, frame)
    f.box(m, sc - w / 2 - 0.12, y0 - 0.14, sc + w / 2 + 0.12, y0 - 0.06, 0.0, 0.1, frame, top=scale(frame, 1.15))
    lw = w / leaves
    for k in range(leaves):
        shutter(m, f, sc - w / 2 + lw * k + 0.006, y0, lw - 0.012, h, rng, louvres)


def digit_strokes(ch: str):
    """7-segment strokes of a digit: (x0, y0, x1, y1) in a unit cell 1 wide x 2 tall."""
    seg = {
        "a": (0.0, 1.85, 1.0, 2.0), "b": (0.85, 1.0, 1.0, 2.0), "c": (0.85, 0.0, 1.0, 1.0),
        "d": (0.0, 0.0, 1.0, 0.15), "e": (0.0, 0.0, 0.15, 1.0), "f": (0.0, 1.0, 0.15, 2.0),
        "g": (0.0, 0.93, 1.0, 1.08),
    }
    lit = {"1": "bc", "9": "abcdfg", "2": "abged", "0": "abcdef"}[ch]
    return [seg[k] for k in lit]


def build_gable_details(m: MeshData, rng: Rng) -> None:
    hw = W / 2
    f = Frame((-hw, 0.0, 0.0), (1.0, 0.0, 0.0))
    # the wide band of four shutters (two windows side by side), slightly right of centre
    sc = hw + 0.25
    window(m, f, sc - 0.72, 1.62, 1.3, 1.32, 2, rng)
    window(m, f, sc + 0.72, 1.62, 1.3, 1.32, 2, rng)
    # white frieze at the eaves line with a row of small tabs standing on it
    yf = EAVE - 0.32
    f.box(m, 0.2, yf, W - 0.2, yf + 0.13, 0.0, 0.07, P["d_white"], top=P["d_white"])
    s = 0.35
    while s < W - 0.4:
        f.box(m, s, yf + 0.13, s + 0.07, yf + 0.22, 0.02, 0.07, scale(P["d_white"], 0.96), top=P["d_white"])
        s += 0.19
    # two small shuttered windows in the gable
    for dx in (-1.3, 1.3):
        window(m, f, hw + dx, EAVE + 0.32, 0.62, 0.7, 2, rng, louvres=False)
    # the carved beam with "1920" between them
    yb = EAVE + 0.72
    beam = scale(P["d_chalet_dark"], 1.1)
    f.box(m, hw - 0.82, yb, hw + 0.82, yb + 0.3, 0.0, 0.08, beam, top=scale(beam, 1.2))
    dh = 0.2
    dw = 0.1
    x = hw - (4 * dw + 3 * 0.06) / 2
    for ch in "1920":
        for (x0, y0, x1, y1) in digit_strokes(ch):
            f.box(m, x + x0 * dw, yb + 0.05 + y0 * dh / 2, x + max(x1 * dw, x0 * dw + 0.02), yb + 0.05 + y1 * dh / 2,
                  0.08, 0.087, scale(P["d_white"], 0.88))
        x += dw + 0.06
    # a wooden bench on the terrace along the foundation (pale, newer planks)
    plank = P["d_plank"]
    b0, b1 = sc - 1.25, sc + 1.25
    for k in range(2):  # seat planks
        f.box(m, b0, 0.42, b1, 0.47, 0.08 + 0.17 * k, 0.24 + 0.17 * k, scale(plank, 0.95 + 0.08 * k),
              top=scale(plank, 1.08))
    for xx in (b0 + 0.15, b1 - 0.2):  # legs
        f.box(m, xx, 0.0, xx + 0.06, 0.42, 0.12, 0.38, scale(plank, 0.8))
    for k in range(3):  # backrest boards against the foundation
        f.box(m, b0, 0.5 + 0.16 * k, b1, 0.64 + 0.16 * k, 0.02, 0.05, scale(plank, 0.92 + 0.06 * (k % 2)),
              top=scale(plank, 1.1))


def build_side_details(m: MeshData, rng: Rng) -> None:
    hw = W / 2
    right = Frame((hw, 0.0, 0.0), (0.0, 0.0, -1.0))
    for s in (2.2, 6.4):
        window(m, right, s, 1.75, 0.8, 1.0, 2, rng)
    window(m, right, 4.3, EAVE - 1.25, 0.6, 0.62, 2, rng, louvres=False)
    left = Frame((-hw, 0.0, -DEPTH), (0.0, 0.0, 1.0))
    window(m, left, 3.0, 1.75, 0.8, 1.0, 2, rng)
    # door near the front of the left side, two steps up to it
    door = scale(P["d_chalet_dark"], 1.15)
    ds = DEPTH - 1.6
    left.box(m, ds - 0.55, FOUND - 0.05, ds + 0.55, FOUND + 1.95, 0.0, 0.04, scale(P["d_shutter_dark"], 0.8))
    left.box(m, ds - 0.45, FOUND, ds + 0.45, FOUND + 1.85, 0.02, 0.06, door)
    for k in range(4):
        left.quad(m, ds - 0.42 + 0.21 * k + 0.01, FOUND + 0.06, ds - 0.42 + 0.21 * (k + 1) - 0.01, FOUND + 1.8, 0.062,
                  scale(door, 0.9 + 0.12 * (k % 2)))
    for k in range(2):
        h = FOUND * (2 - k) / 3
        left.box(m, ds - 0.6, -0.1, ds + 0.6, h, 0.0, 0.32 + 0.3 * (1 - k), P["d_stone_wall_dark"],
                 top=P["d_stone_wall"])


def build_roof(m: MeshData, rng: Rng) -> None:
    hw = W / 2
    slope = RISE / hw
    ridge_y = EAVE + RISE + 0.22
    z0, z1 = OH_FRONT, -DEPTH - OH_FRONT
    xe = hw + OH_SIDE
    ye = ridge_y - slope * xe
    roof = P["d_roof"]
    for side in (-1, 1):
        # covering: standing-seam strips down the slope
        n = 18
        for k in range(n):
            za = z0 + (z1 - z0) * k / n
            zb = z0 + (z1 - z0) * (k + 1) / n
            c = scale(roof, 1.0 + (0.06 if k % 2 else -0.03) + rng.jitter(0.03))
            c = mix(c, P["d_rock_dark"], _ss(0.6, 0.8, fbm(k * 0.4, side, 0, SEED + 5, 2)) * 0.25)
            pts = [(0.0, ridge_y, za), (0.0, ridge_y, zb), (side * xe, ye, zb), (side * xe, ye, za)]
            if side > 0:
                pts = [pts[0], pts[3], pts[2], pts[1]]
            m.add_face(tuple(m.add_vert(p) for p in pts), c)
        # soffit (underside): dark planks along the slope
        under = scale(P["d_chalet"], 0.85)
        t = ROOF_T
        for k in range(10):
            za = z0 + (z1 - z0) * k / 10
            zb = z0 + (z1 - z0) * (k + 1) / 10
            pts = [(0.0, ridge_y - t, za), (side * xe, ye - t, za), (side * xe, ye - t, zb), (0.0, ridge_y - t, zb)]
            if side > 0:
                pts = [pts[0], pts[3], pts[2], pts[1]]
            m.add_face(tuple(m.add_vert(p) for p in pts), scale(under, 1.0 + rng.jitter(0.08)))
        # fascia along the eave
        pts = [(side * xe, ye - t, z0), (side * xe, ye - t, z1), (side * xe, ye + 0.02, z1), (side * xe, ye + 0.02, z0)]
        if side < 0:
            pts = [pts[0], pts[3], pts[2], pts[1]]
        m.add_face(tuple(m.add_vert(p) for p in pts), scale(P["d_roof_edge"], 0.9))
        # verge boards along the gable edges (front and back)
        for zz, sgn in ((z0, 1), (z1, -1)):
            pts = [(0.0, ridge_y - t - 0.1, zz), (side * xe, ye - t - 0.1, zz), (side * xe, ye + 0.02, zz),
                   (0.0, ridge_y + 0.02, zz)]
            if (side > 0) != (sgn > 0):
                pts = [pts[0], pts[3], pts[2], pts[1]]
            m.add_face(tuple(m.add_vert(p) for p in pts), scale(P["d_chalet_dark"], 1.1))
    # ridge cap
    m.append(box(0.0, ridge_y + 0.03, (z0 + z1) / 2, 0.24, 0.06, z0 - z1, scale(P["d_roof_edge"], 0.9)))
    # purlins under the gable overhang (front), with simple brackets under them at the wall
    for xp in (0.0, -hw * 0.5, hw * 0.5, -hw + 0.1, hw - 0.1):
        yt = ridge_y - ROOF_T - slope * abs(xp)
        m.append(box(xp, yt - 0.11, OH_FRONT / 2 - 0.05, 0.16, 0.22, OH_FRONT - 0.1, scale(P["d_chalet"], 0.95)))
        m.append(box(xp, yt - 0.42, 0.18, 0.12, 0.3, 0.36, scale(P["d_chalet_dark"], 1.05)))
    # chimney: rendered stone with a slab on top, right of the ridge toward the back
    cx, cz = hw * 0.45, -DEPTH * 0.62
    yb = ridge_y - slope * (cx - 0.25)
    m.append(box(cx, yb + 0.4, cz, 0.55, 1.4, 0.55, scale(P["d_stone_wall"], 0.95), top_color=scale(P["d_roof"], 0.6)))
    m.append(box(cx, yb + 1.17, cz, 0.72, 0.07, 0.72, scale(P["d_stone_wall_dark"], 0.9)))


def build():
    rng = Rng(SEED)
    m = MeshData()
    build_walls(m, rng)
    build_gable_details(m, rng)
    build_side_details(m, rng)
    build_roof(m, rng)
    cx, cz = site.CHALET["x"], site.CHALET["z"]
    placed = place(m, (cx, site.terrace_y(), cz), site.CHALET["yaw"])
    o = to_object(weld(placed), "chalet", palette_material())
    triangulate(o)
    return [o]
