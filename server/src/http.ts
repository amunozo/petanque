/** HTTP helpers: CORS, JSON responses, room codes. */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../src/net/protocol';
import { SERVER_CONFIG } from './config';

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Is this browser Origin allowed? `extra` = the ALLOWED_ORIGINS env var (comma-separated). */
export function isAllowedOrigin(origin: string | null, extra = ''): boolean {
  if (!origin) return false;
  if ((SERVER_CONFIG.allowedOrigins as readonly string[]).includes(origin)) return true;
  if (SERVER_CONFIG.allowLocalhost && LOCALHOST.test(origin)) return true;
  return extra
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}

export function corsHeaders(origin: string | null, extra = ''): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, extra)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

/** A random room code from the unambiguous alphabet (crypto randomness, no modulo bias worth caring about at 31 symbols / 2^32). */
export function randomRoomCode(): string {
  const r = new Uint32Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(r);
  let code = '';
  for (const v of r) code += ROOM_CODE_ALPHABET[v % ROOM_CODE_ALPHABET.length];
  return code;
}
