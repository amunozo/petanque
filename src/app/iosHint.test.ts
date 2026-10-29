import { beforeEach, describe, expect, it } from 'vitest';
import { dismissIosHint, iosHintWanted, isIosDevice, isIosSafari, noteGameFinished, noteIosHintShown, shouldShowIosHint, type IosHintInput } from './iosHint';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
/** iPadOS 13+ "desktop-class browsing". */
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const IPHONE_EDGE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.87 Mobile/15E148 Safari/605.1.15';
const IPHONE_OPERA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 OPiOS/16.0.15 Mobile/15E148 Safari/9537.53';
const IPHONE_GOOGLE_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1';
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/1;FBDV/iPhone14,5]';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Instagram 330.0.0.20.113 (iPhone14,5)';
const IPHONE_LINE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
/** The Play app (Trusted Web Activity) runs Chrome: same user agent as Android Chrome. */
const ANDROID_TWA =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const base: IosHintInput = {
  userAgent: IPHONE_SAFARI,
  platform: 'iPhone',
  maxTouchPoints: 5,
  navigatorStandalone: false,
  displayModeStandalone: false,
  finishedGame: true,
  dismissed: false,
  shownThisLoad: false,
  portal: false,
};
const show = (o: Partial<IosHintInput> = {}): boolean => shouldShowIosHint({ ...base, ...o });

describe('shouldShowIosHint: which devices', () => {
  it('shows on iPhone Safari', () => expect(show()).toBe(true));
  it('shows on iPad Safari (iPad UA)', () => expect(show({ userAgent: IPAD_SAFARI, platform: 'iPad' })).toBe(true));
  it('shows on iPadOS Safari that reports a Mac (MacIntel + multi-touch)', () =>
    expect(show({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true));
  it('never on desktop Safari on a Mac without touch', () =>
    expect(show({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false));
  it('never on Android Chrome', () => expect(show({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false));
  it('never in the Android Play app (TWA)', () => expect(show({ userAgent: ANDROID_TWA, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false));
  it('never on desktop Chrome', () => expect(show({ userAgent: DESKTOP_CHROME, platform: 'Win32', maxTouchPoints: 0 })).toBe(false));
});

describe('shouldShowIosHint: only real Safari', () => {
  const others: Record<string, string> = {
    'iPhone Chrome': IPHONE_CHROME,
    'iPhone Firefox': IPHONE_FIREFOX,
    'iPhone Edge': IPHONE_EDGE,
    'iPhone Opera': IPHONE_OPERA,
    'Google app': IPHONE_GOOGLE_APP,
    'Facebook webview': IPHONE_FACEBOOK,
    'Instagram webview': IPHONE_INSTAGRAM,
    'Line webview': IPHONE_LINE,
  };
  for (const [name, userAgent] of Object.entries(others)) {
    it(`not in ${name}`, () => expect(show({ userAgent })).toBe(false));
  }
  it('isIosSafari needs both Version/ and Safari/', () => {
    expect(isIosSafari(IPHONE_SAFARI, 'iPhone', 5)).toBe(true);
    expect(isIosSafari(IPHONE_SAFARI.replace(' Safari/604.1', ''), 'iPhone', 5)).toBe(false);
    expect(isIosSafari(IPHONE_SAFARI.replace('Version/17.5 ', ''), 'iPhone', 5)).toBe(false);
  });
  it('isIosDevice: iPod counts, a MacIntel with a single touch point does not', () => {
    expect(isIosDevice('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 'iPod', 5)).toBe(true);
    expect(isIosDevice(MAC_UA, 'MacIntel', 1)).toBe(false);
  });
});

describe('shouldShowIosHint: state', () => {
  it('not when already installed (navigator.standalone)', () => expect(show({ navigatorStandalone: true })).toBe(false));
  it('not when installed (display-mode: standalone)', () => expect(show({ displayModeStandalone: true })).toBe(false));
  it('navigator.standalone undefined (older / non-iOS) does not block', () => expect(show({ navigatorStandalone: undefined })).toBe(true));
  it('not before the first finished game', () => expect(show({ finishedGame: false })).toBe(false));
  it('not once dismissed', () => expect(show({ dismissed: true })).toBe(false));
  it('not twice in one page load', () => expect(show({ shownThisLoad: true })).toBe(false));
});

describe('shouldShowIosHint: never inside a portal iframe', () => {
  it('never shows in portal mode, even with every other condition saying show', () => {
    expect(
      show({
        portal: true,
        userAgent: IPHONE_SAFARI,
        platform: 'iPhone',
        maxTouchPoints: 5,
        navigatorStandalone: false,
        displayModeStandalone: false,
        finishedGame: true,
        dismissed: false,
        shownThisLoad: false,
      }),
    ).toBe(false);
  });
  it('still shows on the site itself (portal: false)', () => expect(show({ portal: false })).toBe(true));
});

describe('stored state', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: IPHONE_SAFARI, platform: 'iPhone', maxTouchPoints: 5, standalone: false },
    });
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
  });

  // The module-level session flags persist between tests, so the steps run in one ordered test.
  it('waits for a finished game, shows once per load, and never after dismissal; works without storage', () => {
    expect(iosHintWanted()).toBe(false); // first launch
    noteGameFinished();
    expect(iosHintWanted()).toBe(true);
    noteIosHintShown();
    expect(iosHintWanted()).toBe(false); // once per page load
    dismissIosHint();
    expect(iosHintWanted()).toBe(false);

    // Storage that throws: the in-memory flags still answer, and nothing throws.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    expect(() => noteGameFinished()).not.toThrow();
    expect(() => dismissIosHint()).not.toThrow();
    expect(iosHintWanted()).toBe(false);
  });
});
