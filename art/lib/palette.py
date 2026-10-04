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
# Art pass 3 ("vivid"): clearly saturated, no cream cast - richer ochre gravel, greener foliage with
# strong light/dark steps, punchier renders and shutters, deeper terracotta, crisp (not yellowed) limestone.
# Families: warm earth (ochre, terracotta), limestone render, greens (sage, olive, leaf), the
# painted-shutter accents (lavender, sage, Provence blue) and the far landscape (haze lavender).
HEX = {
    # Warm earth
    "ochre": "#e39a2c",
    "ochre_light": "#f2b843",
    "ochre_dark": "#b86b1a",
    "terracotta": "#c9481f",
    "terracotta_dark": "#8c2a12",
    "terracotta_light": "#e2683a",
    "dust": "#cc9e62",          # court gravel base: mid value, so the yellow jack and steel boules pop
    "dust_dark": "#9e7445",
    "earth": "#bf8550",          # packed earth of the square around the court (warmer than the court)
    "earth_dark": "#95603a",
    # Limestone / render
    "cream": "#efe6d2",
    "limestone": "#e0d5bd",
    "limestone_dark": "#b2a68b",
    "render_ochre": "#eda23e",   # facade render colours
    "render_cream": "#f2d384",
    "render_pink": "#ec9483",
    "render_rose": "#db6f55",
    "render_sand": "#e2b672",
    "stone_grey": "#a7a091",
    # Greens
    "sage": "#80ad55",
    "sage_light": "#9cc463",
    "olive": "#62862a",
    "olive_dark": "#40601a",
    "leaf_light": "#72b23a",
    "leaf_mid": "#3f9030",
    "leaf_dark": "#2b6e2a",
    "leaf_deep": "#1b4d26",
    "straw": "#d6b445",         # dry late-summer grass
    "cypress": "#1b4a27",
    "cypress_light": "#3a7231",
    # Plane-tree bark
    "bark_khaki": "#958750",
    "bark_grey": "#8a877d",
    "bark_cream": "#ded1a2",
    "bark_green": "#a2ae62",
    "bark_dark": "#5a5040",
    "bark_olive": "#77723f",
    # Wood (boards, stakes, doors)
    "timber": "#86522a",
    "timber_light": "#af7136",
    "timber_dark": "#5a3419",
    # Painted woodwork + accents
    "lavender": "#8b63d4",
    "lavender_light": "#a888ea",
    "shutter_sage": "#62ae78",
    "shutter_blue": "#2f78c8",
    "shutter_teal": "#1a928e",
    "shutter_lavender": "#8f72d8",
    "glass": "#283852",
    "geranium": "#e52c26",
    "iron": "#2f3030",
    "canvas_white": "#f7f2e6",
    "canvas_red": "#d72b21",
    "canvas_blue": "#2a69c4",
    "canvas_green": "#36914c",
    # Far landscape (atmospheric)
    "hill_near": "#5e8f4c",
    "hill_mid": "#6680c0",
    "hill_far": "#7f8ad6",
    # Sky (reference only: the game's sky colours live in src/render/sky.ts)
    "sky_blue": "#2a74e2",
    "sky_horizon": "#bcd9f4",
}

# Linear versions, `P["ochre"]` etc.
P: dict[str, Color] = {k: lin(v) for k, v in HEX.items()}
