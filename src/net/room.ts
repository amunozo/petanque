/**
 * Pure room logic for "play a friend": the referee's state machine.
 *
 *   lobby --(second seat taken)--> playing --(match won)--> matchOver
 *     ^                                ^                        |
 *     |                                +------(both rematch)----+
 *   (a seat leaves in the lobby frees it)
 *
 * Forfeit: a seat that drops mid-match while its opponent is connected gets a
 * reconnect deadline (`graceUntil`). Back in time: the match goes on. When it
 * passes (`roomAlarm`), or on `leave` mid-match, the room goes to 'matchOver'
 * with outcome { winner: the player who stayed, reason: 'forfeit' }. If both
 * are gone at the deadline nobody wins (the countdown is dropped), and whoever
 * comes back in time gives the other a fresh one.
 * Abandonment: when BOTH seats are away mid-match, `abandonAt` (room level) runs
 * for the same grace; if nobody is back by then the match is abandoned: the
 * result carries `abandoned: true` and the Durable Object deletes the room (like
 * an idle expiry), so GET /rooms/:code is 404 and a later hello gets roomExpired.
 *
 * Reducer style: every function takes the RoomState (never mutated) and
 * returns the next one plus the messages to send. No I/O, no clock, no
 * Math.random: time comes IN as `RoomClock` and randomness (match seed, who
 * throws the first jack) as `Entropy`, both supplied by the Durable Object,
 * which also wakes the room at `roomDeadline()`. Same inputs -> same outputs,
 * so it is unit-tested directly.
 *
 * Throws are refereed exactly like the local match (app/matchMode.ts +
 * app/playback.ts): beginThrow -> simulate to rest (fixed step, time cap) ->
 * settle with the resting bodies. The server always uses the DEFAULT config.
 */
import { simulateToRest } from '../engine';
import { beginThrow, canThrow, createMatch, nextEnd, settle } from '../games/petanque/match';
import { matchConfig, type MatchLength } from '../games/petanque/matchLength';
import type { MatchConfig } from '../games/petanque/matchMeasure';
import type { MatchState } from '../games/petanque/matchTypes';
import { defaultConfig } from '../tuning/config';
import { cloneDeep } from '../tuning/paths';
import { CONFIG_HASH } from './fingerprint';
import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  SEATS,
  type ClientMessage,
  type ErrorCode,
  type HelloMsg,
  type MatchOutcome,
  type PublicMatchState,
  type RoomPhase,
  type RoomSnapshot,
  type Seat,
  type ServerMessage,
} from './protocol';

/**
 * A throw that has not settled after this much simulated time is forced to
 * rest (same cap as app/playback.ts). Bounds the server's CPU per throw to
 * maxThrowSeconds / physics.fixedDt steps.
 */
export const MAX_THROW_SECONDS = 40;

/** The referee's config: a private deep copy of the defaults (never client tuning). */
const SERVER_CFG: MatchConfig = cloneDeep({
  physics: defaultConfig.physics,
  balls: defaultConfig.balls,
  throw: defaultConfig.throw,
  match: defaultConfig.match,
});

export interface SeatState {
  /** Secret per-device id; never sent to anyone. */
  token: string;
  nickname: string;
  connected: boolean;
  left: boolean;
  /** Disconnected mid-match: when the forfeit falls (RoomClock time); null when no countdown runs. */
  graceUntil: number | null;
}

export interface RoomState {
  code: string;
  length: MatchLength;
  phase: RoomPhase;
  seq: number;
  matchNumber: number;
  seats: Record<Seat, SeatState | null>;
  /** Full state INCLUDING seed/rng (server only; clients get publicMatch()). */
  match: MatchState | null;
  rematch: Record<Seat, boolean>;
  /** Set in 'matchOver': who won and how. */
  outcome: MatchOutcome | null;
  /** Mid-match with BOTH seats away: when the room is abandoned (RoomClock time); null while someone is connected. */
  abandonAt: number | null;
}

/** Time as the Durable Object sees it (the room has no clock of its own). */
export interface RoomClock {
  /** Current time, ms (any epoch, the same on every call; deadlines use it). */
  now: number;
  /** How long a player who dropped mid-match has to come back. */
  reconnectGraceMs: number;
}

