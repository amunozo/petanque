import { describe, expect, it } from 'vitest';
import { createBody, simulateToRest, type Body, type ThrowIntent } from '../../engine';
import { defaultConfig } from '../../tuning/config';
import { applyAction, beginThrow, canThrow, createMatch, nextEnd, settle } from './match';
import { distances, holdingTeam, isValidJack } from './matchMeasure';
import type { MatchState, TeamId, ThrowRecord } from './matchTypes';

const cfg = defaultConfig;
const R = cfg.balls.boule.radius + cfg.balls.jack.radius;
const ORIGIN_Z = cfg.throw.originZ;

const rec = (id: string, team: TeamId): ThrowRecord => ({
  id,
  team,
  intent: { aim: 0, power: 0.5, loft: 'half' },
  params: { yaw: 0, pitch: 0.5, speed: 5, origin: { x: 0, y: 0.5, z: ORIGIN_Z } },
});
const jackAt = (x: number, z: number, state: Body['state'] = 'resting'): Body => {
  const b = createBody('jack', 'jack', cfg.balls.jack, { x, y: 0, z });
  b.state = state;
  return b;
};
/** Boule whose surface gap to a jack at (jx,jz) is `gap`, offset along +x. */
const bouleAt = (id: string, jx: number, jz: number, gap: number, state: Body['state'] = 'resting'): Body => {
  const b = createBody(id, 'boule', cfg.balls.boule, { x: jx + gap + R, y: 0, z: jz });
  b.state = state;
  return b;
};
const JX = 0;
const JZ = ORIGIN_Z - 8;
const J = () => jackAt(JX, JZ);

/** Boule-phase match; `thrown` lists boule ids in throw order, `left` the boules still in hand. */
function boulePhase(thrown: string[], left: { A: number; B: number }, over: Partial<MatchState> = {}): MatchState {
  const s = createMatch(7, cfg);
  return {
    ...s,
    phase: 'inFlight',
    jackTeam: 'A',
    throws: [rec('jack', 'A'), ...thrown.map((id) => rec(id, id[0] as TeamId))],
    boulesLeft: left,
    ...over,
  };
}
const settleBoules = (s: MatchState, bodies: Body[]): MatchState => settle(s, bodies, cfg);

/** State right after a jack throw (in flight, jack record present). */
function afterJackThrow(thrower: TeamId, over: Partial<MatchState> = {}): MatchState {
  const s = createMatch(7, cfg, thrower);
  return { ...s, phase: 'inFlight', throws: [rec('jack', thrower)], ...over };
}

describe('createMatch', () => {
  it('starts in the jack phase with the rules snapshot', () => {
    const s = createMatch(1, cfg, 'B');
    expect(s).toMatchObject({
      phase: 'jack',
      toThrow: 'B',
      jackTeam: 'B',
      score: { A: 0, B: 0 },
      endNumber: 1,
      boulesLeft: { A: 3, B: 3 },
      jackAttempts: 0,
      lastEnd: null,
      winner: null,
    });
    expect(s.rules).toEqual(cfg.match);
    expect(s.rules).not.toBe(cfg.match);
    expect(createMatch(1, cfg).toThrow).toBe('A');
  });
});

