import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { roomDetailText, venueName } from './venueText';

describe('venueText', () => {
  afterEach(() => setLang('en'));

  it('names the courts with their player-facing names', () => {
    setLang('en');
    expect(venueName('village')).toBe('Provence');
    expect(venueName('derborence')).toBe('Alps');
  });
  it('never shows the internal id', () => {
    for (const lang of ['en', 'fr', 'es', 'it', 'pt'] as const) {
      setLang(lang);
      expect(venueName('derborence').toLowerCase()).not.toContain('derborence');
    }
  });
  it('builds the lobby line: length · points · court', () => {
    setLang('en');
    expect(roomDetailText('quick', 7, 'derborence')).toBe('Quick · 7 · Alps');
    expect(roomDetailText('standard', 13, 'village')).toBe('Standard · 13 · Provence');
    setLang('fr');
    expect(roomDetailText('quick', 7, 'derborence')).toMatch(/· 7 · Alpes$/);
  });
});
