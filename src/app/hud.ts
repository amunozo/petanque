/** Game HUD (plain DOM, styles in the "Game HUD" section of src/style.css, classes hud-*). */

export interface DistanceRow {
  label: string;
  text: string;
  closest: boolean;
  out: boolean;
}

export interface EndCardData {
  /** Pre-formatted, e.g. "12 cm"; null when nothing could be measured. */
  best: string | null;
  sessionBest: string | null;
  /** Shown instead of the best, e.g. "Jack out". */
  note?: string;
}

export interface Hud {
  readonly fullscreenButton: HTMLButtonElement;
  setStatus(text: string): void;
  /** 0..1 while dragging, null hides the meter. */
  setPower(power: number | null): void;
  /** Rows after a settle; null hides the list. */
  setDistances(rows: DistanceRow[] | null): void;
  /** Big end-over card with a "Next end" button; null hides it. */
  showEndCard(card: EndCardData | null): void;
  onNewEnd(fn: () => void): void;
  onNextEnd(fn: () => void): void;
}

/** "23 cm" below one metre, "1.24 m" above. */
export function formatDistance(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres.toFixed(2)} m`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function iconButton(cls: string, label: string, svgPath: string): HTMLButtonElement {
  const b = el('button', `hud-btn ${cls}`);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgPath}</svg>`;
  return b;
}

export function createHud(root: HTMLElement, buildId: string): Hud {
  const info = el('div', 'hud-info');
  const status = el('div', 'hud-status');
  const build = el('div', 'hud-build', buildId);
  const list = el('div', 'hud-dist');
  list.hidden = true;
  info.append(status, build, list);

  const fullscreenButton = iconButton(
    'hud-fs',
    'Fullscreen',
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  );
  fullscreenButton.hidden = true; // main.ts reveals it where supported
  const newEndButton = iconButton('hud-new', 'New end', '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>');

  const power = el('div', 'hud-power');
  power.hidden = true;
  const powerLabel = el('div', 'hud-power-label', '0%');
  const powerTrack = el('div', 'hud-power-track');
  const powerFill = el('div', 'hud-power-fill');
  powerTrack.append(powerFill);
  power.append(powerLabel, powerTrack);

  const card = el('div', 'hud-card');
  card.hidden = true;
  const cardTitle = el('div', 'hud-card-title', 'Best');
  const cardBest = el('div', 'hud-card-best');
  const cardSession = el('div', 'hud-card-session');
  const nextButton = el('button', 'hud-next', 'Next end');
  nextButton.type = 'button';
  card.append(cardTitle, cardBest, cardSession, nextButton);

  root.append(info, fullscreenButton, newEndButton, power, card);

  let newEndFn: () => void = () => undefined;
  let nextFn: () => void = () => undefined;
  newEndButton.addEventListener('click', () => newEndFn());
  nextButton.addEventListener('click', () => nextFn());

  // Buttons must not leak touches into the game canvas underneath.
  for (const target of [newEndButton, fullscreenButton, card]) {
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'] as const) {
      target.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  return {
    fullscreenButton,
    setStatus(text) {
      status.textContent = text;
    },
    setPower(p) {
      if (p === null) {
        power.hidden = true;
        return;
      }
      const pct = Math.round(Math.min(1, Math.max(0, p)) * 100);
      power.hidden = false;
      powerFill.style.height = `${pct}%`;
      powerLabel.textContent = `${pct}%`;
    },
    setDistances(rows) {
      list.replaceChildren();
      list.hidden = !rows || rows.length === 0;
      if (!rows) return;
      for (const r of rows) {
        const row = el('div', 'hud-dist-row');
        if (r.closest) row.classList.add('hud-closest');
        if (r.out) row.classList.add('hud-out');
        row.append(el('span', 'hud-dist-label', r.label), el('span', 'hud-dist-val', r.text));
        list.append(row);
      }
    },
    showEndCard(data) {
      card.hidden = data === null;
      root.classList.toggle('hud-endover', data !== null);
      if (!data) return;
      cardTitle.textContent = data.note ?? 'Best';
      cardBest.textContent = data.note ? '' : (data.best ?? '-');
      cardBest.hidden = Boolean(data.note);
      cardSession.textContent = data.sessionBest ? `Session best: ${data.sessionBest}` : '';
    },
    onNewEnd(fn) {
      newEndFn = fn;
    },
    onNextEnd(fn) {
      nextFn = fn;
    },
  };
}
