import { describe, expect, it } from 'vitest';
import { createBody } from '../engine';
import { createMatch } from '../games/petanque';
import type { MatchState } from '../games/petanque';
import { defaultConfig } from '../tuning';
import { endCardView, formatLead, jackFault, matchOverTitle, scoreLine, settleMessage, turnView, VOICE_VS } from './matchText';

const cfg = defaultConfig;
const base = (): MatchState => createMatch(1, cfg);

const rest = (id: string, kind: string, x: number, z: number) => {
  const b = createBody(id, kind, kind === 'jack' ? cfg.balls.jack : cfg.balls.boule, { x, y: 0, z });
  b.state = 'resting';
  return b;
};

describe('turnView', () => {
  it('announces the jack throw with the zone range', () => {
    const v = turnView(base());
    expect(v.banner).toBe('Blue — throw the jack');
    expect(v.hint).toContain('6–10 m');
  });
  it('says who plays in the boule phase', () => {
    expect(turnView({ ...base(), phase: 'boule', toThrow: 'B' }).banner).toBe('Red to play');
  });
});

describe('jackFault', () => {
  const rules = cfg.match;
  it('classifies short, far, side and out', () => {
    const o = cfg.throw.originZ;
    expect(jackFault(rest('jack', 'jack', 0, o - 3), rules, cfg)).toBe('too short');
    expect(jackFault(rest('jack', 'jack', 0, o - 12), rules, cfg)).toBe('too far');
    expect(jackFault(rest('jack', 'jack', 1.9, o - 8), rules, cfg)).toBe('too close to the side');
    expect(jackFault(rest('jack', 'jack', 0, o - 8), rules, cfg)).toBeNull();
    const out = rest('jack', 'jack', 0, o - 8);
    out.state = 'out';
    expect(jackFault(out, rules, cfg)).toBe('out of the pitch');
    expect(jackFault(undefined, rules, cfg)).toBe('out of the pitch');
  });
});

describe('settleMessage', () => {
  it('explains an invalid jack', () => {
    const s: MatchState = { ...base(), toThrow: 'B', jackAttempts: 1 };
    expect(settleMessage(s, 'too short')?.text).toBe('Jack too short — Red throws it');
  });
  it('names the holder and the lead', () => {
    const z = cfg.throw.originZ - 8;
    const s: MatchState = {
      ...base(),
      phase: 'boule',
      toThrow: 'A',
      throws: [
        { id: 'jack', team: 'A', intent: { aim: 0, power: 0.5, loft: 'half' }, params: {} as never },
        { id: 'A1', team: 'A', intent: { aim: 0, power: 0.5, loft: 'half' }, params: {} as never },
        { id: 'B1', team: 'B', intent: { aim: 0, power: 0.5, loft: 'half' }, params: {} as never },
      ],
      bodies: [rest('jack', 'jack', 0, z), rest('A1', 'boule', 0.5, z), rest('B1', 'boule', 0.2, z)],
    };
    expect(settleMessage(s, null)).toEqual({ text: 'Red holds the point (by 30\u00a0cm)', team: 'B' });
  });
  it('is silent when a card takes over', () => {
    expect(settleMessage({ ...base(), phase: 'endOver' }, null)).toBeNull();
  });
});

describe('cards', () => {
  it('end card', () => {
    expect(endCardView({ winner: 'A', points: 2, scoringIds: [], reason: 'normal' }).title).toBe('Blue scores 2');
    expect(endCardView({ winner: null, points: 0, scoringIds: [], reason: 'tie' }).title).toBe('Tie — no points');
    expect(endCardView({ winner: null, points: 0, scoringIds: [], reason: 'jackOut' }).title).toBe('Dead end — no points');
  });
  it('score and match over', () => {
    expect(scoreLine({ A: 5, B: 3 })).toBe('Blue 5 – 3 Red');
    expect(matchOverTitle('B', { A: 8, B: 13 })).toBe('Red wins 13 – 8');
  });
  it('formatLead', () => {
    expect(formatLead(0.123)).toBe('12\u00a0cm');
    expect(formatLead(0.004)).toBe('4\u00a0mm');
  });
});

describe('vs computer voice', () => {
  it('speaks to the human and describes the computer', () => {
    expect(matchOverTitle('A', { A: 13, B: 8 }, VOICE_VS)).toBe('You win 13 – 8');
    expect(matchOverTitle('B', { A: 8, B: 13 }, VOICE_VS)).toBe('Computer wins 13 – 8');
    expect(endCardView({ winner: 'A', points: 2, scoringIds: [], reason: 'normal' }, VOICE_VS).title).toBe('You score 2');
    expect(endCardView({ winner: 'B', points: 2, scoringIds: [], reason: 'normal' }, VOICE_VS).title).toBe('Computer scores 2');
    expect(scoreLine({ A: 5, B: 3 }, VOICE_VS)).toBe('You 5 – 3 Computer');
  });
  it('turn banners', () => {
    expect(turnView(base(), VOICE_VS).banner).toBe('Your turn — throw the jack');
    expect(turnView({ ...base(), phase: 'boule', toThrow: 'B' }, VOICE_VS).banner).toBe('Computer is thinking…');
    expect(turnView({ ...base(), phase: 'jack', toThrow: 'B' }, VOICE_VS).banner).toBe('Computer is thinking…');
    expect(turnView({ ...base(), phase: 'boule', toThrow: 'A' }, VOICE_VS).chip).toBe('Your turn');
  });
  it('settle messages use the right verbs', () => {
    const s: MatchState = { ...base(), toThrow: 'A', jackAttempts: 1 };
    expect(settleMessage(s, 'too far', VOICE_VS)?.text).toBe('Jack too far — You throw it');
  });
});
