/** Invite links for "play a friend": https://petanque.amunozo.com/?room=CODE. Pure. */
import { normalizeRoomCode } from './protocol';

export const INVITE_BASE_URL = 'https://petanque.amunozo.com/';
export const ROOM_PARAM = 'room';

/** The link to share for a room. */
export const inviteLink = (code: string, base: string = INVITE_BASE_URL): string => `${base}?${ROOM_PARAM}=${encodeURIComponent(code)}`;

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
