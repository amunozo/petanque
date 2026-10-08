/**
 * "Landing spot" controls, pure part: the player picks a spot on the court (the
 * donnée) and a loft; this finds the noise-free ThrowIntent whose aim preview
 * puts the boule there, by inverting the preview (bisection on power). The
 * swipe's execution error is then applied as a perturbation of that intent
 * (perturbIntent), so the rules, AI, online protocol and replays still only
 * ever see an ordinary ThrowIntent. No DOM, no randomness.
 *
 * What the spot means per loft (spotMeaning):
 *  - 'landing': the first ground contact, i.e. the aim ring (for 'shoot' the
 *    ring sits throw.shootRingAhead past it, see aimRing);
 *  - 'rest' (roll, when landing.rollMarksRest): where a lone boule stops. A
 *    roll's real landing spot is at the player's feet, where a 1 px change moves
 *    the stopping point ~10 cm, so the marker shows the stopping point instead.
 */
import { intentToThrow, predictFlight, type Loft, type ThrowIntent, type Vec3 } from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { aimRing, predictRestPoint } from './practice';

/** The slice of GameConfig the landing controls read. */
export type LandingAimConfig = Pick<GameConfig, 'throw' | 'physics' | 'balls' | 'practice' | 'controls' | 'landing'>;

/** A point on the court (metres, world X/Z). */
export interface Spot {
  x: number;
  z: number;
}

export type SpotMeaning = 'landing' | 'rest';

export interface SolvedSpot {
  /** Noise-free intent that puts the boule on `spot`. */
  intent: ThrowIntent;
  /** The spot actually reached (the asked one, clamped to the court and to the loft's reach). */
  spot: Spot;
  meaning: SpotMeaning;
}

/** Execution error read from the throw swipe (see input/landingGesture.ts). */
export interface ExecutionError {
  /** Aim error in degrees, positive = toward -X (left), like ThrowIntent.aim. */
  aimDeg: number;
  /** Launch-speed error in percent, positive = stronger (longer). */
  speedPct: number;
}

/** Keep spots this far (m) inside the side / end boards. */
const BOARD_MARGIN = 0.1;
/** Spots must lie at least this far (m) in front of the throwing circle. */
const MIN_AHEAD = 0.5;
const BISECT_STEPS = 20;
/** Re-aim passes (rolls) search the power within ± this of the previous pass, in fewer steps. */
const REAIM_POWER_SPAN = 0.02;
const REAIM_STEPS = 12;
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** `cfg` with the jack's spec in the boule slot: previews and solves for a jack throw use its size and weight. */
export function ballConfig<C extends Pick<GameConfig, 'balls'>>(cfg: C, ball: 'boule' | 'jack'): C {
  return ball === 'jack' ? { ...cfg, balls: { ...cfg.balls, boule: cfg.balls.jack } } : cfg;
}

export function spotMeaning(loft: Loft, cfg: Pick<GameConfig, 'landing'>): SpotMeaning {
  return loft === 'roll' && cfg.landing.rollMarksRest ? 'rest' : 'landing';
}

/** Where a noise-free throw with `intent` puts the boule, in the sense of `meaning`. */
export function reachedPoint(intent: ThrowIntent, cfg: LandingAimConfig, meaning: SpotMeaning): Vec3 {
  const params = intentToThrow(intent, cfg.throw, { aim: 0, power: 0 });
  if (meaning === 'rest') return predictRestPoint(params, cfg);
  const flight = predictFlight(params, cfg.physics, cfg.balls.boule.radius, 1);
  return aimRing(flight.landing, params.yaw, intent.loft, cfg);
}

const distFrom = (cfg: LandingAimConfig, p: { x: number; z: number }): number => Math.hypot(p.x - cfg.throw.originX, p.z - cfg.throw.originZ);
const yawTo = (cfg: LandingAimConfig, p: Spot): number => Math.atan2(-(p.x - cfg.throw.originX), -(p.z - cfg.throw.originZ));

/** The spot clamped to the court: inside the boards, in front of the circle, within the aim limit. Distance is not limited here. */
export function clampToCourt(spot: Spot, cfg: LandingAimConfig): Spot {
  const { arena } = cfg.physics;
  const x = clamp(spot.x, arena.minX + BOARD_MARGIN, arena.maxX - BOARD_MARGIN);
  const z = clamp(spot.z, arena.minZ + BOARD_MARGIN, cfg.throw.originZ - MIN_AHEAD);
  const maxAim = cfg.controls.maxAimDeg * DEG;
  const yaw = yawTo(cfg, { x, z });
  if (Math.abs(yaw) <= maxAim) return { x, z };
  const d = distFrom(cfg, { x, z });
  const a = clamp(yaw, -maxAim, maxAim);
  return { x: cfg.throw.originX - Math.sin(a) * d, z: cfg.throw.originZ - Math.cos(a) * d };
}