describe('beginThrow', () => {
  const intent: ThrowIntent = { aim: 0, power: 0.6, loft: 'half' };

  it('jack phase: the jack flies alone', () => {
    const s = createMatch(3, cfg);
    const r = beginThrow(s, 'A', intent, cfg);
    expect(r.state.phase).toBe('inFlight');
    expect(r.world.bodies.map((b) => b.id)).toEqual(['jack']);
    expect(r.world.bodies[0]?.kind).toBe('jack');
    expect(r.world.bodies[0]?.state).toBe('flying');
    expect(r.state.throws).toHaveLength(1);
    expect(r.state.throws[0]).toMatchObject({ id: 'jack', team: 'A', intent });
    expect(r.state.rng).not.toBe(s.rng);
  });

  it('rejects the wrong team and the wrong phase', () => {
    const s = createMatch(3, cfg);
    expect(canThrow(s, 'A')).toBe(true);
    expect(canThrow(s, 'B')).toBe(false);
    expect(() => beginThrow(s, 'B', intent, cfg)).toThrow();
    const flying = beginThrow(s, 'A', intent, cfg).state;
    expect(() => beginThrow(flying, 'A', intent, cfg)).toThrow();
    expect(() => beginThrow({ ...s, phase: 'endOver' }, 'A', intent, cfg)).toThrow();
  });

  it('boule phase: resting bodies kept, new boule id by team count, boulesLeft drops', () => {
    let s = boulePhase(['A1', 'B1'], { A: 2, B: 2 }, { phase: 'boule', toThrow: 'A', bodies: [J(), bouleAt('A1', JX, JZ, 0.5), bouleAt('B1', JX, JZ, 1)] });
    const r = beginThrow(s, 'A', intent, cfg);
    expect(r.world.bodies.map((b) => b.id)).toEqual(['jack', 'A1', 'B1', 'A2']);
    expect(r.world.bodies[3]).toMatchObject({ kind: 'boule', state: 'flying' });
    expect(r.state.boulesLeft).toEqual({ A: 1, B: 2 });
    expect(r.state.throws.at(-1)).toMatchObject({ id: 'A2', team: 'A' });
    s = { ...r.state, phase: 'boule', toThrow: 'B' };
    expect(beginThrow(s, 'B', intent, cfg).world.bodies.at(-1)?.id).toBe('B2');
  });
});

describe('jack validity', () => {
  const v = (x: number, z: number, st: Body['state'] = 'resting') => isValidJack(jackAt(x, z, st), cfg.match, cfg);

  it('accepts a jack in range and clear of the boards', () => {
    expect(v(0, ORIGIN_Z - 8)).toBe(true);
    expect(v(1.4, ORIGIN_Z - 7)).toBe(true);
  });
  it('rejects too short, too long, too close to a board, out', () => {
    expect(v(0, ORIGIN_Z - 5.5)).toBe(false);
    expect(v(0, ORIGIN_Z - 10.3)).toBe(false);
    expect(v(1.6, ORIGIN_Z - 8)).toBe(false);
    expect(v(-1.6, ORIGIN_Z - 8)).toBe(false);
    expect(v(0, ORIGIN_Z - 8, 'out')).toBe(false);
    expect(isValidJack(undefined, cfg.match, cfg)).toBe(false);
  });
  it('measures from the throwing circle (diagonal counts)', () => {
    // 5.9 straight ahead is short; with lateral offset the centre distance exceeds 6.
    expect(v(0, ORIGIN_Z - 5.9)).toBe(false);
    expect(v(1.2, ORIGIN_Z - 5.9)).toBe(true);
  });
});

describe('jack phase settle', () => {
  it('valid jack -> boule phase, jackTeam throws first boule', () => {
    const s = settleBoules(afterJackThrow('A'), [J()]);
    expect(s.phase).toBe('boule');
    expect(s.toThrow).toBe('A');
    expect(s.jackAttempts).toBe(0);
    expect(s.bodies.map((b) => b.id)).toEqual(['jack']);
  });

  for (const [name, jack] of [
    ['too short', jackAt(0, ORIGIN_Z - 4)],
    ['too long', jackAt(0, ORIGIN_Z - 10.4)],
    ['too close to board', jackAt(1.7, ORIGIN_Z - 8)],
    ['out', jackAt(0, -20, 'out')],
  ] as const) {
    it(`invalid jack (${name}) -> removed, other team throws the jack`, () => {
      const s = settleBoules(afterJackThrow('A'), [jack]);
      expect(s.phase).toBe('jack');
      expect(s.toThrow).toBe('B');
      expect(s.jackTeam).toBe('A');
      expect(s.jackAttempts).toBe(1);
      expect(s.bodies).toEqual([]);
    });
  }

  it('second invalid jack -> auto placed legally, jackTeam throws the first boule', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = afterJackThrow('A', { seed, rng: seed });
      s = settleBoules(s, [jackAt(0, ORIGIN_Z - 4)]);
      expect(s.toThrow).toBe('B');
      s = { ...s, phase: 'inFlight', throws: [...s.throws, rec('jack', 'B')] };
      const before = s.rng;
      s = settleBoules(s, [jackAt(0, ORIGIN_Z - 4)]);
      expect(s.phase).toBe('boule');
      expect(s.toThrow).toBe('A');
      expect(s.jackAttempts).toBe(2);
      expect(s.rng).not.toBe(before);
      expect(s.bodies).toHaveLength(1);
      const jack = s.bodies[0] as Body;
      expect(jack.id).toBe('jack');
      expect(isValidJack(jack, s.rules, cfg)).toBe(true);
    }
  });

  it('auto placement is deterministic', () => {
    const run = () => {
      let s = afterJackThrow('B', { rng: 99 });
      s = settleBoules(s, [jackAt(0, 0, 'out')]);
      s = { ...s, phase: 'inFlight', throws: [...s.throws, rec('jack', 'A')] };
      return JSON.stringify(settleBoules(s, [jackAt(0, 0, 'out')]));
    };
    expect(run()).toBe(run());
  });
});

