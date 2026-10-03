/**
 * Practice mode: one "end" of N boules thrown at a jack, as a serializable
 * state + pure reducer-style functions. No DOM, no three.js, no Math.random —
 * every random draw comes from the seeded engine RNG whose state lives in the
 * PracticeState, so a (seed, intents) list replays identically anywhere
 * (this becomes the match model later).
 *
 * Flow: createPractice / newEnd -> phase 'aiming'
 *       beginThrow(intent) -> phase 'inFlight' (+ engine World to step)
 *       settleThrow(world) -> phase 'aiming' (more boules) or 'endOver'
 * Functions never mutate their inputs.
 */
import {
  createBody,
  intentToThrow,
  nextNormal,
  nextRandom,
  predictFlight,
  simulateToRest,
  seedToState,
  launch,
  type Body,
  type FlightPrediction,
  type RngState,
  type ThrowIntent,
  type ThrowParams,
  type Vec3,
  type World,
} from '../../engine';
import type { GameConfig } from '../../tuning/config';

/** The slice of GameConfig the practice rules read. */
export type PracticeConfig = Pick<GameConfig, 'throw' | 'physics' | 'balls' | 'practice'>;

export type PracticePhase = 'aiming' | 'inFlight' | 'endOver';

export interface PracticeThrow {
  id: string;
  intent: ThrowIntent;
  /** The actual launch values, including the drawn noise. */
  params: ThrowParams;
}

export interface PracticeState {
  seed: number;
  rng: RngState;
  /** 1-based. */
  endNumber: number;
  /** Where the jack was placed at the start of the end (it may be knocked away later). */
  jack: { x: number; z: number };
  throws: PracticeThrow[];
  /** Resting positions after the last settled throw (jack + boules). */
  bodies: Body[];
  phase: PracticePhase;
}

export const JACK_ID = 'jack';
export const JACK_KIND = 'jack';
export const BOULE_KIND = 'boule';
/** Horizontal spread of the jack placement (metres either side of the centre line). */
export const JACK_HALF_WIDTH = 0.8;
/** Jack is never placed closer than this to the far end of the arena. */
const JACK_FAR_MARGIN = 0.3;

const cloneBodyData = (b: Body): Body => {
  const c: Body = {
    id: b.id,
    kind: b.kind,
    spec: { ...b.spec },
    pos: { ...b.pos },
    vel: { ...b.vel },
    rot: { ...b.rot },
    state: b.state,
  };
  if (b.spin !== undefined) c.spin = b.spin;
  return c;
};

/** Places a fresh end: seeded jack position, no boules. Returns the new state (rng advanced). */
function placeEnd(seed: number, rng: RngState, endNumber: number, cfg: PracticeConfig): PracticeState {
  const lo = Math.min(cfg.practice.jackMinDist, cfg.practice.jackMaxDist);
  const hi = Math.max(cfg.practice.jackMinDist, cfg.practice.jackMaxDist);
  const [u1, r1] = nextRandom(rng);
  const [u2, r2] = nextRandom(r1);
  const dist = lo + (hi - lo) * u1;
  const x = -JACK_HALF_WIDTH + 2 * JACK_HALF_WIDTH * u2;
  const z = Math.max(cfg.physics.arena.minZ + JACK_FAR_MARGIN, cfg.throw.originZ - dist);
  const jack = createBody(JACK_ID, JACK_KIND, cfg.balls.jack, { x, y: 0, z });
  return { seed, rng: r2, endNumber, jack: { x, z }, throws: [], bodies: [jack], phase: 'aiming' };
}

/** First end of a new practice session. */
export function createPractice(seed: number, cfg: PracticeConfig): PracticeState {
  return placeEnd(seed, seedToState(seed), 1, cfg);
}

/** Starts the next end (jack re-placed with the continuing rng, boules cleared). */
export function newEnd(state: PracticeState, cfg: PracticeConfig): PracticeState {
  return placeEnd(state.seed, state.rng, state.endNumber + 1, cfg);
}

/** Boules still to throw in this end. */
export const boulesLeft = (state: PracticeState, cfg: PracticeConfig): number =>
  Math.max(0, cfg.practice.boulesPerEnd - state.throws.length);

/**
 * Starts a throw: draws the noise (2 normals) from the state's rng, converts the
 * intent to launch values and builds the engine World (jack + earlier boules
 * resting where they lie, plus the new boule in flight). Existing balls take
 * their current ball spec from `cfg` (live tuning), the rest of their data is kept.
 */
