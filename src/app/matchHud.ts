/**
 * Match HUD (plain DOM, styles in the "Match HUD" section of src/style.css, classes mh-*):
 * score bar (top left: one row per team with its boules-left dots, the target
 * and a turn line), turn banner, settle toast (auto-hides), end card and
 * match-over card. Pure presentation: main/matchMode feed it text.
 * Teams are told apart by colour AND shape: Blue = round mark, Red = diamond.
 */
import type { TeamId } from '../games/petanque/matchTypes';
import { onLangChange, t } from '../i18n';
import { button, el, replay, shieldPointer } from './dom';
import { teamName } from './matchText';

export interface EndCardData {
  title: string;
  detail: string;
  team: TeamId | null;
  /** Running score line, e.g. "Blue 5 – 3 Red". */
  score: string;
}

export interface MatchOverData {
  title: string;
  /** e.g. "after 9 ends". */
  detail: string;
  team: TeamId;
  /** Festive dressing (bunting) — off when the computer beat the player. */
  celebrate?: boolean;
}

export interface TurnData {
  team: TeamId;
  banner: string;
  hint: string;
  chip: string;
  left: Record<TeamId, number>;
  total: number;
}

export interface MatchHud {
  show(): void;
  hide(): void;
  setScore(score: Record<TeamId, number>, active: TeamId | null): void;
  /** Points needed to win, shown at the end of the score bar ("to 7"). */
  setTarget(points: number): void;
  /** Labels on the score bar (default "Blue" / "Red", translated). */
  setNames(names: Record<TeamId, string>): void;
  /** Big banner for ~1.2 s, then the score bar's turn line takes over. */
  announceTurn(turn: TurnData): void;
  /** Updates the turn line (and dots) without the banner, e.g. when a throw starts. */
  setChip(turn: TurnData): void;
  /** Short toast under the score bar (auto-hides); null hides it now. */
  setMessage(text: string | null, team: TeamId | null): void;
  showEndCard(card: EndCardData | null): void;
  showMatchOver(card: MatchOverData | null): void;
  /** Clears banner, turn line, message and cards. */
  reset(): void;
  onNextEnd(fn: () => void): void;
  onRematch(fn: () => void): void;
  onMenu(fn: () => void): void;
}

/** How long a settle toast stays up (ms). */
const TOAST_MS = 4200;

const teamClass = (t: TeamId | null): string => (t === null ? '' : `mh-team-${t.toLowerCase()}`);

/** The team's shape mark (circle / diamond), coloured by the team class around it. */
const mark = (): HTMLElement => {
  const m = el('i', 'mh-mark');
  m.setAttribute('aria-hidden', 'true');
  return m;
};

function dots(left: number, total: number, team: TeamId, name: string): HTMLElement {
  const wrap = el('span', `mh-dots ${teamClass(team)}`);
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', t('match.dots', { name, count: left, total }));
  for (let i = 0; i < total; i++) wrap.append(el('i', i < left ? 'on' : ''));
  return wrap;
}

/** Little festival bunting (Provençal fête) across the top of the winner's card. */
const BUNTING_COLOURS = ['var(--terracotta)', 'var(--sun)', 'var(--team-a)', 'var(--sage)', 'var(--lavender)'];
function bunting(): HTMLElement {
  const wrap = el('div', 'mh-bunting');
  wrap.setAttribute('aria-hidden', 'true');
  const flags = 13;
  const w = 300 / flags;
  let tris = '';
  for (let i = 0; i < flags; i++) {
    const x = i * w;
    const sag = 6 * Math.sin((Math.PI * (i + 0.5)) / flags);
    tris += `<path d="M${(x + 1).toFixed(1)} ${sag.toFixed(1)} L${(x + w - 1).toFixed(1)} ${sag.toFixed(1)} L${(x + w / 2).toFixed(1)} ${(sag + 15).toFixed(1)} Z" fill="${BUNTING_COLOURS[i % BUNTING_COLOURS.length]}"/>`;
  }
  wrap.innerHTML = `<svg viewBox="0 -2 300 26" preserveAspectRatio="none" width="100%" height="26"><path d="M0 0 Q150 12 300 0" fill="none" stroke="var(--ink-2)" stroke-width="1.2"/>${tris}</svg>`;
  return wrap;
}

