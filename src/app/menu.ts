/** Start menu + confirm dialog (plain DOM overlays; styles in the "Menu" section of src/style.css, classes mn-*). */
import type { AiDifficulty } from '../games/petanque/aiTypes';
import { onLangChange, t, type MessageKey } from '../i18n';
import { button, el, shieldPointer } from './dom';
import { icon } from './icons';
import { createLangPicker } from './langPicker';
import { PRIVACY_URL } from './links';
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
  /** "Install app" link in the footer: shown only while `available` (see install.ts). */
  setInstallable(available: boolean): void;
  onInstall(fn: () => void): void;
  /** "How to play" link in the footer. */
  onHowTo(fn: () => void): void;
  /** "Play a friend online": shown only while `available` (a server is configured, or developer mode). */
  setOnlineAvailable(available: boolean): void;
  onOnline(fn: () => void): void;
  /** "Rejoin your match" at the top (an online match this device was in); null hides it. */
  setRejoin(offer: RejoinOffer | null): void;
  onRejoin(fn: () => void): void;
}

export interface RejoinOffer {
  code: string;
  /** The other player's nickname; null while the room still waits for them (lobby). */
  opponent: string | null;
}

const DIFFICULTY_KEY = { easy: 'diff.easy', medium: 'diff.medium', hard: 'diff.hard' } as const satisfies Record<AiDifficulty, MessageKey>;