describe('who throws next', () => {
  it('the team not holding the point throws', () => {
    const s = settleBoules(boulePhase(['A1'], { A: 2, B: 3 }), [J(), bouleAt('A1', JX, JZ, 0.3)]);
    expect(s.phase).toBe('boule');
    expect(s.toThrow).toBe('B');
    const s2 = settleBoules(boulePhase(['A1', 'B1'], { A: 2, B: 2 }), [J(), bouleAt('A1', JX, JZ, 0.6), bouleAt('B1', JX, JZ, 0.2)]);
    expect(s2.toThrow).toBe('A');
  });

  it('holder throws again when the non-holder is out of boules', () => {
    const s = settleBoules(boulePhase(['A1', 'B1', 'B2', 'B3', 'A2'], { A: 1, B: 0 }), [
      J(),
      bouleAt('A1', JX, JZ, 0.1),
      bouleAt('B1', JX, JZ, 0.5),
      bouleAt('B2', JX, JZ, 0.7),
      bouleAt('B3', JX, JZ, 0.9),
      bouleAt('A2', JX, JZ, 0.4),
    ]);
    expect(s.phase).toBe('boule');
    expect(s.toThrow).toBe('A');
  });

  it('nothing in play: the team that did not throw last throws', () => {
    const s = settleBoules(boulePhase(['A1'], { A: 2, B: 3 }), [J(), bouleAt('A1', JX, JZ, 3, 'out')]);
    expect(s.toThrow).toBe('B');
    // ...unless it has no boules
    const s2 = settleBoules(boulePhase(['A1'], { A: 2, B: 0 }), [J(), bouleAt('A1', JX, JZ, 3, 'out')]);
    expect(s2.toThrow).toBe('A');
  });

  it('only the opponent has a boule in play: the thrower (non-holder) goes', () => {
    const s = settleBoules(boulePhase(['A1', 'B1'], { A: 2, B: 2 }), [J(), bouleAt('A1', JX, JZ, 1, 'out'), bouleAt('B1', JX, JZ, 0.5)]);
    expect(s.toThrow).toBe('A');
  });

  it('equidistant: the team that threw last throws again (or the other if empty-handed)', () => {
    const bodies = [J(), bouleAt('A1', JX, JZ, 0.4), { ...bouleAt('B1', JX, JZ, 0.4004), pos: { x: JX - 0.4004 - R, y: cfg.balls.boule.radius, z: JZ } }];
    const s = settleBoules(boulePhase(['A1', 'B1'], { A: 2, B: 2 }), bodies);
    expect(s.toThrow).toBe('B');
    expect(holdingTeam(s)).toBeNull();
    const s2 = settleBoules(boulePhase(['A1', 'B1'], { A: 2, B: 0 }), bodies);
    expect(s2.toThrow).toBe('A');
  });
});

