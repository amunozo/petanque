/**
 * Position evaluation for the computer opponent: "how good is this resting
 * layout for `team`", measured with the match rules' own helpers. Higher is
 * better. Units are roughly end-points.
 */
import { distances, holdingTeam, isJackOut, otherTeam, scoreEnd } from './matchMeasure';
import { JACK_ID } from './practice';
import type { MatchState, TeamId } from './matchTypes';

/** Gap assumed when a team has no boule in play (m). */
const NO_BOULE_GAP = 1;
const GAP_CAP = 1;

export interface AiWeights {
  /** Value of each point the end would score if it ended now. */
  point: number;
  /** Bonus/penalty for holding the point. */
  hold: number;
  /** Per metre of (their best gap - our best gap), capped to +-GAP_CAP. */
  lead: number;
  /** Penalty per metre the jack was displaced while we do NOT hold the point (capped at 3 m). */
  jackMove: number;
  /** Extra penalty when the jack ends up out of play. */
  jackOut: number;
}

export const DEFAULT_WEIGHTS: AiWeights = { point: 2, hold: 2, lead: 1.5, jackMove: 0.8, jackOut: 1 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Our best / their best gap to the jack in `after` (null = none in play). */
export function bestGaps(after: MatchState, team: TeamId): { ours: number | null; theirs: number | null } {
  const list = distances(after);
  return {
    ours: list.find((d) => d.team === team)?.distance ?? null,
    theirs: list.find((d) => d.team === otherTeam(team))?.distance ?? null,
  };
}

/**
 * Value of `after` (state right after a throw settled, `before` = state
 * before it) for `team`. Mirrors the rules: a jack out of play ends the end at
 * once and only a team holding boules against an empty-handed one scores.
 */
export function evaluate(before: MatchState, after: MatchState, team: TeamId, w: AiWeights = DEFAULT_WEIGHTS): number {
  const them = otherTeam(team);
  if (isJackOut(after.bodies)) {
    const mine = after.boulesLeft[team];
    const theirs = after.boulesLeft[them];
    const e = mine > 0 && theirs === 0 ? mine : theirs > 0 && mine === 0 ? -theirs : 0;
    return w.point * e - w.jackOut;
  }
  const end = scoreEnd(after);
  const signed = end.winner === team ? end.points : end.winner === them ? -end.points : 0;
  const holder = holdingTeam(after)?.team ?? null;
  const gaps = bestGaps(after, team);
  const ours = Math.min(gaps.ours ?? NO_BOULE_GAP, GAP_CAP);
  const theirs = Math.min(gaps.theirs ?? NO_BOULE_GAP, GAP_CAP);
  let value = w.point * signed + (holder === team ? w.hold : holder === them ? -w.hold : 0);
  value += w.lead * clamp(theirs - ours, -GAP_CAP, GAP_CAP);
  if (holder !== team) {
    const j0 = before.bodies.find((b) => b.id === JACK_ID);
    const j1 = after.bodies.find((b) => b.id === JACK_ID);
    if (j0 && j1) value -= w.jackMove * Math.min(3, Math.hypot(j1.pos.x - j0.pos.x, j1.pos.z - j0.pos.z));
  }
  return value;
}