/** Inline Easy / Medium / Hard segmented control; the choice is remembered (localStorage). */
function difficultyPicker(): { element: HTMLElement; get(): AiDifficulty } {
  let value = loadDifficulty();
  const row = el('div', 'mn-seg');
  row.setAttribute('role', 'radiogroup');
  const buttons = DIFFICULTIES.map((d) => {
    const b = button('mn-seg-btn', '', () => {
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
    row.setAttribute('aria-label', t('diff.aria'));
    DIFFICULTIES.forEach((d, i) => {
      const b = buttons[i];
      if (!b) return;
      b.textContent = t(DIFFICULTY_KEY[d]);
      b.setAttribute('aria-checked', String(d === value));
    });
  }
  render();
  onLangChange(render);
  return { element: row, get: () => value };
}

/** Points to win per length, read when the menu opens (Standard follows the tunable target). */
export type LengthPoints = () => Record<MatchLength, number>;

const LENGTH_KEY = { quick: 'length.quick', standard: 'length.standard' } as const satisfies Record<MatchLength, MessageKey>;

/** "Quick · 7" / "Standard · 13" segmented control, shared by the match buttons (and the online sheet); the choice is remembered. */
export function lengthPicker(points: LengthPoints, onChange: (l: MatchLength) => void): { element: HTMLElement; get(): MatchLength; refresh(): void } {
  let value = loadMatchLength();
  const row = el('div', 'mn-seg');
  row.setAttribute('role', 'radiogroup');
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
  const label = el('div', 'mn-length-label');
  function refresh(): void {
    const p = points();
    label.textContent = t('length.label');
    row.setAttribute('aria-label', t('length.label'));
    MATCH_LENGTHS.forEach((l, i) => {
      const b = buttons[i];
      if (!b) return;
      b.textContent = `${t(LENGTH_KEY[l])} · ${p[l]}`;
      b.setAttribute('aria-checked', String(l === value));
    });
  }
  refresh();
  const wrap = el('div', 'mn-length');
  wrap.append(label, row);
  onLangChange(refresh);
  return { element: wrap, get: () => value, refresh };
}

/** Mini boules drawn in CSS: 'a' / 'b' = team boule, 'j' = jack. */
function balls(kinds: readonly ('a' | 'b' | 'j')[]): HTMLElement {
  const art = el('span', 'mn-btn-art');
  art.setAttribute('aria-hidden', 'true');
  for (const k of kinds) art.append(el('i', `mn-ball ${k === 'j' ? 'mn-jack' : `mn-ball-${k}`}`));
  return art;
}

function choice(cls: string, art: readonly ('a' | 'b' | 'j')[]): { btn: HTMLButtonElement; title: HTMLElement; sub: HTMLElement } {
  const btn = button(`mn-btn ${cls}`, '');
  const titleEl = el('span', 'mn-btn-title');
  const subEl = el('span', 'mn-btn-sub');
  const text = el('span', 'mn-btn-text');
  text.append(titleEl, subEl);
  btn.append(balls(art), text);
  return { btn, title: titleEl, sub: subEl };
}

export function createMenu(parent: HTMLElement, buildId: string, points: LengthPoints): Menu {
  const root = el('div', 'mn-root');
  root.setAttribute('role', 'dialog');
  shieldPointer(root);

  // Emblem: a jack between one boule per team, drawn in CSS, over a little ground shadow.
  const logo = el('div', 'mn-logo');
  logo.setAttribute('aria-hidden', 'true');
  logo.append(el('i', 'mn-ball mn-ball-a'), el('i', 'mn-ball mn-jack'), el('i', 'mn-ball mn-ball-b'));
  const tagline = el('div', 'mn-tagline');
  const head = el('div', 'mn-head');
  head.append(logo, el('h1', 'mn-title', 'Pétanque'), tagline);

  const practice = choice('mn-practice', ['j', 'a']);
  const match = choice('mn-match', ['a', 'b']);
  const vs = choice('mn-vs', ['a', 'b']);
  const level = difficultyPicker();
  const vsBox = el('div', 'mn-vs-box');
  vsBox.append(vs.btn, level.element);
  const paintMatchInfo = (): void => {
    match.sub.textContent = matchInfoText(points()[length.get()]);
  };
  const length = lengthPicker(points, paintMatchInfo);
  const online = choice('mn-online', ['a', 'j', 'b']);
  online.btn.hidden = true;
  const rejoin = choice('mn-rejoin', ['a', 'b']);
  rejoin.btn.hidden = true;
  let rejoinOffer: RejoinOffer | null = null;
  const paintRejoin = (): void => {
    if (!rejoinOffer) return;
    rejoin.title.textContent = t('menu.rejoin.title');
    rejoin.sub.textContent = rejoinOffer.opponent ? t('menu.rejoin.sub', { name: rejoinOffer.opponent }) : t('menu.rejoin.lobby', { code: rejoinOffer.code });
  };
  const buttons = el('div', 'mn-buttons');
  buttons.append(rejoin.btn, practice.btn, vsBox, match.btn, online.btn, length.element);

  const muteBtn = el('button', 'mn-mute');
  muteBtn.type = 'button';
  let muted = false;
  paintMuteButton(muteBtn, muted);
  const langs = createLangPicker('mn-langs');

  // Footer: quiet links ("Install app" only where the browser offers it), then the build id.
  const howtoBtn = button('mn-link mn-howto', '');
  const installBtn = button('mn-link mn-install', '');
  installBtn.hidden = true;
  const privacy = el('a', 'mn-link');
  privacy.href = PRIVACY_URL;
  privacy.target = '_blank';
  privacy.rel = 'noopener';
  const links = el('div', 'mn-links');
  links.append(howtoBtn, installBtn, privacy);
  const foot = el('div', 'mn-foot');
  foot.append(links, el('div', 'mn-build', buildId));

  root.append(langs.element, muteBtn, head, buttons, foot);
  parent.append(root);

  const relabel = (): void => {
    root.setAttribute('aria-label', t('menu.aria'));
    tagline.textContent = t('menu.tagline');
    practice.title.textContent = t('menu.practice.title');
    practice.sub.textContent = t('menu.practice.sub');
    vs.title.textContent = t('menu.vs.title');
    vs.sub.textContent = t('menu.vs.sub');
    match.title.textContent = t('menu.match.title');
    online.title.textContent = t('menu.online.title');
    online.sub.textContent = t('menu.online.sub');
    paintRejoin();
    paintMatchInfo();
    howtoBtn.replaceChildren();
    howtoBtn.insertAdjacentHTML('afterbegin', icon('help', 16));
    howtoBtn.append(t('menu.howto'));
    installBtn.textContent = t('menu.install');
    privacy.textContent = t('menu.privacy');
    paintMuteButton(muteBtn, muted);
  };
  relabel();
  onLangChange(relabel);

  let practiceFn: () => void = () => undefined;
  let matchFn: (l: MatchLength) => void = () => undefined;
  let vsFn: (d: AiDifficulty, l: MatchLength) => void = () => undefined;
  let muteFn: () => void = () => undefined;
  let howtoFn: () => void = () => undefined;
  practice.btn.addEventListener('click', () => practiceFn());
  match.btn.addEventListener('click', () => matchFn(length.get()));
  vs.btn.addEventListener('click', () => vsFn(level.get(), length.get()));
  muteBtn.addEventListener('click', () => muteFn());
  howtoBtn.addEventListener('click', () => howtoFn());
  let installFn: () => void = () => undefined;
  installBtn.addEventListener('click', () => installFn());
  let onlineFn: () => void = () => undefined;
  let rejoinFn: () => void = () => undefined;
  online.btn.addEventListener('click', () => onlineFn());
  rejoin.btn.addEventListener('click', () => rejoinFn());

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
    setMuted(next) {
      muted = next;
      paintMuteButton(muteBtn, muted);
    },
    onMute(fn) {
      muteFn = fn;
    },
    setInstallable(available) {
      installBtn.hidden = !available;
    },
    onInstall(fn) {
      installFn = fn;
    },
    onHowTo(fn) {
      howtoFn = fn;
    },
    setOnlineAvailable(available) {
      online.btn.hidden = !available;
    },
    onOnline(fn) {
      onlineFn = fn;
    },
    setRejoin(offer) {
      rejoinOffer = offer;
      rejoin.btn.hidden = offer === null;
      root.classList.toggle('has-rejoin', offer !== null);
      paintRejoin();
    },
    onRejoin(fn) {
      rejoinFn = fn;
    },
  };
}

export interface ConfirmOptions {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface NoticeOptions {
  title: string;
  text: string;
  okLabel: string;
  /** Optional primary action next to OK (e.g. "Update"); `notice` resolves true when it is tapped. */
  actionLabel?: string;
}

interface DialogButton {
  label: string;
  cls: string;
  value: boolean;
}

/** Modal box over the game; the backdrop, Escape and the first button resolve false. */
function dialog(parent: HTMLElement, title: string, text: string, buttons: readonly DialogButton[]): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = el('div', 'mn-confirm');
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    shieldPointer(backdrop);
    const box = el('div', 'mn-confirm-box');
    const row = el('div', 'mn-btn-row');
    const titleEl = el('div', 'mn-confirm-title', title);
    titleEl.id = 'mn-confirm-title';
    backdrop.setAttribute('aria-labelledby', titleEl.id);
    document.body.classList.add('is-dialog');
    const done = (v: boolean): void => {
      document.body.classList.remove('is-dialog');
      backdrop.remove();
      resolve(v);
    };
    const els = buttons.map((b) => button(b.cls, b.label, () => done(b.value)));
    row.append(...els);
    box.append(titleEl, el('div', 'mn-confirm-text', text), row);
    backdrop.append(box);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(false);
    });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(false);
    });
    parent.append(backdrop);
    els[0]?.focus({ preventScroll: true });
  });
}

/** Modal yes/no over the game. Resolves true on confirm; backdrop tap or cancel resolves false. */
export function confirmDialog(parent: HTMLElement, o: ConfirmOptions): Promise<boolean> {
  return dialog(parent, o.title, o.text, [
    { label: o.cancelLabel, cls: 'mn-small', value: false },
    { label: o.confirmLabel, cls: 'mn-small mn-danger', value: true },
  ]);
}

/** A message with an OK button (and maybe one action). Resolves true only when the action was tapped. */
export function noticeDialog(parent: HTMLElement, o: NoticeOptions): Promise<boolean> {
  const ok = { label: o.okLabel, cls: 'mn-small', value: false };
  return dialog(parent, o.title, o.text, o.actionLabel ? [ok, { label: o.actionLabel, cls: 'mn-small mn-go', value: true }] : [ok]);
}
