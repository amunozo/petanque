/** Player-facing court names and the online room line ("Quick · 7 · Alps"). Names come only from i18n. */
import { t, type MessageKey } from '../i18n';
import type { VenueId } from '../net/venueId';
import type { MatchLength } from './matchLength';

const VENUE_KEY = { village: 'venue.village', derborence: 'venue.derborence' } as const satisfies Record<VenueId, MessageKey>;
const LENGTH_KEY = { quick: 'length.quick', standard: 'length.standard' } as const satisfies Record<MatchLength, MessageKey>;

/** "Provence" / "Alps" (localized). */
export const venueName = (v: VenueId): string => t(VENUE_KEY[v]);

/** Lobby detail of an online room: length, points to win and court, e.g. "Quick · 7 · Alps". */
export const roomDetailText = (length: MatchLength, points: number, venue: VenueId): string =>
  `${t(LENGTH_KEY[length])} · ${points} · ${venueName(venue)}`;
