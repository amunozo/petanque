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
 * Kick for a ground impact at (x, z) with vertical speed `impact`.
 * `maxDeg` / `maxSpeedFrac` are the BallSpec fields; both scale with
 * min(1, impact / SCATTER_FULL_IMPACT). Two independent hash values drive the
 * angle and the speed.
 */
export function landingKick(x: number, z: number, impact: number, maxDeg: number, maxSpeedFrac: number): LandingKick {
  const ix = Math.floor(x / SCATTER_CELL);
  const iz = Math.floor(z / SCATTER_CELL);
  const iy = Math.round(impact * 20);
  const strength = Math.min(1, impact / SCATTER_FULL_IMPACT);
  const angle = ((hashUnit(ix, iz, iy) * maxDeg * strength) * Math.PI) / 180;
  const speedMul = 1 + hashUnit(iz + 7919, ix - 104729, iy + 1) * maxSpeedFrac * strength;
  return { angle, speedMul };
}
