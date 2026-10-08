import { describe, expect, it } from 'vitest';
import { createMatch, type MatchState } from '../../games/petanque';
import { defaultConfig } from '../../tuning';
import type { RoomSnapshot } from '../../net';
import {
  canAimOnline,
  connectionNotice,
  forfeitView,
  formatCountdown,
  opponentsTurn,
  otherSeat,
  rejoinDecision,
  seatNames,
  stripRoomParam,
  throwAction,
  type AimCheck,
} from './rules';

const state = (over: Partial<MatchState> = {}): MatchState => ({ ...createMatch(1, defaultConfig), ...over });
const ok: AimCheck = { status: 'open', seat: 'A', roomSeq: 3, shownSeq: 3, state: state({ phase: 'boule', toThrow: 'A' }), pending: false, queued: 0, busy: false, opponentLeft: false, over: false };

describe('canAimOnline', () => {
  it('lets you aim on your own turn when everything is caught up', () => {
    expect(canAimOnline(ok)).toBe(true);
    expect(canAimOnline({ ...ok, state: state({ phase: 'jack', toThrow: 'A' }) })).toBe(true);
  });
  it('blocks every other case', () => {
    expect(canAimOnline({ ...ok, state: state({ phase: 'boule', toThrow: 'B' }) })).toBe(false);
    expect(canAimOnline({ ...ok, state: state({ phase: 'endOver', toThrow: 'A' }) })).toBe(false);
    expect(canAimOnline({ ...ok, status: 'reconnecting' })).toBe(false);
    expect(canAimOnline({ ...ok, seat: null })).toBe(false);
    expect(canAimOnline({ ...ok, pending: true })).toBe(false);
    expect(canAimOnline({ ...ok, queued: 1 })).toBe(false);
    expect(canAimOnline({ ...ok, busy: true })).toBe(false);
    expect(canAimOnline({ ...ok, opponentLeft: true })).toBe(false);
    expect(canAimOnline({ ...ok, over: true })).toBe(false); // e.g. a forfeit: the rules state alone still allows a throw
    expect(canAimOnline({ ...ok, roomSeq: 4 })).toBe(false); // the screen lags the server
  });
});

describe('opponentsTurn', () => {
  it('is true while the other seat aims or their throw flies', () => {
    expect(opponentsTurn(state({ phase: 'boule', toThrow: 'B' }), 'A')).toBe(true);
    expect(opponentsTurn(state({ phase: 'jack', toThrow: 'B' }), 'A')).toBe(true);
    expect(opponentsTurn(state({ phase: 'inFlight', toThrow: 'B' }), 'A')).toBe(true);
  });
  it('is false on our turn, between ends and before we have a seat', () => {
    expect(opponentsTurn(state({ phase: 'boule', toThrow: 'A' }), 'A')).toBe(false);
    expect(opponentsTurn(state({ phase: 'inFlight', toThrow: 'A' }), 'A')).toBe(false);
    expect(opponentsTurn(state({ phase: 'endOver', toThrow: 'B' }), 'A')).toBe(false);
    expect(opponentsTurn(state({ phase: 'boule', toThrow: 'B' }), null)).toBe(false);
  });
});

describe('throwAction', () => {
  it('animates the next step, snaps after a gap, skips what is shown', () => {
    expect(throwAction(4, 3, true)).toBe('animate');
    expect(throwAction(4, 3, false)).toBe('snap');
    expect(throwAction(6, 3, true)).toBe('snap');
    expect(throwAction(3, 3, true)).toBe('skip');
    expect(throwAction(2, 3, true)).toBe('skip');
  });
});

describe('connectionNotice', () => {
  const p = (connected: boolean, left = false) => ({ nickname: 'Bo', connected, left, graceMs: null });
  it('puts our own connection first', () => {
    expect(connectionNotice('reconnecting', p(false))).toBe('reconnecting');
    expect(connectionNotice('connecting', null)).toBe('reconnecting');
  });
  it('tells about the opponent', () => {
    expect(connectionNotice('open', p(true))).toBeNull();
    expect(connectionNotice('open', p(false))).toBe('opponentLost');
    expect(connectionNotice('open', p(false, true))).toBe('opponentLeft');
    expect(connectionNotice('open', null)).toBeNull();
    expect(connectionNotice('closed', p(false))).toBeNull();
  });
});

describe('reconnect countdown and forfeit', () => {
  it('formats the time left as m:ss, rounded up', () => {
    expect(formatCountdown(60_000)).toBe('1:00');
    expect(formatCountdown(59_001)).toBe('1:00');
    expect(formatCountdown(27_000)).toBe('0:27');
    expect(formatCountdown(26_100)).toBe('0:27');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-500)).toBe('0:00');
  });
  it('tells the winner from the player who left', () => {
    const room = (over: Partial<RoomSnapshot>): RoomSnapshot => ({
      code: 'K7M9P',
      phase: 'matchOver',
      length: 'quick',
      seq: 3,
      matchNumber: 1,
      players: { A: null, B: null },
      match: null,
      rematch: { A: false, B: false },
      outcome: { winner: 'B', reason: 'forfeit' },
      ...over,
    });
    expect(forfeitView(room({}), 'B')).toBe('won');
    expect(forfeitView(room({}), 'A')).toBe('lost');
    expect(forfeitView(room({ outcome: { winner: 'B', reason: 'score' } }), 'A')).toBeNull();
    expect(forfeitView(room({ phase: 'playing', outcome: null }), 'A')).toBeNull();
    expect(forfeitView(null, 'A')).toBeNull();
    expect(forfeitView(room({}), null)).toBeNull();
  });
});

describe('seats and names', () => {
  it('maps nicknames by seat with a fallback', () => {
    expect(otherSeat('A')).toBe('B');
    expect(seatNames({ A: { nickname: 'Ana', connected: true, left: false, graceMs: null }, B: null }, (s) => `?${s}`)).toEqual({ A: 'Ana', B: '?B' });
    expect(seatNames(undefined, () => 'Friend')).toEqual({ A: 'Friend', B: 'Friend' });
  });
});

describe('rejoinDecision', () => {
  const active = { code: 'K7M9P', nickname: 'Ana', opponent: 'Bo' };
  const info = (phase: 'lobby' | 'playing' | 'matchOver') => ({ code: 'K7M9P', phase, length: 'quick' as const, players: 2 });
  it('offers a live room, forgets a finished or gone one, waits when unreachable', () => {
    expect(rejoinDecision(active, info('playing'))).toBe('offer');
    expect(rejoinDecision(active, info('lobby'))).toBe('offer');
    expect(rejoinDecision(active, info('matchOver'))).toBe('forget');
    expect(rejoinDecision(active, null)).toBe('forget');
    expect(rejoinDecision(active, 'unreachable')).toBe('none');
    expect(rejoinDecision(null, info('playing'))).toBe('none');
  });
});

describe('stripRoomParam', () => {
  it('drops only the invite code', () => {
    expect(stripRoomParam('https://petanque.amunozo.com/?room=K7M9P')).toBe('https://petanque.amunozo.com/');
    expect(stripRoomParam('https://petanque.amunozo.com/?room=K7M9P&online=1')).toBe('https://petanque.amunozo.com/?online=1');
    expect(stripRoomParam('http://localhost:4180/?dev=1&room=K7M9P&lang=fr#x')).toBe('http://localhost:4180/?dev=1&lang=fr#x');
  });
});
