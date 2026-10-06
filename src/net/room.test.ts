import { describe, expect, it } from 'vitest';
import { simulateToRest, type ThrowIntent } from '../engine';
import { chooseThrow } from '../games/petanque/ai';
import { settle } from '../games/petanque/match';
import { defaultConfig } from '../tuning/config';
import { CONFIG_HASH } from './fingerprint';
import { CLOSE_CODES, PROTOCOL_VERSION, type HelloMsg, type Seat, type ServerMessage, type ThrowResultMsg } from './protocol';
import { replayThrowWorld } from './replay';
import { MAX_THROW_SECONDS, createRoomState, joinRoom, roomMessage, seatDisconnected, type Entropy, type RoomResult, type RoomState } from './room';

const CODE = 'K7M9P';
const ENTROPY: Entropy = { seed: 12345, firstTeam: 'B' };
const TOKENS = { a: 'token-aaaaaaaaaaaaaaaa', b: 'token-bbbbbbbbbbbbbbbb', c: 'token-cccccccccccccccc' };

const hello = (clientToken: string, nickname = 'P', over: Partial<HelloMsg> = {}): HelloMsg => ({
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

/** A room where A (Ana) and B (Bob) have joined: the match has started. */
function startedRoom(entropy: Entropy = ENTROPY): RoomState {
  const r1 = joinRoom(createRoomState(CODE, 'quick'), hello(TOKENS.a, 'Ana'), entropy);
  return joinRoom(r1.room, hello(TOKENS.b, 'Bob'), entropy).room;
}

/** Deterministic stand-in for a human: the easy computer player, fed only the PUBLIC state a client sees. */
function intentFor(room: RoomState, seat: Seat, n: number): ThrowIntent {
  const pub = { ...(room.match as NonNullable<RoomState['match']>), seed: 0, rng: 0 };
  return chooseThrow({ state: pub, team: seat, difficulty: 'easy', seed: n }, defaultConfig).intent;
}

describe('room: seats', () => {
  it('first token gets A, second gets B and starts the match', () => {
    const room = createRoomState(CODE, 'standard');
    const r1 = joinRoom(room, hello(TOKENS.a, 'Ana'), ENTROPY);
    expect(r1.seat).toBe('A');
    expect(r1.room.phase).toBe('lobby');
    const welcome = msgs(r1, 'self')[0];
    expect(welcome).toMatchObject({ type: 'welcome', seat: 'A', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH });
    expect(JSON.stringify(r1.out)).not.toContain(TOKENS.a); // tokens never leave the server

    const r2 = joinRoom(r1.room, hello(TOKENS.b, 'Bob'), ENTROPY);
    expect(r2.seat).toBe('B');
    expect(r2.room.phase).toBe('playing');
    expect(types(r2)).toEqual(['self:welcome', 'all:matchStarted']);
    const m = r2.room.match;
    expect(m).toMatchObject({ seed: 12345, phase: 'jack', toThrow: 'B', jackTeam: 'B' });
    expect(m?.rules.pointsToWin).toBe(13);
    const started = msgs(r2, 'all')[0];
    expect(started?.type === 'matchStarted' && started.room.match).toMatchObject({ seed: 0, rng: 0, toThrow: 'B' });
    expect(started?.type === 'matchStarted' && started.room.players).toEqual({
      A: { nickname: 'Ana', connected: true, left: false },
      B: { nickname: 'Bob', connected: true, left: false },
    });
  });

  it('quick rooms play to 7', () => {
    expect(startedRoom().match?.rules.pointsToWin).toBe(7);
  });

  it('a third token is refused with roomFull; the same token reconnects to its seat', () => {
    const room = seatDisconnected(startedRoom(), 'A').room;
    expect(room.seats.A?.connected).toBe(false);

    const full = joinRoom(room, hello(TOKENS.c), ENTROPY);
    expect(full.close).toBe(CLOSE_CODES.roomFull);
    expect(msgs(full)).toEqual([{ type: 'error', code: 'roomFull', fatal: true }]);
    expect(full.room).toBe(room);

    const back = joinRoom(room, hello(TOKENS.a, 'Ana2'), { seed: 999, firstTeam: 'A' });
    expect(back.seat).toBe('A');
    expect(back.room.seats.A).toMatchObject({ connected: true, nickname: 'Ana2' });
    expect(back.room.match).toEqual(room.match); // no new match on reconnect
    expect(types(back)).toEqual(['self:welcome', 'B:opponentConnection']);
  });

  it('disconnect notifies the opponent once', () => {
    const r = seatDisconnected(startedRoom(), 'B');
    expect(msgs(r, 'A')).toEqual([{ type: 'opponentConnection', seat: 'B', connected: false, left: false }]);
    expect(seatDisconnected(r.room, 'B').out).toEqual([]);
  });

  it('version or config mismatch and wrong room code are fatal', () => {
    const room = createRoomState(CODE, 'standard');
    const v = joinRoom(room, hello(TOKENS.a, 'Ana', { protocolVersion: PROTOCOL_VERSION + 1 }), ENTROPY);
    expect(v.close).toBe(CLOSE_CODES.versionMismatch);
    expect(msgs(v)[0]).toMatchObject({ type: 'error', code: 'versionMismatch', fatal: true });
    const c = joinRoom(room, hello(TOKENS.a, 'Ana', { configHash: 'deadbeef' }), ENTROPY);
    expect(c.close).toBe(CLOSE_CODES.versionMismatch);
    const w = joinRoom(room, hello(TOKENS.a, 'Ana', { roomCode: 'ZZZZZ' }), ENTROPY);
    expect(w.close).toBe(CLOSE_CODES.roomNotFound);
  });

  it('leaving the lobby frees the seat; leaving a match keeps it for the same token', () => {
    const lobby = joinRoom(createRoomState(CODE, 'standard'), hello(TOKENS.a), ENTROPY).room;
    const left = roomMessage(lobby, 'A', { type: 'leave' }, ENTROPY);
    expect(left.room.seats.A).toBeNull();
    expect(left.close).toBe(CLOSE_CODES.left);

    const inMatch = roomMessage(startedRoom(), 'A', { type: 'leave' }, ENTROPY);
    expect(inMatch.room.seats.A).toMatchObject({ connected: false, left: true });
    expect(msgs(inMatch, 'B')).toEqual([{ type: 'opponentConnection', seat: 'A', connected: false, left: true }]);
    expect(joinRoom(inMatch.room, hello(TOKENS.c), ENTROPY).close).toBe(CLOSE_CODES.roomFull);
    expect(joinRoom(inMatch.room, hello(TOKENS.a), ENTROPY).room.seats.A).toMatchObject({ connected: true, left: false });
  });
});

describe('room: refereeing', () => {
  it('enforces the turn, the phase and the quoted seq', () => {
    const room = startedRoom(); // B throws the jack first
    const intent: ThrowIntent = { aim: 0, power: 0.55, loft: 'half' };
    expect(msgs(roomMessage(room, 'A', { type: 'throw', seq: room.seq, intent }, ENTROPY))).toEqual([{ type: 'error', code: 'notYourTurn', fatal: false }]);
    expect(msgs(roomMessage(room, 'B', { type: 'throw', seq: room.seq - 1, intent }, ENTROPY))[0]).toMatchObject({ code: 'staleState' });
    const lobby = createRoomState(CODE, 'standard');
    expect(msgs(roomMessage(lobby, 'A', { type: 'throw', seq: 0, intent }, ENTROPY))[0]).toMatchObject({ code: 'wrongPhase' });
    expect(msgs(roomMessage(room, 'A', hello(TOKENS.a), ENTROPY))[0]).toMatchObject({ code: 'badMessage' });
    expect(msgs(roomMessage(room, 'A', { type: 'ping' }, ENTROPY))).toEqual([{ type: 'pong' }]);
  });

  it('a throw is simulated server-side exactly like the local game, and the same seq cannot be replayed', () => {
    const room = startedRoom();
    const intent: ThrowIntent = { aim: 0.01, power: 0.55, loft: 'half' };
    const r = roomMessage(room, 'B', { type: 'throw', seq: room.seq, intent }, ENTROPY);
    const res = msgs(r, 'all')[0] as ThrowResultMsg;
    expect(res.type).toBe('throwResult');
    expect(res.seq).toBe(room.seq + 1);
    expect(res.record).toMatchObject({ id: 'jack', team: 'B', intent });
    expect(res.record.params.yaw).not.toBe(intent.aim); // server noise applied
    expect(res.match).toMatchObject({ seed: 0, rng: 0 });
    expect(r.room.match?.rng).not.toBe(room.match?.rng);

    // A client replays from the state it had + the record and reproduces the server's result.
    const before = { ...(room.match as NonNullable<RoomState['match']>), seed: 0, rng: 0 };
    const world = replayThrowWorld(before, res.record, defaultConfig);
    expect(world).not.toBeNull();
    const sim = simulateToRest(world!, defaultConfig.physics, MAX_THROW_SECONDS);
    expect(sim.world.bodies).toEqual(res.rest);
    expect(settle({ ...before, phase: 'inFlight', throws: [res.record] }, sim.world.bodies, defaultConfig)).toEqual(res.match);

    // Resending the same throw (e.g. after a reconnect) is refused: the seq moved on.
    const again = roomMessage(r.room, 'B', { type: 'throw', seq: room.seq, intent }, ENTROPY);
    expect(msgs(again)[0]).toMatchObject({ code: 'staleState' });
  });

  it('plays a full deterministic match to matchOver, with idempotent nextEnd and a rematch', () => {
    let room = startedRoom({ seed: 4242, firstTeam: 'A' });
    let throwsMade = 0;
    let ends = 0;
    const trace: string[] = [];
    while (room.phase !== 'matchOver' && throwsMade < 400) {
      const m = room.match!;
      if (m.phase === 'endOver') {
        const end = m.endNumber;
        const r = roomMessage(room, 'A', { type: 'nextEnd', endNumber: end }, ENTROPY);
        expect(types(r)).toEqual(['all:endStarted']);
        // The other player taps too (or the message is duplicated): ignored.
        expect(roomMessage(r.room, 'B', { type: 'nextEnd', endNumber: end }, ENTROPY).out).toEqual([]);
        expect(roomMessage(r.room, 'B', { type: 'nextEnd', endNumber: end }, ENTROPY).room).toBe(r.room);
        room = r.room;
        ends++;
        continue;
      }
      const seat = m.toThrow;
      const r = roomMessage(room, seat, { type: 'throw', seq: room.seq, intent: intentFor(room, seat, throwsMade) }, ENTROPY);
      const res = msgs(r)[0] as ThrowResultMsg;
      expect(res.type).toBe('throwResult');
      expect(r.room.seq).toBe(room.seq + 1);
      trace.push(`${res.record.id}:${res.match.score.A}-${res.match.score.B}`);
      room = r.room;
      throwsMade++;
    }
    expect(room.phase).toBe('matchOver');
    const m = room.match!;
    expect(m.phase).toBe('matchOver');
    expect(m.winner).not.toBeNull();
    expect(m.score[m.winner!]).toBeGreaterThanOrEqual(7);
    expect(ends).toBeGreaterThan(0);

    // Determinism: the same inputs give the same match, throw for throw.
    let replay = startedRoom({ seed: 4242, firstTeam: 'A' });
    const trace2: string[] = [];
    for (let n = 0; replay.phase !== 'matchOver'; ) {
      const mm = replay.match!;
      if (mm.phase === 'endOver') {
        replay = roomMessage(replay, 'B', { type: 'nextEnd', endNumber: mm.endNumber }, ENTROPY).room;
        continue;
      }
      const r = roomMessage(replay, mm.toThrow, { type: 'throw', seq: replay.seq, intent: intentFor(replay, mm.toThrow, n++) }, ENTROPY);
      const res = msgs(r)[0] as ThrowResultMsg;
      trace2.push(`${res.record.id}:${res.match.score.A}-${res.match.score.B}`);
      replay = r.room;
    }
    expect(trace2).toEqual(trace);

    // No more throws or ends after the match.
    expect(msgs(roomMessage(room, m.toThrow, { type: 'throw', seq: room.seq, intent: { aim: 0, power: 0.5, loft: 'roll' } }, ENTROPY))[0]).toMatchObject({
      code: 'wrongPhase',
    });
    expect(roomMessage(room, 'A', { type: 'nextEnd', endNumber: m.endNumber }, ENTROPY).out).toEqual([]);

    // Rematch: one vote is announced, the second starts a new match with fresh entropy.
    const v1 = roomMessage(room, 'B', { type: 'rematch' }, ENTROPY);
    expect(types(v1)).toEqual(['all:roomState']);
    expect(v1.room.rematch).toEqual({ A: false, B: true });
    expect(roomMessage(v1.room, 'B', { type: 'rematch' }, ENTROPY).room.phase).toBe('matchOver'); // still waiting for A
    const v2 = roomMessage(v1.room, 'A', { type: 'rematch' }, { seed: 77, firstTeam: 'B' });
    expect(types(v2)).toEqual(['all:matchStarted']);
    expect(v2.room).toMatchObject({ phase: 'playing', matchNumber: 2, rematch: { A: false, B: false } });
    expect(v2.room.match).toMatchObject({ seed: 77, toThrow: 'B', score: { A: 0, B: 0 }, endNumber: 1, phase: 'jack' });
    expect(v2.room.match?.rules.pointsToWin).toBe(7);
    // A late duplicate vote does nothing.
    expect(roomMessage(v2.room, 'B', { type: 'rematch' }, ENTROPY)).toEqual({ room: v2.room, out: [] });
  });

  it('never mutates the input room', () => {
    const room = startedRoom();
    const frozen = JSON.stringify(room);
    roomMessage(room, 'B', { type: 'throw', seq: room.seq, intent: { aim: 0, power: 0.5, loft: 'half' } }, ENTROPY);
    roomMessage(room, 'A', { type: 'leave' }, ENTROPY);
    seatDisconnected(room, 'B');
    expect(JSON.stringify(room)).toBe(frozen);
  });
});
