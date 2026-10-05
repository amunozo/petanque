/**
 * Game HUD (plain DOM, styles in the "Game HUD" section of src/style.css, classes hud-*):
 * practice status + distances (top left), the ⋯ button (top right) and its
 * sheet (sound, fullscreen, new end / restart, tuning, main menu), power meter
 * and the practice end card.
 */
import { formatNumber, onLangChange, t } from '../i18n';
import { button, el, shieldPointer } from './dom';
import { PRIVACY_URL } from './links';
import { icon, type IconName } from './icons';
import { createLangPicker } from './langPicker';

export interface DistanceRow {
  label: string;
  text: string;
  closest: boolean;
  out: boolean;
}

export interface EndCardData {
  /** Best boule's gap to the jack in metres; null when nothing could be measured. */
  best: number | null;
  sessionBest: number | null;
  /** Shown instead of the best. */
  note?: 'jackOut' | 'allOut';
}

export type HudMode = 'practice' | 'match';

export interface Hud {
  /** Sound row of the ⋯ sheet. */
  setMuted(muted: boolean): void;
  onMute(fn: () => void): void;
  /** Practice shows the status/distance list; match hides it (its own HUD takes over). Also relabels the restart row. */
  setMode(mode: HudMode): void;
  /** "Main menu" row of the ⋯ sheet. */
  onMenu(fn: () => void): void;
  /** "Restart match" row (match mode; practice uses onNewEnd). */
  onRestart(fn: () => void): void;
  /** Fullscreen row: hidden while `available` is false (e.g. iOS Safari). */
  setFullscreen(available: boolean, active: boolean): void;
  onFullscreen(fn: () => void): void;
  /** "Tuning" row (opens the tuning panel); `changed` puts a dot on the ⋯ button. */
  onSettings(fn: () => void): void;
  setSettingsChanged(changed: boolean): void;
  /** "Install app" row: shown only while `available` (see install.ts). */
  setInstallable(available: boolean): void;
  onInstall(fn: () => void): void;
  /** "How to play" row. */
  onHowTo(fn: () => void): void;
  isSheetOpen(): boolean;
  closeSheet(): void;
  onSheetChange(fn: (open: boolean) => void): void;
  /** Practice status line; re-run on a language change by the mode (the HUD only stores the text). */
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

/** "23 cm" below one metre, "1.24 m" above (decimal comma in fr/es/it/pt). */
export function formatDistance(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 100)} cm` : `${formatNumber(metres, 2)} m`;
}

interface SheetItem {
  btn: HTMLButtonElement;
  label: HTMLElement;
  ic: HTMLElement;
}

function sheetItem(name: IconName, text: string, role: 'menuitem' | 'menuitemcheckbox' = 'menuitem'): SheetItem {
  const btn = button('hud-item', '');
  btn.setAttribute('role', role);
  const ic = el('span', 'hud-item-icon');
  ic.innerHTML = icon(name);
  const label = el('span', 'hud-item-label', text);
  btn.append(ic, label);
  return { btn, label, ic };
}

export function createHud(root: HTMLElement, buildId: string): Hud {
  // ---- practice status (top left) ----------------------------------------------
  const info = el('div', 'hud-info');
  const status = el('div', 'hud-status');
  const build = el('div', 'hud-build', buildId);
  const list = el('div', 'hud-dist');
  list.hidden = true;
  info.append(status, list, build);

  // ---- ⋯ button + sheet (top right) --------------------------------------------
  const more = button('hud-more', '');
  more.innerHTML = `${icon('more', 24)}<span class="hud-more-dot" hidden></span>`;
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'hud-sheet');
  const moreDot = more.querySelector<HTMLElement>('.hud-more-dot');

  const scrim = el('div', 'hud-scrim');
  scrim.hidden = true;
  const sheet = el('div', 'hud-sheet');
  sheet.id = 'hud-sheet';
  sheet.setAttribute('role', 'menu');
  sheet.hidden = true;

  const sound = sheetItem('soundOn', '', 'menuitemcheckbox');
  const soundState = el('span', 'hud-item-state');
  sound.btn.append(soundState);
  const fullscreen = sheetItem('fullscreen', '');
  fullscreen.btn.hidden = true; // main.ts reveals it where supported
  const restart = sheetItem('restart', '');
  const settings = sheetItem('settings', '');
  const settingsBadge = el('span', 'hud-item-badge');
  settingsBadge.hidden = true;
  settings.btn.append(settingsBadge);
  const home = sheetItem('home', '');
  const install = sheetItem('install', '');
  install.btn.hidden = true; // main.ts reveals it where the browser offers installing
  const howto = sheetItem('help', '');
  // Language: label row, then the chips (tapping a chip keeps the sheet open: the whole sheet re-labels).
  const lang = el('div', 'hud-lang');
  const langHead = el('div', 'hud-lang-head');
  const langIcon = el('span', 'hud-item-icon');
  langIcon.innerHTML = icon('globe');
  const langLabel = el('span', 'hud-item-label');
  langHead.append(langIcon, langLabel);
  lang.append(langHead, createLangPicker('hud-langs').element);
  // A plain link in a new tab: the game (and a match in progress) stays open behind it.
  const privacy = sheetItem('privacy', '');
  const privacyLink = el('a', 'hud-item');
  privacyLink.setAttribute('role', 'menuitem');
  privacyLink.href = PRIVACY_URL;
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener';
  privacyLink.append(privacy.ic, privacy.label);
  const sheetBuild = el('div', 'hud-sheet-build');
  sheet.append(sound.btn, fullscreen.btn, restart.btn, howto.btn, lang, settings.btn, install.btn, el('div', 'hud-sep'), home.btn, privacyLink, sheetBuild);

  // ---- power meter + practice end card -------------------------------------------
  const power = el('div', 'hud-power');
  power.hidden = true;
  const powerLabel = el('div', 'hud-power-label', '0%');
  const powerTrack = el('div', 'hud-power-track');
  const powerFill = el('div', 'hud-power-fill');
  powerTrack.append(powerFill);
  power.append(powerLabel, powerTrack);

  const card = el('div', 'hud-card');
  card.hidden = true;
  const cardTitle = el('div', 'hud-card-title');
  const cardBest = el('div', 'hud-card-best');
  const cardSession = el('div', 'hud-card-session');
  const nextButton = button('hud-next', '');
  card.append(cardTitle, cardBest, cardSession, nextButton);

  root.append(info, power, card, scrim, more, sheet);

  let mode: HudMode = 'practice';
  let newEndFn: () => void = () => undefined;
  let nextFn: () => void = () => undefined;
  let menuFn: () => void = () => undefined;
  let muteFn: () => void = () => undefined;
  let restartFn: () => void = () => undefined;
  let fullscreenFn: () => void = () => undefined;
  let settingsFn: () => void = () => undefined;
  let installFn: () => void = () => undefined;
  let howtoFn: () => void = () => undefined;
  let sheetFn: (open: boolean) => void = () => undefined;

  let sheetOpen = false;
  const setSheet = (open: boolean, focusButton = false): void => {
    if (open === sheetOpen) return;
    sheetOpen = open;
    sheet.hidden = !open;
    scrim.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.classList.toggle('is-open', open);
    if (open) sound.btn.focus({ preventScroll: true });
    else if (focusButton) more.focus({ preventScroll: true });
    sheetFn(open);
  };
  /** Sheet rows close the sheet first, then act. */
  const act = (fn: () => void) => () => {
    setSheet(false);
    fn();
  };

  more.addEventListener('click', () => setSheet(!sheetOpen));
  scrim.addEventListener('click', () => setSheet(false));
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSheet(false, true);
  });
  sound.btn.addEventListener('click', () => muteFn()); // stays open: the row shows the new state
  fullscreen.btn.addEventListener('click', act(() => fullscreenFn()));
  restart.btn.addEventListener('click', act(() => (mode === 'practice' ? newEndFn() : restartFn())));
  settings.btn.addEventListener('click', act(() => settingsFn()));
  home.btn.addEventListener('click', act(() => menuFn()));
  install.btn.addEventListener('click', act(() => installFn()));
  howto.btn.addEventListener('click', act(() => howtoFn()));
  privacyLink.addEventListener('click', () => setSheet(false));
  nextButton.addEventListener('click', () => nextFn());

  // Buttons must not leak touches into the game canvas underneath.
  for (const target of [more, scrim, sheet, card]) shieldPointer(target);

  // ---- text that depends on the language / state, repainted together ----------------
  let muted = false;
  let fullscreenActive = false;
  let endCardData: EndCardData | null = null;
  const paintText = (): void => {
    const menuLabel = t('hud.menu.aria');
    more.setAttribute('aria-label', menuLabel);
    sheet.setAttribute('aria-label', menuLabel);
    sound.label.textContent = t('hud.sound');
    soundState.textContent = muted ? t('hud.off') : t('hud.on');
    fullscreen.label.textContent = fullscreenActive ? t('hud.fullscreenExit') : t('hud.fullscreen');
    restart.label.textContent = mode === 'practice' ? t('hud.newEnd') : t('hud.restart');
    howto.label.textContent = t('hud.howto');
    langLabel.textContent = t('lang.label');
    settings.label.textContent = t('hud.tuning');
    settingsBadge.textContent = t('hud.changed');
    home.label.textContent = t('hud.home');
    install.label.textContent = t('hud.install');
    privacy.label.textContent = t('hud.privacy');
    sheetBuild.textContent = t('hud.build', { id: buildId });
    nextButton.textContent = t('practice.next');
    paintEndCard();
  };
  function paintEndCard(): void {
    const data = endCardData;
    if (!data) return;
    cardTitle.textContent = data.note === 'jackOut' ? t('practice.jackOut') : data.note === 'allOut' ? t('practice.allOut') : t('practice.best');
    cardBest.textContent = data.note ? '' : data.best === null ? '-' : formatDistance(data.best);
    cardBest.hidden = Boolean(data.note);
    cardSession.textContent = data.sessionBest === null ? '' : t('practice.sessionBest', { value: formatDistance(data.sessionBest) });
  }
  paintText();
  onLangChange(paintText);

  return {
    setMuted(isMuted) {
      muted = isMuted;
      sound.ic.innerHTML = icon(muted ? 'soundOff' : 'soundOn');
      soundState.textContent = muted ? t('hud.off') : t('hud.on');
      sound.btn.setAttribute('aria-checked', String(!muted));
    },
    onMute(fn) {
      muteFn = fn;
    },
    setMode(m) {
      mode = m;
      root.classList.toggle('hud-mode-match', m === 'match');
      restart.label.textContent = m === 'practice' ? t('hud.newEnd') : t('hud.restart');
    },
    onMenu(fn) {
      menuFn = fn;
    },
    onRestart(fn) {
      restartFn = fn;
    },
    setFullscreen(available, active) {
      fullscreen.btn.hidden = !available;
      fullscreenActive = active;
      fullscreen.label.textContent = active ? t('hud.fullscreenExit') : t('hud.fullscreen');
      fullscreen.ic.innerHTML = icon(active ? 'fullscreenExit' : 'fullscreen');
    },
    onFullscreen(fn) {
      fullscreenFn = fn;
    },
    onSettings(fn) {
      settingsFn = fn;
    },
    setSettingsChanged(changed) {
      settingsBadge.hidden = !changed;
      if (moreDot) moreDot.hidden = !changed;
    },
    setInstallable(available) {
      install.btn.hidden = !available;
    },
    onInstall(fn) {
      installFn = fn;
    },
    onHowTo(fn) {
      howtoFn = fn;
    },
    isSheetOpen: () => sheetOpen,
    closeSheet: () => setSheet(false),
    onSheetChange(fn) {
      sheetFn = fn;
    },
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
      endCardData = data;
      card.hidden = data === null;
      root.classList.toggle('hud-endover', data !== null);
      paintEndCard();
    },
    onNewEnd(fn) {
      newEndFn = fn;
    },
    onNextEnd(fn) {
      nextFn = fn;
    },
  };
}
