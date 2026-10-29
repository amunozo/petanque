/**
 * Portal mode: the live site embedded in a game portal's iframe
 * (`https://petanque.amunozo.com/?portal=<name>`), or framed by some other site.
 *
 * Portals bring their own rules (no "Install app", no links off their site, no iPhone
 * "Add to Home Screen" hint), so the game asks this file once per page load and adapts.
 * A closed list of names keeps free text out of the analytics paths.
 */

/** Portals that iframe the live site with `?portal=<name>`; a closed list so no free text reaches analytics. */
export const PORTALS = ['crazygames', 'gamedistribution', 'kongregate', 'itch'] as const;
export type Portal = (typeof PORTALS)[number] | 'embed'; // 'embed' = framed by some other / unknown site
export const PORTAL_PARAM = 'portal';

/** The `?portal=` value, or null when the parameter is missing (an empty value is a present parameter). */
function portalParam(search: string): string | null {
  try {
    return new URLSearchParams(search).get(PORTAL_PARAM);
  } catch {
    return null;
  }
}

/**
 * Which portal (if any) this page load belongs to. A known `?portal=` name wins, framed or not;
 * any other value — including an empty one — is "embed", because the portal's name never leaves
 * the game. Without the parameter only being framed says "embed". Every other parameter is ignored.
 *
 * Pure.
 */
export function detectPortal(search: string, framed: boolean): Portal | null {
  const value = portalParam(search);
  if (value === null) return framed ? 'embed' : null;
  const name = value.trim().toLowerCase();
  return (PORTALS as readonly string[]).includes(name) ? (name as Portal) : 'embed';
}

/** Browser: window.self !== window.top; a cross-origin access error counts as framed. Never throws. */
export function isFramed(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.self !== window.top;
  } catch {
    return true; // some other page is the top window and the browser would not let us look
  }
}

/** The page load's portal, read once (the URL and the framing never change while it lasts). Never throws. */
let cached: Portal | null | undefined;

/** Browser, memoized for the page load: detectPortal(location.search, isFramed()). Never throws (null on error). */
export function currentPortal(): Portal | null {
  if (cached !== undefined) return cached;
  try {
    cached = detectPortal(location.search, isFramed());
  } catch {
    cached = null;
  }
  return cached;
}
