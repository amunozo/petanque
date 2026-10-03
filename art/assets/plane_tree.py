"""
plane_tree.glb: the platanes (Platanus x hispanica) of a Provencal square, in three seeded variants.

Bark: irregular camouflage blotches (khaki, grey, cream, a little pale green) from domain-warped
noise, painted per TRIANGLE on a staggered trunk mesh, so the patches have ragged organic edges
instead of a chequered quad grid. Canopy: clustered low-poly blobs in three greens, deliberately
low (pruned square trees) and pushed toward the lean side, so the game can hang the foliage over
the edge of the court and into the top corners of the aim view.

Each variant is its own object (`plane_tree_a/_b/_c`), modelled with the trunk base at the object
origin and leaning (and reaching) toward +X. The objects sit side by side in the .blend only for
editing; the game uses just their geometry and instances them (`TREES` in src/render/scenery.ts).
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
    # lean: deg toward +X; fork: trunk height to the fork (m); r0: trunk base radius; mains: main limbs;
    # blobs: big canopy blobs; clusters: small leaf clusters; reach: canopy radius (m);
    # shift: canopy centre pushed toward +X (m); low: lowest leaves relative to the fork (m).
    # Pruned square trees: short trunks and low, broad canopies.
    {"name": "plane_tree_a", "seed": 11, "lean": 9.0, "fork": 2.6, "r0": 0.48, "mains": 4, "blobs": 15,
     "clusters": 56, "reach": 3.1, "shift": 0.5, "low": -0.5, "at": (-8.0, 0.0, 0.0)},
    {"name": "plane_tree_b", "seed": 29, "lean": 7.0, "fork": 2.45, "r0": 0.52, "mains": 3, "blobs": 14,
     "clusters": 56, "reach": 3.3, "shift": 0.6, "low": -0.5, "at": (0.0, 0.0, 0.0)},
    {"name": "plane_tree_c", "seed": 47, "lean": 5.0, "fork": 3.0, "r0": 0.56, "mains": 4, "blobs": 16,
     "clusters": 50, "reach": 3.5, "shift": 0.3, "low": -0.2, "at": (8.0, 0.0, 0.0)},
]

PREVIEW = {
    "views": [
        ("all", (0.0, 4.2, 26.0), (0.0, 4.0, 0.0), 40),
        ("trunk", (-6.2, 1.4, 3.6), (-7.6, 1.6, 0.0), 40),
        ("canopy", (-3.5, 0.8, 7.0), (-6.5, 5.5, 0.0), 32),
    ],
    "ground_size": 16.0,
    "ground_color": (0.45, 0.33, 0.20),
}


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _norm(v):
    ln = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / ln, v[1] / ln, v[2] / ln)


# --- bark -----------------------------------------------------------------------------------

def _bark_color(x: float, y: float, z: float, seed: int, rng: Rng):
    """
    Plane-tree camouflage bark. Domain-warped noise gives blotches with ragged, organic edges
    (no grid), thresholded into a few flat tones: khaki/olive base, grey plates, freshly peeled
    cream and pale-green patches, darker and rougher at the foot.
    """
    f = 2.0
    wx = fbm(x * 0.9, y * 0.5, z * 0.9, seed + 51, 2) - 0.5
    wz = fbm(x * 0.9 + 7.3, y * 0.5, z * 0.9, seed + 53, 2) - 0.5
    px, py, pz = x * f + 2.2 * wx, y * f * 0.75 + 1.6 * wz, z * f + 2.2 * wz
    plates = fbm(px, py, pz, seed + 1, 3)
    peel = fbm(px * 1.4 + 11.0, py * 1.4, pz * 1.4, seed + 7, 3)
    green = fbm(px * 0.8 + 3.0, py * 0.8 + 5.0, pz * 0.8, seed + 13, 2)

    c = mix(P["bark_khaki"], P["bark_olive"], _ss(0.45, 0.5, green) * 0.7)
    c = mix(c, P["bark_grey"], _ss(0.50, 0.53, plates))
    c = mix(c, P["bark_green"], _ss(0.58, 0.61, green) * 0.9)
    c = mix(c, P["bark_cream"], _ss(0.55, 0.58, peel))
    c = mix(c, P["bark_dark"], _ss(0.36, 0.32, plates) * 0.6)
    c = mix(c, P["bark_dark"], _ss(0.9, 0.0, y) * 0.45)  # darker, rougher at the foot
    return scale(c, 1.0 + rng.jitter(0.035))


def _staggered_tube(m: MeshData, path, radii, sides: int, rng: Rng, seed: int, jitter: float,
                    color_shift: float = 0.0) -> None:
    """
    Tapered tube whose rings are rotated by half a step every other ring, split into triangles that
    are coloured one by one (zig-zag low-poly trunk: blotch edges follow triangles, not a grid).
    """
    # tube() places vertex k of each ring at angle 2*pi*k/sides; rotate odd rings by half a step.
    n = len(path)
    flat, _, _ = tube(path, radii, sides, cap_top=False)
    verts: list = []
    for r in range(n):
        ring = flat[r * sides:(r + 1) * sides]
        c = path[r]
        if r % 2 == 1:
            # half a step around: midpoint of neighbours, pushed back out to the ring radius
            rot = []
            for k in range(sides):
                a, b = ring[k], ring[(k + 1) % sides]
                mx, my, mz = (a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1], (a[2] + b[2]) / 2 - c[2]
                ln = math.sqrt(mx * mx + my * my + mz * mz) or 1.0
                rot.append((c[0] + mx / ln * radii[r], c[1] + my / ln * radii[r], c[2] + mz / ln * radii[r]))
            ring = rot
        js = [1.0 + rng.jitter(jitter) for _ in range(sides)]
        verts.append([(c[0] + (v[0] - c[0]) * j, c[1] + (v[1] - c[1]) * j, c[2] + (v[2] - c[2]) * j) for v, j in zip(ring, js)])
    base = len(m.verts)
    for ring in verts:
        m.verts.extend(ring)

    def vi(r, k):
        return base + r * sides + (k % sides)

    def add(tri):
        cx = sum(m.verts[i][0] for i in tri) / 3
        cy = sum(m.verts[i][1] for i in tri) / 3
        cz = sum(m.verts[i][2] for i in tri) / 3
        col = _bark_color(cx, cy, cz, seed, rng)
        m.add_face(tri, mix(col, P["bark_grey"], color_shift))

    for r in range(n - 1):
        for k in range(sides):
            if r % 2 == 0:
                # ring r+1 is rotated +half: its vertex k sits between r:k and r:k+1
                add((vi(r, k), vi(r, k + 1), vi(r + 1, k)))
                add((vi(r, k + 1), vi(r + 1, k + 1), vi(r + 1, k)))
            else:
                # ring r is rotated: r:k sits between r+1:k and r+1:k+1
                add((vi(r, k), vi(r + 1, k + 1), vi(r + 1, k)))
                add((vi(r, k), vi(r, k + 1), vi(r + 1, k + 1)))
    # cap
    top = n - 1
    m.add_face(tuple(vi(top, k) for k in range(sides)), _bark_color(*path[-1], seed, rng))


def _limb(m: MeshData, start, direction, length: float, r0: float, r1: float, sides: int, segs: int,
          droop: float, rng: Rng, seed: int, color_shift: float = 0.0):
    """Tapered curved branch from `start`; returns the tip position and the end direction."""
    d = _norm(direction)
    path = [start]
    p = start
    for _ in range(segs):
        d = _norm((d[0] + rng.jitter(0.12), d[1] + droop + rng.jitter(0.05), d[2] + rng.jitter(0.12)))
        p = (p[0] + d[0] * length / segs, p[1] + d[1] * length / segs, p[2] + d[2] * length / segs)
        path.append(p)
    radii = [r0 + (r1 - r0) * k / segs for k in range(segs + 1)]
    _staggered_tube(m, path, radii, sides, rng, seed, 0.07, color_shift)
    return path[-1], d


# --- foliage --------------------------------------------------------------------------------

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
    tone = rng.jitter(0.12)  # each blob slightly lighter / darker than its neighbours
    for f in faces:
        idx = tuple(i + base for i in f)
        c0 = tuple(sum(m.verts[i][k] for i in idx) / 3 for k in range(3))
        a, b, c = (m.verts[i] for i in idx)
        u, w = (b[0] - a[0], b[1] - a[1], b[2] - a[2]), (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        nrm = _norm((u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]))
        hf = (c0[1] - canopy_low) / max(canopy_high - canopy_low, 0.1)
        noise = fbm(c0[0] * 0.8, c0[1] * 0.8, c0[2] * 0.8, seed + 3, 2)
        # Baked light: top and outer faces catch the sun, undersides and the core stay darker.
        outward = _norm((c0[0] - canopy_center[0], 0.0, c0[2] - canopy_center[2]))
        out_f = (nrm[0] * outward[0] + nrm[2] * outward[2]) * 0.5
        t = 0.34 + 0.30 * hf + 0.34 * nrm[1] + 0.14 * out_f + (noise - 0.5) * 0.5 + tone
        t = max(0.0, min(1.0, t))
        col = mix(mix(P["leaf_deep"], P["leaf_dark"], 0.45), P["leaf_dark"], _ss(0.0, 0.3, t))
        col = mix(col, P["leaf_mid"], _ss(0.25, 0.6, t))
        col = mix(col, P["leaf_light"], _ss(0.6, 0.95, t))
        if rng.random() < 0.02:
            col = mix(col, P["leaf_light"], 0.5)  # a few sun-caught leaves
        m.add_face(idx, scale(col, 1.0 + rng.jitter(0.04)))


def build_tree(v: dict) -> MeshData:
    rng = Rng(v["seed"])
    seed = v["seed"]
    m = MeshData()
    fork, r0 = v["fork"], v["r0"]
    lean = math.tan(math.radians(v["lean"]))

    # --- trunk: gentle S-curve, flared base, tapering to the fork
    rings = 16
    path, radii = [], []
    for k in range(rings):
        h = -0.15 + (fork + 0.15) * k / (rings - 1)
        wob = 0.14 * math.sin(h * 1.2 + seed)
        path.append((lean * h + wob, h, 0.10 * math.cos(h * 0.9 + seed)))
        taper = 1.0 - 0.30 * max(h, 0) / fork
        flare = 0.40 * math.exp(-max(h, 0) / 0.3)
        radii.append(r0 * (taper + flare))
    _staggered_tube(m, path, radii, 11, rng, seed, 0.07)
    top = path[-1]

    # --- limbs: biased toward +X (the side the canopy reaches over the court)
    tips: list[tuple[float, float, float]] = []
    mains = v["mains"]
    az0 = rng.uniform(-0.4, 0.4)
    for i in range(mains):
        az = az0 + math.tau * i / mains + rng.jitter(0.3)
        elev = math.radians(rng.uniform(45, 62))  # from vertical
        reach_bias = 1.0 + 0.25 * math.cos(az)
        dirv = (math.sin(elev) * math.cos(az), math.cos(elev), math.sin(elev) * math.sin(az))
        start = (top[0], top[1] - rng.uniform(0.0, 0.25), top[2])
        tip, _ = _limb(m, start, dirv, rng.uniform(2.0, 2.6) * reach_bias, 0.27, 0.10, 6, 4, 0.04, rng, seed, 0.1)
        tips.append(tip)
        for sgn in (-1, 1):
            daz = az + sgn * rng.uniform(0.5, 0.9)
            d2 = (math.sin(elev * 0.8) * math.cos(daz), math.cos(elev * 0.8) * 1.1, math.sin(elev * 0.8) * math.sin(daz))
            frac = rng.uniform(0.5, 0.75)
            s2 = (top[0] + (tip[0] - top[0]) * frac, top[1] + (tip[1] - top[1]) * frac, top[2] + (tip[2] - top[2]) * frac)
            t2, _ = _limb(m, s2, d2, rng.uniform(1.4, 2.0), 0.12, 0.05, 5, 3, 0.06, rng, seed, 0.2)
            tips.append(t2)

    # --- canopy: big faceted blobs around the limb tips and over the fork, plus small separate
    # leaf clusters around and below them (they hang low at the rim and break the shadow into dapples).
    reach = v["reach"]
    cx, cz = top[0] + v["shift"], top[2]
    low = top[1] + v["low"]
    high = top[1] + 4.6
    centre = (cx, (low + high) / 2, cz)
    core = []
    for tip in tips[: v["blobs"] // 2]:
        core.append(((tip[0] + rng.jitter(0.6), tip[1] + rng.uniform(0.3, 1.0) + v["low"], tip[2] + rng.jitter(0.6)), rng.uniform(1.0, 1.35)))
    while len(core) < v["blobs"]:
        ang = rng.uniform(0, math.tau)
        rad = reach * math.sqrt(rng.random()) * 0.85
        height = top[1] + 1.4 + v["low"] * (rad / reach) + (1 - (rad / reach) ** 2) * rng.uniform(1.0, 2.6)
        core.append(((cx + rad * math.cos(ang), height, cz + rad * math.sin(ang)), rng.uniform(1.05, 1.45)))
    for cpos, rad in core:
        _blob(m, cpos, rad, rng.uniform(0.66, 0.8), rng, seed, low, high, centre)
    # Small clusters sit on the surface of the big blobs (outward / downward), so the silhouette
    # gets lumpy and the rim hangs low, without loose floating balls.
    for _ in range(v["clusters"]):
        (bx, by, bz), br = core[rng.randrange(len(core))]
        ox, oz = bx - cx, bz - cz
        ol = math.hypot(ox, oz) or 1.0
        ang = math.atan2(oz, ox) + rng.jitter(1.3)
        down = rng.uniform(-0.75, 0.35)
        dirv = _norm((math.cos(ang), down, math.sin(ang)))
        d = br * rng.uniform(0.75, 1.0)
        pos = (bx + dirv[0] * d, by + dirv[1] * d * 0.75, bz + dirv[2] * d)
        _blob(m, pos, rng.uniform(0.45, 0.75), 0.8, rng, seed, low, high, centre, subdiv=0)
    return m


def build():
    mat = palette_material()
    objs = []
    for v in VARIANTS:
        data = build_tree(v)
        o = to_object(data, v["name"], mat, location_game=v["at"])
        triangulate(o)
        objs.append(o)
    return objs
