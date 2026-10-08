/**
 * Game-feel bench: measures, on the real engine + rules with the configured
 * human execution noise, how precise each loft is for pointing and how often a
 * shot removes a lone boule. Pure and deterministic (seeded engine rng, no
 * DOM). Used by feelBench.test.ts (guards) and the report runner
 * (FEEL_REPORT=1 npx vitest run src/games/petanque/feelBench.report.test.ts).
 *
 * Model of the player: a skilled player who reads the aim preview perfectly.
 *  - Pointing: picks the aim and power whose noise-free lone-boule rest point is
 *    the jack; we measure how far the noisy throw actually rests from it.
 *  - Shooting: puts the aim preview ring on the target boule (optionally `short`
 *    metres in front of it); we count tirs (target knocked >= 0.5 m) and carreaux.
 */
import {
  createBody,
  createRng,
  intentToThrow,
  launch,
  predictFlight,
  simulateToRest,
  type Body,
  type Loft,
  type ThrowIntent,
} from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { analyseShot } from './carreau';
import { aimRing, BOULE_KIND } from './practice';

export type BenchConfig = Pick<GameConfig, 'throw' | 'physics' | 'balls'>;

/** Target spots (sideways x, extra depth dz): several ground patches so the bump field averages out. */
const SPOTS: readonly { x: number; dz: number }[] = [
  { x: -0.6, dz: 0 },
  { x: -0.2, dz: 0.3 },
  { x: 0.2, dz: 0 },
  { x: 0.6, dz: 0.3 },
  { x: -0.4, dz: -0.3 },
  { x: 0, dz: 0 },
  { x: 0.4, dz: -0.3 },
  { x: 0, dz: 0.45 },
];
/** Pointing errors are capped here (a boule that goes out counts as this far). */
const MISS_CAP = 3;

const yawTo = (cfg: BenchConfig, x: number, z: number): number => Math.atan2(-(x - cfg.throw.originX), -(z - cfg.throw.originZ));
const distFrom = (cfg: BenchConfig, x: number, z: number): number => Math.hypot(x - cfg.throw.originX, z - cfg.throw.originZ);

function loneRest(cfg: BenchConfig, intent: ThrowIntent, noise: { aim: number; power: number }): Body {
  const params = intentToThrow(intent, cfg.throw, noise);
  const ball = createBody('A1', BOULE_KIND, cfg.balls.boule, params.origin);
  return simulateToRest(launch({ time: 0, bodies: [] }, ball, params), cfg.physics).world.bodies[0] as Body;
}

/** Bisection on power so that `measure(power)` (increasing in power) equals `target`. */
function bisect(measure: (p: number) => number, target: number): number {
  let lo = 0;
  let hi = 1;
  if (measure(hi) <= target) return 1;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Power whose noise-free lone-boule REST point is `dist` metres from the circle. */
export function pointPower(cfg: BenchConfig, loft: Loft, aim: number, dist: number): number {
  return bisect((p) => {
    const b = loneRest(cfg, { aim, power: p, loft }, { aim: 0, power: 0 });
    return distFrom(cfg, b.pos.x, b.pos.z);
  }, dist);
}

/** Power whose noise-free aim preview RING (first ground contact; see aimRing for 'shoot') is `dist` metres from the circle. */
export function landingPower(cfg: BenchConfig, loft: Loft, aim: number, dist: number): number {
  return bisect((p) => {
    const params = intentToThrow({ aim, power: p, loft }, cfg.throw, { aim: 0, power: 0 });
    const f = predictFlight(params, cfg.physics, cfg.balls.boule.radius, 1);
    const ring = aimRing(f.landing, params.yaw, loft, cfg);
    return distFrom(cfg, ring.x, ring.z);
  }, dist);
}

export interface PointStats {
  mean: number;
  median: number;
  p90: number;
  /** Mean distance from the noisy throw's first ground contact to its rest point (roll-out). */
  rollOut: number;
}

const quantile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;

/** Pointing at a jack `dist` m away: distance from the intended rest point to the actual rest point. */
export function pointingStats(cfg: BenchConfig, loft: Loft, dist: number, n: number, seed: number): PointStats {
  const rng = createRng(seed);
  const plans = SPOTS.map((s) => {
    const z = cfg.throw.originZ - dist - s.dz;
    const aim = yawTo(cfg, s.x, z);
    return { x: s.x, z, aim, power: pointPower(cfg, loft, aim, distFrom(cfg, s.x, z)) };
  });
  const errs: number[] = [];
  let roll = 0;
  for (let i = 0; i < n; i++) {
    const p = plans[i % plans.length] as (typeof plans)[number];
    const noise = { aim: rng.normal(), power: rng.normal() };
    const intent: ThrowIntent = { aim: p.aim, power: p.power, loft };
    const b = loneRest(cfg, intent, noise);
    const land = predictFlight(intentToThrow(intent, cfg.throw, noise), cfg.physics, cfg.balls.boule.radius, 1).landing;
    roll += Math.hypot(b.pos.x - land.x, b.pos.z - land.z);
    errs.push(b.state === 'out' ? MISS_CAP : Math.min(MISS_CAP, Math.hypot(b.pos.x - p.x, b.pos.z - p.z)));
  }
  errs.sort((a, b) => a - b);
  return { mean: errs.reduce((s, e) => s + e, 0) / n, median: quantile(errs, 0.5), p90: quantile(errs, 0.9), rollOut: roll / n };
}

export interface ShootStats {
  /** Share of throws whose first contact knocked the target >= 0.5 m (tir réussi, carreaux included). */
  hit: number;
  carreau: number;
}

const teamOf = (id: string): string | null => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null);

