"""
plane_tree.glb: the platanes (Platanus x hispanica) of a Provencal square, in three seeded variants.

Each variant is two objects: `plane_tree_<v>` (wood: trunk + limbs + branches, smooth shaded, pale
camouflage bark painted per vertex) and `plane_tree_<v>_leaves` (alpha-tested leaf cards: quads
textured with leaf clusters from the atlas public/models/leaves.png, written by this script).

Shape: a tall pale trunk that forks at ~3 m into 3-4 big limbs, each splitting into branches and
twigs; the crown is a loose dome of sub-crowns around the branch tips, made of a few hundred leaf
cards on their outer shells (so sky shows through the gaps and the shadows are dappled). The
cards carry "spherical" normals (pointing out of the crown) so the real-time sun shades the crown
as one volume, and their vertex colour holds a tint + ambient occlusion (darker inside / below).

Modelled with the trunk base at the object origin; the crown reaches toward +X (the game turns
each tree so it hangs over the court). The objects sit side by side in the .blend only for
editing; the game instances them (`TREES` in art/layout.json, used by src/render/scenery.ts and
by the light bake, art/lib/bake.py).
"""
from __future__ import annotations

import math
import os

from lib.materials import leaf_material, palette_material
from lib.mesh import MeshData, to_object
from lib.modifiers import triangulate
from lib.palette import Color, P, mix, scale
from lib.rand import Rng, fbm
from lib.textures import leaf_atlas

NAME = "plane_tree"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEAF_ATLAS = os.path.join(ROOT, "public", "models", "leaves.png")

VARIANTS = [
    # fork: trunk height to the fork (m); r0: trunk radius; lean: deg toward +X; mains: main limbs;
    # cards: leaf cards; reach: limb length scale; shift: crown pushed toward +X (m)
    {"name": "plane_tree_a", "seed": 11, "fork": 3.1, "r0": 0.31, "lean": 5.0, "mains": 4, "cards": 400,
     "reach": 1.1, "shift": 0.2, "at": (-11.0, 0.0, 0.0)},
    {"name": "plane_tree_b", "seed": 29, "fork": 2.9, "r0": 0.33, "lean": 7.0, "mains": 3, "cards": 380,
     "reach": 1.15, "shift": 0.3, "at": (0.0, 0.0, 0.0)},
    {"name": "plane_tree_c", "seed": 47, "fork": 3.4, "r0": 0.35, "lean": 4.0, "mains": 4, "cards": 420,
     "reach": 1.2, "shift": 0.1, "at": (11.0, 0.0, 0.0)},
]

PREVIEW = {
    "views": [
        ("all", (0.0, 5.0, 34.0), (0.0, 4.8, 0.0), 40),
        ("trunk", (-1.5, 1.6, 5.5), (0.0, 2.6, 0.0), 40),
        ("canopy", (3.0, 1.0, 6.5), (0.5, 5.5, 0.0), 32),
    ],
    "ground_size": 16.0,
    "ground_color": (0.45, 0.40, 0.31),
}

UP = (0.0, 1.0, 0.0)
REACH_X = 1.6  # sub-crown centres beyond this (toward the court) are pulled in


def _ss(a: float, b: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _norm(v):
    ln = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / ln, v[1] / ln, v[2] / ln)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


# --- bark ---------------------------------------------------------------------------------------

def _bark_color(x: float, y: float, z: float, seed: int) -> Color:
    """
    Plane-tree camouflage bark: grey-olive base with large peeled patches in cream and pale
    green-khaki (domain-warped noise, so the blotches have ragged edges), darker at the foot.
    """
    f = 2.4
    wx = fbm(x * 0.9, y * 0.45, z * 0.9, seed + 51, 2) - 0.5
    wz = fbm(x * 0.9 + 7.3, y * 0.45, z * 0.9, seed + 53, 2) - 0.5
    px, py, pz = x * f + 2.0 * wx, y * f * 0.55 + 1.4 * wz, z * f + 2.0 * wz
    plates = fbm(px, py, pz, seed + 1, 3)
    peel = fbm(px * 1.3 + 11.0, py * 1.3, pz * 1.3, seed + 7, 3)
    green = fbm(px * 0.8 + 3.0, py * 0.8 + 5.0, pz * 0.8, seed + 13, 2)
    c = mix(P["bark_grey"], P["bark_olive"], _ss(0.42, 0.55, green) * 0.6)
    c = mix(c, P["bark_khaki"], _ss(0.5, 0.56, plates) * 0.8)
    c = mix(c, P["bark_green"], _ss(0.58, 0.63, green) * 0.7)
    c = mix(c, P["bark_cream"], _ss(0.57, 0.62, peel) * 0.9)
    c = mix(c, P["bark_dark"], _ss(0.34, 0.28, plates) * 0.5)
    c = mix(c, P["bark_dark"], _ss(0.9, -0.1, y) * 0.35)  # darker, dustier at the foot
    c = mix(c, P["earth_dark"], _ss(0.25, -0.1, y) * 0.35)
    return c


