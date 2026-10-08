import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_TOKEN_KEY, createNetClient, loadClientToken, type SocketLike } from './client';
import { CONFIG_HASH } from './fingerprint';
import { PING_TEXT, PROTOCOL_VERSION, type RoomSnapshot, type ServerMessage } from './protocol';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  recv(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

const snapshot = (over: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code: 'K7M9P',
  phase: 'lobby',
  length: 'standard',
  seq: 0,
  matchNumber: 0,
  players: { A: { nickname: 'Ana', connected: true, left: false, graceMs: null }, B: null },
  match: null,
  rematch: { A: false, B: false },
  outcome: null,
  ...over,
});

describe('net client', () => {
  let sockets: FakeSocket[];
  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
  });
  afterEach(() => vi.useRealTimers());
  const make = (storage = memStorage()) =>
    createNetClient({
      serverUrl: 'https://example.test/',
      storage,
      socketFactory: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
    });

  it('persists one client token per device', () => {
    const st = memStorage();
    const t1 = loadClientToken(st);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(st.m.get(CLIENT_TOKEN_KEY)).toBe(t1);
    expect(loadClientToken(st)).toBe(t1);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadClientToken(broken)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('says hello on open and mirrors the room', () => {
    const st = memStorage();
    const c = make(st);
    c.connect('k7m-9p', 'Ana');
    const s = sockets[0]!;
    expect(s.url).toBe('wss://example.test/rooms/K7M9P/ws');
    s.open();
    expect(JSON.parse(s.sent[0]!)).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      configHash: CONFIG_HASH,
      roomCode: 'K7M9P',
      clientToken: st.m.get(CLIENT_TOKEN_KEY),
      nickname: 'Ana',
    });
    const welcome = vi.fn();
    c.on('welcome', welcome);
    s.recv({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, seat: 'A', room: snapshot() });
    expect(welcome).toHaveBeenCalledOnce();
    expect(c.seat).toBe('A');
    expect(c.status).toBe('open');
    expect(c.sendThrow({ aim: 0, power: 0.5, loft: 'roll' })).toBe(false); // no match yet
    s.recv({ type: 'opponentConnection', seat: 'A', connected: false, left: false, graceMs: null });
    expect(c.room?.players.A?.connected).toBe(false);
  });

  it('turns the reconnect countdown into a local deadline and mirrors a forfeit', () => {
    vi.setSystemTime(1_000_000);
    const c = make();
    c.connect('K7M9P', 'Ana');
    const s = sockets[0]!;
    s.open();
    const bob = { nickname: 'Bob', connected: true, left: false, graceMs: null };
    s.recv({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, seat: 'A', room: snapshot({ phase: 'playing', players: { A: bob, B: bob } }) });
    expect(c.graceDeadline('B')).toBeNull();
    s.recv({ type: 'opponentConnection', seat: 'B', connected: false, left: false, graceMs: 60_000 });
    expect(c.graceDeadline('B')).toBe(1_060_000);
    expect(c.room?.players.B?.graceMs).toBe(60_000);
    s.recv({ type: 'opponentConnection', seat: 'B', connected: true, left: false, graceMs: null });
    expect(c.graceDeadline('B')).toBeNull();

    const forfeits = vi.fn();
    c.on('forfeit', forfeits);
    const over = snapshot({ phase: 'matchOver', players: { A: bob, B: { ...bob, connected: false } }, outcome: { winner: 'A', reason: 'forfeit' } });
    s.recv({ type: 'forfeit', room: over });
    expect(forfeits).toHaveBeenCalledOnce();
    expect(c.room).toEqual(over);
    // A (re)joining snapshot carries the time left then.
    vi.setSystemTime(2_000_000);
    s.recv({ type: 'roomState', room: snapshot({ phase: 'playing', players: { A: bob, B: { ...bob, connected: false, graceMs: 27_000 } } }) });
    expect(c.graceDeadline('B')).toBe(2_027_000);
  });

  it('keeps the connection alive with the exact ping text', () => {
    const c = make();
    c.connect('K7M9P', 'Ana');
    sockets[0]!.open();
    vi.advanceTimersByTime(15_000);
    expect(sockets[0]!.sent.at(-1)).toBe(PING_TEXT);
    // Silence for too long (no pong, nothing): the socket is replaced.
    vi.advanceTimersByTime(30_000);
    expect(sockets[0]!.closed).toBe(true);
    expect(c.status).toBe('reconnecting');
  });

  it('reconnects with backoff after a network drop, but never after a fatal close', () => {
    const c = make();
    const statuses: string[] = [];
    c.on('status', (e) => statuses.push(e.status));
    c.connect('K7M9P', 'Ana');
    sockets[0]!.open();
    sockets[0]!.drop(1006);
    expect(c.status).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(JSON.parse(sockets[1]!.sent[0]!).type).toBe('hello');
    sockets[1]!.recv({ type: 'error', code: 'roomFull', fatal: true });
    sockets[1]!.drop(4409);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
    expect(c.status).toBe('closed');
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'reconnecting', 'open', 'closed']);
  });

  it('quotes the mirrored seq and reports the state a throw was made from', () => {
    const c = make();
    c.connect('K7M9P', 'Ana');
    const s = sockets[0]!;
    s.open();
    const match = { phase: 'jack', endNumber: 1 } as unknown as NonNullable<RoomSnapshot['match']>;
    s.recv({ type: 'matchStarted', room: snapshot({ phase: 'playing', seq: 1, match }) });
    expect(c.sendThrow({ aim: 0.1, power: 0.5, loft: 'half' })).toBe(true);
    expect(JSON.parse(s.sent.at(-1)!)).toEqual({ type: 'throw', seq: 1, intent: { aim: 0.1, power: 0.5, loft: 'half' } });
    const results: unknown[] = [];
    c.on('throwResult', (r) => results.push(r.before));
    const after = { phase: 'boule', endNumber: 1 } as unknown as NonNullable<RoomSnapshot['match']>;
    const record = { id: 'jack', team: 'A' as const, intent: { aim: 0.1, power: 0.5, loft: 'half' as const }, params: { yaw: 0, pitch: 0, speed: 1, origin: { x: 0, y: 0, z: 0 } } };
    s.recv({ type: 'throwResult', seq: 2, record, rest: [], match: after });
    s.recv({ type: 'throwResult', seq: 4, record, rest: [], match: after }); // missed seq 3
    expect(results).toEqual([match, null]);
    expect(c.room?.seq).toBe(4);
  });
});
