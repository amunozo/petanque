import { describe, expect, it } from 'vitest';
import { PORTALS, PORTAL_PARAM, detectPortal } from './portal';

/** `?portal=<value>` as the browser would hand it over. */
const withPortal = (value: string): string => `?${PORTAL_PARAM}=${value}`;
const detect = (search: string, framed = false): ReturnType<typeof detectPortal> => detectPortal(search, framed);

describe('detectPortal: a known portal in ?portal=', () => {
  it('recognises every portal of the closed list, framed or not', () => {
    for (const portal of PORTALS) {
      expect(detect(withPortal(portal))).toBe(portal);
      expect(detect(withPortal(portal), true)).toBe(portal);
    }
  });
  it('matches case-insensitively and trims surrounding spaces', () => {
    expect(detect(withPortal('CrazyGames'))).toBe('crazygames');
    expect(detect(withPortal('GAMEDISTRIBUTION'))).toBe('gamedistribution');
    expect(detect(withPortal('  kongregate  '))).toBe('kongregate');
    expect(detect(withPortal('%20itch%20'))).toBe('itch');
    expect(detect(withPortal('  CrazyGames  '), true)).toBe('crazygames');
  });
});

describe('detectPortal: framed by an unknown site', () => {
  it('treats any other ?portal= value as "embed" (the portal name never reaches analytics)', () => {
    expect(detect(withPortal('poki'))).toBe('embed');
    expect(detect(withPortal('poki'), true)).toBe('embed');
    expect(detect(withPortal('steam'))).toBe('embed');
    expect(detect(withPortal('embed'))).toBe('embed');
  });
  it('treats an empty ?portal= as "embed"', () => {
    expect(detect(withPortal(''))).toBe('embed');
    expect(detect(withPortal(''), true)).toBe('embed');
    expect(detect(withPortal('   '))).toBe('embed');
  });
  it('is "embed" when framed and the URL says nothing about a portal', () => {
    expect(detect('', true)).toBe('embed');
    expect(detect('?', true)).toBe('embed');
    expect(detect('?room=K7M9P', true)).toBe('embed');
  });
});

describe('detectPortal: the plain website', () => {
  it('is null when it is not framed and there is no portal parameter', () => {
    expect(detect('')).toBeNull();
    expect(detect('?')).toBeNull();
    expect(detect('?room=K7M9P')).toBeNull();
    expect(detect('?dev=1')).toBeNull();
  });
  it('ignores every other parameter, and a parameter that merely looks like it', () => {
    expect(detect('?room=K7M9P&dev=1')).toBeNull();
    expect(detect('?xportal=crazygames')).toBeNull();
    expect(detect(`?x${PORTAL_PARAM}=crazygames`)).toBeNull();
    expect(detect('?portals=crazygames')).toBeNull();
  });
  it('finds the portal among the other parameters, whatever the order', () => {
    expect(detect(`?room=K7M9P&${PORTAL_PARAM}=crazygames&dev=1`)).toBe('crazygames');
    expect(detect(`?dev=1&${PORTAL_PARAM}=itch&room=K7M9P`)).toBe('itch');
    expect(detect(`?room=K7M9P&${PORTAL_PARAM}=`)).toBe('embed');
  });
});
