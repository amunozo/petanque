/** Shot analysis on the real engine: sweep shots at an opponent boule and check what gets reported. */
import { describe, expect, it } from 'vitest';
import { createBody, simulateToRest, type Body } from '../../engine';
import { defaultConfig as cfg } from '../../tuning';
import { analyseShot, DEFAULT_CARREAU, type ShotOutcome } from './carreau';
import { beginThrow, createMatch } from './match';
import type { MatchState } from './matchTypes';

const rest = (id: string, kind: string, x: number, z: number): Body => {
  const b = createBody(id, kind, kind === 'jack' ? cfg.balls.jack : cfg.balls.boule, { x, y: 0, z });
  b.state = 'resting';
  return b;
};
const rec = (id: string, team: 'A' | 'B') => ({ id, team, intent: { aim: 0, power: 0.5, loft: 'half' as const }, params: {} as never });
const teamOf = (id: string): string | null => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null);

function sweep(lofts: readonly ('roll' | 'half' | 'lob' | 'shoot')[]): { outcome: ShotOutcome; after: readonly Body[]; before: readonly Body[] }[] {
  const z = cfg.throw.originZ - 8;
  const out: { outcome: ShotOutcome; after: readonly Body[]; before: readonly Body[] }[] = [];
  for (const loft of lofts) {
    for (let p = 0; p <= 30; p++) {
      for (let a = -10; a <= 10; a++) {
        const state: MatchState = {
          ...createMatch(1, cfg),
          phase: 'boule',
          toThrow: 'A',
          throws: [rec('jack', 'A'), rec('B1', 'B')],
          bodies: [rest('jack', 'jack', 0.15, z - 0.25), rest('B1', 'boule', 0, z)],
          boulesLeft: { A: 3, B: 2 },
        };
        const r = beginThrow(state, 'A', { aim: a * 0.004, power: 0.4 + p * 0.02, loft }, cfg);
        const { world, events } = simulateToRest(r.world, cfg.physics);
        const outcome = analyseShot({ thrownId: 'A1', teamOf, events, before: state.bodies, after: world.bodies });
        out.push({ outcome, after: world.bodies, before: state.bodies });
      }
    }
  }
  return out;
}

describe('shot analysis on real throws', () => {
  const results = sweep(['shoot', 'roll']);

  it('finds both a tir réussi and a carreau among precise shots', () => {
    expect(results.some((r) => r.outcome.kind === 'hit')).toBe(true);
    expect(results.some((r) => r.outcome.kind === 'carreau')).toBe(true);
  });

  it('carreau and hit outcomes agree with where the boules ended up', () => {
    for (const { outcome, after, before } of results) {
      if (outcome.kind === 'none') continue;
      const target = after.find((b) => b.id === 'B1');
      const was = before.find((b) => b.id === 'B1');
      const shooter = after.find((b) => b.id === 'A1');
      expect(outcome.targetId).toBe('B1');
      const moved = !target || target.state === 'out' ? Infinity : Math.hypot(target.pos.x - (was?.pos.x ?? 0), target.pos.z - (was?.pos.z ?? 0));
      expect(moved).toBeGreaterThanOrEqual(DEFAULT_CARREAU.minKnockDistance);
      const gap = shooter && was ? Math.hypot(shooter.pos.x - was.pos.x, shooter.pos.z - was.pos.z) : Infinity;
      if (outcome.kind === 'carreau') expect(gap).toBeLessThanOrEqual(DEFAULT_CARREAU.maxRestDistance);
      else expect(shooter === undefined || shooter.state === 'out' || gap > DEFAULT_CARREAU.maxRestDistance).toBe(true);
    }
  });
});
