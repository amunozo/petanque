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
HEX = {
    # Warm earth
    "ochre": "#d4a259",
    "ochre_light": "#e3bd7c",
    "ochre_dark": "#b4823f",
    "terracotta": "#c4673f",
    "terracotta_dark": "#9a4a2e",
    "dust": "#cdb48c",          # packed earth / court gravel base
    "dust_dark": "#a98c63",
    # Limestone / cream
    "cream": "#efe2c2",
    "limestone": "#dccfb0",
    "limestone_dark": "#b9aa88",
    # Greens
    "sage": "#8da16b",
    "sage_light": "#a9b983",
    "olive": "#6b7a3b",
    "olive_dark": "#4a5a2b",
    "leaf_light": "#a6b650",
    "leaf_mid": "#78994a",
    "leaf_dark": "#4d7440",
    "straw": "#c9b765",         # dry late-summer grass
    # Plane-tree bark
    "bark_khaki": "#8f8765",
    "bark_grey": "#827f74",
    "bark_cream": "#cbc19f",
    "bark_dark": "#5e5646",
    "bark_olive": "#7d7a55",
    # Wood (boards, stakes)
    "timber": "#7c5a38",
    "timber_light": "#9b7649",
    "timber_dark": "#5d4128",
    # Accent + sky
    "lavender": "#8a78b8",
    "lavender_light": "#a897d0",
    "sky_blue": "#7fb1dc",
    "sky_horizon": "#f6dcae",
}

# Linear versions, `P["ochre"]` etc.
P: dict[str, Color] = {k: lin(v) for k, v in HEX.items()}
