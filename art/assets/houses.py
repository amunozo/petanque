"""
houses.glb: the village edge around the square: rows of 2-3 storey Provencal houses beyond the far
end of the court (facades at z = -16, with a gap in line with the court that the mairie fills,
mairie.py, and the café on the ground floor right of it),
shorter rows along both sides at |x| = 10.5, a few taller roofs and a bell tower with an iron
campanile behind the far row (for the skyline seen during a throw).

All in game coordinates, outside the playable area (court x -2..2, z -9.5..5.5). One object per
row so the renderer can frustum-cull them; one shared vertex-colour material.
"""
from __future__ import annotations

from lib.building import HouseSpec, build_house, house_height, place, quad
from lib.materials import palette_material
from lib.mesh import MeshData, box, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng

NAME = "houses"

FAR_Z = -16.0       # facade line of the far row
SIDE_X = 10.5       # facade line of the side rows

# (width, setback, spec kwargs) left to right. The far row has a gap in the middle, in line with the
# court, for the town hall (mairie.py, its own file) that closes the square behind the jack.
GAP_HALF = 3.4
FAR_LEFT = [
    (5.4, 0.0, dict(floors=3, render="render_pink", shutter="shutter_blue", door_slot=1, quoins=True, seed=101)),
    (4.6, 0.35, dict(floors=2, render="render_cream", shutter="shutter_lavender", door_slot=0, window_boxes=0.6, seed=102)),
    (3.7, 0.0, dict(floors=3, render="render_ochre", shutter="shutter_sage", door_slot=0, balcony_slot=1, slots=2,
                    window_boxes=0.4, seed=103)),
]
FAR_RIGHT = [
    (5.9, 0.0, dict(floors=2, render="render_pink", shutter="olive_dark", shop="cafe", awning=("canvas_red", "canvas_white"),
                    window_boxes=0.6, seed=105)),
    (3.9, 0.3, dict(floors=2, render="render_cream", shutter="shutter_blue", door_slot=1, quoins=True, slots=2, seed=106)),
    (3.9, 0.0, dict(floors=3, render="render_ochre", shutter="shutter_lavender", door_slot=0, balcony_slot=1, slots=2, seed=107)),
]

# Side rows, listed from the far end toward the player.
RIGHT_ROW = [
    (5.2, 0.0, dict(floors=3, render="render_cream", shutter="shutter_sage", door_slot=1, seed=201)),
    (4.6, 0.3, dict(floors=2, render="render_pink", shutter="shutter_blue", door_slot=0, window_boxes=0.5, seed=202)),
    (5.6, 0.0, dict(floors=3, render="render_ochre", shutter="shutter_teal", door_slot=2, balcony_slot=1, quoins=True, seed=203)),
    (4.8, 0.2, dict(floors=2, render="render_sand", shutter="shutter_lavender", door_slot=1, seed=204)),
]
LEFT_ROW = [
    (5.0, 0.0, dict(floors=2, render="render_ochre", shutter="shutter_blue", door_slot=0, window_boxes=0.6, seed=301)),
    (5.8, 0.3, dict(floors=3, render="render_rose", shutter="shutter_sage", door_slot=2, quoins=True, seed=302)),
    (4.4, 0.0, dict(floors=2, render="render_cream", shutter="shutter_teal", door_slot=1, seed=303)),
    (5.4, 0.25, dict(floors=3, render="render_pink", shutter="shutter_lavender", door_slot=1, balcony_slot=1, seed=304)),
]
SIDE_Z0 = -10.0      # side rows start here (between them and the far row: streets leading out)

# Taller roofs behind the far row (only their upper floors and roofs show), clear of the mairie
# (|x| < GAP_HALF, down to z = -26).
BACK_ROW = [
    (-19.5, -25.0, 6.0, dict(floors=3, render="render_sand", shutter="shutter_sage", seed=401, slots=3)),
    (-10.5, -24.0, 5.0, dict(floors=4, render="render_cream", shutter="shutter_blue", seed=402, slots=2)),
    (6.0, -24.5, 6.0, dict(floors=4, render="render_ochre", shutter="shutter_lavender", seed=403, slots=3)),
    (12.5, -25.5, 5.5, dict(floors=3, render="render_pink", shutter="shutter_teal", seed=404, slots=3)),
]
TOWER = {"x": -14.2, "z": -27.0, "size": 3.4, "height": 17.0}

PREVIEW = {
    "views": [
        ("square", (0.0, 7.0, 14.0), (0.0, 4.0, -16.0), 34),
        ("facade", (4.5, 1.7, -8.0), (4.0, 3.2, -16.0), 32),
        ("aerial", (24.0, 26.0, 18.0), (0.0, 2.0, -8.0), 30),
    ],
    "ground_size": 40.0,
    "ground_color": (0.50, 0.36, 0.22),
    "context": ["mairie"],  # rendered with the town hall that fills the gap (not exported with the houses)
}


