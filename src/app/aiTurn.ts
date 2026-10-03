/**
 * Pacing of the computer's turn, frame-driven so it can be paused:
 *   thinking (>= minThink s, the AI request runs meanwhile)
 *   -> aiming (the aim preview is shown for `showAim` s)
 *   -> fire (the throw is applied through the normal match rules).
 * Time only advances while `blocked` is false (tuning panel / menu / dialog open).
 */
import type { AiDecision } from '../games/petanque/aiTypes';

/** Minimum "thinking" time so the computer never answers instantly (s). */
export const MIN_THINK_S = 0.8;
/** How long its aim preview stays up before the ball flies (s). */
export const SHOW_AIM_S = 0.7;

export interface AiTurnHooks {
  /** Start the (async) decision. Called once, when the turn is not blocked. */
  request(): Promise<AiDecision>;
  /** Thinking has run its minimum and the decision is ready: show the aim. */
  onAim(decision: AiDecision): void;
  /** Aim shown long enough: throw. */
  onFire(decision: AiDecision): void;
}

export interface AiTurn {
  /** Begins a turn (cancels any previous one). */
  start(): void;
  /** Aborts: a decision that arrives later is ignored. */
  cancel(): void;
  active(): boolean;
  /** Once per frame with the real elapsed seconds. */
  tick(dtReal: number, blocked: boolean): void;
}

export function createAiTurn(hooks: AiTurnHooks, timing = { minThink: MIN_THINK_S, showAim: SHOW_AIM_S }): AiTurn {
  type Phase = 'idle' | 'thinking' | 'aiming';
  let phase: Phase = 'idle';
  let elapsed = 0;
  let requested = false;
  let decision: AiDecision | null = null;
  /** Bumped on every start/cancel so stale promises are ignored. */
  let epoch = 0;

  const reset = (next: Phase): void => {
    phase = next;
    elapsed = 0;
  };

  return {
    start() {
      epoch++;
      requested = false;
      decision = null;
      reset('thinking');
    },
    cancel() {
      epoch++;
      requested = false;
      decision = null;
      reset('idle');
    },
    active: () => phase !== 'idle',
    tick(dtReal, blocked) {
      if (phase === 'idle' || blocked) return;
      if (phase === 'thinking') {
        if (!requested) {
          requested = true;
          const mine = epoch;
          hooks.request().then(
            (d) => {
              if (mine === epoch) decision = d;
            },
            () => undefined,
          );
        }
        elapsed += dtReal;
        if (elapsed >= timing.minThink && decision) {
          reset('aiming');
          hooks.onAim(decision);
        }
        return;
      }
      elapsed += dtReal;
      if (elapsed >= timing.showAim && decision) {
        const d = decision;
        epoch++; // nothing more to wait for
        decision = null;
        reset('idle');
        hooks.onFire(d);
      }
    },
  };
}
