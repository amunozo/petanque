/**
 * Boule-phase planning for the computer opponent. Two families of candidates,
 * all verified by full noise-free simulations of the current position:
 *   POINT  - roll/half/lob towards the jack, stopping just short of it
 *   SHOOT  - flat fast throw at an opponent boule that holds the point
 * Then the best few finalists are re-simulated under +-1 sigma execution error
 * and the plan with the best expected value wins.
 */
import { noiseMuls, type Loft, type ThrowIntent } from '../../engine';
import type { GameConfig } from '../../tuning/config';
import type { AiLevel } from './aiTypes';
import { evaluate } from './aiScore';
import {
  budgetLeft,
  distFromOrigin,
  LOFTS_POINT,
  powerForLanding,
  simulateThrow,
  solvePower,
  yawTo,
  type SimCtx,
  type SimOutcome,
} from './aiSim';
import { distances, holdingTeam, otherTeam } from './matchMeasure';
import { JACK_ID } from './practice';
import type { MatchState, TeamId } from './matchTypes';

export interface Candidate {
  plan: 'point' | 'shoot';
  intent: ThrowIntent;
  targetId?: string;
  /** Noise-free score. */
  score: number;
  /** Score averaged over execution-error samples (equals `score` when not refined). */
  robust: number;
  /** Share of the error samples after which our team holds the point (equals the nominal 0/1 when not refined). */
  holdRate: number;
  outcome: SimOutcome;
}

/** Share of the remaining budget the shooting search may use. */
const SHOOT_SHARE = 0.35;
/** Budgets from this size up check two finalists per plan instead of one. */
const WIDE_SEARCH_SIMS = 120;
/** Budgets below this skip the error-robustness check (pick the best noise-free score). */
const MIN_ROBUST_SIMS = 60;
/** Stop-short distances for pointing, beyond touching the jack (m). */
const POINT_SHORTS = [0.03, 0.12, 0.25] as const;
/** Aim offsets tried around the direct line (degrees). */
const POINT_YAWS_DEG = [0, 0.8, -0.8, 1.6, -1.6, 2.5, -2.5] as const;
/** Shooter lands this far short of the target boule (m). */
const SHOOT_SHORTS = [0.15, 0.4, 0.0] as const;
/**
 * An opponent boule this close to the jack (m) is a shooting target unless
 * pointing is likely (>= POINT_CLEAR_RATE of the error samples) to take the point.
 */
const CLOSE_GAP = 0.1;
const POINT_CLEAR_RATE = 0.5;
/**
 * Outside the forced case above, a shot must beat the best point by this much
 * expected value (score units ~ points) to be chosen: shots are high-variance
 * and look silly when they miss, so pointing wins close calls.
 */
const SHOOT_MARGIN = 1;
const DEG = Math.PI / 180;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface Shared {
  ctx: SimCtx;
  level: AiLevel;
  maxAim: number;
}

function addCandidate(sh: Shared, out: Candidate[], plan: Candidate['plan'], intent: ThrowIntent, targetId?: string): void {
  intent = { ...intent, aim: Math.min(sh.maxAim, Math.max(-sh.maxAim, intent.aim)) };
  const outcome = simulateThrow(sh.ctx, intent);
  if (!outcome) return;
  const score = evaluate(sh.ctx.state, outcome.after, sh.ctx.team);
  const holds = holdingTeam(outcome.after)?.team === sh.ctx.team;
  const c: Candidate = { plan, intent, score, robust: score, holdRate: holds ? 1 : 0, outcome };
  if (targetId !== undefined) c.targetId = targetId;
  out.push(c);
}

function pointCandidates(sh: Shared, jack: { x: number; z: number }, out: Candidate[]): void {
  const { ctx } = sh;
  const { cfg } = ctx;
  const yaw0 = yawTo(cfg, jack.x, jack.z);
  const touch = distFromOrigin(cfg, jack.x, jack.z) - cfg.balls.boule.radius - cfg.balls.jack.radius;
  const pairs: { s: number; y: number; pri: number }[] = [];
  POINT_SHORTS.forEach((s, si) => POINT_YAWS_DEG.forEach((y, yi) => pairs.push({ s, y: y * DEG, pri: Math.ceil(yi / 2) + si * 1.5 })));
  pairs.sort((a, b) => a.pri - b.pri);
  const unreachable = new Set<Loft>();
  for (const { s, y } of pairs) {
    for (const loft of LOFTS_POINT) {
      if (unreachable.has(loft)) continue;
      if (budgetLeft(ctx) < 2) return;
      const target = Math.max(0.3, touch - s);
      const sol = solvePower(ctx, 'boule', loft, yaw0, target, 0.03, Math.min(9, budgetLeft(ctx) - 1));
      if (!sol) return;
      if (sol.dist < target - 0.2) {
        unreachable.add(loft);
        continue;
      }
      addCandidate(sh, out, 'point', { aim: yaw0 + y, power: sol.power, loft });
    }
  }
}

function shootCandidates(sh: Shared, out: Candidate[]): void {
  const { ctx } = sh;
  const { cfg, state, team } = ctx;
  const targets = distances(state).filter((d) => d.team === otherTeam(team)).slice(0, 2);
  const yawVariants = [0, 0.4 * DEG, -0.4 * DEG];
  for (const yv of yawVariants) {
    for (const t of targets) {
      const body = state.bodies.find((b) => b.id === t.id);
      if (!body) continue;
      const yaw = yawTo(cfg, body.pos.x, body.pos.z);
      const dist = distFromOrigin(cfg, body.pos.x, body.pos.z);
      for (const short of yv === 0 ? SHOOT_SHORTS : SHOOT_SHORTS.slice(0, 1)) {
        if (budgetLeft(ctx) <= 0) return;
        const power = powerForLanding(ctx, yaw + yv, Math.max(0.5, dist - short));
        addCandidate(sh, out, 'shoot', { aim: yaw + yv, power, loft: 'shoot' }, t.id);
      }
    }
  }
}

