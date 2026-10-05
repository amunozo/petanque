"""
Small procedural textures (numpy + Pillow, both ship with the bpy wheel), seeded so every build
writes the same pixels:

  leaf_atlas()    plane-tree leaf clusters, RGBA, 2x2 tiles (alpha-tested leaf cards, plane_tree.py)
  ground_detail() tileable pale gravel grain, greyscale, mean ~0.5 (multiplied onto the ground)

Colours are sRGB (what a PNG stores). Transparent texels of the atlas carry the average leaf colour,
so mipmapping does not darken the leaf edges.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from .palette import hex_to_rgb

# Leaf colours (sRGB): upper surface in sun-ish greens, a few yellowing ones, paler undersides.
LEAF_TONES = ["#6f8a3f", "#7d9645", "#8aa04e", "#627d38", "#93a356", "#a3a65a", "#7a8d4a", "#596f33"]
LEAF_UNDER = ["#93a16c", "#9caa78"]


def _leaf_mask(px: np.ndarray, py: np.ndarray, size: float, lobes: float, depth: float) -> np.ndarray:
    """
    Signed inside test of a palmate (plane / maple-like) leaf with its tip toward +y, base at the origin
    of (px, py) (in leaf units, 1 = leaf length): 5 pointed lobes, notched base. Returns coverage 0..1.
    """
    cy = 0.45 * size
    x, y = px, py - cy
    r = np.sqrt(x * x + y * y) + 1e-6
    a = np.arctan2(x, y)  # 0 = toward the tip
    # 5 pointed lobes at 0, +-72, +-144 degrees with concave sinuses; notch at the base (a = 180 deg)
    t = a * lobes / math.tau
    f = np.abs(t - np.round(t))
    lobe = (1.0 - 2.0 * f) ** 0.8
    base = np.clip(np.abs(a) / math.pi, 0, 1)
    edge = size * 0.5 * ((1 - depth) + depth * lobe) * (1.0 - 0.55 * base ** 6)
    return np.clip((edge - r) / (0.012 * size) + 0.5, 0.0, 1.0)


def leaf_atlas(path: str, size: int = 512, seed: int = 3) -> None:
    """2x2 atlas of leaf clusters (each tile: ~20-26 overlapping leaves of varied tilt and tone + twigs)."""
    rng = np.random.default_rng(seed)
    ss = 2  # supersampling
    T = size // 2 * ss
    out = np.zeros((size * ss, size * ss, 4), dtype=np.float32)
    yy, xx = np.mgrid[0:T, 0:T].astype(np.float32)
    u = (xx + 0.5) / T
    v = 1.0 - (yy + 0.5) / T  # +v up
    tones = [np.array(hex_to_rgb(h), dtype=np.float32) for h in LEAF_TONES]
    unders = [np.array(hex_to_rgb(h), dtype=np.float32) for h in LEAF_UNDER]
    twig = np.array(hex_to_rgb("#6b6047"), dtype=np.float32)
    for tile in range(4):
        rgb = np.zeros((T, T, 3), dtype=np.float32)
        alpha = np.zeros((T, T), dtype=np.float32)
        n = int(rng.integers(26, 33))
        # twigs: a few thin lines from near the centre outward (drawn first, under the leaves)
        cx0, cy0 = 0.5 + rng.uniform(-0.05, 0.05), 0.42 + rng.uniform(-0.05, 0.05)
        leaves = []
        for _ in range(n):
            ang = rng.uniform(0, math.tau)
            rad = 0.34 * math.sqrt(rng.uniform(0.02, 1.0))
            lx, ly = cx0 + rad * math.cos(ang), cy0 + rad * math.sin(ang) * 0.95 + 0.04
            leaves.append((lx, ly))
        for lx, ly in leaves[:7]:
            # segment from the centre to the leaf base
            dx, dy = lx - cx0, ly - cy0
            ln2 = dx * dx + dy * dy + 1e-6
            t = np.clip(((u - cx0) * dx + (v - cy0) * dy) / ln2, 0, 1)
            d = np.sqrt((u - cx0 - t * dx) ** 2 + (v - cy0 - t * dy) ** 2)
            cov = np.clip((0.006 - d) / 0.003 + 0.5, 0, 1) * (t < 0.85)
            rgb = rgb * (1 - cov[..., None]) + twig * cov[..., None]
            alpha = np.maximum(alpha, cov)
        # leaves, roughly back (darker) to front (lighter)
        order = sorted(range(n), key=lambda i: rng.uniform())
        for k, i in enumerate(order):
            lx, ly = leaves[i]
            s = rng.uniform(0.17, 0.25)
            rot = rng.uniform(0, math.tau)
            tilt = rng.uniform(0.45, 1.0)  # foreshortening across the leaf
            c, sn = math.cos(rot), math.sin(rot)
            px = (u - lx) * c + (v - ly) * sn
            py = -(u - lx) * sn + (v - ly) * c
            px = px / tilt
            cov = _leaf_mask(px, py + 0.5 * s * 0.1, s, 5.0, rng.uniform(0.26, 0.38))
            if rng.uniform() < 0.18:
                col = unders[int(rng.integers(len(unders)))].copy()
            else:
                col = tones[int(rng.integers(len(tones)))].copy()
            col *= 0.82 + 0.3 * (k / n)  # leaves in front a bit lighter
            # shading across the blade (fake curvature) + light veins
            shade = 0.9 + 0.2 * np.clip(px / (s * 0.5), -1, 1)
            r = np.sqrt(px * px + (py - 0.45 * s) ** 2) + 1e-6
            a = np.arctan2(px, py - 0.45 * s)
            vein = np.zeros_like(px)
            for va in (0.0, 1.257, -1.257):
                vein = np.maximum(vein, np.clip(1 - np.abs(np.sin(a - va)) * r / (0.006 * s / 0.2), 0, 1) * (np.cos(a - va) > 0))
            leaf = col[None, None, :] * shade[..., None] * (1 + 0.18 * vein[..., None])
            # darker rim
            leaf *= (0.88 + 0.12 * np.clip(cov * 3 - 2, 0, 1))[..., None]
            rgb = rgb * (1 - cov[..., None]) + leaf * cov[..., None]
            alpha = np.maximum(alpha, cov)
        tx, ty = tile % 2, tile // 2
        out[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, :3] = rgb
        out[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 3] = alpha
    # downsample (box) and bleed the average leaf colour into transparent texels
    out = out.reshape(size, ss, size, ss, 4).mean(axis=(1, 3))
    a = out[..., 3:4]
    col = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    mean = (col * a).sum(axis=(0, 1)) / max(float(a.sum()), 1e-4)
    col = np.where(a > 0.02, col, mean)
    img = np.concatenate([np.clip(col, 0, 1), a], axis=-1)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA").save(path, optimize=True)


def _tileable_noise(n: int, rng: np.random.Generator, power: float) -> np.ndarray:
    """Tileable 1/f^power noise via FFT, normalised to mean 0, std 1."""
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    amp = 1.0 / np.maximum(np.sqrt(fx * fx + fy * fy), 1.0 / n) ** power
    ph = rng.uniform(0, math.tau, (n, n))
    img = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    return (img - img.mean()) / (img.std() + 1e-9)


def ground_detail(path: str, size: int = 256, seed: int = 11) -> None:
    """
    Tileable gravel grain (greyscale, mean ~0.5 in display values): fine crushed-limestone grit
    (packed cells a few texels wide, each its own brightness, darker in the gaps), a sprinkle of
    slightly larger stones and a little soft mottling. The game multiplies the ground colour by
    2x this (0.5 = unchanged) at two scales, so the tiling does not show.
    """
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # grit: Worley cells (nearest of jittered grid points, wrapped so the tile is seamless)
    cell = 4
    n = size // cell
    gx, gy = np.meshgrid(np.arange(n), np.arange(n))
    px = (gx + rng.uniform(0.15, 0.85, (n, n))) * cell
    py = (gy + rng.uniform(0.15, 0.85, (n, n))) * cell
    val = rng.normal(0.0, 1.0, (n, n))
    best = np.full((size, size), 1e9, dtype=np.float32)
    second = np.full((size, size), 1e9, dtype=np.float32)
    grit = np.zeros((size, size), dtype=np.float32)
    cx = (xx // cell).astype(int)
    cy = (yy // cell).astype(int)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ix, iy = (cx + ox) % n, (cy + oy) % n
            # unwrap the neighbour position across the tile edge
            dx = px[iy, ix] + ((cx + ox) - ix) * cell - xx
            dy = py[iy, ix] + ((cy + oy) - iy) * cell - yy
            d = np.sqrt(dx * dx + dy * dy)
            closer = d < best
            second = np.where(closer, best, np.minimum(second, d))
            grit = np.where(closer, val[iy, ix], grit)
            best = np.where(closer, d, best)
    edge = np.clip((second - best) / 1.2, 0, 1)  # 0 in the gaps between grains
    img = 0.45 * grit - 0.45 * (1 - edge) + 0.4 * rng.normal(0.0, 1.0, (size, size))
    # a sprinkle of larger, lighter or darker stones
    for _ in range(int(size * size / 900)):
        x, y = rng.uniform(0, size, 2)
        r = rng.uniform(1.6, 3.0)
        v = rng.choice([-1.4, 1.3])
        dx = (xx - x + size / 2) % size - size / 2
        dy = (yy - y + size / 2) % size - size / 2
        cov = np.clip(r - np.sqrt(dx * dx * 1.3 + dy * dy), 0, 1)
        img = img * (1 - cov) + v * cov
    img += 0.25 * _tileable_noise(size, rng, 1.8)
    img = (img - img.mean()) / (img.std() + 1e-9)
    out = 0.5 + 0.13 * img
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "L").save(path, optimize=True)
