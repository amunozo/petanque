import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../tuning/config';
import {
  flickIntent,
  flickPreview,
  slingshotIntent,
  slingshotPreview,
  type Sample,
} from './gestures';

const cfg = { ...defaultConfig.controls }; // fullPowerDragPx 260, maxAim 20, sens 0.6, flick 2500
const DEG = Math.PI / 180;
const start = { x: 200, y: 400 };

describe('slingshotIntent', () => {
  it('straight down pull: aim 0, power by distance', () => {
    const i = slingshotIntent(start, { x: 200, y: 530 }, cfg, 'half');
    expect(i).not.toBeNull();
    expect(i?.aim).toBe(0);
    expect(i?.power).toBeCloseTo(0.5, 5);
    expect(i?.loft).toBe('half');
  });

  it('drag down-right throws LEFT (positive aim); down-left throws right (negative)', () => {
    const right = slingshotIntent(start, { x: 240, y: 500 }, cfg, 'roll');
    const left = slingshotIntent(start, { x: 160, y: 500 }, cfg, 'roll');
    expect(right?.aim).toBeGreaterThan(0);
    expect(left?.aim).toBeLessThan(0);
    expect(right?.aim).toBeCloseTo(-(left?.aim ?? 0), 10);
    expect(right?.aim).toBeCloseTo(Math.atan2(40, 100) * 0.6, 10);
  });

  it('applies sensitivity', () => {
    const a = slingshotIntent(start, { x: 240, y: 500 }, { ...cfg, maxAimDeg: 90, aimSensitivity: 1 }, 'roll');
    const b = slingshotIntent(start, { x: 240, y: 500 }, { ...cfg, maxAimDeg: 90, aimSensitivity: 0.5 }, 'roll');
    expect((a?.aim ?? 0) / (b?.aim ?? 1)).toBeCloseTo(2, 10);
  });

  it('clamps aim to +-maxAimDeg', () => {
    const r = slingshotIntent(start, { x: 600, y: 420 }, cfg, 'roll');
    const l = slingshotIntent(start, { x: -200, y: 420 }, cfg, 'roll');
    expect(r?.aim).toBeCloseTo(20 * DEG, 10);
    expect(l?.aim).toBeCloseTo(-20 * DEG, 10);
  });

  it('clamps power to 1 and scales with fullPowerDragPx', () => {
    expect(slingshotIntent(start, { x: 200, y: 900 }, cfg, 'lob')?.power).toBe(1);
    const half = slingshotIntent(start, { x: 200, y: 400 + 130 }, { ...cfg, fullPowerDragPx: 130 }, 'lob');
    expect(half?.power).toBe(1);
  });

  it('dead zone: tiny pulls are cancelled', () => {
    expect(slingshotIntent(start, { x: 200, y: 405 }, cfg, 'roll')).toBeNull();
    expect(slingshotIntent(start, { x: 205, y: 411 }, cfg, 'roll')).toBeNull();
    expect(slingshotIntent(start, { x: 200, y: 412 }, cfg, 'roll')).not.toBeNull();
    expect(slingshotIntent(start, start, cfg, 'roll')).toBeNull();
  });

  it('upward and sideways drags are the cancel zone', () => {
    expect(slingshotIntent(start, { x: 200, y: 300 }, cfg, 'roll')).toBeNull();
    expect(slingshotIntent(start, { x: 260, y: 350 }, cfg, 'roll')).toBeNull();
    expect(slingshotIntent(start, { x: 400, y: 402 }, cfg, 'roll')).toBeNull();
  });

  it('never yields -0 aim', () => {
    const i = slingshotIntent(start, { x: 200, y: 500 }, cfg, 'roll');
    expect(Object.is(i?.aim, 0)).toBe(true);
  });
});

describe('slingshotPreview', () => {
  it('mirrors the intent and carries raw points', () => {
    const cur = { x: 230, y: 480 };
    const p = slingshotPreview(start, cur, cfg, 'roll');
    const i = slingshotIntent(start, cur, cfg, 'roll');
    expect(p).toEqual({ aim: i?.aim, power: i?.power, start, current: cur });
  });
  it('is null in the cancel zone', () => {
    expect(slingshotPreview(start, { x: 200, y: 380 }, cfg, 'roll')).toBeNull();
  });
});

/** Swipe from (x0,y0) by per-ms velocity for `ms`, sampled every `dt` ms. */
function swipe(x0: number, y0: number, vxPerS: number, vyPerS: number, ms: number, dt = 8): Sample[] {
  const out: Sample[] = [];
  for (let t = 0; t <= ms; t += dt) out.push({ x: x0 + (vxPerS * t) / 1000, y: y0 + (vyPerS * t) / 1000, t });
  return out;
}

