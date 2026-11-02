import { describe, expect, it } from 'vitest';
import { resolveVenue } from './venue';

describe('resolveVenue', () => {
  const q = (s: string) => new URLSearchParams(s);

  it('is the village by default', () => {
    expect(resolveVenue(q(''))).toBe('village');
    expect(resolveVenue(q('?lang=fr'))).toBe('village');
  });
  it('?venue=derborence picks the derborence venue', () => {
    expect(resolveVenue(q('?venue=derborence'))).toBe('derborence');
  });
  it('?venue=village and unknown values are the village', () => {
    expect(resolveVenue(q('?venue=village'))).toBe('village');
    expect(resolveVenue(q('?venue=anything'))).toBe('village');
    expect(resolveVenue(q('?venue='))).toBe('village');
  });
  it('falls back to the saved venue when the URL has none', () => {
    expect(resolveVenue(q(''), 'derborence')).toBe('derborence');
    expect(resolveVenue(q('?lang=fr'), 'derborence')).toBe('derborence');
    expect(resolveVenue(q('?lang=fr'), null)).toBe('village');
    expect(resolveVenue(q('?lang=fr'), undefined)).toBe('village');
  });
  it('a valid ?venue= overrides the saved venue', () => {
    expect(resolveVenue(q('?venue=village'), 'derborence')).toBe('village');
    expect(resolveVenue(q('?venue=derborence'), 'village')).toBe('derborence');
  });
  it('an invalid ?venue= is ignored in favour of the saved venue', () => {
    expect(resolveVenue(q('?venue=anything'), 'derborence')).toBe('derborence');
    expect(resolveVenue(q('?venue='), 'derborence')).toBe('derborence');
  });
});
