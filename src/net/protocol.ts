/**
 * Online "play a friend" wire protocol, shared by the browser client and the
 * Cloudflare Worker. Pure TS: JSON-serializable message types plus
 * validation of everything a client may send (the server trusts nothing).
 *
 * Flow: the client opens a WebSocket to /rooms/<CODE>/ws and sends `hello`.
 * The server answers `welcome` (seat + room snapshot) or a fatal `error`
 * and closes. When the second seat is taken the server sends `matchStarted`.
 * The player to throw sends `throw`; the server (the referee) draws the
 * noise, simulates to rest with the default config and broadcasts
 * `throwResult`. Either player may send `nextEnd` after an end; both send
 * `rematch` after the match. Keepalive is the exact text PING_TEXT, answered
 * with PONG_TEXT (handled by the runtime without waking the room).
 *
 * Bump PROTOCOL_VERSION whenever a message shape OR the behaviour of the
 * engine/rules changes (the config fingerprint only covers config numbers).
 */
import type { Body, Loft, ThrowIntent } from '../engine';
import type { MatchState, TeamId, ThrowRecord } from '../games/petanque/matchTypes';
import type { MatchLength } from '../games/petanque/matchLength';

export const PROTOCOL_VERSION = 2;

/** Room codes: 5 chars from an alphabet without 0/O, 1/I/L (31^5 ≈ 28.6 M codes). */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;

/** Validation limits for client messages (shared so the client can pre-check). */
export const PROTOCOL_LIMITS = {
  /** Longest accepted client message (UTF-16 code units of the raw JSON text). */
  maxClientMessageChars: 1024,
  nicknameMaxChars: 20,
  tokenMinChars: 16,
  tokenMaxChars: 64,
  /** |aim| above this (rad) is rejected; the controls never go near it. */
  maxAimRad: Math.PI / 3,
  /** Sequence / end numbers above this are rejected as nonsense. */
  maxCounter: 1_000_000,
} as const;

/** Exact keepalive texts (the server auto-responds without waking the room). */
export const PING_TEXT = '{"type":"ping"}';
export const PONG_TEXT = '{"type":"pong"}';

/** WebSocket close codes used by the server. The client must NOT auto-reconnect after these. */
export const CLOSE_CODES = {
  /** Another connection took over this seat (second tab / device with the same token). */
  replaced: 4001,
  /** The player sent `leave`. */
  left: 4002,
  badMessage: 4400,
  roomNotFound: 4404,
  roomFull: 4409,
  roomExpired: 4410,
  versionMismatch: 4426,
  rateLimited: 4429,
} as const;
export const FATAL_CLOSE_CODES: readonly number[] = Object.values(CLOSE_CODES);

// ---- shared data ---------------------------------------------------------------

export type Seat = TeamId;
export const SEATS: readonly Seat[] = ['A', 'B'];
export type RoomPhase = 'lobby' | 'playing' | 'matchOver';
export const LOFTS: readonly Loft[] = ['roll', 'half', 'lob', 'shoot'];

export interface PlayerInfo {
  nickname: string;
  connected: boolean;
  /** The player sent `leave` (they may still come back with the same token). */
  left: boolean;
}

/**
 * MatchState as sent to clients: `seed` and `rng` are zeroed so nobody can
 * predict the next throw's noise. Everything else is the authoritative state.
 */
export type PublicMatchState = MatchState;

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  length: MatchLength;
  /** Match revision: +1 on matchStarted, throwResult and endStarted. A `throw` must quote it. */
  seq: number;
  /** 0 before the first match; +1 per match (rematches). */
  matchNumber: number;
  players: Record<Seat, PlayerInfo | null>;
  match: PublicMatchState | null;
  /** Rematch votes (meaningful in 'matchOver'). */
  rematch: Record<Seat, boolean>;
}

// ---- client -> server -------------------------------------------------------------

export interface HelloMsg {
  type: 'hello';
  protocolVersion: number;
  /** configFingerprint(defaultConfig) of the client's build. */
  configHash: string;
  roomCode: string;
  /** Random per-device id (localStorage); the same token gets the same seat back. */
  clientToken: string;
  nickname: string;
}
export interface ThrowMsg {
  type: 'throw';
  /** The room `seq` the client saw; a mismatch is rejected (no double throws on resend). */
  seq: number;
  intent: ThrowIntent;
}
export interface NextEndMsg {
  type: 'nextEnd';
  /** The end that just finished; stale/duplicate requests are ignored. */
  endNumber: number;
}
export interface RematchMsg {
  type: 'rematch';
}
export interface LeaveMsg {
  type: 'leave';
}
export interface PingMsg {
  type: 'ping';
}
export type ClientMessage = HelloMsg | ThrowMsg | NextEndMsg | RematchMsg | LeaveMsg | PingMsg;

// ---- server -> client -------------------------------------------------------------

export interface WelcomeMsg {
  type: 'welcome';
  protocolVersion: number;
  configHash: string;
  seat: Seat;
  room: RoomSnapshot;
}
/** Lobby / players / rematch votes changed. */
export interface RoomStateMsg {
  type: 'roomState';
  room: RoomSnapshot;
}
/** A (re)match began: `room.match` is the fresh state (phase 'jack'). */
export interface MatchStartedMsg {
  type: 'matchStarted';
  room: RoomSnapshot;
}
/**
 * A throw was refereed. To animate: build the launch World from the match
 * state the client held before (seq - 1) and `record.params`
 * (see replay.ts), play it back locally, then snap to `rest` / `match`.
 */
