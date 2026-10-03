/**
 * In-game tuning panel: gear button + bottom sheet, custom DOM, mobile first.
 * Styles live in the "Tuning panel" section of src/style.css.
 */
import type { TuningField, TuningFolder } from './config';
import type { ConfigStore } from './store';

export interface TuningPanelOptions {
  /** Called whenever the sheet opens/closes (the game should ignore throws while open). */
  onOpenChange?(open: boolean): void;
}

export interface TuningPanel {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Root wrapper (gear + sheet), already mounted on document.body. */
  readonly element: HTMLElement;
  /** Unmount and unsubscribe. */
  dispose(): void;
}

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): El<K> {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(cls: string, text: string, label?: string): HTMLButtonElement {
  const b = h('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

const fmt = (v: number, decimals: number): string => v.toFixed(decimals);

/** Event types that must never reach the game underneath. */
const SHIELDED_EVENTS = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'touchstart', 'touchmove', 'touchend', 'touchcancel',
  'mousedown', 'mouseup', 'click', 'wheel',
] as const;

export function createTuningPanel(
  store: ConfigStore,
  schema: readonly TuningFolder[],
  opts: TuningPanelOptions = {},
): TuningPanel {
  let isOpen = false;
  const folderOpen = new Map<string, boolean>(); // remembered for the session
  const updaters = new Map<string, () => void>(); // path -> refresh row
  const folderBadges: { fields: readonly TuningField[]; el: HTMLElement }[] = [];

  const root = h('div', 'tn-root');
  const gear = button('tn-gear', '⚙', 'Open tuning panel');
  const sheet = h('section', 'tn-sheet');
  sheet.setAttribute('aria-label', 'Tuning');
  sheet.setAttribute('aria-hidden', 'true');
  root.append(gear, sheet);

  for (const type of SHIELDED_EVENTS) root.addEventListener(type, (e) => e.stopPropagation());

  // ---- header -------------------------------------------------------------
  const header = h('div', 'tn-header');
  header.append(h('span', 'tn-grab'));
  const title = h('span', 'tn-title', 'Tuning');
  const closeBtn = button('tn-close', '✕', 'Close tuning panel');
  header.append(title, closeBtn);

  // ---- body ---------------------------------------------------------------
  const body = h('div', 'tn-body');

  const setNumber = (path: string, raw: number, f: Extract<TuningField, { min: number }>): void => {
    const d = decimalsOf(f.step);
    store.set(path, Number(raw.toFixed(d)));
  };

  function buildNumber(f: Extract<TuningField, { min: number }>): HTMLElement {
    const d = decimalsOf(f.step);
    const row = h('div', 'tn-row');
    const top = h('div', 'tn-row-top');
    const label = h('span', 'tn-label', f.label);
    const right = h('span', 'tn-right');
    const val = h('span', 'tn-val');
    const reset = button('tn-reset', '↺', `Reset ${f.label}`);
    right.append(val, reset);
    top.append(label, right);

    const ctl = h('div', 'tn-ctl');
    const minus = button('tn-step', '−', `Decrease ${f.label}`);
    const plus = button('tn-step', '+', `Increase ${f.label}`);
    const input = h('input', 'tn-range');
    input.type = 'range';
    input.min = String(f.min);
    input.max = String(f.max);
    input.step = String(f.step);
    input.setAttribute('aria-label', f.label);
    ctl.append(minus, input, plus);
    row.append(top, ctl);

    const cur = (): number => Number(store.get(f.path));
    const nudge = (dir: number): void => {
      const next = Math.min(f.max, Math.max(f.min, cur() + dir * f.step));
      setNumber(f.path, next, f);
    };
    input.addEventListener('input', () => setNumber(f.path, Number(input.value), f));
    minus.addEventListener('click', () => nudge(-1));
    plus.addEventListener('click', () => nudge(1));
    reset.addEventListener('click', () => store.set(f.path, store.getDefault(f.path) as number));

    updaters.set(f.path, () => {
      const v = cur();
      val.textContent = fmt(v, d);
      if (Number(input.value) !== v) input.value = String(v);
      const changed = store.isChanged(f.path);
      row.classList.toggle('tn-changed', changed);
      reset.disabled = !changed;
    });
    return row;
  }

  function buildEnum(f: Extract<TuningField, { options: readonly string[] }>): HTMLElement {
    const row = h('div', 'tn-row');
    const top = h('div', 'tn-row-top');
    const right = h('span', 'tn-right');
    const reset = button('tn-reset', '↺', `Reset ${f.label}`);
    right.append(reset);
    top.append(h('span', 'tn-label', f.label), right);
    const seg = h('div', 'tn-seg');
    seg.setAttribute('role', 'radiogroup');
    const buttons = f.options.map((opt) => {
      const b = button('tn-seg-btn', opt);
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => store.set(f.path, opt));
      seg.append(b);
      return b;
    });
    row.append(top, seg);
    reset.addEventListener('click', () => store.set(f.path, store.getDefault(f.path) as string));
    updaters.set(f.path, () => {
      const v = store.get(f.path);
      f.options.forEach((opt, i) => {
        const b = buttons[i];
        if (!b) return;
        b.classList.toggle('tn-on', opt === v);
        b.setAttribute('aria-checked', String(opt === v));
      });
      const changed = store.isChanged(f.path);
      row.classList.toggle('tn-changed', changed);
      reset.disabled = !changed;
    });
    return row;
  }

  function buildToggle(f: Extract<TuningField, { toggle: true }>): HTMLElement {
    const row = h('div', 'tn-row tn-row-toggle');
    const label = h('span', 'tn-label', f.label);
    const right = h('span', 'tn-right');
    const reset = button('tn-reset', '↺', `Reset ${f.label}`);
    const sw = button('tn-switch', '');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', f.label);
    sw.append(h('span', 'tn-knob'));
    right.append(reset, sw);
    row.append(label, right);
    sw.addEventListener('click', () => store.set(f.path, !store.get(f.path)));
    reset.addEventListener('click', () => store.set(f.path, store.getDefault(f.path) as boolean));
    updaters.set(f.path, () => {
      const on = store.get(f.path) === true;
      sw.classList.toggle('tn-on', on);
      sw.setAttribute('aria-checked', String(on));
      const changed = store.isChanged(f.path);
      row.classList.toggle('tn-changed', changed);
      reset.disabled = !changed;
    });
    return row;
  }

  for (const folder of schema) {
    const wrap = h('div', 'tn-folder');
    const head = button('tn-folder-head', '');
    const chevron = h('span', 'tn-chevron', '▸');
    const name = h('span', 'tn-folder-name', folder.title);
    const badge = h('span', 'tn-badge');
    head.append(chevron, name, badge);
    folderBadges.push({ fields: folder.fields, el: badge });
    const content = h('div', 'tn-folder-body');
    for (const f of folder.fields) {
      if ('options' in f) content.append(buildEnum(f));
      else if ('toggle' in f) content.append(buildToggle(f));
      else content.append(buildNumber(f));
    }
    const apply = (): void => {
      const o = folderOpen.get(folder.title) === true;
      wrap.classList.toggle('tn-folder-open', o);
      head.setAttribute('aria-expanded', String(o));
    };
    head.addEventListener('click', () => {
      folderOpen.set(folder.title, folderOpen.get(folder.title) !== true);
      apply();
    });
    apply();
    wrap.append(head, content);
    body.append(wrap);
  }

  // ---- footer -------------------------------------------------------------
  const footer = h('div', 'tn-footer');
  const msg = h('div', 'tn-msg');
  msg.setAttribute('role', 'status');
  const io = h('div', 'tn-io');
  io.hidden = true;
  const ioText = h('textarea', 'tn-textarea');
  ioText.rows = 4;
  ioText.spellcheck = false;
  ioText.autocapitalize = 'off';
  const ioActions = h('div', 'tn-io-actions');
  const ioApply = button('tn-btn tn-btn-primary', 'Apply');
  const ioCancel = button('tn-btn', 'Close');
  ioActions.append(ioApply, ioCancel);
  io.append(ioText, ioActions);

  const actions = h('div', 'tn-actions');
  const copyBtn = button('tn-btn', 'Copy settings');
  const pasteBtn = button('tn-btn', 'Paste settings');
  const resetBtn = button('tn-btn tn-btn-danger', 'Reset all');
  const counter = h('span', 'tn-counter');
  actions.append(copyBtn, pasteBtn, resetBtn, counter);
  footer.append(msg, io, actions);

  sheet.append(header, body, footer);

  let ioMode: 'copy' | 'paste' | null = null;
  let msgTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const say = (text: string, kind: 'ok' | 'error' = 'ok', ms = 3000): void => {
    msg.textContent = text;
    msg.className = `tn-msg tn-msg-${kind}`;
    clearTimeout(msgTimer);
    if (ms > 0) msgTimer = setTimeout(() => (msg.textContent = ''), ms);
  };

  const hideIo = (): void => {
    ioMode = null;
    io.hidden = true;
  };

  const showIo = (mode: 'copy' | 'paste', text: string): void => {
    ioMode = mode;
    io.hidden = false;
    ioText.readOnly = mode === 'copy';
    ioText.value = text;
    ioText.placeholder = mode === 'paste' ? 'Paste settings JSON here' : '';
    ioApply.hidden = mode === 'copy';
    ioCancel.textContent = mode === 'copy' ? 'Done' : 'Cancel';
    if (mode === 'copy') {
      ioText.focus();
      ioText.select();
      ioText.setSelectionRange(0, text.length);
    } else {
      ioText.focus();
    }
  };

  copyBtn.addEventListener('click', () => {
    const json = store.exportJson();
    const n = store.diffCount();
    const fallback = (): void => {
      showIo('copy', json);
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      say(copied ? `Copied ${n} changed` : 'Select all, then long-press > Copy', copied ? 'ok' : 'error', 6000);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(json).then(
        () => {
          hideIo();
          say(n === 0 ? 'Copied (nothing changed: {})' : `Copied ${n} changed value${n === 1 ? '' : 's'}`);
        },
        fallback,
      );
    } else {
      fallback();
    }
  });

  pasteBtn.addEventListener('click', () => {
    if (ioMode === 'paste') {
      hideIo();
      return;
    }
    msg.textContent = '';
    showIo('paste', '');
  });

  ioApply.addEventListener('click', () => {
    const text = ioText.value.trim();
    if (!text) {
      say('Paste the settings JSON first', 'error', 4000);
      return;
    }
    const res = store.importJson(text);
    if (!res.ok) {
      say(res.error ?? 'Invalid settings', 'error', 6000);
      return;
    }
    hideIo();
    const ign = res.ignored?.length ?? 0;
    say(ign > 0 ? `Applied (${ign} unknown value${ign === 1 ? '' : 's'} ignored)` : 'Settings applied');
  });

  ioCancel.addEventListener('click', hideIo);

  const disarmReset = (): void => {
    clearTimeout(confirmTimer);
    resetBtn.textContent = 'Reset all';
    resetBtn.classList.remove('tn-armed');
  };
  resetBtn.addEventListener('click', () => {
    if (!resetBtn.classList.contains('tn-armed')) {
      resetBtn.textContent = 'Tap again to confirm';
      resetBtn.classList.add('tn-armed');
      confirmTimer = setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    store.reset();
    say('All settings reset to defaults');
  });

  // ---- refresh ------------------------------------------------------------
  const refreshChrome = (): void => {
    const n = store.diffCount();
    counter.textContent = `${n} changed`;
    counter.classList.toggle('tn-has-changes', n > 0);
    gear.classList.toggle('tn-gear-changed', n > 0);
    for (const { fields, el } of folderBadges) {
      const c = fields.filter((f) => store.isChanged(f.path)).length;
      el.textContent = c > 0 ? String(c) : '';
      el.hidden = c === 0;
    }
  };
  const refresh = (path: string | null): void => {
    if (path === null) for (const u of updaters.values()) u();
    else updaters.get(path)?.();
    refreshChrome();
  };
  for (const u of updaters.values()) u();
  refreshChrome();
  const unsubscribe = store.subscribe(refresh);

  // ---- open / close -------------------------------------------------------
  const setOpen = (next: boolean): void => {
    if (next === isOpen) return;
    isOpen = next;
    sheet.classList.toggle('tn-open', next);
    gear.classList.toggle('tn-gear-open', next);
    gear.setAttribute('aria-expanded', String(next));
    sheet.setAttribute('aria-hidden', String(!next));
    if (!next) {
      hideIo();
      disarmReset();
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    opts.onOpenChange?.(next);
  };
  gear.addEventListener('click', () => setOpen(!isOpen));
  closeBtn.addEventListener('click', () => setOpen(false));
  gear.setAttribute('aria-expanded', 'false');

  document.body.append(root);

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    isOpen: () => isOpen,
    element: root,
    dispose() {
      unsubscribe();
      clearTimeout(msgTimer);
      clearTimeout(confirmTimer);
      root.remove();
      if (isOpen) {
        isOpen = false;
        opts.onOpenChange?.(false);
      }
    },
  };
}
