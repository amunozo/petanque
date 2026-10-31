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
});
