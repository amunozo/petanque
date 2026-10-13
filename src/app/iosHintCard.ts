/**
 * The "Add to Home Screen" card (rules and state: iosHint.ts; styles: "iOS hint" section of src/style.css, classes ih-*).
 * A small non-modal card at the bottom of the menu, under the menu's buttons' reach: it never blocks starting a game.
 */
import { onLangChange, t } from '../i18n';
import { track } from './analytics';
import { button, el, shieldPointer } from './dom';
import { dismissIosHint, IOS_HINT, iosHintWanted, noteIosHintShown } from './iosHint';
import { icon } from './icons';

export interface IosHintCard {
  /** The menu just appeared: shows the card (after a short delay) when the rules allow it. */
  menuShown(): void;
  /** A game starts (or anything else covers the menu): the card goes away, without being dismissed for good. */
  hide(): void;
}

/** iOS's share glyph: a square open at the top with an arrow rising out of it. */
const SHARE_ICON =
  '<svg class="ih-share" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8.5 9.5H7a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V11A1.5 1.5 0 0 0 17 9.5h-1.5"/>' +
  '<path d="M12 14.5V3.5M8.5 7L12 3.5 15.5 7"/></svg>';

export function createIosHintCard(parent: HTMLElement): IosHintCard {
  const root = el('div', 'ih-card');
  root.setAttribute('role', 'status');
  root.hidden = true;
  shieldPointer(root);
  const text = el('p', 'ih-text');
  const ok = button('ih-ok', '');
  const close = button('ih-close', '');
  close.innerHTML = icon('close', 18);
  root.append(text, ok, close);
  parent.append(root);

  /** The translated sentence with the share icon where `{share}` stands (nodes, never innerHTML for the text). */
  const paint = (): void => {
    const [before = '', after = ''] = t('iosHint.text', { share: IOS_HINT.shareToken }).split(IOS_HINT.shareToken);
    const glyph = el('span', 'ih-glyph');
    glyph.innerHTML = SHARE_ICON;
    text.replaceChildren(before, glyph, after);
    ok.textContent = t('iosHint.ok');
    close.setAttribute('aria-label', t('iosHint.close'));
  };
  paint();
  onLangChange(paint);

  let timer: number | undefined;
  const hide = (): void => {
    window.clearTimeout(timer);
    root.hidden = true;
  };
  const dismiss = (): void => {
    dismissIosHint();
    track('ios-hint-dismissed');
    hide();
  };
  ok.addEventListener('click', dismiss);
  close.addEventListener('click', dismiss);

  return {
    menuShown() {
      hide();
      if (!iosHintWanted()) return;
      timer = window.setTimeout(() => {
        if (!document.body.classList.contains('is-menu') || !iosHintWanted()) return; // left the menu meanwhile
        noteIosHintShown();
        root.hidden = false;
        track('ios-hint-shown');
      }, IOS_HINT.showDelayMs);
    },
    hide,
  };
}
