/**
 * Contract for a full pétanque match (Phase 2). Pure data, JSON-serializable.
 *
 * The match is a reducer over actions. A turn is: the active team submits a
 * ThrowIntent -> the rules draw noise from the match RNG and produce a World
 * to simulate -> whoever simulates it reports the resting bodies back with
 * `settle`. For online play later, the thrower's device simulates and sends
 * both the intent and the settled bodies (authoritative result), so peers
 * never depend on bit-identical floating point across devices.
 *
 * Players are abstract "seats" (team ids). Who controls a seat — a local
 * human, an AI, or a remote peer — is decided outside the rules.
 */
import type { Body, RngState, ThrowIntent, ThrowParams } from '../../engine';

export type TeamId = 'A' | 'B';

export interface MatchRules {
  /** First team to reach this wins (13 in standard pétanque). */
  pointsToWin: number;
  /** Boules per team per end (tête-à-tête: 3). */
  boulesPerTeam: number;
  /** A thrown jack must come to rest within this distance range from the circle (m)... */
  jackMinDist: number;
  jackMaxDist: number;
  /** ...and at least this far from the side boards (m). */
  jackMinSideMargin: number;
}

export type MatchPhase =
  /** `toThrow` team throws the jack (intent loft applies to the jack). */
  | 'jack'
  /** `toThrow` team throws a boule. */
  | 'boule'
  /** A throw is being simulated; waiting for `settle`. */
  | 'inFlight'
  /** End finished; `lastEnd` holds the result; waiting for `nextEnd`. */
  | 'endOver'
  /** Someone reached pointsToWin. */
  | 'matchOver';

export interface ThrowRecord {
  /** Body id ('jack' or e.g. 'A1', 'B3'). */
  id: string;
  team: TeamId;
  intent: ThrowIntent;
  /** Actual launch values including drawn noise. */
  params: ThrowParams;
}

export interface EndResult {
  /** null = dead/void end (no points). */
  winner: TeamId | null;
  points: number;
  /** Body ids of the scoring boules. */
  scoringIds: string[];
  reason: 'normal' | 'jackOut' | 'tie';
}

export interface MatchState {
  seed: number;
  rng: RngState;
  rules: MatchRules;
  score: Record<TeamId, number>;
  /** 1-based. */
  endNumber: number;
  /** Team that threw the jack this end (and the first boule). */
  jackTeam: TeamId;
  phase: MatchPhase;
  /** Whose throw is next (meaningful in 'jack' and 'boule'). */
  toThrow: TeamId;
  /** Phase to return to after the in-flight throw settles is derived by the rules, not stored. */
  /** All throws this end, in order (jack throw(s) included). */
  throws: ThrowRecord[];
  /** Resting bodies after the last settled throw (jack + boules in play or out). */
  bodies: Body[];
  /** Boules still in hand per team this end. */
  boulesLeft: Record<TeamId, number>;
  /** Number of invalid jack throws this end (they alternate teams; see rules). */
  jackAttempts: number;
  lastEnd: EndResult | null;
  winner: TeamId | null;
}

export type MatchAction =
  | { type: 'throw'; team: TeamId; intent: ThrowIntent }
  | { type: 'settle'; bodies: Body[] }
  | { type: 'nextEnd' };
