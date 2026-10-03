import { describe, expect, it } from 'vitest';
import { createBody, simulateToRest, type Body } from '../../engine';
import { defaultConfig, type GameConfig } from '../../tuning/config';
import { chooseThrow } from './ai';
import type { AiDifficulty, AiRequest } from './aiTypes';
import { beginThrow, createMatch, settle } from './match';
import { distances, holdingTeam } from './matchMeasure';
import type { MatchState, TeamId, ThrowRecord } from './matchTypes';

const DEG = Math.PI / 180;
const LEVELS: AiDifficulty[] = ['easy', 'medium', 'hard'];

/** Config with the rules' own throw noise removed (the AI is deterministic anyway). */
const quiet = (): GameConfig => {
  const c = structuredClone(defaultConfig);
  c.throw.aimNoiseDeg = 0;
  c.throw.powerNoisePct = 0;
  return c;
};
/** Additionally removes the AI's deliberate execution error. */
const perfect = (): GameConfig => {
  const c = quiet();
  for (const l of LEVELS) {
    c.ai[l].aimErrorDeg = 0;
    c.ai[l].powerErrorPct = 0;
  }
  return c;
};

const rec = (id: string, team: TeamId, cfg: GameConfig): ThrowRecord => ({
  id,
  team,
  intent: { aim: 0, power: 0.5, loft: 'half' },
  params: { yaw: 0, pitch: 0.5, speed: 5, origin: { x: 0, y: 0.5, z: cfg.throw.originZ } },
});

const jackAt = (cfg: GameConfig, x: number, z: number): Body => createBody('jack', 'jack', cfg.balls.jack, { x, y: 0, z });
const bouleAt = (cfg: GameConfig, id: string, x: number, z: number): Body => createBody(id, 'boule', cfg.balls.boule, { x, y: 0, z });

/** Boule-phase scene: `toThrow` is to throw; `placed` are boules already on the ground (ids like 'A1'). */
function scene(cfg: GameConfig, jack: Body, placed: Body[], toThrow: TeamId, jackTeam: TeamId = 'A'): MatchState {
  const base = createMatch(5, cfg, jackTeam);
  const left = { A: cfg.match.boulesPerTeam, B: cfg.match.boulesPerTeam };
  for (const b of placed) left[b.id[0] as TeamId]--;
  return {
    ...base,
    phase: 'boule',
    toThrow,
    bodies: [jack, ...placed],
    throws: [rec('jack', jackTeam, cfg), ...placed.map((b) => rec(b.id, b.id[0] as TeamId, cfg))],
    boulesLeft: left,
  };
}

/** Plays a decision through the real rules and returns the settled state. */
function apply(state: MatchState, team: TeamId, intent: AiRequest['state']['throws'][number]['intent'], cfg: GameConfig): MatchState {
  const r = beginThrow(state, team, intent, cfg);
  return settle(r.state, simulateToRest(r.world, cfg.physics).world.bodies, cfg);
}

const req = (state: MatchState, team: TeamId, difficulty: AiDifficulty, seed = 1): AiRequest => ({ state, team, difficulty, seed });

