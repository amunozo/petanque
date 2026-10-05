/**
 * Tiny typed i18n: one catalogue per language (messages/*.ts), typed keys,
 * {param} interpolation, plural forms, localised numbers. The only DOM it
 * touches is <html lang>; storage and URL handling live in the app (prefs.ts, main.ts).
 */
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { it } from './messages/it';
import { pt } from './messages/pt';
import type { Catalogue, Lang, Message, MessageKey, ParamValues, TArgs } from './types';

export type { Catalogue, Lang, Message, MessageKey, ParamsOf, TArgs } from './types';

export const LANGS: readonly Lang[] = ['en', 'fr', 'es', 'it', 'pt'];
export const DEFAULT_LANG: Lang = 'en';
/** Native names (language picker aria labels). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português' };
/** Short codes shown on the picker chips. */
export const LANG_CODES: Record<Lang, string> = { en: 'EN', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT' };

const CATALOGUES: Record<Lang, Catalogue> = { en, fr, es, it, pt };
/** Locale used for numbers and plural rules (Portuguese: pt-PT keeps "0 pontos" plural, decimal comma either way). */
const LOCALE: Record<Lang, string> = { en: 'en', fr: 'fr', es: 'es', it: 'it', pt: 'pt-PT' };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** First supported language in a preference list such as `navigator.languages` ("fr-CA" -> fr); English when none matches. */
export function detectLang(preferred: readonly string[] | undefined | null): Lang {
  for (const tag of preferred ?? []) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(primary)) return primary;
  }
  return DEFAULT_LANG;
}

/** Language at startup: an explicit `?lang=` wins, then the saved choice, then the browser's languages. */
export function resolveLang(o: { param?: string | null; saved?: string | null; preferred?: readonly string[] | null }): Lang {
  if (isLang(o.param)) return o.param;
  if (isLang(o.saved)) return o.saved;
  return detectLang(o.preferred);
}

let current: Lang = DEFAULT_LANG;
const listeners = new Set<(lang: Lang) => void>();

export const getLang = (): Lang => current;

/** Switches the language (also <html lang>) and tells every listener. */
export function setLang(lang: Lang): void {
  const changed = lang !== current;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (changed) for (const fn of [...listeners]) fn(lang);
}

/** Runs `fn` whenever the language changes; returns an unsubscribe function. */
export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const pluralRules = new Map<Lang, Intl.PluralRules>();
function pluralForm(lang: Lang, count: number): 'one' | 'other' {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE[lang]);
    pluralRules.set(lang, rules);
  }
  return rules.select(count) === 'one' ? 'one' : 'other';
}

/** Replaces {name} with params[name]; numbers are formatted for the language. Unknown names stay as written. */
function interpolate(text: string, params: Readonly<Record<string, ParamValues>>, lang: Lang): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : typeof v === 'number' ? formatNumber(v, undefined, lang) : v;
  });
}

function render(message: Message, params: Readonly<Record<string, ParamValues>>, lang: Lang): string {
  if (typeof message === 'string') return interpolate(message, params, lang);
  const count = Number(params['count']);
  const form = Number.isFinite(count) ? pluralForm(lang, count) : 'other';
  return interpolate(message[form], params, lang);
}

/** Translates `key` into the current language (or `lang`). Plural keys read the `count` param. */
export function t<K extends MessageKey>(key: K, ...args: TArgs<K>): string {
  return tIn(current, key, ...args);
}

export function tIn<K extends MessageKey>(lang: Lang, key: K, ...args: TArgs<K>): string {
  const params = (args[0] ?? {}) as Readonly<Record<string, ParamValues>>;
  return render(CATALOGUES[lang][key], params, lang);
}

const numberFormats = new Map<string, Intl.NumberFormat>();
/** Localised number: decimal comma in fr/es/it/pt, point in en. `decimals` fixes the digits after the separator. */
export function formatNumber(value: number, decimals?: number, lang: Lang = current): string {
  const k = `${lang}:${decimals ?? 'auto'}`;
  let f = numberFormats.get(k);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], decimals === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(k, f);
  }
  return f.format(value);
}

/** Catalogue for a language (tests, tooling). */
export const catalogue = (lang: Lang): Catalogue => CATALOGUES[lang];
