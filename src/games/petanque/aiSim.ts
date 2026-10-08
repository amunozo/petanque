/**
 * Simulation helpers for the computer opponent: a budgeted "what if I throw
 * this" oracle built on the engine (zero-noise intent -> launch into a clone of
 * the resting world -> simulateToRest), plus a power solver for lone-ball
 * reach (power -> rest distance). Pure and deterministic.
 */
import {
  cloneWorld,
  createBody,
  intentToThrow,
  launch,
  predictFlight,
  simulateToRest,
  type BallSpec,
  type Body,
  type Loft,
  type ThrowIntent,
  type ThrowParams,
} from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { BOULE_KIND, JACK_ID, JACK_KIND } from './practice';
import type { MatchState, TeamId, ThrowRecord } from './matchTypes';

export const LOFTS_POINT: readonly Loft[] = ['roll', 'half', 'lob'];

/** Longest time a candidate throw is simulated (s); keeps worst cases bounded. */
const SIM_MAX_TIME = 20;

export interface ReachSample {
  power: number;
  /** Horizontal distance from the throwing circle to where the lone ball ended up. */
  dist: number;
}

export interface SimCtx {
  cfg: GameConfig;
  state: MatchState;
  team: TeamId;
  /** Hard cap on simulateToRest calls. */
  limit: number;
  used: number;
  /** Resting bodies the next throw starts from (specs refreshed from the live config). */
  resting: Body[];
  /** Id the thrown body gets (matches what the rules will call it). */
  throwId: string;
  reach: Map<string, ReachSample[]>;
}

export interface SimOutcome {
  intent: ThrowIntent;
  params: ThrowParams;
  /** All bodies after everything rested (including the thrown one). */
  bodies: Body[];
  thrown: Body;
  /** The state as the rules would have it right after this throw settles. */
  after: MatchState;
}

/** Resting bodies as `beginThrow` would hand them to the engine. */
function restingBodies(state: MatchState, cfg: GameConfig, jackPhase: boolean): Body[] {
  if (jackPhase) return [];
  return cloneWorld({ time: 0, bodies: state.bodies }).bodies.map((b) => {
    const s = b.kind === JACK_KIND ? cfg.balls.jack : cfg.balls.boule;
    b.spec = { ...s };
    if (b.state === 'resting') b.pos.y = s.radius;
    return b;
  });
}

export function makeCtx(state: MatchState, team: TeamId, cfg: GameConfig, limit: number): SimCtx {
  const jackPhase = state.phase === 'jack';
  const n = state.throws.filter((t) => t.team === team && t.id !== JACK_ID).length + 1;
  return {
    cfg,
    state,
    team,
    limit: Math.max(1, Math.floor(limit)),
    used: 0,
    resting: restingBodies(state, cfg, jackPhase),
    throwId: jackPhase ? JACK_ID : `${team}${n}`,
    reach: new Map(),
  };
}

export const budgetLeft = (ctx: SimCtx): number => ctx.limit - ctx.used;

const noNoise = { aim: 0, power: 0 } as const;

/**
 * A thrown boule's spec for PLANNING: without the landing kick (BallSpec.landingScatter),
 * i.e. the expected path. The kick is deterministic per contact point, so a
 * noise-free search would otherwise "find" lucky lobs that real execution error
 * never reproduces. The error-sampling pass (`scatter: true`) keeps the kick.
 */
const plannedBoule = (spec: BallSpec): BallSpec => ({ ...spec, landingScatter: 0, landingScatterSpeed: 0 });

/**
 * Simulates one noise-free throw from the current position. Null when the budget is spent.
 * `scatter`: keep the thrown boule's landing kick (see plannedBoule); the jack always keeps it.
 */
export function simulateThrow(ctx: SimCtx, intent: ThrowIntent, scatter = false): SimOutcome | null {
  if (budgetLeft(ctx) <= 0) return null;
  ctx.used++;
  const { cfg, state, team } = ctx;
  const jackPhase = state.phase === 'jack';
  const params = intentToThrow(intent, cfg.throw, noNoise);
  const spec = jackPhase ? cfg.balls.jack : scatter ? cfg.balls.boule : plannedBoule(cfg.balls.boule);
  const body = createBody(ctx.throwId, jackPhase ? JACK_KIND : BOULE_KIND, spec, params.origin);
  const world = launch({ time: 0, bodies: ctx.resting }, body, params);
  const bodies = simulateToRest(world, cfg.physics, SIM_MAX_TIME).world.bodies;
  const thrown = bodies.find((b) => b.id === ctx.throwId) as Body;
  const record: ThrowRecord = { id: ctx.throwId, team, intent: { ...intent }, params };
  const boulesLeft = { ...state.boulesLeft };
  if (!jackPhase) boulesLeft[team] = Math.max(0, boulesLeft[team] - 1);
  const after: MatchState = { ...state, bodies, throws: [...state.throws, record], boulesLeft };
  return { intent, params, bodies, thrown, after };
}

/** Horizontal distance from the throwing circle to a position. */
export const distFromOrigin = (cfg: GameConfig, x: number, z: number): number =>
  Math.hypot(x - cfg.throw.originX, z - cfg.throw.originZ);

