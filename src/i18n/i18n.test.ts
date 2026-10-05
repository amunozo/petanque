import { afterEach, describe, expect, it } from 'vitest';
import { catalogue, detectLang, formatNumber, LANGS, resolveLang, setLang, t, tIn, type Message } from './index';

const placeholders = (m: Message): string[] => {
  const text = typeof m === 'string' ? m : `${m.one}\n${m.other}`;
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1] as string))].sort();
};

describe('catalogues', () => {
  const en = catalogue('en');
  for (const lang of LANGS) {
    it(`${lang}: same keys, same {params}, same plural shape as English`, () => {
      const cat = catalogue(lang);
      expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const a = en[key];
        const b = cat[key];
        expect(typeof b, key).toBe(typeof a);
        const strip = (m: Message): string[] => placeholders(m).filter((p) => p !== 'count');
        expect(strip(b), `${lang}.${key}`).toEqual(strip(a));
        if (typeof b === 'string') expect(b.trim(), `${lang}.${key}`).not.toBe('');
      }
    });
  }
});

describe('language choice', () => {
  it('detects from a preference list', () => {
    expect(detectLang(['fr-CA', 'en'])).toBe('fr');
    expect(detectLang(['de-DE', 'pt-BR', 'en'])).toBe('pt');
    expect(detectLang(['ja'])).toBe('en');
    expect(detectLang(undefined)).toBe('en');
    expect(detectLang([])).toBe('en');
  });
  it('explicit param beats saved beats browser', () => {
    expect(resolveLang({ param: 'it', saved: 'fr', preferred: ['es'] })).toBe('it');
    expect(resolveLang({ param: 'xx', saved: 'fr', preferred: ['es'] })).toBe('fr');
    expect(resolveLang({ param: null, saved: null, preferred: ['es-MX'] })).toBe('es');
  });
});

describe('t()', () => {
  afterEach(() => setLang('en'));
  it('interpolates and picks plural forms', () => {
    expect(tIn('en', 'end.scores', { name: 'Blue', count: 1 })).toBe('Blue scores 1 point');
    expect(tIn('en', 'end.scores', { name: 'Blue', count: 2 })).toBe('Blue scores 2 points');
    expect(tIn('fr', 'over.after', { count: 1 })).toBe('en 1 mène');
    expect(tIn('fr', 'over.after', { count: 4 })).toBe('en 4 mènes');
    expect(tIn('es', 'match.dots', { name: 'Azul', count: 1, total: 3 })).toBe('Azul: queda 1 de 3 bolas');
    expect(tIn('it', 'end.scores', { name: 'Blu', count: 3 })).toBe('Blu segna 3 punti');
  });
  it('follows the current language and formats numbers', () => {
    setLang('fr');
    expect(t('menu.howto')).toBe('Comment jouer');
    expect(t('turn.jack.hint', { lo: 6, hi: 10 })).toContain('6–10');
    expect(formatNumber(1.5, 1)).toBe('1,5');
    setLang('en');
    expect(formatNumber(1.5, 1)).toBe('1.5');
    expect(formatNumber(12.25, 1, 'pt')).toBe('12,3');
  });
});
