/**
 * Deterministic landing kick: a hash of the quantized impact point, so contact
 * points a few cm apart get uncorrelated kicks (chaotic for the player) while
 * identical inputs always give identical outputs. No RNG state, no tables.
 */

/** Size (m) of one hash cell: impacts closer than this share a kick. */
export const SCATTER_CELL = 0.015;
/** Vertical impact speed (m/s) at and above which the kick is at full strength; gentler touchdowns scale linearly. */
export const SCATTER_FULL_IMPACT = 3;

/** Integer hash -> [-1, 1]. */
function hashUnit(a: number, b: number, c: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

export interface LandingKick {
  /** Rotation of the horizontal velocity (radians). */
  angle: number;
  /** Multiplier on the horizontal speed (1 = unchanged). */
  speedMul: number;
}

/**
 * Strength (0..1) of the kick for a vertical impact speed: 0 up to `minImpact`,
 * ramping linearly to 1 at `fullImpact` (defaults reproduce the original
 * min(1, impact / SCATTER_FULL_IMPACT)).
 */
export function kickStrength(impact: number, minImpact = 0, fullImpact = SCATTER_FULL_IMPACT): number {
  if (impact <= minImpact) return 0;
  const span = fullImpact - minImpact;
  if (span <= 0) return 1;
  return Math.min(1, (impact - minImpact) / span);
}

/**
 * Kick for a ground impact at (x, z) with vertical speed `impact`.
 * `maxDeg` / `maxSpeedFrac` are the BallSpec fields; both scale with
 * kickStrength(impact, minImpact, fullImpact). Two independent hash values
 * drive the angle and the speed.
 */
export function landingKick(
  x: number,
  z: number,
  impact: number,
  maxDeg: number,
  maxSpeedFrac: number,
  minImpact = 0,
  fullImpact = SCATTER_FULL_IMPACT,
): LandingKick {
  const ix = Math.floor(x / SCATTER_CELL);
  const iz = Math.floor(z / SCATTER_CELL);
  const iy = Math.round(impact * 20);
  const strength = kickStrength(impact, minImpact, fullImpact);
  const angle = ((hashUnit(ix, iz, iy) * maxDeg * strength) * Math.PI) / 180;
  const speedMul = 1 + hashUnit(iz + 7919, ix - 104729, iy + 1) * maxSpeedFrac * strength;
  return { angle, speedMul };
}
