/** Invite links for "play a friend": https://petanque.amunozo.com/?room=CODE. Pure. */
import { normalizeRoomCode } from './protocol';

export const INVITE_BASE_URL = 'https://petanque.amunozo.com/';
export const ROOM_PARAM = 'room';
/** `?online=1` shows the online entry to players on this device (the hidden "online beta" switch). */
export const ONLINE_PARAM = 'online';

/** The link to share for a room; `onlineBeta` adds `online=1` so the invited friend gets the online UI too. */
export const inviteLink = (code: string, base: string = INVITE_BASE_URL, onlineBeta = false): string =>
  `${base}?${ROOM_PARAM}=${encodeURIComponent(code)}${onlineBeta ? `&${ONLINE_PARAM}=1` : ''}`;

/** What the share sheet gets for a room: a sentence, and the invite link when there is one. */
export interface ShareContent {
  text: string;
  url?: string;
}

/**
 * Share sheet payload for a room. `base === null` means no link at all (portals forbid links off their site), so
 * the player shares the room code alone. Callers pass the translated sentence as `text` (this file stays free of
 * i18n); the bare code is only a fallback for a caller that has none.
 */
export function shareContent(code: string, base: string | null, onlineBeta = false, text?: string): ShareContent {
  const body = text ?? code;
  return base === null ? { text: body } : { text: body, url: inviteLink(code, base, onlineBeta) };
}

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
