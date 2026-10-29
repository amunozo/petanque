"""
CrazyGames cover images, from the feature_scene.py render: 1920x1080 (landscape), 800x1200
(portrait) and 800x800 (square), opaque RGB PNG, with the "Pétanque" logotype (the feature
graphic's white letters on a terracotta extrusion) and nothing else - CrazyGames allows no other
text, borders, icons or logos, and overlays its own labels on the top-left corner, which stays
clear of the title and of the boules.

Each aspect gets its own camera (position, lens, focus) and render resolution - no cropping of a
wide render into a portrait - and is rendered at 2x then downsampled.

    art/.venv/bin/python art/branding/covers.py              # render (2x, slow) + compose all three
    art/.venv/bin/python art/branding/covers.py --preview    # quick low-res/low-sample check
    art/.venv/bin/python art/branding/covers.py --only portrait,square
    art/.venv/bin/python art/branding/covers.py --reuse      # only recompose the cached renders
"""
from __future__ import annotations

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import feature  # noqa: E402  (TITLE, EXTRUDE, the logotype treatment, the render cache)
from imaging import ROOT, font, hex_rgb, save_rgb  # noqa: E402

CACHE = feature.CACHE
OUT_DIR = os.path.join(ROOT, "store", "crazygames")
SCALE = 2            # render at 2x, downsample
PREVIEW_SCALE = 0.4  # quick check: same framing, low res, low samples
SAMPLES = feature.SAMPLES        # 96, same as the feature graphic
PREVIEW_SAMPLES = 16

# Framing per aspect (game coords, metres: X right, Y up, camera looks toward -Z). Camera values
# are passed to feature_scene.build(), so the scene itself is the feature graphic's; only the
# framing, the title size/position and the output size change.
#   title_px  font size in design pixels (the image's own width), ~4.28 x px wide for "Pétanque"
#   title_cx  title centre, fraction of the width;  title_top  top of the letters, fraction of the height
ASPECTS = {
    "landscape": {
        "file": "cover-landscape-1920x1080.png",
        "size": (1920, 1080),
        "cam": (0.0, 0.09, 0.78),
        "look_at": (0.2, 0.17, -0.6),
        "lens": 24.0,
        "focus": 0.6,
        "fstop": 5.6,       # the feature graphic is f/2.8; stopped down so the village reads cleanly
        "shift": (0.0, 0.0),
        "title_px": 210,        # ~47% of the width; bottom-left, over the sunlit gravel
        "title_top": 0.655,
        "title_cx": 0.295,
    },
    "portrait": {
        "file": "cover-portrait-800x1200.png",
        "size": (800, 1200),
        "cam": (0.28, 0.1, 0.9),
        "look_at": (0.28, 0.1, -1.1),
        "lens": 40.0,
        "focus": 0.66,
        "fstop": 8.0,       # longer lens -> a higher f-stop for the same soft-but-readable background
        "shift": (0.0, 0.0),
        "title_px": 132,        # ~70% of the width; lower third
        "title_top": 0.75,
        "title_cx": 0.5,
    },
    "square": {
        "file": "cover-square-800x800.png",
        "size": (800, 800),
        "cam": (0.28, 0.1, 0.92),
        "look_at": (0.28, 0.1, -1.08),
        "lens": 40.0,
        "focus": 0.68,
        "fstop": 8.0,
        "shift": (0.0, 0.0),
        "title_px": 128,
        "title_top": 0.735,
        "title_cx": 0.5,
    },
}
KEYS = tuple(ASPECTS)


def render(key: str, preview: bool) -> str:
    """Render this aspect's framing at 2x (or PREVIEW_SCALE) into the branding cache."""
    import stage  # first: puts art/ on sys.path for lib.*
    import feature_scene

    spec = ASPECTS[key]
    w, h = spec["size"]
    k = PREVIEW_SCALE if preview else SCALE
    name = f"cover_{key}_preview.png" if preview else f"cover_{key}.png"
    path = os.path.join(CACHE, name)
    os.makedirs(CACHE, exist_ok=True)

    stage.reset()
    feature_scene.build(cam=spec["cam"], look_at=spec["look_at"], lens=spec["lens"],
                        focus_dist=spec["focus"], fstop=spec["fstop"], shift=spec["shift"])
    stage.setup_render(int(w * k), int(h * k), samples=PREVIEW_SAMPLES if preview else SAMPLES)
    stage.render(path)
    return path


def logotype(img: Image.Image, spec: dict) -> Image.Image:
    """The feature graphic's title treatment (Fredoka 650 white letters on a terracotta extrusion,
    with a soft drop shadow), centred horizontally and scaled to this aspect's design size."""
    s = img.width / spec["size"][0]          # compose scale: 2x for the real renders, less for previews
    px = spec["title_px"]
    k = px / feature.TITLE_PX                # same extrusion/shadow ratios as feature.py at any size
    f = font(max(8, int(round(px * s))), "fredoka", 650)
    probe = ImageDraw.Draw(img).textbbox((0, 0), feature.TITLE, font=f)
    x = spec["title_cx"] * img.width - (probe[0] + probe[2]) / 2
    y = spec["title_top"] * img.height - probe[1]
    depth = max(1, int(round(9 * k * s)))

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((x + 4 * k * s, y + depth + 8 * k * s), feature.TITLE, font=f,
                                fill=(40, 20, 10, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10 * k * s))
    d = ImageDraw.Draw(layer)
    ex = hex_rgb(feature.EXTRUDE)
    for i in range(depth, 0, -1):
        d.text((x, y + i), feature.TITLE, font=f, fill=(*ex, 255))
    d.text((x, y), feature.TITLE, font=f, fill=(255, 255, 255, 255))

    out = img.convert("RGBA")
    out.alpha_composite(shadow)
    out.alpha_composite(layer)
    return out


def compose(key: str, raw: str, preview: bool) -> str:
    spec = ASPECTS[key]
    img = logotype(Image.open(raw).convert("RGB"), spec)
    if not preview:
        img = img.resize(spec["size"], Image.LANCZOS)
        path = os.path.join(OUT_DIR, spec["file"])
    else:
        path = os.path.join(CACHE, f"cover_{key}_preview_logo.png")
    save_rgb(img, path)
    return path


def main(argv) -> None:
    preview = "--preview" in argv
    keys = KEYS
    if "--only" in argv:
        keys = tuple(a for a in argv[argv.index("--only") + 1].split(",") if a)
        for key in keys:
            if key not in ASPECTS:
                raise SystemExit(f"unknown --only {key!r} (one of {', '.join(KEYS)})")
    written = []
    for key in keys:
        raw = os.path.join(CACHE, f"cover_{key}_preview.png" if preview else f"cover_{key}.png")
        if "--reuse" not in argv:
            render(key, preview)
        if not os.path.exists(raw):
            raise SystemExit(f"missing cached render {raw} (run without --reuse)")
        written.append(compose(key, raw, preview))
    for path in written:
        with Image.open(path) as im:
            print(f"[covers] {path}  {im.width}x{im.height} {im.mode} {os.path.getsize(path) // 1024} KiB")


if __name__ == "__main__":
    main(sys.argv[1:])