/**
 * Equal-probability strata of a standard normal (conditional means of six bins)
 * and a fixed permutation pairing aim strata with power strata (Latin hypercube):
 * six simulations sample the 2-D execution error evenly.
 */
const STRATA = [-1.6, -0.69, -0.22, 0.22, 0.69, 1.6] as const;
const POWER_PAIRING = [3, 0, 5, 2, 4, 1] as const;

/** Expected score of a candidate under aim/power execution error (one simulation per stratum), scaled per loft. */
function refine(sh: Shared, c: Candidate, aimSd0: number, powerSd0: number): void {
  const { ctx } = sh;
  const [aimMul, powerMul] = noiseMuls(c.intent.loft, ctx.cfg.throw);
  const aimSd = aimSd0 * aimMul;
  const powerSd = powerSd0 * powerMul;
  let sum = 0;
  let holds = 0;
  for (let i = 0; i < STRATA.length; i++) {
    const zAim = STRATA[i] as number;
    const zPow = STRATA[POWER_PAIRING[i] as number] as number;
    const probe: ThrowIntent = {
      ...c.intent,
      aim: c.intent.aim + zAim * aimSd,
      power: clamp01(c.intent.power * (1 + zPow * powerSd)),
    };
    const o = simulateThrow(ctx, probe, true);
    if (!o) return; // out of budget: keep the nominal score
    sum += evaluate(ctx.state, o.after, ctx.team);
    if (holdingTeam(o.after)?.team === ctx.team) holds++;
  }
  c.robust = sum / STRATA.length;
  c.holdRate = holds / STRATA.length;
}

const best = (list: readonly Candidate[], key: 'score' | 'robust'): Candidate | undefined =>
  list.reduce<Candidate | undefined>((b, c) => (!b || c[key] > b[key] ? c : b), undefined);

const top = (list: readonly Candidate[], n: number): Candidate[] => [...list].sort((a, b) => b.score - a.score).slice(0, n);

const closestOpponentGap = (state: MatchState, them: TeamId): number => distances(state).find((d) => d.team === them)?.distance ?? Infinity;

/** What planBoule decided (a Candidate, or a plain guess when the budget allowed no simulation). */
export type PlanChoice = Pick<Candidate, 'plan' | 'intent' | 'targetId'>;

/** Chooses the best boule throw. Throws only when there is no jack in play. */
export function planBoule(ctx: SimCtx, level: AiLevel, cfg: GameConfig): PlanChoice {
  const { state, team } = ctx;
  const jack = state.bodies.find((b) => b.id === JACK_ID);
  if (!jack || jack.state === 'out') throw new Error('chooseThrow: no jack in play');
  const sh: Shared = { ctx, level, maxAim: cfg.controls.maxAimDeg * DEG };

  const them = otherTeam(team);
  const oppHolds = holdingTeam(state)?.team === them;
  const shootOn = level.canShoot && oppHolds && distances(state).some((d) => d.team === them);
  const perPlan = ctx.limit >= WIDE_SEARCH_SIMS ? 2 : 1;
  const finalists = shootOn ? 2 * perPlan : perPlan;
  const reserve = ctx.limit >= MIN_ROBUST_SIMS ? finalists * STRATA.length : 0;
  const realLimit = ctx.limit;

  const points: Candidate[] = [];
  const shots: Candidate[] = [];
  ctx.limit = realLimit - reserve;
  if (shootOn) {
    const cap = ctx.used + Math.floor(budgetLeft(ctx) * SHOOT_SHARE);
    ctx.limit = Math.min(ctx.limit, cap);
    shootCandidates(sh, shots);
    ctx.limit = realLimit - reserve;
  }
  pointCandidates(sh, jack.pos, points);
  ctx.limit = realLimit;

  const all = [...points, ...shots];
  if (all.length === 0) {
    // Budget too small to simulate anything: a plain half-lob at the jack.
    const yaw = Math.min(sh.maxAim, Math.max(-sh.maxAim, yawTo(cfg, jack.pos.x, jack.pos.z)));
    return { plan: 'point', intent: { aim: yaw, power: Math.min(1, distFromOrigin(cfg, jack.pos.x, jack.pos.z) / 14), loft: 'lob' } };
  }

  if (reserve > 0) {
    const aimSd = Math.hypot(cfg.throw.aimNoiseDeg, level.aimErrorDeg) * DEG;
    const powerSd = Math.hypot(cfg.throw.powerNoisePct / 100 / Math.max(0.5, cfg.throw.powerCurve), level.powerErrorPct / 100);
    const fin = [...top(points, perPlan), ...top(shots, perPlan)];
    for (const c of fin) refine(sh, c, aimSd, powerSd);
    const bestPoint = best(fin.filter((c) => c.plan === 'point'), 'robust');
    const bestShot = best(fin.filter((c) => c.plan === 'shoot'), 'robust');
    if (bestShot && bestPoint && closestOpponentGap(state, them) < CLOSE_GAP && bestPoint.holdRate < POINT_CLEAR_RATE) return bestShot;
    if (bestShot && bestPoint && bestShot.robust < bestPoint.robust + SHOOT_MARGIN) return bestPoint;
    return best(fin, 'robust') as Candidate;
  }
  return best(all, 'score') as Candidate;
}
