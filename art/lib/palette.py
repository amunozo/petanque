"""
The single source of truth for colours: a sunny, natural-looking Provencal village square.

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
# Art pass 4 ("natural"): real-world material colours of a sunny Provencal square, picked from
# photo references and kept at believable saturation: pale dusty limestone gravel, packed sandy
# earth, sun-weathered ochre / pink / cream renders, faded painted shutters, olive-leaning natural
# greens, weathered timber and canal tiles. Lighting (src/render/lighting.ts) is a ~5600 K sun +
# a soft sky fill; the scene is graded at saturation ~1, so these are close to what you see.
HEX = {
    # Warm earth
    "ochre": "#c39553",
    "ochre_light": "#d6b47c",
    "ochre_dark": "#8f6a40",
    "terracotta": "#a8654b",     # canal tiles, pots (weathered, not orange)
    "terracotta_dark": "#7a4836",
    "terracotta_light": "#c08367",
    "dust": "#bcab8d",          # court gravel: crushed limestone, pale and slightly warm
    "dust_dark": "#968569",
    "earth": "#ac9879",          # packed sandy earth of the square (a touch darker / warmer than the court)
    "earth_dark": "#857259",
    # Limestone / render
    "cream": "#e0d7c3",
    "limestone": "#d2c7b0",
    "limestone_dark": "#a39985",
    "render_ochre": "#cda36d",   # facade render colours (sun-faded lime washes)
    "render_cream": "#dbcaa3",
    "render_pink": "#cfa392",
    "render_rose": "#bd8b78",
    "render_sand": "#cbb38c",
    "stone_grey": "#9a958a",
    # Greens (olive-leaning, as Mediterranean foliage is)
    "sage": "#8b9771",
    "sage_light": "#a6ad86",
    "olive": "#6b7346",
    "olive_dark": "#4a5233",
    "leaf_light": "#98a45e",
    "leaf_mid": "#6b8043",
    "leaf_dark": "#4b5f31",
    "leaf_deep": "#334326",
    "straw": "#bdac7a",         # dry late-summer grass
    "cypress": "#34432b",
    "cypress_light": "#4f6039",
    # Plane-tree bark (pale camouflage: cream, grey-olive, khaki)
    "bark_khaki": "#9b9070",
    "bark_grey": "#7e7b6b",
    "bark_cream": "#d8cea6",
    "bark_green": "#a7aa86",
    "bark_dark": "#6c6555",
    "bark_olive": "#716e55",
    # Wood (boards, stakes, doors): weathered, greyed timber
    "timber": "#7d6249",
    "timber_light": "#9d8466",
    "timber_dark": "#56432f",
    # Painted woodwork + accents (faded paints)
    "lavender": "#8a7fa5",
    "lavender_light": "#a59dbc",
    "shutter_sage": "#8c9e88",
    "shutter_blue": "#6c8aa2",
    "shutter_teal": "#5f8a87",
    "shutter_lavender": "#9891ac",
    "glass": "#2f363d",
    "geranium": "#ad3a30",
    "iron": "#333333",
    "canvas_white": "#e5e0d4",
    "canvas_red": "#a33f35",
    "canvas_blue": "#4b6787",
    "canvas_green": "#567257",
    # Far landscape (pre-lit and pre-hazed: the game draws the hills unlit)
    "hill_near": "#7b8869",
    "hill_mid": "#8d9aab",
    "hill_far": "#a3afc0",
    # Sky (reference only: the game's sky colours live in src/render/sky.ts)
    "sky_blue": "#4f86c6",
    "sky_horizon": "#c6d6e4",
}

# Linear versions, `P["ochre"]` etc.
P: dict[str, Color] = {k: lin(v) for k, v in HEX.items()}
