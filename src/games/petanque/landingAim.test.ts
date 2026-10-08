import { describe, expect, it } from 'vitest';
import { intentToThrow, type Loft } from '../../engine';
import { defaultConfig } from '../../tuning/config';
import { ballConfig, clampToCourt, perturbIntent, reachedPoint, reachRange, solveSpot, spotMeaning } from './landingAim';
import { previewThrow } from './practice';

const cfg = defaultConfig;
const { originX, originZ } = cfg.throw;
const at = (x: number, dist: number) => ({ x, z: originZ - Math.sqrt(Math.max(0, dist * dist - (x - originX) ** 2)) });
const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('solveSpot (spot + loft -> intent)', () => {
  const lofts: Loft[] = ['half', 'lob', 'shoot'];
  for (const loft of lofts) {
    it(`${loft}: the preview ring lands on the spot (3-10 m, both sides)`, () => {
      for (const dist of [3, 5, 6.5, 8, 10]) {
        for (const x of [-0.8, 0, 0.6]) {
          const spot = at(x, dist);
          const s = solveSpot(spot, loft, cfg);
          expect(s.meaning).toBe('landing');
          // The real aim preview (what the player sees) agrees with the solve to within a centimetre.
          const ring = previewThrow(s.intent, cfg).ring;
          expect(gap(ring, spot)).toBeLessThan(0.01);
          expect(gap(s.spot, spot)).toBeLessThan(0.01);
        }
      }
    });
  }

  it('roll: the spot is where a lone boule stops (within 3 cm)', () => {
    expect(spotMeaning('roll', cfg)).toBe('rest');
    for (const dist of [4, 6, 8, 10]) {
      for (const x of [-0.5, 0, 0.7]) {
        const spot = at(x, dist);
        const s = solveSpot(spot, 'roll', cfg);
        expect(gap(reachedPoint(s.intent, cfg, 'rest'), spot)).toBeLessThan(0.03);
      }
    }
  });

  it('roll marks the first landing when rollMarksRest is off', () => {
    const c = { ...cfg, landing: { ...cfg.landing, rollMarksRest: false } };
    const spot = at(0, 1.5);
    const s = solveSpot(spot, 'roll', c);
    expect(s.meaning).toBe('landing');
    expect(gap(previewThrow(s.intent, c).ring, spot)).toBeLessThan(0.01);
  });

  it('the jack is solved with its own size and weight', () => {
    const jc = ballConfig(cfg, 'jack');
    for (const loft of ['half', 'lob'] as Loft[]) {
      const spot = at(0.3, 8);
      const s = solveSpot(spot, loft, jc);
      expect(gap(previewThrow(s.intent, jc).ring, spot)).toBeLessThan(0.01);
    }
  });

  it('clamps spots to the court and to the loft reach; the returned spot is the reached one', () => {
    // Beyond the side boards / behind the circle / past the end.
    const side = clampToCourt({ x: 5, z: 0 }, cfg);
    expect(side.x).toBeLessThanOrEqual(cfg.physics.arena.maxX);
    const behind = clampToCourt({ x: 0, z: originZ + 3 }, cfg);
    expect(behind.z).toBeLessThan(originZ);
    // Aim limit.
    const wide = clampToCourt({ x: -1.9, z: originZ - 2 }, cfg);
    expect(Math.abs(Math.atan2(-(wide.x - originX), -(wide.z - originZ)))).toBeLessThanOrEqual((cfg.controls.maxAimDeg * Math.PI) / 180 + 1e-9);
    // A lob can't reach the far end at full power on a short-range config: the marker sits at the max reach.
    const short = { ...cfg, throw: { ...cfg.throw, maxSpeed: 6 } };
    const reach = reachRange('lob', short);
    const s = solveSpot({ x: 0, z: cfg.physics.arena.minZ + 0.2 }, 'lob', short);
    expect(s.intent.power).toBeCloseTo(1, 3);
    expect(Math.abs(originZ - s.spot.z - reach.max)).toBeLessThan(0.01);
  });

  it('is deterministic', () => {
    const a = solveSpot(at(0.2, 7.3), 'half', cfg);
    const b = solveSpot(at(0.2, 7.3), 'half', cfg);
    expect(a).toEqual(b);
  });
});

describe('perturbIntent (swipe error -> intent)', () => {
  const base = solveSpot(at(0, 8), 'half', cfg).intent;
  const speed = (i: typeof base) => intentToThrow(i, cfg.throw, { aim: 0, power: 0 }).speed;

  it('zero error leaves the intent unchanged', () => {
    expect(perturbIntent(base, { aimDeg: 0, speedPct: 0 }, cfg)).toEqual(base);
  });

  it('speed error changes the launch speed by that percentage', () => {
    for (const pct of [-6, -2, 3, 8]) {
      const p = perturbIntent(base, { aimDeg: 0, speedPct: pct }, cfg);
      expect(speed(p) / speed(base) - 1).toBeCloseTo(pct / 100, 6);
    }
    const shoot = solveSpot(at(0, 7), 'shoot', cfg).intent;
    const ps = perturbIntent(shoot, { aimDeg: 0, speedPct: 5 }, cfg);
    expect(speed(ps) / speed(shoot) - 1).toBeCloseTo(0.05, 6);
  });

  it('aim error is added in degrees (positive = left) and stays within the aim limit', () => {
    const p = perturbIntent(base, { aimDeg: 2, speedPct: 0 }, cfg);
    expect(p.aim - base.aim).toBeCloseTo((2 * Math.PI) / 180, 9);
    const far = perturbIntent({ ...base, aim: 0.34 }, { aimDeg: 10, speedPct: 0 }, cfg);
    expect(far.aim).toBeLessThanOrEqual((cfg.controls.maxAimDeg * Math.PI) / 180);
  });

  it('power stays within 0..1', () => {
    expect(perturbIntent({ ...base, power: 1 }, { aimDeg: 0, speedPct: 30 }, cfg).power).toBe(1);
    expect(perturbIntent({ ...base, power: 0.001 }, { aimDeg: 0, speedPct: -30 }, cfg).power).toBe(0);
  });
});
