"""
Play Store feature graphic (1024 x 500, opaque PNG): the feature_scene.py render plus the
"Pétanque" logotype in the game's Fredoka (same treatment as the menu title: white letters on a
terracotta extrusion) and a Nunito tagline.

    art/.venv/bin/python art/branding/feature.py             # render (2x, ~10 min) + compose
    art/.venv/bin/python art/branding/feature.py --preview   # quick low-res/low-sample render
    art/.venv/bin/python art/branding/feature.py --reuse     # only recompose the cached render
"""
from __future__ import annotations

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from imaging import ROOT, font, hex_rgb, save_rgb  # noqa: E402

CACHE = os.path.join(tempfile.gettempdir(), "petanque-branding")
OUT = os.path.join(ROOT, "store", "feature-graphic.png")
W, H = 1024, 500
SCALE = 2          # render at 2x, downsample
SAMPLES = 96

TITLE = "Pétanque"
TAGLINE = "Boules in the village square"
TITLE_PX = 132                 # cap height ~ 0.19 of the graphic height
TITLE_POS = (0.075, 0.24)      # top-left of the title, as fractions of W, H (safe margins)
EXTRUDE = "#b5532c"            # terracotta (a touch deeper/less saturated than the UI's --terracotta)
INK = "#262130"                # UI --ink, for the tagline


def render(path: str, preview: bool) -> None:
    import stage  # first: puts art/ on sys.path for lib.*
    import feature_scene

    stage.reset()
    feature_scene.build()
    k = 1 if preview else SCALE
    stage.setup_render(W * k, H * k, samples=16 if preview else SAMPLES)
    stage.render(path)


def logotype(img: Image.Image) -> Image.Image:
    """Title with a solid extrusion (stacked offsets) and a soft drop shadow, then a tagline pill."""
    s = img.width / W
    f = font(int(TITLE_PX * s), "fredoka", 650)
    x, y = TITLE_POS[0] * img.width, TITLE_POS[1] * img.height
    depth = int(9 * s)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((x + 4 * s, y + depth + 8 * s), TITLE, font=f, fill=(40, 20, 10, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10 * s))
    d = ImageDraw.Draw(layer)
    ex = hex_rgb(EXTRUDE)
    for i in range(depth, 0, -1):
        d.text((x, y + i), TITLE, font=f, fill=(*ex, 255))
    d.text((x, y), TITLE, font=f, fill=(255, 255, 255, 255))

    # tagline in a white pill under the title
    tf = font(int(27 * s), "nunito", 800)
    tb = d.textbbox((0, 0), TAGLINE, font=tf)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    title_box = d.textbbox((x, y), TITLE, font=f)
    px, py = 18 * s, 10 * s
    cx = (title_box[0] + title_box[2]) / 2
    top = title_box[3] + depth + 22 * s
    pill = (cx - tw / 2 - px, top, cx + tw / 2 + px, top + th + 2 * py)
    pill_shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(pill_shadow).rounded_rectangle((pill[0], pill[1] + 4 * s, pill[2], pill[3] + 4 * s),
                                                  radius=(pill[3] - pill[1]) / 2, fill=(40, 20, 10, 90))
    shadow.alpha_composite(pill_shadow.filter(ImageFilter.GaussianBlur(6 * s)))
    d.rounded_rectangle(pill, radius=(pill[3] - pill[1]) / 2, fill=(255, 255, 255, 240))
    d.text((cx - tw / 2 - tb[0], top + py - tb[1]), TAGLINE, font=tf, fill=(*hex_rgb(INK), 255))

    out = img.convert("RGBA")
    out.alpha_composite(shadow)
    out.alpha_composite(layer)
    return out


def main(argv) -> None:
    preview = "--preview" in argv
    os.makedirs(CACHE, exist_ok=True)
    raw = os.path.join(CACHE, "feature_preview.png" if preview else "feature_raw.png")
    if "--reuse" not in argv:
        render(raw, preview)
    img = Image.open(raw).convert("RGB")
    img = logotype(img)
    img = img.resize((W, H), Image.LANCZOS)
    path = OUT if not preview else os.path.join(CACHE, "feature_preview_logo.png")
    save_rgb(img, path)
    print(f"[feature] wrote {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
