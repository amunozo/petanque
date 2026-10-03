export interface TrackedPointer {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Trail points in CSS pixels. */
  points: { x: number; y: number }[];
}

export interface TouchTracker {
  readonly active: ReadonlyMap<number, TrackedPointer>;
  /** Length in px of the most recently finished/updated drag (start -> current/end). */
  readonly lastDragLength: number;
  /** Trails of released pointers, with release time (ms, from event.timeStamp). */
  readonly finished: { points: { x: number; y: number }[]; endedAt: number }[];
  dispose(): void;
}

const MAX_TRAIL_POINTS = 256;

/** Tracks Pointer Events on `target` (with pointer capture) for touch testing. */
export function createTouchTracker(target: HTMLElement, now: () => number): TouchTracker {
  const active = new Map<number, TrackedPointer>();
  const state = {
    lastDragLength: 0,
    finished: [] as { points: { x: number; y: number }[]; endedAt: number }[],
  };

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const p = local(e);
    active.set(e.pointerId, { id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, points: [p] });
    state.lastDragLength = 0;
  };

  const onMove = (e: PointerEvent): void => {
    const t = active.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) {
      const p = local(ce);
      t.x = p.x;
      t.y = p.y;
      t.points.push(p);
    }
    if (t.points.length > MAX_TRAIL_POINTS) t.points.splice(0, t.points.length - MAX_TRAIL_POINTS);
    state.lastDragLength = Math.hypot(t.x - t.startX, t.y - t.startY);
  };

  const onEnd = (e: PointerEvent): void => {
    const t = active.get(e.pointerId);
    if (!t) return;
    onMove(e);
    active.delete(e.pointerId);
    state.finished.push({ points: t.points, endedAt: now() });
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
  };

  const opts = { passive: false } as const;
  target.addEventListener('pointerdown', onDown, opts);
  target.addEventListener('pointermove', onMove, opts);
  target.addEventListener('pointerup', onEnd);
  target.addEventListener('pointercancel', onEnd);

  return {
    active,
    get lastDragLength() {
      return state.lastDragLength;
    },
    finished: state.finished,
    dispose() {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
    },
  };
}
