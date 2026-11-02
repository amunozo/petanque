/**
 * Venue of the 3D scene (src/render/venues.ts), picked from `?venue=` and/or the saved preference
 * (src/app/prefs.ts, the court picker). Precedence: a valid `?venue=` wins (dev/testing), then the
 * saved preference, then the village. Anything unknown is ignored.
 */
import { DEFAULT_VENUE, isVenueId, type VenueId } from '../net/venueId';

export function resolveVenue(params: URLSearchParams, saved?: VenueId | null): VenueId {
  const wanted = params.get('venue');
  if (isVenueId(wanted)) return wanted;
  return isVenueId(saved) ? saved : DEFAULT_VENUE;
}