/**
 * Shooting a lone opponent boule `dist` m away with `loft`: the ring is put
 * `short` m in front of the boule (0 = right on it).
 */
export function shootingStats(cfg: BenchConfig, loft: Loft, dist: number, n: number, seed: number, short = 0): ShootStats {
  const rng = createRng(seed);
  const r = cfg.balls.boule.radius;
  const plans = SPOTS.map((s) => {
    const z = cfg.throw.originZ - dist - s.dz;
    const aim = yawTo(cfg, s.x, z);
    return { x: s.x, z, aim, power: landingPower(cfg, loft, aim, distFrom(cfg, s.x, z) - short) };
  });
  let hits = 0;
  let carreaux = 0;
  for (let i = 0; i < n; i++) {
    const p = plans[i % plans.length] as (typeof plans)[number];
    const noise = { aim: rng.normal(), power: rng.normal() };
    const target = createBody('B1', BOULE_KIND, cfg.balls.boule, { x: p.x, y: r, z: p.z });
    target.state = 'resting';
    const params = intentToThrow({ aim: p.aim, power: p.power, loft }, cfg.throw, noise);
    const ball = createBody('A1', BOULE_KIND, cfg.balls.boule, params.origin);
    const { world, events } = simulateToRest(launch({ time: 0, bodies: [target] }, ball, params), cfg.physics);
    const o = analyseShot({ thrownId: 'A1', teamOf, events, before: [target], after: world.bodies });
    if (o.kind !== 'none') hits++;
    if (o.kind === 'carreau') carreaux++;
  }
  return { hit: hits / n, carreau: carreaux / n };
}

/** Best hit rate over a few ring placements (a player finds the best one with practice). */
export function bestShootingStats(cfg: BenchConfig, loft: Loft, dist: number, n: number, seed: number, shorts: readonly number[] = [0, 0.1, 0.25, 0.5]): ShootStats & { short: number } {
  let best: (ShootStats & { short: number }) | null = null;
  for (const s of shorts) {
    const st = shootingStats(cfg, loft, dist, n, seed, s);
    if (!best || st.hit > best.hit) best = { ...st, short: s };
  }
  return best as ShootStats & { short: number };
}

/** How the player tries to beat an opponent boule lying just in front of the jack. */
export type TakePlan = 'shoot' | 'lobOnBoule' | 'lobPoint' | 'halfPoint' | 'rollPoint';

/** Gap (m, surface to surface) between the opponent boule and the jack in `takePointRate`. */
export const TAKE_GAP = 0.05;

/**
 * Jack `dist` m away with an opponent boule TAKE_GAP in front of it (between the
 * circle and the jack). Share of throws after which the opponent no longer holds
 * the point (our boule is closer, theirs is out, or the jack is out). Shots put the ring on the
 * opponent boule; pointing plans aim for the jack (noise-free lone rest point).
 */
export function takePointRate(cfg: BenchConfig, plan: TakePlan, dist: number, n: number, seed: number): number {
  const rng = createRng(seed);
  const rb = cfg.balls.boule.radius;
  const rj = cfg.balls.jack.radius;
  const loft: Loft = plan === 'shoot' ? 'shoot' : plan === 'halfPoint' ? 'half' : plan === 'rollPoint' ? 'roll' : 'lob';
  const plans = SPOTS.map((s) => {
    const jz = cfg.throw.originZ - dist - s.dz;
    const bz = jz + rj + rb + TAKE_GAP;
    const onBoule = plan === 'shoot' || plan === 'lobOnBoule';
    const tz = onBoule ? bz : jz;
    const aim = yawTo(cfg, s.x, tz);
    const d = distFrom(cfg, s.x, tz);
    return { x: s.x, jz, bz, aim, power: onBoule ? landingPower(cfg, loft, aim, d) : pointPower(cfg, loft, aim, d) };
  });
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const p = plans[i % plans.length] as (typeof plans)[number];
    const noise = { aim: rng.normal(), power: rng.normal() };
    const jack = createBody('jack', 'jack', cfg.balls.jack, { x: p.x, y: rj, z: p.jz });
    const opp = createBody('B1', BOULE_KIND, cfg.balls.boule, { x: p.x, y: rb, z: p.bz });
    jack.state = 'resting';
    opp.state = 'resting';
    const params = intentToThrow({ aim: p.aim, power: p.power, loft }, cfg.throw, noise);
    const ball = createBody('A1', BOULE_KIND, cfg.balls.boule, params.origin);
    const after = simulateToRest(launch({ time: 0, bodies: [jack, opp] }, ball, params), cfg.physics).world.bodies;
    const j = after.find((b) => b.id === 'jack') as Body;
    if (j.state === 'out') {
      ok++; // jack knocked out: their point is gone too (dead end / they must play on)
      continue;
    }
    const gap = (id: string): number => {
      const b = after.find((o) => o.id === id) as Body;
      return b.state === 'out' ? Infinity : Math.hypot(b.pos.x - j.pos.x, b.pos.z - j.pos.z);
    };
    if (gap('B1') === Infinity || gap('A1') < gap('B1')) ok++;
  }
  return ok / n;
}
