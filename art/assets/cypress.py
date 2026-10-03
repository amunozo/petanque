"""
cypress.glb: tall, dark Provencal cypresses (Cupressus sempervirens) in two seeded variants,
`cypress_a` (tall, ~11 m) and `cypress_b` (shorter and fuller, ~8 m). Flame-shaped faceted
column with staggered rings and a slightly ragged outline; base at the object origin. The game
instances them (`CYPRESSES` in src/render/scenery.ts) behind and between the houses.
"""
from __future__ import annotations

import math

from lib.materials import palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

NAME = "cypress"

VARIANTS = [
    {"name": "cypress_a", "seed": 5, "height": 11.0, "radius": 1.05, "rings": 9, "sides": 8, "at": (-2.0, 0.0, 0.0)},
    {"name": "cypress_b", "seed": 17, "height": 8.0, "radius": 1.0, "rings": 8, "sides": 8, "at": (2.0, 0.0, 0.0)},
]

PREVIEW = {
    "views": [
        ("pair", (0.0, 5.0, 16.0), (0.0, 5.0, 0.0), 40),
    ],
    "ground_size": 6.0,
    "ground_color": (0.50, 0.36, 0.22),
}


def _profile(t: float) -> float:
    """Radius factor along the height (0 = base, 1 = tip): narrow foot, fullest low, long flame tip."""
    return (0.55 + 0.45 * math.sin(min(t / 0.28, 1.0) * math.pi / 2)) * (1.0 - t) ** 0.85 if t < 1 else 0.0


def build_cypress(v: dict) -> MeshData:
    rng = Rng(v["seed"])
    m = MeshData()
    H, R, n, sides = v["height"], v["radius"], v["rings"], v["sides"]
    # little trunk
    trunk_top = 0.7
    rings = []
    for r in range(n + 1):
        t = r / n
        y = trunk_top + (H - trunk_top) * (t ** 0.9)
        rr = R * _profile(t)
        phase = (0.5 if r % 2 else 0.0) * math.tau / sides
        ring = []
        for k in range(sides):
            a = phase + math.tau * k / sides
            j = 1.0 + rng.jitter(0.16)
            lean = 0.08 * t * H / 10
            ring.append((rr * j * math.cos(a) + lean, y + rng.jitter(0.12) * (0 < r < n), rr * j * math.sin(a)))
        rings.append(ring)
    base = len(m.verts)
    for ring in rings:
        m.verts.extend(ring)

    def vi(r, k):
        return base + r * sides + (k % sides)

    def col(tri):
        cy = sum(m.verts[i][1] for i in tri) / 3
        cx = sum(m.verts[i][0] for i in tri) / 3
        cz = sum(m.verts[i][2] for i in tri) / 3
        n_ = fbm(cx * 0.9, cy * 0.6, cz * 0.9, v["seed"], 2)
        c = mix(P["cypress"], P["cypress_light"], 0.15 + 0.5 * (n_ - 0.3) + 0.2 * cy / H)
        return scale(c, 1.0 + rng.jitter(0.06))

    for r in range(n):
        for k in range(sides):
            if r % 2 == 0:  # ring r+1 rotated by half a step
                for t in ((vi(r, k), vi(r + 1, k), vi(r, k + 1)), (vi(r, k + 1), vi(r + 1, k), vi(r + 1, k + 1))):
                    m.add_face(t, col(t))
            else:
                for t in ((vi(r, k), vi(r + 1, k), vi(r + 1, k + 1)), (vi(r, k), vi(r + 1, k + 1), vi(r, k + 1))):
                    m.add_face(t, col(t))
    # underside of the foliage + trunk stub
    under = tuple(vi(0, k) for k in range(sides))
    m.add_face(under, scale(P["cypress"], 0.6))
    tb = len(m.verts)
    tr = 0.14
    for y in (-0.2, trunk_top + 0.1):
        for k in range(5):
            a = math.tau * k / 5
            m.verts.append((tr * math.cos(a), y, tr * math.sin(a)))
    for k in range(5):
        k2 = (k + 1) % 5
        m.add_face((tb + k, tb + 5 + k, tb + 5 + k2, tb + k2), P["timber_dark"])
    return m


def build():
    mat = palette_material()
    objs = []
    for v in VARIANTS:
        o = to_object(build_cypress(v), v["name"], mat, location_game=v["at"])
        triangulate(o)
        objs.append(o)
    return objs