export function beginThrow(
  state: PracticeState,
  intent: ThrowIntent,
  cfg: PracticeConfig,
): { state: PracticeState; world: World; params: ThrowParams } {
  if (state.phase !== 'aiming') throw new Error(`beginThrow in phase '${state.phase}'`);
  const [aimNoise, r1] = nextNormal(state.rng);
  const [powerNoise, r2] = nextNormal(r1);
  const params = intentToThrow(intent, cfg.throw, { aim: aimNoise, power: powerNoise });

  const bodies = state.bodies.map((b) => {
    const c = cloneBodyData(b);
    const spec = b.kind === JACK_KIND ? cfg.balls.jack : cfg.balls.boule;
    c.spec = { ...spec };
    if (c.state === 'resting') c.pos.y = spec.radius;
    return c;
  });
  const id = `b${state.throws.length + 1}`;
  const boule = createBody(id, BOULE_KIND, cfg.balls.boule, params.origin);
  const world = launch({ time: 0, bodies }, boule, params);

  return {
    state: { ...state, rng: r2, throws: [...state.throws, { id, intent: { ...intent }, params }], phase: 'inFlight' },
    world,
    params,
  };
}

/**
 * Stores the resting positions after a throw. Anything still moving is forced to
 * rest where it is (callers normally pass a settled world). Phase becomes
 * 'endOver' once cfg.practice.boulesPerEnd boules have been thrown.
 */
export function settleThrow(state: PracticeState, world: World, cfg: PracticeConfig): PracticeState {
  if (state.phase !== 'inFlight') return state;
  const bodies = world.bodies.map((b) => {
    const c = cloneBodyData(b);
    if (c.state !== 'resting' && c.state !== 'out') {
      c.vel = { x: 0, y: 0, z: 0 };
      c.pos.y = c.spec.radius;
      c.state = 'resting';
      if (c.spin !== undefined) c.spin = 0;
    }
    return c;
  });
  return { ...state, bodies, phase: state.throws.length >= cfg.practice.boulesPerEnd ? 'endOver' : 'aiming' };
}

export interface BouleDistance {
  id: string;
  /** 1-based throw number within the end. */
  throwNumber: number;
  /** Metres, null when the boule is out (or the jack is). */
  distance: number | null;
  out: boolean;
}

export interface JackDistances {
  /** The jack left the arena: nothing can be measured. */
  jackOut: boolean;
  /** In-play boules nearest first, then out boules (in throw order). */
  entries: BouleDistance[];
}

/**
 * Distance of each thrown boule to the jack's CURRENT resting position.
 * Measured like a real pétanque measure: the gap between the ball surfaces on
 * the XZ plane (centre distance minus both radii, never below 0, so a boule
 * touching the jack reads 0). Out boules are
 * flagged `out` with a null distance and sorted last; when the jack itself is
 * out, `jackOut` is set and every distance is null.
 */
export function distancesToJack(state: PracticeState): JackDistances {
  const jack = state.bodies.find((b) => b.id === JACK_ID);
  const jackOut = !jack || jack.state === 'out';
  const entries: BouleDistance[] = [];
  state.throws.forEach((t, i) => {
    const b = state.bodies.find((o) => o.id === t.id);
    const out = !b || b.state === 'out';
    const distance = out || jackOut || !jack || !b ? null : Math.max(0, Math.hypot(b.pos.x - jack.pos.x, b.pos.z - jack.pos.z) - b.spec.radius - jack.spec.radius);
    entries.push({ id: t.id, throwNumber: i + 1, distance, out });
  });
  const inPlay = entries.filter((e) => e.distance !== null).sort((a, b) => (a.distance as number) - (b.distance as number));
  const rest = entries.filter((e) => e.distance === null);
  return { jackOut, entries: [...inPlay, ...rest] };
}

/** Closest in-play boule of the end, or null (nothing thrown / all out / jack out). */
export function closestBoule(state: PracticeState): BouleDistance | null {
  const first = distancesToJack(state).entries[0];
  return first && first.distance !== null ? first : null;
}

/** Aim preview: the throw WITHOUT noise and its predicted airborne arc. */
export function previewThrow(
  intent: ThrowIntent,
  cfg: PracticeConfig,
  sampleInterval = 1 / 30,
): { params: ThrowParams; flight: FlightPrediction } {
  const params = intentToThrow(intent, cfg.throw, { aim: 0, power: 0 });
  return { params, flight: predictFlight(params, cfg.physics, cfg.balls.boule.radius, sampleInterval) };
}

/**
 * Where a boule thrown with `params` would come to rest if it were alone on the
 * pitch (no other balls, no noise): a deterministic lone-boule simulation.
 * Pair it with previewThrow's landing point to show the roll-out.
 */
export function predictRestPoint(params: ThrowParams, cfg: PracticeConfig): Vec3 {
  const probe = createBody('predict', 'predict', cfg.balls.boule, params.origin);
  const { world } = simulateToRest(launch({ time: 0, bodies: [] }, probe, params), cfg.physics);
  return { ...(world.bodies[0] as Body).pos };
}
