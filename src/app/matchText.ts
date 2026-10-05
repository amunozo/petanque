/**
 * Words for the match UI: pure functions from MatchState to strings / small
 * view models (no DOM), so they can be unit-tested. Every string comes from the
 * i18n catalogue (src/i18n), in the language current when the function runs.
 */
import { t } from '../i18n';
import { holdingTeam } from '../games/petanque/matchMeasure';
import type { Body } from '../engine';
import type { EndResult, MatchRules, MatchState, TeamId } from '../games/petanque/matchTypes';
import type { GameConfig } from '../tuning/config';
import { formatDistance } from './hud';

/** Placeholder team names: "Blue" / "Red" (translated). */
export const teamName = (team: TeamId): string => (team === 'A' ? t('team.A') : t('team.B'));
/**
 * How the UI refers to each team. Two players on one phone: "Blue" / "Red".
 * Against the computer: "You" (Blue) / "Computer" (Red), with second-person phrasing.
 */
export interface Voice {
  name: Record<TeamId, string>;
  /** Team addressed as "you" (the catalogue has a separate phrasing for it). */
  you: Record<TeamId, boolean>;
  computer: Record<TeamId, boolean>;
}
export const voice2p = (): Voice => ({ name: { A: teamName('A'), B: teamName('B') }, you: { A: false, B: false }, computer: { A: false, B: false } });
export const voiceVs = (): Voice => ({ name: { A: t('team.you'), B: t('team.computer') }, you: { A: true, B: false }, computer: { A: false, B: true } });

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

export function turnView(state: MatchState, voice: Voice = voice2p()): TurnView {
  const team = state.toThrow;
  const name = voice.name[team];
  if (voice.computer[team]) {
    return {
      team,
      banner: t('turn.thinking.banner'),
      hint: state.phase === 'jack' ? t('turn.thinking.hint') : '',
      chip: t('turn.thinking.chip'),
    };
  }
  if (state.phase === 'jack') {
    const { jackMinDist: lo, jackMaxDist: hi } = state.rules;
    const hint = t('turn.jack.hint', { lo, hi });
    if (voice.you[team]) return { team, banner: t('turn.jack.bannerYou'), hint, chip: t('turn.jack.chipYou') };
    return { team, banner: t('turn.jack.banner', { name }), hint, chip: t('turn.jack.chip', { name }) };
  }
  if (voice.you[team]) return { team, banner: t('turn.playYou'), hint: '', chip: t('turn.playYou') };
  const text = t('turn.play', { name });
  return { team, banner: text, hint: '', chip: text };
}

/** Why a thrown jack is not a legal throw. */
export type JackFault = 'out' | 'short' | 'far' | 'side';
const FAULT_KEY = { out: 'fault.out', short: 'fault.short', far: 'fault.far', side: 'fault.side' } as const;

/** Why a resting jack is not a legal throw, or null when legal. */
export function jackFault(jack: Body | undefined, rules: MatchRules, cfg: Pick<GameConfig, 'throw' | 'physics'>): JackFault | null {
  if (!jack || jack.state === 'out') return 'out';
  const d = Math.hypot(jack.pos.x - cfg.throw.originX, jack.pos.z - cfg.throw.originZ);
  if (d < rules.jackMinDist) return 'short';
  if (d > rules.jackMaxDist) return 'far';
  const { minX, maxX } = cfg.physics.arena;
  if (jack.pos.x < minX + rules.jackMinSideMargin || jack.pos.x > maxX - rules.jackMinSideMargin) return 'side';
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
export function settleMessage(state: MatchState, fault: JackFault | null, voice: Voice = voice2p()): SettleMessage | null {
  if (state.phase === 'endOver' || state.phase === 'matchOver' || state.phase === 'inFlight') return null;
  const nt = state.toThrow;
  const name = voice.name[nt];
  const you = voice.you[nt];
  if (state.phase === 'jack') {
    const why = t(fault ? FAULT_KEY[fault] : 'fault.invalid');
    return { text: you ? t('toast.jackRetryYou', { fault: why }) : t('toast.jackRetry', { fault: why, name }), team: nt };
  }
  // boule phase
  if (state.throws.length === 0) return null;
  if (state.throws.every((th) => th.id === 'jack')) {
    // Only jack throws so far: either a legal jack, or the rules placed one after two failures.
    const placed = state.jackAttempts >= 2;
    if (you) return { text: t(placed ? 'toast.jackPlacedYou' : 'toast.jackInYou'), team: null };
    return { text: t(placed ? 'toast.jackPlaced' : 'toast.jackIn', { name }), team: null };
  }
  const jack = state.bodies.find((b) => b.id === 'jack');
  if (!jack || jack.state === 'out') return { text: t('toast.jackKnocked'), team: null };
  const hold = holdingTeam(state);
  if (hold) {
    const holderYou = voice.you[hold.team];
    const holder = voice.name[hold.team];
    if (hold.lead === null) return { text: holderYou ? t('toast.holdsYou') : t('toast.holds', { name: holder }), team: hold.team };
    const lead = formatLead(hold.lead);
    return { text: holderYou ? t('toast.holdsByYou', { lead }) : t('toast.holdsBy', { name: holder, lead }), team: hold.team };
  }
  const anyBoule = state.bodies.some((b) => b.kind === 'boule' && b.state !== 'out');
  return { text: anyBoule ? t('toast.equidistant') : t('toast.noBoule'), team: null };
}

export interface EndCardView {
  title: string;
  /** Second line, may be empty. */
  detail: string;
  /** Colours the card; null = neutral. */
  team: TeamId | null;
}

export function endCardView(result: EndResult, voice: Voice = voice2p()): EndCardView {
  const jackLeft = result.reason === 'jackOut' ? t('end.jackLeft') : '';
  if (result.winner) {
    const count = result.points;
    return {
      title: voice.you[result.winner] ? t('end.scoresYou', { count }) : t('end.scores', { name: voice.name[result.winner], count }),
      detail: jackLeft,
      team: result.winner,
    };
  }
  if (result.reason === 'tie') return { title: t('end.tie'), detail: t('end.tieDetail'), team: null };
  return { title: t('end.dead'), detail: jackLeft, team: null };
}

/** "Blue 5 – 3 Red" */
export const scoreLine = (score: Record<TeamId, number>, voice: Voice = voice2p()): string => `${voice.name.A} ${score.A} – ${score.B} ${voice.name.B}`;

/** "Blue wins 13 – 8" (winner's score first). */
export function matchOverTitle(winner: TeamId, score: Record<TeamId, number>, voice: Voice = voice2p()): string {
  const a = score[winner];
  const b = score[otherTeamId(winner)];
  return voice.you[winner] ? t('over.winsYou', { a, b }) : t('over.wins', { name: voice.name[winner], a, b });
}

/** "after 9 ends" */
export const matchOverDetail = (ends: number): string => t('over.after', { count: ends });
