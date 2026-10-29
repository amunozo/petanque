#!/usr/bin/env python3
"""
CrazyGames gameplay preview videos, recorded from the LIVE production build
(https://petanque.amunozo.com/?portal=crazygames&lang=en&mode=ai&level=medium&seed=17 -
`mode=ai` is the game's own dev shortcut that skips the menu and starts a vs-computer match),
frame-perfect.

Same trick as store/screenshots-src/capture.cjs: the page runs on a *virtual clock*
(requestAnimationFrame / performance.now only move when this script steps them), a fixed
seed drives the vs-computer match and the player's throws are scripted touch drags, so
"0.4 s after release" is the same frame on every run. Frames are grabbed at a fixed 30 fps
of simulated time with CDP screenshots (no cursor, no sound). Script-only tweaks (src/ is
never touched): the build chip is hidden by CSS, the transient HUD toasts / banners / cards
and the "touch here" cue are hidden too (they are real-time timed, so they would pop in and
out between captured frames).

Two outputs (1920x1080 and 1080x1620, H.264 yuv420p, CRF 20, faststart, no audio, 17-19 s):
    store/crazygames/video-landscape-1920x1080.mp4   viewport 1920x1080, DPR 1
    store/crazygames/video-portrait-1080x1620.mp4    viewport  540x810,  DPR 2

Usage
    python3 store/video-src/record.py                 # record both + compose
    python3 store/video-src/record.py --only portrait
    python3 store/video-src/record.py --compose-only  # rebuild the MP4s from the cached
                                                      # frames (+ covers, if they exist yet)
    python3 store/video-src/record.py --probe         # quick low-res run, sparse stills only
    URL='https://petanque.amunozo.com/?portal=crazygames&mode=ai&level=medium&seed=17' python3 store/video-src/record.py

Environment (outside the repo; nothing is added to package.json):
    python3 -m venv --system-site-packages ~/.cache/petanque-video-venv
    ~/.cache/petanque-video-venv/bin/pip install imageio-ffmpeg pillow   # ffmpeg + Pillow
    ~/.cache/petanque-video-venv/bin/python -m playwright install chromium

Covers: if store/crazygames/cover-landscape-1920x1080.png (1920x1080) and/or
store/crazygames/cover-portrait-800x1200.png (800x1200, resized to 1080x1620) exist, the video
opens with the cover held 0.7 s and a 0.3 s crossfade into the gameplay. They may appear after
the recording, so `--compose-only` rebuilds the MP4s from the cached frames without recapturing.

Frames, composed sequences and sample stills live in ~/.cache/petanque-video (outside the repo).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "store" / "crazygames"
CACHE = Path(os.environ.get("PETANQUE_VIDEO_CACHE") or (Path.home() / ".cache" / "petanque-video"))

FPS = 30
DEFAULT_URL = "https://petanque.amunozo.com/?portal=crazygames&lang=en&mode=ai&level=medium&seed=17"

VIDEOS = {
    "landscape": {
        "w": 1920,
        "h": 1080,
        "dpr": 1,
        "cover": "cover-landscape-1920x1080.png",
        "cover_size": (1920, 1080),
        "out": "video-landscape-1920x1080.mp4",
    },
    "portrait": {
        "w": 540,
        "h": 810,
        "dpr": 2,
        "cover": "cover-portrait-800x1200.png",
        "cover_size": (1080, 1620),
        "out": "video-portrait-1080x1620.mp4",
    },
}

# Intro (only when a cover exists): 0.7 s still, then a 0.3 s crossfade into the gameplay.
COVER_HOLD = 21  # frames
XFADE = 9  # frames
SAMPLE_TIMES = (1.5, 8.0, 15.5)  # seconds into the finished video (PNG stills, for inspection)

# ---- the scripted sequence (frames of simulated time) -------------------------------------
PULL = 9  # frames of the finger pulling the sling down (the aim preview grows)
HOLD = 6  # frames held at full pull
POST = 90  # frames after the release (flight, roll, settle, first second of the close-up)
AI_AIM = 15  # frames of the computer's aim preview (it shows it for 0.7 s)
AI_POST = 85  # frames after the computer's release

# Drags are fractions of the viewport height (full power = 0.3 * height, see gestures.ts), so the
# portrait and the landscape run throw identical balls. +dx pulls right -> the throw goes left.
THROWS = {
    # label: (loft, pull dy, sideways dx)
    "jack": ("half", 0.200, 0.000),
    "a1": ("lob", 0.234, 0.000),
    "a2": ("half", 0.203, 0.022),
    "a3": ("shoot", 0.240, 0.000),
}

LOFT_INDEX = {"roll": 0, "half": 1, "lob": 2, "shoot": 3}
MINE = ("Your turn", "You throw jack")  # English (portal default)

HIDE_CSS = """
.mn-build,.hud-build,.hud-sheet-build{visibility:hidden!important}
.mh-msg,.mh-notice,.mh-banner,.mh-card,.touch-hint{display:none!important}
"""

VIRTUAL_CLOCK = """(() => {
  let vt = performance.now();
  performance.now = () => vt;
  const q = [];
  let id = 0;
  window.requestAnimationFrame = (cb) => (q.push(cb), ++id);
  window.cancelAnimationFrame = () => {};
  window.__vt = () => vt;
  window.__step = (dt, n) => {
    for (let i = 0; i < n; i++) {
      vt += dt;
      for (const cb of q.splice(0)) cb(vt);
    }
  };
})()"""

PREFS = """(() => {
  if (sessionStorage.getItem('init')) return;
  localStorage.clear();
  localStorage.setItem('petanque.howtoSeen', '1');   // no first-launch how-to
  localStorage.setItem('petanque.tuning.v1', JSON.stringify({}));  // official defaults
  sessionStorage.setItem('init', '1');
})()"""


def log(*a: object) -> None:
    print(*a, flush=True)


# ---- one browser session -----------------------------------------------------------------
class Session:
    def __init__(self, page, cdp, out: Path, probe: bool, w: int, h: int) -> None:
        self.p = page
        self.cdp = cdp
        self.out = out
        self.probe = probe
        self.stride = 15 if probe else 1
        self.w = w
        self.h = h
        self.total = 0  # frames of simulated time since the sequence started
        self.seg = "start"
        self.t0 = time.time()

    # -- clock -------------------------------------------------------------------------------
    async def steps(self, n: int = 1) -> None:
        await self.p.evaluate("(n) => window.__step(1000 / 30, n)", n)

    async def adv(self, seconds: float, dt: float = 0.2) -> None:
        """Skips `seconds` of simulated time (no frames kept)."""
        n = max(1, round(seconds / dt))
        done = 0
        while done < n:
            k = min(5, n - done)
            await self.p.evaluate("([d, k]) => window.__step(d * 1000, k)", [dt, k])
            done += k

    async def vt(self) -> float:
        return await self.p.evaluate("() => window.__vt() / 1000")

    # -- frames ------------------------------------------------------------------------------
    async def frame(self) -> None:
        """Keeps the frame that was just rendered."""
        r = await self.cdp.send(
            "Page.captureScreenshot",
            {"format": "jpeg", "quality": 95, "optimizeForSpeed": True, "captureBeyondViewport": False},
        )
        name = f"{self.seg}-{self.total:05d}.jpg" if self.probe else f"{self.total:05d}.jpg"
        (self.out / name).write_bytes(base64.b64decode(r["data"]))

    async def rec(self, n: int) -> None:
        """Keeps the next `n` frames of simulated time (1/30 s apart). A probe keeps every 15th."""
        while n > 0:
            k = min(self.stride, n)
            await self.steps(k)
            await self.frame()
            self.total += k
            n -= k

    # -- page state --------------------------------------------------------------------------
    async def js(self, expr: str, arg=None):
        return await self.p.evaluate(expr, arg) if arg is not None else await self.p.evaluate(expr)

    async def state(self) -> dict:
        """What the page exposes: the turn chip, the computer's phase, the result dwell, the boules left."""
        return await self.js(
            """() => {
              const app = document.getElementById('app');
              const ms = document.querySelector('.ms-root');
              return {
                chip: (document.querySelector('.mh-chip-text')?.textContent || '').trim(),
                ai: app.dataset.ai || '',
                dwell: app.dataset.dwell === '1',
                measuring: !!ms && !ms.hidden,
                boules: [...document.querySelectorAll('.mh-row .mh-dots')].map((e) => e.getAttribute('aria-label') || '').join('|'),
              };
            }"""
        )

    async def mine(self) -> bool:
        """The human may throw now: their turn line, the camera back behind the circle, nothing in the way."""
        st = await self.state()
        return not st["ai"] and not st["dwell"] and not st["measuring"] and any(m in st["chip"] for m in MINE)

    async def ai_state(self) -> str:
        return await self.js("() => document.getElementById('app').dataset.ai || ''")

    async def until(self, fn, maxs: float, dt: float = 0.2) -> bool:
        waited = 0.0
        while waited <= maxs:
            if await fn():
                return True
            await self.adv(dt, dt)
            waited += dt
        return False

    async def wait_turn(self, maxs: float = 90) -> None:
        waited = 0.0
        while waited <= maxs:
            if await self.mine():
                return
            st = await self.state()
            log(f"    waiting for the human turn (vt {await self.vt():5.1f}): {st}")
            await self.adv(2.0)
            waited += 2.0
        raise RuntimeError(f"[{self.seg}] no human turn (vt {await self.vt():.1f})")

    # -- input -------------------------------------------------------------------------------
    async def touch(self, kind: str, pts: list[dict]) -> None:
        await self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

    async def set_loft(self, loft: str) -> None:
        box = await self.p.locator(".lp-btn").nth(LOFT_INDEX[loft]).bounding_box()
        await self.p.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await self.steps(1)
        ok = await self.js("(i) => document.querySelectorAll('.lp-btn')[i].getAttribute('aria-checked') === 'true'", LOFT_INDEX[loft])
        if not ok:
            raise RuntimeError(f"[{self.seg}] loft picker did not take '{loft}'")

    async def drag_to(self, x: float, y: float) -> None:
        await self.touch("touchMove", [{"x": x, "y": y, "id": 1}])

    def snapshot(self) -> dict:
        """Marks the kept frames, so a gesture the game ignored can be dropped and retried."""
        return {"total": self.total, "files": {f.name for f in self.out.iterdir()}}

    def rollback(self, snap: dict) -> None:
        for f in self.out.iterdir():
            if f.name not in snap["files"]:
                f.unlink()
        self.total = snap["total"]

    # -- the two kinds of turn ---------------------------------------------------------------
    async def human_throw(self, label: str, pre: float = 2.0) -> None:
        """Waits for the human's turn, aims with a captured sling pull and keeps the flight."""
        loft, fdy, fdx = THROWS[label]
        self.seg = label
        for attempt in range(1, 4):
            await self.wait_turn()
            await self.adv(pre)  # the camera glides back behind the circle
            if not await self.mine():  # a result dwell started meanwhile: wait for it to end
                await self.wait_turn()
                await self.adv(pre)
            await self.set_loft(loft)
            snap = self.snapshot()
            before = await self.state()
            x, y = self.w * 0.5, self.h * 0.42
            await self.touch("touchStart", [{"x": x, "y": y, "id": 1}])
            await self.steps(1)
            # the finger pulls down (and a little sideways): the aim preview grows, then the throw
            for i in range(1, PULL + 1):
                f = (0.03 + (fdy - 0.03) * i / PULL) * self.h
                await self.drag_to(x + fdx * self.h * i / PULL, y + f)
                await self.rec(1)
            await self.rec(HOLD)
            await self.touch("touchEnd", [])
            await self.rec(POST)
            # the throw was taken if the turn line or the boules left changed by the time it settled
            after = await self.state()
            if after["boules"] != before["boules"] or after["chip"] != before["chip"]:
                log(f"  {label:4s} thrown at vt {await self.vt():6.2f}  frames {self.total}  -> {after['chip']!r}")
                return
            log(f"  {label:4s} was not accepted by the game (attempt {attempt}); retrying")
            self.rollback(snap)
            await self.adv(0.6)
        raise RuntimeError(f"[{self.seg}] the game never accepted the throw")

    async def ai_throw(self) -> None:
        self.seg = "ai"
        if not await self.until(lambda: self._ai_aiming(), 60, 0.1):
            raise RuntimeError("[ai] the computer never aimed")
        await self.rec(AI_AIM)  # its aim preview + the throw itself
        if not await self.until(self._ai_idle, 5, 1 / FPS):
            raise RuntimeError("[ai] the computer never fired")
        await self.rec(AI_POST)
        log(f"  ai   thrown at vt {await self.vt():6.2f}  frames {self.total}")

    async def _ai_aiming(self) -> bool:
        return (await self.ai_state()) == "aiming"

    async def _ai_idle(self) -> bool:
        return (await self.ai_state()) == ""


