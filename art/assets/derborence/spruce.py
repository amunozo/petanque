"""
spruce.glb (derborence): Norway spruces (Picea abies), the dark tall conifers around the court.

Variants (trunk base at the origin; the game instances them at layout_derborence.SPRUCES):
  spruce_a  ~26 m, narrow cone of drooping tiers down to ~1.5 m
  spruce_b  ~19 m
  spruce_c  a young bushy one, ~6.5 m, branches to the ground
  spruce_f  far, low detail: a solid stack of jagged tiers (no cards), for the ring of forest
Each detailed variant is `spruce_<v>` (trunk, a few bare lower twigs, and a dark inner core cone
that keeps the crown dense and its shadow solid) + `spruce_<v>_leaves` (alpha-tested spray cards
from the venue's leaf atlas, lib/conifer.py: per branch a flat-ish spray and a hanging curtain,
drooping toward the tip; conical normals; tint x occlusion in the vertex colours).
"""
from __future__ import annotations

import math

from lib.alpine import VMesh, add, norm, ss
from lib.conifer import TILES, Cards, bark_spruce, conifer_atlas_files, crown_normal, tube
from lib.materials import leaf_material, palette_material
from lib.mesh import to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng

NAME = "spruce"

VARIANTS = [
    {"v": "a", "seed": 13, "H": 26.0, "R": 3.3, "y0": 1.6, "r0": 0.33, "dy": 1.0, "per": 7, "at": (-9.0, 0.0, 0.0)},
    {"v": "b", "seed": 31, "H": 19.0, "R": 2.8, "y0": 1.2, "r0": 0.25, "dy": 0.85, "per": 6, "at": (-2.5, 0.0, 0.0)},
    {"v": "c", "seed": 57, "H": 6.5, "R": 1.75, "y0": 0.15, "r0": 0.1, "dy": 0.42, "per": 5, "at": (3.0, 0.0, 0.0)},
]
FAR = {"v": "f", "seed": 71, "H": 22.0, "R": 3.1, "tiers": 13, "sides": 7, "at": (8.0, 0.0, 0.0)}

PREVIEW = {
    "views": [
        ("all", (0.0, 9.0, 40.0), (0.0, 11.0, 0.0), 35),
        ("close", (-4.5, 3.0, 9.0), (-6.0, 6.0, 0.0), 35),
        ("young", (3.5, 2.0, 7.0), (3.0, 2.8, 0.0), 40),
    ],
    "ground_size": 20.0,
    "ground_color": (0.24, 0.2, 0.15),
}


def _profile(t: float) -> float:
    """Branch length factor along the crown height (0 = lowest whorl, 1 = top)."""
    return (1.0 - t) ** 0.92 * (0.82 + 0.18 * ss(0.0, 0.12, t))


def build_variant(v: dict):
    rng = Rng(v["seed"])
    H, R, y0, r0 = v["H"], v["R"], v["y0"], v["r0"]
    wood = VMesh()
    bark = bark_spruce(v["seed"])
    # trunk: tapering, slight wander, root flare
    hs = [-0.4, -0.1, 0.15, 0.5, 1.0] + [1.0 + (H - 1.0) * k / 10 for k in range(1, 11)]
    path = [(0.04 * math.sin(h * 0.3 + v["seed"]), h, 0.04 * math.cos(h * 0.27)) for h in hs]
    radii = [r0 * (1.0 - max(h, 0.0) / H) ** 0.85 * (1.0 + 0.5 * math.exp(-max(h, 0.0) / 0.35)) + 0.012 for h in hs]
    tube(wood, path, radii, 8, bark, rng, jitter=0.03)
    # dark inner core: two stacked cones (density + solid shadow)
    core_col = scale(P["d_spruce"], 0.4)
    for ya, yb, ra in ((y0 + 0.3, y0 + (H - y0) * 0.55, R * 0.3), (y0 + (H - y0) * 0.45, H - 1.2, R * 0.2)):
        n = 7
        base = [wood.vert((ra * math.cos(math.tau * k / n), ya, ra * math.sin(math.tau * k / n)),
                          scale(core_col, 0.8)) for k in range(n)]
        tip = wood.vert((0.0, yb, 0.0), core_col)
        for k in range(n):
            wood.face((base[k], tip, base[(k + 1) % n]))
        wood.face(tuple(reversed(base)))

    cards = Cards()
    nfn = crown_normal(0.0, 0.0, y0, H, up=0.55)
    y = y0
    whorl = 0
    while y < H - 0.7:
        t = (y - y0) / (H - y0)
        L0 = R * _profile(t)
        per = v["per"] + (1 if rng.random() < 0.3 else 0)
        az0 = rng.uniform(0, math.tau)
        for b in range(per):
            az = az0 + math.tau * b / per + rng.jitter(0.35)
            L = L0 * rng.uniform(0.8, 1.12)
            if L < 0.25:
                continue
            # out and a little down (low) or up (high), drooping toward the tip
            pitch = math.radians(-18 + 30 * t + rng.jitter(8))
            d = (math.cos(az) * math.cos(pitch), math.sin(pitch), math.sin(az) * math.cos(pitch))
            perp = (-math.sin(az), 0.0, math.cos(az))
            start = (d[0] * 0.15, y, d[2] * 0.15)
            nseg = max(1, round(L / 0.95))
            seg = L / nseg
            for s in range(nseg):
                f = (s + 0.6) / nseg
                c = add(start, d, L * f)
                c = add(c, (0.0, -0.32 * L * f * f - 0.1 * s, 0.0))
                depth = f  # 0 near the trunk, 1 at the tip
                hf = ss(0.0, H, c[1])
                ao = (0.5 + 0.5 * ss(0.15, 1.0, depth)) * (0.72 + 0.28 * hf)
                tone = rng.random()
                tint = mix((1.0, 1.0, 1.0), (1.08, 1.06, 0.9), ss(0.7, 1.0, tone))
                tint = mix(tint, (0.85, 0.9, 0.92), ss(0.25, 0.0, tone))
                col = scale(tint, ao * (1.0 + rng.jitter(0.05)))
                ln = seg * 1.9 * rng.uniform(0.85, 1.1)
                tile = TILES["spruce_light"] if (depth > 0.6 and rng.random() < 0.55) else TILES["spruce"]
                # flat spray, tilted to hang a little outward
                across = norm(add(perp, (0.0, -0.45 - 0.3 * f, 0.0)))
                along = norm(add(d, (0.0, -0.25 * f, 0.0)))
                cards.card(c, along, across, ln, ln * 0.72, tile, nfn, col, droop=0.15 * ln)
                # hanging curtain of branchlets under the branch (the comb habit)
                if ln > 0.5 or v["v"] == "c":
                    hang = norm(add((0.0, -1.0, 0.0), perp, rng.jitter(0.3)))
                    cc = add(c, (0.0, -ln * 0.22, 0.0))
                    cards.card(cc, along, hang, ln * 0.95, ln * 0.62, TILES["spruce"], nfn, scale(col, 0.9),
                               droop=0.05)
        y += v["dy"] * rng.uniform(0.85, 1.15)
        whorl += 1
    # leader: two crossed vertical sprays at the top
    for a in (0.0, math.pi / 2):
        along = (0.0, 1.0, 0.0)
        across = (math.cos(a), 0.0, math.sin(a))
        cards.card((0.0, H - 0.55, 0.0), along, across, 1.4, 0.75, TILES["spruce_light"], nfn, (0.98, 0.98, 0.98))
    return wood, cards


