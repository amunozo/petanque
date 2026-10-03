"""
plane_tree.glb: a characteristic platane (Platanus x hispanica) in two seeded variants.

Mottled khaki/grey/cream bark (per-face colours), thick trunk with a flared base, a fork
into a few branches and a broad canopy of clustered low-poly blobs in three greens.
Each variant is its own object (`plane_tree_a`, `plane_tree_b`), modelled with its trunk
base at the object origin; the objects sit side by side in the .blend only for editing (the trunk leans toward +X; the game rotates each instance), the
game uses just their geometry and places them itself.
"""
from __future__ import annotations

import math

from lib.materials import palette_material
from lib.mesh import MeshData, icosphere, to_object, tube
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

NAME = "plane_tree"

VARIANTS = [
    # seed, lean (deg, toward +X), trunk height to the fork (m), trunk base radius, main branches, big canopy blobs, small leaf clusters, canopy reach (m)
    {"name": "plane_tree_a", "seed": 11, "lean": 8.0, "fork": 3.9, "r0": 0.64, "mains": 4, "blobs": 24, "clusters": 44, "reach": 3.7, "at": (-7.0, 0.0, 0.0)},
    {"name": "plane_tree_b", "seed": 29, "lean": 8.0, "fork": 3.5, "r0": 0.70, "mains": 3, "blobs": 22, "clusters": 46, "reach": 4.0, "at": (7.0, 0.0, 0.0)},
]

PREVIEW = {
    "views": [
        ("both", (0.0, 4.8, 30.0), (0.0, 4.8, 0.0), 40),
        ("trunk", (-4.6, 1.8, 6.0), (-7.0, 2.4, 0.0), 40),
        ("canopy", (-3.0, 0.8, 7.5), (-7.0, 7.5, 0.0), 32),
    ],
    "ground_size": 16.0,
    "ground_color": (0.40, 0.33, 0.22),
}


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _norm(v):
    ln = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / ln, v[1] / ln, v[2] / ln)


def _bark_color(x: float, y: float, z: float, seed: int, rng: Rng):
    """Mottled plane-tree bark: cream patches where it has peeled, khaki/grey elsewhere."""
    n = fbm(x * 1.6, y * 0.8, z * 1.6, seed, 3)
    m = fbm(x * 2.8 + 5, y * 1.3, z * 2.8, seed + 7, 2)
    c = mix(P["bark_khaki"], P["bark_grey"], _ss(0.4, 0.6, m))
    c = mix(c, P["bark_olive"], _ss(0.55, 0.75, n) * 0.7)
    c = mix(c, P["bark_cream"], _ss(0.42, 0.5, n) * (1 - _ss(0.5, 0.58, n)) + _ss(0.62, 0.72, m) * 0.8)
    c = mix(c, P["bark_dark"], _ss(0.25, 0.0, n) * 0.5)
    c = mix(c, P["bark_dark"], _ss(1.0, 0.0, y) * 0.5)  # darker, rougher at the foot
    return scale(c, 1.0 + rng.jitter(0.05))


def _limb(m: MeshData, start, direction, length: float, r0: float, r1: float, sides: int, segs: int,
          droop: float, rng: Rng, seed: int, color_shift: float = 0.0):
    """Tapered curved branch from `start`; returns the tip position and the end direction."""
    d = _norm(direction)
    path = [start]
    p = start
    for k in range(segs):
        # bend upward slightly more near the end, with a little wander
        d = _norm((d[0] + rng.jitter(0.12), d[1] + droop + rng.jitter(0.05), d[2] + rng.jitter(0.12)))
        p = (p[0] + d[0] * length / segs, p[1] + d[1] * length / segs, p[2] + d[2] * length / segs)
        path.append(p)
    radii = [r0 + (r1 - r0) * k / segs for k in range(segs + 1)]
    verts, faces, rings = tube(path, radii, sides, ring_fn=lambda r, k, a: 1.0 + rng.jitter(0.08))
    base = len(m.verts)
    m.verts.extend(verts)
    for f in faces:
        idx = tuple(i + base for i in f)
        cx = sum(m.verts[i][0] for i in idx) / len(idx)
        cy = sum(m.verts[i][1] for i in idx) / len(idx)
        cz = sum(m.verts[i][2] for i in idx) / len(idx)
        c = _bark_color(cx, cy, cz, seed, rng)
        m.add_face(idx, mix(c, P["bark_grey"], color_shift))
    return path[-1], d


def _blob(m: MeshData, center, radius: float, squash: float, rng: Rng, seed: int,
          canopy_low: float, canopy_high: float, canopy_center, subdiv: int = 1):
    verts, faces = icosphere(subdiv)
    rot = rng.uniform(0, math.tau)
    cr, sr = math.cos(rot), math.sin(rot)
    base = len(m.verts)
    for v in verts:
        j = 1.0 + rng.jitter(0.14)
        x, y, z = v[0] * radius * j, v[1] * radius * j * squash, v[2] * radius * j
        m.verts.append((center[0] + x * cr - z * sr, center[1] + y, center[2] + x * sr + z * cr))
    for f in faces:
        idx = tuple(i + base for i in f)
        c0 = tuple(sum(m.verts[i][k] for i in idx) / 3 for k in range(3))
        # face normal
        a, b, c = (m.verts[i] for i in idx)
        u, w = (b[0] - a[0], b[1] - a[1], b[2] - a[2]), (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        nrm = _norm((u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]))
        hf = (c0[1] - canopy_low) / max(canopy_high - canopy_low, 0.1)
        noise = fbm(c0[0] * 0.9, c0[1] * 0.9, c0[2] * 0.9, seed + 3, 2)
        # Baked light: top and outer faces catch the sun, undersides and the core stay dark.
        outward = _norm((c0[0] - canopy_center[0], 0.0, c0[2] - canopy_center[2]))
        out_f = (nrm[0] * outward[0] + nrm[2] * outward[2]) * 0.5
        t = 0.30 + 0.35 * hf + 0.38 * nrm[1] + 0.12 * out_f + (noise - 0.5) * 0.55
        t = max(0.0, min(1.0, t))
        col = mix(mix(P["leaf_dark"], P["leaf_mid"], _ss(0.15, 0.55, t)), P["leaf_light"], _ss(0.55, 0.95, t))
        if rng.random() < 0.06:
            col = mix(col, P["straw"], 0.35)  # a few sun-bleached leaf clusters
        if nrm[1] < -0.35:
            col = scale(col, 0.82)
        m.add_face(idx, scale(col, 1.0 + rng.jitter(0.05)))


