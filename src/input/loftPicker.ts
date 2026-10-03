/** Segmented loft control (Roll / Half-lob / Lob / Shoot; see LOFT_OPTIONS), fixed at the bottom centre. Styles: src/style.css (lp-*). */
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
  label: string;
  /** Inner SVG markup of the 28x16 icon (stroke = currentColor). */
  icon: string;
}

/** Little dotted trajectory; `controlY` = quadratic control-point y (baseline y = 14): lower = taller arc. */
const arcIcon = (controlY: number): string =>
  `<path d="M3 14 Q14 ${controlY} 25 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 4"/>` +
  `<path d="M3 14 Q14 ${controlY} 25 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>`;

/** Flat fast arc ending on a small target. */
const SHOOT_ICON =
  '<path d="M2 12 Q10 8.5 19 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>' +
  '<path d="M2 12 Q10 8.5 19 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 4"/>' +
  '<circle cx="23" cy="10.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<circle cx="23" cy="10.5" r="0.9" fill="currentColor"/>';

/** The presets offered, in display order (data, not code: add a row to add a preset). */
export const LOFT_OPTIONS: readonly LoftOption[] = [
  { id: 'roll', label: 'Roll', icon: arcIcon(10) },
  { id: 'half', label: 'Half-lob', icon: arcIcon(0) },
  { id: 'lob', label: 'Lob', icon: arcIcon(-12) },
  { id: 'shoot', label: 'Shoot', icon: SHOOT_ICON },
];

const iconSvg = (inner: string): string =>
  `<svg class="lp-icon" viewBox="0 0 28 16" width="28" height="16" aria-hidden="true" focusable="false">${inner}</svg>`;

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
  el.setAttribute('aria-label', 'Throw type');
  for (const type of SHIELDED) el.addEventListener(type, (e) => e.stopPropagation());

  const buttons = LOFT_OPTIONS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lp-btn';
    b.innerHTML = `${iconSvg(o.icon)}<span class="lp-label">${o.label}</span>`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => set(o.id));
    el.append(b);
    return b;
  });

  const render = (): void => {
    LOFT_OPTIONS.forEach((o, i) => buttons[i]?.setAttribute('aria-checked', String(o.id === value)));
  };
  function set(next: LoftPreset): void {
    if (next === value) return;
    value = next;
    render();
    for (const fn of [...listeners]) fn(value);
  }
  render();

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
