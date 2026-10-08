/**
 * Game-feel guards on the default config (fixed seeds, real engine + rules noise).
 * Full tables: see feelBench.report.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { defaultConfig as cfg } from '../../tuning/config';
import { pointingStats, shootingStats, takePointRate } from './feelBench';

const N = 160;

describe('game feel (default config)', () => {
  it('the high lob points less precisely than the half-lob, with more scatter', () => {
    for (const d of [7, 9]) {
      const half = pointingStats(cfg, 'half', d, N, 11 + d);
      const lob = pointingStats(cfg, 'lob', d, N, 11 + d);
      expect(lob.mean).toBeGreaterThan(half.mean * 1.25);
      expect(lob.p90).toBeGreaterThan(half.p90);
    }
  });

  it('a shot (ring on the boule) hits a lone boule at 7-9 m most of the time, far more often than a lob', () => {
    let shootSum = 0;
    for (const d of [7, 9]) {
      const shoot = shootingStats(cfg, 'shoot', d, N, 21 + d);
      const lob = shootingStats(cfg, 'lob', d, N, 21 + d);
      expect(shoot.hit).toBeGreaterThan(lob.hit + 0.3);
      shootSum += shoot.hit;
    }
    const mean = shootSum / 2;
    expect(mean).toBeGreaterThan(0.55);
    expect(mean).toBeLessThan(0.82);
  });

  it('against a boule 5 cm in front of the jack, shooting beats any lob', () => {
    const shoot = takePointRate(cfg, 'shoot', 8, N, 31);
    expect(shoot).toBeGreaterThan(takePointRate(cfg, 'lobOnBoule', 8, N, 31) + 0.15);
    expect(shoot).toBeGreaterThan(takePointRate(cfg, 'lobPoint', 8, N, 31) + 0.15);
  });
});