def build_tree(v: dict) -> MeshData:
    rng = Rng(v["seed"])
    seed = v["seed"]
    m = MeshData()
    fork, r0 = v["fork"], v["r0"]
    lean = math.tan(math.radians(v["lean"]))

    # --- trunk: gentle S-curve, flared base, tapering to the fork
    rings = 13
    path, radii = [], []
    for k in range(rings):
        h = -0.15 + (fork + 0.15) * k / (rings - 1)
        wob = 0.18 * math.sin(h * 1.1 + seed)
        path.append((lean * h + wob, h, 0.12 * math.cos(h * 0.9 + seed)))
        taper = 1.0 - 0.32 * max(h, 0) / fork
        flare = 0.38 * math.exp(-max(h, 0) / 0.32)
        radii.append(r0 * (taper + flare))
    jit = {}
    def trunk_ring(r, k, a):
        return jit.setdefault((r, k), 1.0 + rng.jitter(0.09))
    verts, faces, _ = tube(path, radii, 10, ring_fn=trunk_ring)
    base = len(m.verts)
    m.verts.extend(verts)
    for f in faces:
        idx = tuple(i + base for i in f)
        c = tuple(sum(m.verts[i][k] for i in idx) / len(idx) for k in range(3))
        m.add_face(idx, _bark_color(c[0], c[1], c[2], seed, rng))
    top = path[-1]

    # --- branches
    tips: list[tuple[float, float, float]] = []
    mains = v["mains"]
    az0 = rng.uniform(0, math.tau)
    for i in range(mains):
        az = az0 + math.tau * i / mains + rng.jitter(0.35)
        elev = math.radians(rng.uniform(38, 58))  # from vertical
        dirv = (math.sin(elev) * math.cos(az), math.cos(elev), math.sin(elev) * math.sin(az))
        start = (top[0], top[1] - rng.uniform(0.0, 0.3), top[2])
        tip, dend = _limb(m, start, dirv, rng.uniform(2.5, 3.2), 0.33, 0.13, 6, 4, 0.05, rng, seed, 0.15)
        tips.append(tip)
        # two secondary limbs, to either side
        for sgn in (-1, 1):
            daz = az + sgn * rng.uniform(0.5, 0.9)
            d2 = (math.sin(elev * 0.8) * math.cos(daz), math.cos(elev * 0.8) * 1.2, math.sin(elev * 0.8) * math.sin(daz))
            frac = rng.uniform(0.5, 0.75)
            s2 = (top[0] + (tip[0] - top[0]) * frac, top[1] + (tip[1] - top[1]) * frac, top[2] + (tip[2] - top[2]) * frac)
            t2, _ = _limb(m, s2, d2, rng.uniform(1.8, 2.5), 0.16, 0.06, 5, 3, 0.07, rng, seed, 0.25)
            tips.append(t2)

    # --- canopy: big faceted blobs around the limb tips and over the fork, plus small separate
    # leaf clusters between and below them (these break the shadow up into dappled patches).
    reach = v["reach"]
    low = top[1] + 1.4
    high = top[1] + 6.2
    centre = (top[0], (low + high) / 2, top[2])
    core = []
    for tip in tips:
        core.append(((tip[0] + rng.jitter(1.0), tip[1] + rng.uniform(0.2, 1.3), tip[2] + rng.jitter(1.0)), rng.uniform(1.15, 1.6)))
    while len(core) < v["blobs"]:
        ang = rng.uniform(0, math.tau)
        rad = reach * math.sqrt(rng.random()) * 0.9
        height = top[1] + 2.2 + (1 - (rad / reach) ** 2) * rng.uniform(1.4, 3.6)
        core.append(((top[0] + rad * math.cos(ang), height, top[2] + rad * math.sin(ang)), rng.uniform(1.15, 1.65)))
    core = core[: v["blobs"]]
    cl = max(low - 0.8, 0.0)
    for cpos, rad in core:
        _blob(m, cpos, rad, rng.uniform(0.68, 0.82), rng, seed, cl, high + 1.5, centre)
    for _ in range(v["clusters"]):
        ang = rng.uniform(0, math.tau)
        rad = (reach + 1.0) * math.sqrt(rng.uniform(0.25, 1.0))
        height = top[1] + 1.4 + (1 - (rad / (reach + 1.4)) ** 2) * rng.uniform(1.0, 4.6)
        _blob(m, (top[0] + rad * math.cos(ang), height, top[2] + rad * math.sin(ang)), rng.uniform(0.5, 0.9), 0.8, rng,
              seed, cl, high + 1.5, centre, subdiv=0)
    return m


def build():
    rng_unused = None  # variants are seeded individually
    mat = palette_material()
    objs = []
    for v in VARIANTS:
        data = build_tree(v)
        o = to_object(data, v["name"], mat, location_game=v["at"])
        triangulate(o)
        objs.append(o)
    return objs
