/**
 * Pétanque match rules as a pure reducer over serializable actions.
 *
 *   createMatch -> phase 'jack'
 *   beginThrow  -> 'inFlight' (+ engine World to simulate)
 *   settle      -> next phase decided by the rules ('jack' | 'boule' | 'endOver' | 'matchOver')
 *   nextEnd     -> 'jack' of the following end
 *
 * Error policy: `beginThrow` (and `applyAction` for a throw) THROWS an Error
 * when it is not the team's turn or the phase is not 'jack'/'boule'. `settle`
 * and `nextEnd` called in the wrong phase are no-ops (return the state
 * unchanged), so stale/duplicated network messages are harmless.
 * No function mutates its inputs; no randomness other than the state's rng.
 *
 * Simplifications: the throwing circle stays fixed at the configured origin
 * (real rules move it to where the jack lay); a boule is "out" only if the
 * engine marks it out; no measuring disputes / dead-boule rules beyond the
 * jack-out and out-of-arena cases.
 */
import {
  cloneWorld,
  createBody,
  intentToThrow,
  launch,
  nextNormal,
  seedToState,
  type Body,
  type ThrowIntent,
  type ThrowParams,
  type World,
} from '../../engine';
import {
  isJackOut,
  isValidJack,
  nextThrower,
  otherTeam,
  placeJack,
  scoreEnd,
  type MatchConfig,
  type MatchSettleConfig,
} from './matchMeasure';
import { BOULE_KIND, JACK_ID, JACK_KIND } from './practice';
import type { EndResult, MatchAction, MatchState, TeamId } from './matchTypes';

const cloneBodies = (bodies: readonly Body[]): Body[] => cloneWorld({ time: 0, bodies: bodies as Body[] }).bodies;

/** A fresh match: team `firstTeam` throws the jack of end 1. */
export function createMatch(seed: number, cfg: Pick<MatchConfig, 'match'>, firstTeam: TeamId = 'A'): MatchState {
  const rules = { ...cfg.match };
  return {
    seed,
    rng: seedToState(seed),
    rules,
    score: { A: 0, B: 0 },
    endNumber: 1,
    jackTeam: firstTeam,
    phase: 'jack',
    toThrow: firstTeam,
    throws: [],
    bodies: [],
    boulesLeft: { A: rules.boulesPerTeam, B: rules.boulesPerTeam },
    jackAttempts: 0,
    lastEnd: null,
    winner: null,
  };
}

/** Can `team` throw right now (phase 'jack'/'boule' and it is their turn)? */
export const canThrow = (state: MatchState, team: TeamId): boolean =>
  (state.phase === 'jack' || state.phase === 'boule') && state.toThrow === team;

/**
 * Starts a throw: draws the noise (2 normals) from the match rng, converts the
 * intent to launch values and builds the World to simulate. Jack phase: the
 * jack alone on an empty pitch. Boule phase: the resting bodies plus a new
 * boule `${team}${n}` (n = this team's 1-based boule count this end).
 * Throws if it is not `team`'s turn or the phase does not allow a throw.
 */
export function beginThrow(
  state: MatchState,
  team: TeamId,
  intent: ThrowIntent,
  cfg: MatchConfig,
): { state: MatchState; world: World; params: ThrowParams } {
  if (state.phase !== 'jack' && state.phase !== 'boule') throw new Error(`beginThrow in phase '${state.phase}'`);
  if (state.toThrow !== team) throw new Error(`not team ${team}'s turn (team ${state.toThrow} throws)`);

  const [aimNoise, r1] = nextNormal(state.rng);
  const [powerNoise, r2] = nextNormal(r1);
  const params = intentToThrow(intent, cfg.throw, { aim: aimNoise, power: powerNoise });

  let id: string;
  let kind: string;
  let spec = cfg.balls.boule;
  let resting: Body[] = [];
  const boulesLeft = { ...state.boulesLeft };
  if (state.phase === 'jack') {
    id = JACK_ID;
    kind = JACK_KIND;
    spec = cfg.balls.jack;
  } else {
    // Boules already thrown by this team this end (the jack record has its own id).
    const n = state.throws.filter((t) => t.team === team && t.id !== JACK_ID).length + 1;
    id = `${team}${n}`;
    kind = BOULE_KIND;
    boulesLeft[team] = Math.max(0, boulesLeft[team] - 1);
    // Resting bodies take their ball spec from the live config.
    resting = cloneBodies(state.bodies).map((b) => {
      const s = b.kind === JACK_KIND ? cfg.balls.jack : cfg.balls.boule;
      b.spec = { ...s };
      if (b.state === 'resting') b.pos.y = s.radius;
      return b;
    });
  }
  const body = createBody(id, kind, spec, params.origin);
  const world = launch({ time: 0, bodies: resting }, body, params);
  return {
    state: {
      ...state,
      rng: r2,
      phase: 'inFlight',
      boulesLeft,
      throws: [...state.throws, { id, team, intent: { ...intent }, params }],
    },
    world,
    params,
  };
}

