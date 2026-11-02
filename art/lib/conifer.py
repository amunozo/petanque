"""
Conifers of the alpine venue (spruce, larch, pine): a needle-spray atlas for their alpha-tested
cards, and the wood / card builders the three tree scripts share.

Atlas (conifer_atlas, written as the venue's leaves.png, RGBA, 2x2 tiles, sRGB):
  tile 0  Norway spruce spray, dark green (branchlets combed out along a twig)
  tile 1  spruce spray with paler new growth (sunlit outer tips)
  tile 2  larch spray in autumn gold (short needle rosettes along the twig)
  tile 3  pine tufts (long grey-green needles in brushes at the twig ends)
Each spray lies along +u (left -> right) in its tile, so a card's u axis follows its branch.
Transparent texels carry the average colour of the tile (no dark fringes when mipmapped).
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from .alpine import NMesh, VMesh, add, cross, norm, ss
from .mesh import MeshData
from .palette import Color, HEX, P, hex_to_rgb, mix
from .rand import Rng, fbm

TILES = {"spruce": 0, "spruce_light": 1, "larch": 2, "pine": 3}


# --- atlas --------------------------------------------------------------------------------

class _Canvas:
    def __init__(self, n: int) -> None:
        self.n = n
        self.rgb = np.zeros((n, n, 3), dtype=np.float32)
        self.a = np.zeros((n, n), dtype=np.float32)

    def seg(self, p0, p1, w: float, col) -> None:
        """Anti-aliased line of width w (px) from p0 to p1 (px, y down), painted over."""
        x0, y0 = p0
        x1, y1 = p1
        pad = w + 1.5
        i0, i1 = int(max(0, min(x0, x1) - pad)), int(min(self.n, max(x0, x1) + pad + 1))
        j0, j1 = int(max(0, min(y0, y1) - pad)), int(min(self.n, max(y0, y1) + pad + 1))
        if i0 >= i1 or j0 >= j1:
            return
        yy, xx = np.mgrid[j0:j1, i0:i1].astype(np.float32) + 0.5
        dx, dy = x1 - x0, y1 - y0
        l2 = dx * dx + dy * dy + 1e-6
        t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / l2, 0, 1)
        d = np.sqrt((xx - x0 - t * dx) ** 2 + (yy - y0 - t * dy) ** 2)
        wt = w * (1.0 - 0.45 * t)  # needles taper to the tip
        cov = np.clip(wt / 2 - d + 0.5, 0, 1)
        sub = self.rgb[j0:j1, i0:i1]
        sub[:] = sub * (1 - cov[..., None]) + np.asarray(col, dtype=np.float32) * cov[..., None]
        self.a[j0:j1, i0:i1] = np.maximum(self.a[j0:j1, i0:i1], cov)


def _c(key: str) -> np.ndarray:
    return np.array(hex_to_rgb(HEX[key]), dtype=np.float32)


def _spruce_tile(cv: _Canvas, rng: np.random.Generator, light: bool) -> None:
    n = cv.n
    twig = _c("d_bark_spruce") * 0.8
    base = [_c("d_spruce"), _c("d_spruce_mid"), _c("d_spruce_mid")]
    tip = _c("d_spruce_light")
    # main twig along +u, slightly arched; side shoots combed toward the tip on both sides
    y0 = n * 0.52
    pts = [(n * 0.04 + n * 0.84 * k / 14, y0 + n * 0.05 * math.sin(k / 14 * math.pi) * -1) for k in range(15)]
    shoots = []
    for k in range(1, 14):
        for side in (-1, 1):
            if rng.uniform() < 0.08:
                continue
            frac = k / 14
            L = n * (0.44 - 0.28 * frac) * rng.uniform(0.8, 1.12)
            ang = math.radians(rng.uniform(42, 64)) * side
            px, py = pts[k]
            ex, ey = px + L * math.cos(ang), py + L * math.sin(ang)
            shoots.append(((px, py), (ex, ey), frac))
    for (px, py), (ex, ey), frac in shoots:
        cv.seg((px, py), (ex, ey), 1.6, twig)
    for a, b in zip(pts, pts[1:]):
        cv.seg(a, b, 2.6, twig)
    # needles: short strokes all along each shoot and the main twig, pointing forward-outward
    for (px, py), (ex, ey), frac in shoots + [(pts[0], pts[-1], 0.0)]:
        L = math.hypot(ex - px, ey - py)
        dirx, diry = (ex - px) / L, (ey - py) / L
        m = int(L / 1.6)
        for i in range(m):
            t = (i + rng.uniform(0, 1)) / m
            cx, cy = px + (ex - px) * t, py + (ey - py) * t
            for side in (-1, 1):
                ang = math.atan2(diry, dirx) + side * math.radians(rng.uniform(35, 70))
                nl = n * rng.uniform(0.05, 0.072) * (1.0 - 0.3 * t)
                col = base[int(rng.integers(len(base)))] * rng.uniform(0.85, 1.12)
                if t > 0.7 and (light or rng.uniform() < 0.3):
                    col = col * 0.5 + tip * 0.5 * rng.uniform(0.9, 1.15)
                cv.seg((cx, cy), (cx + nl * math.cos(ang), cy + nl * math.sin(ang)), 3.4, col)


def _larch_tile(cv: _Canvas, rng: np.random.Generator) -> None:
    n = cv.n
    twig = _c("d_bark_larch") * 0.85
    golds = [_c("d_larch"), _c("d_larch"), _c("d_larch_orange"), _c("d_larch_green"), _c("d_leaf_pale")]
    y0 = n * 0.5
    pts = [(n * 0.04 + n * 0.86 * k / 10, y0 + n * 0.04 * math.sin(k * 0.9)) for k in range(11)]
    twigs = [(pts[0], pts[-1])]
    for k in range(1, 10):
        for side in (-1, 1):
            if rng.uniform() < 0.3:
                continue
            L = n * rng.uniform(0.2, 0.4) * (1.0 - 0.4 * k / 10)
            ang = math.radians(rng.uniform(30, 60)) * side
            px, py = pts[k]
            twigs.append(((px, py), (px + L * math.cos(ang), py + L * math.sin(ang))))
    for a, b in twigs:
        cv.seg(a, b, 1.8, twig)
    # rosettes of short needles (short shoots) along every twig
    for (px, py), (ex, ey) in twigs:
        L = math.hypot(ex - px, ey - py)
        m = int(L / (n * 0.04))
        for i in range(m + 1):
            t = (i + rng.uniform(-0.2, 0.2)) / max(m, 1)
            cx, cy = px + (ex - px) * t, py + (ey - py) * t
            gcol = golds[int(rng.integers(len(golds)))]
            for _ in range(int(rng.integers(18, 26))):
                ang = rng.uniform(0, math.tau)
                nl = n * rng.uniform(0.04, 0.075)
                col = gcol * rng.uniform(0.82, 1.12)
                cv.seg((cx, cy), (cx + nl * math.cos(ang), cy + nl * math.sin(ang) * 0.8), 3.0, col)


def _pine_tile(cv: _Canvas, rng: np.random.Generator) -> None:
    n = cv.n
    twig = _c("d_bark_pine") * 0.8
    greens = [_c("d_pine"), _c("d_pine") * 1.1, _c("d_spruce_mid"), _c("d_spruce_light") * 0.95]
    y0 = n * 0.55
    main = ((n * 0.03, y0), (n * 0.7, y0 - n * 0.06))
    ends = [main[1]]
    for k in range(4):
        sx = n * (0.2 + 0.13 * k)
        side = -1 if k % 2 else 1
        e = (sx + n * rng.uniform(0.12, 0.2), y0 + side * n * rng.uniform(0.12, 0.2))
        cv.seg((sx, y0 - n * 0.02 * k), e, 2.2, twig)
        ends.append(e)
    cv.seg(main[0], main[1], 3.0, twig)
    # brushes of long needles at every twig end and along the last part of the main twig
    for ex, ey in ends + [(n * 0.45, y0 - n * 0.03)]:
        for _ in range(int(rng.integers(90, 120))):
            ang = rng.uniform(-math.pi, math.pi)
            nl = n * rng.uniform(0.08, 0.16)
            col = greens[int(rng.integers(len(greens)))] * rng.uniform(0.85, 1.15)
            ox, oy = ex + rng.uniform(-6, 6), ey + rng.uniform(-6, 6)
            cv.seg((ox, oy), (ox + nl * math.cos(ang), oy + nl * math.sin(ang)), 2.8, col)


def conifer_atlas(path: str, size: int = 512, seed: int = 41) -> None:
    rng = np.random.default_rng(seed)
    ss_ = 2
    T = size // 2 * ss_
    out = np.zeros((size * ss_, size * ss_, 4), dtype=np.float32)
    for tile in range(4):
        cv = _Canvas(T)
        if tile in (0, 1):
            _spruce_tile(cv, rng, light=tile == 1)
        elif tile == 2:
            _larch_tile(cv, rng)
        else:
            _pine_tile(cv, rng)
        tx, ty = tile % 2, tile // 2
        out[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, :3] = cv.rgb
        out[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 3] = cv.a
    out = out.reshape(size, ss_, size, ss_, 4).mean(axis=(1, 3))
    a = out[..., 3:4]
    col = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    h = size // 2
    for ty in range(2):  # per-tile average colour under the transparent texels
        for tx in range(2):
            sl = (slice(ty * h, (ty + 1) * h), slice(tx * h, (tx + 1) * h))
            aa = a[sl]
            mean = (col[sl] * aa).sum(axis=(0, 1)) / max(float(aa.sum()), 1e-4)
            col[sl] = np.where(aa > 0.02, col[sl], mean)
    img = np.concatenate([np.clip(col, 0, 1), a], axis=-1)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA").save(path, optimize=True)


# --- wood ---------------------------------------------------------------------------------

def tube(vm: VMesh, path, radii, sides: int, color_fn, rng: Rng, jitter: float = 0.0, cap: bool = True,
         radial=None) -> None:
    """Tapered smooth tube along `path` (parallel-transported frame); color_fn(p, ring, k) -> colour."""
    n = len(path)
    base = len(vm.m.verts)
    prev_u = None
    for r in range(n):
        p = path[r]
        a = path[max(r - 1, 0)]
        b = path[min(r + 1, n - 1)]
        d = norm((b[0] - a[0], b[1] - a[1], b[2] - a[2]))
        ref = prev_u if prev_u is not None else ((1.0, 0.0, 0.0) if abs(d[0]) < 0.9 else (0.0, 0.0, 1.0))
        w = norm(cross(d, ref))
        u = norm(cross(w, d))
        prev_u = u
        for k in range(sides):
            ang = math.tau * k / sides
            rad = radii[r] * (1.0 + rng.jitter(jitter)) * (radial(r, ang) if radial else 1.0)
            c, s = math.cos(ang) * rad, math.sin(ang) * rad
            v = (p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s)
            vm.vert(v, color_fn(v, r, k))
    for r in range(n - 1):
        for k in range(sides):
            a0, a1 = base + r * sides + k, base + r * sides + (k + 1) % sides
            b0, b1 = base + (r + 1) * sides + k, base + (r + 1) * sides + (k + 1) % sides
            vm.face((a0, a1, b1, b0))
    if cap:
        top = base + (n - 1) * sides
        vm.face(tuple(top + k for k in range(sides)))


def tube_flat(nm: NMesh, path, radii, sides: int, face_color, rng: Rng, jitter: float = 0.0, radial=None) -> None:
    """Like tube(), but each face has its own flat colour on smooth (radial) normals: crisp bark
    plates and fissures. face_color(centre, ring, k) -> colour."""
    n = len(path)
    rings, norms = [], []
    prev_u = None
    for r in range(n):
        p = path[r]
        a = path[max(r - 1, 0)]
        b = path[min(r + 1, n - 1)]
        d = norm((b[0] - a[0], b[1] - a[1], b[2] - a[2]))
        ref = prev_u if prev_u is not None else ((1.0, 0.0, 0.0) if abs(d[0]) < 0.9 else (0.0, 0.0, 1.0))
        w = norm(cross(d, ref))
        u = norm(cross(w, d))
        prev_u = u
        ring, nr = [], []
        for k in range(sides):
            ang = math.tau * k / sides
            rad = radii[r] * (1.0 + rng.jitter(jitter)) * (radial(r, ang) if radial else 1.0)
            c, s_ = math.cos(ang), math.sin(ang)
            ring.append((p[0] + (u[0] * c + w[0] * s_) * rad, p[1] + (u[1] * c + w[1] * s_) * rad,
                         p[2] + (u[2] * c + w[2] * s_) * rad))
            nr.append(norm((u[0] * c + w[0] * s_, u[1] * c + w[1] * s_, u[2] * c + w[2] * s_)))
        rings.append(ring)
        norms.append(nr)
    for r in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            ps = (rings[r][k], rings[r][k2], rings[r + 1][k2], rings[r + 1][k])
            ctr = tuple(sum(q[i] for q in ps) / 4 for i in range(3))
            nm.quad(ps, (norms[r][k], norms[r][k2], norms[r + 1][k2], norms[r + 1][k]), face_color(ctr, r, k))


# --- cards --------------------------------------------------------------------------------

class Cards:
    """Alpha-tested needle cards: positions, atlas UVs, crown normals and tint x occlusion colours."""

    def __init__(self) -> None:
        self.m = MeshData()
        self.uvs: list[tuple[float, float]] = []
        self.normals: list = []
        self.vcol: list[Color] = []

    def card(self, centre, along, across, length: float, width: float, tile: int, normal_fn, color: Color,
             droop: float = 0.0) -> None:
        """Quad centred at `centre`, u along `along` (unit), v along `across` (unit). `droop` bends the
        far end down (m). normal_fn(p) -> unit normal; colour per card."""
        hl, hw = length / 2, width / 2
        corners = [add(add(centre, along, -hl), across, -hw), add(add(centre, along, hl), across, -hw),
                   add(add(centre, along, hl), across, hw), add(add(centre, along, -hl), across, hw)]
        corners[1] = add(corners[1], (0.0, -droop, 0.0))
        corners[2] = add(corners[2], (0.0, -droop, 0.0))
        # Blender UVs (v up; the glTF export flips them): tile row 0 is the top half of the PNG
        u0, v0 = (tile % 2) * 0.5, (1 - tile // 2) * 0.5
        tuv = [(u0 + 0.004, v0 + 0.004), (u0 + 0.496, v0 + 0.004), (u0 + 0.496, v0 + 0.496), (u0 + 0.004, v0 + 0.496)]
        base = len(self.m.verts)
        for c, uv in zip(corners, tuv):
            self.m.verts.append(c)
            self.uvs.append(uv)
            self.normals.append(normal_fn(c))
            self.vcol.append(color)
        self.m.add_face((base, base + 1, base + 2, base + 3), (0.5, 0.5, 0.5))


def crown_normal(axis_x: float, axis_z: float, y0: float, H: float, up: float = 0.6):
    """'Conical' normals: out from the trunk axis and up, so the sun shades the crown as one volume."""
    def fn(p):
        dx, dz = p[0] - axis_x, p[2] - axis_z
        r = math.hypot(dx, dz) or 1e-3
        return norm((dx / r, up + 0.4 * ss(y0, H, p[1]), dz / r))
    return fn


def bark_spruce(seed: int):
    def fn(v, r, k):
        n1 = fbm(v[0] * 3.0, v[1] * 1.2, v[2] * 3.0, seed, 2)
        n2 = fbm(v[0] * 9.0, v[1] * 4.0, v[2] * 9.0, seed + 3, 2)
        c = mix(P["d_bark_spruce"], P["d_bark_pine_grey"], ss(0.45, 0.7, n1) * 0.6)
        c = mix(c, P["d_bark_deep"], ss(0.55, 0.75, n2) * 0.6)
        c = mix(c, P["d_lichen"], ss(0.7, 0.8, n1) * 0.35)
        c = mix(c, P["d_moss_dark"], ss(0.8, 0.0, v[1]) * 0.3)
        return c
    return fn
