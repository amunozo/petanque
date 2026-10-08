/**
 * One Durable Object per room code. Thin shell around the pure referee in
 * src/net/room.ts: it owns the sockets (WebSocket Hibernation API), persists
 * the RoomState in storage after every change (so an evicted/hibernated
 * object resumes exactly), supplies crypto entropy and the clock, rate-limits
 * sockets, and runs ONE alarm at the earliest of: the idle expiry and the
 * room's reconnect deadline (roomDeadline -> roomAlarm decides a forfeit, or an
 * abandonment: both players away for the grace period -> the room is deleted
 * like an idle expiry).
 */
import { DurableObject } from 'cloudflare:workers';
import type { MatchLength } from '../../src/games/petanque/matchLength';
import { CLOSE_CODES, PING_TEXT, PONG_TEXT, encode, parseClientMessage, type ErrorCode, type Seat, type ServerMessage } from '../../src/net/protocol';
import {
  createRoomState,
  isAbandoned,
  joinRoom,
  restoreRoom,
  roomAlarm,
  roomDeadline,
  roomMessage,
  seatDisconnected,
  type Entropy,
  type Outgoing,
  type RoomClock,
  type RoomState,
} from '../../src/net/room';
import { SERVER_CONFIG } from './config';
import { isAllowedOrigin } from './http';
import { newBucket, take, type Bucket } from './rateLimit';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS?: string;
}

/** Public lobby info (GET /rooms/:code). */
export interface RoomInfo {
  code: string;
  phase: RoomState['phase'];
  length: MatchLength;
  players: number;
}

/** Survives hibernation with the socket. */
interface Attachment {
  seat: Seat | null;
}

const ROOM_KEY = 'room';
/** When the room expires if nothing happens (ms epoch), pushed back on every change. */
const IDLE_KEY = 'idleUntil';
/** WebSocket.readyState OPEN. */
const OPEN = 1;

function entropy(): Entropy {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return { seed: r[0] ?? 0, firstTeam: ((r[1] ?? 0) & 1) === 1 ? 'A' : 'B' };
}

const clock = (): RoomClock => ({ now: Date.now(), reconnectGraceMs: SERVER_CONFIG.reconnectGraceMs });
const idleMs = (phase: RoomState['phase']): number =>
  phase === 'playing' ? SERVER_CONFIG.matchIdleMs : phase === 'matchOver' ? SERVER_CONFIG.matchOverIdleMs : SERVER_CONFIG.lobbyIdleMs;

const seatOf = (ws: WebSocket): Seat | null => (ws.deserializeAttachment() as Attachment | null)?.seat ?? null;
const errorMsg = (code: ErrorCode, fatal: boolean, detail?: string): ServerMessage =>
  detail === undefined ? { type: 'error', code, fatal } : { type: 'error', code, fatal, detail };