describe('scoring', () => {
  const finish = (thrown: string[], bodies: Body[]) => settleBoules(boulePhase(thrown, { A: 0, B: 0 }), bodies);

  it('1 point: only the closest is closer than the opponent best', () => {
    const s = finish(['A1', 'B1', 'A2', 'B2'], [J(), bouleAt('A1', JX, JZ, 0.1), bouleAt('B1', JX, JZ, 0.3), bouleAt('A2', JX, JZ, 0.5), bouleAt('B2', JX, JZ, 0.6)]);
    expect(s.phase).toBe('endOver');
    expect(s.lastEnd).toEqual({ winner: 'A', points: 1, scoringIds: ['A1'], reason: 'normal' });
    expect(s.score).toEqual({ A: 1, B: 0 });
  });

  it('2 and 3 points', () => {
    const s2 = finish(['A1', 'B1', 'A2', 'B2'], [J(), bouleAt('B1', JX, JZ, 0.5), bouleAt('A1', JX, JZ, 0.1), bouleAt('A2', JX, JZ, 0.3), bouleAt('B2', JX, JZ, 0.8)]);
    expect(s2.lastEnd).toMatchObject({ winner: 'A', points: 2, scoringIds: ['A1', 'A2'] });
    const s3 = finish(['B1', 'B2', 'B3', 'A1'], [J(), bouleAt('B1', JX, JZ, 0.1), bouleAt('B2', JX, JZ, 0.2), bouleAt('B3', JX, JZ, 0.3), bouleAt('A1', JX, JZ, 0.9)]);
    expect(s3.lastEnd).toMatchObject({ winner: 'B', points: 3 });
    expect(s3.score).toEqual({ A: 0, B: 3 });
  });

  it('opponent has nothing in play: all winner boules count', () => {
    const s = finish(['A1', 'B1', 'A2'], [J(), bouleAt('A1', JX, JZ, 1.5), bouleAt('B1', JX, JZ, 0.2, 'out'), bouleAt('A2', JX, JZ, 3)]);
    expect(s.lastEnd).toMatchObject({ winner: 'A', points: 2, scoringIds: ['A1', 'A2'] });
  });

  it('equidistant closest boules: no points (tie)', () => {
    const b1 = bouleAt('A1', JX, JZ, 0.3);
    const b2 = createBody('B1', 'boule', cfg.balls.boule, { x: JX - 0.3 - R, y: 0, z: JZ });
    const s = finish(['A1', 'B1'], [J(), b1, b2]);
    expect(s.lastEnd).toEqual({ winner: null, points: 0, scoringIds: [], reason: 'tie' });
    expect(s.score).toEqual({ A: 0, B: 0 });
    expect(s.phase).toBe('endOver');
  });

  it('a boule touching the jack reads 0, never negative', () => {
    const s = finish(['A1', 'B1'], [J(), bouleAt('A1', JX, JZ, -0.01), bouleAt('B1', JX, JZ, 0.2)]);
    expect(distances(s)[0]?.distance).toBe(0);
  });

  it('nothing in play at all: dead end', () => {
    const s = finish(['A1', 'B1'], [J(), bouleAt('A1', JX, JZ, 1, 'out'), bouleAt('B1', JX, JZ, 1, 'out')]);
    expect(s.lastEnd).toMatchObject({ winner: null, points: 0 });
  });

  it('holdingTeam reports holder, distance and lead', () => {
    const s = { ...boulePhase(['A1', 'B1'], { A: 2, B: 2 }), bodies: [J(), bouleAt('A1', JX, JZ, 0.5), bouleAt('B1', JX, JZ, 0.2)] };
    const h = holdingTeam(s);
    expect(h?.team).toBe('B');
    expect(h?.distance).toBeCloseTo(0.2, 9);
    expect(h?.lead).toBeCloseTo(0.3, 9);
    const only = { ...s, bodies: [J(), bouleAt('A1', JX, JZ, 0.5)] };
    expect(holdingTeam(only)).toMatchObject({ team: 'A', lead: null });
    expect(holdingTeam({ ...s, bodies: [] })).toBeNull();
    expect(distances({ ...s, bodies: [jackAt(0, 0, 'out'), bouleAt('A1', 0, 0, 1)] })).toEqual([]);
  });
});

