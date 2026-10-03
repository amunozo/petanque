/**
 * Contract for the computer opponent (Phase 3).
 *
 * The AI is just another "seat controller": it looks at the MatchState and
 * returns a ThrowIntent, exactly what a human gesture or a network peer
 * produces. It never touches the match RNG; the rules still draw the normal
 * throw noise when the intent is applied. Pure and deterministic for a given
 * `seed`, so it can run in a Web Worker and be unit-tested.
 */
import type { ThrowIntent } from '../../engine';
import type { MatchState, TeamId } from './matchTypes';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

/** Tunable per-difficulty behaviour (lives in GameConfig.ai). */
export interface AiLevel {
  /** Extra execution error added to the chosen intent, 1 standard deviation. */
  aimErrorDeg: number;
  powerErrorPct: number;
  /** Whether this level ever chooses to shoot (tir). */
  canShoot: boolean;
  /** Search effort: max number of simulated candidate throws per decision. */
  maxSimulations: number;
}

export interface AiRequest {
  state: MatchState;
  team: TeamId;
  difficulty: AiDifficulty;
  /** Seed for the AI's own choices/errors (e.g. match seed + throw count). */
  seed: number;
}

export interface AiDecision {
  intent: ThrowIntent;
  /** What it tried to do, for UI flavour ("Red shoots!") and debugging. */
  plan: 'jack' | 'point' | 'shoot';
  /** Id of the boule it aimed to hit when shooting. */
  targetId?: string;
  /** Number of simulations actually run. */
  simulations: number;
}
