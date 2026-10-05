import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDevMode } from './devMode';

describe('resolveDevMode', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const q = (s: string) => new URLSearchParams(s);

  it('is off for players by default', () => {
    expect(resolveDevMode(q(''), false)).toBe(false);
  });
  it('?dev=1 turns it on and is remembered; ?dev=0 turns it off', () => {
    expect(resolveDevMode(q('?dev=1'), false)).toBe(true);
    expect(resolveDevMode(q(''), false)).toBe(true);
    expect(resolveDevMode(q('?dev=0'), false)).toBe(false);
    expect(resolveDevMode(q(''), false)).toBe(false);
  });
  it('is always on in dev builds', () => {
    expect(resolveDevMode(q(''), true)).toBe(true);
  });
});