/** Server randomness for a new match. */
export interface Entropy {
  /** uint32 match seed (throw noise, auto-placed jacks). */
  seed: number;
  /** Team that throws the first jack. */
  firstTeam: Seat;
}

/** 'self' = the socket that sent the message; 'all' = every seated socket. */
export type Recipient = 'self' | Seat | 'all';
export interface Outgoing {
  to: Recipient;
  msg: ServerMessage;
}
export interface RoomResult {
  room: RoomState;
  out: Outgoing[];
  /** After a successful hello: the seat now bound to the sending socket. */
  seat?: Seat;
  /** Close the sending socket with this code after sending `out`. */
  close?: number;
  /** The match was abandoned (both players away past the grace): the Durable Object deletes the room. */
  abandoned?: true;
}

const other = (s: Seat): Seat => (s === 'A' ? 'B' : 'A');

export function createRoomState(code: string, length: MatchLength): RoomState {
  return {
    code,
    length,
    phase: 'lobby',
    seq: 0,
    matchNumber: 0,
    seats: { A: null, B: null },
    match: null,
    rematch: { A: false, B: false },
    outcome: null,
    abandonAt: null,
  };
}

/** Match state for clients: seed and rng zeroed (they would reveal the next throws' noise). */
export const publicMatch = (m: MatchState): PublicMatchState => ({ ...m, seed: 0, rng: 0 });

const graceLeft = (s: SeatState, now: number): number | null => (s.graceUntil === null ? null : Math.max(0, s.graceUntil - now));

/** The room as clients see it at time `now` (no tokens, no seed). */
export function roomSnapshot(room: RoomState, now: number): RoomSnapshot {
  const player = (s: SeatState | null) => (s ? { nickname: s.nickname, connected: s.connected, left: s.left, graceMs: graceLeft(s, now) } : null);
  return {
    code: room.code,
    phase: room.phase,
    length: room.length,
    seq: room.seq,
    matchNumber: room.matchNumber,
    players: { A: player(room.seats.A), B: player(room.seats.B) },
    match: room.match ? publicMatch(room.match) : null,
    rematch: { ...room.rematch },
    outcome: room.outcome,
  };
}

/** Tells the other seat how `seat` is connected now. */
function connectionMsg(room: RoomState, seat: Seat, now: number): Outgoing {
  const s = room.seats[seat];
  return {
    to: other(seat),
    msg: { type: 'opponentConnection', seat, connected: s?.connected ?? false, left: s?.left ?? false, graceMs: s ? graceLeft(s, now) : null },
  };
}

/** `first`'s messages go out before `then`'s; `then` has the final room. */
const chain = (first: RoomResult, then: RoomResult): RoomResult => (first.out.length === 0 ? then : { ...then, out: [...first.out, ...then.out] });

/**
 * The grace invariant. Only in 'playing': a disconnected seat whose opponent
 * is connected has a deadline (a running one is kept, otherwise a fresh one
 * starts); a running deadline is also kept while both are away (roomAlarm
 * drops it if nobody is back by then). Connected seats and other phases: none.
 * With both seats away, `abandonAt` runs (kept once started); otherwise null.
 */
function syncGrace(room: RoomState, clock: RoomClock): RoomState {
  const seat = (s: Seat): SeatState | null => {
    const st = room.seats[s];
    if (!st) return null;
    let graceUntil: number | null = null;
    if (room.phase === 'playing' && !st.connected) {
      const running = st.graceUntil !== null && st.graceUntil > clock.now ? st.graceUntil : null;
      graceUntil = running ?? (room.seats[other(s)]?.connected ? clock.now + clock.reconnectGraceMs : null);
    }
    return graceUntil === st.graceUntil ? st : { ...st, graceUntil };
  };
  const A = seat('A');
  const B = seat('B');
  const bothAway = room.phase === 'playing' && A !== null && B !== null && !A.connected && !B.connected;
  const abandonAt = bothAway ? (room.abandonAt ?? clock.now + clock.reconnectGraceMs) : null;
  return A === room.seats.A && B === room.seats.B && abandonAt === room.abandonAt ? room : { ...room, seats: { A, B }, abandonAt };
}

/** Mid-match, both players away and the abandon deadline has passed: the room is dead (the Durable Object deletes it). */
export function isAbandoned(room: RoomState, now: number): boolean {
  return room.phase === 'playing' && room.abandonAt != null && room.abandonAt <= now && SEATS.every((s) => room.seats[s]?.connected !== true);
}

