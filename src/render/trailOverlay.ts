import type { TouchTracker } from '../input/touchTracker';

export interface TrailOverlay {
  resize(): void;
  draw(tracker: TouchTracker, nowMs: number): void;
}

/** Tunable look of the touch trail. */
export const trailStyle = {
  fadeMs: 700,
  lineWidth: 6,
  dotRadius: 14,
  colors: ['#ff4d4d', '#4dd2ff', '#ffd24d', '#7dff4d', '#d24dff'],
} as const;

/** 2D overlay canvas drawing live drag trails (touch test). */
export function createTrailOverlay(canvas: HTMLCanvasElement): TrailOverlay {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  let dpr = 1;

  const stroke = (pts: { x: number; y: number }[], color: string, alpha: number): void => {
    if (pts.length === 0) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  };

  return {
    resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    },
    draw(tracker, nowMs) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.lineWidth = trailStyle.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = tracker.finished.length - 1; i >= 0; i--) {
        const f = tracker.finished[i]!;
        const age = nowMs - f.endedAt;
        if (age > trailStyle.fadeMs) {
          tracker.finished.splice(i, 1);
          continue;
        }
        stroke(f.points, '#ffffff', 1 - age / trailStyle.fadeMs);
      }

      let n = 0;
      for (const t of tracker.active.values()) {
        const color = trailStyle.colors[n++ % trailStyle.colors.length]!;
        stroke(t.points, color, 1);
        // Straight start -> current vector
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(t.startX, t.startY);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, trailStyle.dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