async def record(name: str, url: str, probe: bool = False) -> Path:
    cfg = VIDEOS[name]
    w, h, dpr = (540, 810, 1) if probe else (cfg["w"], cfg["h"], cfg["dpr"])
    out = CACHE / ("probe" if probe else name) / "frames"
    shutil.rmtree(out.parent, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=[
                "--no-sandbox",
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
            ]
        )
        ctx = await browser.new_context(
            viewport={"width": w, "height": h}, device_scale_factor=dpr, has_touch=True, is_mobile=True
        )
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        await page.add_init_script(PREFS)
        await page.add_init_script(VIRTUAL_CLOCK)
        log(f"[{name}] {url}  {w}x{h} @{dpr}x")
        await page.goto(url)
        await page.add_style_tag(content=HIDE_CSS)
        cdp = await ctx.new_cdp_session(page)
        s = Session(page, cdp, out, probe, w, h)

        await s.adv(1.5)
        await s.wait_turn()

        # 1. the jack
        await s.human_throw("jack")
        # 2. first boule: a lob that lands on the jack
        await s.human_throw("a1")
        # 3. the computer answers
        await s.ai_throw()
        # 4. a point
        await s.human_throw("a2")
        # 5. a shot that knocks a boule
        await s.human_throw("a3")

        frames = s.total
        await ctx.close()
        await browser.close()

    if errors:
        log(f"[{name}] page errors: {json.dumps(errors[:5])}")
    if not probe:
        (out.parent / "meta.json").write_text(
            json.dumps(
                {"frames": frames, "fps": FPS, "width": w * dpr, "height": h * dpr, "url": url, "plan": THROWS},
                indent=2,
            )
        )
    log(f"[{name}] {frames} frames ({frames / FPS:.2f} s of gameplay) -> {out}")
    return out