/** `loser` forfeits: the other seat wins, the match is over (no rematch after a forfeit). */
function forfeit(room: RoomState, loser: Seat, clock: RoomClock): RoomResult {
  const outcome: MatchOutcome = { winner: other(loser), reason: 'forfeit' };
  const next = syncGrace({ ...room, phase: 'matchOver', outcome, rematch: { A: false, B: false } }, clock);
  return { room: next, out: [{ to: 'all', msg: { type: 'forfeit', room: roomSnapshot(next, clock.now) } }] };
}

/** The earliest reconnect or abandon deadline (RoomClock time), or null: the Durable Object calls roomAlarm then. */
export function roomDeadline(room: RoomState): number | null {
  if (room.phase !== 'playing') return null;
  let at: number | null = null;
  for (const s of SEATS) {
    const g = room.seats[s]?.graceUntil ?? null;
    if (g !== null && (at === null || g < at)) at = g;
  }
  if (room.abandonAt != null && (at === null || room.abandonAt < at)) at = room.abandonAt;
  return at;
}

/**
 * Resolves the reconnect deadlines that have passed: the player who stayed
 * wins by forfeit; with nobody there to claim it the deadline is dropped, and
 * when both stayed away past `abandonAt` the result is `abandoned` (the room
 * must be deleted; `room` is unchanged). Also run first by every other event, so the outcome never depends on
 * how late the alarm fires.
 */
export function roomAlarm(room: RoomState, clock: RoomClock): RoomResult {
  if (isAbandoned(room, clock.now)) return { room, out: [], abandoned: true };
  let next = room;
  for (const s of SEATS) {
    const st = next.seats[s];
    if (next.phase !== 'playing' || !st || st.graceUntil === null || st.graceUntil > clock.now) continue;
    if (next.seats[other(s)]?.connected) return forfeit(next, s, clock);
    next = { ...next, seats: { ...next.seats, [s]: { ...st, graceUntil: null } } };
  }
  return { room: next, out: [] };
}

/**
 * A stored room after the Durable Object restarted (deploy, crash): sockets
 * can be gone without a close event, so a seat only counts as connected if a
 * live socket holds it (the live opponent, if any, is told and gets the
 * countdown). Also fills in fields an older server did not store. Returns the
 * same room object when nothing changed.
 */
export function restoreRoom(stored: RoomState, liveSeats: readonly (Seat | null)[], clock: RoomClock): RoomResult {
  const fill = (st: SeatState | null): SeatState | null => (st && st.graceUntil === undefined ? { ...st, graceUntil: null } : st);
  let room: RoomState = stored;
  if (stored.outcome === undefined || stored.abandonAt === undefined || fill(stored.seats.A) !== stored.seats.A || fill(stored.seats.B) !== stored.seats.B) {
    room = { ...stored, outcome: stored.outcome ?? null, abandonAt: stored.abandonAt ?? null, seats: { A: fill(stored.seats.A), B: fill(stored.seats.B) } };
  }
  const stale = SEATS.filter((s) => room.seats[s]?.connected === true && !liveSeats.includes(s));
  const seats = { ...room.seats };
  for (const s of stale) seats[s] = { ...(seats[s] as SeatState), connected: false };
  // Also for rooms stored with both seats already away (a countdown that an older server never started).
  room = syncGrace(stale.length === 0 ? room : { ...room, seats }, clock);
  if (stale.length === 0) return { room, out: [] };
  const out = stale.filter((s) => room.seats[other(s)]?.connected).map((s) => connectionMsg(room, s, clock.now));
  return { room, out };
}

const error = (code: ErrorCode, detail?: string, fatal = false): ServerMessage =>
  detail === undefined ? { type: 'error', code, fatal } : { type: 'error', code, fatal, detail };
const reply = (room: RoomState, code: ErrorCode, detail?: string): RoomResult => ({ room, out: [{ to: 'self', msg: error(code, detail) }] });
const fatal = (room: RoomState, code: ErrorCode, close: number, detail?: string): RoomResult => ({
  room,
  out: [{ to: 'self', msg: error(code, detail, true) }],
  close,
});

