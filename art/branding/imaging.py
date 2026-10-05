"""Pillow helpers for the branding outputs: fonts (the game's own Fredoka / Nunito), masks, saving."""
from __future__ import annotations

import os
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FONTS = os.path.join(ROOT, "public", "fonts")
_CACHE = os.path.join(tempfile.gettempdir(), "petanque-branding-fonts")


def font_path(family: str = "fredoka", weight: int = 600) -> str:
    """A static TTF instance of the game's variable woff2 font (public/fonts) at `weight`, cached in tmp."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    os.makedirs(_CACHE, exist_ok=True)
    out = os.path.join(_CACHE, f"{family}-{weight}.ttf")
    if not os.path.exists(out):
        f = TTFont(os.path.join(FONTS, f"{family}-latin-wght.woff2"))
        inst = instancer.instantiateVariableFont(f, {"wght": weight})
        inst.flavor = None
        inst.save(out)
    return out


def font(size: int, family: str = "fredoka", weight: int = 600) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path(family, weight), size)


def rounded_mask(size: int, radius_frac: float, supersample: int = 4) -> Image.Image:
    s = size * supersample
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * radius_frac), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def save_rgb(img: Image.Image, path: str) -> str:
    """Opaque 24-bit PNG (Play Store graphics must not have alpha)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, optimize=True)
    return path


def save_rgba(img: Image.Image, path: str) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGBA").save(path, optimize=True)
    return path
