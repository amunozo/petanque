/**
 * Measuring and judging helpers for the match rules: distances, holding team,
 * jack validity / auto-placement, end scoring and who throws next. Pure
 * functions over plain data (no DOM, no three.js, no Math.random).
 */
import { createBody, nextRandom, type Body, type RngState, type Vec3 } from '../../engine';
import type { GameConfig } from '../../tuning/config';
import { BOULE_KIND, JACK_ID, JACK_KIND } from './practice';
import type { EndResult, MatchRules, MatchState, TeamId } from './matchTypes';

/** Two boules whose surface gaps differ by less than this (m) are "equidistant". */
export const TIE_EPSILON = 0.001;
/** Auto-placed jack lateral spread either side of the throwing line (m), before the board margin. */
export const AUTO_JACK_HALF_WIDTH = 0.8;
/** Auto-placed jack stays at least this far from the far end of the arena (m). */
const AUTO_JACK_FAR_MARGIN = 0.3;

export const TEAMS: readonly TeamId[] = ['A', 'B'];
export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

/** The slice of GameConfig the match rules read. */
export type MatchConfig = Pick<GameConfig, 'throw' | 'physics' | 'balls' | 'match'>;
/** What `settle` / `nextEnd` need (the rules themselves come from the state's snapshot). */
export type MatchSettleConfig = Pick<GameConfig, 'throw' | 'physics' | 'balls'>;

export interface MatchBouleDistance {
  id: string;
  team: TeamId;
  /** Surface gap to the jack in metres (centre XZ distance minus both radii, never below 0). */
  distance: number;
}

export interface Holding {
  team: TeamId;
  /** Holder's best (closest) boule distance. */
  distance: number;
  /** Gap between the holder's best and the other team's best; null when the other team has nothing in play. */
  lead: number | null;
}

const findJack = (bodies: readonly Body[]): Body | undefined => bodies.find((b) => b.id === JACK_ID);
export const isJackOut = (bodies: readonly Body[]): boolean => {
  const j = findJack(bodies);
  return !j || j.state === 'out';
};

/** Team that threw the body with this id this end (from the throw records). */
const teamOf = (state: MatchState, id: string): TeamId | undefined => state.throws.find((t) => t.id === id)?.team;