# ---- cover + mp4 -------------------------------------------------------------------------
def compose(name: str) -> Path | None:
    cfg = VIDEOS[name]
    cache = CACHE / name
    meta_path = cache / "meta.json"
    if not meta_path.exists():
        log(f"[{name}] no cached frames ({meta_path}); run the recorder first")
        return None
    meta = json.loads(meta_path.read_text())
    frames = int(meta["frames"])
    src = cache / "frames"
    build = cache / "build"
    shutil.rmtree(build, ignore_errors=True)
    build.mkdir(parents=True)

    idx = 0
    cover = STORE / cfg["cover"]
    if cover.exists():
        cw, ch = cfg["cover_size"]
        art = Image.open(cover).convert("RGB").resize((cw, ch), Image.LANCZOS)
        cover_jpg = cache / "cover.jpg"
        art.save(cover_jpg, quality=95, subsampling=0)
        log(f"[{name}] cover {cover.name} -> {cw}x{ch}: {COVER_HOLD} frames held + {XFADE} crossfade")
        for _ in range(COVER_HOLD):
            shutil.copyfile(cover_jpg, build / f"{idx:05d}.jpg")
            idx += 1
        for k in range(XFADE):
            with Image.open(src / f"{k:05d}.jpg") as g:
                g = g.convert("RGB").resize((cw, ch), Image.LANCZOS)
                Image.blend(art, g, (k + 1) / (XFADE + 1)).save(build / f"{idx:05d}.jpg", quality=95, subsampling=0)
            idx += 1
        start = XFADE
    else:
        log(f"[{name}] no {cover.name} yet -> gameplay only (rerun --compose-only when it lands)")
        start = 0

    for k in range(start, frames):
        os.symlink((src / f"{k:05d}.jpg").resolve(), build / f"{idx:05d}.jpg")
        idx += 1

    st = STORE / cfg["out"]
    STORE.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", str(FPS), "-i", str(build / "%05d.jpg"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
        str(st),
    ]
    subprocess.run(cmd, check=True)
    log(f"[{name}] {idx} frames ({idx / FPS:.2f} s) -> {st.relative_to(ROOT)}  {st.stat().st_size / 1e6:.1f} MB")
    return st


