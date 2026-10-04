/** Start menu + confirm dialog (plain DOM overlays; styles in the "Menu" section of src/style.css, classes mn-*). */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import { button, el, shieldPointer } from './dom';
import { MATCH_LENGTHS, matchInfoText, type MatchLength } from './matchLength';
import { DIFFICULTIES, loadDifficulty, loadMatchLength, saveDifficulty, saveMatchLength } from './prefs';
import { paintMuteButton } from './soundIcon';

export interface Menu {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  onPractice(fn: () => void): void;
  /** "2 players" was chosen, with the match length selected in the menu. */
  onMatch(fn: (length: MatchLength) => void): void;
  /** "1 player vs computer" was chosen, with the difficulty and match length selected in the menu. */
  onVsComputer(fn: (difficulty: AiDifficulty, length: MatchLength) => void): void;
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

/** Points to win per length, read when the menu opens (Standard follows the tunable target). */
export type LengthPoints = () => Record<MatchLength, number>;

const LENGTH_NAME: Record<MatchLength, string> = { quick: 'Quick', standard: 'Standard' };

/** "Quick · 7" / "Standard · 13" segmented control, shared by both match buttons; the choice is remembered. */
function lengthPicker(points: LengthPoints, onChange: (l: MatchLength) => void): { element: HTMLElement; get(): MatchLength; refresh(): void } {
  let value = loadMatchLength();
  const row = el('div', 'mn-seg');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Match length');
  const buttons = MATCH_LENGTHS.map((l) => {
    const b = button('mn-seg-btn', '', () => {
      value = l;
      saveMatchLength(l);
      refresh();
      onChange(l);
    });
    b.setAttribute('role', 'radio');
    b.dataset['length'] = l;
    row.append(b);
    return b;
  });
  function refresh(): void {
    const p = points();
    MATCH_LENGTHS.forEach((l, i) => {
      const b = buttons[i];
      if (!b) return;
      b.textContent = `${LENGTH_NAME[l]} · ${p[l]}`;
      b.setAttribute('aria-checked', String(l === value));
    });
  }
  refresh();
  const wrap = el('div', 'mn-length');
  wrap.append(el('div', 'mn-length-label', 'Match length'), row);
  return { element: wrap, get: () => value, refresh };
}

/** Mini boules drawn in CSS: 'a' / 'b' = team boule, 'j' = jack. */
function balls(kinds: readonly ('a' | 'b' | 'j')[]): HTMLElement {
  const art = el('span', 'mn-btn-art');
  art.setAttribute('aria-hidden', 'true');
  for (const k of kinds) art.append(el('i', `mn-ball ${k === 'j' ? 'mn-jack' : `mn-ball-${k}`}`));
  return art;
}

function choice(cls: string, title: string, sub: string, art: readonly ('a' | 'b' | 'j')[]): { btn: HTMLButtonElement; sub: HTMLElement } {
  const btn = button(`mn-btn ${cls}`, '');
  const subEl = el('span', 'mn-btn-sub', sub);
  const text = el('span', 'mn-btn-text');
  text.append(el('span', 'mn-btn-title', title), subEl);
  btn.append(balls(art), text);
  return { btn, sub: subEl };
}

export function createMenu(parent: HTMLElement, buildId: string, points: LengthPoints): Menu {
  const root = el('div', 'mn-root');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Main menu');
  shieldPointer(root);

  // Emblem: a jack between one boule per team, drawn in CSS, over a little ground shadow.
  const logo = el('div', 'mn-logo');
  logo.setAttribute('aria-hidden', 'true');
  logo.append(el('i', 'mn-ball mn-ball-a'), el('i', 'mn-ball mn-jack'), el('i', 'mn-ball mn-ball-b'));
  const head = el('div', 'mn-head');
  head.append(logo, el('h1', 'mn-title', 'Pétanque'), el('div', 'mn-tagline', 'Boules in the village square'));

  const practice = choice('mn-practice', 'Practice', 'Throw at the jack, on your own', ['j', 'a']);
  const match = choice('mn-match', '2 players (same phone)', matchInfoText(points()[loadMatchLength()]), ['a', 'b']);
  const vs = choice('mn-vs', '1 player vs computer', 'You are Blue', ['a', 'b']);
  const level = difficultyPicker();
  const vsBox = el('div', 'mn-vs-box');
  vsBox.append(vs.btn, level.element);
  const paintMatchInfo = (): void => {
    match.sub.textContent = matchInfoText(points()[length.get()]);
  };
  const length = lengthPicker(points, paintMatchInfo);
  const buttons = el('div', 'mn-buttons');
  buttons.append(practice.btn, vsBox, match.btn, length.element);

  const muteBtn = el('button', 'mn-mute');
  muteBtn.type = 'button';
  paintMuteButton(muteBtn, false);

  root.append(muteBtn, head, buttons, el('div', 'mn-build', buildId));
  parent.append(root);

  let practiceFn: () => void = () => undefined;
  let matchFn: (l: MatchLength) => void = () => undefined;
  let vsFn: (d: AiDifficulty, l: MatchLength) => void = () => undefined;
  let muteFn: () => void = () => undefined;
  practice.btn.addEventListener('click', () => practiceFn());
  match.btn.addEventListener('click', () => matchFn(length.get()));
  vs.btn.addEventListener('click', () => vsFn(level.get(), length.get()));
  muteBtn.addEventListener('click', () => muteFn());

  return {
    show() {
      length.refresh();
      paintMatchInfo();
      root.hidden = false;
      document.body.classList.add('is-menu');
    },
    hide() {
      root.hidden = true;
      document.body.classList.remove('is-menu');
    },
    isOpen: () => !root.hidden,
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
    backdrop.setAttribute('aria-modal', 'true');
    shieldPointer(backdrop);
    const box = el('div', 'mn-confirm-box');
    const row = el('div', 'mn-btn-row');
    const title = el('div', 'mn-confirm-title', o.title);
    title.id = 'mn-confirm-title';
    backdrop.setAttribute('aria-labelledby', title.id);
    document.body.classList.add('is-dialog');
    const done = (v: boolean): void => {
      document.body.classList.remove('is-dialog');
      backdrop.remove();
      resolve(v);
    };
    const cancel = button('mn-small', o.cancelLabel, () => done(false));
    row.append(cancel, button('mn-small mn-danger', o.confirmLabel, () => done(true)));
    box.append(title, el('div', 'mn-confirm-text', o.text), row);
    backdrop.append(box);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(false);
    });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(false);
    });
    parent.append(backdrop);
    cancel.focus({ preventScroll: true });
  });
}
