/**
 * Browser transport for "play a friend": room creation over HTTP and a
 * self-healing WebSocket to the room. Uses only fetch / WebSocket /
 * setTimeout (+ localStorage for the device token). No three.js, no UI: the
 * screens subscribe with `on(...)` and call the send helpers.
 *
 * It mirrors the room snapshot from the server messages (`room`), so `sendThrow`
 * quotes the right `seq`, and each `throwResult` event carries `before` — the
 * match state to replay the throw from (null when the client missed a step:
 * then just snap to the result).
 *
 * Server URL: VITE_SERVER_URL at build time (e.g. https://petanque-server.<account>.workers.dev);
 * dev builds default to the local `wrangler dev` (http://localhost:8787).
 */
import type { ThrowIntent } from '../engine';
import type { MatchLength } from '../games/petanque/matchLength';
import { CONFIG_HASH } from './fingerprint';
import {
  FATAL_CLOSE_CODES,
  PING_TEXT,
  PROTOCOL_VERSION,
  encode,
  normalizeRoomCode,
  parseServerMessage,
  type ClientMessage,
  type EndStartedMsg,
  type ErrorMsg,
  type MatchStartedMsg,
  type OpponentConnectionMsg,
  type PublicMatchState,
  type RoomSnapshot,
  type RoomStateMsg,
  type Seat,
  type ServerMessage,
  type ThrowResultMsg,
  type WelcomeMsg,
} from './protocol';

/** The deployed Cloudflare Worker; used when no VITE_SERVER_URL is baked into the build (see server/README.md). */
export const PROD_SERVER_URL = 'https://petanque-server.amunozo-gamedev.workers.dev';
export const DEV_SERVER_URL = 'http://localhost:8787';
export const CLIENT_TOKEN_KEY = 'petanque.clientToken';

/** Transport timing (not game feel). */
export const NET_CLIENT_CONFIG = {
  reconnectBaseMs: 500,
  reconnectMaxMs: 15_000,
  /** Keepalive ping period; also how often a silent connection is checked. */
  pingIntervalMs: 15_000,
  /** No message at all for this long -> the socket is considered dead and replaced. */
  deadAfterMs: 35_000,
  httpTimeoutMs: 10_000,
};

/** VITE_SERVER_URL baked into this build, or null when none was configured (online play is then hidden from players). */
export function configuredServerUrl(): string | null {
  const configured = (import.meta.env as Record<string, unknown>)['VITE_SERVER_URL'];
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim().replace(/\/+$/, '') : null;
}

export function defaultServerUrl(): string {
  return configuredServerUrl() ?? ((import.meta.env as Record<string, unknown>)['DEV'] === true ? DEV_SERVER_URL : PROD_SERVER_URL);
}

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface NetEvents {
  status: { status: NetStatus; closeCode?: number };
  welcome: WelcomeMsg;
  roomState: RoomStateMsg;
  matchStarted: MatchStartedMsg;
  /** `before` = the match state the throw was made from (null if this client missed a step). */
  throwResult: ThrowResultMsg & { before: PublicMatchState | null };
  endStarted: EndStartedMsg;
  opponentConnection: OpponentConnectionMsg;
  error: ErrorMsg;
}
export type NetEventName = keyof NetEvents;

export interface RoomInfo {
  code: string;
  phase: RoomSnapshot['phase'];
  length: MatchLength;
  /** Seats taken (0..2). */
  players: number;
}

/** The minimal WebSocket surface used (lets tests inject a fake). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

export interface NetClientOptions {
  serverUrl?: string;
  socketFactory?: SocketFactory;
  fetchImpl?: typeof fetch;
  /** Token storage; defaults to localStorage (failures fall back to memory). */
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  config?: Partial<typeof NET_CLIENT_CONFIG>;
}

