/**
 * Bench for the "landing spot" controls: how much the throw swipe's execution
 * error adds on top of the human noise. Pure and deterministic (seeded rng).
 * The swipe itself is modelled by the caller (`sampleError`), so this stays
 * free of input/ code; see landingBench.report.test.ts for the profiles.
 *
 * Model of the player: places the marker perfectly (the spot whose noise-free
 * throw rests on the jack, or the ring on the target boule for a shot) and then
 * swipes with some quality.
 */
import { createBody, createRng, intentToThrow, launch, simulateToRest, type Body, type Loft, type Rng, type ThrowIntent } from '../../engine';
import { analyseShot } from './carreau';
import { pointPower } from './feelBench';
import { perturbIntent, reachedPoint, solveSpot, spotMeaning, type ExecutionError, type LandingAimConfig } from './landingAim';
import { BOULE_KIND } from './practice';

export type ErrorSampler = (rng: Rng) => ExecutionError;

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
const MISS_CAP = 3;
const yawTo = (cfg: LandingAimConfig, x: number, z: number): number => Math.atan2(-(x - cfg.throw.originX), -(z - cfg.throw.originZ));
const distFrom = (cfg: LandingAimConfig, x: number, z: number): number => Math.hypot(x - cfg.throw.originX, z - cfg.throw.originZ);

function rest(cfg: LandingAimConfig, intent: ThrowIntent, noise: { aim: number; power: number }, others: Body[] = []): { bodies: Body[]; events: ReturnType<typeof simulateToRest>['events'] } {
  const params = intentToThrow(intent, cfg.throw, noise);
  const ball = createBody('A1', BOULE_KIND, cfg.balls.boule, params.origin);
  const r = simulateToRest(launch({ time: 0, bodies: others }, ball, params), cfg.physics);
  return { bodies: r.world.bodies, events: r.events };
}

export interface LandingPointStats {
  mean: number;
  median: number;
  p90: number;
}

/**
 * Pointing at a jack `dist` m away with the landing controls: the player puts
 * the marker where the noise-free boule ends on the jack (via solveSpot, so the
 * marker -> intent round trip is part of the bench), then swipes with
 * `sampleError`. Returns the rest-point error (m) from the jack.
 */
export function landingPointing(cfg: LandingAimConfig, loft: Loft, dist: number, n: number, seed: number, sampleError: ErrorSampler): LandingPointStats {
  const rng = createRng(seed);
  const plans = SPOTS.map((s) => {
    const z = cfg.throw.originZ - dist - s.dz;
    const aim = yawTo(cfg, s.x, z);
    // The spot a skilled player would mark: the noise-free landing (or stop) point of the throw that rests on the jack.
    const ideal: ThrowIntent = { aim, power: pointPower(cfg, loft, aim, distFrom(cfg, s.x, z)), loft };
    const mark = reachedPoint(ideal, cfg, spotMeaning(loft, cfg));
    return { x: s.x, z, intent: solveSpot({ x: mark.x, z: mark.z }, loft, cfg).intent };
  });
  const errs: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = plans[i % plans.length] as (typeof plans)[number];
    const intent = perturbIntent(p.intent, sampleError(rng), cfg);
    const b = rest(cfg, intent, { aim: rng.normal(), power: rng.normal() }).bodies[0] as Body;
    errs.push(b.state === 'out' ? MISS_CAP : Math.min(MISS_CAP, Math.hypot(b.pos.x - p.x, b.pos.z - p.z)));
  }
  errs.sort((a, b) => a - b);
  const q = (f: number): number => errs[Math.min(errs.length - 1, Math.floor(f * errs.length))] as number;
  return { mean: errs.reduce((s, e) => s + e, 0) / n, median: q(0.5), p90: q(0.9) };
}

const teamOf = (id: string): string | null => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null);

/** Shooting a lone boule `dist` m away: the marker on the boule ('shoot' ring logic), then the swipe. Share of tirs (>= 0.5 m). */
export function landingShooting(cfg: LandingAimConfig, dist: number, n: number, seed: number, sampleError: ErrorSampler): number {
  const rng = createRng(seed);
  const r = cfg.balls.boule.radius;
  const plans = SPOTS.map((s) => {
    const z = cfg.throw.originZ - dist - s.dz;
    return { x: s.x, z, intent: solveSpot({ x: s.x, z }, 'shoot', cfg).intent };
  });
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const p = plans[i % plans.length] as (typeof plans)[number];
    const intent = perturbIntent(p.intent, sampleError(rng), cfg);
    const target = createBody('B1', BOULE_KIND, cfg.balls.boule, { x: p.x, y: r, z: p.z });
    target.state = 'resting';
    const out = rest(cfg, intent, { aim: rng.normal(), power: rng.normal() }, [target]);
    if (analyseShot({ thrownId: 'A1', teamOf, events: out.events, before: [target], after: out.bodies }).kind !== 'none') hits++;
  }
  return hits / n;
}
