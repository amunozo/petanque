import { describe, expect, it } from 'vitest';
import { ANALYTICS, blankReferrer, isLocalHost, isPreviewPath, pageviewPath, shouldEnable, track, type EnableInput } from './analytics';
import { PORTALS, type Portal } from './portal';

const PLAY_REFERRER = 'android-app://com.amunozo.petanque';
/** Every portal mode, from the closed list plus the unknown-site one. */
const PORTAL_MODES: readonly Portal[] = [...PORTALS, 'embed'];

const live: EnableInput = {
  devMode: false,
  hostname: 'petanque.amunozo.com',
  pathname: '/',
  protocol: 'https:',
  online: true,
  forceLocal: false,
};
const on = (o: Partial<EnableInput> = {}, c?: { enabled: boolean; countPreviews: boolean }): boolean => shouldEnable({ ...live, ...o }, c);

describe('pageviewPath', () => {
  it('counts the website as "/" whatever the URL parameters are (they are not even an input)', () => {
    expect(pageviewPath('')).toBe('/');
    expect(pageviewPath('https://www.reddit.com/r/petanque/comments/abc/')).toBe('/');
  });
  it('counts the Play app (Trusted Web Activity, referrer android-app://) as "/app"', () => {
    expect(pageviewPath('android-app://com.amunozo.petanque')).toBe('/app');
    expect(pageviewPath('android-app://com.amunozo.petanque/')).toBe('/app');
  });
  it('counts a page view per portal when the game runs inside one, whatever the referrer says', () => {
    for (const portal of PORTAL_MODES) {
      expect(pageviewPath('', portal)).toBe(ANALYTICS.portalPath + portal);
      expect(pageviewPath('https://www.crazygames.com/game/petanque', portal)).toBe(ANALYTICS.portalPath + portal);
      expect(pageviewPath(PLAY_REFERRER, portal)).toBe(ANALYTICS.portalPath + portal);
    }
    expect(pageviewPath('', 'crazygames')).toBe('/portal/crazygames');
    expect(pageviewPath('', 'embed')).toBe('/portal/embed');
  });
  it('keeps the website and Play app paths when there is no portal (null or omitted)', () => {
    expect(pageviewPath('', null)).toBe('/');
    expect(pageviewPath('https://example.com/page', null)).toBe('/');
    expect(pageviewPath(PLAY_REFERRER, null)).toBe('/app');
  });
});

describe('blankReferrer', () => {
  it('never sends the referrer for events, portal or not (unchanged)', () => {
    expect(blankReferrer(true, null)).toBe(true);
    for (const portal of PORTAL_MODES) expect(blankReferrer(true, portal)).toBe(true);
  });
  it('blanks the page view referrer only in portal mode (the path already says which portal)', () => {
    expect(blankReferrer(false, null)).toBe(false);
    for (const portal of PORTAL_MODES) expect(blankReferrer(false, portal)).toBe(true);
  });
});

describe('isLocalHost', () => {
  it('recognises local and private hosts', () => {
    for (const h of ['localhost', 'LOCALHOST', 'foo.localhost', '127.0.0.1', '[::1]', '::1', '192.168.1.20', '10.0.0.5', '172.20.1.1', '0.0.0.0', 'mypc.local']) expect(isLocalHost(h)).toBe(true);
  });
  it('does not match real hosts', () => {
    for (const h of ['petanque.amunozo.com', 'amunozo.com', '172.32.0.1', 'notlocalhost.com', '1127.0.0.1.example.com']) expect(isLocalHost(h)).toBe(false);
  });
});

describe('isPreviewPath', () => {
  it('flags experiments and frozen versions, at the root or under a sub-path', () => {
    expect(isPreviewPath('/exp/exp-feel/')).toBe(true);
    expect(isPreviewPath('/exp/exp-feel/index.html')).toBe(true);
    expect(isPreviewPath('/v/v0.5.0/')).toBe(true);
    expect(isPreviewPath('/petanque/exp/exp-x/')).toBe(true);
  });
  it('leaves the live site alone', () => {
    expect(isPreviewPath('/')).toBe(false);
    expect(isPreviewPath('/index.html')).toBe(false);
    expect(isPreviewPath('/privacy.html')).toBe(false);
  });
});

describe('shouldEnable', () => {
  it('is on for the live site', () => {
    expect(on()).toBe(true);
  });
  it('is off in developer mode, offline, and when switched off', () => {
    expect(on({ devMode: true })).toBe(false);
    expect(on({ online: false })).toBe(false);
    expect(on({}, { enabled: false, countPreviews: false })).toBe(false);
  });
  it('is off on localhost and private hosts, and off plain http', () => {
    expect(on({ hostname: 'localhost' })).toBe(false);
    expect(on({ hostname: '192.168.1.5' })).toBe(false);
    expect(on({ protocol: 'http:' })).toBe(false);
  });
  it('is off for previews and frozen copies unless asked', () => {
    expect(on({ pathname: '/exp/exp-feel/' })).toBe(false);
    expect(on({ pathname: '/v/v0.5.0/' })).toBe(false);
    expect(on({ pathname: '/exp/exp-feel/' }, { enabled: true, countPreviews: true })).toBe(true);
  });
  it('lets test builds force localhost on, but never developer mode, offline or the master switch', () => {
    expect(on({ hostname: 'localhost', protocol: 'http:', forceLocal: true })).toBe(true);
    expect(on({ hostname: 'localhost', protocol: 'http:', forceLocal: true, devMode: true })).toBe(false);
    expect(on({ hostname: 'localhost', protocol: 'http:', forceLocal: true, online: false })).toBe(false);
    expect(on({ forceLocal: true }, { enabled: false, countPreviews: false })).toBe(false);
  });
});

describe('track', () => {
  it('never throws when analytics was not started', () => {
    expect(() => track('practice-start')).not.toThrow();
  });
});
