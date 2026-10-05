/**
 * Screen effects for good shots: a burst of dust and sparks anchored to a spot on the
 * pitch (drawn on a 2D canvas over the scene, following the camera) and a light
 * "camera nudge" (a quick zoom/shift of the 3D canvas). No words, purely visual.
 */
import type { Vec3 } from '../engine';
import { effectsConfig, type BurstEffectConfig, type NudgeConfig } from './effectsConfig';
import { el } from './dom';

export type FxKind = 'carreau' | 'hit';

export interface Fx {
  burst(at: Vec3, kind: FxKind): void;
  nudge(kind: FxKind): void;
  /** Once per animation frame. */
  frame(now: number): void;
  clear(): void;
}

type Project = (p: Vec3) => { x: number; y: number } | null;

interface Particle {
  type: 'dust' | 'spark' | 'ring';
  at: Vec3;
  born: number;
  ms: number;
  /** Direction (unit) and distance travelled in px by the end of life. */
  dx: number;
  dy: number;
  dist: number;
  size: number;
}

/** Tiny deterministic generator (visuals only). */
function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function createFx(parent: HTMLElement, sceneCanvas: HTMLCanvasElement, project: Project, before?: Element | null): Fx {
  const canvas = el('canvas', 'fx-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  if (before) parent.insertBefore(canvas, before);
  else parent.append(canvas);
  const g = canvas.getContext('2d');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles: Particle[] = [];
  let seq = 1;
  let drawn = false;

  const fit = (): number => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(parent.clientWidth * dpr);
    const h = Math.round(parent.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  };

  function spawn(at: Vec3, c: BurstEffectConfig, ringMs: number, now: number): void {
    const rand = rng(Math.round(at.x * 977 + at.z * 313) + seq++ * 7919);
    const point = { x: at.x, y: 0.04, z: at.z };
    for (let i = 0; i < c.dust; i++) {
      const a = rand() * Math.PI * 2;
      particles.push({ type: 'dust', at: point, born: now, ms: c.ms * (0.6 + rand() * 0.4), dx: Math.cos(a), dy: Math.sin(a) * 0.55 - 0.25, dist: c.puffPx * (0.5 + rand() * 0.6), size: c.puffPx * (0.35 + rand() * 0.35) });
    }
    for (let i = 0; i < c.sparks; i++) {
      const a = rand() * Math.PI * 2;
      particles.push({ type: 'spark', at: point, born: now, ms: c.ms * (0.35 + rand() * 0.3), dx: Math.cos(a), dy: Math.sin(a) * 0.7 - 0.3, dist: c.sparkPx * (0.5 + rand() * 0.6), size: 5 + rand() * 6 });
    }
    if (ringMs > 0) particles.push({ type: 'ring', at: point, born: now, ms: ringMs, dx: 0, dy: 0, dist: c.puffPx * 1.6, size: 0 });
  }

  return {
    burst(at, kind) {
      if (reduced || !g) return;
      const c = effectsConfig.burst[kind];
      spawn(at, c, kind === 'carreau' ? c.ms * 0.55 : 0, performance.now());
    },
    nudge(kind) {
      if (reduced || typeof sceneCanvas.animate !== 'function') return;
      const n: NudgeConfig = effectsConfig.nudge[kind];
      sceneCanvas.animate(
        [
          { transform: 'scale(1) translateY(0)', offset: 0 },
          { transform: `scale(${n.scale}) translateY(${n.shiftPx}px)`, offset: 0.28 },
          { transform: 'scale(1) translateY(0)', offset: 1 },
        ],
        { duration: n.ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    },
    frame(now) {
      if (!g) return;
      if (particles.length === 0) {
        if (drawn) {
          g.clearRect(0, 0, canvas.width, canvas.height);
          drawn = false;
        }
        return;
      }
      const dpr = fit();
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.save();
      g.scale(dpr, dpr);
      particles = particles.filter((q) => now - q.born < q.ms);
      for (const q of particles) {
        const base = project(q.at);
        if (!base) continue;
        const u = Math.max(0, Math.min(1, (now - q.born) / q.ms));
        const e = 1 - Math.pow(1 - u, 3);
        if (q.type === 'dust') {
          const x = base.x + q.dx * q.dist * e;
          const y = base.y + q.dy * q.dist * e - 10 * u;
          const r = q.size * (0.6 + 0.9 * e);
          g.globalAlpha = 0.5 * (1 - u) * (1 - u * 0.3);
          g.fillStyle = '#e9d8b4';
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        } else if (q.type === 'spark') {
          const x0 = base.x + q.dx * q.dist * Math.max(0, e - 0.25);
          const y0 = base.y + q.dy * q.dist * Math.max(0, e - 0.25) + 18 * u * u;
          const x1 = base.x + q.dx * q.dist * e;
          const y1 = base.y + q.dy * q.dist * e + 18 * u * u;
          g.globalAlpha = 1 - u;
          g.strokeStyle = u < 0.5 ? '#fffbe6' : '#ffc21a';
          g.lineWidth = Math.max(1, q.size * 0.3 * (1 - u));
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
        } else {
          g.globalAlpha = 0.7 * (1 - u);
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2.5 * (1 - u) + 0.5;
          g.beginPath();
          g.ellipse(base.x, base.y, q.dist * e, q.dist * e * 0.5, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
      drawn = true;
    },
    clear() {
      particles = [];
    },
  };
}
