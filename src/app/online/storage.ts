/**
 * What online play remembers on this device (best effort; everything works without storage):
 * the nickname, the room of the match in progress (to offer "Rejoin" after the app was
 * closed) and, in developer mode only, a server URL override (`?server=`).
 */
import { cleanNickname, normalizeRoomCode, PROTOCOL_LIMITS } from '../../net/protocol';

export const NICKNAME_KEY = 'petanque.nickname';
export const ACTIVE_ROOM_KEY = 'petanque.activeRoom';
export const SERVER_URL_KEY = 'petanque.serverUrl';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
function read(key: string, store: KeyValueStore | null): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(key: string, value: string | null, store: KeyValueStore | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

/** The last nickname used here ('' when none). */
export const loadNickname = (store = local()): string => cleanNickname(read(NICKNAME_KEY, store)) ?? '';
export const saveNickname = (nickname: string, store = local()): void => write(NICKNAME_KEY, nickname, store);
/** Longest nickname the server accepts (characters). */
export const NICKNAME_MAX = PROTOCOL_LIMITS.nicknameMaxChars;

/** The online match this device is part of, until it is left or finished. */
export interface ActiveRoom {
  code: string;
  /** The nickname this device joined with (sent again on rejoin). */
  nickname: string;
  /** The other player's nickname once known (for "Rejoin your match vs …"). */
  opponent: string | null;
}

export function parseActiveRoom(raw: string | null): ActiveRoom | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof ActiveRoom, unknown>>;
    const code = normalizeRoomCode(v.code);
    const nickname = cleanNickname(v.nickname);
    if (!code || !nickname) return null;
    return { code, nickname, opponent: cleanNickname(v.opponent) };
  } catch {
    return null;
  }
}

export const loadActiveRoom = (store = local()): ActiveRoom | null => parseActiveRoom(read(ACTIVE_ROOM_KEY, store));
export const saveActiveRoom = (room: ActiveRoom, store = local()): void => write(ACTIVE_ROOM_KEY, JSON.stringify(room), store);
export const clearActiveRoom = (store = local()): void => write(ACTIVE_ROOM_KEY, null, store);

/** "http(s)://host[:port][/path]" without a trailing slash, or null. */
export function normalizeServerUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export interface ServerChoice {
  /** Where online play connects; null = online play is off for this build/player. */
  url: string | null;
  /** Developer-mode override to remember (a URL), to forget (null), or leave as is (undefined). */
  save?: string | null;
}

/**
 * Which server to use. Players: only the URL baked into the build (none = no online entry).
 * Developer mode: `?server=<url>` (remembered; `?server=default` forgets it), else the
 * remembered override, else the build's URL, else `fallback` (the client's default).
 */
export function chooseServer(o: { configured: string | null; devMode: boolean; param: string | null; saved: string | null; fallback: string }): ServerChoice {
  if (!o.devMode) return { url: o.configured };
  const base = o.configured ?? o.fallback;
  if (o.param !== null) {
    const url = normalizeServerUrl(o.param);
    return url ? { url, save: url } : { url: base, save: null };
  }
  return { url: normalizeServerUrl(o.saved) ?? base };
}

/** chooseServer() with the URL params and storage of this page. */
export function resolveServer(params: URLSearchParams, devMode: boolean, configured: string | null, fallback: string, store = local()): string | null {
  const choice = chooseServer({ configured, devMode, param: params.get('server'), saved: read(SERVER_URL_KEY, store), fallback });
  if (choice.save !== undefined) write(SERVER_URL_KEY, choice.save, store);
  return choice.url;
}