/** Aim angle (rad) from the throwing circle to a ground point. 0 = -Z, positive = toward -X. */
export const yawTo = (cfg: GameConfig, x: number, z: number): number =>
  Math.atan2(-(x - cfg.throw.originX), -(z - cfg.throw.originZ));

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Lone-ball rest distance for (kind, loft, yaw, power); counts one simulation. Null when out of budget. */
function sampleReach(ctx: SimCtx, kind: 'jack' | 'boule', loft: Loft, yaw: number, power: number): number | null {
  if (budgetLeft(ctx) <= 0) return null;
  ctx.used++;
  const { cfg } = ctx;
  const params = intentToThrow({ aim: yaw, power, loft }, cfg.throw, noNoise);
  const spec = kind === 'jack' ? cfg.balls.jack : plannedBoule(cfg.balls.boule);
  const body = createBody('lone', kind, spec, params.origin);
  const world = launch({ time: 0, bodies: [] }, body, params);
  const out = simulateToRest(world, cfg.physics, SIM_MAX_TIME).world.bodies[0] as Body;
  return distFromOrigin(cfg, out.pos.x, out.pos.z);
}

export interface PowerSolution {
  power: number;
  /** Lone-ball rest distance at that power. */
  dist: number;
}

/**
 * Finds the power whose lone-ball rest distance matches `target` (secant /
 * safeguarded interpolation over a per-(kind, loft, yaw) sample table that is
 * reused across targets). Returns the closest sample found; if the target is
 * beyond full power, power 1 (check `dist` against the target). Null only when
 * no sample could be taken (budget).
 */
export function solvePower(
  ctx: SimCtx,
  kind: 'jack' | 'boule',
  loft: Loft,
  yaw: number,
  target: number,
  tol: number,
  maxIter = 9,
): PowerSolution | null {
  const key = `${kind}:${loft}:${yaw.toFixed(2)}`;
  let table = ctx.reach.get(key);
  if (!table) {
    table = [];
    ctx.reach.set(key, table);
  }
  const closest = (): ReachSample | undefined =>
    table.reduce<ReachSample | undefined>((best, s) => (!best || Math.abs(s.dist - target) < Math.abs(best.dist - target) ? s : best), undefined);

  for (let it = 0; it < maxIter; it++) {
    const best = closest();
    if (best && Math.abs(best.dist - target) <= tol) break;
    let lo: ReachSample | undefined; // largest power still short of the target
    let hi: ReachSample | undefined; // smallest power already past it
    for (const s of table) {
      if (s.dist < target && (!lo || s.power > lo.power)) lo = s;
      if (s.dist >= target && (!hi || s.power < hi.power)) hi = s;
    }
    let p: number;
    if (lo && hi) {
      const w = hi.power - lo.power;
      if (w < 0.0015) break;
      const f = (target - lo.dist) / Math.max(1e-6, hi.dist - lo.dist);
      p = lo.power + w * clamp(f, 0.12, 0.88);
    } else if (lo) {
      if (lo.power >= 1) break; // beyond reach
      const prev = table.filter((s) => s.power < lo.power).pop();
      const slope = prev ? (lo.dist - prev.dist) / (lo.power - prev.power) : 14;
      p = Math.min(1, lo.power + Math.max(0.02, (target - lo.dist) / Math.max(4, slope)));
    } else if (hi) {
      if (hi.power <= 0) break; // too short even at zero power
      const next = table.find((s) => s.power > hi.power);
      const slope = next ? (next.dist - hi.dist) / (next.power - hi.power) : 14;
      p = Math.max(0, hi.power - Math.max(0.02, (hi.dist - target) / Math.max(4, slope)));
    } else {
      p = clamp(target / 14, 0.05, 0.95);
    }
    if (table.some((s) => Math.abs(s.power - p) < 1e-4)) break;
    const dist = sampleReach(ctx, kind, loft, yaw, p);
    if (dist === null) break;
    table.push({ power: p, dist });
    table.sort((a, b) => a.power - b.power);
  }
  const b = closest();
  return b ? { power: b.power, dist: b.dist } : null;
}

/** Local slope d(dist)/d(power) of a reach table around `power` (m per unit power), with a fallback. */
export function reachSlope(ctx: SimCtx, kind: 'jack' | 'boule', loft: Loft, yaw: number, power: number): number {
  const table = ctx.reach.get(`${kind}:${loft}:${yaw.toFixed(2)}`) ?? [];
  let a: ReachSample | undefined;
  let b: ReachSample | undefined;
  for (const s of table) {
    if (s.power <= power) a = s;
    else if (!b) b = s;
  }
  if (a && b) return Math.max(3, (b.dist - a.dist) / (b.power - a.power));
  const two = table.slice(-2);
  const [s0, s1] = two;
  if (s0 && s1) return Math.max(3, (s1.dist - s0.dist) / (s1.power - s0.power));
  return 14;
}

/**
 * Power for a 'shoot' throw whose FIRST ground contact is `landing` metres from
 * the circle, by bisection on the (free) flight prediction. Closed form not
 * needed: predictFlight is cheap and exact for a lone ball.
 */
export function powerForLanding(ctx: SimCtx, yaw: number, landing: number): number {
  const { cfg } = ctx;
  const land = (power: number): number => {
    const params = intentToThrow({ aim: yaw, power, loft: 'shoot' }, cfg.throw, noNoise);
    const f = predictFlight(params, cfg.physics, cfg.balls.boule.radius, 1);
    return distFromOrigin(cfg, f.landing.x, f.landing.z);
  };
  let lo = 0;
  let hi = 1;
  if (land(hi) <= landing) return 1;
  if (land(lo) >= landing) return 0;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (land(mid) < landing) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