def _row(entries, origin, yaw, x0, seed_shift=0) -> MeshData:
    m = MeshData()
    x = x0
    for i, (w, setback, kw) in enumerate(entries):
        kw = dict(kw)
        spec = HouseSpec(width=w, **kw)
        h = build_house(spec)
        h = h.transformed(lambda v, x=x, s=setback: (v[0] + x, v[1], v[2] - s))
        m.append(place(h, origin, yaw))
        x += w
    return m


def _tower(rng: Rng) -> MeshData:
    t = TOWER
    m = MeshData()
    s, H = t["size"], t["height"]
    stone = P["limestone"]
    # shaft in a few courses (slight colour change per course), cornice, belfry, campanile cage
    courses = 6
    for k in range(courses):
        y0 = -0.3 + (H + 0.3) * k / courses
        y1 = -0.3 + (H + 0.3) * (k + 1) / courses
        c = scale(mix(stone, P["render_sand"], 0.3 + 0.1 * (k % 2)), 1.0 + rng.jitter(0.04))
        m.append(box(0, (y0 + y1) / 2, 0, s, y1 - y0, s, c))
    m.append(box(0, H + 0.12, 0, s + 0.4, 0.24, s + 0.4, scale(stone, 1.05), bottom=True))
    m.append(box(0, H - 3.6, 0, s + 0.2, 0.18, s + 0.2, scale(stone, 1.05), bottom=True))
    # belfry openings (dark arches) on the four faces
    dark = P["glass"]
    for yaw in (0, 90, 180, 270):
        face = MeshData()
        quad(face, (-0.55, H - 3.0, s / 2 + 0.01), (0.55, H - 3.0, s / 2 + 0.01), (0.55, H - 0.8, s / 2 + 0.01),
             (-0.55, H - 0.8, s / 2 + 0.01), dark)
        quad(face, (-0.35, H - 0.8, s / 2 + 0.01), (0.35, H - 0.8, s / 2 + 0.01), (0.0, H - 0.45, s / 2 + 0.01),
             (0.0, H - 0.45, s / 2 + 0.01), dark)
        # clock face on the lower stage
        quad(face, (-0.5, H - 6.0, s / 2 + 0.01), (0.5, H - 6.0, s / 2 + 0.01), (0.5, H - 5.0, s / 2 + 0.01),
             (-0.5, H - 5.0, s / 2 + 0.01), P["cream"])
        m.append(place(face, (0, 0, 0), yaw))
    # wrought-iron campanile: four bars rising to a point, a ring and a bell
    iron = P["iron"]
    top = H + 0.24
    apex = H + 3.0
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        bx, bz = sx * (s / 2 - 0.2), sz * (s / 2 - 0.2)
        steps = 4
        for k in range(steps):
            f0, f1 = k / steps, (k + 1) / steps
            # bars bow outward a little (onion-like outline)
            bow0 = 1.0 + 0.25 * (1 - (2 * f0 - 1) ** 2)
            bow1 = 1.0 + 0.25 * (1 - (2 * f1 - 1) ** 2)
            p0 = (bx * (1 - f0) * bow0, top + (apex - top) * f0, bz * (1 - f0) * bow0)
            p1 = (bx * (1 - f1) * bow1, top + (apex - top) * f1, bz * (1 - f1) * bow1)
            cx, cy, cz = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2
            m.append(box(cx, cy, cz, 0.09 + abs(p0[0] - p1[0]), abs(p1[1] - p0[1]) + 0.05, 0.09 + abs(p0[2] - p1[2]), iron))
    m.append(box(0, top + 0.9, 0, 0.9, 0.9, 0.9, scale(P["ochre_dark"], 0.7), bottom=True))   # bell
    m.append(box(0, apex + 0.5, 0, 0.06, 1.0, 0.06, iron))                                 # finial
    m.append(box(0, apex + 0.7, 0, 0.5, 0.05, 0.05, iron))
    return m.transformed(lambda v: (v[0] + t["x"], v[1], v[2] + t["z"]))


def build():
    rng = Rng(5)
    mat = palette_material()
    far = _row(FAR_LEFT, (0.0, 0.0, FAR_Z), 0.0, -GAP_HALF - sum(w for w, _, _ in FAR_LEFT))
    far.append(_row(FAR_RIGHT, (0.0, 0.0, FAR_Z), 0.0, GAP_HALF))
    right = _row(RIGHT_ROW, (SIDE_X, 0.0, SIDE_Z0), -90.0, 0.0)
    left_entries = list(reversed(LEFT_ROW))
    left_len = sum(w for w, _, _ in LEFT_ROW)
    left = _row(left_entries, (-SIDE_X, 0.0, SIDE_Z0 + left_len), 90.0, 0.0)
    back = MeshData()
    for x, z, w, kw in BACK_ROW:
        spec = HouseSpec(width=w, depth=7.0, window_boxes=0.0, door_slot=-1, **kw)
        h = build_house(spec)
        back.append(h.transformed(lambda v, x=x, z=z: (v[0] + x, v[1], v[2] + z)))
    back.append(_tower(rng))
    objs = []
    for name, data in (("houses_far", far), ("houses_right", right), ("houses_left", left), ("houses_back", back)):
        o = to_object(data, name, mat)
        triangulate(o)
        objs.append(o)
    return objs
