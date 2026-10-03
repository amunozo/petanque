import { describe, expect, it } from 'vitest';
import { fillNoise, hash01, level01, loudest } from './shape';

describe('hash01', () => {
  it('is deterministic and in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(i * 31);
      expect(v).toBe(hash01(i * 31));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('varies between neighbouring inputs', () => {
    expect(hash01(1)).not.toBe(hash01(2));
  });
});

describe('level01', () => {
  it('is silent below the minimum and saturates at the reference', () => {
    expect(level01(0.1, 0.3, 5)).toBe(0);
    expect(level01(5, 0.3, 5)).toBeCloseTo(1, 6);
    expect(level01(50, 0.3, 5)).toBe(1);
  });
  it('grows with speed', () => {
    expect(level01(2, 0.3, 5)).toBeLessThan(level01(3, 0.3, 5));
  });
});

describe('loudest', () => {
  it('keeps the strongest few in order', () => {
    const items = [{ level: 0.2 }, { level: 0.9 }, { level: 0.5 }, { level: 0.7 }];
    expect(loudest(items, 2).map((i) => i.level)).toEqual([0.9, 0.7]);
    expect(loudest(items, 0)).toEqual([]);
  });
});

describe('fillNoise', () => {
  it('is deterministic white noise within [-1, 1]', () => {
    const a = new Float32Array(256);
    const b = new Float32Array(256);
    fillNoise(a);
    fillNoise(b);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...a)).toBeGreaterThan(0.5);
  });
});
