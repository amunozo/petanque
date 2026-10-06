/** Match length presets (Quick / Standard): which `pointsToWin` a new match uses. Pure, no DOM. */
import type { GameConfig } from '../../tuning/config';

export type MatchLength = 'quick' | 'standard';
export const MATCH_LENGTHS: readonly MatchLength[] = ['quick', 'standard'];
export const DEFAULT_MATCH_LENGTH: MatchLength = 'standard';

/** Target of the Quick preset. Standard follows the live `match.pointsToWin` (13 by default, still tunable). */
export const QUICK_POINTS = 7;

export const isMatchLength = (v: unknown): v is MatchLength => typeof v === 'string' && (MATCH_LENGTHS as readonly string[]).includes(v);

/** Points needed to win a match of this length. Quick never exceeds the configured target. */
export const pointsFor = (length: MatchLength, cfg: Pick<GameConfig, 'match'>): number =>
  length === 'quick' ? Math.min(QUICK_POINTS, cfg.match.pointsToWin) : cfg.match.pointsToWin;

/** A copy of `cfg` whose `match.pointsToWin` follows `length`; the input (the live tuning config) is not mutated. */
export const matchConfig = <C extends Pick<GameConfig, 'match'>>(cfg: C, length: MatchLength): C => ({
  ...cfg,
  match: { ...cfg.match, pointsToWin: pointsFor(length, cfg) },
});
