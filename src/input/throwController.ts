/**
 * DOM glue: Pointer Events on `target` -> onPreview / onThrow via gestures.ts.
 * Single pointer only; a second finger cancels the current gesture.
 */
import type { ControlScheme, GameConfig, LoftPreset } from '../tuning/config';
import { flickIntent, flickPreview, slingshotIntent, slingshotPreview, type Sample } from './gestures';
import type { AimPreview, ThrowIntent } from './types';

export interface ThrowHandlers {
  /** Called during a drag; null = nothing to show / cancelled / in cancel zone. */
  onPreview(p: AimPreview | null): void;
  onThrow(intent: ThrowIntent): void;
}

export interface ThrowController {
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

interface Gesture {
  pointerId: number;
  scheme: ControlScheme;
  /** Slingshot pull (px) that gives power 1, resolved from the viewport height at gesture start. */
  fullPowerPx: number;
  start: { x: number; y: number };
  last: { x: number; y: number };
  samples: Sample[];
}

/** Keep only recent samples for flick velocity (plus margin over the 80 ms window). */
const SAMPLE_KEEP_MS = 300;

export function createThrowController(
  target: HTMLElement,
  getConfig: () => GameConfig,
  getLoft: () => LoftPreset,
  handlers: ThrowHandlers,
): ThrowController {
  let enabled = true;
  let gesture: Gesture | null = null;
  const down = new Set<number>(); // all pointers currently down on target

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const release = (id: number): void => {
    try {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  };

  const cancel = (): void => {
    if (!gesture) return;
    release(gesture.pointerId);
    gesture = null;
    handlers.onPreview(null);
  };

  const push = (g: Gesture, p: { x: number; y: number }, t: number): void => {
    g.last = p;
    g.samples.push({ x: p.x, y: p.y, t });
    const cutoff = t - SAMPLE_KEEP_MS;
    let drop = 0;
    while (drop < g.samples.length - 2 && (g.samples[drop] as Sample).t < cutoff) drop++;
    if (drop > 0) g.samples.splice(0, drop);
  };

  const preview = (g: Gesture): void => {
    const controls = getConfig().controls;
    const loft = getLoft();
    handlers.onPreview(
      g.scheme === 'slingshot'
        ? slingshotPreview(g.start, g.last, controls, loft, g.fullPowerPx)
        : flickPreview(g.samples, controls, loft),
    );
  };

  const onDown = (e: PointerEvent): void => {
    down.add(e.pointerId);
    if (gesture) {
      cancel(); // second finger: abort; ignore everything until all fingers lift
      return;
    }
    if (!enabled || down.size > 1) return;
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* best effort */
    }
    const p = local(e);
    gesture = {
      pointerId: e.pointerId,
      scheme: getConfig().controls.scheme,
      fullPowerPx: getConfig().controls.fullPowerDragFrac * (target.clientHeight || window.innerHeight),
      start: p,
      last: p,
      samples: [{ x: p.x, y: p.y, t: e.timeStamp }],
    };
  };

  const onMove = (e: PointerEvent): void => {
    const g = gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) push(g, local(ce), ce.timeStamp);
    preview(g);
  };

  const onUp = (e: PointerEvent): void => {
    down.delete(e.pointerId);
    const g = gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    push(g, local(e), e.timeStamp);
    release(g.pointerId);
    gesture = null;
    const controls = getConfig().controls;
    const loft = getLoft();
    const intent =
      g.scheme === 'slingshot'
        ? slingshotIntent(g.start, g.last, controls, loft, g.fullPowerPx)
        : flickIntent(g.samples, controls, loft);
    handlers.onPreview(null);
    if (intent) handlers.onThrow(intent);
  };

  const onCancel = (e: PointerEvent): void => {
    down.delete(e.pointerId);
    if (gesture && e.pointerId === gesture.pointerId) cancel();
  };

  const opts = { passive: false } as const;
  target.addEventListener('pointerdown', onDown, opts);
  target.addEventListener('pointermove', onMove, opts);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);

  return {
    setEnabled(b) {
      enabled = b;
      if (!b) cancel();
    },
    dispose() {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onCancel);
      cancel();
      down.clear();
    },
  };
}