/** Distance (m from the circle) reached at power 0 and power 1 for this loft, straight ahead. */
export function reachRange(loft: Loft, cfg: LandingAimConfig): { min: number; max: number } {
  const meaning = spotMeaning(loft, cfg);
  const at = (power: number): number => distFrom(cfg, reachedPoint({ aim: 0, power, loft }, cfg, meaning));
  return { min: at(0), max: at(1) };
}

/**
 * The spot clamped to the court and to the loft's reach (`reach` from
 * reachRange, cached by the caller): cheap, for the marker while dragging.
 */
export function constrainSpot(spot: Spot, cfg: LandingAimConfig, reach: { min: number; max: number }): Spot {
  const c = clampToCourt(spot, cfg);
  const d = distFrom(cfg, c);
  const lo = Math.max(MIN_AHEAD, reach.min);
  const want = clamp(d, lo, Math.max(lo, reach.max));
  if (want === d || d <= 0) return c;
  const k = want / d;
  return { x: cfg.throw.originX + (c.x - cfg.throw.originX) * k, z: cfg.throw.originZ + (c.z - cfg.throw.originZ) * k };
}

/** Bisection on power in [lo, hi] so that `measure(power)` (increasing) reaches `target`. */
function bisect(measure: (p: number) => number, target: number, lo = 0, hi = 1, steps = BISECT_STEPS): number {
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The noise-free intent that puts the boule on `spot` with `loft`. Spots outside
 * the court or beyond the loft's reach are clamped (the returned `spot` is the
 * one actually reached, for the marker). `cfg` carries the ball that is thrown
 * (ballConfig for the jack).
 */
export function solveSpot(spot: Spot, loft: Loft, cfg: LandingAimConfig): SolvedSpot {
  const meaning = spotMeaning(loft, cfg);
  const court = clampToCourt(spot, cfg);
  let aim = yawTo(cfg, court);
  const target = distFrom(cfg, court);
  const measure = (a: number) => (p: number): number => distFrom(cfg, reachedPoint({ aim: a, power: p, loft }, cfg, meaning));
  let power = bisect(measure(aim), target);
  // A rolling boule can drift off its line over the bumps: re-aim at the spot once or twice.
  if (meaning === 'rest') {
    for (let i = 0; i < 2; i++) {
      const r = reachedPoint({ aim, power, loft }, cfg, meaning);
      const miss = yawTo(cfg, court) - yawTo(cfg, r);
      if (Math.abs(miss) < 1e-4) break;
      aim += miss;
      // Re-aiming barely changes the power: search near the last one (whole range if it ran into the edge).
      const lo = Math.max(0, power - REAIM_POWER_SPAN);
      const hi = Math.min(1, power + REAIM_POWER_SPAN);
      const p = bisect(measure(aim), target, lo, hi, REAIM_STEPS);
      power = (p - lo < 1e-3 && lo > 0) || (hi - p < 1e-3 && hi < 1) ? bisect(measure(aim), target) : p;
    }
  }
  const maxAim = cfg.controls.maxAimDeg * DEG;
  aim = clamp(aim, -maxAim, maxAim) + 0;
  const reached = reachedPoint({ aim, power, loft }, cfg, meaning);
  return { intent: { aim, power, loft }, spot: { x: reached.x, z: reached.z }, meaning };
}

/** Launch speed (m/s, before noise) for a power, like engine/throwModel. */
function speedOf(power: number, loft: Loft, t: GameConfig['throw']): number {
  const mul = loft === 'shoot' ? t.shootSpeedMul : 1;
  return (t.minSpeed + (t.maxSpeed - t.minSpeed) * Math.pow(clamp(power, 0, 1), t.powerCurve)) * mul;
}

/** Inverse of speedOf, clamped to power 0..1. */
function powerOf(speed: number, loft: Loft, t: GameConfig['throw']): number {
  const mul = loft === 'shoot' ? t.shootSpeedMul : 1;
  const span = t.maxSpeed - t.minSpeed;
  if (span <= 0) return 0;
  const u = (speed / mul - t.minSpeed) / span;
  return clamp(Math.pow(clamp(u, 0, 1), 1 / t.powerCurve), 0, 1);
}

/**
 * The intent actually thrown: the solved (perfect) intent with the swipe's
 * execution error on top. The rules then add the usual human noise. Aim stays
 * within the controls' limit and power within 0..1, like any gesture's intent.
 */
export function perturbIntent(intent: ThrowIntent, err: ExecutionError, cfg: Pick<GameConfig, 'throw' | 'controls'>): ThrowIntent {
  const maxAim = cfg.controls.maxAimDeg * DEG;
  const aim = clamp(intent.aim + err.aimDeg * DEG, -maxAim, maxAim) + 0;
  const speed = speedOf(intent.power, intent.loft, cfg.throw) * (1 + err.speedPct / 100);
  const power = err.speedPct === 0 ? intent.power : powerOf(speed, intent.loft, cfg.throw);
  return { aim, power, loft: intent.loft };
}