/** Starts a (re)match: fresh rules state from the server's entropy (a seat that is away gets a countdown). */
function startMatch(room: RoomState, entropy: Entropy, clock: RoomClock): RoomState {
  return syncGrace(
    {
      ...room,
      phase: 'playing',
      seq: room.seq + 1,
      matchNumber: room.matchNumber + 1,
      match: createMatch(entropy.seed >>> 0, matchConfig(SERVER_CFG, room.length), entropy.firstTeam),
      rematch: { A: false, B: false },
      outcome: null,
    },
    clock,
  );
}

/**
 * A socket says hello. Same token -> same seat (reconnect, in time or after a
 * forfeit: the snapshot says which); a new token takes the first free seat; a
 * third token gets roomFull. Taking the second seat in the lobby starts the match.
 */
export function joinRoom(room: RoomState, hello: HelloMsg, entropy: Entropy, clock: RoomClock): RoomResult {
  if (hello.protocolVersion !== PROTOCOL_VERSION || hello.configHash !== CONFIG_HASH) {
    return fatal(room, 'versionMismatch', CLOSE_CODES.versionMismatch, `server protocol ${PROTOCOL_VERSION}, config ${CONFIG_HASH}`);
  }
  if (hello.roomCode !== room.code) return fatal(room, 'roomNotFound', CLOSE_CODES.roomNotFound);

  // A deadline that passed is settled first (a late rejoin finds the forfeit).
  const due = roomAlarm(room, clock);
  if (due.abandoned) return { ...fatal(room, 'roomExpired', CLOSE_CODES.roomExpired), abandoned: true };
  const cur = due.room;
  const known = SEATS.find((s) => cur.seats[s]?.token === hello.clientToken);
  const seat = known ?? SEATS.find((s) => cur.seats[s] === null);
  if (!seat) return chain(due, fatal(cur, 'roomFull', CLOSE_CODES.roomFull));

  const seats = { ...cur.seats, [seat]: { token: hello.clientToken, nickname: hello.nickname, connected: true, left: false, graceUntil: null } };
  let next: RoomState = { ...cur, seats };
  const starts = next.phase === 'lobby' && seats.A !== null && seats.B !== null;
  next = starts ? startMatch(next, entropy, clock) : syncGrace(next, clock);

  const out: Outgoing[] = [
    // The joining socket gets the forfeit in its welcome snapshot.
    ...due.out.map((o): Outgoing => (o.to === 'all' ? { ...o, to: other(seat) } : o)),
    {
      to: 'self',
      msg: { type: 'welcome', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, seat, room: roomSnapshot(next, clock.now) },
    },
  ];
  if (starts) out.push({ to: 'all', msg: { type: 'matchStarted', room: roomSnapshot(next, clock.now) } });
  else if (next.phase === 'lobby') out.push({ to: other(seat), msg: { type: 'roomState', room: roomSnapshot(next, clock.now) } });
  if (known) out.push(connectionMsg(next, seat, clock.now));
  return { room: next, out, seat };
}

/**
 * The last open socket of `seat` closed (network drop, app backgrounded...).
 * Mid-match, with the opponent still there, the reconnect countdown starts.
 */
export function seatDisconnected(room: RoomState, seat: Seat, clock: RoomClock): RoomResult {
  const due = roomAlarm(room, clock);
  const s = due.room.seats[seat];
  if (due.abandoned || !s || !s.connected) return due;
  const next = syncGrace({ ...due.room, seats: { ...due.room.seats, [seat]: { ...s, connected: false } } }, clock);
  return chain(due, { room: next, out: [connectionMsg(next, seat, clock.now)] });
}

/** Referees one throw: rules -> server simulation -> rules. */
function handleThrow(room: RoomState, seat: Seat, msg: Extract<ClientMessage, { type: 'throw' }>): RoomResult {
  const match = room.match;
  if (room.phase !== 'playing' || !match) return reply(room, 'wrongPhase');
  if (msg.seq !== room.seq) return reply(room, 'staleState', `seq is ${room.seq}`);
  if (!canThrow(match, seat)) return reply(room, 'notYourTurn');

  const thrown = beginThrow(match, seat, msg.intent, SERVER_CFG);
  const sim = simulateToRest(thrown.world, SERVER_CFG.physics, MAX_THROW_SECONDS);
  const settled = settle(thrown.state, sim.world.bodies, SERVER_CFG);
  const record = thrown.state.throws[thrown.state.throws.length - 1];
  if (!record) return reply(room, 'serverError');
  const over = settled.phase === 'matchOver';
  const next: RoomState = {
    ...room,
    seq: room.seq + 1,
    match: settled,
    phase: over ? 'matchOver' : 'playing',
    rematch: { A: false, B: false },
    outcome: over && settled.winner ? { winner: settled.winner, reason: 'score' } : null,
  };
  return {
    room: next,
    out: [{ to: 'all', msg: { type: 'throwResult', seq: next.seq, record, rest: sim.world.bodies, match: publicMatch(settled) } }],
  };
}

