/**
 * Venue ids: which court/art the match is played on. Pure TS (no three.js, no DOM), so the
 * server and the net code can validate one without pulling in the renderer (src/render/venues.ts
 * imports three): this module is the single source of truth for the ids.
 *
 * Player-facing names are i18n keys ('venue.village' = "Provence", 'venue.derborence' = "Alps").
 */

export type VenueId = 'village' | 'derborence';

export const VENUE_IDS: readonly VenueId[] = ['village', 'derborence'];

export const DEFAULT_VENUE: VenueId = 'village';

export const isVenueId = (v: unknown): v is VenueId => typeof v === 'string' && (VENUE_IDS as readonly string[]).includes(v);
