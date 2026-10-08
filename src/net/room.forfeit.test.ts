import { describe, expect, it } from 'vitest';
import { CONFIG_HASH } from './fingerprint';
import { CLOSE_CODES, PROTOCOL_VERSION, type HelloMsg, type ServerMessage } from './protocol';
import {
  createRoomState,
  isAbandoned,
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

  it('with both players gone nobody wins by forfeit; whoever returns in time gives the other a fresh countdown', () => {
    const both = seatDisconnected(anaDropped().room, 'B', at(T0 + 10_000));
    expect(msgs(both)).toEqual([{ type: 'opponentConnection', seat: 'B', connected: false, left: false, graceMs: null }]); // to Ana's (closed) seat
    expect(both.room.seats.B?.graceUntil).toBeNull();
    expect(both.room.seats.A?.graceUntil).toBe(T0 + GRACE); // Ana's deadline still stands if Bob comes back in time

    const expired = roomAlarm(both.room, at(T0 + GRACE));
    expect(expired.out).toEqual([]);
    expect(expired.room.phase).toBe('playing');
    expect(expired.room.outcome).toBeNull();
    expect(expired.room.seats.A?.graceUntil).toBeNull();
    expect(expired.abandoned).toBeUndefined();
    expect(roomDeadline(expired.room)).toBe(T0 + 10_000 + GRACE); // the abandon deadline is what is left

    const bob = joinRoom(expired.room, hello(TOKENS.b, 'Bob'), ENTROPY, at(T0 + 65_000));
    expect(bob.room.phase).toBe('playing');
    expect(bob.room.abandonAt).toBeNull();
    expect(bob.room.seats.A?.graceUntil).toBe(T0 + 65_000 + GRACE);
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
    expect(r.room.abandonAt).toBe(T0 + GRACE); // but the abandon countdown starts
    expect(roomDeadline(r.room)).toBe(T0 + GRACE);
  });

  it('a room stored by an older server with both seats away gets the abandon countdown', () => {
    const room = playing();
    const gone = JSON.parse(JSON.stringify({ ...room, seats: { A: { ...room.seats.A, connected: false }, B: { ...room.seats.B, connected: false } } })) as Record<string, unknown>;
    delete gone['abandonAt'];
    const r = restoreRoom(gone as unknown as RoomState, [], at(T0 + 500));
    expect(r.room.abandonAt).toBe(T0 + 500 + GRACE);
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

describe('room abandonment: both players away', () => {
  /** Ana dropped at T0, Bob at T0 + 10 s: abandoned at T0 + 70 s. */
  const bothAway = (): RoomState => seatDisconnected(anaDropped().room, 'B', at(T0 + 10_000)).room;
  const DEADLINE = T0 + 10_000 + GRACE;

  it('starts when the second player is gone and is the room deadline', () => {
    const room = bothAway();
    expect(room.abandonAt).toBe(DEADLINE);
    expect(roomDeadline(room)).toBe(T0 + GRACE); // Ana's own (moot) countdown is earlier
    expect(isAbandoned(room, DEADLINE - 1)).toBe(false);
    expect(isAbandoned(room, DEADLINE)).toBe(true);
    const settled = roomAlarm(room, at(T0 + GRACE)).room;
    expect(roomDeadline(settled)).toBe(DEADLINE);
    expect(roomAlarm(settled, at(DEADLINE - 1))).toEqual({ room: settled, out: [] });
  });

  it('at the deadline the alarm reports the match abandoned (nobody wins, no forfeit message)', () => {
    const r = roomAlarm(bothAway(), at(DEADLINE));
    expect(r.abandoned).toBe(true);
    expect(r.out).toEqual([]);
    expect(r.room.outcome).toBeNull();
  });

  it('a rejoin after abandonment gets roomExpired and the room is flagged for deletion', () => {
    for (const token of [TOKENS.a, TOKENS.b, 'token-cccccccccccccccc']) {
      const r = joinRoom(bothAway(), hello(token, 'X'), ENTROPY, at(DEADLINE + 1000));
      expect(r.abandoned).toBe(true);
      expect(r.seat).toBeUndefined();
      expect(r.close).toBe(CLOSE_CODES.roomExpired);
      expect(msgs(r)[0]).toMatchObject({ type: 'error', code: 'roomExpired', fatal: true });
    }
    // A late message or disconnect settles it too.
    expect(roomMessage(bothAway(), 'A', { type: 'ping' }, ENTROPY, at(DEADLINE)).abandoned).toBe(true);
    expect(seatDisconnected(bothAway(), 'A', at(DEADLINE)).abandoned).toBe(true);
  });

  it('a rejoin in time cancels it and the other player gets a fresh forfeit countdown', () => {
    const back = joinRoom(bothAway(), hello(TOKENS.b, 'Bob'), ENTROPY, at(DEADLINE - 1));
    expect(back.abandoned).toBeUndefined();
    expect(back.room.phase).toBe('playing');
    expect(back.room.abandonAt).toBeNull();
    expect(back.room.seats.A?.graceUntil).toBe(DEADLINE - 1 + GRACE);
    expect(roomDeadline(back.room)).toBe(DEADLINE - 1 + GRACE);
  });

  it('with one player staying it is the forfeit, never an abandonment', () => {
    const room = anaDropped().room;
    expect(room.abandonAt).toBeNull();
    const r = roomAlarm(room, at(T0 + 10 * GRACE));
    expect(r.abandoned).toBeUndefined();
    expect(r.room.outcome).toEqual({ winner: 'B', reason: 'forfeit' });
  });

  it('Leave while the other is away ends the match for good (forfeit) and stops the abandon countdown', () => {
    const away = anaDropped().room;
    const left = roomMessage(away, 'B', { type: 'leave' }, ENTROPY, at(T0 + 1000));
    expect(left.room.abandonAt).toBeNull();
    expect(roomDeadline(left.room)).toBeNull();
  });

  it('never applies in the lobby or after the match', () => {
    const lobby = joinRoom(createRoomState(CODE, 'quick'), hello(TOKENS.a, 'Ana'), ENTROPY, at(T0)).room;
    const gone = seatDisconnected(lobby, 'A', at(T0)).room;
    expect(gone.abandonAt).toBeNull();
    expect(roomDeadline(gone)).toBeNull();
    const over: RoomState = { ...playing(), phase: 'matchOver', outcome: { winner: 'A', reason: 'score' } };
    const both = seatDisconnected(seatDisconnected(over, 'A', at(T0)).room, 'B', at(T0)).room;
    expect(both.abandonAt).toBeNull();
    expect(roomAlarm(both, at(T0 + 10 * GRACE))).toEqual({ room: both, out: [] });
  });

  it('never mutates the input room', () => {
    const room = bothAway();
    const frozen = JSON.stringify(room);
    roomAlarm(room, at(DEADLINE));
    joinRoom(room, hello(TOKENS.a, 'Ana'), ENTROPY, at(DEADLINE + 1));
    expect(JSON.stringify(room)).toBe(frozen);
  });
});