export interface ThrowResultMsg {
  type: 'throwResult';
  seq: number;
  /** Who threw what, with the ACTUAL launch params (noise included). */
  record: ThrowRecord;
  /** Server's simulated resting bodies, before the rules (an invalid jack is still here). */
  rest: Body[];
  /** Match state after `settle` (authoritative; seed/rng zeroed). */
  match: PublicMatchState;
}
export interface EndStartedMsg {
  type: 'endStarted';
  seq: number;
  match: PublicMatchState;
}
export interface OpponentConnectionMsg {
  type: 'opponentConnection';
  seat: Seat;
  connected: boolean;
  left: boolean;
}
export type ErrorCode =
  | 'roomNotFound'
  | 'roomFull'
  | 'roomExpired'
  | 'versionMismatch'
  | 'notJoined'
  | 'notYourTurn'
  | 'wrongPhase'
  | 'staleState'
  | 'badMessage'
  | 'tooLarge'
  | 'rateLimited'
  | 'serverError';
export interface ErrorMsg {
  type: 'error';
  code: ErrorCode;
  /** The server closes the socket after a fatal error (do not auto-reconnect). */
  fatal: boolean;
  detail?: string;
}
export interface PongMsg {
  type: 'pong';
}
export type ServerMessage =
  | WelcomeMsg
  | RoomStateMsg
  | MatchStartedMsg
  | ThrowResultMsg
  | EndStartedMsg
  | OpponentConnectionMsg
  | ErrorMsg
  | PongMsg;

const SERVER_TYPES: readonly ServerMessage['type'][] = [
  'welcome',
  'roomState',
  'matchStarted',
  'throwResult',
  'endStarted',
  'opponentConnection',
  'error',
  'pong',
];

// ---- validation ---------------------------------------------------------------------

export type Parsed<T> = { ok: true; msg: T } | { ok: false; code: 'badMessage' | 'tooLarge'; detail: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Upper-cases, strips spaces/dashes; null unless it is a well-formed room code. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Collapses whitespace runs to one space, drops control/format characters, trims; null when empty or too long. */
export function cleanNickname(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > PROTOCOL_LIMITS.nicknameMaxChars * 4) return null;
  const s = input
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  const chars = [...s].length;
  return chars >= 1 && chars <= PROTOCOL_LIMITS.nicknameMaxChars ? s : null;
}

export const isValidToken = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length >= PROTOCOL_LIMITS.tokenMinChars &&
  v.length <= PROTOCOL_LIMITS.tokenMaxChars &&
  /^[A-Za-z0-9_-]+$/.test(v);

/** A clean ThrowIntent (fresh object) or null when out of range / malformed. */
export function parseIntent(v: unknown): ThrowIntent | null {
  if (!isObj(v)) return null;
  const { aim, power, loft } = v;
  if (!isNum(aim, -PROTOCOL_LIMITS.maxAimRad, PROTOCOL_LIMITS.maxAimRad)) return null;
  if (!isNum(power, 0, 1)) return null;
  if (typeof loft !== 'string' || !(LOFTS as readonly string[]).includes(loft)) return null;
  return { aim, power, loft: loft as Loft };
}

const bad = (detail: string): Parsed<never> => ({ ok: false, code: 'badMessage', detail });

/**
 * Parses and range-checks one raw client message. Returns a fresh object with
 * only the known fields (extra fields are dropped). Rejects non-strings,
 * oversized text, invalid JSON, unknown types, NaN/Infinity/huge numbers.
 */
export function parseClientMessage(raw: unknown): Parsed<ClientMessage> {
  if (typeof raw !== 'string') return bad('expected a text frame');
  if (raw.length > PROTOCOL_LIMITS.maxClientMessageChars) return { ok: false, code: 'tooLarge', detail: `max ${PROTOCOL_LIMITS.maxClientMessageChars} chars` };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return bad('invalid JSON');
  }
  if (!isObj(v) || typeof v['type'] !== 'string') return bad('missing type');
  switch (v['type']) {
    case 'hello': {
      const roomCode = normalizeRoomCode(v['roomCode']);
      const nickname = cleanNickname(v['nickname']);
      const { protocolVersion, configHash, clientToken } = v;
      if (!isInt(protocolVersion, 0, PROTOCOL_LIMITS.maxCounter)) return bad('protocolVersion');
      if (typeof configHash !== 'string' || configHash.length > 32) return bad('configHash');
      if (!roomCode) return bad('roomCode');
      if (!isValidToken(clientToken)) return bad('clientToken');
      if (!nickname) return bad('nickname');
      return { ok: true, msg: { type: 'hello', protocolVersion, configHash, roomCode, clientToken, nickname } };
    }
    case 'throw': {
      const intent = parseIntent(v['intent']);
      const seq = v['seq'];
      if (!isInt(seq, 0, PROTOCOL_LIMITS.maxCounter)) return bad('seq');
      if (!intent) return bad('intent');
      return { ok: true, msg: { type: 'throw', seq, intent } };
    }
    case 'nextEnd': {
      const endNumber = v['endNumber'];
      if (!isInt(endNumber, 1, PROTOCOL_LIMITS.maxCounter)) return bad('endNumber');
      return { ok: true, msg: { type: 'nextEnd', endNumber } };
    }
    case 'rematch':
    case 'leave':
    case 'ping':
      return { ok: true, msg: { type: v['type'] } };
    default:
      return bad('unknown type');
  }
}

/**
 * Light check of a server message on the client (the server is trusted; this
 * only guards against garbage, e.g. a proxy error page).
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || typeof v['type'] !== 'string') return null;
    return (SERVER_TYPES as readonly string[]).includes(v['type']) ? (v as unknown as ServerMessage) : null;
  } catch {
    return null;
  }
}

/** Serializes a message for the wire. */
export const encode = (msg: ClientMessage | ServerMessage): string => JSON.stringify(msg);