export function createMatchHud(parent: HTMLElement): MatchHud {
  const root = el('div', 'mh-root');
  root.hidden = true;

  // ---- score bar --------------------------------------------------------------------
  const bar = el('div', 'mh-bar');
  const rows = el('div', 'mh-rows');
  const side = (team: TeamId): { row: HTMLElement; pts: HTMLElement; name: HTMLElement; dots: HTMLElement } => {
    const row = el('div', `mh-row ${teamClass(team)}`);
    const pts = el('span', 'mh-pts', '0');
    const name = el('span', 'mh-name', teamName(team));
    const d = el('span', 'mh-row-dots');
    row.append(mark(), name, d, pts);
    return { row, pts, name, dots: d };
  };
  const sideA = side('A');
  const sideB = side('B');
  rows.append(sideA.row, sideB.row);
  const target = el('div', 'mh-target');
  // Turn line: the old turn chip, now the bar's footer.
  const chip = el('div', 'mh-chip');
  const chipText = el('span', 'mh-chip-text');
  chip.append(mark(), chipText);
  bar.append(rows, target, chip);

  const message = el('div', 'mh-msg');
  message.setAttribute('role', 'status');
  message.hidden = true;

  // ---- turn banner -------------------------------------------------------------------
  const banner = el('div', 'mh-banner');
  banner.setAttribute('aria-hidden', 'true'); // the turn line carries the same news
  const bannerBox = el('div', 'mh-banner-box');
  const bannerTitle = el('div', 'mh-banner-title');
  const bannerHint = el('div', 'mh-banner-hint');
  const bannerDots = el('div', 'mh-banner-dots');
  const bannerHead = el('div', 'mh-banner-head');
  bannerHead.append(mark(), bannerTitle);
  bannerBox.append(bannerHead, bannerHint, bannerDots);
  banner.append(bannerBox);

  // ---- cards -------------------------------------------------------------------------
  const endCard = el('div', 'mh-card');
  endCard.hidden = true;
  const endTitle = el('div', 'mh-card-title');
  const endDetail = el('div', 'mh-card-detail');
  const endScore = el('div', 'mh-card-score');
  const nextBtn = button('mh-btn mh-primary', '');
  const endHead = el('div', 'mh-card-head');
  endHead.append(mark(), endTitle);
  endCard.append(endHead, endDetail, endScore, nextBtn);

  const overCard = el('div', 'mh-card mh-over');
  overCard.hidden = true;
  const overFlags = bunting();
  const overTitle = el('div', 'mh-card-title');
  const overDetail = el('div', 'mh-card-detail');
  const overRow = el('div', 'mh-btn-row');
  const rematchBtn = button('mh-btn mh-primary', '');
  const menuBtn = button('mh-btn', '');
  overRow.append(menuBtn, rematchBtn);
  const overHead = el('div', 'mh-card-head');
  overHead.append(mark(), overTitle);
  overCard.append(overFlags, overHead, overDetail, overRow);
  endTitle.id = 'mh-end-title';
  overTitle.id = 'mh-over-title';
  endCard.setAttribute('role', 'dialog');
  endCard.setAttribute('aria-labelledby', endTitle.id);
  overCard.setAttribute('role', 'dialog');
  overCard.setAttribute('aria-labelledby', overTitle.id);

  // Bar and toast stack in the top-left corner, clear of the jack and the court centre.
  const topLeft = el('div', 'mh-top');
  topLeft.append(bar, message);
  root.append(topLeft, banner, endCard, overCard);
  parent.append(root);
  for (const c of [endCard, overCard]) shieldPointer(c);

  let nextFn: () => void = () => undefined;
  let rematchFn: () => void = () => undefined;
  let menuFn: () => void = () => undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  nextBtn.addEventListener('click', () => nextFn());
  rematchBtn.addEventListener('click', () => rematchFn());
  menuBtn.addEventListener('click', () => menuFn());

  let names: Record<TeamId, string> = { A: teamName('A'), B: teamName('B') };
  let targetPoints = 0;
  let lastDots: Pick<TurnData, 'left' | 'total'> | null = null;
  const paintDots = (): void => {
    if (!lastDots) return;
    sideA.dots.replaceChildren(dots(lastDots.left.A, lastDots.total, 'A', names.A));
    sideB.dots.replaceChildren(dots(lastDots.left.B, lastDots.total, 'B', names.B));
  };
  const paintTarget = (): void => {
    if (targetPoints === 0) return;
    target.replaceChildren(el('span', '', t('match.to')), ' ', el('b', '', String(targetPoints)));
    target.setAttribute('aria-label', t('match.toAria', { points: targetPoints }));
  };
  const paintStatic = (): void => {
    nextBtn.textContent = t('end.next');
    rematchBtn.textContent = t('over.rematch');
    menuBtn.textContent = t('over.menu');
    paintTarget();
    paintDots();
  };
  paintStatic();
  onLangChange(paintStatic);
  const paintChip = (turn: TurnData): void => {
    chip.className = `mh-chip ${teamClass(turn.team)}`;
    chipText.textContent = turn.chip;
    lastDots = turn;
    paintDots();
  };
  const hideMessage = (): void => {
    clearTimeout(toastTimer);
    message.hidden = true;
  };

  return {
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
    setScore(s, active) {
      sideA.pts.textContent = String(s.A);
      sideB.pts.textContent = String(s.B);
      sideA.row.classList.toggle('is-active', active === 'A');
      sideB.row.classList.toggle('is-active', active === 'B');
    },
    setTarget(points) {
      targetPoints = points;
      paintTarget();
    },
    setNames(next) {
      names = next;
      sideA.name.textContent = next.A;
      sideB.name.textContent = next.B;
      paintDots();
    },
    announceTurn(turn) {
      bannerTitle.textContent = turn.banner;
      bannerHint.textContent = turn.hint;
      bannerHint.hidden = turn.hint === '';
      bannerDots.replaceChildren(dots(turn.left.A, turn.total, 'A', names.A), dots(turn.left.B, turn.total, 'B', names.B));
      banner.className = `mh-banner ${teamClass(turn.team)}`;
      replay(banner, 'is-on');
      paintChip(turn);
      replay(chip, 'is-delayed');
    },
    setChip(turn) {
      paintChip(turn);
      chip.classList.remove('is-delayed');
    },
    setMessage(text, team) {
      if (text === null) {
        hideMessage();
        return;
      }
      message.hidden = false;
      message.replaceChildren(mark(), el('span', 'mh-msg-text', text));
      message.className = `mh-msg ${teamClass(team)}`;
      replay(message, 'is-in');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (message.hidden = true), TOAST_MS);
    },
    showEndCard(card) {
      endCard.hidden = card === null;
      root.classList.toggle('has-card', card !== null || !overCard.hidden);
      if (!card) return;
      endCard.className = `mh-card ${teamClass(card.team)}`;
      endTitle.textContent = card.title;
      endDetail.textContent = card.detail;
      endDetail.hidden = card.detail === '';
      endScore.textContent = card.score;
      replay(endCard, 'is-in');
    },
    showMatchOver(card) {
      overCard.hidden = card === null;
      root.classList.toggle('has-card', card !== null || !endCard.hidden);
      if (!card) return;
      overCard.className = `mh-card mh-over ${teamClass(card.team)}`;
      overCard.classList.toggle('is-celebrate', card.celebrate !== false);
      overTitle.textContent = card.title;
      overDetail.textContent = card.detail;
      overDetail.hidden = card.detail === '';
      replay(overCard, 'is-in');
    },
    reset() {
      banner.classList.remove('is-on');
      chip.className = 'mh-chip';
      chipText.textContent = '';
      sideA.dots.replaceChildren();
      sideB.dots.replaceChildren();
      lastDots = null;
      hideMessage();
      endCard.hidden = true;
      overCard.hidden = true;
      root.classList.remove('has-card');
      sideA.pts.textContent = '0';
      sideB.pts.textContent = '0';
      sideA.row.classList.remove('is-active');
      sideB.row.classList.remove('is-active');
    },
    onNextEnd(fn) {
      nextFn = fn;
    },
    onRematch(fn) {
      rematchFn = fn;
    },
    onMenu(fn) {
      menuFn = fn;
    },
  };
}
