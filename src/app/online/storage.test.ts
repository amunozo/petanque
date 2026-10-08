import { describe, expect, it } from 'vitest';
import { ACTIVE_ROOM_KEY, chooseServer, clearActiveRoom, loadActiveRoom, loadNickname, normalizeServerUrl, ONLINE_KEY, parseActiveRoom, resolveOnlineBeta, resolveServer, saveActiveRoom, saveNickname, SERVER_URL_KEY, type KeyValueStore } from './storage';

const mem = (): KeyValueStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const broken: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('nickname', () => {
  it('round-trips a clean nickname and survives blocked storage', () => {
    const s = mem();
    expect(loadNickname(s)).toBe('');
    saveNickname('Ana', s);
    expect(loadNickname(s)).toBe('Ana');
    s.m.set('petanque.nickname', '   ');
    expect(loadNickname(s)).toBe('');
    expect(loadNickname(broken)).toBe('');
    expect(() => saveNickname('Ana', broken)).not.toThrow();
  });
});

describe('active room (rejoin)', () => {
  it('stores, validates and clears', () => {
    const s = mem();
    expect(loadActiveRoom(s)).toBeNull();
    saveActiveRoom({ code: 'K7M9P', nickname: 'Ana', opponent: null }, s);
    expect(loadActiveRoom(s)).toEqual({ code: 'K7M9P', nickname: 'Ana', opponent: null });
    saveActiveRoom({ code: 'K7M9P', nickname: 'Ana', opponent: 'Bruno' }, s);
    expect(loadActiveRoom(s)?.opponent).toBe('Bruno');
    clearActiveRoom(s);
    expect(s.m.has(ACTIVE_ROOM_KEY)).toBe(false);
    expect(loadActiveRoom(broken)).toBeNull();
    expect(() => clearActiveRoom(broken)).not.toThrow();
  });
  it('rejects garbage', () => {
    expect(parseActiveRoom('{')).toBeNull();
    expect(parseActiveRoom('{"code":"K7M9P"}')).toBeNull();
    expect(parseActiveRoom('{"code":"0000O","nickname":"Ana"}')).toBeNull();
    expect(parseActiveRoom('{"code":"k7m9p","nickname":" Ana ","opponent":42}')).toEqual({ code: 'K7M9P', nickname: 'Ana', opponent: null });
  });
});

describe('server choice', () => {
  const fallback = 'http://localhost:8787';
  it('players get only the URL baked into the build', () => {
    expect(chooseServer({ configured: null, devMode: false, param: 'http://evil.test', saved: 'http://x.test', fallback })).toEqual({ url: null });
    expect(chooseServer({ configured: 'https://s.test', devMode: false, param: 'http://evil.test', saved: null, fallback })).toEqual({ url: 'https://s.test' });
  });
  it('developer mode: ?server= wins and is remembered; default forgets it', () => {
    expect(chooseServer({ configured: null, devMode: true, param: 'http://127.0.0.1:8787/', saved: null, fallback })).toEqual({ url: 'http://127.0.0.1:8787', save: 'http://127.0.0.1:8787' });
    expect(chooseServer({ configured: null, devMode: true, param: null, saved: 'http://127.0.0.1:9000', fallback })).toEqual({ url: 'http://127.0.0.1:9000' });
    expect(chooseServer({ configured: 'https://s.test', devMode: true, param: 'default', saved: 'http://x', fallback })).toEqual({ url: 'https://s.test', save: null });
    expect(chooseServer({ configured: null, devMode: true, param: null, saved: null, fallback })).toEqual({ url: fallback });
  });
  it('normalizes URLs and refuses other schemes', () => {
    expect(normalizeServerUrl(' https://a.test/x/ ')).toBe('https://a.test/x');
    expect(normalizeServerUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeServerUrl('nope')).toBeNull();
  });
  it('applies the choice to storage', () => {
    const s = mem();
    expect(resolveServer(new URLSearchParams('server=http://localhost:8787'), true, false, null, 'http://f', s)).toBe('http://localhost:8787');
    expect(s.m.get(SERVER_URL_KEY)).toBe('http://localhost:8787');
    expect(resolveServer(new URLSearchParams(''), true, false, null, 'http://f', s)).toBe('http://localhost:8787');
    expect(resolveServer(new URLSearchParams(''), false, false, null, 'http://f', s)).toBeNull();
  });
});

