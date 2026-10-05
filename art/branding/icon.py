"""
App icon + Play Store icon set, from one Blender scene (icon_scene.py).

    art/.venv/bin/python art/branding/icon.py            # render (~4 min) + write every output
    art/.venv/bin/python art/branding/icon.py --reuse    # only recompose from the cached renders

Renders (cached in $TMPDIR/petanque-branding/):
  icon_master.png  the scene with its gravel ground (square, wide)
  icon_fg.png      the balls + their shadows on transparent (ground = shadow catcher)
  icon_layout.json the balls' on-screen circles + groove lines (for the vector versions)
Writes:
  public/icons/icon-192.png, icon-512.png          purpose "any": rounded square, transparent corners
  public/icons/maskable-192.png, maskable-512.png  full bleed, subject inside the central 80% circle
  public/icons/monochrome-512.png                  white silhouette on transparent (themed icons)
  public/icons/apple-touch-icon.png                180, full bleed, opaque (iOS rounds it)
  public/icons/favicon-32.png, favicon.svg         tiny / vector versions
  store/icon-512.png                               Play Store icon: 512, opaque, full bleed
  store/adaptive-foreground-432.png                Android adaptive-icon foreground (Bubblewrap)
  store/splash-512.png                             TWA splash image on the brand background
"""
from __future__ import annotations

import json
import math
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageChops, ImageDraw, ImageFilter  # noqa: E402

from imaging import ROOT, hex_rgb, rounded_mask, save_rgb, save_rgba  # noqa: E402

CACHE = os.path.join(tempfile.gettempdir(), "petanque-branding")
ICONS = os.path.join(ROOT, "public", "icons")
STORE = os.path.join(ROOT, "store")
MASTER_PX = 1536
SAMPLES = 64

# Framing: fraction of the output width the subject's bounding circle spans.
FILL_ANY = 0.84        # rounded "any" icon and Play icon (Play masks the corners itself)
FILL_APPLE = 0.80
FILL_MASKABLE = 0.74   # must stay inside the 80% safe circle
FILL_ADAPTIVE = 0.52   # Android adaptive foreground: 66 dp safe circle of 108 dp = 61% (kept smaller to breathe)
FILL_MONO = 0.56
FILL_SPLASH = 0.56
SHADOW_ALPHA = 0.62    # lightens the caught shadows on the flat-colour versions (adaptive, splash)
FILL_FAVICON = 0.94
CORNER_ANY = 0.22      # corner radius of the "any" icon (fraction of its size)

# Brand colours (sRGB): the icon background (mid ground colour), the splash background.
ICON_BG = "#a95f3a"
SPLASH_BG = "#a95f3a"


# --- rendering (Blender) ----------------------------------------------------------------

def render_all() -> None:
    import bpy  # noqa: F401
    import icon_scene
    import stage
    from mathutils import Vector

    os.makedirs(CACHE, exist_ok=True)
    # 1. master with ground
    stage.reset()
    objs = icon_scene.build(ground=True)
    stage.setup_render(MASTER_PX, MASTER_PX, samples=SAMPLES)
    stage.render(os.path.join(CACHE, "icon_master.png"))

    # layout of the balls in pixels, for the vector versions
    scene = bpy.context.scene
    cam = scene.camera
    cam_loc = cam.matrix_world.translation
    balls = []
    for o in objs:
        if o.name == "ground":
            continue
        name, kind, c, r, _ = next(s for s in icon_scene.SUBJECT if s[0] == o.name)
        (px, py), pr = stage.project(c, r)
        centre = stage.bl(c)
        grooves = []
        if kind == "boule":
            m = o.matrix_world
            for g in (-0.38, 0.38):
                ring, seg = math.sqrt(1 - g * g), []
                for k in range(181):
                    t = 2 * math.pi * k / 180
                    p = m @ Vector((ring * math.cos(t), ring * math.sin(t), g))
                    n = (p - centre).normalized()
                    if n.dot((cam_loc - p).normalized()) > 0.02:
                        seg.append(_px(scene, cam, p))
                    elif seg:
                        grooves.append(seg)
                        seg = []
                if seg:
                    grooves.append(seg)
        balls.append({"name": name, "kind": kind, "x": px, "y": py, "r": pr,
                      "depth": (cam_loc - centre).length, "grooves": grooves})
    with open(os.path.join(CACHE, "icon_layout.json"), "w") as f:
        json.dump({"size": MASTER_PX, "balls": balls}, f, indent=1)

    # 2. balls + shadows on transparent
    stage.reset()
    icon_scene.build(ground=True, shadow_catcher=True)
    stage.setup_render(MASTER_PX, MASTER_PX, samples=SAMPLES, transparent=True)
    stage.render(os.path.join(CACHE, "icon_fg.png"))