describe('flickIntent', () => {
  it('straight up at half full speed -> aim 0, power 0.5', () => {
    const i = flickIntent(swipe(200, 700, 0, -1250, 160), cfg, 'half');
    expect(i?.aim).toBeCloseTo(0, 10);
    expect(i?.power).toBeCloseTo(0.5, 5);
    expect(i?.loft).toBe('half');
  });

  it('up-left is positive aim, up-right negative', () => {
    const l = flickIntent(swipe(200, 700, -400, -1200, 160), cfg, 'roll');
    const r = flickIntent(swipe(200, 700, 400, -1200, 160), cfg, 'roll');
    expect(l?.aim).toBeGreaterThan(0);
    expect(r?.aim).toBeLessThan(0);
    expect(l?.aim).toBeCloseTo(Math.atan2(400, 1200) * 0.6, 6);
  });

  it('clamps power and aim', () => {
    const i = flickIntent(swipe(200, 700, -2000, -6000, 100), cfg, 'roll');
    expect(i?.power).toBe(1);
    const steep = flickIntent(swipe(200, 700, -2500, -1000, 100), { ...cfg, aimSensitivity: 5 }, 'roll');
    expect(steep).not.toBeNull();
    expect(steep?.aim).toBeCloseTo(20 * DEG, 10);
  });

  it('only the last ~80 ms counts: fast then slow release is weak', () => {
    const fast = swipe(200, 800, 0, -4000, 200); // ends ~ y 0
    const last = fast[fast.length - 1] as Sample;
    const slow: Sample[] = [];
    for (let k = 1; k <= 12; k++) slow.push({ x: last.x, y: last.y - k * 0.5, t: last.t + k * 8 });
    const i = flickIntent([...fast, ...slow], cfg, 'roll');
    // 6px over the final 96ms is ~ 60-70px/s -> below the minimum -> cancel
    expect(i).toBeNull();
  });

  it('slow start then fast release is strong', () => {
    const slow = swipe(200, 800, 0, -100, 300);
    const lastSlow = slow[slow.length - 1] as Sample;
    const fast: Sample[] = [];
    for (let k = 1; k <= 12; k++) fast.push({ x: 200, y: lastSlow.y - k * 16, t: lastSlow.t + k * 8 }); // 2000 px/s
    const i = flickIntent([...slow, ...fast], cfg, 'roll');
    expect(i?.power).toBeCloseTo(2000 / 2500, 1);
  });

  it('a paused finger before release gives nothing', () => {
    const s = swipe(200, 800, 0, -2000, 100);
    const last = s[s.length - 1] as Sample;
    s.push({ ...last, t: last.t + 400 });
    expect(flickIntent(s, cfg, 'roll')).toBeNull();
  });

  it('cancels downward, sideways, too slow, too short, or too few samples', () => {
    expect(flickIntent(swipe(200, 400, 0, 1500, 120), cfg, 'roll')).toBeNull();
    expect(flickIntent(swipe(200, 400, -1500, -300, 120), cfg, 'roll')).toBeNull(); // ~79 deg off vertical
    expect(flickIntent(swipe(200, 700, 0, -150, 400), cfg, 'roll')).toBeNull(); // 150 px/s
    expect(flickIntent(swipe(200, 700, 0, -3000, 3), cfg, 'roll')).toBeNull(); // 1px: too short
    expect(flickIntent([], cfg, 'roll')).toBeNull();
    expect(flickIntent([{ x: 0, y: 0, t: 0 }], cfg, 'roll')).toBeNull();
    expect(flickIntent([{ x: 0, y: 0, t: 5 }, { x: 0, y: -50, t: 5 }], cfg, 'roll')).toBeNull(); // dt 0
  });

  it('respects flickFullPowerPxPerS', () => {
    const s = swipe(200, 700, 0, -1000, 160);
    expect(flickIntent(s, { ...cfg, flickFullPowerPxPerS: 1000 }, 'roll')?.power).toBeCloseTo(1, 5);
    expect(flickIntent(s, { ...cfg, flickFullPowerPxPerS: 4000 }, 'roll')?.power).toBeCloseTo(0.25, 5);
  });
});

describe('flickPreview', () => {
  it('mirrors the intent with first/last points; null when it would cancel', () => {
    const s = swipe(200, 700, -300, -1500, 120);
    const p = flickPreview(s, cfg, 'roll');
    const i = flickIntent(s, cfg, 'roll');
    expect(p?.aim).toBe(i?.aim);
    expect(p?.power).toBe(i?.power);
    expect(p?.start).toEqual({ x: 200, y: 700 });
    expect(flickPreview(swipe(200, 700, 0, 800, 100), cfg, 'roll')).toBeNull();
  });
});