/** Starts the next end. Idempotent: anything but the current finished end is ignored silently. */
function handleNextEnd(room: RoomState, endNumber: number): RoomResult {
  const m = room.match;
  if (room.phase !== 'playing' || !m || m.phase !== 'endOver' || m.endNumber !== endNumber) return { room, out: [] };
  const next: RoomState = { ...room, seq: room.seq + 1, match: nextEnd(m) };
  return { room: next, out: [{ to: 'all', msg: { type: 'endStarted', seq: next.seq, match: publicMatch(next.match as MatchState) } }] };
}

/** A rematch vote; both votes start a new match. Ignored outside 'matchOver' (late duplicate) and after a forfeit. */
function handleRematch(room: RoomState, seat: Seat, entropy: Entropy, clock: RoomClock): RoomResult {
  if (room.phase !== 'matchOver' || room.outcome?.reason === 'forfeit') return { room, out: [] };
  const rematch = { ...room.rematch, [seat]: true };
  if (rematch.A && rematch.B) {
    const next = startMatch(room, entropy, clock);
    return { room: next, out: [{ to: 'all', msg: { type: 'matchStarted', room: roomSnapshot(next, clock.now) } }] };
  }
  const next: RoomState = { ...room, rematch };
  return { room: next, out: [{ to: 'all', msg: { type: 'roomState', room: roomSnapshot(next, clock.now) } }] };
}

/**
 * Explicit leave: frees the seat in the lobby; mid-match it is an immediate
 * forfeit; after a match the seat is kept (same token can return).
 */
function handleLeave(room: RoomState, seat: Seat, clock: RoomClock): RoomResult {
  const s = room.seats[seat];
  if (!s) return { room, out: [], close: CLOSE_CODES.left };
  if (room.phase === 'lobby') {
    const next: RoomState = { ...room, seats: { ...room.seats, [seat]: null } };
    return { room: next, out: [{ to: other(seat), msg: { type: 'roomState', room: roomSnapshot(next, clock.now) } }], close: CLOSE_CODES.left };
  }
  const next: RoomState = {
    ...room,
    seats: { ...room.seats, [seat]: { ...s, connected: false, left: true, graceUntil: null } },
    rematch: { ...room.rematch, [seat]: false },
  };
  if (room.phase === 'playing') return { ...forfeit(next, seat, clock), close: CLOSE_CODES.left };
  return { room: next, out: [connectionMsg(next, seat, clock.now)], close: CLOSE_CODES.left };
}

/** Any message from a socket already seated as `seat` (hello goes through joinRoom). */
export function roomMessage(room: RoomState, seat: Seat, msg: ClientMessage, entropy: Entropy, clock: RoomClock): RoomResult {
  const due = roomAlarm(room, clock);
  if (due.abandoned) return { ...fatal(room, 'roomExpired', CLOSE_CODES.roomExpired), abandoned: true };
  return chain(due, seatMessage(due.room, seat, msg, entropy, clock));
}

function seatMessage(room: RoomState, seat: Seat, msg: ClientMessage, entropy: Entropy, clock: RoomClock): RoomResult {
  switch (msg.type) {
    case 'hello':
      return reply(room, 'badMessage', 'already joined');
    case 'throw':
      return handleThrow(room, seat, msg);
    case 'nextEnd':
      return handleNextEnd(room, msg.endNumber);
    case 'rematch':
      return handleRematch(room, seat, entropy, clock);
    case 'leave':
      return handleLeave(room, seat, clock);
    case 'ping':
      return { room, out: [{ to: 'self', msg: { type: 'pong' } }] };
  }
}
