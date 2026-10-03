/**
 * Pure gesture math: finger positions -> ThrowIntent / AimPreview. No DOM.
 *
 * Conventions
 * - Screen: +x right, +y DOWN, pixels. Sample time `t` is in milliseconds.
 * - Aim (ThrowIntent.aim): radians, 0 = straight ahead, POSITIVE = toward
 *   world -X = LEFT as seen by the thrower (who throws toward -Z with Y up).
 * - Slingshot: the finger is pulled BACK (down the screen) and the throw goes
 *   the opposite way, like a real slingshot. Drag down-right -> throw goes
 *   up-left -> positive aim. aim = atan2(dx, dy) * sensitivity.
 * - Flick: swipe UP; up-left swipe -> positive aim. aim = atan2(-vx, -vy) * sensitivity.
 */
import type { GameConfig, LoftPreset } from '../tuning/config';
import type { AimPreview, ThrowIntent } from './types';

export type ControlsConfig = GameConfig['controls'];
export interface Point {
  x: number;
  y: number;
}
export interface Sample extends Point {
  /** Milliseconds. */
  t: number;
}

/** Slingshot: pulls shorter than this (px, downward component) are ignored (cancel zone). */
export const SLINGSHOT_DEAD_ZONE_PX = 12;
/** Flick: velocity is measured over this trailing window (ms). */
export const FLICK_WINDOW_MS = 80;
/** Flick: ignore swipes slower than this (px/s). */
export const FLICK_MIN_SPEED_PX_PER_S = 250;
/** Flick: ignore swipes shorter than this overall (px). */
export const FLICK_MIN_DISTANCE_PX = 12;
/** Flick: swipes more than this far from vertical (deg) are not "upward enough". */
export const FLICK_MAX_OFF_VERTICAL_DEG = 70;

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function clampAim(angle: number, cfg: ControlsConfig): number {
  const max = cfg.maxAimDeg * DEG;
  // `+ 0` normalises -0 to 0.
  return clamp(angle * cfg.aimSensitivity, -max, max) + 0;
}

// ---------------------------------------------------------------- slingshot

/**
 * `fullPowerPx` is the pull distance (px) that gives power 1; the caller
 * resolves it from `cfg.fullPowerDragFrac` and the viewport height.
 */
export function slingshotIntent(
  start: Point,
  current: Point,
  cfg: ControlsConfig,
  loft: LoftPreset,
  fullPowerPx: number,
): ThrowIntent | null {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  // Only the downward ("pull back") component counts. Upward / sideways / tiny = cancel.
  if (dy < SLINGSHOT_DEAD_ZONE_PX) return null;
  return {
    aim: clampAim(Math.atan2(dx, dy), cfg),
    power: clamp(dy / Math.max(1, fullPowerPx), 0, 1),
    loft,
  };
}

/** Live preview while dragging; null while in the cancel zone. */
export function slingshotPreview(
  start: Point,
  current: Point,
  cfg: ControlsConfig,
  loft: LoftPreset,
  fullPowerPx: number,
): AimPreview | null {
  const intent = slingshotIntent(start, current, cfg, loft, fullPowerPx);
  if (!intent) return null;
  return { aim: intent.aim, power: intent.power, start: { ...start }, current: { ...current } };
}

// -------------------------------------------------------------------- flick

interface FlickMetrics {
  /** px/s, screen axes. */
  vx: number;
  vy: number;
  speed: number;
}

/** Release velocity over the last FLICK_WINDOW_MS of samples. */
function flickVelocity(samples: readonly Sample[]): FlickMetrics | null {
  const n = samples.length;
  if (n < 2) return null;
  const last = samples[n - 1] as Sample;
  let i = n - 1;
  while (i > 0 && last.t - (samples[i - 1] as Sample).t <= FLICK_WINDOW_MS) i--;
  // Only the final sample inside the window: use the previous one (the finger
  // was slow/paused, so the resulting speed is honestly low).
  if (i === n - 1) i = n - 2;
  const first = samples[i] as Sample;
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return null;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

export function flickIntent(samples: readonly Sample[], cfg: ControlsConfig, loft: LoftPreset): ThrowIntent | null {
  const v = flickVelocity(samples);
  if (!v) return null;
  const first = samples[0] as Sample;
  const last = samples[samples.length - 1] as Sample;
  if (Math.hypot(last.x - first.x, last.y - first.y) < FLICK_MIN_DISTANCE_PX) return null;
  if (v.vy >= 0 || v.speed < FLICK_MIN_SPEED_PX_PER_S) return null;
  const fromVertical = Math.atan2(-v.vx, -v.vy); // up-left = positive
  if (Math.abs(fromVertical) > FLICK_MAX_OFF_VERTICAL_DEG * DEG) return null;
  return {
    aim: clampAim(fromVertical, cfg),
    power: clamp(v.speed / cfg.flickFullPowerPxPerS, 0, 1),
    loft,
  };
}

/** What a release right now would throw (flick speed is instantaneous); null if it would cancel. */
export function flickPreview(samples: readonly Sample[], cfg: ControlsConfig, loft: LoftPreset): AimPreview | null {
  const intent = flickIntent(samples, cfg, loft);
  if (!intent) return null;
  const first = samples[0] as Sample;
  const last = samples[samples.length - 1] as Sample;
  return {
    aim: intent.aim,
    power: intent.power,
    start: { x: first.x, y: first.y },
    current: { x: last.x, y: last.y },
  };
}