export interface NetClient {
  /** POST /rooms -> the new room code. Throws on network/server errors. */
  createRoom(length?: MatchLength): Promise<string>;
  /** GET /rooms/:code -> lobby info, or null when the room does not exist. */
  roomInfo(code: string): Promise<RoomInfo | null>;
  /** Opens (and keeps open) the room socket; the first message is `hello`. */
  connect(code: string, nickname: string): void;
  /** Sends a throw for the current turn (false when not connected / no match). */
  sendThrow(intent: ThrowIntent): boolean;
  /** Asks for the next end after the current one finished (idempotent server side). */
  sendNextEnd(): boolean;
  sendRematch(): boolean;
  /** Tells the server we leave, then closes for good. */
  leave(): void;
  /** Closes without leaving (the seat is kept; connect() again to resume). */
  disconnect(): void;
  /** Reconnect right away if waiting on backoff (call on `online` / `visibilitychange`). */
  reconnectNow(): void;
  on<K extends NetEventName>(name: K, cb: (ev: NetEvents[K]) => void): () => void;
  readonly status: NetStatus;
  readonly seat: Seat | null;
  readonly room: RoomSnapshot | null;
  readonly code: string | null;
  readonly clientToken: string;
}

const OPEN = 1;

function randomToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The device's persistent client token (created on first use). */
export function loadClientToken(storage: NetClientOptions['storage']): string {
  try {
    const saved = storage?.getItem(CLIENT_TOKEN_KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  } catch {
    // storage blocked: fall through to a fresh in-memory token
  }
  const token = randomToken();
  try {
    storage?.setItem(CLIENT_TOKEN_KEY, token);
  } catch {
    // private mode etc.: the token lives for this page only
  }
  return token;
}

function defaultStorage(): NetClientOptions['storage'] {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function createNetClient(opts: NetClientOptions = {}): NetClient {
  const cfg = { ...NET_CLIENT_CONFIG, ...opts.config };
  const base = (opts.serverUrl ?? defaultServerUrl()).replace(/\/+$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  const socketFactory: SocketFactory = opts.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const clientToken = loadClientToken(opts.storage === undefined ? defaultStorage() : opts.storage);

  type AnyListener = (ev: never) => void;
  const listeners = new Map<NetEventName, Set<AnyListener>>();
  let status: NetStatus = 'idle';
  let ws: SocketLike | null = null;
  let code: string | null = null;
  let nickname = '';
  let seat: Seat | null = null;
  let room: RoomSnapshot | null = null;
  let attempts = 0;
  let wanted = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHeard = 0;

  function emit<K extends NetEventName>(name: K, ev: NetEvents[K]): void {
    const set = listeners.get(name) as Set<(ev: NetEvents[K]) => void> | undefined;
    if (set) for (const cb of [...set]) cb(ev);
  }
  function setStatus(s: NetStatus, closeCode?: number): void {
    status = s;
    emit('status', closeCode === undefined ? { status: s } : { status: s, closeCode });
  }

  function send(msg: ClientMessage): boolean {
    if (!ws || ws.readyState !== OPEN) return false;
    ws.send(encode(msg));
    return true;
  }

  function stopTimers(): void {
    clearTimeout(reconnectTimer);
    clearTimeout(pingTimer);
    reconnectTimer = undefined;
    pingTimer = undefined;
  }

  function keepalive(): void {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      if (!ws) return;
      if (Date.now() - lastHeard > cfg.deadAfterMs) {
        // Half-open connection (phone slept, network changed): replace it.
        drop(ws);
        return;
      }
      if (ws.readyState === OPEN) ws.send(PING_TEXT);
      keepalive();
    }, cfg.pingIntervalMs);
  }

  /** Forgets a socket and schedules a reconnect (unless we no longer want one). */
  function drop(sock: SocketLike, closeCode?: number): void {
    if (sock !== ws) return;
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
    try {
      sock.close();
    } catch {
      // already closed
    }
    ws = null;
    clearTimeout(pingTimer);
    if (!wanted || (closeCode !== undefined && FATAL_CLOSE_CODES.includes(closeCode))) {
      wanted = false;
      setStatus('closed', closeCode);
      return;
    }
    const delay = Math.min(cfg.reconnectMaxMs, cfg.reconnectBaseMs * 2 ** attempts) * (0.75 + Math.random() * 0.5);
    attempts++;
    setStatus('reconnecting', closeCode);
    reconnectTimer = setTimeout(open, delay);
  }

  function apply(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        attempts = 0;
        seat = msg.seat;
        room = msg.room;
        emit('welcome', msg);
        return;
      case 'roomState':
        room = msg.room;
        emit('roomState', msg);
        return;
      case 'matchStarted':
        room = msg.room;
        emit('matchStarted', msg);
        return;
      case 'throwResult': {
        const before = room && room.match && room.seq === msg.seq - 1 ? room.match : null;
        if (room) room = { ...room, seq: msg.seq, match: msg.match, phase: msg.match.phase === 'matchOver' ? 'matchOver' : 'playing', rematch: { A: false, B: false } };
        emit('throwResult', { ...msg, before });
        return;
      }
      case 'endStarted':
        if (room) room = { ...room, seq: msg.seq, match: msg.match };
        emit('endStarted', msg);
        return;
      case 'opponentConnection': {
        const p = room?.players[msg.seat];
        if (room && p) room = { ...room, players: { ...room.players, [msg.seat]: { ...p, connected: msg.connected, left: msg.left } } };
        emit('opponentConnection', msg);
        return;
      }
      case 'error':
        if (msg.fatal) wanted = false;
        emit('error', msg);
        return;
      case 'pong':
        return;
    }
  }

  function open(): void {
    reconnectTimer = undefined;
    if (!wanted || !code) return;
    setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
    let sock: SocketLike;
    try {
      sock = socketFactory(`${wsBase}/rooms/${code}/ws`);
    } catch {
      ws = null;
      wanted = false;
      setStatus('closed');
      return;
    }
    ws = sock;
    lastHeard = Date.now();
    sock.onopen = () => {
      lastHeard = Date.now();
      setStatus('open');
      send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH, roomCode: code as string, clientToken, nickname });
      keepalive();
    };
    sock.onmessage = (ev) => {
      lastHeard = Date.now();
      const msg = parseServerMessage(ev.data);
      if (msg) apply(msg);
    };
    sock.onclose = (ev) => drop(sock, ev.code);
    sock.onerror = () => drop(sock);
  }

  async function http(path: string, init: RequestInit = {}): Promise<Response> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), cfg.httpTimeoutMs);
    try {
      return await fetchImpl(`${base}${path}`, ctrl ? { ...init, signal: ctrl.signal } : init);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createRoom(length: MatchLength = 'standard') {
      const res = await http('/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ length }) });
      if (!res.ok) throw new Error(`createRoom failed: HTTP ${res.status}`);
      const body = (await res.json()) as { code?: unknown };
      const c = normalizeRoomCode(body.code);
      if (!c) throw new Error('createRoom: bad response');
      return c;
    },
    async roomInfo(raw: string) {
      const c = normalizeRoomCode(raw);
      if (!c) return null;
      const res = await http(`/rooms/${c}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`roomInfo failed: HTTP ${res.status}`);
      return (await res.json()) as RoomInfo;
    },
    connect(raw: string, nick: string) {
      const c = normalizeRoomCode(raw);
      if (!c) throw new Error(`bad room code: ${raw}`);
      wanted = false; // drop the previous socket (if any) without scheduling a reconnect
      if (ws) drop(ws);
      stopTimers();
      code = c;
      nickname = nick;
      seat = null;
      room = null;
      attempts = 0;
      wanted = true;
      open();
    },
    sendThrow(intent: ThrowIntent) {
      if (!room || !room.match) return false;
      return send({ type: 'throw', seq: room.seq, intent: { aim: intent.aim, power: intent.power, loft: intent.loft } });
    },
    sendNextEnd() {
      const m = room?.match;
      return m ? send({ type: 'nextEnd', endNumber: m.endNumber }) : false;
    },
    sendRematch: () => send({ type: 'rematch' }),
    leave() {
      send({ type: 'leave' });
      wanted = false;
      stopTimers();
      if (ws) drop(ws);
    },
    disconnect() {
      wanted = false;
      stopTimers();
      if (ws) drop(ws);
      else setStatus('closed');
    },
    reconnectNow() {
      if (!wanted) return;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        open();
      } else if (ws && Date.now() - lastHeard > cfg.pingIntervalMs && ws.readyState === OPEN) {
        ws.send(PING_TEXT); // probe a possibly stale socket; keepalive replaces it if silent
      }
    },
    on(name, cb) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, (set = new Set()));
      const entry = cb as AnyListener;
      set.add(entry);
      return () => {
        set.delete(entry);
      };
    },
    get status() {
      return status;
    },
    get seat() {
      return seat;
    },
    get room() {
      return room;
    },
    get code() {
      return code;
    },
    clientToken,
  };
}
