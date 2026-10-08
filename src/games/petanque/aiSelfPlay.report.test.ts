/**
 * Computer-vs-computer matches through the real rules (skipped by default). Run:
 *   AI_SELFPLAY=1 AI_MATCHES=6 npx vitest run src/games/petanque/aiSelfPlay.report.test.ts --silent=false
 * Prints wins and points per pairing, which lofts each level chose and how its shots went.
 */
import { describe, it } from 'vitest';
import { simulateToRest } from '../../engine';
import { defaultConfig } from '../../tuning/config';
import { chooseThrow } from './ai';
import type { AiDifficulty } from './aiTypes';
import { analyseShot } from './carreau';
import { beginThrow, createMatch, nextEnd, settle } from './match';
import type { TeamId } from './matchTypes';

const MATCHES = Number(process.env['AI_MATCHES'] ?? 6);

interface Tally {
  lofts: Record<string, number>;
  shots: number;
  shotHits: number;
  carreaux: number;
}

function playMatch(seed: number, a: AiDifficulty, b: AiDifficulty, tallies: Record<AiDifficulty, Tally>): { winner: TeamId | null; score: Record<TeamId, number> } {
  const cfg = defaultConfig;
  const level: Record<TeamId, AiDifficulty> = { A: a, B: b };
  let state = createMatch(seed, cfg, seed % 2 === 0 ? 'A' : 'B');
  let turns = 0;
  while (state.phase !== 'matchOver' && turns < 2000) {
    turns++;
    if (state.phase === 'endOver') {
      state = nextEnd(state);
      continue;
    }
    const team = state.toThrow;
    const lv = level[team];
    const d = chooseThrow({ state, team, difficulty: lv, seed: seed * 7919 + turns }, cfg);
    const r = beginThrow(state, team, d.intent, cfg);
    const { world, events } = simulateToRest(r.world, cfg.physics);
    if (d.plan !== 'jack') {
      const t = tallies[lv];
      t.lofts[d.intent.loft] = (t.lofts[d.intent.loft] ?? 0) + 1;
      if (d.plan === 'shoot') {
        const thrownId = r.state.throws[r.state.throws.length - 1]?.id ?? '';
        const o = analyseShot({ thrownId, teamOf: (id) => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null), events, before: state.bodies, after: world.bodies });
        t.shots++;
        if (o.kind !== 'none') t.shotHits++;
        if (o.kind === 'carreau') t.carreaux++;
      }
    }
    state = settle(r.state, world.bodies, cfg);
  }
  return { winner: state.winner, score: state.score };
}

describe.runIf(process.env['AI_SELFPLAY'])('AI self-play', () => {
  it('plays the pairings', () => {
    const tallies = {} as Record<AiDifficulty, Tally>;
    for (const lv of ['easy', 'medium', 'hard'] as AiDifficulty[]) tallies[lv] = { lofts: {}, shots: 0, shotHits: 0, carreaux: 0 };
    const lines: string[] = [];
    const pairs: [AiDifficulty, AiDifficulty][] = [
      ['hard', 'medium'],
      ['medium', 'easy'],
      ['hard', 'easy'],
    ];
    for (const [a, b] of pairs) {
      let winsA = 0;
      let ptsA = 0;
      let ptsB = 0;
      for (let m = 1; m <= MATCHES; m++) {
        const r = playMatch(m, a, b, tallies);
        if (r.winner === 'A') winsA++;
        ptsA += r.score.A;
        ptsB += r.score.B;
      }
      lines.push(`${a} vs ${b}: ${a} wins ${winsA}/${MATCHES}, points ${ptsA}-${ptsB}`);
    }
    for (const lv of ['easy', 'medium', 'hard'] as AiDifficulty[]) {
      const t = tallies[lv];
      const total = Object.values(t.lofts).reduce((s, v) => s + v, 0);
      const mix = ['roll', 'half', 'lob', 'shoot'].map((l) => `${l} ${(((t.lofts[l] ?? 0) / Math.max(1, total)) * 100).toFixed(0)}%`).join(', ');
      lines.push(`${lv}: ${total} boules (${mix}); shots ${t.shots}, hits ${t.shotHits}, carreaux ${t.carreaux}`);
    }
    console.log(lines.join('\n'));
  }, 3_600_000);
});
