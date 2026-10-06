/**
 * Online screens (plain DOM, styles in the "Online" section of src/style.css, classes ol-*):
 * the "Play a friend online" sheet (nickname, match length, invite / join with a code),
 * the guest's join sheet (opened from an invite link) and the lobby (room code, share,
 * waiting for the friend). Pure presentation: online/flow.ts decides what happens.
 */
import { onLangChange, t } from '../../i18n';
import { cleanNickname, normalizeRoomCode, ROOM_CODE_LENGTH } from '../../net/protocol';
import { button, el, shieldPointer } from '../dom';
import { icon } from '../icons';
import type { MatchLength } from '../matchLength';
import { lengthPicker, type LengthPoints } from '../menu';
import { loadNickname, NICKNAME_MAX } from './storage';

export type SheetResult = { kind: 'host'; nickname: string; length: MatchLength } | { kind: 'join'; nickname: string; code: string };

export interface GuestInvite {
  code: string;
  points: number;
}

export interface OnlineSheet {
  /** Host sheet (with "join with a code"), or the guest's sheet for an invite. Resolves null when closed. */
  open(invite: GuestInvite | null): Promise<SheetResult | null>;
  isOpen(): boolean;
}

function field(labelKey: 'online.nickname' | 'online.code', input: HTMLInputElement): { wrap: HTMLElement; paint(): void } {
  const wrap = el('label', 'ol-field');
  const label = el('span', 'ol-label');
  wrap.append(label, input);
  return { wrap, paint: () => (label.textContent = t(labelKey)) };
}

function textInput(cls: string, max: number): HTMLInputElement {
  const input = el('input', cls);
  input.type = 'text';
  input.maxLength = max;
  input.spellcheck = false;
  input.autocomplete = 'off';
  return input;
}

export function createOnlineSheet(parent: HTMLElement, points: LengthPoints): OnlineSheet {
  const root = el('div', 'ol-screen');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  shieldPointer(root);
  const box = el('div', 'ol-box');
  const close = button('ol-close', '');
  close.innerHTML = icon('close', 20);
  const title = el('div', 'ol-title');
  title.id = 'ol-title';
  root.setAttribute('aria-labelledby', title.id);
  const sub = el('div', 'ol-sub');

  const nick = textInput('ol-input', NICKNAME_MAX);
  nick.setAttribute('autocomplete', 'nickname');
  nick.enterKeyHint = 'go';
  const nickField = field('online.nickname', nick);
  const length = lengthPicker(points, () => undefined);
  const go = button('mh-btn mh-primary ol-go', '');

  const or = el('div', 'ol-or');
  const code = textInput('ol-input ol-code-input', ROOM_CODE_LENGTH + 2);
  code.autocapitalize = 'characters';
  code.enterKeyHint = 'go';
  const codeField = field('online.code', code);
  const join = button('mh-btn ol-join', '');
  const joinRow = el('div', 'ol-join-row');
  joinRow.append(codeField.wrap, join);

  box.append(close, title, sub, nickField.wrap, length.element, go, or, joinRow);
  root.append(box);
  parent.append(root);

  let invite: GuestInvite | null = null;
  let settle: ((r: SheetResult | null) => void) | null = null;

  const nickname = (): string | null => cleanNickname(nick.value);
  const paintState = (): void => {
    go.disabled = nickname() === null;
    join.disabled = nickname() === null || normalizeRoomCode(code.value) === null;
  };
  const paint = (): void => {
    close.setAttribute('aria-label', t('online.close'));
    nick.placeholder = t('online.nicknamePlaceholder');
    nickField.paint();
    codeField.paint();
    code.placeholder = 'K7M9P';
    or.textContent = t('online.or');
    join.textContent = t('online.join');
    if (invite) {
      title.textContent = t('online.invited.title');
      sub.textContent = t('online.invited.sub', { code: invite.code, points: invite.points });
      go.textContent = t('online.join');
    } else {
      title.textContent = t('online.title');
      go.textContent = t('online.create');
    }
  };
  onLangChange(paint);

  const finish = (r: SheetResult | null): void => {
    root.hidden = true;
    document.body.classList.remove('is-dialog');
    const s = settle;
    settle = null;
    s?.(r);
  };
  const submit = (): void => {
    const n = nickname();
    if (!n) return;
    if (invite) finish({ kind: 'join', nickname: n, code: invite.code });
    else finish({ kind: 'host', nickname: n, length: length.get() });
  };
  const submitCode = (): void => {
    const n = nickname();
    const c = normalizeRoomCode(code.value);
    if (n && c) finish({ kind: 'join', nickname: n, code: c });
  };
  nick.addEventListener('input', paintState);
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
    paintState();
  });
  nick.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCode();
  });
  go.addEventListener('click', submit);
  join.addEventListener('click', submitCode);
  close.addEventListener('click', () => finish(null));
  root.addEventListener('click', (e) => {
    if (e.target === root) finish(null);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish(null);
  });

  return {
    open(inv) {
      if (settle) finish(null);
      invite = inv;
      nick.value = loadNickname();
      code.value = '';
      root.classList.toggle('is-guest', inv !== null);
      length.refresh();
      paint();
      paintState();
      root.hidden = false;
      document.body.classList.add('is-dialog');
      if (nick.value === '') nick.focus({ preventScroll: true });
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
    isOpen: () => !root.hidden,
  };
}

