/**
 * Opt-in end-to-end check of the Worker with the real browser client
 * (Node 22 has global WebSocket/fetch). Skipped unless PETANQUE_SERVER_URL is set:
 *
 *   cd server && npx wrangler dev --port 8787 &
 *   PETANQUE_SERVER_URL=http://127.0.0.1:8787 npx vitest run src/net/server.smoke.test.ts
 */
import { describe, expect, it } from 'vitest';
import { simulateToRest } from '../engine';
import { defaultConfig } from '../tuning/config';
import { createNetClient, type NetClient, type NetEventName, type NetEvents } from './client';
import { replayThrowWorld } from './replay';
import { MAX_THROW_SECONDS } from './room';

const URL_ = process.env['PETANQUE_SERVER_URL'];
const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const client = (): NetClient => createNetClient({ serverUrl: URL_ as string, storage: memStorage() });

function next<K extends NetEventName>(c: NetClient, name: K, pred: (ev: NetEvents[K]) => boolean = () => true, ms = 5000): Promise<NetEvents[K]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for ${name}`));
    }, ms);
    const off = c.on(name, (ev) => {
      if (!pred(ev)) return;
      clearTimeout(timer);
      off();
      resolve(ev);
    });
  });
}

describe.skipIf(!URL_)('worker smoke (needs wrangler dev)', () => {
  it('create, join, throw, reconnect, room full', async () => {
    const a = client();
    const b = client();
    const code = await a.createRoom('quick');
    expect(code).toMatch(/^[2-9A-Z]{5}$/);
    expect(await b.roomInfo(code)).toEqual({ code, phase: 'lobby', length: 'quick', players: 0 });
    expect(await b.roomInfo('ZZZZZ')).toBeNull();

    const aWelcome = next(a, 'welcome');
    a.connect(code, 'Ana');
    expect((await aWelcome).seat).toBe('A');

    const aStarted = next(a, 'matchStarted');
    const bStarted = next(b, 'matchStarted');
    b.connect(code, 'Bob');
    const started = await bStarted;
    await aStarted;
    expect(b.seat).toBe('B');
    expect(started.room.match).toMatchObject({ seed: 0, rng: 0, phase: 'jack' });

    const thrower = started.room.match!.toThrow === 'A' ? a : b;
    const watcher = thrower === a ? b : a;
    expect(watcher.sendThrow({ aim: 0, power: 0.55, loft: 'half' })).toBe(true); // refused server side
    const err = await next(watcher, 'error');
    expect(err.code).toBe('notYourTurn');

    const res = next(watcher, 'throwResult');
    thrower.sendThrow({ aim: 0, power: 0.55, loft: 'half' });
    const r = await res;
    expect(r.before).not.toBeNull();
    const world = replayThrowWorld(r.before!, r.record, defaultConfig);
    expect(simulateToRest(world!, defaultConfig.physics, MAX_THROW_SECONDS).world.bodies).toEqual(r.rest);
    expect(watcher.room?.seq).toBe(r.seq);

    // B drops and comes back with the same token: same seat, A is told both times.
    const down = next(a, 'opponentConnection', (e) => !e.connected);
    b.disconnect();
    expect((await down).seat).toBe('B');
    const up = next(a, 'opponentConnection', (e) => e.connected);
    const back = next(b, 'welcome');
    b.connect(code, 'Bob');
    expect((await back).seat).toBe('B');
    await up;

    // A third device is turned away for good.
    const c = client();
    const full = next(c, 'error');
    const closed = next(c, 'status', (s) => s.status === 'closed');
    c.connect(code, 'Cy');
    expect((await full).code).toBe('roomFull');
    expect((await closed).closeCode).toBe(4409);

    // Unknown room: fatal, no reconnect loop.
    const d = client();
    const nf = next(d, 'error');
    d.connect('ZZZZZ', 'Dee');
    expect((await nf).code).toBe('roomNotFound');

    a.leave();
    b.leave();
  }, 20000);
});
