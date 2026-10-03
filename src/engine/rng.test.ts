import { describe, expect, it } from 'vitest';
import { createRng, nextNormal, nextRandom, rngFromState } from './rng';

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 10 }, () => c.next())).not.toEqual(sa);
  });

  it('produces values in [0,1) with a roughly uniform mean', () => {
    const r = createRng(1);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });

  it('normal() has mean ~0 and sd ~1', () => {
    const r = createRng(7);
    const n = 20000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const v = r.normal();
      s += v;
      s2 += v * v;
    }
    const mean = s / n;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(s2 / n - mean * mean)).toBeCloseTo(1, 1);
  });

  it('state can be saved and restored (JSON-safe) to resume the sequence', () => {
    const r = createRng(99);
    r.next();
    r.normal();
    const saved = JSON.parse(JSON.stringify(r.state)) as number;
    const expected = [r.next(), r.normal(), r.next()];
    const r2 = rngFromState(saved);
    expect([r2.next(), r2.normal(), r2.next()]).toEqual(expected);
  });

  it('pure functions agree with the wrapper', () => {
    const [v1, s1] = nextRandom(5);
    const [n1] = nextNormal(s1);
    const r = createRng(5);
    expect(r.next()).toBe(v1);
    expect(r.normal()).toBe(n1);
  });
});
