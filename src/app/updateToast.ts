/** "New version available — Update" toast (styles: "Update toast" section of src/style.css, classes up-*). */
import { onLangChange, t } from '../i18n';
import { button, el, shieldPointer } from './dom';
import { icon } from './icons';

export interface UpdateToast {
  /** Shows the toast; `onUpdate` runs when the player taps "Update" (the toast stays until the page reloads). */
  show(onUpdate: () => void): void;
  hide(): void;
}

export function createUpdateToast(parent: HTMLElement): UpdateToast {
  const root = el('div', 'up-toast');
  root.setAttribute('role', 'status');
  root.hidden = true;
  shieldPointer(root);
  const text = el('span', 'up-text');
  const update = button('up-update', '');
  const later = button('up-close', '');
  later.innerHTML = icon('close', 18);
  root.append(text, update, later);
  parent.append(root);
  const paint = (): void => {
    text.textContent = t('update.text');
    update.textContent = t('update.action');
    later.setAttribute('aria-label', t('update.dismiss'));
  };
  paint();
  onLangChange(paint);

  let updateFn: () => void = () => undefined;
  update.addEventListener('click', () => updateFn());
  later.addEventListener('click', () => {
    root.hidden = true;
  });

  return {
    show(onUpdate) {
      updateFn = onUpdate;
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
  };
}
