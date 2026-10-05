import { describe, expect, it } from 'vitest';
import { createBody, type Body, type SimEvent } from '../../engine';
import { defaultConfig } from '../../tuning';
import { analyseShot, DEFAULT_CARREAU, type ShotInput } from './carreau';

const spec = defaultConfig.balls.boule;
const rest = (id: string, kind: string, x: number, z: number): Body => {
  const b = createBody(id, kind, kind === 'jack' ? defaultConfig.balls.jack : spec, { x, y: 0, z });
  b.state = 'resting';
  return b;
};
const hit = (a: string, b: string, speed = 4): SimEvent => ({ type: 'hit', a, b, speed });
const teamOf = (id: string): string | null => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null);

/** A shoots at B1 which lies at (0, -8) next to the jack. */
const scene = (): Pick<ShotInput, 'thrownId' | 'teamOf' | 'before'> => ({
  thrownId: 'A2',
  teamOf,
  before: [rest('jack', 'jack', 0.3, -8.1), rest('B1', 'boule', 0, -8), rest('A1', 'boule', 0.6, -7.9)],
});

describe('analyseShot', () => {
  it('carreau: knocks the target away and takes its place', () => {
    const s = scene();
    const out = analyseShot({
      ...s,
      events: [{ type: 'land', id: 'A2', speed: 5 }, hit('A2', 'B1')],
      after: [...s.before.slice(0, 1), rest('B1', 'boule', -1.4, -8.6), rest('A1', 'boule', 0.6, -7.9), rest('A2', 'boule', 0.05, -8.1)],
    });
    expect(out.kind).toBe('carreau');
    expect(out.targetId).toBe('B1');
    expect(out.spot).toEqual({ x: 0, y: s.before[1]?.pos.y, z: -8 });
    expect(out.knocked).toBeGreaterThan(1);
  });

  it('plain hit: target knocked >= 0.5 m but the shooter rolls on', () => {
    const s = scene();
    const out = analyseShot({ ...s, events: [hit('B1', 'A2')], after: [rest('jack', 'jack', 0.3, -8.1), rest('B1', 'boule', 0.8, -8.3), rest('A2', 'boule', -0.9, -8.9)] });
    expect(out.kind).toBe('hit');
    expect(out.targetId).toBe('B1');
  });

  it('a target pushed off the pitch is a hit (shooter staying near is a carreau)', () => {
    const s = scene();
    const out = analyseShot({ ...s, events: [hit('A2', 'B1')], after: [rest('A2', 'boule', 0.02, -8.02), { ...rest('B1', 'boule', 5, -8), state: 'out' }] });
    expect(out.kind).toBe('carreau');
    expect(out.knocked).toBe(Infinity);
    const gone = analyseShot({ ...s, events: [hit('A2', 'B1')], after: [rest('A2', 'boule', 1.5, -9), { ...rest('B1', 'boule', 5, -8), state: 'out' }] });
    expect(gone.kind).toBe('hit');
  });

  it('a nudge below the knock distance is nothing', () => {
    const s = scene();
    const out = analyseShot({ ...s, events: [hit('A2', 'B1')], after: [rest('B1', 'boule', 0.2, -8.1), rest('A2', 'boule', -0.1, -8)] });
    expect(out.kind).toBe('none');
  });

  it('only the first contact counts: jack first, or an own boule first, is no shot', () => {
    const s = scene();
    const after = [rest('B1', 'boule', -1.4, -8.6), rest('A2', 'boule', 0.05, -8.1)];
    expect(analyseShot({ ...s, events: [hit('A2', 'jack'), hit('A2', 'B1')], after }).kind).toBe('none');
    expect(analyseShot({ ...s, events: [hit('A2', 'A1'), hit('A2', 'B1')], after }).kind).toBe('none');
  });

  it('never counts hitting the jack or an own boule, a soft touch, or a throw without contact', () => {
    const s = scene();
    const after = [rest('B1', 'boule', -1.4, -8.6), rest('A2', 'boule', 0.05, -8.1)];
    expect(analyseShot({ ...s, events: [hit('A2', 'A1')], after }).kind).toBe('none');
    expect(analyseShot({ ...s, events: [hit('A2', 'B1', DEFAULT_CARREAU.minHitSpeed / 2)], after }).kind).toBe('none');
    expect(analyseShot({ ...s, events: [{ type: 'land', id: 'A2', speed: 3 }], after }).kind).toBe('none');
    expect(analyseShot({ ...s, events: [], after }).kind).toBe('none');
  });

  it('honours the thresholds in the config', () => {
    const s = scene();
    const input: ShotInput = { ...s, events: [hit('A2', 'B1')], after: [rest('B1', 'boule', -1.4, -8.6), rest('A2', 'boule', 0.3, -8.1)] };
    expect(analyseShot(input).kind).toBe('hit'); // 0.3 m away from the spot: too far for a carreau
    expect(analyseShot(input, { ...DEFAULT_CARREAU, maxRestDistance: 0.4 }).kind).toBe('carreau');
    expect(analyseShot(input, { ...DEFAULT_CARREAU, minKnockDistance: 3 }).kind).toBe('none');
  });
});
