/**
 * Google Play phone screenshots from the real production build.
 *
 *   npm run build && npx vite preview --port 4180 &        # serves dist/
 *   node store/screenshots-src/capture.cjs en fr es it pt   # -> store/screenshots/<lang>/01..06.png (1080x1920)
 *   art/.venv/bin/python store/screenshots-src/caption.py   # -> store/screenshots-captioned/<lang>/01..06.png
 *
 * Playwright Chromium (software GL), viewport 360x640 CSS px, deviceScaleFactor 3, mobile + touch.
 * Everything is reproducible: a fixed seed and a scripted set of throws in a vs-computer match, and the page
 * runs on a *virtual clock* (requestAnimationFrame / performance.now only move when this script steps them), so
 * "a lob 0.4 s after release" is the same frame every time. Script-only tweaks (nothing in src/ is touched):
 * the dev/build-id chip is hidden by CSS, the 4.2 s toast timer is stretched (a 3x screenshot takes seconds),
 * the first-launch how-to is marked seen, localStorage is cleared first.
 *
 * Env: PREVIEW_URL (default http://localhost:4180/), PLAYWRIGHT_DIR, CHROME, SEED, PLAN (JSON), RAW_DIR.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = process.env.PREVIEW_URL || 'http://localhost:4180/';
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node-tools/node_modules/playwright');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RAW = process.env.RAW_DIR || path.join(os.tmpdir(), 'petanque-shots');
const OUT = path.join(ROOT, 'store', 'screenshots');
const W = 360;
const H = 640;
const DPR = 3;

/** Match seed and the human's throws [loft, dx px, dy px] (pull-down drags; see src/input/gestures.ts). */
const SEED = Number(process.env.SEED || 17);
const PLAN = JSON.parse(process.env.PLAN || '{"jack":["half",0,128],"a1":["lob",0,150],"a2":["roll",14,130],"a3":["half",-14,130]}');
/** Which captured frame becomes which store screenshot. */
const PICK = { '01': 'a1-aim', '02': 'a1-t040', '03': 'a2-toast2', '04': 'm-card0', '05': 'ai2-aim', '06': 'menu' };
const LOFT = { roll: 0, half: 1, lob: 2, shoot: 3 };

// ---- virtual clock + page helpers ---------------------------------------------------------------------------
const virtualClock = () => {
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
};
const stretchToast = () => {
  const st = window.setTimeout.bind(window);
  window.setTimeout = (f, d, ...a) => st(f, d === 4200 ? 40000 : d, ...a);
};

async function open(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.addInitScript(() => {
    if (sessionStorage.getItem('init')) return;
    localStorage.clear();
    localStorage.setItem('petanque.howtoSeen', '1'); // value the app expects (src/app/prefs.ts)
    localStorage.setItem('petanque.tuning.v1', JSON.stringify({})); // defaults, normal playback speed
    sessionStorage.setItem('init', '1');
  });
  await p.addInitScript(virtualClock);
  await p.addInitScript(stretchToast);
  await p.goto(BASE + query);
  await p.addStyleTag({ content: '.mn-build,.hud-build,.hud-sheet-build{visibility:hidden!important}' });
  const cdp = await ctx.newCDPSession(p);
  const tp = (x, y) => [{ x, y, id: 1 }];
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const o = { ctx, p, errs };
  o.step = (dt, n = 1) => p.evaluate(([d, k]) => window.__step(d * 1000, k), [dt, n]);
  o.adv = async (sec, dt = 0.1) => {
    const n = Math.max(1, Math.round(sec / dt));
    for (let i = 0; i < n; i += 5) await o.step(dt, Math.min(5, n - i));
  };
  /** Steps the clock until fn() is true; returns the simulated seconds waited, -1 on timeout. */
  o.until = async (fn, { dt = 0.2, max = 120 } = {}) => {
    for (let t = 0; t <= max; t += dt) {
      if (await fn()) return t;
      await o.step(dt, 1);
    }
    return -1;
  };
  const cx = W / 2;
  const cy = H / 2;
  o.dragHold = async (dy, dx = 0) => {
    await touch('touchStart', tp(cx, cy));
    for (let i = 1; i <= 10; i++) await touch('touchMove', tp(cx + (dx * i) / 10, cy + (dy * i) / 10));
  };
  o.release = () => touch('touchEnd', []);
  o.drag = async (dy, dx = 0) => (await o.dragHold(dy, dx), o.release());
  o.visible = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].some((e) => !e.hidden && e.offsetParent !== null), sel);
  o.msg = () => p.evaluate(() => { const m = document.querySelector('.mh-msg'); return m && !m.hidden ? m.textContent : ''; });
  o.ai = () => p.evaluate(() => document.getElementById('app').dataset.ai || '');
  o.hasCard = () => o.visible('.mh-card');
  o.setLoft = async (loft) => {
    const b = await p.locator('.lp-btn').nth(LOFT[loft]).boundingBox();
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await o.step(0.05, 2);
  };
  return o;
}