export interface Lobby {
  /** "Connecting…" with only Cancel (creating / joining a room). */
  showConnecting(): void;
  /** The room is open: its code, the match length, Share and "Waiting for your friend…". */
  showRoom(code: string, detail: string): void;
  hide(): void;
  isOpen(): boolean;
  /** Small toast at the bottom of the lobby (e.g. "Invite link copied"). */
  toast(text: string): void;
  onShare(fn: () => void): void;
  onCancel(fn: () => void): void;
}

/** How long the lobby toast stays (ms). */
const TOAST_MS = 2600;

export function createLobby(parent: HTMLElement): Lobby {
  const root = el('div', 'ol-screen ol-lobby');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  shieldPointer(root);
  const box = el('div', 'ol-box');
  const label = el('div', 'ol-label');
  const code = el('div', 'ol-code');
  const detail = el('div', 'ol-sub');
  const hint = el('div', 'ol-hint');
  const share = button('mh-btn mh-primary ol-share', '');
  const waiting = el('div', 'ol-waiting');
  const waitingText = el('span', '');
  waiting.append(el('i', 'ol-pulse'), waitingText);
  const cancel = button('mh-btn ol-cancel', '');
  const roomPart = el('div', 'ol-room');
  roomPart.append(label, code, detail, hint, share);
  box.append(roomPart, waiting, cancel);
  const toastEl = el('div', 'ol-toast');
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;
  root.append(box, toastEl);
  parent.append(root);

  let connecting = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const paint = (): void => {
    label.textContent = t('online.code');
    hint.textContent = t('lobby.hint');
    share.replaceChildren();
    share.insertAdjacentHTML('afterbegin', icon('share', 20));
    share.append(t('lobby.share'));
    waitingText.textContent = connecting ? t('online.connecting') : t('lobby.waiting');
    cancel.textContent = t('lobby.cancel');
  };
  paint();
  onLangChange(paint);

  let shareFn: () => void = () => undefined;
  let cancelFn: () => void = () => undefined;
  share.addEventListener('click', () => shareFn());
  cancel.addEventListener('click', () => cancelFn());

  return {
    showConnecting() {
      connecting = true;
      roomPart.hidden = true;
      paint();
      root.hidden = false;
    },
    showRoom(c, d) {
      connecting = false;
      roomPart.hidden = false;
      code.textContent = c;
      code.setAttribute('aria-label', [...c].join(' '));
      detail.textContent = d;
      paint();
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      toastEl.hidden = true;
    },
    isOpen: () => !root.hidden,
    toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toastEl.hidden = true), TOAST_MS);
    },
    onShare(fn) {
      shareFn = fn;
    },
    onCancel(fn) {
      cancelFn = fn;
    },
  };
}
