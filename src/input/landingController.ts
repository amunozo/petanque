/**
 * DOM glue for the "landing spot" controls (pointer events only, no drawing):
 *  - on the court surface (the canvas): touch to place the marker, drag to
 *    adjust it. The marker sits `markerOffsetPx` above the finger and follows
 *    it at `dragGainX/Y` (< 1 = finer than the finger); a touch near the marker
 *    picks it up without jumping;
 *  - on the throw handle: the swipe up, read by landingGesture.ts.
 * Spots are world X/Z points; the caller maps screen <-> court (aim camera)
 * and clamps spots. Single pointer per gesture; a second finger cancels.
 */
import type { GameConfig } from '../tuning/config';
import type { Point, Sample } from './gestures';
import { swipeMetrics, swipeSkill, type SwipeMetrics, type SwipeSkill } from './landingGesture';

export interface CourtSpot {
  x: number;
  z: number;
}

export interface LandingInputHandlers {
  /** The marker moved to `spot` (as asked: the caller clamps it). Returns the spot actually used, or null to ignore. */
  onSpot(spot: CourtSpot): CourtSpot | null;
  /** Live swipe path (surface px) for the trail; null when the swipe ends or is cancelled. */
  onSwipeMove(points: readonly Point[] | null): void;
  /** A finished swipe: its reading, or null when it was not a throw (tap, downward, too slow). */
  onSwipe(result: { metrics: SwipeMetrics; skill: SwipeSkill; points: readonly Point[] } | null): void;
}

export interface LandingInputDeps {
  /** The court (canvas): placing the marker. */
  surface: HTMLElement;
  /** The throw handle: the swipe starts on it. */
  handle: HTMLElement;
  getConfig(): GameConfig;
  /** Current (clamped) marker, if any. */
  getSpot(): CourtSpot | null;
  /** Ground point under a surface point (aim view); null above the horizon. */
  pick(x: number, y: number): CourtSpot | null;
  /** Surface position of a ground point (aim view). */
  project(spot: CourtSpot): Point | null;
  /** False while the view is elsewhere (e.g. the close-up after a throw): that touch only brings the aim view back. */
  canPlace(): boolean;
}

export interface LandingInput {
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

type Drag =
  | { kind: 'place'; pointerId: number; start: Point; anchor: Point }
  | { kind: 'swipe'; pointerId: number; samples: Sample[]; el: HTMLElement };

/** Re-anchor when the clamped marker lands farther than this (px) from where the finger asked for it. */
const REANCHOR_PX = 1.5;

export function createLandingInput(deps: LandingInputDeps, handlers: LandingInputHandlers): LandingInput {
  const { surface, handle } = deps;
  let enabled = false;
  let drag: Drag | null = null;
  const down = new Set<number>();

  const local = (e: PointerEvent): Point => {
    const r = surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const release = (d: Drag): void => {
    const el = d.kind === 'swipe' ? d.el : surface;
    try {
      if (el.hasPointerCapture(d.pointerId)) el.releasePointerCapture(d.pointerId);
    } catch {
      /* ignore */
    }
  };

  const cancel = (): void => {
    if (!drag) return;
    release(drag);
    if (drag.kind === 'swipe') handlers.onSwipeMove(null);
    drag = null;
  };

  /** Moves the marker to the ground under surface point `at`; keeps the drag anchored to the clamped result. */
  const placeAt = (d: Extract<Drag, { kind: 'place' }>, at: Point): void => {
    const raw = deps.pick(at.x, at.y);
    if (!raw) return;
    const used = handlers.onSpot(raw);
    if (!used) return;
    const sp = deps.project(used);
    if (sp && Math.hypot(sp.x - at.x, sp.y - at.y) > REANCHOR_PX) {
      d.anchor = { x: d.anchor.x + (sp.x - at.x), y: d.anchor.y + (sp.y - at.y) };
    }
  };

  const target = (d: Extract<Drag, { kind: 'place' }>, p: Point): Point => {
    const c = deps.getConfig().landing;
    return { x: d.anchor.x + (p.x - d.start.x) * c.dragGainX, y: d.anchor.y + (p.y - d.start.y) * c.dragGainY };
  };

  const begin = (e: PointerEvent, el: HTMLElement): boolean => {
    down.add(e.pointerId);
    if (drag) {
      cancel(); // second finger: abort
      return false;
    }
    if (!enabled || down.size > 1) return false;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* best effort */
    }
    return true;
  };

  const onSurfaceDown = (e: PointerEvent): void => {
    if (enabled && !drag && !deps.canPlace()) {
      down.add(e.pointerId);
      return;
    }
    if (!begin(e, surface)) return;
    const p = local(e);
    const c = deps.getConfig().landing;
    const spot = deps.getSpot();
    const sp = spot ? deps.project(spot) : null;
    // Near the marker (or where a finger holding it would be): pick it up where it is.
    const grab = sp !== null && (Math.hypot(p.x - sp.x, p.y - sp.y) <= c.grabRadiusPx || Math.hypot(p.x - sp.x, p.y - (sp.y + c.markerOffsetPx)) <= c.grabRadiusPx);
    const d: Extract<Drag, { kind: 'place' }> = { kind: 'place', pointerId: e.pointerId, start: p, anchor: grab && sp ? sp : { x: p.x, y: p.y - c.markerOffsetPx } };
    drag = d;
    if (!grab) placeAt(d, d.anchor);
  };

  const onHandleDown = (e: PointerEvent): void => {
    e.stopPropagation();
    if (!begin(e, handle)) return;
    const p = local(e);
    drag = { kind: 'swipe', pointerId: e.pointerId, samples: [{ x: p.x, y: p.y, t: e.timeStamp }], el: handle };
    handlers.onSwipeMove([p]);
  };

  const onMove = (e: PointerEvent): void => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [e];
    if (d.kind === 'place') {
      const last = list[list.length - 1] as PointerEvent;
      placeAt(d, target(d, local(last)));
      return;
    }
    for (const ce of list) {
      const p = local(ce);
      d.samples.push({ x: p.x, y: p.y, t: ce.timeStamp });
    }
    handlers.onSwipeMove(d.samples);
  };

  const onUp = (e: PointerEvent): void => {
    down.delete(e.pointerId);
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    release(d);
    drag = null;
    if (d.kind === 'place') return;
    const p = local(e);
    const lastS = d.samples[d.samples.length - 1];
    if (!lastS || lastS.t !== e.timeStamp) d.samples.push({ x: p.x, y: p.y, t: e.timeStamp });
    handlers.onSwipeMove(null);
    const height = surface.clientHeight || window.innerHeight;
    const cfg = deps.getConfig().landing;
    const metrics = swipeMetrics(d.samples, height, cfg);
    handlers.onSwipe(metrics ? { metrics, skill: swipeSkill(metrics, cfg), points: d.samples } : null);
  };

  const onCancel = (e: PointerEvent): void => {
    down.delete(e.pointerId);
    if (drag && e.pointerId === drag.pointerId) cancel();
  };

  const opts = { passive: false } as const;
  surface.addEventListener('pointerdown', onSurfaceDown, opts);
  handle.addEventListener('pointerdown', onHandleDown, opts);
  for (const el of [surface, handle]) {
    el.addEventListener('pointermove', onMove, opts);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  }

  return {
    setEnabled(b) {
      enabled = b;
      if (!b) cancel();
    },
    dispose() {
      surface.removeEventListener('pointerdown', onSurfaceDown);
      handle.removeEventListener('pointerdown', onHandleDown);
      for (const el of [surface, handle]) {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
      }
      cancel();
      down.clear();
    },
  };
}