# --- wood ---------------------------------------------------------------------------------------

class Wood:
    """Smooth tubes with per-vertex colours (bark x ambient occlusion)."""

    def __init__(self, seed: int, shade_from: float) -> None:
        self.m = MeshData()
        self.vcol: list[Color] = []
        self.seed = seed
        self.shade_from = shade_from  # height above which the crown shades the wood

    def tube(self, path, radii, sides: int, rng: Rng, jitter: float, cap: bool = True, radial=None) -> None:
        """Tapered tube along `path`; `radial(ring, angle)` -> radius factor (root lobes)."""
        n = len(path)
        base = len(self.m.verts)
        prev_u = None
        for r in range(n):
            p = path[r]
            a = path[max(r - 1, 0)]
            b = path[min(r + 1, n - 1)]
            d = _norm((b[0] - a[0], b[1] - a[1], b[2] - a[2]))
            # parallel-transport-ish frame: keep the previous ring's u as reference (no twisting)
            ref = prev_u if prev_u is not None else ((1.0, 0.0, 0.0) if abs(d[0]) < 0.9 else (0.0, 0.0, 1.0))
            w = _norm(_cross(d, ref))
            u = _norm(_cross(w, d))
            prev_u = u
            for k in range(sides):
                ang = math.tau * k / sides
                rad = radii[r] * (1.0 + rng.jitter(jitter)) * (radial(r, ang) if radial else 1.0)
                c, s = math.cos(ang) * rad, math.sin(ang) * rad
                v = (p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s)
                self.m.verts.append(v)
                ao = 1.0 - 0.42 * _ss(self.shade_from, self.shade_from + 2.2, v[1])
                ao *= 0.88 + 0.12 * _ss(-0.1, 0.5, v[1])  # soft contact darkening at the foot
                self.vcol.append(scale(_bark_color(*v, self.seed), ao))
        for r in range(n - 1):
            for k in range(sides):
                a0, a1 = base + r * sides + k, base + r * sides + (k + 1) % sides
                b0, b1 = base + (r + 1) * sides + k, base + (r + 1) * sides + (k + 1) % sides
                # counter-clockwise seen from outside (ring angle runs u -> w, counter-clockwise about d)
                self.m.add_face((a0, a1, b1, b0), P["bark_grey"])
        if cap:
            top = base + (n - 1) * sides
            self.m.add_face(tuple(top + k for k in range(sides)), P["bark_grey"])


def _branch_path(start, direction, length: float, segs: int, droop: float, rng: Rng, wander: float):
    d = _norm(direction)
    path = [start]
    p = start
    for _ in range(segs):
        d = _norm((d[0] + rng.jitter(wander), d[1] - droop + rng.jitter(wander * 0.5), d[2] + rng.jitter(wander)))
        p = _add(p, d, length / segs)
        path.append(p)
    return path, d


def _dir(az: float, from_vertical: float):
    return (math.sin(from_vertical) * math.cos(az), math.cos(from_vertical), math.sin(from_vertical) * math.sin(az))


