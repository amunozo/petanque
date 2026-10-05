/**
 * Measuring overlay: thin lines from the jack to each team's nearest boule with a
 * small distance label, drawn in screen space over the 3D close-up (the scene's
 * `project`). Lines draw in, labels pop; everything follows the camera while shown.
 * Styles: "Measuring" section of src/style.css (ms-*).
 */
import type { Vec3 } from '../engine';
import type { TeamId } from '../games/petanque/matchTypes';
import { effectsConfig } from './effectsConfig';
import { el } from './dom';

export interface MeasureLine {
  team: TeamId;
  /** Ground-level end points (jack surface, boule surface). */
  from: Vec3;
  to: Vec3;
  /** Pre-formatted, e.g. "12,5 cm". */
  label: string;
}

export interface MeasureOverlay {
  /** Draws the lines in (replacing any shown). */
  show(lines: readonly MeasureLine[]): void;
  hide(): void;
  isShown(): boolean;
  /** Once per animation frame: follows the camera and advances the draw-in. */
  frame(now: number): void;
  /** Re-words the labels (language change): same lines, new text. */
  relabel(labels: readonly string[]): void;
}

type Project = (p: Vec3) => { x: number; y: number } | null;

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, tag);
  e.setAttribute('class', cls);
  return e;
};

interface Item {
  line: MeasureLine;
  casing: SVGLineElement;
  stroke: SVGLineElement;
  ticks: [SVGLineElement, SVGLineElement];
  label: HTMLElement;
  text: HTMLElement;
}

const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);

export function createMeasureOverlay(parent: HTMLElement, project: Project, before?: Element | null): MeasureOverlay {
  const root = el('div', 'ms-root');
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const svg = svgEl('svg', 'ms-svg');
  root.append(svg);
  if (before) parent.insertBefore(root, before);
  else parent.append(root);

  let items: Item[] = [];
  let startedAt = 0;
  let labelsOn = false;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clear = (): void => {
    for (const it of items) {
      it.casing.remove();
      it.stroke.remove();
      it.ticks[0].remove();
      it.ticks[1].remove();
      it.label.remove();
    }
    items = [];
  };

  return {
    show(lines) {
      clear();
      for (const line of lines) {
        const casing = svgEl('line', 'ms-casing');
        const stroke = svgEl('line', `ms-line mh-team-${line.team.toLowerCase()}`);
        const t1 = svgEl('line', `ms-tick mh-team-${line.team.toLowerCase()}`);
        const t2 = svgEl('line', `ms-tick mh-team-${line.team.toLowerCase()}`);
        svg.append(casing, stroke, t1, t2);
        const label = el('div', 'ms-label');
        const pill = el('div', `ms-pill mh-team-${line.team.toLowerCase()}`);
        const text = el('span', 'ms-text', line.label);
        pill.append(el('i', 'mh-mark'), text);
        label.append(pill);
        root.append(label);
        items.push({ line, casing, stroke, ticks: [t1, t2], label, text });
      }
      startedAt = performance.now();
      labelsOn = false;
      root.classList.remove('is-labels');
      root.hidden = items.length === 0;
      this.frame(startedAt);
    },
    hide() {
      clear();
      root.hidden = true;
      root.classList.remove('is-labels');
    },
    isShown: () => !root.hidden,
    relabel(labels) {
      items.forEach((it, i) => {
        const text = labels[i];
        if (text !== undefined) it.text.textContent = text;
      });
    },
    frame(now) {
      if (root.hidden) return;
      const cfg = effectsConfig.measure;
      const p = reduced ? 1 : Math.min(1, (now - startedAt) / cfg.drawMs);
      const k = easeOut(p);
      if (p >= 1 && !labelsOn) {
        labelsOn = true;
        root.classList.add('is-labels');
      }
      // Labels sit at the line's middle, nudged up; a second label that would overlap the first moves below it.
      const placed: { x: number; y: number }[] = [];
      for (const it of items) {
        const a = project(it.line.from);
        const b = project(it.line.to);
        const visible = a !== null && b !== null;
        for (const e of [it.casing, it.stroke, it.ticks[0], it.ticks[1]]) e.style.display = visible ? '' : 'none';
        it.label.style.display = visible ? '' : 'none';
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ex = a.x + dx * k;
        const ey = a.y + dy * k;
        for (const e of [it.casing, it.stroke]) {
          e.setAttribute('x1', a.x.toFixed(1));
          e.setAttribute('y1', a.y.toFixed(1));
          e.setAttribute('x2', ex.toFixed(1));
          e.setAttribute('y2', ey.toFixed(1));
        }
        it.casing.style.strokeWidth = String(cfg.lineWidth + 2.4);
        it.stroke.style.strokeWidth = String(cfg.lineWidth);
        // End ticks (perpendicular, like a tape measure); the far one appears with the line's end.
        const nx = (-dy / len) * cfg.tickHalf;
        const ny = (dx / len) * cfg.tickHalf;
        it.ticks[0].setAttribute('x1', (a.x - nx).toFixed(1));
        it.ticks[0].setAttribute('y1', (a.y - ny).toFixed(1));
        it.ticks[0].setAttribute('x2', (a.x + nx).toFixed(1));
        it.ticks[0].setAttribute('y2', (a.y + ny).toFixed(1));
        it.ticks[1].setAttribute('x1', (b.x - nx).toFixed(1));
        it.ticks[1].setAttribute('y1', (b.y - ny).toFixed(1));
        it.ticks[1].setAttribute('x2', (b.x + nx).toFixed(1));
        it.ticks[1].setAttribute('y2', (b.y + ny).toFixed(1));
        it.ticks[1].style.opacity = p >= 1 ? '1' : '0';
        let lx = (a.x + b.x) / 2;
        let ly = (a.y + b.y) / 2 - 16;
        for (const q of placed) {
          if (Math.abs(q.x - lx) < 64 && Math.abs(q.y - ly) < 26) ly = q.y + 28;
        }
        placed.push({ x: lx, y: ly });
        // Keep the label on screen (clear of the score bar and the bottom card) even when the line runs off it.
        const vw = root.clientWidth || window.innerWidth;
        const vh = root.clientHeight || window.innerHeight;
        lx = Math.round(Math.min(vw - 52, Math.max(52, lx)));
        ly = Math.round(Math.min(vh - 230, Math.max(80, ly)));
        it.label.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
      }
    },
  };
}