def verify(path: Path, name: str) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    secs = int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3)) if dur else 0.0
    vid = re.search(r"Video: (\w+).*?(\d{2,5})x(\d{2,5})", out)
    audio = "Audio:" in out
    log(
        f"  {name}: {path.name} {vid.group(2)}x{vid.group(3)} {vid.group(1)} "
        f"{secs:.2f} s {path.stat().st_size / 1e6:.1f} MB audio={'yes' if audio else 'no'}"
    )
    if audio:
        raise RuntimeError(f"{path} has an audio stream")
    if not 17 <= secs <= 19:
        log(f"  WARNING: {name} is {secs:.2f} s (wanted 17-19 s)")
    if path.stat().st_size > 50e6:
        log(f"  WARNING: {name} is over 50 MB")

    samples = CACHE / "samples"
    samples.mkdir(parents=True, exist_ok=True)
    for t in SAMPLE_TIMES:
        png = samples / f"{name}-{t:04.1f}s.png"
        subprocess.run(
            [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{t}", "-i", str(path),
             "-frames:v", "1", str(png)],
            check=True,
        )
        log(f"  sample frame: {png}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Record the CrazyGames preview videos from the live site.")
    ap.add_argument("--only", choices=sorted(VIDEOS), help="record just one video")
    ap.add_argument("--compose-only", action="store_true", help="rebuild the MP4s from cached frames (+ covers)")
    ap.add_argument("--probe", action="store_true", help="fast low-res dry run, sparse stills (quality check)")
    ap.add_argument("--url", default=os.environ.get("URL", DEFAULT_URL))
    args = ap.parse_args()

    names = [args.only] if args.only else ["portrait", "landscape"]
    if args.probe:
        log("probe run (540x810, every 15th frame) -> " + str(CACHE / "probe"))
        asyncio.run(record("portrait", args.url, probe=True))
        return

    if not args.compose_only:
        for n in names:
            asyncio.run(record(n, args.url))
    for n in names:
        out = compose(n)
        if out:
            verify(out, n)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