describe('jack out', () => {
  const outJack = () => jackAt(0, -30, 'out');

  it('both teams with boules in hand: dead end', () => {
    const s = settleBoules(boulePhase(['A1'], { A: 2, B: 3 }), [outJack(), bouleAt('A1', 0, 0, 1)]);
    expect(s.phase).toBe('endOver');
    expect(s.lastEnd).toEqual({ winner: null, points: 0, scoringIds: [], reason: 'jackOut' });
    expect(s.score).toEqual({ A: 0, B: 0 });
  });

  it('only one team with boules in hand: it scores them', () => {
    const s = settleBoules(boulePhase(['A1'], { A: 0, B: 2 }), [outJack(), bouleAt('A1', 0, 0, 1)]);
    expect(s.lastEnd).toMatchObject({ winner: 'B', points: 2, reason: 'jackOut' });
    expect(s.score).toEqual({ A: 0, B: 2 });
    const s2 = settleBoules(boulePhase(['B1'], { A: 1, B: 0 }), [outJack(), bouleAt('B1', 0, 0, 1)]);
    expect(s2.lastEnd).toMatchObject({ winner: 'A', points: 1 });
  });

  it('neither team with boules: dead end', () => {
    const s = settleBoules(boulePhase(['A1', 'B1'], { A: 0, B: 0 }), [outJack()]);
    expect(s.lastEnd).toMatchObject({ winner: null, points: 0, reason: 'jackOut' });
    expect(s.phase).toBe('endOver');
  });
});

describe('match over and next end', () => {
  const scoringEnd = (score: { A: number; B: number }, pointsToWin = 13): MatchState => {
    const base = boulePhase(['A1', 'B1'], { A: 0, B: 0 }, { score });
    return settleBoules({ ...base, rules: { ...base.rules, pointsToWin } }, [J(), bouleAt('A1', JX, JZ, 0.1), bouleAt('B1', JX, JZ, 0.5)]);
  };

  it('reaching pointsToWin ends the match', () => {
    const s = scoringEnd({ A: 12, B: 11 });
    expect(s.phase).toBe('matchOver');
    expect(s.winner).toBe('A');
    expect(s.score.A).toBe(13);
    expect(nextEnd(s)).toBe(s);
  });
  it('overshoot is allowed; below target continues', () => {
    expect(scoringEnd({ A: 12, B: 0 }, 13).phase).toBe('matchOver');
    const s = scoringEnd({ A: 5, B: 12 });
    expect(s.phase).toBe('endOver');
    expect(s.winner).toBeNull();
    expect(scoringEnd({ A: 0, B: 0 }, 1).winner).toBe('A');
  });
  it('the rules snapshot is used, not live config', () => {
    const s = createMatch(1, cfg);
    const changed = { ...cfg, match: { ...cfg.match, pointsToWin: 1 } };
    expect(settle({ ...boulePhase(['A1', 'B1'], { A: 0, B: 0 }), rules: s.rules }, [J(), bouleAt('A1', JX, JZ, 0.1), bouleAt('B1', JX, JZ, 0.5)], changed).phase).toBe('endOver');
  });

  it('nextEnd: scorer throws the jack, state reset', () => {
    const over = scoringEnd({ A: 2, B: 3 }); // A wins this end
    expect(over.jackTeam).toBe('A');
    const flipped = { ...over, jackTeam: 'B' as TeamId };
    const n = nextEnd(flipped);
    expect(n).toMatchObject({ endNumber: 2, jackTeam: 'A', toThrow: 'A', phase: 'jack', throws: [], bodies: [], jackAttempts: 0, boulesLeft: { A: 3, B: 3 } });
    expect(n.score).toEqual({ A: 3, B: 3 });
  });
  it('nextEnd: dead end keeps the previous jackTeam; no-op outside endOver', () => {
    const dead = settleBoules(boulePhase(['A1'], { A: 2, B: 3 }, { jackTeam: 'B' }), [jackAt(0, -30, 'out'), bouleAt('A1', 0, 0, 1)]);
    expect(nextEnd(dead)).toMatchObject({ jackTeam: 'B', toThrow: 'B', endNumber: 2 });
    const s = createMatch(1, cfg);
    expect(nextEnd(s)).toBe(s);
  });
});

