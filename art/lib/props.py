"""Small reusable prop shapes (cylinders, planters) shared by the village assets."""
from __future__ import annotations

import math

from .building import quad
from .mesh import MeshData, icosphere
from .palette import P, mix, scale
from .rand import Rng


def ring(cx, cy, cz, r, n, phase=0.0):
    return [(cx + r * math.cos(phase + math.tau * k / n), cy, cz + r * math.sin(phase + math.tau * k / n)) for k in range(n)]


def cylinder(m: MeshData, cx, cz, y0, y1, r0, r1, n, color, top_color=None, cap=True):
    a = ring(cx, y0, cz, r0, n)
    b = ring(cx, y1, cz, r1, n)
    for k in range(n):
        k2 = (k + 1) % n
        quad(m, a[k2], a[k], b[k], b[k2], color)
    if cap:
        i = [m.add_vert(p) for p in reversed(b)]  # reversed ring = counter-clockwise seen from above
        m.add_face(tuple(i), top_color or color)


def lavender_bush(m: MeshData, x, y0, z, r, rng: Rng, subdiv: int = 1):
    """Rounded lavender bush (purple flower heads on top, sage-green foliage below)."""
    verts, faces = icosphere(subdiv)
    base = len(m.verts)
    cy = y0 + r * 0.7
    for v in verts:
        j = 1.0 + rng.jitter(0.12)
        m.verts.append((x + v[0] * r * j, cy + v[1] * r * 0.75 * j, z + v[2] * r * j))
    for f in faces:
        fc = tuple(base + i for i in f)
        ny = sum(m.verts[i][1] for i in fc) / 3 - cy
        col = mix(P["sage"], P["lavender"], 0.85) if ny > -0.1 * r else P["sage"]
        m.add_face(fc, scale(col, 1.0 + rng.jitter(0.08)))


def lavender_planter(m: MeshData, x, z, rng: Rng, scale_: float = 1.0):
    """Big terracotta pot with a lavender bush."""
    r = 0.4 * scale_
    cylinder(m, x, z, 0.0, 0.55 * scale_, r * 0.75, r, 8, P["terracotta"], cap=False)
    cylinder(m, x, z, 0.55 * scale_, 0.62 * scale_, r * 1.08, r * 1.08, 8, P["terracotta_light"], top_color=P["earth_dark"])
    lavender_bush(m, x, 0.62 * scale_ - 0.05, z, r * 1.15, rng)