// ---- one language ------------------------------------------------------------------------------------------
async function capture(browser, lang) {
  // the human's turn is recognised by the (localised) turn line, read from the message catalogue
  const msgs = fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'messages', `${lang}.ts`), 'utf8');
  const get = (k) => msgs.match(new RegExp(`'${k.replace(/\./g, '\\.')}':\\s*'((?:[^'\\\\]|\\\\.)*)'`))[1].replace(/\\u00a0/g, ' ').replace(/\\'/g, "'");
  const MINE = [get('turn.playYou'), get('turn.jack.chipYou')];
  const dir = path.join(RAW, lang);
  fs.mkdirSync(dir, { recursive: true });

  const r = await open(browser, `?mode=ai&level=medium&seed=${SEED}&lang=${lang}`);
  const t0 = Date.now();
  const vt = () => r.p.evaluate(() => (window.__vt() / 1000).toFixed(1));
  const log = async (...a) => console.log(`[${lang} ${((Date.now() - t0) / 1000).toFixed(0)}s sim ${await vt()}]`, ...a);
  /** Waits (real time) for finite CSS animations/transitions - toast and banner fades, card slide-in - to finish. */
  const settleUI = async () => {
    for (let i = 0; i < 50; i++) {
      const busy = await r.p.evaluate(() => document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
      if (!busy) return;
      await r.p.waitForTimeout(200);
    }
  };
  const shot = async (n) => {
    await settleUI();
    for (let attempt = 1; ; attempt++) {
      try {
        return await r.p.screenshot({ path: path.join(dir, `${n}.png`), timeout: 90000 });
      } catch (e) {
        if (attempt >= 3) throw e;
        console.log(`[${lang}] screenshot ${n} failed (${e.message.split('\n')[0]}), retrying`);
      }
    }
  };
  const mine = () => r.p.evaluate((m) => {
    const c = (document.querySelector('.mh-chip-text')?.textContent || '').trim();
    return !document.getElementById('app').dataset.ai && !document.querySelector('.mh-root.has-card') && m.includes(c);
  }, MINE);
  /** Frames at the given seconds after release (30 fps virtual steps). */
  const flight = async (name, times) => {
    let t = 0;
    for (const T of times) {
      const n = Math.round((T - t) * 30);
      if (n > 0) await r.step(1 / 30, n);
      t = T;
      await shot(`${name}-t${String(Math.round(T * 100)).padStart(3, '0')}`);
    }
  };
  async function humanThrow(name, [loft, dx, dy], flightTimes) {
    if ((await r.until(mine, { dt: 0.25, max: 90 })) < 0) throw new Error(`no human turn for ${name}`);
    await r.adv(2.0, 0.25);
    await r.p.waitForTimeout(600);
    await r.setLoft(loft);
    await r.p.evaluate(() => { const m = document.querySelector('.mh-msg'); if (m) m.hidden = true; }); // the last toast would have timed out by now
    await r.dragHold(dy, dx);
    await r.step(0.05, 4);
    await r.p.waitForTimeout(400);
    await shot(`${name}-aim`);
    await log(name, 'aim');
    await r.release();
    if (flightTimes) await flight(name, flightTimes);
  }
  const untilToast = async (what) => {
    if ((await r.until(async () => (await r.msg()) !== '', { dt: 0.25, max: 40 })) < 0) throw new Error(`no toast after ${what}`);
    await log(`toast after ${what}:`, await r.msg());
  };
  let aiN = 0;
  /** Runs the computer's turns until it is the human's move again, framing its aim + throw. */
  async function watchAI() {
    for (let guard = 0; guard < 600; guard++) {
      if ((await mine()) || (await r.hasCard())) return;
      if ((await r.ai()) === 'aiming') {
        await r.step(0.05, 4);
        await shot(`ai${aiN}-aim`);
        await log(`computer aims (${aiN})`, await r.msg());
        await r.until(async () => (await r.ai()) === '', { dt: 0.05, max: 20 });
        await flight(`ai${aiN}`, [0.3, 0.6, 0.9, 1.2]);
        aiN++;
      }
      await r.step(0.1, 1);
    }
  }

  await r.adv(1.5, 0.25);
  await humanThrow('jack', PLAN.jack, null);
  await untilToast('jack');
  await humanThrow('a1', PLAN.a1, [0.3, 0.35, 0.4, 0.45, 0.5, 0.6]); // 01 aim + 02 lob in flight
  await untilToast('a1');
  await watchAI();
  await humanThrow('a2', PLAN.a2, []);
  await untilToast('a2');
  for (let k = 0; k < 4; k++) { // 03 toast + boules near the jack, before the computer starts aiming
    await r.adv(0.25, 0.05);
    if ((await r.ai()) === 'aiming') break;
    await r.p.waitForTimeout(500);
    await shot(`a2-toast${k}`);
  }
  await watchAI();
  await humanThrow('a3', PLAN.a3, null);
  await r.until(() => r.visible('.ms-root'), { dt: 0.25, max: 90 }); // 04 measuring lines + end card
  for (let k = 0; k < 4; k++) { await r.adv(0.6, 0.1); await shot(`m-lines${k}`); }
  await r.until(() => r.hasCard(), { dt: 0.25, max: 60 });
  await log('end card:', await r.p.evaluate(() => document.querySelector('.mh-card')?.innerText.replace(/\n/g, ' ')));
  for (let k = 0; k < 3; k++) { await r.adv(0.6, 0.1); await shot(`m-card${k}`); }
  const errs = [...r.errs];
  await r.ctx.close();

  const m = await open(browser, `?lang=${lang}`); // 06 start menu
  await m.adv(3, 0.1);
  await m.p.waitForTimeout(500);
  await m.p.screenshot({ path: path.join(dir, 'menu.png'), timeout: 90000 });
  errs.push(...m.errs);
  await m.ctx.close();
  if (errs.length) console.log(lang, 'page errors:', JSON.stringify(errs));

  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  for (const [n, name] of Object.entries(PICK)) fs.copyFileSync(path.join(dir, `${name}.png`), path.join(OUT, lang, `${n}.png`));
  console.log(`[${lang}] done -> ${path.join('store', 'screenshots', lang)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

(async () => {
  const langs = process.argv.slice(2);
  if (!langs.length) throw new Error('usage: node capture.cjs <lang>...  (en fr es it pt)');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const l of langs) await capture(browser, l);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