def build_wood(v: dict, rng: Rng):
    """Trunk + limbs. Returns (Wood, sub-crowns [(centre, radius)])."""
    seed, fork, r0 = v["seed"], v["fork"], v["r0"]
    wood = Wood(seed, fork + 0.6)
    lean = math.tan(math.radians(v["lean"]))
    # trunk: gentle S-curve tapering to the fork, with a foot that flares out over the bottom ~0.7 m
    # into 4-5 irregular root buttresses that spread and sink below the ground (no seam, no pinch)
    # rings close together, so the bark blotches (per-vertex colour) stay crisp
    hs = [-0.5, -0.3, -0.15, -0.05, 0.03, 0.1, 0.18, 0.27, 0.37, 0.48, 0.6, 0.73, 0.86, 1.0]
    while hs[-1] < fork + 0.35 - 0.05:
        hs.append(min(fork + 0.35, hs[-1] + 0.14))
    path, radii, lobe_w = [], [], []
    for h in hs:
        wob = 0.06 * math.sin(h * 1.3 + seed)
        hp = max(h, 0.0)
        path.append((lean * hp + wob, h, 0.05 * math.cos(h * 1.1 + seed)))
        flare = 1.0 + 0.42 * math.exp(-hp / 0.38)
        if h < 0:
            flare *= 1.0 + 0.9 * -h  # keeps spreading into the ground
        radii.append(r0 * (1.0 - 0.15 * hp / fork) * flare)
        lobe_w.append(0.5 * math.exp(-hp / 0.32) + (0.5 * -h if h < 0 else 0.0))
    n_lobes = 4 + (seed % 2)
    lrng = Rng(seed + 2000)
    lobes = [(math.tau * i / n_lobes + lrng.jitter(0.45), lrng.uniform(0.6, 1.0)) for i in range(n_lobes)]

    def root_lobes(r: int, ang: float) -> float:
        bump = sum(st * max(0.0, math.cos(ang - a)) ** 8 for a, st in lobes)
        return 1.0 + lobe_w[r] * (bump - 0.2)

    # own generator: trunk tweaks must not reshuffle the limbs and crowns (and their baked shadows)
    wood.tube(path, radii, 24, Rng(seed + 1000), 0.012, radial=root_lobes)
    top = path[-1]

    crowns: list[tuple[tuple[float, float, float], float]] = []
    reach = v["reach"]
    mains = v["mains"]
    az0 = rng.uniform(0, math.tau)
    for i in range(mains):
        az = az0 + math.tau * i / mains + rng.jitter(0.35)
        # limbs toward +X (over the court) stay shorter and steeper, so the crowns (and their
        # shadows) only reach a little over the court; the crown spreads more away from it
        toward = math.cos(az)
        fv = math.radians(rng.uniform(42, 56) - 10 * max(0.0, toward))
        start = (top[0] - rng.uniform(0.05, 0.3) * math.cos(az) * 0, top[1] - rng.uniform(0.15, 0.45), top[2])
        L0 = rng.uniform(2.6, 3.2) * reach * (1.0 - 0.22 * toward)
        p0, d0 = _branch_path(start, _dir(az, fv), L0, 4, -0.03, rng, 0.1)
        wood.tube(p0, [0.19 - 0.09 * k / 4 for k in range(5)], 8, rng, 0.03)
        crowns.append((_add(p0[-1], (0, 1.0, 0)), rng.uniform(1.6, 1.95)))
        crowns.append((_add(p0[2], (0, 1.6, 0)), rng.uniform(1.4, 1.7)))
        # branches from the upper part of each limb
        nb = 3 if rng.random() < 0.6 else 2
        for j in range(nb):
            frac = rng.uniform(0.45, 0.95)
            idx = min(3, int(frac * 4))
            s = p0[idx]
            baz = az + (j - (nb - 1) / 2) * rng.uniform(0.7, 1.1) + rng.jitter(0.3)
            bfv = fv + math.radians(rng.uniform(0, 28))
            L1 = rng.uniform(1.8, 2.5) * reach
            p1, d1 = _branch_path(s, _dir(baz, bfv), L1, 3, 0.07, rng, 0.14)
            wood.tube(p1, [0.075 - 0.035 * k / 3 for k in range(4)], 6, rng, 0.03)
            crowns.append((_add(p1[-1], (0, 0.45, 0)), rng.uniform(1.3, 1.7)))
            # twigs
            for _ in range(2):
                t = p1[rng.randrange(1, 4)]
                taz = baz + rng.jitter(1.2)
                tfv = bfv + math.radians(rng.uniform(0, 35))
                p2, _ = _branch_path(t, _dir(taz, tfv), rng.uniform(0.8, 1.3), 2, 0.08, rng, 0.2)
                wood.tube(p2, [0.035, 0.026, 0.016], 4, rng, 0.02, cap=False)
                if rng.random() < 0.5:
                    crowns.append((_add(p2[-1], (0, 0.3, 0)), rng.uniform(0.95, 1.2)))
    # a crown top over the fork, so the dome closes
    crowns.append(((top[0] + v["shift"] * 0.5, top[1] + 3.6, top[2]), 2.2))
    return wood, crowns


# --- foliage ------------------------------------------------------------------------------------

