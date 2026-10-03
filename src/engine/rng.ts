/**
 * Seeded PRNG (mulberry32). The whole state is one 32-bit integer, so it is a
 * plain serializable number. Two flavours:
 *  - pure functions on a state number (`nextRandom`, `nextNormal`) — no hidden state;
 *  - `createRng` / `rngFromState`, a tiny stateful convenience wrapper whose
 *    `state` getter can be saved and later restored.
 */

/** Serializable generator state (an unsigned 32-bit integer). */
export type RngState = number;

const UINT32_RANGE = 4294967296;
/** Guard so log(0) never happens in Box–Muller. */
const MIN_UNIT = 1 / UINT32_RANGE;

/** Normalises any number (incl. negatives/fractions) into a uint32 state. */
export const seedToState = (seed: number): RngState => Math.floor(seed) >>> 0;

/** Pure: returns [uniform value in [0,1), next state]. */
export function nextRandom(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  return [value, next];
}

/** Pure: returns [N(0,1) sample, next state] (Box–Muller, consumes two uniforms). */
export function nextNormal(state: RngState): [number, RngState] {
  const [u1, s1] = nextRandom(state);
  const [u2, s2] = nextRandom(s1);
  const radius = Math.sqrt(-2 * Math.log(Math.max(u1, MIN_UNIT)));
  return [radius * Math.cos(2 * Math.PI * u2), s2];
}

export interface Rng {
  /** Uniform in [0,1). */
  next(): number;
  /** Standard normal N(0,1). */
  normal(): number;
  /** Current state; pass to `rngFromState` to resume the exact sequence. */
  readonly state: RngState;
}

/** Creates a generator from a seed. Same seed -> same sequence. */
export function createRng(seed: number): Rng {
  return rngFromState(seedToState(seed));
}

/** Resumes a generator from a saved `state`. */
export function rngFromState(initial: RngState): Rng {
  let state = seedToState(initial);
  return {
    next() {
      const [v, s] = nextRandom(state);
      state = s;
      return v;
    },
    normal() {
      const [v, s] = nextNormal(state);
      state = s;
      return v;
    },
    get state() {
      return state;
    },
  };
}
