"""Contact sheet of the icon outputs at real display sizes (for review), written to argv[1]."""
import os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from imaging import ROOT, hex_rgb
from icon import ICON_BG
I = lambda p: Image.open(os.path.join(ROOT, p)).convert("RGBA")
sheet = Image.new("RGBA", (1400, 760), (236, 236, 240, 255))
dark = Image.new("RGBA", (700, 180), (34, 36, 44, 255)); sheet.paste(dark, (700, 560))
d = ImageDraw.Draw(sheet)
def put(img, x, y, size=None, mask=None):
    if size: img = img.resize((size, size), Image.LANCZOS)
    if mask == "circle":
        m = Image.new("L", (img.width * 4, img.height * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
        img = img.copy(); img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", img.size, 0), m.resize(img.size, Image.LANCZOS)))
    sheet.alpha_composite(img, (x, y))
put(I("public/icons/icon-512.png"), 10, 10, 256); d.text((10, 270), "icon-512 (any)", fill="black")
put(I("public/icons/maskable-512.png"), 280, 10, 256, "circle"); d.text((280, 270), "maskable in circle", fill="black")
mk = I("public/icons/maskable-512.png").resize((256, 256)); ImageDraw.Draw(mk).ellipse((26, 26, 230, 230), outline="white", width=2)
put(mk, 550, 10); d.text((550, 270), "maskable + 80% safe circle", fill="black")
ad = Image.new("RGBA", (432, 432), (*hex_rgb(ICON_BG), 255)); ad.alpha_composite(I("store/adaptive-foreground-432.png"))
ad = ad.crop((72, 72, 360, 360)); put(ad, 820, 10, 256, "circle"); d.text((820, 270), "adaptive (fg on bg, 72dp, circle)", fill="black")
put(I("store/splash-512.png"), 1090, 10, 256); d.text((1090, 270), "splash-512", fill="black")
x = 10
for s in (48, 64, 96, 128):
    put(I("public/icons/icon-512.png"), x, 300, s); x += s + 20
for s in (48, 64, 96, 128):
    put(I("public/icons/maskable-512.png"), x, 300, s, "circle"); x += s + 20
d.text((10, 440), "home-screen sizes 48/64/96/128: any, then maskable(circle)", fill="black")
put(I("public/icons/favicon-32.png"), 10, 470); put(I("public/icons/favicon-32.png"), 60, 470, 96)
d.text((10, 570), "favicon-32 (1x and 3x)", fill="black")
put(I("public/icons/apple-touch-icon.png"), 200, 470, 180); d.text((200, 655), "apple-touch 180", fill="black")
put(I("public/icons/monochrome-512.png"), 720, 570, 160); put(I("public/icons/monochrome-512.png"), 900, 620, 48)
sheet.save(sys.argv[1])