def _px(scene, cam, p_bl):
    from bpy_extras.object_utils import world_to_camera_view
    q = world_to_camera_view(scene, cam, p_bl)
    return (q.x * scene.render.resolution_x, (1 - q.y) * scene.render.resolution_y)


# --- layout maths ------------------------------------------------------------------------

def subject_circle(balls) -> tuple[float, float, float]:
    """Smallest circle around all ball discs (Badoiu-Clarkson iterations on their outline points)."""
    pts = [(b["x"] + b["r"] * math.cos(t), b["y"] + b["r"] * math.sin(t))
           for b in balls for t in (2 * math.pi * k / 72 for k in range(72))]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    for i in range(1, 4000):
        fx, fy = max(pts, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        cx += (fx - cx) / (i + 1)
        cy += (fy - cy) / (i + 1)
    r = max(math.hypot(p[0] - cx, p[1] - cy) for p in pts)
    return cx, cy, r


def crop_box(circle, fill: float, nudge=(0.0, 0.0)):
    """Square box (in master px) in which the subject circle spans `fill` of the width. `nudge`
    shifts the box by a fraction of the subject radius (to balance the shadows)."""
    cx, cy, r = circle
    half = r / fill
    cx += nudge[0] * r
    cy += nudge[1] * r
    return (cx - half, cy - half, cx + half, cy + half)


def crop(img: Image.Image, box, size: int) -> Image.Image:
    x0, y0, x1, y1 = box
    if x0 < 0 or y0 < 0 or x1 > img.width or y1 > img.height:
        raise SystemExit(f"crop {box} leaves the {img.width}px master: widen the lens in icon_scene.py")
    return img.resize((size, size), Image.LANCZOS, box=box)


# --- vector versions (monochrome, svg) ---------------------------------------------------

def groove_lines(b, limb: float = 0.9, step: float = 2.0):
    """The ball's groove polylines, densified (points <= `step` master px apart) and trimmed where
    they run close to the silhouette (beyond `limb` x radius from the centre), which reads as a notch."""
    out = []
    for line in b["grooves"]:
        dense = []
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            n = max(1, int(math.hypot(bx - ax, by - ay) / step))
            dense += [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n)]
        seg = []
        for p in dense:
            if math.hypot(p[0] - b["x"], p[1] - b["y"]) < limb * b["r"]:
                seg.append(p)
            elif seg:
                out.append(seg)
                seg = []
        if len(seg) > 1:
            out.append(seg)
    return [s for s in out if len(s) > 4]


def monochrome(balls, box, size: int, ss: int = 4) -> Image.Image:
    """White silhouettes; a transparent gap where a ball passes in front of another, grooves cut out."""
    x0, y0, x1, _ = box
    k = size * ss / (x1 - x0)
    a = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(a)
    gap = 0.07
    for b in sorted(balls, key=lambda b: -b["depth"]):
        x, y, r = (b["x"] - x0) * k, (b["y"] - y0) * k, b["r"] * k
        g = r * gap
        d.ellipse((x - r - g, y - r - g, x + r + g, y + r + g), fill=0)
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
        w = r * 0.065
        for line in groove_lines(b):
            for px, py in line:  # stamped dots: a smooth round-capped stroke
                qx, qy = (px - x0) * k, (py - y0) * k
                d.ellipse((qx - w, qy - w, qx + w, qy + w), fill=0)
    a = a.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(a)
    return out


FILLS = {  # radial gradient stops (highlight, mid, rim) for the vector balls
    "boule_blue": ("#f4f8ff", "#7f9fd2", "#2c3a55"),
    "boule_red": ("#fff2e8", "#d09a7a", "#5e3424"),
    "jack": ("#fff3b0", "#f4c21c", "#a8780a"),
}


