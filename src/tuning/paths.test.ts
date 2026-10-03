import { describe, expect, it } from 'vitest';
import {
  assignDeep,
  cloneDeep,
  diffFromDefaults,
  getPath,
  leafPaths,
  mergeValidated,
  setPath,
} from './paths';

const defaults = () => ({ a: { b: 1, c: 'x', d: { e: true } }, f: 2 });

describe('getPath / setPath', () => {
  it('reads nested values and returns undefined for missing paths', () => {
    const o = defaults();
    expect(getPath(o, 'a.b')).toBe(1);
    expect(getPath(o, 'a.d.e')).toBe(true);
    expect(getPath(o, 'a.zzz')).toBeUndefined();
    expect(getPath(o, 'zzz.b')).toBeUndefined();
    expect(getPath(o, 'f.g')).toBeUndefined();
    expect(getPath(o, '__proto__')).toBeUndefined();
  });
  it('sets only existing leaves', () => {
    const o = defaults();
    expect(setPath(o, 'a.b', 5)).toBe(true);
    expect(o.a.b).toBe(5);
    expect(setPath(o, 'a.nope', 5)).toBe(false);
    expect(setPath(o, 'a', 5)).toBe(false); // would replace a sub-object
    expect(setPath(o, 'x.y', 5)).toBe(false);
    expect(Object.keys(o)).toEqual(['a', 'f']);
  });
});

describe('leafPaths', () => {
  it('lists leaves', () => {
    expect(leafPaths(defaults())).toEqual(['a.b', 'a.c', 'a.d.e', 'f']);
  });
});

describe('diffFromDefaults', () => {
  it('is empty when equal', () => {
    expect(diffFromDefaults(defaults(), defaults())).toEqual({});
  });
  it('contains only changed leaves, nested', () => {
    const cur = defaults();
    cur.a.d.e = false;
    cur.f = 3;
    expect(diffFromDefaults(cur, defaults())).toEqual({ a: { d: { e: false } }, f: 3 });
  });
});

describe('mergeValidated', () => {
  it('applies valid values', () => {
    const t = defaults();
    const r = mergeValidated(t as never, defaults(), { a: { b: 9 }, f: 4 });
    expect(t.a.b).toBe(9);
    expect(t.f).toBe(4);
    expect(r.applied.sort()).toEqual(['a.b', 'f']);
    expect(r.rejected).toEqual([]);
  });
  it('ignores unknown paths and type mismatches', () => {
    const t = defaults();
    const r = mergeValidated(t as never, defaults(), {
      a: { b: 'nope', c: 'y', zzz: 1 },
      f: Number.NaN,
      unknown: { q: 1 },
      __proto__: { polluted: true },
    });
    expect(t.a.b).toBe(1);
    expect(t.a.c).toBe('y');
    expect(t.f).toBe(2);
    expect(r.applied).toEqual(['a.c']);
    expect(r.rejected.sort()).toEqual(['a.b', 'a.zzz', 'f', 'unknown']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
  it('rejects an object where a leaf is expected and vice versa', () => {
    const t = defaults();
    const r = mergeValidated(t as never, defaults(), { f: { x: 1 }, a: 5 });
    expect(r.applied).toEqual([]);
    expect(r.rejected.sort()).toEqual(['a', 'f']);
  });
  it('honours the validate veto', () => {
    const t = defaults();
    const r = mergeValidated(t as never, defaults(), { a: { c: 'bad' } }, (_p, v) => v !== 'bad');
    expect(t.a.c).toBe('x');
    expect(r.rejected).toEqual(['a.c']);
  });
  it('tolerates non-object patches', () => {
    const t = defaults();
    expect(mergeValidated(t as never, defaults(), null).applied).toEqual([]);
    expect(mergeValidated(t as never, defaults(), [1, 2]).applied).toEqual([]);
  });
});

describe('cloneDeep / assignDeep', () => {
  it('clones independently', () => {
    const a = defaults();
    const b = cloneDeep(a);
    b.a.b = 99;
    expect(a.a.b).toBe(1);
  });
  it('assigns in place keeping object identity', () => {
    const t = defaults();
    const inner = t.a;
    assignDeep(t as never, { a: { b: 7, c: 'z', d: { e: false } }, f: 8 });
    expect(t.a).toBe(inner);
    expect(t.a.b).toBe(7);
    expect(t.a.d.e).toBe(false);
    expect(t.f).toBe(8);
  });
});
