/** Segmented Roll / Half-lob / Lob control, fixed at the bottom centre. Styles: src/style.css (lp-*). */
import type { LoftPreset } from '../tuning/config';

export interface LoftPicker {
  readonly element: HTMLElement;
  get(): LoftPreset;
  set(loft: LoftPreset): void;
  /** Returns an unsubscribe function. Fires only on user/`set` changes of the value. */
  onChange(fn: (loft: LoftPreset) => void): () => void;
}

/** `arc` = the quadratic control-point y of the little trajectory icon (baseline y = 14): lower = taller arc. */
const OPTIONS: readonly { value: LoftPreset; label: string; arc: number }[] = [
  { value: 'roll', label: 'Roll', arc: 10 },
  { value: 'half', label: 'Half-lob', arc: 0 },
  { value: 'lob', label: 'Lob', arc: -12 },
];

const arcIcon = (controlY: number): string =>
  '<svg class="lp-icon" viewBox="0 0 28 16" width="28" height="16" aria-hidden="true" focusable="false">' +
  `<path d="M3 14 Q14 ${controlY} 25 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 4"/>` +
  `<path d="M3 14 Q14 ${controlY} 25 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>` +
  '</svg>';

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

  const buttons = OPTIONS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lp-btn';
    b.innerHTML = `${arcIcon(o.arc)}<span class="lp-label">${o.label}</span>`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => set(o.value));
    el.append(b);
    return b;
  });

  const render = (): void => {
    OPTIONS.forEach((o, i) => buttons[i]?.setAttribute('aria-checked', String(o.value === value)));
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
