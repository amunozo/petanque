/**
 * Game-feel report (skipped by default). Run:
 *   FEEL_REPORT=1 npx vitest run src/games/petanque/feelBench.report.test.ts
 * Prints pointing precision per loft and shooting hit rates with the default config.
 */
import { describe, it } from 'vitest';
import type { Loft } from '../../engine';
import { defaultConfig } from '../../tuning/config';
import { bestShootingStats, pointingStats, shootingStats, takePointRate, type TakePlan } from './feelBench';

const N = Number(process.env['FEEL_N'] ?? 400);
const DISTS = [6, 8, 10] as const;
const f2 = (v: number): string => (v * 100).toFixed(1).padStart(6);
const pct = (v: number): string => `${(v * 100).toFixed(0).padStart(3)}%`;

describe.runIf(process.env['FEEL_REPORT'])('feel report', () => {
  it('prints the tables', () => {
    const cfg = defaultConfig;
    const lines: string[] = [];
    lines.push(`Pointing (lone boule, cm from intended rest point), N=${N} per cell`);
    lines.push('loft   dist   mean  median    p90  rollOut');
    for (const loft of ['roll', 'half', 'lob'] as Loft[]) {
      for (const d of DISTS) {
        const s = pointingStats(cfg, loft, d, N, 1000 + d);
        lines.push(`${loft.padEnd(6)} ${String(d).padStart(3)}m ${f2(s.mean)} ${f2(s.median)} ${f2(s.p90)} ${f2(s.rollOut)}`);
      }
    }
    lines.push('');
    lines.push(`Shooting a lone boule (ring on the boule | best ring offset), N=${N} per cell`);
    lines.push('loft   dist   hit  carreau |  best hit  carreau  short');
    for (const loft of ['shoot', 'lob', 'half', 'roll'] as Loft[]) {
      for (const d of DISTS) {
        const s = shootingStats(cfg, loft, d, N, 2000 + d, 0);
        const b = bestShootingStats(cfg, loft, d, N, 2000 + d);
        lines.push(`${loft.padEnd(6)} ${String(d).padStart(3)}m ${pct(s.hit)}   ${pct(s.carreau)}   |   ${pct(b.hit)}    ${pct(b.carreau)}   ${b.short.toFixed(2)}`);
      }
    }
    lines.push('');
    lines.push(`Opponent boule 5 cm in front of the jack: share of throws that take the point away from it, N=${N}`);
    lines.push('plan        6m    8m   10m');
    for (const plan of ['shoot', 'lobOnBoule', 'lobPoint', 'halfPoint', 'rollPoint'] as TakePlan[]) {
      lines.push(`${plan.padEnd(10)} ${DISTS.map((d) => pct(takePointRate(cfg, plan, d, N, 3000 + d))).join('  ')}`);
    }
    console.log(lines.join('\n'));
  }, 600_000);
});
