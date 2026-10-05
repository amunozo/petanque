/** Speaker icon + mute button painting shared by the menu (round button) and the ⋯ sheet. */
import { t } from '../i18n';
import { icon } from './icons';

/** Speaker icon markup (24x24, stroke = currentColor). */
export function soundIconSvg(muted: boolean, size = 22): string {
  return icon(muted ? 'soundOff' : 'soundOn', size);
}

/** Updates a round icon-only mute button's icon + accessible state. */
export function paintMuteButton(btn: HTMLButtonElement, muted: boolean): void {
  btn.innerHTML = soundIconSvg(muted);
  btn.setAttribute('aria-label', muted ? t('sound.unmute') : t('sound.mute'));
  btn.setAttribute('aria-pressed', String(muted));
}