def build_leaves(v: dict, crowns, rng: Rng):
    """Leaf cards on the outer shells of the sub-crowns. Returns (MeshData, uvs, normals, colours)."""
    shift = v["shift"]
    crowns = [((c[0] + shift * _ss(0.0, 3.0, c[0]), c[1], c[2]), r) for c, r in crowns]
    # compress the side over the court (+X beyond REACH_X) toward the trunk
    crowns = [((c[0] if c[0] < REACH_X else REACH_X + 0.35 * (c[0] - REACH_X), c[1], c[2]), r) for c, r in crowns]
    # crown frame for the spherical normals / occlusion
    xs = [c[0] for c, r in crowns]
    ys = [c[1] for c, r in crowns]
    zs = [c[2] for c, r in crowns]
    lo = (min(x - r for (x, _, _), r in crowns), min(y - r for (_, y, _), r in crowns), min(z - r for (_, _, z), r in crowns))
    hi = (max(x + r for (x, _, _), r in crowns), max(y + r for (_, y, _), r in crowns), max(z + r for (_, _, z), r in crowns))
    cc = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2 - 0.4, (lo[2] + hi[2]) / 2)
    cr = ((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2)
    del xs, ys, zs

    weights = [r * r for _, r in crowns]
    total = sum(weights)
    m = MeshData()
    uvs: list[tuple[float, float]] = []
    normals = []
    vcols: list[Color] = []
    n_cards = v["cards"]
    placed = 0
    tries = 0
    while placed < n_cards and tries < n_cards * 20:
        tries += 1
        # pick a sub-crown by area
        t = rng.random() * total
        k = 0
        while t > weights[k]:
            t -= weights[k]
            k += 1
        (cx, cy, cz), R = crowns[k]
        d = _norm((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
        if d[1] < -0.2 and rng.random() < 0.55:
            continue  # fewer leaves on the underside
        shell = rng.uniform(0.62, 1.0) ** 0.6
        p = (cx + d[0] * R * shell, cy + d[1] * R * shell * 0.8, cz + d[2] * R * shell)
        # keep cards on the outside of the whole crown: skip points deep inside another sub-crown
        inside = False
        for j, ((ox, oy, oz), oR) in enumerate(crowns):
            if j != k and math.dist(p, (ox, oy, oz)) < oR * 0.55:
                inside = True
                break
        if inside and rng.random() < 0.8:
            continue
        # crown-level "spherical" normal at this point
        q = ((p[0] - cc[0]) / cr[0], (p[1] - cc[1]) / cr[1], (p[2] - cc[2]) / cr[2])
        rn = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)
        sph = _norm(q)
        # card plane: faces roughly outward, with plenty of random tilt
        nrm = _norm(_add(_add(sph, d, 0.6), (rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)), 0.55))
        ref = (0.0, 1.0, 0.0) if abs(nrm[1]) < 0.9 else (1.0, 0.0, 0.0)
        tu = _norm(_cross(ref, nrm))
        tv = _cross(nrm, tu)
        rot = rng.uniform(0, math.tau)
        cu, su = math.cos(rot), math.sin(rot)
        a = (tu[0] * cu + tv[0] * su, tu[1] * cu + tv[1] * su, tu[2] * cu + tv[2] * su)
        b = (tv[0] * cu - tu[0] * su, tv[1] * cu - tu[1] * su, tv[2] * cu - tu[2] * su)
        size = rng.uniform(0.85, 1.25) * (0.85 + 0.25 * shell)
        h = size / 2
        corners = [_add(_add(p, a, -h), b, -h), _add(_add(p, a, h), b, -h), _add(_add(p, a, h), b, h), _add(_add(p, a, -h), b, h)]
        tile = rng.randrange(4)
        u0, v0 = (tile % 2) * 0.5, (1 - tile // 2) * 0.5
        tile_uv = [(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)]
        # occlusion: inner and lower cards darker; a per-card tint (some yellower, some bluer-darker)
        hf = _ss(lo[1], hi[1], p[1])
        ao = (0.42 + 0.58 * _ss(0.35, 1.05, rn)) * (0.78 + 0.22 * hf)
        if d[1] < -0.3:
            ao *= 0.85
        tone = rng.random()
        tint = mix((1.0, 1.0, 1.0), (1.08, 1.04, 0.82), _ss(0.75, 1.0, tone))
        tint = mix(tint, (0.86, 0.92, 0.95), _ss(0.25, 0.0, tone))
        base = len(m.verts)
        for ci, cpos in enumerate(corners):
            m.verts.append(cpos)
            uvs.append(tile_uv[ci])
            qn = _norm(((cpos[0] - cc[0]) / cr[0], (cpos[1] - cc[1]) / cr[1], (cpos[2] - cc[2]) / cr[2]))
            normals.append(_norm(_add(qn, d, 0.35)))
            vcols.append(scale(tint, ao * (1.0 + rng.jitter(0.04))))
        m.add_face((base, base + 1, base + 2, base + 3), P["leaf_mid"])
        placed += 1
    return m, uvs, normals, vcols


def build():
    os.makedirs(os.path.dirname(LEAF_ATLAS), exist_ok=True)
    leaf_atlas(LEAF_ATLAS)
    mat = palette_material()
    lmat = leaf_material(LEAF_ATLAS)
    objs = []
    for v in VARIANTS:
        rng = Rng(v["seed"])
        wood, crowns = build_wood(v, rng)
        o = to_object(wood.m, v["name"], mat, location_game=v["at"], smooth=True, vertex_colors=wood.vcol)
        triangulate(o)
        objs.append(o)
        leaves, uvs, normals, vcols = build_leaves(v, crowns, rng)
        o = to_object(leaves, v["name"] + "_leaves", lmat, location_game=v["at"], uvs=uvs, normals=normals,
                      vertex_colors=vcols)
        triangulate(o)
        objs.append(o)
    return objs
