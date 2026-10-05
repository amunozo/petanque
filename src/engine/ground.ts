/**
 * Deterministic bumpiness field: smooth 2D value noise on an integer lattice,
 * hashed from cell coordinates (no RNG state, no tables). The ground itself is
 * geometrically flat (y = 0); the field only supplies a slope that pulls
 * rolling balls sideways, as if the ground had gentle undulations.
 */
import type { BallSpec, SurfaceConfig } from './types';

/** Integer hash -> [-1, 1]. */
function cellValue(ix: number, iz: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const fadeDeriv = (t: number): number => 30 * t * t * (t - 1) * (t - 1);

/**
 * Gradient (d/dx, d/dz) of the unit-amplitude noise at world position (x, z),
 * in lattice units per lattice cell (i.e. multiply by roughness for a slope).
 */
function noiseGradient(u: number, v: number): { gx: number; gz: number } {
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  const a = cellValue(iu, iv);
  const b = cellValue(iu + 1, iv);
  const c = cellValue(iu, iv + 1);
  const d = cellValue(iu + 1, iv + 1);
  const su = fade(fu);
  const sv = fade(fv);
  const dsu = fadeDeriv(fu);
  const dsv = fadeDeriv(fv);
  // value = a + (b-a)su + (c-a)sv + (a-b-c+d) su sv
  const k = a - b - c + d;
  return {
    gx: (b - a) * dsu + k * dsu * sv,
    gz: (c - a) * dsv + k * su * dsv,
  };
}

/**
 * Dimensionless ground slope (dh/dx, dh/dz) at (x, z). A ball's acceleration
 * from it is -gravity * slope. Zero when roughness is 0. `amplitudeMul` is the
 * per-ball modifier (BallSpec.roughnessMul); the default 1 reproduces the plain
 * surface field exactly (x * 1 is exact).
 */
export function groundSlope(x: number, z: number, surface: SurfaceConfig, amplitudeMul = 1): { x: number; z: number } {
  if (surface.roughness === 0 || surface.roughnessScale <= 0) return { x: 0, z: 0 };
  const g = noiseGradient(x / surface.roughnessScale, z / surface.roughnessScale);
  const amp = surface.roughness * amplitudeMul;
  return { x: g.gx * amp, z: g.gz * amp };
}

/**
 * Surface values as felt by one ball: the shared SurfaceConfig adjusted by the
 * ball's optional modifiers (see BallSpec). A spec without modifiers returns
 * exactly the surface values (multiplying by 1 is exact).
 */
export const rollingResistanceFor = (spec: BallSpec, surface: SurfaceConfig): number =>
  surface.rollingResistance * (spec.rollingResistanceMul ?? 1);
export const impactRestitutionFor = (spec: BallSpec, surface: SurfaceConfig): number =>
  spec.impactRestitution ?? surface.impactRestitution;
export const impactFrictionFor = (spec: BallSpec, surface: SurfaceConfig): number =>
  spec.impactFriction ?? surface.impactFriction;
