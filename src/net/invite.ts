/** Invite links for "play a friend": https://petanque.amunozo.com/?room=CODE. Pure. */
import { normalizeRoomCode } from './protocol';

export const INVITE_BASE_URL = 'https://petanque.amunozo.com/';
export const ROOM_PARAM = 'room';
/** `?online=1` shows the online entry to players on this device (the hidden "online beta" switch). */
export const ONLINE_PARAM = 'online';

/** The link to share for a room; `onlineBeta` adds `online=1` so the invited friend gets the online UI too. */
export const inviteLink = (code: string, base: string = INVITE_BASE_URL, onlineBeta = false): string =>
  `${base}?${ROOM_PARAM}=${encodeURIComponent(code)}${onlineBeta ? `&${ONLINE_PARAM}=1` : ''}`;

/** Room code from a query string such as `location.search` ("?room=ab2cd"), or null. */
export function roomCodeFromSearch(search: string): string | null {
  const m = /[?&]room=([^&#]*)/.exec(search);
  if (!m || m[1] === undefined) return null;
  try {
    return normalizeRoomCode(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}
