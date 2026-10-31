/**
 * Venue of the 3D scene (src/render/venues.ts), picked from `?venue=` at boot. Experimental: URL
 * only (no UI, no saved choice, no i18n string); anything but a known id is the village.
 */
import type { VenueId } from '../render/venues';

const KNOWN: readonly VenueId[] = ['village', 'derborence'];

export function resolveVenue(params: URLSearchParams): VenueId {
  const wanted = params.get('venue');
  return KNOWN.find((id) => id === wanted) ?? 'village';
}
