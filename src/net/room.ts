/**
 * Pure room logic for "play a friend": the referee's state machine.
 *
 *   lobby --(second seat taken)--> playing --(match won)--> matchOver
 *     ^                                ^                        |
 *     |                                +------(both rematch)----+
 *   (a seat leaves in the lobby frees it)
 *
 * Reducer style: every function takes the RoomState (never mutated) and
 * returns the next one plus the messages to send. No I/O, no clock, no
 * Math.random: randomness (match seed, who throws the first jack) comes IN as
 * `Entropy`, supplied by the Durable Object from crypto. Same inputs -> same
 * outputs, so it is unit-tested directly.
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
  type ClientMessage,
  type ErrorCode,
  type HelloMsg,
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
  };
}

/** Match state for clients: seed and rng zeroed (they would reveal the next throws' noise). */
export const publicMatch = (m: MatchState): PublicMatchState => ({ ...m, seed: 0, rng: 0 });

export function roomSnapshot(room: RoomState): RoomSnapshot {
  const player = (s: SeatState | null) => (s ? { nickname: s.nickname, connected: s.connected, left: s.left } : null);
  return {
    code: room.code,
    phase: room.phase,
    length: room.length,
    seq: room.seq,
    matchNumber: room.matchNumber,
    players: { A: player(room.seats.A), B: player(room.seats.B) },
    match: room.match ? publicMatch(room.match) : null,
    rematch: { ...room.rematch },
  };
}

const error = (code: ErrorCode, detail?: string, fatal = false): ServerMessage =>
  detail === undefined ? { type: 'error', code, fatal } : { type: 'error', code, fatal, detail };
const reply = (room: RoomState, code: ErrorCode, detail?: string): RoomResult => ({ room, out: [{ to: 'self', msg: error(code, detail) }] });
const fatal = (room: RoomState, code: ErrorCode, close: number, detail?: string): RoomResult => ({
  room,
  out: [{ to: 'self', msg: error(code, detail, true) }],
  close,
});

/** Starts a (re)match: fresh rules state from the server's entropy. */
function startMatch(room: RoomState, entropy: Entropy): RoomState {
  return {
    ...room,
    phase: 'playing',
    seq: room.seq + 1,
    matchNumber: room.matchNumber + 1,
    match: createMatch(entropy.seed >>> 0, matchConfig(SERVER_CFG, room.length), entropy.firstTeam),
    rematch: { A: false, B: false },
  };
}

/**
 * A socket says hello. Same token -> same seat (reconnect); a new token takes
 * the first free seat; a third token gets roomFull. Taking the second seat in
 * the lobby starts the match.
 */
export function joinRoom(room: RoomState, hello: HelloMsg, entropy: Entropy): RoomResult {
  if (hello.protocolVersion !== PROTOCOL_VERSION || hello.configHash !== CONFIG_HASH) {
    return fatal(room, 'versionMismatch', CLOSE_CODES.versionMismatch, `server protocol ${PROTOCOL_VERSION}, config ${CONFIG_HASH}`);
  }
  if (hello.roomCode !== room.code) return fatal(room, 'roomNotFound', CLOSE_CODES.roomNotFound);

  const known = (['A', 'B'] as const).find((s) => room.seats[s]?.token === hello.clientToken);
  const seat = known ?? (['A', 'B'] as const).find((s) => room.seats[s] === null);
  if (!seat) return fatal(room, 'roomFull', CLOSE_CODES.roomFull);

  const seats = { ...room.seats, [seat]: { token: hello.clientToken, nickname: hello.nickname, connected: true, left: false } };
  let next: RoomState = { ...room, seats };
  const starts = next.phase === 'lobby' && seats.A !== null && seats.B !== null;
  if (starts) next = startMatch(next, entropy);

  const out: Outgoing[] = [
    {
      to: 'self',
      msg: { type: 'welcome', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, seat, room: roomSnapshot(next) },
    },
  ];
  if (starts) out.push({ to: 'all', msg: { type: 'matchStarted', room: roomSnapshot(next) } });
  else if (next.phase === 'lobby') out.push({ to: other(seat), msg: { type: 'roomState', room: roomSnapshot(next) } });
  if (known) out.push({ to: other(seat), msg: { type: 'opponentConnection', seat, connected: true, left: false } });
  return { room: next, out, seat };
}

/** The last open socket of `seat` closed (network drop, app backgrounded...). */
export function seatDisconnected(room: RoomState, seat: Seat): RoomResult {
  const s = room.seats[seat];
  if (!s || !s.connected) return { room, out: [] };
  const next: RoomState = { ...room, seats: { ...room.seats, [seat]: { ...s, connected: false } } };
  return { room: next, out: [{ to: other(seat), msg: { type: 'opponentConnection', seat, connected: false, left: s.left } }] };
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

/** A rematch vote; both votes start a new match. Ignored outside 'matchOver' (late duplicate). */
function handleRematch(room: RoomState, seat: Seat, entropy: Entropy): RoomResult {
  if (room.phase !== 'matchOver') return { room, out: [] };
  const rematch = { ...room.rematch, [seat]: true };
  if (rematch.A && rematch.B) {
    const next = startMatch(room, entropy);
    return { room: next, out: [{ to: 'all', msg: { type: 'matchStarted', room: roomSnapshot(next) } }] };
  }
  const next: RoomState = { ...room, rematch };
  return { room: next, out: [{ to: 'all', msg: { type: 'roomState', room: roomSnapshot(next) } }] };
}

/** Explicit leave: frees the seat in the lobby; during/after a match the seat is kept (same token can return). */
function handleLeave(room: RoomState, seat: Seat): RoomResult {
  const s = room.seats[seat];
  if (!s) return { room, out: [], close: CLOSE_CODES.left };
  if (room.phase === 'lobby') {
    const next: RoomState = { ...room, seats: { ...room.seats, [seat]: null } };
    return { room: next, out: [{ to: other(seat), msg: { type: 'roomState', room: roomSnapshot(next) } }], close: CLOSE_CODES.left };
  }
  const next: RoomState = {
    ...room,
    seats: { ...room.seats, [seat]: { ...s, connected: false, left: true } },
    rematch: { ...room.rematch, [seat]: false },
  };
  return {
    room: next,
    out: [{ to: other(seat), msg: { type: 'opponentConnection', seat, connected: false, left: true } }],
    close: CLOSE_CODES.left,
  };
}

/** Any message from a socket already seated as `seat` (hello goes through joinRoom). */
export function roomMessage(room: RoomState, seat: Seat, msg: ClientMessage, entropy: Entropy): RoomResult {
  switch (msg.type) {
    case 'hello':
      return reply(room, 'badMessage', 'already joined');
    case 'throw':
      return handleThrow(room, seat, msg);
    case 'nextEnd':
      return handleNextEnd(room, msg.endNumber);
    case 'rematch':
      return handleRematch(room, seat, entropy);
    case 'leave':
      return handleLeave(room, seat);
    case 'ping':
      return { room, out: [{ to: 'self', msg: { type: 'pong' } }] };
  }
}
