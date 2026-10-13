/**
 * "Add to Home Screen" hint for iPhone / iPad Safari (the card itself: iosHintCard.ts).
 *
 * Safari on iOS has no install prompt, so the only way to get the game full screen (and offline, without the
 * browser bars) is Share -> "Add to Home Screen". This file holds the pure decision (unit-tested) and the tiny
 * bits of state it needs; it never throws and the game works without storage.
 *
 * The card shows ONLY on real iOS Safari that is not already installed, after the player has finished a game
 * (a match, or leaving practice) and has not closed the card before. Never on Android, in the Play app (TWA),
 * on desktop, or in other iOS browsers / in-app webviews.
 */

/** All settings in one place. */
export const IOS_HINT = {
  /** Set once the player closed the card (any value): never shown again on this device. */
  dismissedKey: 'petanque.iosHintDismissed',
  /** Set once the player finished a game; the card waits for the next time the menu shows. */
  finishedKey: 'petanque.gamesFinished',
  /** Wait this long after the menu appears, so the card never competes with the menu's own entrance. */
  showDelayMs: 700,
  /** Cards need a touch screen: iPadOS Safari reports a Mac user agent and is told apart by its touch points. */
  minTouchPointsForIpadOs: 2,
  /** Where the share icon goes inside the translated sentence (`{share}`). */
  shareToken: '⁣',
} as const;

export interface IosHintInput {
  userAgent: string;
  /** `navigator.platform`. */
  platform: string;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** `navigator.standalone` (iOS home-screen app). */
  navigatorStandalone: boolean | undefined;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone: boolean;
  /** The player finished a game earlier (stored flag, or this page load). */
  finishedGame: boolean;
  /** The player closed the card before (stored flag, or this page load when storage fails). */
  dismissed: boolean;
  /** The card was already shown during this page load (it shows at most once per load, whether or not storage works). */
  shownThisLoad: boolean;
}

/** An iPhone, an iPod or an iPad (iPadOS 13+ pretends to be a Mac: "MacIntel" with a multi-touch screen). */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/\b(iPhone|iPod|iPad)\b/.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints >= IOS_HINT.minTouchPointsForIpadOs;
}

/**
 * The real Safari app. Every iOS browser is WebKit, so they differ only by tokens: Safari itself has both
 * `Version/` and `Safari/`; Chrome, Firefox, Edge, Opera and Google's app (CriOS, FxiOS, EdgiOS, OPiOS, GSA)
 * and most in-app webviews (Facebook, Instagram, Line, ...) lack `Version/` or `Safari/` or add their own token.
 */
export function isIosSafari(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (!isIosDevice(userAgent, platform, maxTouchPoints)) return false;
  if (/\b(CriOS|FxiOS|EdgiOS|EdgA|Edg|OPiOS|OPT|GSA|FBAN|FBAV|FB_IAB|Instagram|Line|Snapchat|Twitter|MicroMessenger|DuckDuckGo|YaBrowser|Brave)\b/.test(userAgent)) return false;
  return userAgent.includes('Safari/') && userAgent.includes('Version/');
}

/** Should the hint be offered now (on the menu)? */
export function shouldShowIosHint(i: IosHintInput): boolean {
  if (i.dismissed || i.shownThisLoad || !i.finishedGame) return false;
  if (i.navigatorStandalone === true || i.displayModeStandalone) return false;
  return isIosSafari(i.userAgent, i.platform, i.maxTouchPoints);
}

// ---- state (best effort: storage can be blocked, e.g. private mode) -------------------------------

/** Kept in memory too: with blocked storage the flags still hold for this page load. */
const session = { dismissed: false, finished: false, shown: false };

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage blocked: the in-memory flag still holds for this page load */
  }
}

/** A game was finished (match over, or the player left practice). Call from anywhere; cheap and safe. */
export function noteGameFinished(): void {
  session.finished = true;
  writeFlag(IOS_HINT.finishedKey);
}

/** The card went on screen: not again until the next page load. */
export function noteIosHintShown(): void {
  session.shown = true;
}

export function dismissIosHint(): void {
  session.dismissed = true;
  writeFlag(IOS_HINT.dismissedKey);
}

/** Reads the browser's facts and the stored state, then decides. */
export function iosHintWanted(): boolean {
  try {
    return shouldShowIosHint({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      displayModeStandalone: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
      finishedGame: session.finished || readFlag(IOS_HINT.finishedKey),
      dismissed: session.dismissed || readFlag(IOS_HINT.dismissedKey),
      shownThisLoad: session.shown,
    });
  } catch {
    return false;
  }
}
