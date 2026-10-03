/** Start menu + confirm dialog (plain DOM overlays; styles in the "Menu" section of src/style.css, classes mn-*). */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import { button, el, shieldPointer } from './dom';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './prefs';
import { paintMuteButton } from './soundIcon';

export interface Menu {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  /** Second line of the "2 players" button, e.g. "First to 13". */
  setMatchInfo(text: string): void;
  onPractice(fn: () => void): void;
  onMatch(fn: () => void): void;
  /** "1 player vs computer" was chosen, with the difficulty selected in the menu. */
  onVsComputer(fn: (difficulty: AiDifficulty) => void): void;
  /** Speaker button in the top-right corner. */
  setMuted(muted: boolean): void;
  onMute(fn: () => void): void;
}

const DIFFICULTY_LABEL: Record<AiDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Inline Easy / Medium / Hard segmented control; the choice is remembered (localStorage). */
function difficultyPicker(): { element: HTMLElement; get(): AiDifficulty } {
  let value = loadDifficulty();
  const row = el('div', 'mn-seg');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Computer difficulty');
  const buttons = DIFFICULTIES.map((d) => {
    const b = button('mn-seg-btn', DIFFICULTY_LABEL[d], () => {
      value = d;
      saveDifficulty(d);
      render();
    });
    b.setAttribute('role', 'radio');
    b.dataset['level'] = d;
    row.append(b);
    return b;
  });
  function render(): void {
    DIFFICULTIES.forEach((d, i) => buttons[i]?.setAttribute('aria-checked', String(d === value)));
  }
  render();
  return { element: row, get: () => value };
}

function choice(cls: string, title: string, sub: string): { btn: HTMLButtonElement; sub: HTMLElement } {
  const btn = button(`mn-btn ${cls}`, '');
  const subEl = el('span', 'mn-btn-sub', sub);
  btn.append(el('span', 'mn-btn-title', title), subEl);
  return { btn, sub: subEl };
}

export function createMenu(parent: HTMLElement, buildId: string): Menu {
  const root = el('div', 'mn-root');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Main menu');
  shieldPointer(root);

  // Placeholder logo: a jack and one boule per team, drawn in CSS.
  const logo = el('div', 'mn-logo');
  logo.setAttribute('aria-hidden', 'true');
  logo.append(el('i', 'mn-ball mn-ball-a'), el('i', 'mn-ball mn-jack'), el('i', 'mn-ball mn-ball-b'));

  const practice = choice('mn-practice', 'Practice', 'Throw at the jack, on your own');
  const match = choice('mn-match', '2 players (same phone)', 'Pass and play');
  const vs = choice('mn-vs', '1 player vs computer', 'You are Blue');
  const level = difficultyPicker();
  const vsBox = el('div', 'mn-vs-box');
  vsBox.append(vs.btn, level.element);
  const buttons = el('div', 'mn-buttons');
  buttons.append(practice.btn, vsBox, match.btn);

  const muteBtn = el('button', 'mn-mute');
  muteBtn.type = 'button';
  paintMuteButton(muteBtn, false);

  root.append(muteBtn, logo, el('h1', 'mn-title', 'Pétanque'), buttons, el('div', 'mn-build', buildId));
  parent.append(root);

  let practiceFn: () => void = () => undefined;
  let matchFn: () => void = () => undefined;
  let vsFn: (d: AiDifficulty) => void = () => undefined;
  let muteFn: () => void = () => undefined;
  practice.btn.addEventListener('click', () => practiceFn());
  match.btn.addEventListener('click', () => matchFn());
  vs.btn.addEventListener('click', () => vsFn(level.get()));
  muteBtn.addEventListener('click', () => muteFn());

  return {
    show() {
      root.hidden = false;
      document.body.classList.add('is-menu');
    },
    hide() {
      root.hidden = true;
      document.body.classList.remove('is-menu');
    },
    isOpen: () => !root.hidden,
    setMatchInfo(text) {
      match.sub.textContent = text;
    },
    onPractice(fn) {
      practiceFn = fn;
    },
    onMatch(fn) {
      matchFn = fn;
    },
    onVsComputer(fn) {
      vsFn = fn;
    },
    setMuted(muted) {
      paintMuteButton(muteBtn, muted);
    },
    onMute(fn) {
      muteFn = fn;
    },
  };
}

export interface ConfirmOptions {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** Modal yes/no over the game. Resolves true on confirm; backdrop tap or cancel resolves false. */
export function confirmDialog(parent: HTMLElement, o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = el('div', 'mn-confirm');
    backdrop.setAttribute('role', 'alertdialog');
    shieldPointer(backdrop);
    const box = el('div', 'mn-confirm-box');
    const row = el('div', 'mn-btn-row');
    document.body.classList.add('is-dialog');
    const done = (v: boolean): void => {
      document.body.classList.remove('is-dialog');
      backdrop.remove();
      resolve(v);
    };
    row.append(button('mn-small', o.cancelLabel, () => done(false)), button('mn-small mn-danger', o.confirmLabel, () => done(true)));
    box.append(el('div', 'mn-confirm-title', o.title), el('div', 'mn-confirm-text', o.text), row);
    backdrop.append(box);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(false);
    });
    parent.append(backdrop);
  });
}