def build_far(v: dict) -> VMesh:
    """Low-detail spruce: stacked, drooping, jagged skirts (no cards), irregular like the near ones."""
    rng = Rng(v["seed"])
    vm = VMesh()
    H, R, n, sides = v["H"], v["R"], v["tiers"], v["sides"]
    for t in range(n):
        f0 = t / n
        yb = 1.2 + (H - 1.2) * f0 ** 0.9
        yt = 1.2 + (H - 1.2) * min(1.0, (t + 1.9) / n) ** 0.9
        rb = R * _profile(f0) * (0.85 + 0.25 * rng.random())
        cx, cz = rng.jitter(0.12) * rb, rng.jitter(0.12) * rb
        top = vm.vert((cx * 0.3, yt, cz * 0.3), scale(P["d_spruce"], 0.8))
        ring = []
        m = sides * 2
        for k in range(m):
            a = math.tau * k / m + t * 0.7
            rr = rb * (1.0 if k % 2 == 0 else 0.62) * (1.0 + rng.jitter(0.25))
            yy = yb - (0.55 if k % 2 == 0 else 0.1) * rb * 0.45 + rng.jitter(0.15)
            light = 0.8 + 0.35 * ss(0, H, yb)
            col = mix(P["d_spruce"], P["d_spruce_mid"], rng.random() * 0.7)
            if k % 2 == 0 and rng.random() < 0.4:
                col = mix(col, P["d_spruce_light"], 0.35)
            ring.append(vm.vert((cx + rr * math.cos(a), yy, cz + rr * math.sin(a)), scale(col, light)))
        for k in range(m):
            vm.face((top, ring[(k + 1) % m], ring[k]))
        under = vm.vert((cx, yb + 0.2 * rb, cz), scale(P["d_spruce"], 0.35))
        for k in range(m):
            vm.face((under, ring[k], ring[(k + 1) % m]))
    tube(vm, [(0.0, -0.3, 0.0), (0.0, 1.8, 0.0)], [0.3, 0.25], 6, lambda p, r, k: P["d_bark_spruce"], rng, cap=False)
    return vm


def build():
    leaf_path = conifer_atlas_files()
    mat = palette_material()
    lmat = leaf_material(leaf_path)
    objs = []
    for v in VARIANTS:
        wood, cards = build_variant(v)
        o = to_object(wood.m, f"spruce_{v['v']}", mat, location_game=v["at"], smooth=True, vertex_colors=wood.vcol)
        triangulate(o)
        objs.append(o)
        o = to_object(cards.m, f"spruce_{v['v']}_leaves", lmat, location_game=v["at"], uvs=cards.uvs,
                      normals=cards.normals, vertex_colors=cards.vcol)
        triangulate(o)
        objs.append(o)
    far = build_far(FAR)
    o = to_object(far.m, "spruce_f", mat, location_game=FAR["at"], smooth=True, vertex_colors=far.vcol)
    triangulate(o)
    objs.append(o)
    return objs
