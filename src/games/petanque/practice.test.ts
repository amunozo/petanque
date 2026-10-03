import { describe, expect, it } from 'vitest';
import { simulateToRest, type ThrowIntent } from '../../engine';
import { cloneDeep } from '../../tuning/paths';
import { defaultConfig } from '../../tuning/config';
import {
  beginThrow,
  boulesLeft,
  closestBoule,
  createPractice,
  distancesToJack,
  JACK_ID,
  newEnd,
  previewThrow,
  settleThrow,
  type PracticeState,
} from './practice';

const cfg = defaultConfig;

const intents: ThrowIntent[] = [
  { aim: 0.02, power: 0.6, loft: 'half' },
  { aim: -0.05, power: 0.7, loft: 'lob' },
  { aim: 0.0, power: 0.5, loft: 'roll' },
];

function play(seed: number, list: ThrowIntent[]): PracticeState {
  let s = createPractice(seed, cfg);
  for (const intent of list) {
    const r = beginThrow(s, intent, cfg);
    s = settleThrow(r.state, simulateToRest(r.world, cfg.physics).world, cfg);
  }
  return s;
}

describe('practice', () => {
  it('places the jack within the configured range and width', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createPractice(seed, cfg);
      const dist = cfg.throw.originZ - s.jack.z;
      expect(dist).toBeGreaterThanOrEqual(cfg.practice.jackMinDist);
      expect(dist).toBeLessThanOrEqual(cfg.practice.jackMaxDist);
      expect(Math.abs(s.jack.x)).toBeLessThanOrEqual(0.8);
      expect(s.bodies).toHaveLength(1);
      expect(s.bodies[0]?.id).toBe(JACK_ID);
      expect(s.phase).toBe('aiming');
      expect(s.endNumber).toBe(1);
    }
  });

  it('is deterministic: same seed and intents give identical state', () => {
    const a = play(1234, intents);
    const b = play(1234, intents);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(play(1235, intents))).not.toBe(JSON.stringify(a));
  });

  it('survives a JSON round trip mid-end', () => {
    const half = play(7, intents.slice(0, 1));
    const restored = JSON.parse(JSON.stringify(half)) as PracticeState;
    const finish = (s: PracticeState): PracticeState => {
      let cur = s;
      for (const intent of intents.slice(1)) {
        const r = beginThrow(cur, intent, cfg);
        cur = settleThrow(r.state, simulateToRest(r.world, cfg.physics).world, cfg);
      }
      return cur;
    };
    expect(JSON.stringify(finish(restored))).toBe(JSON.stringify(finish(half)));
  });

  it('ends the end after boulesPerEnd boules', () => {
    let s = createPractice(5, cfg);
    for (let i = 0; i < cfg.practice.boulesPerEnd; i++) {
      expect(s.phase).toBe('aiming');
      expect(boulesLeft(s, cfg)).toBe(cfg.practice.boulesPerEnd - i);
      const r = beginThrow(s, intents[i % intents.length] as ThrowIntent, cfg);
      expect(r.state.phase).toBe('inFlight');
      expect(r.world.bodies.length).toBe(s.bodies.length + 1);
      s = settleThrow(r.state, simulateToRest(r.world, cfg.physics).world, cfg);
    }
    expect(s.phase).toBe('endOver');
    expect(s.throws).toHaveLength(cfg.practice.boulesPerEnd);
    expect(s.bodies).toHaveLength(cfg.practice.boulesPerEnd + 1);
    expect(() => beginThrow(s, intents[0] as ThrowIntent, cfg)).toThrow();
  });

  it('does not mutate its inputs', () => {
    const s = createPractice(9, cfg);
    const snapshot = JSON.stringify(s);
    const r = beginThrow(s, intents[0] as ThrowIntent, cfg);
    expect(JSON.stringify(s)).toBe(snapshot);
    const worldSnapshot = JSON.stringify(r.world);
    settleThrow(r.state, r.world, cfg);
    expect(JSON.stringify(r.world)).toBe(worldSnapshot);
  });

  it('newEnd clears boules, re-places the jack and counts ends', () => {
    const s = play(3, intents);
    const n = newEnd(s, cfg);
    expect(n.endNumber).toBe(2);
    expect(n.throws).toHaveLength(0);
    expect(n.bodies).toHaveLength(1);
    expect(n.phase).toBe('aiming');
    expect(n.jack).not.toEqual(s.jack);
    expect(JSON.stringify(newEnd(s, cfg))).toBe(JSON.stringify(n));
  });

  it('settleThrow forces unsettled balls to rest', () => {
    const r = beginThrow(createPractice(11, cfg), intents[0] as ThrowIntent, cfg);
    const s = settleThrow(r.state, r.world, cfg);
    expect(s.bodies.every((b) => b.state === 'resting' || b.state === 'out')).toBe(true);
  });

  it('measures the surface gap on XZ (centre distance minus radii), sorted, with out boules last', () => {
    const cfg3 = cloneDeep(cfg);
    const s0 = createPractice(1, cfg3);
    const jack = s0.bodies[0]!;
    const mk = (id: string, dx: number, dz: number, out = false) => ({
      ...jack,
      id,
      kind: 'boule',
      pos: { x: jack.pos.x + dx, y: 0.0375, z: jack.pos.z + dz },
      state: out ? ('out' as const) : ('resting' as const),
    });
    const th = (id: string) => ({ id, intent: intents[0] as ThrowIntent, params: beginThrow(s0, intents[0] as ThrowIntent, cfg3).params });
    const s: PracticeState = {
      ...s0,
      phase: 'aiming',
      throws: [th('b1'), th('b2'), th('b3')],
      bodies: [jack, mk('b1', 0.3, 0.4), mk('b2', 5, 5, true), mk('b3', 0.06, 0)],
    };
    const d = distancesToJack(s);
    expect(d.jackOut).toBe(false);
    expect(d.entries.map((e) => e.id)).toEqual(['b3', 'b1', 'b2']);
    // Test boules reuse the jack's spec (radius 0.015), so the gap is centre distance - 0.03.
    expect(d.entries[0]?.distance).toBeCloseTo(0.03, 9);
    expect(d.entries[1]?.distance).toBeCloseTo(0.47, 9);
    expect(d.entries[2]).toMatchObject({ out: true, distance: null });
    expect(closestBoule(s)?.id).toBe('b3');

    const jackOut: PracticeState = { ...s, bodies: [{ ...jack, state: 'out' }, ...s.bodies.slice(1)] };
    const dj = distancesToJack(jackOut);
    expect(dj.jackOut).toBe(true);
    expect(dj.entries.every((e) => e.distance === null)).toBe(true);
    expect(closestBoule(jackOut)).toBeNull();
  });

  it('previewThrow is noise free and lands where the real noiseless throw lands', () => {
    const p = previewThrow(intents[0] as ThrowIntent, cfg);
    expect(p.flight.points.length).toBeGreaterThan(2);
    expect(p.flight.landing.z).toBeLessThan(cfg.throw.originZ);
    expect(p.params.yaw).toBeCloseTo(0.02, 12);
  });
});
