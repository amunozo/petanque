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

# --- Derborence (alpine forest court, Valais), late October afternoon ---------------------
# Natural, slightly cool colours of a shaded larch / spruce forest under pale limestone cliffs:
# grey fine gravel, rusty fallen larch needles, yellow birch / aspen leaves, silver-grey
# weathered logs, bluish-grey limestone, a dark weathered log chalet with honey shutters.
HEX_DERBORENCE = {
    # Court: grey fine gravel, fallen larch needles, small yellow leaves
    "d_gravel": "#8f8c85",
    "d_gravel_light": "#a19e97",
    "d_gravel_dark": "#73716b",
    "d_needles": "#9a7150",        # fallen larch needles (rusty orange-brown)
    "d_needles_gold": "#aa8459",
    "d_needles_dark": "#76573e",
    "d_leaf_yellow": "#d9b53c",
    "d_leaf_gold": "#c79a32",
    "d_leaf_pale": "#e0c869",
    "d_leaf_brown": "#9a7442",
    "d_leaf_red": "#b0482f",
    # Forest floor
    "d_soil": "#6c5e4c",
    "d_soil_dark": "#4f4538",
    "d_litter": "#7b6a56",         # needle litter
    "d_grass_dry": "#9a9067",
    "d_grass": "#82814f",
    "d_grass_green": "#6f7a42",
    "d_moss": "#6a7739",
    "d_moss_dark": "#4b5630",
    "d_fern": "#a8914a",           # yellowing bracken / ferns
    "d_root": "#6e6151",
    # Weathered round logs (bark gone, silver-grey, deep checks)
    "d_log": "#a9a49a",
    "d_log_light": "#cbc6bb",
    "d_log_grey": "#8a857c",
    "d_log_dark": "#5f5b54",
    "d_log_crack": "#38352f",
    "d_log_end": "#b5a88f",
    # Limestone (bluish grey, angular)
    "d_rock": "#90969a",
    "d_rock_light": "#a6aaac",
    "d_rock_dark": "#646a71",
    "d_rock_warm": "#9a968e",
    "d_lichen": "#a3a585",
    # Chalet (Valais blockbau)
    "d_chalet": "#4b3d32",
    "d_chalet_dark": "#33291f",
    "d_chalet_grey": "#5e5349",
    "d_stone_wall": "#c6c3ba",     # whitewashed / pale stone foundation
    "d_stone_wall_dark": "#9a968c",
    "d_shutter": "#c39a5c",        # pale honey shutters
    "d_shutter_dark": "#9f7a45",
    "d_plank": "#c8aa77",          # newer planks (bench)
    "d_roof": "#403d3b",
    "d_roof_edge": "#56524e",
    "d_white": "#e2dfd6",
    "d_glass": "#272b2e",
    # Trees
    "d_spruce": "#2c3d28",
    "d_spruce_mid": "#3b5030",
    "d_spruce_light": "#5a6c3e",
    "d_larch": "#d3a13a",
    "d_larch_orange": "#c6822f",
    "d_larch_green": "#a59f4b",
    "d_pine": "#4c5d3b",
    "d_bark_spruce": "#5c5047",
    "d_bark_larch": "#6f5444",
    "d_bark_pine": "#86685a",
    "d_bark_pine_grey": "#7b766e",
    "d_bark_deep": "#3c332d",
    # Backdrop (pre-lit and pre-hazed: drawn unlit)
    "d_cliff_lit": "#dfbd8e",      # pale limestone in warm evening light
    "d_cliff_lit_pale": "#eedac0",
    "d_cliff_shade": "#8d97a6",    # the same rock in the valley's shade, hazed blue
    "d_cliff_dark": "#7d8899",
    "d_scree": "#b4b2ad",
    "d_forest_far": "#2f3d35",     # far spruce slopes in shade, hazed
    "d_forest_far_lit": "#6f7449",
    "d_larch_far": "#b3954f",
    "d_sky_horizon": "#d5e0ea",    # keep in sync with src/render/venues.ts (derborence sky.horizon)
}
HEX.update(HEX_DERBORENCE)

# Linear versions, `P["ochre"]` etc.
P: dict[str, Color] = {k: lin(v) for k, v in HEX.items()}
