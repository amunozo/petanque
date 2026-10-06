/**
 * One Durable Object per room code. Thin shell around the pure referee in
 * src/net/room.ts: it owns the sockets (WebSocket Hibernation API), persists
 * the RoomState in storage after every change (so an evicted/hibernated
 * object resumes exactly), supplies crypto entropy, rate-limits sockets and
 * expires idle rooms with an alarm.
 */
import { DurableObject } from 'cloudflare:workers';
import type { MatchLength } from '../../src/games/petanque/matchLength';
import { CLOSE_CODES, PING_TEXT, PONG_TEXT, encode, parseClientMessage, type ErrorCode, type Seat, type ServerMessage } from '../../src/net/protocol';
import { createRoomState, joinRoom, roomMessage, seatDisconnected, type Entropy, type Outgoing, type RoomState } from '../../src/net/room';
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
/** WebSocket.readyState OPEN. */
const OPEN = 1;

function entropy(): Entropy {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return { seed: r[0] ?? 0, firstTeam: ((r[1] ?? 0) & 1) === 1 ? 'A' : 'B' };
}

const seatOf = (ws: WebSocket): Seat | null => (ws.deserializeAttachment() as Attachment | null)?.seat ?? null;
const errorMsg = (code: ErrorCode, fatal: boolean, detail?: string): ServerMessage =>
  detail === undefined ? { type: 'error', code, fatal } : { type: 'error', code, fatal, detail };

/**
 * After a restart (deploy, crash) sockets can be gone without a close event:
 * a seat only counts as connected if a live (possibly hibernated) socket holds it.
 * Nobody needs telling: whoever reconnects gets a fresh snapshot in `welcome`.
 */
function reconcileConnections(room: RoomState, liveSeats: (Seat | null)[]): RoomState {
  const seats = { ...room.seats };
  for (const s of ['A', 'B'] as const) {
    const st = seats[s];
    if (st && st.connected && !liveSeats.includes(s)) seats[s] = { ...st, connected: false };
  }
  return { ...room, seats };
}

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
  /** Per-socket rate limit (in memory: resets after hibernation, which is fine). */
  private buckets = new WeakMap<WebSocket, Bucket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_TEXT, PONG_TEXT));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = (await ctx.storage.get<RoomState>(ROOM_KEY)) ?? null;
      this.room = stored ? reconcileConnections(stored, ctx.getWebSockets().map(seatOf)) : null;
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
    if (!r) return null;
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
    if (!this.room) {
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
      const result = joinRoom(room, msg, entropy());
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
    const result = roomMessage(room, seat, msg, entropy());
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

  /** Idle expiry: the alarm is pushed back on every change, so firing means the room went quiet. */
  override async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      sendTo(ws, errorMsg('roomExpired', true));
      this.closeSocket(ws, CLOSE_CODES.roomExpired, 'roomExpired');
    }
    this.room = null;
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
    const result = seatDisconnected(this.room, seat);
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

  /** Stores a changed room and pushes the idle-expiry alarm back. */
  private async commit(next: RoomState): Promise<void> {
    if (next === this.room) return;
    this.room = next;
    await this.ctx.storage.put(ROOM_KEY, next);
    const idle =
      next.phase === 'playing' ? SERVER_CONFIG.matchIdleMs : next.phase === 'matchOver' ? SERVER_CONFIG.matchOverIdleMs : SERVER_CONFIG.lobbyIdleMs;
    await this.ctx.storage.setAlarm(Date.now() + idle);
  }
}
