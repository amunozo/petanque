"""
The single source of truth for colours: warm late-afternoon Provencal village square.

Colours are written as sRGB hex (what you see in a colour picker). `lin()` converts
them to the linear values Blender / glTF vertex colours store. Every asset takes its
colours from here (or blends between them), so the whole scene stays cohesive.
"""
from __future__ import annotations

Color = tuple[float, float, float]


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def hex_to_rgb(h: str) -> Color:
    """'#d9b27a' -> sRGB floats 0..1."""
    h = h.lstrip("#")
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


def lin(h: str) -> Color:
    """'#d9b27a' -> linear RGB (what vertex colours store)."""
    r, g, b = hex_to_rgb(h)
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b))


def mix(a: Color, b: Color, t: float) -> Color:
    """Blend two (linear) colours; t=0 -> a, t=1 -> b."""
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def scale(c: Color, k: float) -> Color:
    """Brighten / darken a (linear) colour."""
    return (c[0] * k, c[1] * k, c[2] * k)


def tint(c: Color, warm: float) -> Color:
    """Shift a (linear) colour warmer (warm > 0) or cooler (warm < 0) by a small amount."""
    return (c[0] * (1 + 0.5 * warm), c[1], c[2] * (1 - 0.5 * warm))


def to_hex(c: Color) -> str:
    return "#%02x%02x%02x" % tuple(round(max(0.0, min(1.0, _linear_to_srgb(v))) * 255) for v in c)


# --- the palette (sRGB hex) -------------------------------------------------------------
# Art pass 2: richer and more saturated than the first look test (which read as washed-out beige).
# Families: warm earth (ochre, terracotta), limestone render, greens (sage, olive, leaf), the
# painted-shutter accents (lavender, sage, Provence blue) and the far landscape (haze lavender).
HEX = {
    # Warm earth
    "ochre": "#d89a45",
    "ochre_light": "#e8b866",
    "ochre_dark": "#b0742f",
    "terracotta": "#c55a32",
    "terracotta_dark": "#913a22",
    "terracotta_light": "#dc7a4a",
    "dust": "#bf9b70",          # court gravel base: mid value, so the yellow jack and steel boules pop
    "dust_dark": "#9c7a52",
    "earth": "#c08f5c",          # packed earth of the square around the court (warmer than the court)
    "earth_dark": "#9c6d43",
    # Limestone / render
    "cream": "#f0dcb0",
    "limestone": "#dcc9a2",
    "limestone_dark": "#b49f7a",
    "render_ochre": "#e2a957",   # facade render colours
    "render_cream": "#ecd2a0",
    "render_pink": "#e3a27f",
    "render_rose": "#d9896a",
    "render_sand": "#d8b98a",
    "stone_grey": "#a99c86",
    # Greens
    "sage": "#8ea866",
    "sage_light": "#adc17f",
    "olive": "#6b7f35",
    "olive_dark": "#4a5d26",
    "leaf_light": "#a9c24a",
    "leaf_mid": "#6f9a3c",
    "leaf_dark": "#3f6b35",
    "leaf_deep": "#2c5030",
    "straw": "#cdb35a",         # dry late-summer grass
    "cypress": "#2a4a2c",
    "cypress_light": "#4a6b37",
    # Plane-tree bark
    "bark_khaki": "#8e8459",
    "bark_grey": "#86837a",
    "bark_cream": "#d6cba1",
    "bark_green": "#a3a86f",
    "bark_dark": "#5a5040",
    "bark_olive": "#77723f",
    # Wood (boards, stakes, doors)
    "timber": "#7c5531",
    "timber_light": "#a17344",
    "timber_dark": "#573a20",
    # Painted woodwork + accents
    "lavender": "#8f74c4",
    "lavender_light": "#ab97d8",
    "shutter_sage": "#7fa585",
    "shutter_blue": "#4f86b5",
    "shutter_teal": "#3f8a8c",
    "shutter_lavender": "#9a86c8",
    "glass": "#2f3846",
    "geranium": "#d63c32",
    "iron": "#2f3030",
    "canvas_white": "#f3ead6",
    "canvas_red": "#c83a2e",
    "canvas_blue": "#3c6fae",
    "canvas_green": "#4f8a55",
    # Far landscape (atmospheric)
    "hill_near": "#77885a",
    "hill_mid": "#6f7fa8",
    "hill_far": "#9187c2",
    # Sky (reference only: the game's sky colours live in src/render/sky.ts)
    "sky_blue": "#3a7bd5",
    "sky_horizon": "#f7c27e",
}

# Linear versions, `P["ochre"]` etc.
P: dict[str, Color] = {k: lin(v) for k, v in HEX.items()}