describe('chooseThrow: contract', () => {
  it('is deterministic for the same request', () => {
    const cfg = defaultConfig;
    const s = scene(cfg, jackAt(cfg, 0.3, -3), [bouleAt(cfg, 'A1', 0.2, -2.9)], 'B');
    for (const lv of LEVELS) {
      const a = chooseThrow(req(s, 'B', lv, 42), cfg);
      const b = chooseThrow(req(structuredClone(s), 'B', lv, 42), cfg);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    const j = createMatch(3, cfg);
    expect(JSON.stringify(chooseThrow(req(j, 'A', 'hard', 9), cfg))).toBe(JSON.stringify(chooseThrow(req(j, 'A', 'hard', 9), cfg)));
  });

  it('does not mutate the request', () => {
    const cfg = defaultConfig;
    const s = scene(cfg, jackAt(cfg, 0, -3), [bouleAt(cfg, 'A1', 0.1, -3)], 'B');
    const before = JSON.stringify(s);
    chooseThrow(req(s, 'B', 'hard'), cfg);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('returns legal intents within the simulation budget, in every phase', () => {
    const cfg = defaultConfig;
    const maxAim = cfg.controls.maxAimDeg * DEG;
    for (const lv of LEVELS) {
      for (let seed = 1; seed <= 6; seed++) {
        const states: [MatchState, TeamId][] = [
          [createMatch(seed, cfg), 'A'],
          [scene(cfg, jackAt(cfg, seed * 0.2 - 0.6, -2.5 - seed * 0.5), [], 'A'), 'A'],
          [scene(cfg, jackAt(cfg, 0, -3), [bouleAt(cfg, 'A1', 0.04, -3.1), bouleAt(cfg, 'A2', -0.3, -3.3)], 'B'), 'B'],
        ];
        for (const [s, team] of states) {
          const d = chooseThrow(req(s, team, lv, seed), cfg);
          expect(d.intent.power).toBeGreaterThanOrEqual(0);
          expect(d.intent.power).toBeLessThanOrEqual(1);
          expect(['roll', 'half', 'lob', 'shoot']).toContain(d.intent.loft);
          expect(Math.abs(d.intent.aim)).toBeLessThanOrEqual(maxAim + 1e-9);
          expect(Number.isFinite(d.intent.aim) && Number.isFinite(d.intent.power)).toBe(true);
          expect(d.simulations).toBeGreaterThan(0);
          expect(d.simulations).toBeLessThanOrEqual(cfg.ai[lv].maxSimulations);
          expect(d.plan).toBe(s.phase === 'jack' ? 'jack' : d.plan);
          if (d.plan === 'shoot') expect(d.intent.loft).toBe('shoot');
          else expect(d.intent.loft).not.toBe('shoot');
        }
      }
    }
  });

  it('throws clear errors when it should not have been called', () => {
    const cfg = defaultConfig;
    const s = scene(cfg, jackAt(cfg, 0, -3), [], 'A');
    expect(() => chooseThrow(req(s, 'B', 'hard'), cfg)).toThrow(/turn/);
    expect(() => chooseThrow(req({ ...s, boulesLeft: { A: 0, B: 3 } }, 'A', 'hard'), cfg)).toThrow(/no boules/);
    expect(() => chooseThrow(req({ ...s, phase: 'inFlight' }, 'A', 'hard'), cfg)).toThrow(/phase/);
    expect(() => chooseThrow(req({ ...s, bodies: [] }, 'A', 'hard'), cfg)).toThrow(/jack/);
  });
});

describe('chooseThrow: jack', () => {
  it('hard AI throws a legal jack in at least 9 of 10 seeds (zero noise, through the real rules)', () => {
    const cfg = perfect();
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = createMatch(seed, cfg);
      const d = chooseThrow(req(s, 'A', 'hard', seed * 31), cfg);
      expect(d.plan).toBe('jack');
      const after = apply(s, 'A', d.intent, cfg);
      if (after.phase === 'boule') ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(9);
  });

  it('varies the distance between seeds but stays inside the legal range with a margin', () => {
    const cfg = perfect();
    const dists = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createMatch(1, cfg);
      const d = chooseThrow(req(s, 'A', 'hard', seed), cfg);
      const after = apply(s, 'A', d.intent, cfg);
      const jack = after.bodies.find((b) => b.id === 'jack') as Body;
      const dist = Math.hypot(jack.pos.x - cfg.throw.originX, jack.pos.z - cfg.throw.originZ);
      expect(dist).toBeGreaterThan(cfg.match.jackMinDist);
      expect(dist).toBeLessThan(cfg.match.jackMaxDist);
      dists.add(Math.round(dist * 2));
    }
    expect(dists.size).toBeGreaterThan(3);
  });
});

describe('chooseThrow: pointing', () => {
  it('rests within 30 cm of the jack in an empty-ish scene for most seeds (zero noise and error)', () => {
    const cfg = perfect();
    let good = 0;
    const trials = 14;
    for (let i = 0; i < trials; i++) {
      const jx = -1 + (i % 7) * 0.33;
      const jz = cfg.throw.originZ - (6.3 + (i % 5) * 0.85);
      const s = scene(cfg, jackAt(cfg, jx, jz), [], 'A');
      const d = chooseThrow(req(s, 'A', LEVELS[i % 3] as AiDifficulty, i), cfg);
      expect(d.plan).toBe('point');
      const after = apply(s, 'A', d.intent, cfg);
      const gap = distances(after)[0]?.distance ?? 99;
      if (gap < 0.3) good++;
    }
    expect(good).toBeGreaterThanOrEqual(Math.ceil(trials * 0.85));
  });

  it('hard AI usually takes the point against a boule it can beat', () => {
    const cfg = perfect();
    let held = 0;
    for (let i = 0; i < 8; i++) {
      const jack = jackAt(cfg, -0.4 + i * 0.1, -2.5 - i * 0.2);
      const opp = bouleAt(cfg, 'A1', jack.pos.x + 0.35, jack.pos.z + 0.1);
      const s = scene(cfg, jack, [opp], 'B');
      const d = chooseThrow(req(s, 'B', 'hard', i), cfg);
      const after = apply(s, 'B', d.intent, cfg);
      if (holdingTeam(after)?.team === 'B') held++;
    }
    expect(held).toBeGreaterThanOrEqual(7);
  });

  it('copes with awkward layouts: jack near a board, near the circle, far end, and a blocked line', () => {
    const cfg = defaultConfig;
    const z0 = cfg.throw.originZ;
    const awkward: Body[][] = [
      [jackAt(cfg, 1.45, z0 - 7)],
      [jackAt(cfg, -1.45, z0 - 9.8)],
      [jackAt(cfg, 0, z0 - 1.5)],
      [jackAt(cfg, 0.5, cfg.physics.arena.minZ + 0.2)],
      [jackAt(cfg, 0, z0 - 8), bouleAt(cfg, 'A1', 0, z0 - 6.5), bouleAt(cfg, 'A2', 0.1, z0 - 7), bouleAt(cfg, 'A3', -0.1, z0 - 7.2)],
    ];
    for (const bodies of awkward) {
      const [jack, ...rest] = bodies as [Body, ...Body[]];
      for (const lv of LEVELS) {
        const s = scene(cfg, jack, rest, 'B');
        const d = chooseThrow(req(s, 'B', lv, 3), cfg);
        expect(Number.isFinite(d.intent.power)).toBe(true);
        expect(d.simulations).toBeLessThanOrEqual(cfg.ai[lv].maxSimulations);
      }
    }
  });

  it('stays legal with tiny budgets and a narrow aim range', () => {
    const cfg = structuredClone(defaultConfig);
    cfg.controls.maxAimDeg = 4;
    for (const budget of [1, 2, 3, 8]) {
      for (const lv of LEVELS) {
        cfg.ai[lv].maxSimulations = budget;
        const states: MatchState[] = [createMatch(2, cfg), scene(cfg, jackAt(cfg, 1.2, -2), [bouleAt(cfg, 'A1', 1.1, -2)], 'B')];
        for (const s of states) {
          const team = s.toThrow;
          const d = chooseThrow(req(s, team, lv, budget), cfg);
          expect(d.simulations).toBeLessThanOrEqual(budget);
          expect(Math.abs(d.intent.aim)).toBeLessThanOrEqual(4 * DEG + 1e-9);
          expect(d.intent.power).toBeGreaterThanOrEqual(0);
          expect(d.intent.power).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a hard decision on a crowded pitch is fast enough for a worker (< 3 s in Node)', () => {
    const cfg = structuredClone(defaultConfig);
    cfg.match.boulesPerTeam = 6;
    const z = cfg.throw.originZ - 8;
    const placed = [
      bouleAt(cfg, 'A1', 0.05, z + 0.1),
      bouleAt(cfg, 'B1', -0.1, z + 0.12),
      bouleAt(cfg, 'A2', 0.12, z - 0.15),
      bouleAt(cfg, 'B2', -0.2, z - 0.1),
      bouleAt(cfg, 'A3', 0.0, z + 0.4),
      bouleAt(cfg, 'B3', 0.3, z + 0.25),
    ];
    const s = scene(cfg, jackAt(cfg, 0, z), placed, 'B');
    const t0 = performance.now();
    const d = chooseThrow(req(s, 'B', 'hard', 7), cfg);
    const ms = performance.now() - t0;
    expect(d.simulations).toBeLessThanOrEqual(cfg.ai.hard.maxSimulations);
    expect(ms).toBeLessThan(3000);
  });

  it('ignores boules that are out of play', () => {
    const cfg = defaultConfig;
    const out = bouleAt(cfg, 'A1', 0, -9.4);
    out.state = 'out';
    const s = scene(cfg, jackAt(cfg, 0, -3), [out], 'B');
    expect(() => chooseThrow(req(s, 'B', 'hard'), cfg)).not.toThrow();
    expect(chooseThrow(req(s, 'B', 'hard'), cfg).plan).toBe('point');
  });
});

describe('chooseThrow: shooting', () => {
  const layout = (cfg: GameConfig, i: number): MatchState => {
    const jack = jackAt(cfg, -0.5 + i * 0.12, cfg.throw.originZ - (6.5 + (i % 4) * 0.8));
    const opp = bouleAt(cfg, 'A1', jack.pos.x + 0.05 + cfg.balls.boule.radius + cfg.balls.jack.radius, jack.pos.z);
    return scene(cfg, jack, [opp], 'B');
  };

  it('medium and hard shoot at an opponent boule 5 cm from the jack', () => {
    const cfg = defaultConfig;
    for (const lv of ['medium', 'hard'] as const) {
      for (let i = 0; i < 6; i++) {
        const d = chooseThrow(req(layout(cfg, i), 'B', lv, i), cfg);
        expect(d.plan).toBe('shoot');
        expect(d.targetId).toBe('A1');
        expect(d.intent.loft).toBe('shoot');
      }
    }
  });

  it('easy never shoots, even when it should', () => {
    const cfg = defaultConfig;
    for (let i = 0; i < 6; i++) {
      const d = chooseThrow(req(layout(cfg, i), 'B', 'easy', i), cfg);
      expect(d.plan).toBe('point');
      expect(d.targetId).toBeUndefined();
    }
  });

  it('a shot (zero noise and error) usually removes the opponent from holding the point', () => {
    const cfg = perfect();
    for (const lv of ['medium', 'hard'] as const) {
      let broke = 0;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const s = layout(cfg, i);
        const d = chooseThrow(req(s, 'B', lv, i), cfg);
        const after = apply(s, 'B', d.intent, cfg);
        if (holdingTeam(after)?.team !== 'A') broke++;
      }
      expect(broke).toBeGreaterThanOrEqual(Math.ceil(n * 0.6));
    }
  });

  it('does not shoot when it already holds the point', () => {
    const cfg = defaultConfig;
    const jack = jackAt(cfg, 0, -3);
    const s = scene(cfg, jack, [bouleAt(cfg, 'A1', 0.3, -3), bouleAt(cfg, 'B1', 0.06, -3)], 'A', 'A');
    // A is not holding here (B1 is closer) so A may shoot; flip: B throws while holding.
    const s2 = { ...s, toThrow: 'B' as TeamId };
    expect(chooseThrow(req(s2, 'B', 'hard'), cfg).plan).toBe('point');
  });
});

describe('chooseThrow: difficulty ordering', () => {
  it('average distance to the jack: hard < medium < easy (20 seeded throws each, normal noise)', () => {
    const cfg = defaultConfig;
    const avg = (lv: AiDifficulty): number => {
      let sum = 0;
      for (let i = 0; i < 20; i++) {
        const s = scene(cfg, jackAt(cfg, -0.8 + (i % 8) * 0.2, cfg.throw.originZ - (6.4 + (i % 6) * 0.65)), [], 'A');
        const noisy: MatchState = { ...s, rng: (i * 2654435761) >>> 0 };
        const d = chooseThrow(req(noisy, 'A', lv, 100 + i), cfg);
        const after = apply(noisy, 'A', d.intent, cfg);
        sum += Math.min(3, distances(after)[0]?.distance ?? 3);
      }
      return sum / 20;
    };
    const easy = avg('easy');
    const medium = avg('medium');
    const hard = avg('hard');
    expect(hard).toBeLessThan(medium);
    expect(medium).toBeLessThan(easy);
  });
});
