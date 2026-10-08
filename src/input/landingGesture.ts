/**
 * "Landing spot" controls, gesture math (pure, no DOM): the throw swipe ->
 * execution error. The spot and the loft already decide the perfect throw; the
 * swipe decides how well it is executed:
 *  - its direction (start -> release, compared with straight up): leaning left
 *    pulls the boule left, leaning right pushes it right;
 *  - its release speed compared with one ideal pace (the same for every throw,
 *    so it can become muscle memory): too fast = long, too slow = short.
 * Inside the tolerances the error is zero (the throw keeps only the usual human
 * noise added by the rules); beyond them it grows linearly up to a cap.
 *
 * Screen conventions as in gestures.ts: +x right, +y DOWN, px, t in ms.
 */
import type { GameConfig } from '../tuning/config';
import type { Sample } from './gestures';

export type LandingControlsConfig = GameConfig['landing'];

/**
 * Release speed: the fastest stretch of at least SWIPE_SPAN_MS within the last
 * SWIPE_WINDOW_MS before the finger lifts. A brief stop just before lifting
 * still counts the swipe; holding still longer than the window cancels.
 */
export const SWIPE_WINDOW_MS = 140;
export const SWIPE_SPAN_MS = 40;

export interface SwipeMetrics {
  /** Direction from straight up (deg), positive = leaning LEFT (up-left). */
  angleDeg: number;
  /** Release speed in screen heights per second. */
  speed: number;
  /** Upward travel, as a fraction of the screen height. */
  length: number;
}

export type SwipeDirection = 'straight' | 'left' | 'right';
export type SwipePace = 'good' | 'soft' | 'strong';

export interface SwipeSkill {
  /** Aim error (deg), positive = toward -X (left), like ThrowIntent.aim. */
  aimDeg: number;
  /** Launch-speed error (%), positive = stronger. */
  speedPct: number;
  direction: SwipeDirection;
  pace: SwipePace;
}

const DEG = 180 / Math.PI;

/**
 * Reads a finished swipe. null = not a throw (too short, not upward, or so slow
 * the finger just stopped): the gesture is cancelled.
 */
export function swipeMetrics(samples: readonly Sample[], heightPx: number, cfg: LandingControlsConfig): SwipeMetrics | null {
  const n = samples.length;
  if (n < 2) return null;
  const h = Math.max(1, heightPx);
  const first = samples[0] as Sample;
  const last = samples[n - 1] as Sample;
  const up = first.y - last.y;
  if (up < cfg.minSwipeFrac * h) return null;
  // Direction: the chord, forgiving of a thumb's natural arc but not of a drift.
  const angleDeg = Math.atan2(-(last.x - first.x), up) * DEG;
  if (Math.abs(angleDeg) >= 60) return null;
  const speed = releaseSpeed(samples) / h;
  if (speed < cfg.minSwipeSpeed) return null;
  return { angleDeg: angleDeg + 0, speed, length: up / h };
}

/** px/s: see SWIPE_WINDOW_MS. */
function releaseSpeed(samples: readonly Sample[]): number {
  const last = samples[samples.length - 1] as Sample;
  let best = 0;
  let j = samples.length - 1;
  for (let i = samples.length - 1; i > 0; i--) {
    const b = samples[i] as Sample;
    if (last.t - b.t > SWIPE_WINDOW_MS) break;
    // Earliest start j < i such that the stretch j..i spans at least SWIPE_SPAN_MS (or the first sample).
    j = Math.min(j, i - 1);
    while (j > 0 && b.t - (samples[j] as Sample).t < SWIPE_SPAN_MS) j--;
    const a = samples[j] as Sample;
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) best = Math.max(best, Math.hypot(b.x - a.x, b.y - a.y) / dt);
  }
  return best;
}

/** Linear beyond a dead zone, capped: monotonic, odd, |result| <= cap. */
function band(excess: number, tolerance: number, slope: number, cap: number): number {
  const over = Math.max(0, Math.abs(excess) - Math.max(0, tolerance));
  return Math.sign(excess) * Math.min(Math.max(0, cap), over * slope) + 0;
}

/** Execution error of a swipe (see the file comment). */
export function swipeSkill(m: Pick<SwipeMetrics, 'angleDeg' | 'speed'>, cfg: LandingControlsConfig): SwipeSkill {
  const aimDeg = band(m.angleDeg, cfg.angleToleranceDeg, cfg.aimErrPerDeg, cfg.maxAimErrDeg);
  const ratio = m.speed / Math.max(1e-6, cfg.idealSwipeSpeed);
  const speedPct = band(ratio - 1, cfg.speedTolerance, cfg.speedErrPct, cfg.maxSpeedErrPct);
  return {
    aimDeg,
    speedPct,
    direction: aimDeg > 0 ? 'left' : aimDeg < 0 ? 'right' : 'straight',
    pace: speedPct > 0 ? 'strong' : speedPct < 0 ? 'soft' : 'good',
  };
}