function sendTo(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(encode(msg));
  } catch {
    // socket already closing
  }
}
function closeWs(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // already closed
  }
}

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  private idleUntil = 0;
  /** Per-socket rate limit (in memory: resets after hibernation, which is fine). */
  private buckets = new WeakMap<WebSocket, Bucket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_TEXT, PONG_TEXT));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = (await ctx.storage.get<RoomState>(ROOM_KEY)) ?? null;
      // Rooms stored before IDLE_KEY existed: their alarm was the idle expiry.
      this.idleUntil = (await ctx.storage.get<number>(IDLE_KEY)) ?? (await ctx.storage.getAlarm()) ?? Date.now() + SERVER_CONFIG.lobbyIdleMs;
      this.room = stored;
      if (!stored) return;
      // A live (possibly hibernated) socket holds each connected seat; seats whose socket died with the old instance go offline.
      const restored = restoreRoom(stored, ctx.getWebSockets().map(seatOf), clock());
      if (restored.room === stored) return;
      await this.save(restored.room);
      this.deliver(null, restored.out);
    });
  }

  // ---- RPC from the Worker -----------------------------------------------------------

  /** Creates the room under this code; false if the code is already in use. */
  async init(code: string, length: MatchLength): Promise<boolean> {
    if (this.room) return false;
    await this.commit(createRoomState(code, length));
    return true;
  }

  async info(): Promise<RoomInfo | null> {
    const r = this.room;
    if (!r || isAbandoned(r, Date.now())) return null; // abandoned: gone, even if the alarm has not run yet
    return { code: r.code, phase: r.phase, length: r.length, players: (r.seats.A ? 1 : 0) + (r.seats.B ? 1 : 0) };
  }

  // ---- WebSocket upgrade --------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a WebSocket upgrade', { status: 426 });
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedOrigin(origin, this.env.ALLOWED_ORIGINS)) return new Response('origin not allowed', { status: 403 });
    if (this.ctx.getWebSockets().length >= SERVER_CONFIG.maxSocketsPerRoom) return new Response('room busy', { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null } satisfies Attachment);
    if (!this.room || isAbandoned(this.room, Date.now())) {
      sendTo(server, errorMsg('roomNotFound', true));
      closeWs(server, CLOSE_CODES.roomNotFound, 'roomNotFound');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- hibernation handlers -------------------------------------------------------------

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > SERVER_CONFIG.maxMessageBytes) {
      sendTo(ws, errorMsg('badMessage', true, 'text frames up to the size limit only'));
      return this.kick(ws, CLOSE_CODES.badMessage, 'badMessage');
    }
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = newBucket(SERVER_CONFIG.rateBurst, Date.now())));
    if (!take(bucket, Date.now(), SERVER_CONFIG.rateBurst, SERVER_CONFIG.rateRefillPerSec)) {
      const done = bucket.strikes >= SERVER_CONFIG.rateStrikesBeforeClose;
      sendTo(ws, errorMsg('rateLimited', done));
      if (done) await this.kick(ws, CLOSE_CODES.rateLimited, 'rateLimited');
      return;
    }

    const parsed = parseClientMessage(message);
    if (!parsed.ok) return sendTo(ws, errorMsg(parsed.code, false, parsed.detail));
    const msg = parsed.msg;
    if (msg.type === 'ping') return sendTo(ws, { type: 'pong' });

    const room = this.room;
    if (!room) {
      sendTo(ws, errorMsg('roomNotFound', true));
      return this.kick(ws, CLOSE_CODES.roomNotFound, 'roomNotFound');
    }

    const seat = seatOf(ws);
    if (msg.type === 'hello') {
      if (seat) return sendTo(ws, errorMsg('badMessage', false, 'already joined'));
      const result = joinRoom(room, msg, entropy(), clock());
      if (result.abandoned) {
        this.deliver(ws, result.out);
        return this.expire();
      }
      if (result.seat) {
        // Another socket with this seat (old tab, half-dead connection) is replaced by this one.
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws && seatOf(other) === result.seat) this.closeSocket(other, CLOSE_CODES.replaced, 'replaced');
        }
        ws.serializeAttachment({ seat: result.seat } satisfies Attachment);
      }
      await this.commit(result.room);
      this.deliver(ws, result.out);
      if (result.close !== undefined) await this.kick(ws, result.close, 'closed');
      return;
    }

    if (!seat) return sendTo(ws, errorMsg('notJoined', false));
    const result = roomMessage(room, seat, msg, entropy(), clock());
    if (result.abandoned) {
      this.deliver(ws, result.out);
      return this.expire();
    }
    await this.commit(result.room);
    this.deliver(ws, result.out);
    if (result.close !== undefined) await this.kick(ws, result.close, 'closed');
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.socketGone(ws, code);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.socketGone(ws, 1011);
  }

  /** A deadline passed (forfeit, nobody to claim it, or the match was abandoned) or the room went quiet (expiry). */
  override async alarm(): Promise<void> {
    const room = this.room;
    const now = Date.now();
    const deadline = room ? roomDeadline(room) : null;
    if (room && deadline !== null && deadline <= now) {
      const result = roomAlarm(room, clock());
      if (result.abandoned) return this.expire();
      // A forfeit ends the match (new idle period); a dropped countdown (both away) leaves the idle expiry as it was.
      if (result.room.phase !== room.phase) await this.commit(result.room);
      else await this.save(result.room);
      this.deliver(null, result.out);
      return;
    }
    if (room && now < this.idleUntil) return this.scheduleAlarm(); // woke early
    await this.expire();
  }

  /** The room is over for good (idle expiry or abandoned match): tell and close every socket, delete everything. */
  private async expire(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      sendTo(ws, errorMsg('roomExpired', true));
      this.closeSocket(ws, CLOSE_CODES.roomExpired, 'roomExpired');
    }
    this.room = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---- internals ---------------------------------------------------------------------------

  private async socketGone(ws: WebSocket, code: number): Promise<void> {
    this.buckets.delete(ws);
    const seat = seatOf(ws);
    // Complete the closing handshake (1005/1006 are reserved and cannot be sent back).
    closeWs(ws, code >= 3000 && code < 5000 ? code : 1000, 'bye');
    if (seat) await this.seatGoneIfLast(seat, ws);
  }

  /** Marks `seat` disconnected (and tells the opponent) unless another open socket still holds it. */
  private async seatGoneIfLast(seat: Seat, gone: WebSocket): Promise<void> {
    if (!this.room) return;
    const stillThere = this.ctx.getWebSockets().some((o) => o !== gone && o.readyState === OPEN && seatOf(o) === seat);
    if (stillThere) return;
    const result = seatDisconnected(this.room, seat, clock());
    if (result.abandoned) return this.expire();
    await this.commit(result.room);
    this.deliver(null, result.out);
  }

  /** Server-side close of a socket; its seat (if any) goes offline like on a network drop. */
  private async kick(ws: WebSocket, code: number, reason: string): Promise<void> {
    const seat = seatOf(ws);
    this.closeSocket(ws, code, reason);
    if (seat) await this.seatGoneIfLast(seat, ws);
  }

  /** Detaches the socket from its seat (no more broadcasts, no disconnect notice) and closes it. */
  private closeSocket(ws: WebSocket, code: number, reason: string): void {
    ws.serializeAttachment({ seat: null } satisfies Attachment);
    this.buckets.delete(ws);
    closeWs(ws, code, reason);
  }

  private deliver(self: WebSocket | null, out: Outgoing[]): void {
    if (out.length === 0) return;
    const sockets = this.ctx.getWebSockets();
    for (const { to, msg } of out) {
      if (to === 'self') {
        if (self) sendTo(self, msg);
        continue;
      }
      for (const ws of sockets) {
        const seat = seatOf(ws);
        if (seat && (to === 'all' || to === seat)) sendTo(ws, msg);
      }
    }
  }

  /** Stores a changed room and pushes the idle expiry back (any change is activity). */
  private async commit(next: RoomState): Promise<void> {
    if (next === this.room) return;
    this.idleUntil = Date.now() + idleMs(next.phase);
    await this.save(next);
  }

  /** Stores the room (and the idle expiry) and re-arms the alarm. */
  private async save(next: RoomState): Promise<void> {
    this.room = next;
    await this.ctx.storage.put({ [ROOM_KEY]: next, [IDLE_KEY]: this.idleUntil });
    await this.scheduleAlarm();
  }

  /** One alarm for both timers: the idle expiry or the room's next reconnect deadline, whichever comes first. */
  private async scheduleAlarm(): Promise<void> {
    const deadline = this.room ? roomDeadline(this.room) : null;
    await this.ctx.storage.setAlarm(deadline === null ? this.idleUntil : Math.min(deadline, this.idleUntil));
  }
}