def svg(balls, box, ground_center: str, ground_edge: str) -> str:
    """Vector favicon: rounded square of gravel colour, soft shadows, gradient balls with grooves."""
    x0, y0, x1, _ = box
    k = 64 / (x1 - x0)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">', "<defs>",
           f'<radialGradient id="bg" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="{ground_center}"/>'
           f'<stop offset="1" stop-color="{ground_edge}"/></radialGradient>',
           '<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>']
    for name, (hi, mid, rim) in FILLS.items():
        out.append(f'<radialGradient id="{name}" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="{hi}"/>'
                   f'<stop offset="0.45" stop-color="{mid}"/><stop offset="1" stop-color="{rim}"/></radialGradient>')
    out.append("</defs>")
    out.append('<rect width="64" height="64" rx="14" fill="url(#bg)"/>')
    order = sorted(balls, key=lambda b: -b["depth"])
    for b in order:  # shadows first (sun from the top left)
        x, y, r = (b["x"] - x0) * k, (b["y"] - y0) * k, b["r"] * k
        out.append(f'<ellipse cx="{x + r * 0.55:.2f}" cy="{y + r * 0.62:.2f}" rx="{r * 1.05:.2f}" ry="{r * 0.8:.2f}" '
                   f'fill="#2a120a" opacity="0.5" filter="url(#blur)"/>')
    for b in order:
        x, y, r = (b["x"] - x0) * k, (b["y"] - y0) * k, b["r"] * k
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="url(#{b["name"]})"/>')
        for line in groove_lines(b, step=12.0):
            pts = " ".join(f"{(px - x0) * k:.2f},{(py - y0) * k:.2f}" for px, py in line + [line[-1]])
            out.append(f'<polyline points="{pts}" fill="none" stroke="#1a1c20" stroke-width="{r * 0.1:.2f}" stroke-linecap="round"/>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def _soften_shadows(fg: Image.Image, balls) -> Image.Image:
    """Scales the alpha of everything outside the balls (the caught shadows) by SHADOW_ALPHA."""
    m = Image.new("L", fg.size, 0)
    d = ImageDraw.Draw(m)
    for b in balls:
        r = b["r"] + 1.5
        d.ellipse((b["x"] - r, b["y"] - r, b["x"] + r, b["y"] + r), fill=255)
    a = fg.getchannel("A")
    soft = a.point(lambda v: int(v * SHADOW_ALPHA))
    out = fg.copy()
    out.putalpha(Image.composite(a, soft, m))
    return out


# --- outputs -----------------------------------------------------------------------------

def compose() -> None:
    master = Image.open(os.path.join(CACHE, "icon_master.png")).convert("RGB")
    fg = Image.open(os.path.join(CACHE, "icon_fg.png")).convert("RGBA")
    with open(os.path.join(CACHE, "icon_layout.json")) as f:
        balls = json.load(f)["balls"]
    fg = _soften_shadows(fg, balls)
    circle = subject_circle(balls)
    nudge = (0.05, 0.06)  # a little toward the shadows (lower right), for visual balance

    def full(fill, size):
        return crop(master, crop_box(circle, fill, nudge), size)

    def rounded(fill, size):
        img = full(fill, size).convert("RGBA")
        img.putalpha(rounded_mask(size, CORNER_ANY))
        return img

    for s in (192, 512):
        save_rgba(rounded(FILL_ANY, s), os.path.join(ICONS, f"icon-{s}.png"))
        save_rgb(full(FILL_MASKABLE, s), os.path.join(ICONS, f"maskable-{s}.png"))
    save_rgb(full(FILL_APPLE, 180), os.path.join(ICONS, "apple-touch-icon.png"))
    # Play asks for a 32-bit PNG: RGBA, but fully opaque (Play applies its own rounded mask)
    save_rgba(full(FILL_ANY, 512).convert("RGBA"), os.path.join(STORE, "icon-512.png"))
    # favicon: from a 4x supersampled crop, a slightly sharpened 32 px
    fav = rounded(FILL_FAVICON, 128).resize((32, 32), Image.LANCZOS)
    save_rgba(fav.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0)), os.path.join(ICONS, "favicon-32.png"))

    mono_box = crop_box(circle, FILL_MONO)
    save_rgba(monochrome(balls, mono_box, 512), os.path.join(ICONS, "monochrome-512.png"))

    # adaptive foreground: transparent, subject inside the 66 dp safe circle
    adaptive_box = crop_box(circle, FILL_ADAPTIVE, nudge)
    save_rgba(crop(fg, adaptive_box, 432), os.path.join(STORE, "adaptive-foreground-432.png"))

    # splash: balls + shadows on the flat brand colour
    splash_fg = crop(fg, crop_box(circle, FILL_SPLASH, nudge), 512)
    splash = Image.new("RGBA", (512, 512), (*hex_rgb(SPLASH_BG), 255))
    splash.alpha_composite(splash_fg)
    save_rgb(splash, os.path.join(STORE, "splash-512.png"))

    with open(os.path.join(ICONS, "favicon.svg"), "w") as f:
        f.write(svg(balls, crop_box(circle, FILL_FAVICON - 0.04, nudge), "#c97a4c", "#8f4528"))
    print("[icon] wrote public/icons/* and store/icon-512.png, adaptive-foreground-432.png, splash-512.png")


def main(argv) -> None:
    if "--reuse" not in argv:
        render_all()
    compose()


if __name__ == "__main__":
    main(sys.argv[1:])