/** Closes the end: adds points, then 'matchOver' (target reached) or 'endOver'. */
function finishEnd(state: MatchState, bodies: Body[], end: EndResult): MatchState {
  const score = { ...state.score };
  if (end.winner) score[end.winner] += end.points;
  const won = end.winner !== null && score[end.winner] >= state.rules.pointsToWin;
  return {
    ...state,
    bodies,
    score,
    lastEnd: end,
    phase: won ? 'matchOver' : 'endOver',
    winner: won ? end.winner : null,
  };
}

function settleJack(state: MatchState, bodies: Body[], cfg: MatchSettleConfig): MatchState {
  const jack = bodies.find((b) => b.id === JACK_ID);
  if (isValidJack(jack, state.rules, cfg)) {
    return { ...state, bodies, phase: 'boule', toThrow: state.jackTeam };
  }
  const attempts = state.jackAttempts + 1;
  const withoutJack = bodies.filter((b) => b.id !== JACK_ID);
  if (attempts === 1) {
    // The other team gets a go at the jack; the original jackTeam still throws the first boule.
    return { ...state, bodies: withoutJack, jackAttempts: attempts, phase: 'jack', toThrow: otherTeam(state.toThrow) };
  }
  // Two failures: the jack is placed for them at a seeded legal spot.
  const placed = placeJack(state.rng, state.rules, cfg);
  return {
    ...state,
    rng: placed.rng,
    bodies: [...withoutJack, placed.jack],
    jackAttempts: attempts,
    phase: 'boule',
    toThrow: state.jackTeam,
  };
}

function settleBoule(state: MatchState, bodies: Body[]): MatchState {
  const probe: MatchState = { ...state, bodies };
  const { A, B } = state.boulesLeft;
  if (isJackOut(bodies)) {
    // Jack left the pitch: only a team still holding boules scores, and only if the other has none.
    const end: EndResult =
      A > 0 && B === 0
        ? { winner: 'A', points: A, scoringIds: [], reason: 'jackOut' }
        : B > 0 && A === 0
          ? { winner: 'B', points: B, scoringIds: [], reason: 'jackOut' }
          : { winner: null, points: 0, scoringIds: [], reason: 'jackOut' };
    return finishEnd(probe, bodies, end);
  }
  if (A === 0 && B === 0) return finishEnd(probe, bodies, scoreEnd(probe));
  return { ...probe, phase: 'boule', toThrow: nextThrower(probe) };
}

/**
 * Stores the resting bodies after a throw (anything still moving is forced to
 * rest where it lies) and applies the rules: jack validity, scoring, who
 * throws next. No-op unless phase is 'inFlight'.
 */
export function settle(state: MatchState, bodies: readonly Body[], cfg: MatchSettleConfig): MatchState {
  if (state.phase !== 'inFlight') return state;
  const stored = cloneBodies(bodies).map((c) => {
    if (c.state !== 'resting' && c.state !== 'out') {
      c.vel = { x: 0, y: 0, z: 0 };
      c.pos.y = c.spec.radius;
      c.state = 'resting';
      if (c.spin !== undefined) c.spin = 0;
    }
    return c;
  });
  // The jack throw is the only throw made in the 'jack' phase; the phase after it is derived from the last record.
  const last = state.throws[state.throws.length - 1];
  return last && last.id === JACK_ID ? settleJack(state, stored, cfg) : settleBoule(state, stored);
}

/** Starts the next end after 'endOver'. The throwing circle stays at the configured origin (simplification). No-op in other phases. */
export function nextEnd(state: MatchState): MatchState {
  if (state.phase !== 'endOver') return state;
  const jackTeam = state.lastEnd?.winner ?? state.jackTeam;
  return {
    ...state,
    endNumber: state.endNumber + 1,
    jackTeam,
    toThrow: jackTeam,
    phase: 'jack',
    throws: [],
    bodies: [],
    boulesLeft: { A: state.rules.boulesPerTeam, B: state.rules.boulesPerTeam },
    jackAttempts: 0,
  };
}

/** Reducer wrapper. A 'throw' also returns the World to simulate and the launch params. */
export function applyAction(
  state: MatchState,
  action: MatchAction,
  cfg: MatchConfig,
): { state: MatchState; world?: World; params?: ThrowParams } {
  switch (action.type) {
    case 'throw':
      return beginThrow(state, action.team, action.intent, cfg);
    case 'settle':
      return { state: settle(state, action.bodies, cfg) };
    case 'nextEnd':
      return { state: nextEnd(state) };
  }
}
