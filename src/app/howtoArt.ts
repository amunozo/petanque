/**
 * Illustrations for the "How to play" pages: small top-down SVG scenes (240x132) in the
 * game's palette (CSS variables, so they follow the design tokens). Static markup,
 * no text except numbers: the pages carry the words.
 */
import { formatNumber } from '../i18n';

const W = 240;
const H = 132;

const frame = (inner: string): string =>
  `<svg class="ht-svg" viewBox="0 0 ${W} ${H}" role="presentation" aria-hidden="true" focusable="false">` +
  `<rect width="${W}" height="${H}" rx="16" fill="var(--ht-ground)"/>` +
  `<g fill="var(--ht-ground-dark)" opacity=".5"><circle cx="22" cy="20" r="1.6"/><circle cx="64" cy="112" r="1.4"/><circle cx="212" cy="30" r="1.6"/><circle cx="188" cy="118" r="1.4"/><circle cx="40" cy="70" r="1.3"/><circle cx="226" cy="84" r="1.3"/></g>` +
  `${inner}</svg>`;

type Team = 'a' | 'b';

const boule = (x: number, y: number, team: Team, extra = ''): string =>
  `<g transform="translate(${x} ${y})" ${extra}><ellipse cx="1.5" cy="3" rx="11" ry="9" fill="#000" opacity=".18"/>` +
  `<circle r="11" fill="var(--team-${team})"/><circle r="11" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.4"/>` +
  `<circle cx="-3.6" cy="-4" r="3.8" fill="#fff" opacity=".42"/></g>`;

const jack = (x: number, y: number): string =>
  `<g transform="translate(${x} ${y})"><ellipse cx="1" cy="2" rx="5" ry="4" fill="#000" opacity=".2"/><circle r="5.2" fill="var(--sun)"/>` +
  `<circle r="5.2" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.1"/><circle cx="-1.6" cy="-1.8" r="1.5" fill="#fff" opacity=".6"/></g>`;

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w = 2.4, dash = ''): string =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#fff" stroke-width="${w + 2.4}" stroke-linecap="round" opacity=".85"/>` +
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;

/** 1. The goal: the blue boule is nearer to the jack than the red one. */
export function goalArt(): string {
  return frame(
    line(120, 60, 54, 100, 'var(--team-b)', 2.2, '1 5') +
      line(120, 60, 148, 76, 'var(--team-a)', 2.8) +
      jack(120, 60) +
      boule(160, 83, 'a') +
      boule(46, 104, 'b') +
      `<g transform="translate(190 30)" fill="none" stroke="var(--leaf)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle r="15" fill="#fff" stroke="none" opacity=".9"/><path d="M-7 0l5 5 9-10"/></g>`,
  );
}

/** 2. Throwing: a finger pulls down, the boule flies in a dotted arc to the jack. */
export function throwArt(): string {
  return frame(
    // dotted flight arc and landing ring
    `<path d="M104 112Q150 -6 196 40" fill="none" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 7" opacity=".55"/>` +
      `<ellipse cx="196" cy="44" rx="15" ry="8" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>` +
      jack(197 - 2, 44) +
      // finger: a ring with an arrow down
      `<g transform="translate(52 34)"><circle r="19" fill="#fff" opacity=".55"/><circle r="12" fill="#fff" opacity=".95"/><circle r="12" fill="none" stroke="var(--terracotta)" stroke-width="3"/></g>` +
      `<path d="M52 56V94" stroke="var(--terracotta)" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M41 85l11 12 11-12" fill="none" stroke="var(--terracotta)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      // sideways slide for the aim
      `<path d="M26 112h52" stroke="var(--ink-2)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 6" opacity=".8"/>` +
      `<path d="M30 107l-6 5 6 5M74 107l6 5-6 5" fill="none" stroke="var(--ink-2)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>` +
      boule(104, 112, 'a'),
  );
}

