/** Language chips (EN FR ES IT PT): one segmented row, used in the start menu and the ⋯ sheet. Styles: "Language picker" in src/style.css (lg-*). */
import { getLang, LANG_CODES, LANG_NAMES, LANGS, onLangChange, setLang, t } from '../i18n';
import { button, el } from './dom';
import { saveLang } from './prefs';

export interface LangPicker {
  readonly element: HTMLElement;
}

export function createLangPicker(extraClass = ''): LangPicker {
  const row = el('div', `lg-row ${extraClass}`.trim());
  row.setAttribute('role', 'radiogroup');
  const chips = LANGS.map((lang) => {
    const b = button('lg-chip', LANG_CODES[lang], () => {
      saveLang(lang);
      setLang(lang);
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', LANG_NAMES[lang]);
    b.lang = lang;
    row.append(b);
    return b;
  });
  const paint = (): void => {
    row.setAttribute('aria-label', t('lang.label'));
    LANGS.forEach((lang, i) => chips[i]?.setAttribute('aria-checked', String(lang === getLang())));
  };
  paint();
  onLangChange(paint);
  return { element: row };
}
