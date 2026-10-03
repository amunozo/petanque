/**
 * Words for the match UI: pure functions from MatchState to strings / small
 * view models (no DOM), so they can be unit-tested. Team names are placeholder.
 */
import { holdingTeam } from '../games/petanque/matchMeasure';
import type { Body } from '../engine';
import type { EndResult, MatchRules, MatchState, TeamId } from '../games/petanque/matchTypes';
import type { GameConfig } from '../tuning/config';
import { formatDistance } from './hud';

export const TEAM_NAME: Record<TeamId, string> = { A: 'Blue', B: 'Red' };
export const otherTeamId = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

/** "12 cm", "4 mm" under a centimetre, "1.24 m" above a metre. */
export function formatLead(metres: number): string {
  // Non-breaking space so a chip never wraps between the number and its unit.
  return (metres < 0.01 ? `${Math.max(1, Math.round(metres * 1000))} mm` : formatDistance(metres)).replace(' ', '\u00a0');
}

export interface TurnView {
  team: TeamId;
  /** "Blue — throw the jack" / "Red to play". */
  banner: string;
  /** Small second line of the banner; may be empty. */
  hint: string;
  /** Compact persistent chip text: "Blue to play". */
  chip: string;
}

export function turnView(state: MatchState): TurnView {
  const team = state.toThrow;
  const name = TEAM_NAME[team];
  if (state.phase === 'jack') {
    const { jackMinDist: lo, jackMaxDist: hi } = state.rules;
    return {
      team,
      banner: `${name} — throw the jack`,
      hint: `Land it in the marked zone (${lo}–${hi} m)`,
      chip: `${name} throws jack`,
    };
  }
  return { team, banner: `${name} to play`, hint: '', chip: `${name} to play` };
}

/** Why a resting jack is not a legal throw, as a short phrase ("too short"), or null when legal. */
export function jackFault(jack: Body | undefined, rules: MatchRules, cfg: Pick<GameConfig, 'throw' | 'physics'>): string | null {
  if (!jack || jack.state === 'out') return 'out of the pitch';
  const d = Math.hypot(jack.pos.x - cfg.throw.originX, jack.pos.z - cfg.throw.originZ);
  if (d < rules.jackMinDist) return 'too short';
  if (d > rules.jackMaxDist) return 'too far';
  const { minX, maxX } = cfg.physics.arena;
  if (jack.pos.x < minX + rules.jackMinSideMargin || jack.pos.x > maxX - rules.jackMinSideMargin) return 'too close to the side';
  return null;
}

export interface SettleMessage {
  text: string;
  /** Team the message is about (colours the chip), if any. */
  team: TeamId | null;
}

/**
 * The chip shown after a throw settles: who holds the point, or why the jack
 * was rejected (`fault`, from jackFault on the failed jack: the rules drop it
 * from the state). Null when a card (end / match over) takes over.
 */
export function settleMessage(state: MatchState, fault: string | null): SettleMessage | null {
  if (state.phase === 'endOver' || state.phase === 'matchOver' || state.phase === 'inFlight') return null;
  const next = TEAM_NAME[state.toThrow];
  if (state.phase === 'jack') {
    return { text: `Jack ${fault ?? 'not valid'} — ${next} throws it`, team: state.toThrow };
  }
  // boule phase
  if (state.throws.length === 0) return null;
  if (state.throws.every((t) => t.id === 'jack')) {
    // Only jack throws so far: either a legal jack, or the rules placed one after two failures.
    return state.jackAttempts >= 2
      ? { text: `Jack placed for you — ${next} plays first`, team: null }
      : { text: `Jack is in — ${next} plays first`, team: null };
  }
  const jack = state.bodies.find((b) => b.id === 'jack');
  if (!jack || jack.state === 'out') return { text: 'Jack knocked out of play', team: null };
  const hold = holdingTeam(state);
  if (hold) {
    const by = hold.lead === null ? '' : ` (by ${formatLead(hold.lead)})`;
    return { text: `${TEAM_NAME[hold.team]} holds the point${by}`, team: hold.team };
  }
  const anyBoule = state.bodies.some((b) => b.kind === 'boule' && b.state !== 'out');
  return { text: anyBoule ? 'Equidistant — nobody holds' : 'No boule in play', team: null };
}

export interface EndCardView {
  title: string;
  /** Second line, may be empty. */
  detail: string;
  /** Colours the card; null = neutral. */
  team: TeamId | null;
}

export function endCardView(result: EndResult): EndCardView {
  if (result.winner) {
    return {
      title: `${TEAM_NAME[result.winner]} scores ${result.points}`,
      detail: result.reason === 'jackOut' ? 'The jack left the pitch' : '',
      team: result.winner,
    };
  }
  if (result.reason === 'tie') return { title: 'Tie — no points', detail: 'Equal distance', team: null };
  return { title: 'Dead end — no points', detail: result.reason === 'jackOut' ? 'The jack left the pitch' : '', team: null };
}

/** "Blue 5 – 3 Red" */
export const scoreLine = (score: Record<TeamId, number>): string => `${TEAM_NAME.A} ${score.A} – ${score.B} ${TEAM_NAME.B}`;

/** "Blue wins 13 – 8" (winner's score first). */
export function matchOverTitle(winner: TeamId, score: Record<TeamId, number>): string {
  return `${TEAM_NAME[winner]} wins ${score[winner]} – ${score[otherTeamId(winner)]}`;
}
