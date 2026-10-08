import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../tuning/config';
import type { Sample } from './gestures';
import { swipeMetrics, swipeSkill } from './landingGesture';

const cfg = defaultConfig.landing;
const H = 640;

/** A straight swipe from (x0, y0) by (dx, dy) px over `ms`, constant speed, 8 ms samples. */
function swipe(dx: number, dy: number, ms: number, x0 = 180, y0 = 540): Sample[] {
  const out: Sample[] = [];
  const n = Math.max(2, Math.round(ms / 8));
  for (let i = 0; i <= n; i++) out.push({ x: x0 + (dx * i) / n, y: y0 + (dy * i) / n, t: 1000 + (ms * i) / n });
  return out;
}

describe('swipeMetrics', () => {
  it('reads direction (up-left positive), speed in screen heights/s and length', () => {
    const m = swipeMetrics(swipe(-20, -200, 150), H, cfg);
    expect(m).not.toBeNull();
    expect(m?.angleDeg).toBeCloseTo((Math.atan2(20, 200) * 180) / Math.PI, 6);
    expect(m?.speed).toBeCloseTo(Math.hypot(20, 200) / 0.15 / H, 1);
    expect(m?.length).toBeCloseTo(200 / H, 6);
  });

  it('a brief stop before lifting still counts the swipe speed', () => {
    const s = swipe(0, -200, 150);
    const paused = [...s, { x: 180, y: 340, t: 1150 + 60 }];
    expect(swipeMetrics(paused, H, cfg)?.speed).toBeCloseTo(200 / 0.15 / H, 1);
  });

  it('cancels taps, downward or sideways swipes and a finger that stopped', () => {
    expect(swipeMetrics(swipe(0, -10, 100), H, cfg)).toBeNull(); // too short
    expect(swipeMetrics(swipe(0, 200, 150), H, cfg)).toBeNull(); // downward
    expect(swipeMetrics(swipe(300, -60, 150), H, cfg)).toBeNull(); // sideways
    const stopped = [...swipe(0, -200, 150), { x: 180, y: 340, t: 1400 }];
    expect(swipeMetrics(stopped, H, cfg)).toBeNull();
  });
});

describe('swipeSkill', () => {
  const ideal = cfg.idealSwipeSpeed;

  it('a perfect swipe adds no error', () => {
    expect(swipeSkill({ angleDeg: 0, speed: ideal }, cfg)).toEqual({ aimDeg: 0, speedPct: 0, direction: 'straight', pace: 'good' });
    // Anything inside the tolerances is still clean.
    const inside = swipeSkill({ angleDeg: cfg.angleToleranceDeg * 0.9, speed: ideal * (1 + cfg.speedTolerance * 0.9) }, cfg);
    expect(inside.aimDeg).toBe(0);
    expect(inside.speedPct).toBe(0);
  });

  it('aim error is monotonic in the swipe angle, odd, and bounded', () => {
    let prev = -Infinity;
    for (let a = -50; a <= 50; a += 0.5) {
      const s = swipeSkill({ angleDeg: a, speed: ideal }, cfg);
      expect(s.aimDeg).toBeGreaterThanOrEqual(prev);
      expect(Math.abs(s.aimDeg)).toBeLessThanOrEqual(cfg.maxAimErrDeg);
      expect(swipeSkill({ angleDeg: -a, speed: ideal }, cfg).aimDeg).toBeCloseTo(-s.aimDeg, 12);
      prev = s.aimDeg;
    }
    expect(swipeSkill({ angleDeg: 50, speed: ideal }, cfg).aimDeg).toBe(cfg.maxAimErrDeg);
    expect(swipeSkill({ angleDeg: 10, speed: ideal }, cfg).direction).toBe('left');
    expect(swipeSkill({ angleDeg: -10, speed: ideal }, cfg).direction).toBe('right');
  });

  it('speed error is monotonic in the swipe speed and bounded; fast = strong, slow = soft', () => {
    let prev = -Infinity;
    for (let r = 0.2; r <= 4; r += 0.02) {
      const s = swipeSkill({ angleDeg: 0, speed: ideal * r }, cfg);
      expect(s.speedPct).toBeGreaterThanOrEqual(prev);
      expect(Math.abs(s.speedPct)).toBeLessThanOrEqual(cfg.maxSpeedErrPct);
      prev = s.speedPct;
    }
    expect(swipeSkill({ angleDeg: 0, speed: ideal * 1.6 }, cfg).pace).toBe('strong');
    expect(swipeSkill({ angleDeg: 0, speed: ideal * 0.6 }, cfg).pace).toBe('soft');
    expect(swipeSkill({ angleDeg: 0, speed: ideal * 4 }, cfg).speedPct).toBe(cfg.maxSpeedErrPct);
  });

  it('larger mistakes never give smaller errors (both axes)', () => {
    const small = swipeSkill({ angleDeg: 6, speed: ideal * 1.3 }, cfg);
    const big = swipeSkill({ angleDeg: 12, speed: ideal * 1.6 }, cfg);
    expect(big.aimDeg).toBeGreaterThan(small.aimDeg);
    expect(big.speedPct).toBeGreaterThan(small.speedPct);
  });
});
