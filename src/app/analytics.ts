/**
 * Anonymous usage statistics (GoatCounter, https://www.goatcounter.com): one page view per app load plus a
 * handful of named events ("a practice game started"). No cookies, no storage, no IDs, no nicknames, no room
 * codes: GoatCounter gets only a path or event name, the page title and the request itself (it derives country
 * and device type from it and does not store the IP address). Described on the privacy page (public/privacy.html)
 * and declared in Play's Data safety form: change those too when this file changes what is sent.
 *
 * Everything here is best effort: the script loads lazily after the first paint, a blocked script, being offline
 * or any error just turns it off, and nothing in this file ever throws. The service worker does not precache or
 * intercept the script (cross-origin, not a navigation), so offline play is unaffected.
 */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import type { Lang } from '../i18n';

/** All settings in one place. */
export const ANALYTICS = {
  /** Master switch. */
  enabled: true,
  /** GoatCounter site `amunozo-petanque`. */
  endpoint: 'https://amunozo-petanque.goatcounter.com/count',
  script: 'https://gc.zgo.at/count.js',
  /** The page view's path for the website / for the Android app (Trusted Web Activity). */
  webPath: '/',
  appPath: '/app',
  /** Count `/exp/<name>/` previews and frozen `/v/<version>/` copies? No: only the live site and the Play app. */
  countPreviews: false,
  /** Events fired before the script is ready wait here (extra ones are dropped). */
  maxQueued: 12,
  /** Run when the browser is idle, but within this many ms of the first paint. */
  idleTimeoutMs: 3000,
} as const;

export type MatchKind = 'vs-computer' | 'two-players' | 'online';

/** Every event the game sends: a closed list, so nothing personal can slip into a name. */
export type AnalyticsEvent =
  | 'practice-start'
  | `vs-computer-start-${AiDifficulty}`
  | 'two-players-start'
  | 'online-room-created'
  | 'online-joined'
  | `match-finished-${MatchKind}`
  | 'howto-opened'
  | 'pwa-update-applied'
  | `language-${Lang}`;

// ---- pure decisions (unit-tested) ---------------------------------------------------------------

/** localhost, loopback, .local and private-network hosts (the same ones count.js ignores). */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return /(^|\.)localhost$|\.local$|^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^0\.0\.0\.0$|^::1?$/.test(h);
}

/** Path counted for this page load, whatever the URL says (`?online=1`, `?room=ABCDE`, `?source=pwa`, `?dev=1` never matter). */
export function pageviewPath(referrer: string): string {
  // The Play app opens the site as a Trusted Web Activity, and Chrome then reports `android-app://<package>` as the referrer
  // (the app already relies on this to hide its "Install app" link). Display-mode checks would also match
  // browser-installed PWAs, and `?source=pwa` is the manifest's start_url for those, so neither says "Play app".
  return referrer.startsWith('android-app://') ? ANALYTICS.appPath : ANALYTICS.webPath;
}

/** A preview (`…/exp/<name>/`) or a frozen version (`…/v/<version>/`) of the site. */
export function isPreviewPath(pathname: string): boolean {
  return /\/(exp|v)\/[^/]+\//.test(pathname);
}

export interface EnableInput {
  /** Developer mode (`?dev=1`, remembered) or a Vite dev build. */
  devMode: boolean;
  hostname: string;
  pathname: string;
  protocol: string;
  /** `navigator.onLine`. */
  online: boolean;
  /** Test builds only: count even on localhost. */
  forceLocal: boolean;
}

export function shouldEnable(i: EnableInput, config: { enabled: boolean; countPreviews: boolean } = ANALYTICS): boolean {
  if (!config.enabled || i.devMode || !i.online) return false;
  if (i.protocol !== 'https:' && !i.forceLocal) return false;
  if (isLocalHost(i.hostname) && !i.forceLocal) return false;
  if (!config.countPreviews && isPreviewPath(i.pathname)) return false;
  return true;
}

// ---- the GoatCounter script ---------------------------------------------------------------------

interface GoatCounter {
  count(v: { path: string; title: string; event?: boolean }): void;
  get_data?(v?: unknown): Record<string, unknown>;
  [setting: string]: unknown;
}
type GcWindow = Window & { goatcounter?: GoatCounter };

type State = 'idle' | 'loading' | 'ready' | 'off';
let state: State = 'idle';
const queue: AnalyticsEvent[] = [];

function send(path: string, title: string, event: boolean): void {
  try {
    (window as GcWindow).goatcounter?.count({ path, title, event });
  } catch {
    /* never in the player's way */
  }
}

/** Sends one anonymous event (or waits for the script to be ready; dropped when analytics is off). */
export function track(name: AnalyticsEvent): void {
  if (state === 'ready') send(name, name, true);
  else if (state !== 'off' && queue.length < ANALYTICS.maxQueued) queue.push(name);
}

function turnOff(): void {
  state = 'off';
  queue.length = 0;
}

function load(): void {
  const gc: GoatCounter = {
    count: () => undefined,
    endpoint: ANALYTICS.endpoint,
    no_onload: true, // we send the page view ourselves, with a clean path
    no_events: true,
    allow_local: forceLocal,
  };
  (window as GcWindow).goatcounter = gc;
  const s = document.createElement('script');
  s.async = true;
  s.src = ANALYTICS.script;
  s.dataset['goatcounter'] = ANALYTICS.endpoint;
  s.onerror = turnOff; // blocked or offline: the game does not care
  s.onload = () => {
    try {
      const real = (window as GcWindow).goatcounter;
      if (!real || typeof real.count !== 'function') return turnOff();
      // count.js adds the page's query string and the referrer to every request: send neither (invite links carry room codes).
      const getData = real.get_data?.bind(real);
      if (getData) real.get_data = (v) => ({ ...getData(v), q: '', ...(isEvent(v) ? { r: '' } : {}) });
      state = 'ready';
      send(pageviewPath(document.referrer), document.title, false);
      for (const name of queue.splice(0)) send(name, name, true);
    } catch {
      turnOff();
    }
  };
  document.head.append(s);
}

const isEvent = (v: unknown): boolean => typeof v === 'object' && v !== null && (v as { event?: unknown }).event === true;

let forceLocal = false;

/** Starts analytics once per page load (call after the first frame is on screen). Safe to call in any environment. */
export function initAnalytics(o: { devMode: boolean; search: string }): void {
  try {
    if (state !== 'idle') return;
    // Test builds only (ANALYTICS_TEST=1 at build time): `?analytics=force` also counts on localhost. A normal build never reads it.
    forceLocal = __ANALYTICS_TEST__ && new URLSearchParams(o.search).get('analytics') === 'force';
    const on = shouldEnable({
      devMode: o.devMode || import.meta.env.DEV,
      hostname: location.hostname,
      pathname: location.pathname,
      protocol: location.protocol,
      online: navigator.onLine !== false,
      forceLocal,
    });
    if (!on) return turnOff();
    state = 'loading';
    const start = (): void => {
      try {
        load();
      } catch {
        turnOff();
      }
    };
    // After the first paint, when the browser has nothing better to do.
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: ANALYTICS.idleTimeoutMs });
      else setTimeout(start, 1500);
    });
  } catch {
    turnOff();
  }
}
