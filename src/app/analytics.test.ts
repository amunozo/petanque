import { describe, expect, it } from 'vitest';
import { isLocalHost, isPreviewPath, pageviewPath, shouldEnable, track, type EnableInput } from './analytics';

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
