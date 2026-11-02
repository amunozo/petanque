/**
 * "Court: Provence / Alps" segmented control (menu and the online host sheet), same look as the
 * match length picker (classes mn-length / mn-seg; court swatches mn-venue-*). The choice is saved
 * (prefs.ts); `onChange` lets the caller switch the 3D scene behind. While a court is loading the
 * label row says so (setLoading).
 */
import { onLangChange, t } from '../i18n';
import { VENUE_IDS, type VenueId } from '../net/venueId';
import { button, el } from './dom';
import { loadVenue, saveVenue } from './prefs';
import { venueName } from './venueText';

export interface VenuePicker {
  element: HTMLElement;
  get(): VenueId;
  /** Re-reads the saved choice (another picker may have changed it) and repaints. */
  refresh(): void;
  /** Shows / hides "Loading court…" next to the label. */
  setLoading(loading: boolean): void;
}

export function createVenuePicker(onChange: (v: VenueId) => void): VenuePicker {
  let value = loadVenue();
  const row = el('div', 'mn-seg');
  row.setAttribute('role', 'radiogroup');
  const names = VENUE_IDS.map((v) => {
    const name = el('span', '');
    const b = button('mn-seg-btn mn-venue-btn', '', () => {
      if (v === value) return;
      value = v;
      saveVenue(v);
      paint();
      onChange(v);
    });
    b.setAttribute('role', 'radio');
    b.dataset['venue'] = v;
    const swatch = el('i', `mn-venue-swatch mn-venue-${v}`);
    swatch.setAttribute('aria-hidden', 'true');
    b.append(swatch, name);
    row.append(b);
    return { b, name };
  });
  const labelText = el('span', '');
  const status = el('span', 'mn-venue-loading');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const label = el('div', 'mn-length-label mn-venue-label');
  label.append(labelText, status);
  const wrap = el('div', 'mn-length mn-venue');
  wrap.append(label, row);

  function paint(): void {
    labelText.textContent = t('venue.label');
    status.textContent = t('venue.loading');
    row.setAttribute('aria-label', t('venue.label'));
    VENUE_IDS.forEach((v, i) => {
      const n = names[i];
      if (!n) return;
      n.name.textContent = venueName(v);
      n.b.setAttribute('aria-checked', String(v === value));
    });
  }
  paint();
  onLangChange(paint);

  return {
    element: wrap,
    get: () => value,
    refresh() {
      value = loadVenue();
      paint();
    },
    setLoading(loading) {
      status.hidden = !loading;
      wrap.classList.toggle('is-loading', loading);
      row.setAttribute('aria-busy', String(loading));
    },
  };
}
