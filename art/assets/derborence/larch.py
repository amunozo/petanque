"""
larch.glb (derborence): European larches (Larix decidua) in their October gold.

Variants (trunk base at the origin; instanced at layout_derborence.LARCHES):
  larch_a  ~22 m, straight trunk bare to ~5 m, a loose open cone of slightly drooping branches
           whose tips turn up
  larch_b  ~15 m, bare to ~3 m
`larch_<v>`: trunk (reddish-brown scaly bark) + main branches; `larch_<v>_leaves`: golden spray
cards (lib/conifer.py tile "larch"), sparse enough that the sky shows through, so the crown and
its shadow stay light and dappled.
"""
from __future__ import annotations

import math
import os

from lib import venues
from lib.alpine import VMesh, add, norm, ss
from lib.conifer import TILES, Cards, conifer_atlas, crown_normal, tube
from lib.materials import leaf_material, palette_material
from lib.mesh import to_object
from lib.modifiers import triangulate
from lib.palette import P, mix, scale
from lib.rand import Rng, fbm

NAME = "larch"

VARIANTS = [
    {"v": "a", "seed": 19, "H": 22.0, "R": 3.4, "y0": 5.0, "r0": 0.3, "dy": 0.75, "per": 7, "at": (-5.0, 0.0, 0.0)},
    {"v": "b", "seed": 43, "H": 15.0, "R": 2.7, "y0": 3.0, "r0": 0.21, "dy": 0.65, "per": 6, "at": (3.0, 0.0, 0.0)},
]

PREVIEW = {
    "views": [
        ("all", (0.0, 8.0, 34.0), (0.0, 9.5, 0.0), 35),
        ("close", (-2.0, 4.0, 8.0), (-5.0, 9.0, 0.0), 35),
    ],
    "ground_size": 16.0,
    "ground_color": (0.24, 0.2, 0.15),
}


def _bark(seed: int):
    def fn(v, r, k):
        n1 = fbm(v[0] * 4.0, v[1] * 1.5, v[2] * 4.0, seed, 2)
        n2 = fbm(v[0] * 10.0, v[1] * 5.0, v[2] * 10.0, seed + 3, 2)
        c = mix(P["d_bark_larch"], P["d_bark_pine"], ss(0.45, 0.7, n1) * 0.5)
        c = mix(c, P["d_bark_deep"], ss(0.55, 0.72, n2) * 0.65)
        c = mix(c, P["d_bark_pine_grey"], ss(0.3, 0.15, n1) * 0.4)
        c = mix(c, P["d_moss_dark"], ss(0.9, 0.0, v[1]) * 0.25)
        return c
    return fn


def build_variant(v: dict):
    rng = Rng(v["seed"])
    H, R, y0, r0 = v["H"], v["R"], v["y0"], v["r0"]
    wood = VMesh()
    bark = _bark(v["seed"])
    hs = [-0.4, -0.1, 0.15, 0.5, 1.0] + [1.0 + (H - 1.0) * k / 10 for k in range(1, 11)]
    path = [(0.05 * math.sin(h * 0.25 + v["seed"]), h, 0.05 * math.cos(h * 0.31)) for h in hs]
    radii = [r0 * (1.0 - max(h, 0.0) / H) ** 0.8 * (1.0 + 0.45 * math.exp(-max(h, 0.0) / 0.35)) + 0.01 for h in hs]
    tube(wood, path, radii, 8, bark, rng, jitter=0.03)
    # a few dead stubs below the crown
    for _ in range(6):
        yy = rng.uniform(1.8, y0 - 0.3)
        az = rng.uniform(0, math.tau)
        d = (math.cos(az), -0.15, math.sin(az))
        tube(wood, [(0, yy, 0), add((0, yy, 0), d, rng.uniform(0.4, 0.9))], [0.03, 0.01], 3,
             lambda p, r, k: P["d_bark_pine_grey"], rng, cap=False)

    cards = Cards()
    nfn = crown_normal(0.0, 0.0, y0, H, up=0.5)
    y = y0
    while y < H - 0.6:
        t = (y - y0) / (H - y0)
        L0 = R * (1.0 - t) ** 0.85 * (0.7 + 0.3 * ss(0.0, 0.15, t))
        per = v["per"] + (1 if rng.random() < 0.3 else 0) - (1 if rng.random() < 0.3 else 0)
        az0 = rng.uniform(0, math.tau)
        for b in range(per):
            az = az0 + math.tau * b / per + rng.jitter(0.5)
            L = L0 * rng.uniform(0.7, 1.15)
            if L < 0.3:
                continue
            pitch = math.radians(-12 + 25 * t + rng.jitter(10))
            d = (math.cos(az) * math.cos(pitch), math.sin(pitch), math.sin(az) * math.cos(pitch))
            perp = (-math.sin(az), 0.0, math.cos(az))
            start = (d[0] * 0.12, y, d[2] * 0.12)
            end = add(add(start, d, L), (0.0, -0.18 * L, 0.0))
            if L > 1.6 and t < 0.5:  # only the longer, lower limbs show as wood
                tube(wood, [start, end], [0.03 * L / R + 0.012, 0.008], 3,
                     lambda p, r, k: mix(P["d_bark_larch"], P["d_bark_pine_grey"], 0.3), rng, cap=False)
            nseg = max(1, round(L / 0.7))
            for s in range(nseg):
                f = (s + 0.55) / nseg
                c = add(start, d, L * f)
                c = add(c, (0.0, -0.18 * L * f * (1.6 - f), 0.0))
                ao = (0.6 + 0.4 * ss(0.1, 1.0, f)) * (0.78 + 0.22 * ss(y0, H, c[1]))
                col = scale(mix((1.0, 1.0, 1.0), (1.05, 0.95, 0.8), rng.random() * 0.5), ao * (1.0 + rng.jitter(0.06)))
                ln = (L / nseg) * 2.1 * rng.uniform(0.85, 1.15)
                # sprays held fairly flat, tips turning up a little
                across = norm(add(perp, (0.0, rng.jitter(0.5), 0.0)))
                along = norm(add(d, (0.0, 0.15 * f, 0.0)))
                cards.card(c, along, across, ln, ln * 0.7, TILES["larch"], nfn, col, droop=-0.05 * ln)
                if rng.random() < 0.75:
                    hang = norm(add((0.0, -1.0, 0.0), perp, rng.jitter(0.5)))
                    cards.card(add(c, (0.0, -ln * 0.15, 0.0)), along, hang, ln * 0.8, ln * 0.5, TILES["larch"], nfn,
                               scale(col, 0.9))
        y += v["dy"] * rng.uniform(0.8, 1.25)
    for a in (0.0, math.pi / 2):
        cards.card((0.0, H - 0.5, 0.0), (0.0, 1.0, 0.0), (math.cos(a), 0.0, math.sin(a)), 1.2, 0.6, TILES["larch"], nfn,
                   (1.0, 1.0, 1.0))
    return wood, cards


def build():
    leaf_path = os.path.join(venues.models_dir(), "leaves.png")
    conifer_atlas(leaf_path)
    mat = palette_material()
    lmat = leaf_material(leaf_path)
    objs = []
    for v in VARIANTS:
        wood, cards = build_variant(v)
        o = to_object(wood.m, f"larch_{v['v']}", mat, location_game=v["at"], smooth=True, vertex_colors=wood.vcol)
        triangulate(o)
        objs.append(o)
        o = to_object(cards.m, f"larch_{v['v']}_leaves", lmat, location_game=v["at"], uvs=cards.uvs,
                      normals=cards.normals, vertex_colors=cards.vcol)
        triangulate(o)
        objs.append(o)
    return objs
