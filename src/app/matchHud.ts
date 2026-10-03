/**
 * Match HUD (plain DOM, styles in the "Match HUD" section of src/style.css, classes mh-*):
 * scoreboard pill, turn banner -> persistent turn chip, settle message chip,
 * end card and match-over card. Pure presentation: main/matchMode feed it text.
 */
import type { TeamId } from '../games/petanque/matchTypes';
import { button, el, replay, shieldPointer } from './dom';
import { TEAM_NAME } from './matchText';

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
  /** Big banner for ~1.2 s that shrinks into the persistent chip. */
  announceTurn(turn: TurnData): void;
  /** Updates the chip (and dots) without the banner, e.g. when a throw starts. */
  setChip(turn: TurnData): void;
  /** null hides the message chip. */
  setMessage(text: string | null, team: TeamId | null): void;
  showEndCard(card: EndCardData | null): void;
  showMatchOver(card: MatchOverData | null): void;
  /** Clears banner, chip, message and cards. */
  reset(): void;
  onNextEnd(fn: () => void): void;
  onRematch(fn: () => void): void;
  onMenu(fn: () => void): void;
}

const teamClass = (t: TeamId | null): string => (t === null ? '' : `mh-team-${t.toLowerCase()}`);

function dots(left: number, total: number, team: TeamId): HTMLElement {
  const wrap = el('span', `mh-dots ${teamClass(team)}`);
  wrap.setAttribute('aria-label', `${TEAM_NAME[team]}: ${left} of ${total} boules left`);
  for (let i = 0; i < total; i++) wrap.append(el('i', i < left ? 'on' : ''));
  return wrap;
}

export function createMatchHud(parent: HTMLElement): MatchHud {
  const root = el('div', 'mh-root');
  root.hidden = true;

  // Scoreboard pill
  const score = el('div', 'mh-score');
  const side = (t: TeamId): { box: HTMLElement; pts: HTMLElement } => {
    const box = el('div', `mh-side ${teamClass(t)}`);
    const pts = el('span', 'mh-pts', '0');
    box.append(el('span', 'mh-name', TEAM_NAME[t]), pts);
    return { box, pts };
  };
  const sideA = side('A');
  const sideB = side('B');
  score.append(sideA.box, el('span', 'mh-dash', '–'), sideB.box);

  // Turn banner + chip
  const banner = el('div', 'mh-banner');
  const bannerTitle = el('div', 'mh-banner-title');
  const bannerHint = el('div', 'mh-banner-hint');
  const bannerDots = el('div', 'mh-banner-dots');
  banner.append(bannerTitle, bannerHint, bannerDots);

  const chip = el('div', 'mh-chip');
  const chipText = el('span', 'mh-chip-text');
  const chipDots = el('span', 'mh-chip-dots');
  chip.append(chipText, chipDots);

  const message = el('div', 'mh-msg');
  message.hidden = true;

  // Cards
  const endCard = el('div', 'mh-card');
  endCard.hidden = true;
  const endTitle = el('div', 'mh-card-title');
  const endDetail = el('div', 'mh-card-detail');
  const endScore = el('div', 'mh-card-score');
  const nextBtn = button('mh-btn mh-primary', 'Next end');
  endCard.append(endTitle, endDetail, endScore, nextBtn);

  const overCard = el('div', 'mh-card mh-over');
  overCard.hidden = true;
  const overTitle = el('div', 'mh-card-title');
  const overDetail = el('div', 'mh-card-detail');
  const overRow = el('div', 'mh-btn-row');
  const rematchBtn = button('mh-btn mh-primary', 'Rematch');
  const menuBtn = button('mh-btn', 'Menu');
  overRow.append(rematchBtn, menuBtn);
  overCard.append(overTitle, overDetail, overRow);

  root.append(score, banner, chip, message, endCard, overCard);
  parent.append(root);
  for (const c of [endCard, overCard]) shieldPointer(c);

  let nextFn: () => void = () => undefined;
  let rematchFn: () => void = () => undefined;
  let menuFn: () => void = () => undefined;
  nextBtn.addEventListener('click', () => nextFn());
  rematchBtn.addEventListener('click', () => rematchFn());
  menuBtn.addEventListener('click', () => menuFn());

  const fillDots = (target: HTMLElement, turn: TurnData): void => {
    target.replaceChildren(dots(turn.left.A, turn.total, 'A'), dots(turn.left.B, turn.total, 'B'));
  };
  const paintChip = (turn: TurnData): void => {
    chip.className = `mh-chip ${teamClass(turn.team)}`;
    chipText.textContent = turn.chip;
    fillDots(chipDots, turn);
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
      sideA.box.classList.toggle('is-active', active === 'A');
      sideB.box.classList.toggle('is-active', active === 'B');
    },
    announceTurn(turn) {
      bannerTitle.textContent = turn.banner;
      bannerHint.textContent = turn.hint;
      bannerHint.hidden = turn.hint === '';
      fillDots(bannerDots, turn);
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
      message.hidden = text === null;
      if (text === null) return;
      message.textContent = text;
      message.className = `mh-msg ${teamClass(team)}`;
      replay(message, 'is-in');
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
      overTitle.textContent = card.title;
      overDetail.textContent = card.detail;
      overDetail.hidden = card.detail === '';
      replay(overCard, 'is-in');
    },
    reset() {
      banner.classList.remove('is-on');
      chip.className = 'mh-chip';
      chipText.textContent = '';
      chipDots.replaceChildren();
      message.hidden = true;
      endCard.hidden = true;
      overCard.hidden = true;
      root.classList.remove('has-card');
      sideA.pts.textContent = '0';
      sideB.pts.textContent = '0';
      sideA.box.classList.remove('is-active');
      sideB.box.classList.remove('is-active');
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
