/** Segmented loft control (Roll / Half-lob / Lob / Shoot; see LOFT_OPTIONS), fixed at the bottom centre. Styles: src/style.css (lp-*). */
import { onLangChange, t } from '../i18n';
import type { LoftPreset } from '../tuning/config';

export interface LoftPicker {
  readonly element: HTMLElement;
  get(): LoftPreset;
  set(loft: LoftPreset): void;
  /** Returns an unsubscribe function. Fires only on user/`set` changes of the value. */
  onChange(fn: (loft: LoftPreset) => void): () => void;
}

export interface LoftOption {
  id: LoftPreset;
  /** Catalogue key of the short name. */
  label: 'loft.roll' | 'loft.half' | 'loft.lob' | 'loft.shoot';
  /** Inner SVG markup of the 32x20 icon (stroke = currentColor). */
  icon: string;
}

/*
 * Icons in the app's icon language (2px round strokes, currentColor): a faint
 * ground line, the flight as a dotted arc, the roll as a solid line.
 */
const GROUND = '<path d="M2 18.5h28" stroke-width="1.5" opacity="0.35"/>';
const flight = (d: string): string => `<path d="${d}" stroke-width="2.2" stroke-dasharray="0.1 3.6"/>`;

const BALL = (x: number, y = 16): string => `<circle cx="${x}" cy="${y}" r="2.6" fill="currentColor" stroke="none"/>`;
const ROLL_ICON = `${GROUND}<path d="M5 16h14M9 11.5h9" opacity="0.7"/>${BALL(25)}`;
const HALF_ICON = `${GROUND}${flight('M4 16Q11 2 18 15')}<path d="M18 16h4"/>${BALL(26)}`;
const LOB_ICON = `${GROUND}${flight('M5 16Q14 -9 22.5 13.5')}${BALL(24)}`;
const SHOOT_ICON = `${GROUND}${flight('M3 11Q11 8 19 11')}<circle cx="25" cy="14" r="4"/><path d="M21 6.5l1.2 1.6M25 5v2M29 6.5l-1.2 1.6" stroke-width="1.6"/>`;

/** The presets offered, in display order (data, not code: add a row to add a preset). */
export const LOFT_OPTIONS: readonly LoftOption[] = [
  { id: 'roll', label: 'loft.roll', icon: ROLL_ICON },
  { id: 'half', label: 'loft.half', icon: HALF_ICON },
  { id: 'lob', label: 'loft.lob', icon: LOB_ICON },
  { id: 'shoot', label: 'loft.shoot', icon: SHOOT_ICON },
];

export const iconSvg = (inner: string): string =>
  `<svg class="lp-icon" viewBox="0 0 32 20" width="38" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const SHIELDED = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup',
] as const;

/** Creates the picker; append `element` to the page (e.g. document.body or #app). */
export function createLoftPicker(initial: LoftPreset = 'half'): LoftPicker {
  let value = initial;
  const listeners = new Set<(l: LoftPreset) => void>();
  const el = document.createElement('div');
  el.className = 'lp-root';
  el.setAttribute('role', 'radiogroup');

  for (const type of SHIELDED) el.addEventListener(type, (e) => e.stopPropagation());

  const buttons = LOFT_OPTIONS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lp-btn';
    b.innerHTML = `${iconSvg(o.icon)}<span class="lp-label"></span>`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => set(o.id));
    el.append(b);
    return b;
  });

  const render = (): void => {
    el.setAttribute('aria-label', t('loft.aria'));
    LOFT_OPTIONS.forEach((o, i) => {
      const b = buttons[i];
      if (!b) return;
      b.setAttribute('aria-checked', String(o.id === value));
      const label = b.querySelector('.lp-label');
      if (label) label.textContent = t(o.label);
    });
  };
  function set(next: LoftPreset): void {
    if (next === value) return;
    value = next;
    render();
    for (const fn of [...listeners]) fn(value);
  }
  render();
  onLangChange(render);

  return {
    element: el,
    get: () => value,
    set,
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
