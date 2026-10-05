"""Captioned Play screenshots: a terracotta band with the caption (the game's Fredoka) above the plain
screenshot, which is scaled down a little so the HUD stays fully visible.

    art/.venv/bin/python store/screenshots-src/caption.py [screenshots-dir] [out-dir]
    (defaults: store/screenshots -> store/screenshots-captioned; both hold <lang>/01..06.png, 1080x1920)

Fonts come from public/fonts via art/branding/imaging.py (needs Pillow, fontTools, brotli in art/.venv).
The caption size is the largest at which every caption of every language fits in two lines of <= 940 px.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'art', 'branding'))
import imaging  # noqa: E402

NB = '\u00a0'  # French: no-break space before ?
CAPTIONS = {
    'en': ['Pull, aim, release.', 'Real physics. Real pétanque.', 'Point closer than your rival', 'Every centimetre counts', 'Point or shoot?', 'Play the computer or a friend — offline'],
    'fr': ['Tirez, visez, relâchez.', 'Physique réaliste. Vraie pétanque.', 'Pointez plus près que l’adversaire', 'Chaque centimètre compte', f'Pointer ou tirer{NB}?', 'Jouez contre l’ordinateur ou un ami — hors ligne'],
    'es': ['Tira, apunta, suelta.', 'Física real. Petanca real.', 'Arrima más que tu rival', 'Cada centímetro cuenta', '¿Arrimar o tirar?', 'Juega contra el ordenador o un amigo — sin conexión'],
    'it': ['Tira, mira, rilascia.', 'Fisica reale. Vera petanque.', 'Accosta più dell’avversario', 'Ogni centimetro conta', 'Accostare o bocciare?', 'Gioca contro il computer o un amico — offline'],
    'pt': ['Puxe, aponte, solte.', 'Física real. Petanca real.', 'Fique mais perto que o rival', 'Cada centímetro conta', 'Apontar ou atirar?', 'Jogue contra o computador ou um amigo — offline'],
}
W, H = 1080, 1920
BAND = (169, 95, 58)        # #a95f3a
BAND_DARK = (143, 77, 45)   # slightly deeper at the bottom for depth
TOP = 330                    # band height (text area)
BOTTOM_PAD = 56
SIDE_MIN = 70                # text side padding
WEIGHT = 650
ONE_LINE_MAX = 880            # longer captions are split in two balanced lines


def wrap2(draw, text, fnt, maxw):
    """Split into 1-2 balanced lines; None if it does not fit in two."""
    if draw.textlength(text, font=fnt) <= ONE_LINE_MAX:
        return [text]
    words = text.split(' ')
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        w = max(draw.textlength(a, font=fnt), draw.textlength(b, font=fnt))
        if w <= maxw and (best is None or w < best[0]):
            best = (w, [a, b])
    return best[1] if best else None


def fit_size(draw, texts, maxw, hi=100, lo=40):
    for s in range(hi, lo - 1, -1):
        fnt = imaging.font(s, 'fredoka', WEIGHT)
        if all(wrap2(draw, t, fnt, maxw) for t in texts):
            return s
    raise SystemExit('captions do not fit')


def compose(shot_path, caption, size, out_path):
    base = Image.new('RGB', (W, H), BAND)
    # subtle vertical gradient
    grad = Image.linear_gradient('L').resize((W, H))
    dark = Image.new('RGB', (W, H), BAND_DARK)
    base = Image.composite(dark, base, grad.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(base)
    maxw = W - 2 * SIDE_MIN
    fnt = imaging.font(size, 'fredoka', WEIGHT)
    lines = wrap2(d, caption, fnt, maxw)
    assert lines, caption
    lh = int(size * 1.12)
    block = lh * len(lines)
    y = (TOP - block) // 2 + int(size * 0.02)
    for ln in lines:
        w = d.textlength(ln, font=fnt)
        # soft shadow then text
        d.text(((W - w) / 2, y + 3), ln, font=fnt, fill=(110, 58, 32))
        d.text(((W - w) / 2, y), ln, font=fnt, fill=(255, 255, 255))
        y += lh
    shot = Image.open(shot_path).convert('RGB')
    ah = H - TOP - BOTTOM_PAD
    sc = ah / shot.height
    sw = round(shot.width * sc)
    shot = shot.resize((sw, ah), Image.LANCZOS)
    x = (W - sw) // 2
    # rounded corners + shadow
    r = 46
    mask = Image.new('L', (sw * 3, ah * 3), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw * 3 - 1, ah * 3 - 1), radius=r * 3, fill=255)
    mask = mask.resize((sw, ah), Image.LANCZOS)
    sh = Image.new('L', (W, H), 0)
    sh.paste(mask, (x, TOP + 14))
    sh = sh.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.45))
    base = Image.composite(Image.new('RGB', (W, H), (70, 36, 20)), base, sh)
    base.paste(shot, (x, TOP), mask)
    base.save(out_path, optimize=True)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'store', 'screenshots')
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'store', 'screenshots-captioned')
    probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    allc = [c for v in CAPTIONS.values() for c in v]
    size = fit_size(probe, allc, W - 2 * SIDE_MIN)
    print('caption font size', size)
    for lang, caps in CAPTIONS.items():
        os.makedirs(os.path.join(dst, lang), exist_ok=True)
        fnt = imaging.font(size, 'fredoka', WEIGHT)
        for i, c in enumerate(caps, 1):
            p = os.path.join(src, lang, f'{i:02d}.png')
            if not os.path.exists(p):
                print('missing', p); continue
            lines = wrap2(probe, c, fnt, W - 2 * SIDE_MIN)
            print(lang, i, len(lines), [round(probe.textlength(l, font=fnt)) for l in lines])
            compose(p, c, size, os.path.join(dst, lang, f'{i:02d}.png'))


if __name__ == '__main__':
    main()
