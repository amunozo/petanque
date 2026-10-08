/**
 * "Landing spot" controls report (skipped by default). Run:
 *   LANDING_REPORT=1 npx vitest run src/games/petanque/landingBench.report.test.ts --silent=false
 * Pointing error and shot hit rate per swipe quality, with the default config.
 * Swipe profiles: direction ~ N(0, angleSd) degrees, release speed = ideal x
 * exp(N(bias, speedSd)), mapped through the real swipeSkill.
 */
import { describe, expect, it } from 'vitest';
import type { Loft, Rng } from '../../engine';
import { swipeSkill } from '../../input/landingGesture';
import { defaultConfig } from '../../tuning/config';
import { landingPointing, landingShooting, type ErrorSampler } from './landingBench';
import { pointingStats, shootingStats } from './feelBench';

const N = Number(process.env['LANDING_N'] ?? 240);
const DISTS = [6, 8, 10] as const;
const cfg = defaultConfig;

interface Profile {
  name: string;
  angleSd: number;
  speedSd: number;
  bias?: number;
}
const PROFILES: readonly Profile[] = [
  { name: 'perfect', angleSd: 0, speedSd: 0 },
  { name: 'good', angleSd: 2.5, speedSd: 0.1 },
  { name: 'typical', angleSd: 6, speedSd: 0.25 },
  { name: 'sloppy', angleSd: 10, speedSd: 0.4 },
  { name: 'hasty', angleSd: 6, speedSd: 0.25, bias: 0.35 },
];

const sampler = (p: Profile): ErrorSampler => (rng: Rng) =>
  swipeSkill({ angleDeg: rng.normal() * p.angleSd, speed: cfg.landing.idealSwipeSpeed * Math.exp((p.bias ?? 0) + rng.normal() * p.speedSd) }, cfg.landing);

const cm = (v: number): string => (v * 100).toFixed(0).padStart(5);
const pct = (v: number): string => `${(v * 100).toFixed(0).padStart(3)}%`;

describe('landing bench sanity', () => {
  it('a perfect swipe is as good as the classic perfect-aim baseline; a sloppy one is clearly worse', () => {
    const perfect = landingPointing(cfg, 'half', 8, 48, 7, sampler(PROFILES[0] as Profile));
    const base = pointingStats(cfg, 'half', 8, 48, 7);
    expect(perfect.mean).toBeLessThan(base.mean * 1.25 + 0.02);
    const sloppy = landingPointing(cfg, 'half', 8, 48, 7, sampler(PROFILES[3] as Profile));
    expect(sloppy.mean).toBeGreaterThan(perfect.mean * 1.5);
  }, 60_000);
});

describe.runIf(process.env['LANDING_REPORT'])('landing report', () => {
  it('prints the tables', () => {
    const lines: string[] = [];
    lines.push(`Pointing: mean / p90 rest error from the jack (cm), N=${N} per cell`);
    lines.push(`baseline = classic controls, perfect aim, human noise only (feelBench)`);
    lines.push(`loft  dist | baseline | ${PROFILES.map((p) => p.name.padStart(11)).join(' |')}`);
    for (const loft of ['roll', 'half', 'lob'] as Loft[]) {
      for (const d of DISTS) {
        const b = pointingStats(cfg, loft, d, N, 1000 + d);
        const cells = PROFILES.map((p) => {
          const s = landingPointing(cfg, loft, d, N, 1000 + d, sampler(p));
          return `${cm(s.mean)} /${cm(s.p90)}`;
        });
        lines.push(`${loft.padEnd(5)} ${String(d).padStart(3)}m | ${cm(b.mean)} /${cm(b.p90)} | ${cells.join(' |')}`);
      }
    }
    lines.push('');
    lines.push(`Shooting a lone boule, marker on it: hit rate, N=${N} per cell`);
    lines.push(`dist | baseline | ${PROFILES.map((p) => p.name.padStart(8)).join(' |')}`);
    for (const d of DISTS) {
      const b = shootingStats(cfg, 'shoot', d, N, 2000 + d, 0);
      lines.push(`${String(d).padStart(3)}m |     ${pct(b.hit)} | ${PROFILES.map((p) => `    ${pct(landingShooting(cfg, d, N, 2000 + d, sampler(p)))}`).join(' |')}`);
    }
    console.log(lines.join('\n'));
  }, 1_200_000);
});
