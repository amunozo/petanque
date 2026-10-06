/**
 * petanque-server: HTTP routes in front of the per-room Durable Objects.
 *
 *   POST /rooms              {length?: 'quick'|'standard'} -> 201 {code}
 *   GET  /rooms/:code        -> 200 {code, phase, length, players} | 404
 *   GET  /rooms/:code/ws     -> WebSocket upgrade into the room
 *   GET  /health             -> {ok, protocolVersion, configHash}
 */
import { isMatchLength } from '../../src/games/petanque/matchLength';
import { CONFIG_HASH } from '../../src/net/fingerprint';
import { PROTOCOL_VERSION, normalizeRoomCode } from '../../src/net/protocol';
import { SERVER_CONFIG } from './config';
import { corsHeaders, isAllowedOrigin, json, randomRoomCode } from './http';
import type { Env } from './roomObject';

export { Room } from './roomObject';

/** Largest accepted POST /rooms body (bytes). */
const MAX_CREATE_BODY = 256;

async function createRoom(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) return json({ error: 'originNotAllowed' }, 403, cors);
  const text = await request.text();
  if (text.length > MAX_CREATE_BODY) return json({ error: 'tooLarge' }, 413, cors);
  let length: 'quick' | 'standard' = 'standard';
  if (text.trim() !== '') {
    try {
      const body: unknown = JSON.parse(text);
      const l = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['length'] : undefined;
      if (l !== undefined && !isMatchLength(l)) return json({ error: 'badLength' }, 400, cors);
      if (l !== undefined) length = l;
    } catch {
      return json({ error: 'badJson' }, 400, cors);
    }
  }
  for (let i = 0; i < SERVER_CONFIG.createAttempts; i++) {
    const code = randomRoomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (await stub.init(code, length)) return json({ code }, 201, cors);
  }
  return json({ error: 'busy' }, 503, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, protocolVersion: PROTOCOL_VERSION, configHash: CONFIG_HASH }, 200, cors);
      }
      if (url.pathname === '/rooms' && request.method === 'POST') return await createRoom(request, env, cors);

      const m = /^\/rooms\/([^/]{1,32})(\/ws)?\/?$/.exec(url.pathname);
      if (m && request.method === 'GET') {
        const code = normalizeRoomCode(m[1]);
        if (!code) return json({ error: 'roomNotFound' }, 404, cors);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (m[2]) return await stub.fetch(request);
        const info = await stub.info();
        return info ? json(info, 200, cors) : json({ error: 'roomNotFound' }, 404, cors);
      }
      return json({ error: 'notFound' }, 404, cors);
    } catch (err) {
      console.error('request failed', err);
      return json({ error: 'serverError' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