/** In-play boules with their surface gap to the jack, nearest first (ties by id). Empty when the jack is out. */
export function distances(state: MatchState): MatchBouleDistance[] {
  const jack = findJack(state.bodies);
  if (!jack || jack.state === 'out') return [];
  const list: MatchBouleDistance[] = [];
  for (const b of state.bodies) {
    if (b.kind !== BOULE_KIND || b.state === 'out') continue;
    const team = teamOf(state, b.id);
    if (!team) continue;
    const gap = Math.hypot(b.pos.x - jack.pos.x, b.pos.z - jack.pos.z) - b.spec.radius - jack.spec.radius;
    list.push({ id: b.id, team, distance: Math.max(0, gap) });
  }
  return list.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const bestOf = (list: readonly MatchBouleDistance[], team: TeamId): number | null => list.find((d) => d.team === team)?.distance ?? null;

/**
 * Team currently holding the point (closest boule). Null when nothing is in
 * play (or the jack is out) and when the two teams' best boules are equidistant
 * (within TIE_EPSILON) — then nobody holds.
 */
export function holdingTeam(state: MatchState): Holding | null {
  const list = distances(state);
  const first = list[0];
  if (!first) return null;
  const other = bestOf(list, otherTeam(first.team));
  if (other !== null && other - first.distance <= TIE_EPSILON) return null;
  return { team: first.team, distance: first.distance, lead: other === null ? null : other - first.distance };
}

/** Is this resting jack a legal throw? In range of the circle and clear of the side boards. */
export function isValidJack(jack: Body | undefined, rules: MatchRules, cfg: Pick<GameConfig, 'throw' | 'physics'>): boolean {
  if (!jack || jack.state !== 'resting') return false;
  const { originX, originZ } = cfg.throw;
  const d = Math.hypot(jack.pos.x - originX, jack.pos.z - originZ);
  const { minX, maxX } = cfg.physics.arena;
  return (
    d >= rules.jackMinDist &&
    d <= rules.jackMaxDist &&
    jack.pos.x >= minX + rules.jackMinSideMargin &&
    jack.pos.x <= maxX - rules.jackMinSideMargin
  );
}

/**
 * Seeded random legal jack position (used after two failed jack throws).
 * Returns the resting jack body and the advanced rng. Uses 2 uniforms.
 */
export function placeJack(rng: RngState, rules: MatchRules, cfg: MatchSettleConfig): { jack: Body; rng: RngState } {
  const [u1, r1] = nextRandom(rng);
  const [u2, r2] = nextRandom(r1);
  const { originX, originZ } = cfg.throw;
  const { minX, maxX, minZ } = cfg.physics.arena;
  const lo = Math.min(rules.jackMinDist, rules.jackMaxDist);
  // Far limit so the jack stays inside the arena.
  const hi = Math.max(lo, Math.min(Math.max(rules.jackMinDist, rules.jackMaxDist), originZ - minZ - AUTO_JACK_FAR_MARGIN));
  const dist = lo + (hi - lo) * u1;
  const xLo = Math.max(minX + rules.jackMinSideMargin, originX - AUTO_JACK_HALF_WIDTH);
  const xHi = Math.min(maxX - rules.jackMinSideMargin, originX + AUTO_JACK_HALF_WIDTH);
  const x = xLo <= xHi ? xLo + (xHi - xLo) * u2 : originX;
  const dx = Math.min(Math.abs(x - originX), dist * 0.9);
  const z = originZ - Math.sqrt(dist * dist - dx * dx);
  const pos: Vec3 = { x, y: 0, z };
  return { jack: createBody(JACK_ID, JACK_KIND, cfg.balls.jack, pos), rng: r2 };
}

/**
 * Scores a finished end (both teams out of boules; the jack is in play).
 * The closest in-play boule wins; its team gets one point per in-play boule
 * strictly closer (by more than TIE_EPSILON) than the opponent's closest. If
 * the opponent has none in play, all the winner's in-play boules count.
 * Equidistant closest boules, or nothing in play at all, score nothing
 * (reason 'tie').
 */
export function scoreEnd(state: MatchState): EndResult {
  const list = distances(state);
  const first = list[0];
  if (!first) return { winner: null, points: 0, scoringIds: [], reason: 'tie' };
  const oppBest = bestOf(list, otherTeam(first.team));
  if (oppBest !== null && oppBest - first.distance <= TIE_EPSILON) {
    return { winner: null, points: 0, scoringIds: [], reason: 'tie' };
  }
  const scoring = list.filter((d) => d.team === first.team && (oppBest === null || d.distance < oppBest - TIE_EPSILON));
  return { winner: first.team, points: scoring.length, scoringIds: scoring.map((d) => d.id), reason: 'normal' };
}

/**
 * Who throws next in the boule phase (at least one team still has boules and
 * the jack is in play): the team NOT holding the point if it has boules,
 * otherwise the other team. Nothing in play: the team that did not throw last
 * (if it has boules). Equidistant bests: the team that threw last throws again
 * (if it has boules).
 */
export function nextThrower(state: MatchState): TeamId {
  const has = (t: TeamId): boolean => state.boulesLeft[t] > 0;
  const last = state.throws.length > 0 ? (state.throws[state.throws.length - 1] as { team: TeamId }).team : state.jackTeam;
  const pick = (preferred: TeamId): TeamId => (has(preferred) ? preferred : otherTeam(preferred));

  const list = distances(state);
  const first = list[0];
  if (!first) return pick(otherTeam(last));
  const oppBest = bestOf(list, otherTeam(first.team));
  if (oppBest !== null && oppBest - first.distance <= TIE_EPSILON) return pick(last);
  return pick(otherTeam(first.team));
}
