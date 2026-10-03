"""Deterministic randomness: same seed -> same asset, on any machine."""
from __future__ import annotations

import math
import random


class Rng(random.Random):
    """Seeded generator (Mersenne Twister, stable across platforms) with a few helpers."""

    def __init__(self, seed: int) -> None:
        super().__init__(seed)

    def jitter(self, amount: float) -> float:
        """Uniform in [-amount, amount]."""
        return self.uniform(-amount, amount)

    def pick(self, items):
        return items[self.randrange(len(items))]


def _hash3(ix: int, iy: int, iz: int, seed: int) -> float:
    """Integer lattice hash -> [0, 1). Pure integer arithmetic, so it is platform independent."""
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0xFFFFFFFF
    return h / 4294967296.0


def _smooth(t: float) -> float:
    return t * t * (3 - 2 * t)


def value_noise(x: float, y: float, z: float = 0.0, seed: int = 0) -> float:
    """Smooth 3D value noise in [0, 1]."""
    x0, y0, z0 = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = _smooth(x - x0), _smooth(y - y0), _smooth(z - z0)

    def corner(dx: int, dy: int, dz: int) -> float:
        return _hash3(x0 + dx, y0 + dy, z0 + dz, seed)

    def lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    c00 = lerp(corner(0, 0, 0), corner(1, 0, 0), fx)
    c10 = lerp(corner(0, 1, 0), corner(1, 1, 0), fx)
    c01 = lerp(corner(0, 0, 1), corner(1, 0, 1), fx)
    c11 = lerp(corner(0, 1, 1), corner(1, 1, 1), fx)
    return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz)


def fbm(x: float, y: float, z: float = 0.0, seed: int = 0, octaves: int = 3) -> float:
    """Fractal value noise in [0, 1]."""
    total, amp, norm, freq = 0.0, 1.0, 0.0, 1.0
    for o in range(octaves):
        total += amp * value_noise(x * freq, y * freq, z * freq, seed + o * 101)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm
