import { describe, expect, it } from 'vitest';
import { CONFIG_HASH } from './fingerprint';
import { CLOSE_CODES, PROTOCOL_VERSION, type HelloMsg, type ServerMessage } from './protocol';
import {
  createRoomState,
  joinRoom,
  restoreRoom,
  roomAlarm,
  roomDeadline,
  roomMessage,
  roomSnapshot,
  seatDisconnected,
  type Entropy,
  type RoomClock,
  type RoomResult,
  type RoomState,
} from './room';

const CODE = 'K7M9P';
const ENTROPY: Entropy = { seed: 12345, firstTeam: 'B' };
const TOKENS = { a: 'token-aaaaaaaaaaaaaaaa', b: 'token-bbbbbbbbbbbbbbbb' };
const GRACE = 60_000;
const T0 = 5_000_000;
const at = (now: number): RoomClock => ({ now, reconnectGraceMs: GRACE });

const hello = (clientToken: string, nickname: string, over: Partial<HelloMsg> = {}): HelloMsg => ({
  type: 'hello',
  protocolVersion: PROTOCOL_VERSION,
  configHash: CONFIG_HASH,
  roomCode: CODE,
  clientToken,
  nickname,
  ...over,
});
const msgs = (r: RoomResult, to?: string): ServerMessage[] => r.out.filter((o) => to === undefined || o.to === to).map((o) => o.msg);
const types = (r: RoomResult): string[] => r.out.map((o) => `${o.to}:${o.msg.type}`);

/** Ana (A) and Bob (B) are playing (B throws the jack first). */
function playing(): RoomState {
  const r1 = joinRoom(createRoomState(CODE, 'quick'), hello(TOKENS.a, 'Ana'), ENTROPY, at(T0));
  return joinRoom(r1.room, hello(TOKENS.b, 'Bob'), ENTROPY, at(T0)).room;
}
/** Playing, and Ana's connection dropped at T0. */
const anaDropped = (): RoomResult => seatDisconnected(playing(), 'A', at(T0));

describe('room forfeit: reconnect grace', () => {
  it('a drop mid-match tells the opponent the deadline once (no ticking stream)', () => {
    const r = anaDropped();
    expect(types(r)).toEqual(['B:opponentConnection']);
    expect(msgs(r)[0]).toEqual({ type: 'opponentConnection', seat: 'A', connected: false, left: false, graceMs: GRACE });
    expect(r.room.seats.A?.graceUntil).toBe(T0 + GRACE);
    expect(roomDeadline(r.room)).toBe(T0 + GRACE);
    // Anyone who (re)loads the room later sees the time left then.
    expect(roomSnapshot(r.room, T0 + 33_000).players.A?.graceMs).toBe(27_000);
    // Before the deadline the alarm changes nothing.
    expect(roomAlarm(r.room, at(T0 + GRACE - 1))).toEqual({ room: r.room, out: [] });
  });

  it('coming back in time cancels the countdown and the match goes on', () => {
    const back = joinRoom(anaDropped().room, hello(TOKENS.a, 'Ana'), ENTROPY, at(T0 + 30_000));
    expect(back.seat).toBe('A');
    expect(back.room.phase).toBe('playing');
    expect(back.room.seats.A).toMatchObject({ connected: true, graceUntil: null });
    expect(roomDeadline(back.room)).toBeNull();
    expect(msgs(back, 'B')).toEqual([{ type: 'opponentConnection', seat: 'A', connected: true, left: false, graceMs: null }]);
    expect(roomAlarm(back.room, at(T0 + GRACE + 1))).toEqual({ room: back.room, out: [] });
  });

  it('at the deadline the player who stayed wins by forfeit', () => {
    const r = roomAlarm(anaDropped().room, at(T0 + GRACE));
    expect(r.room).toMatchObject({ phase: 'matchOver', outcome: { winner: 'B', reason: 'forfeit' } });
    expect(r.room.match?.phase).toBe('jack'); // the rules state is left as it was
    expect(roomDeadline(r.room)).toBeNull();
    expect(types(r)).toEqual(['all:forfeit']);
    const m = msgs(r)[0];
    expect(m?.type === 'forfeit' && m.room).toMatchObject({ phase: 'matchOver', outcome: { winner: 'B', reason: 'forfeit' } });
    expect(m?.type === 'forfeit' && m.room.players.A).toMatchObject({ connected: false, graceMs: null });
    // No throws and no rematch after a forfeit.
    const thr = roomMessage(r.room, 'B', { type: 'throw', seq: r.room.seq, intent: { aim: 0, power: 0.5, loft: 'half' } }, ENTROPY, at(T0 + GRACE + 1));
    expect(msgs(thr)[0]).toMatchObject({ code: 'wrongPhase' });
    expect(roomMessage(r.room, 'B', { type: 'rematch' }, ENTROPY, at(T0 + GRACE + 1))).toEqual({ room: r.room, out: [] });
  });

  it('a deadline that passed is settled by the next event even if the alarm is late', () => {
    const late = at(T0 + GRACE + 500);
    const thr = roomMessage(anaDropped().room, 'B', { type: 'throw', seq: 1, intent: { aim: 0, power: 0.5, loft: 'half' } }, ENTROPY, late);
    expect(thr.room.outcome).toEqual({ winner: 'B', reason: 'forfeit' });
    expect(types(thr)).toEqual(['all:forfeit', 'self:error']);
  });

  it('Leave mid-match is an immediate forfeit', () => {
    const r = roomMessage(playing(), 'B', { type: 'leave' }, ENTROPY, at(T0 + 1000));
    expect(r.close).toBe(CLOSE_CODES.left);
    expect(r.room).toMatchObject({ phase: 'matchOver', outcome: { winner: 'A', reason: 'forfeit' } });
    expect(r.room.seats.B).toMatchObject({ connected: false, left: true, graceUntil: null });
    expect(types(r)).toEqual(['all:forfeit']);
    // Even while the opponent is away (their countdown is moot then).
    const away = roomMessage(anaDropped().room, 'B', { type: 'leave' }, ENTROPY, at(T0 + 1000));
    expect(away.room).toMatchObject({ phase: 'matchOver', outcome: { winner: 'A', reason: 'forfeit' } });
    expect(roomDeadline(away.room)).toBeNull();
  });

  it('with both players gone nobody wins; whoever returns first gives the other a fresh countdown', () => {
    const both = seatDisconnected(anaDropped().room, 'B', at(T0 + 10_000));
    expect(msgs(both)).toEqual([{ type: 'opponentConnection', seat: 'B', connected: false, left: false, graceMs: null }]); // to Ana's (closed) seat
    expect(both.room.seats.B?.graceUntil).toBeNull();
    expect(both.room.seats.A?.graceUntil).toBe(T0 + GRACE); // Ana's deadline still stands if Bob comes back in time

    const expired = roomAlarm(both.room, at(T0 + GRACE));
    expect(expired.out).toEqual([]);
    expect(expired.room.phase).toBe('playing');
    expect(expired.room.outcome).toBeNull();
    expect(roomDeadline(expired.room)).toBeNull(); // only the idle expiry is left

    const bob = joinRoom(expired.room, hello(TOKENS.b, 'Bob'), ENTROPY, at(T0 + 100_000));
    expect(bob.room.phase).toBe('playing');
    expect(bob.room.seats.A?.graceUntil).toBe(T0 + 100_000 + GRACE);
    const welcome = msgs(bob, 'self')[0];
    expect(welcome?.type === 'welcome' && welcome.room.players.A?.graceMs).toBe(GRACE);
  });

  it('a late rejoin finds the forfeit (and the stayer is told the player is back)', () => {
    const over = roomAlarm(anaDropped().room, at(T0 + GRACE)).room;
    const late = joinRoom(over, hello(TOKENS.a, 'Ana'), ENTROPY, at(T0 + 90_000));
    expect(late.seat).toBe('A');
    expect(late.close).toBeUndefined();
    expect(types(late)).toEqual(['self:welcome', 'B:opponentConnection']);
    const w = msgs(late, 'self')[0];
    expect(w?.type === 'welcome' && w.room).toMatchObject({ phase: 'matchOver', outcome: { winner: 'B', reason: 'forfeit' } });

    // Rejoining just after the deadline, before the alarm ran: same outcome.
    const racing = joinRoom(anaDropped().room, hello(TOKENS.a, 'Ana'), ENTROPY, at(T0 + GRACE + 1));
    expect(racing.room.outcome).toEqual({ winner: 'B', reason: 'forfeit' });
    expect(types(racing)).toEqual(['B:forfeit', 'self:welcome', 'B:opponentConnection']);
  });

  it('a match that starts while a player is away starts their countdown', () => {
    const lobby = joinRoom(createRoomState(CODE, 'quick'), hello(TOKENS.a, 'Ana'), ENTROPY, at(T0)).room;
    const gone = seatDisconnected(lobby, 'A', at(T0));
    expect(gone.room.seats.A?.graceUntil).toBeNull(); // no countdown in the lobby
    const started = joinRoom(gone.room, hello(TOKENS.b, 'Bob'), ENTROPY, at(T0 + 5000));
    expect(started.room.phase).toBe('playing');
    expect(roomDeadline(started.room)).toBe(T0 + 5000 + GRACE);
  });

  it('no countdown after a match ended on the score', () => {
    const over: RoomState = { ...playing(), phase: 'matchOver', outcome: { winner: 'A', reason: 'score' } };
    const r = seatDisconnected(over, 'B', at(T0));
    expect(msgs(r)).toEqual([{ type: 'opponentConnection', seat: 'B', connected: false, left: false, graceMs: null }]);
    expect(roomDeadline(r.room)).toBeNull();
  });

  it('protocol version mismatch is still rejected', () => {
    expect(PROTOCOL_VERSION).toBe(3);
    const v2 = joinRoom(createRoomState(CODE, 'quick'), hello(TOKENS.a, 'Ana', { protocolVersion: 2 }), ENTROPY, at(T0));
    expect(v2.close).toBe(CLOSE_CODES.versionMismatch);
    expect(msgs(v2)[0]).toMatchObject({ type: 'error', code: 'versionMismatch', fatal: true });
  });

  it('never mutates the input room', () => {
    const room = anaDropped().room;
    const frozen = JSON.stringify(room);
    roomAlarm(room, at(T0 + GRACE));
    joinRoom(room, hello(TOKENS.a, 'Ana'), ENTROPY, at(T0 + GRACE + 1));
    roomMessage(room, 'B', { type: 'leave' }, ENTROPY, at(T0));
    expect(JSON.stringify(room)).toBe(frozen);
  });
});

describe('room forfeit: restore after a restart', () => {
  it('a seat without a live socket goes offline; the live opponent gets the countdown', () => {
    const room = playing();
    expect(restoreRoom(room, ['A', 'B'], at(T0))).toEqual({ room, out: [] });
    const r = restoreRoom(room, ['B', null], at(T0 + 1000));
    expect(r.room.seats.A).toMatchObject({ connected: false, graceUntil: T0 + 1000 + GRACE });
    expect(msgs(r, 'B')).toEqual([{ type: 'opponentConnection', seat: 'A', connected: false, left: false, graceMs: GRACE }]);
  });

  it('both gone: no countdown, nobody told', () => {
    const r = restoreRoom(playing(), [], at(T0));
    expect(r.out).toEqual([]);
    expect(r.room.seats.A).toMatchObject({ connected: false, graceUntil: null });
    expect(r.room.seats.B).toMatchObject({ connected: false, graceUntil: null });
    expect(roomDeadline(r.room)).toBeNull();
  });

  it('fills in fields a room stored by the previous protocol lacks', () => {
    const room = playing();
    const old = JSON.parse(JSON.stringify(room)) as Record<string, unknown> & { seats: Record<string, Record<string, unknown>> };
    delete old['outcome'];
    delete old.seats['A']?.['graceUntil'];
    delete old.seats['B']?.['graceUntil'];
    expect(restoreRoom(old as unknown as RoomState, ['A', 'B'], at(T0)).room).toEqual(room);
  });
});