/** 2 (landing-spot controls). A finger marks the spot (ring just above it), the boule is swiped up and flies there. */
export function landingArt(): string {
  return frame(
    `<path d="M60 104Q112 -12 160 40" fill="none" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 7" opacity=".55"/>` +
      `<ellipse cx="160" cy="44" rx="15" ry="8" fill="none" stroke="#fff" stroke-width="3" opacity=".95"/>` +
      jack(178, 34) +
      // finger holding the marker from just below it
      `<path d="M160 56V64" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 4" opacity=".9"/>` +
      `<g transform="translate(160 80)"><circle r="17" fill="#fff" opacity=".5"/><circle r="11" fill="#fff" opacity=".95"/><circle r="11" fill="none" stroke="var(--terracotta)" stroke-width="3"/></g>` +
      // the swipe up
      `<path d="M30 120V80" stroke="var(--terracotta)" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M19 90l11-12 11 12" fill="none" stroke="var(--terracotta)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      boule(60, 110, 'a'),
  );
}

/** 4. Turn order: blue holds the point (green ring), so red plays (arc towards the jack). */
export function turnArt(): string {
  return frame(
    line(112, 56, 142, 72, 'var(--team-a)', 2.8) +
      line(112, 56, 56, 100, 'var(--team-b)', 2.2, '1 5') +
      `<circle cx="152" cy="76" r="19" fill="none" stroke="var(--leaf)" stroke-width="3.4"/>` +
      jack(112, 56) +
      boule(152, 76, 'a') +
      boule(48, 106, 'b') +
      // the red boule is about to be thrown: dotted arc to the jack
      `<path d="M52 92Q58 40 98 44" fill="none" stroke="var(--team-b)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 6.5"/>` +
      `<path d="M92 36l10 7-9 8" fill="none" stroke="var(--team-b)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** 5. Scoring: two blue boules are inside the circle of red's best boule, so +1 each. */
export function scoreArt(): string {
  const badge = (x: number, y: number): string =>
    `<g transform="translate(${x} ${y})"><rect x="-14" y="-10" width="28" height="20" rx="10" fill="var(--sun)" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>` +
    `<text y="5" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="14" fill="var(--ink)">+1</text></g>`;
  return frame(
    `<circle cx="120" cy="66" r="44" fill="#fff" fill-opacity=".35" stroke="var(--team-b)" stroke-width="2.6" stroke-dasharray="6 6"/>` +
      jack(120, 66) +
      boule(79, 82, 'b') +
      boule(138, 46, 'a') +
      boule(104, 96, 'a') +
      boule(196, 100, 'a') +
      badge(166, 38) +
      badge(76, 108),
  );
}

/** 6. Jack zone (between two arcs around the throwing circle) and the boards (touching them is dead). */
export function rulesArt(lo: number, hi: number): string {
  const cx = 120;
  const cy = 128;
  const rLo = 52;
  const rHi = 104;
  // Band between the arcs, clipped by the art's top edge.
  const band = `<path d="M${cx - rLo} ${cy}A${rLo} ${rLo} 0 0 1 ${cx + rLo} ${cy}L${cx + rHi} ${cy}A${rHi} ${rHi} 0 0 0 ${cx - rHi} ${cy}Z" fill="#fff" opacity=".4" clip-path="url(#ht-clip)"/>`;
  const label = (x: number, y: number, v: number): string =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="12" fill="var(--ink)" stroke="#fff" stroke-width="3" paint-order="stroke">${formatNumber(v)} m</text>`;
  return frame(
    `<defs><clipPath id="ht-clip"><rect x="14" y="0" width="212" height="${H}"/></clipPath></defs>` +
      `<rect x="0" y="0" width="14" height="${H}" fill="var(--ht-board)"/><rect x="226" y="0" width="14" height="${H}" fill="var(--ht-board)"/>` +
      band +
      `<circle cx="${cx}" cy="${cy}" r="${rLo}" fill="none" stroke="#fff" stroke-width="2" opacity=".8" clip-path="url(#ht-clip)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${rHi}" fill="none" stroke="#fff" stroke-width="2" opacity=".8" clip-path="url(#ht-clip)"/>` +
      `<ellipse cx="${cx}" cy="${H - 6}" rx="16" ry="6" fill="none" stroke="var(--ink-2)" stroke-width="2.2" opacity=".7"/>` +
      jack(cx + 30, 58) +
      label(cx - 4, 96, lo) +
      label(cx - 4, 21, hi) +
      boule(207, 70, 'b') +
      // a red cross: the boule touching the board is dead
      `<g transform="translate(207 70)" stroke="var(--danger)" stroke-width="4.5" stroke-linecap="round"><circle r="17" fill="#fff" fill-opacity=".75" stroke-width="3.2"/><path d="M-8 -8l16 16M8 -8l-16 16"/></g>`,
  );
}