describe('purity and determinism', () => {
  const intents: ThrowIntent[] = [
    { aim: 0.0, power: 0.55, loft: 'half' },
    { aim: 0.02, power: 0.65, loft: 'half' },
    { aim: -0.03, power: 0.6, loft: 'lob' },
    { aim: 0.0, power: 0.55, loft: 'roll' },
    { aim: 0.01, power: 0.7, loft: 'half' },
    { aim: 0.0, power: 0.62, loft: 'shoot' },
    { aim: 0.0, power: 0.4, loft: 'roll' },
  ];

  /** Plays a whole end with fixed intents (jack intent first). */
  function playEnd(seed: number, check?: (s: MatchState) => void): MatchState {
    let s = createMatch(seed, cfg);
    let i = 0;
    let guard = 0;
    while ((s.phase === 'jack' || s.phase === 'boule') && guard++ < 30) {
      const intent = s.phase === 'jack' ? ({ aim: 0, power: 0.55, loft: 'half' } as ThrowIntent) : (intents[i++ % intents.length] as ThrowIntent);
      const r = applyAction(s, { type: 'throw', team: s.toThrow, intent }, cfg);
      expect(r.world).toBeDefined();
      s = applyAction(r.state, { type: 'settle', bodies: simulateToRest(r.world as never, cfg.physics).world.bodies }, cfg).state;
      check?.(s);
    }
    return s;
  }

  it('plays a whole end to endOver/matchOver with sane state', () => {
    let maxBoules = 0;
    const s = playEnd(11, (st) => {
      maxBoules = Math.max(maxBoules, st.bodies.filter((b) => b.kind === 'boule').length);
      expect(st.boulesLeft.A).toBeGreaterThanOrEqual(0);
    });
    expect(['endOver', 'matchOver']).toContain(s.phase);
    expect(s.lastEnd).not.toBeNull();
    expect(s.score.A + s.score.B).toBe(s.lastEnd?.points);
    // 6 boules + (1 jack throw or more) were thrown
    expect(s.throws.filter((t) => t.id !== 'jack')).toHaveLength(s.lastEnd?.reason === 'jackOut' ? s.throws.filter((t) => t.id !== 'jack').length : 6);
    const ids = s.throws.map((t) => t.id);
    expect(new Set(ids.filter((id) => id !== 'jack')).size).toBe(ids.filter((id) => id !== 'jack').length);
    // and a second end can start
    if (s.phase === 'endOver') expect(nextEnd(s).phase).toBe('jack');
  });

  it('same seed + intents + sim results -> identical state JSON; different seed differs', () => {
    expect(JSON.stringify(playEnd(5))).toBe(JSON.stringify(playEnd(5)));
    expect(JSON.stringify(playEnd(5))).not.toBe(JSON.stringify(playEnd(6)));
  });

  it('JSON round-trips at every phase', () => {
    playEnd(9, (s) => expect(JSON.parse(JSON.stringify(s))).toEqual(s));
    const fresh = createMatch(2, cfg);
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(fresh);
    const r = beginThrow(fresh, 'A', intents[0] as ThrowIntent, cfg);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });

  it('never mutates its inputs', () => {
    const s0 = boulePhase(['A1'], { A: 2, B: 3 }, { phase: 'boule', toThrow: 'B', bodies: [J(), bouleAt('A1', JX, JZ, 0.3)] });
    const snap = JSON.stringify(s0);
    const r = beginThrow(s0, 'B', intents[0] as ThrowIntent, cfg);
    expect(JSON.stringify(s0)).toBe(snap);
    const inflight = r.state;
    const snap2 = JSON.stringify(inflight);
    const bodies = simulateToRest(r.world, cfg.physics).world.bodies;
    const bodiesSnap = JSON.stringify(bodies);
    const out = settle(inflight, bodies, cfg);
    expect(JSON.stringify(inflight)).toBe(snap2);
    expect(JSON.stringify(bodies)).toBe(bodiesSnap);
    expect(out.bodies).not.toBe(bodies);
    expect(out.bodies[0]).not.toBe(bodies[0]);
    const over = settleBoules(boulePhase(['A1', 'B1'], { A: 0, B: 0 }), [J(), bouleAt('A1', JX, JZ, 0.1), bouleAt('B1', JX, JZ, 0.5)]);
    const snap3 = JSON.stringify(over);
    nextEnd(over);
    expect(JSON.stringify(over)).toBe(snap3);
  });

  it('settle is a no-op outside inFlight', () => {
    const s = createMatch(1, cfg);
    expect(settle(s, [J()], cfg)).toBe(s);
  });
});
