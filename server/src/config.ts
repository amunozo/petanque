/**
 * Server limits and timeouts (transport/abuse, not game feel: the game itself
 * always runs on the shared defaultConfig, see src/net/room.ts).
 */
export const SERVER_CONFIG = {
  /** Largest accepted WebSocket frame, bytes (the protocol check on text length is stricter). */
  maxMessageBytes: 4096,
  /** Per-socket token bucket: burst size and refill per second. Pings answered by the runtime don't count. */
  rateBurst: 20,
  rateRefillPerSec: 4,
  /** A socket that keeps going this many messages over the limit is closed. */
  rateStrikesBeforeClose: 20,
  /** Max simultaneous sockets in one room (2 seats + reconnect overlaps / spare tabs). */
  maxSocketsPerRoom: 6,
  /** Expiry without any real message (keepalive pings don't count). */
  lobbyIdleMs: 30 * 60 * 1000,
  matchIdleMs: 2 * 60 * 60 * 1000,
  matchOverIdleMs: 30 * 60 * 1000,
  /** POST /rooms tries this many random codes before giving up (collisions are rare). */
  createAttempts: 8,
  /** Browser origins allowed by CORS / for WebSocket upgrades (plus ALLOWED_ORIGINS env, comma-separated). */
  allowedOrigins: ['https://petanque.amunozo.com'],
  /** Any http://localhost:<port> / http://127.0.0.1:<port> origin is allowed (vite dev/preview). */
  allowLocalhost: true,
} as const;
