/**
 * Pure decisions of the online match UI (no DOM, no network), unit-tested:
 * who may aim, what a server step does to the screen, which connection notice
 * shows, the reconnect countdown, forfeits, whether to offer "Rejoin", and
 * invite-URL clean-up.
 */
import { canThrow, type MatchState } from '../../games/petanque';
import type { NetStatus, PlayerInfo, RoomInfo, RoomSnapshot, Seat } from '../../net';
import { ROOM_PARAM } from '../../net/invite';
import type { ActiveRoom } from './storage';

export const otherSeat = (s: Seat): Seat => (s === 'A' ? 'B' : 'A');

export interface AimCheck {
  status: NetStatus;
  /** This device's seat (null before `welcome`). */
  seat: Seat | null;
  /** The server's latest revision as mirrored by the client. */
  roomSeq: number | null;
  /** The revision on screen. */
  shownSeq: number;
  /** The state on screen. */
  state: MatchState;
  /** Our throw was sent and its result has not come back yet. */
  pending: boolean;
  /** Server steps waiting to be shown. */
  queued: number;
  /** A throw is being played back / the end's result presented. */
  busy: boolean;
  opponentLeft: boolean;
  /** The server ended the match (on the score or by forfeit). */
  over: boolean;
}

/** The local player may aim only on their own turn, connected, with the screen caught up with the server. */
export const canAimOnline = (c: AimCheck): boolean =>
  c.status === 'open' &&
  c.seat !== null &&
  !c.pending &&
  c.queued === 0 &&
  !c.busy &&
  !c.opponentLeft &&
  !c.over &&
  c.roomSeq === c.shownSeq &&
  canThrow(c.state, c.seat);

/**
 * The current turn belongs to the other player (they aim, or their throw is in flight):
 * the loft picker is hidden then, only "<Name> is aiming…" shows.
 */
export const opponentsTurn = (state: MatchState, seat: Seat | null): boolean =>
  seat !== null && (state.phase === 'jack' || state.phase === 'boule' || state.phase === 'inFlight') && state.toThrow !== seat;

/** A refereed throw: skip (already shown), animate (the step right after the screen), or snap (missed a step). */
export function throwAction(seq: number, shownSeq: number, hasBefore: boolean): 'skip' | 'animate' | 'snap' {
  if (seq <= shownSeq) return 'skip';
  return seq === shownSeq + 1 && hasBefore ? 'animate' : 'snap';
}

export type ConnectionNotice = 'reconnecting' | 'opponentLost' | 'opponentLeft' | null;

/** Our own connection comes first (the opponent's info is stale while we are away). */
export function connectionNotice(status: NetStatus, opponent: PlayerInfo | null | undefined): ConnectionNotice {
  if (status === 'connecting' || status === 'reconnecting') return 'reconnecting';
  if (status !== 'open' || !opponent) return null;
  if (opponent.left) return 'opponentLeft';
  return opponent.connected ? null : 'opponentLost';
}

/** Reconnect countdown text, m:ss, rounded up (it reads 1:00 at the start, 0:00 only when time is up). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The match ended by forfeit: 'won' for the player who stayed, 'lost' for the one who left (or came back too late). */
export function forfeitView(room: RoomSnapshot | null, seat: Seat | null): 'won' | 'lost' | null {
  if (!room || !seat || room.phase !== 'matchOver' || room.outcome?.reason !== 'forfeit') return null;
  return room.outcome.winner === seat ? 'won' : 'lost';
}

/** Score-bar names: the nicknames by seat, `fallback` for an empty seat. */
export function seatNames(players: RoomSnapshot['players'] | undefined, fallback: (seat: Seat) => string): Record<Seat, string> {
  return { A: players?.A?.nickname ?? fallback('A'), B: players?.B?.nickname ?? fallback('B') };
}

/** On start-up, with the room this device was in: offer to rejoin, forget it, or keep quiet (server unreachable). */
export function rejoinDecision(active: ActiveRoom | null, info: RoomInfo | null | 'unreachable'): 'offer' | 'forget' | 'none' {
  if (!active || info === 'unreachable') return 'none';
  if (!info || info.phase === 'matchOver') return 'forget';
  return 'offer';
}

/** `href` without the invite's `?room=` (other params and the hash kept), for history.replaceState. */
export function stripRoomParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(ROOM_PARAM);
  return u.toString();
}
