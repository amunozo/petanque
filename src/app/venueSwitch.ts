/**
 * Switches the court of the 3D scene and tracks whether one is still loading (the Alps art is a
 * ~6 MB download the first time). Matches never wait for it: the plain court is playable and the
 * art pops in when ready. "Loading court…" shows only if a load takes longer than LOADING_DELAY_MS
 * (a cached court switches without a flash of the indicator): in the menu's court picker, and as a
 * small pill under the ⋯ button during a game (inside #hud, hidden with it on the menu).
 */
import { onLangChange, t } from '../i18n';
import type { VenueId } from '../net/venueId';
import type { PitchScene } from '../render';
import { el } from './dom';

/** A load shorter than this never shows the indicator. */
const LOADING_DELAY_MS = 250;

export interface VenueSwitch {
  /** Switch the scene to this court (latest call wins; no-op if it is already there). */
  set(id: VenueId): void;
  /** Also follow a load started elsewhere (the boot venue: scene.ready()). */
  track(p: Promise<void>): void;
  onLoading(fn: (loading: boolean) => void): void;
}

export function createVenueSwitch(scene: Pick<PitchScene, 'setVenue'>, hudRoot: HTMLElement): VenueSwitch {
  const pill = el('div', 'vn-loading');
  pill.setAttribute('role', 'status');
  pill.hidden = true;
  const text = el('span', '');
  pill.append(el('i', 'vn-spinner'), text);
  hudRoot.append(pill);
  const paint = (): void => {
    text.textContent = t('venue.loading');
  };
  paint();
  onLangChange(paint);

  const listeners: ((loading: boolean) => void)[] = [];
  let token = 0;
  let shown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (loading: boolean): void => {
    if (loading === shown) return;
    shown = loading;
    pill.hidden = !loading;
    for (const fn of listeners) fn(loading);
  };
  const track = (p: Promise<void>): void => {
    const mine = ++token;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (mine === token) show(true);
    }, LOADING_DELAY_MS);
    // setVenue/ready never reject, but be safe: a failed load must not leave the indicator up.
    void p.catch(() => undefined).then(() => {
      if (mine !== token) return;
      clearTimeout(timer);
      show(false);
    });
  };
  return {
    set: (id) => track(scene.setVenue(id)),
    track,
    onLoading(fn) {
      listeners.push(fn);
    },
  };
}
