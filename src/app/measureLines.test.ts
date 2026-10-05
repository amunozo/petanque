import { describe, expect, it } from 'vitest';
import { createBody } from '../engine';
import { createMatch, type MatchState } from '../games/petanque';
import { setLang } from '../i18n';
import { defaultConfig } from '../tuning';
import { formatMeasure, isTight, measureTargets } from './measureLines';

const cfg = defaultConfig;
const rest = (id: string, kind: string, x: number, z: number) => {
  const b = createBody(id, kind, kind === 'jack' ? cfg.balls.jack : cfg.balls.boule, { x, y: 0, z });
  b.state = 'resting';
  return b;
};
const rec = (id: string, team: 'A' | 'B') => ({ id, team, intent: { aim: 0, power: 0.5, loft: 'half' as const }, params: {} as never });
const state = (bodies: ReturnType<typeof rest>[]): MatchState => ({
  ...createMatch(1, cfg),
  phase: 'endOver',
  throws: [rec('jack', 'A'), rec('A1', 'A'), rec('A2', 'A'), rec('B1', 'B')],
  bodies,
});

describe('measureTargets', () => {
  const z = -8;
  const s = state([rest('jack', 'jack', 0, z), rest('A1', 'boule', 0.5, z), rest('A2', 'boule', 0.2, z), rest('B1', 'boule', 0, z - 0.4)]);

  it('picks each team\'s nearest boule with surface-to-surface lines', () => {
    const t = measureTargets(s);
    expect(t.map((x) => [x.team, x.id])).toEqual([['A', 'A2'], ['B', 'B1']]);
    const a = t[0];
    expect(a?.distance).toBeCloseTo(0.2 - cfg.balls.jack.radius - cfg.balls.boule.radius, 5);
    // the line runs along z=-8 from the jack's surface to the boule's surface
    expect(a?.from.x).toBeCloseTo(cfg.balls.jack.radius, 5);
    expect(a?.to.x).toBeCloseTo(0.2 - cfg.balls.boule.radius, 5);
  });
  it('skips far boules, out jacks and empty pitches', () => {
    expect(measureTargets(s, 0.2).map((x) => x.team)).toEqual(['A']);
    const out = rest('jack', 'jack', 0, z);
    out.state = 'out';
    expect(measureTargets(state([out, rest('A1', 'boule', 0.5, z)]))).toEqual([]);
    expect(measureTargets(state([]))).toEqual([]);
  });
  it('flags a tight finish', () => {
    const t = measureTargets(s);
    expect(isTight(t, 0.5)).toBe(true);
    expect(isTight(t, 0.01)).toBe(false);
    expect(isTight(t, 0)).toBe(false);
    expect(isTight(t.slice(0, 1), 1)).toBe(false);
  });
});

describe('formatMeasure', () => {
  it('uses cm with a decimal when tiny, and the language\'s decimal separator', () => {
    setLang('en');
    expect(formatMeasure(0.045)).toBe('4.5 cm');
    expect(formatMeasure(0.234)).toBe('23 cm');
    expect(formatMeasure(1.236)).toBe('1.24 m');
    setLang('fr');
    expect(formatMeasure(0.045)).toBe('4,5 cm');
    expect(formatMeasure(1.236)).toBe('1,24 m');
    setLang('pt');
    expect(formatMeasure(0.0123)).toBe('1,2 cm');
    setLang('en');
  });
});