describe('online beta switch', () => {
  const q = (s: string) => new URLSearchParams(s);
  const fallback = 'https://prod.test';
  it('?online=1 turns it on and remembers it; ?online=0 turns it off and forgets it', () => {
    const s = mem();
    expect(resolveOnlineBeta(q(''), s)).toBe(false);
    expect(resolveOnlineBeta(q('online=1'), s)).toBe(true);
    expect(s.m.get(ONLINE_KEY)).toBe('1');
    expect(resolveOnlineBeta(q(''), s)).toBe(true);
    expect(resolveOnlineBeta(q('room=K7M9P'), s)).toBe(true);
    expect(resolveOnlineBeta(q('online=0'), s)).toBe(false);
    expect(s.m.has(ONLINE_KEY)).toBe(false);
    expect(resolveOnlineBeta(q(''), s)).toBe(false);
  });
  it('ignores other values and other stored values', () => {
    const s = mem();
    expect(resolveOnlineBeta(q('online=yes'), s)).toBe(false);
    expect(s.m.has(ONLINE_KEY)).toBe(false);
    s.m.set(ONLINE_KEY, 'true');
    expect(resolveOnlineBeta(q(''), s)).toBe(false);
  });
  it('does not enable developer mode or touch the dev server override', () => {
    const s = mem();
    resolveOnlineBeta(q('online=1'), s);
    expect([...s.m.keys()]).toEqual([ONLINE_KEY]);
  });
  it('gives players the fallback server only with the switch on (and no build URL)', () => {
    expect(chooseServer({ configured: null, devMode: false, onlineBeta: false, param: null, saved: null, fallback })).toEqual({ url: null });
    expect(chooseServer({ configured: null, devMode: false, param: null, saved: null, fallback })).toEqual({ url: null });
    expect(chooseServer({ configured: null, devMode: false, onlineBeta: true, param: null, saved: null, fallback })).toEqual({ url: fallback });
    // players never get ?server= or a saved override
    expect(chooseServer({ configured: null, devMode: false, onlineBeta: true, param: 'http://evil.test', saved: 'http://x.test', fallback })).toEqual({ url: fallback });
    expect(chooseServer({ configured: 'https://s.test', devMode: false, onlineBeta: true, param: null, saved: null, fallback })).toEqual({ url: 'https://s.test' });
  });
  it('developer mode is unaffected by the switch', () => {
    for (const onlineBeta of [false, true]) {
      expect(chooseServer({ configured: null, devMode: true, onlineBeta, param: null, saved: null, fallback })).toEqual({ url: fallback });
      expect(chooseServer({ configured: null, devMode: true, onlineBeta, param: 'http://127.0.0.1:8787', saved: null, fallback })).toEqual({ url: 'http://127.0.0.1:8787', save: 'http://127.0.0.1:8787' });
    }
  });
  it('resolveServer end to end', () => {
    const s = mem();
    expect(resolveServer(q(''), false, resolveOnlineBeta(q(''), s), null, fallback, s)).toBeNull();
    expect(resolveServer(q('online=1'), false, resolveOnlineBeta(q('online=1'), s), null, fallback, s)).toBe(fallback);
    expect(resolveServer(q(''), false, resolveOnlineBeta(q(''), s), null, fallback, s)).toBe(fallback); // remembered
    expect(resolveServer(q('online=0'), false, resolveOnlineBeta(q('online=0'), s), null, fallback, s)).toBeNull();
    expect(resolveServer(q(''), false, resolveOnlineBeta(q(''), s), null, fallback, s)).toBeNull();
    expect(resolveServer(q('server=http://localhost:8787'), false, true, null, fallback, s)).toBe(fallback); // players: no override
    expect(s.m.has(SERVER_URL_KEY)).toBe(false);
  });
  it('survives blocked storage (the param still counts for this page load only)', () => {
    expect(resolveOnlineBeta(q(''), broken)).toBe(false);
    expect(resolveOnlineBeta(q('online=1'), broken)).toBe(true);
    expect(resolveOnlineBeta(q('online=0'), broken)).toBe(false);
    expect(resolveServer(q('online=1'), false, true, null, fallback, broken)).toBe(fallback);
    expect(resolveServer(q(''), false, false, null, fallback, broken)).toBeNull();
  });
});
