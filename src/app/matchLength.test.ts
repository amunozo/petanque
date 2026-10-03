import { describe, expect, it } from 'vitest';
import { createMatch } from '../games/petanque';
import { defaultConfig } from '../tuning';
import { isMatchLength, matchConfig, matchInfoText, pointsFor } from './matchLength';

describe('match length', () => {
  it('standard follows the configured target, quick is 7 (never above the target)', () => {
    expect(pointsFor('standard', defaultConfig)).toBe(13);
    expect(pointsFor('quick', defaultConfig)).toBe(7);
    const low = { match: { ...defaultConfig.match, pointsToWin: 5 } };
    expect(pointsFor('standard', low)).toBe(5);
    expect(pointsFor('quick', low)).toBe(5);
  });

  it('matchConfig overrides pointsToWin on a copy and leaves the live config alone', () => {
    const live = structuredClone(defaultConfig);
    const quick = matchConfig(live, 'quick');
    expect(quick.match.pointsToWin).toBe(7);
    expect(quick.match.boulesPerTeam).toBe(live.match.boulesPerTeam);
    expect(quick.throw).toBe(live.throw);
    expect(live.match.pointsToWin).toBe(13);
    expect(matchConfig(live, 'standard').match.pointsToWin).toBe(13);
  });

  it('is snapshotted into the match rules', () => {
    expect(createMatch(1, matchConfig(defaultConfig, 'quick')).rules.pointsToWin).toBe(7);
    expect(createMatch(1, matchConfig(defaultConfig, 'standard')).rules.pointsToWin).toBe(13);
  });

  it('validates stored values and words the subtitle', () => {
    expect(isMatchLength('quick')).toBe(true);
    expect(isMatchLength('long')).toBe(false);
    expect(isMatchLength(null)).toBe(false);
    expect(matchInfoText(7)).toBe('Pass and play · first to 7');
  });
});
