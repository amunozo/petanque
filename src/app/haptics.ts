/** Vibration feedback for simulation events. Best effort: silently does nothing where unsupported. */
import type { SimEvent } from '../engine';

/** Never trigger vibrations closer together than this (ms). */
const MIN_GAP_MS = 50;
const LAND_MS = { base: 8, perSpeed: 5, max: 40 };
const HIT_MS = { base: 35, perSpeed: 10, max: 90 };

export interface Haptics {
  /** Call once per frame with the events of that frame; vibrates for the strongest one. */
  handle(events: readonly SimEvent[]): void;
}

export function createHaptics(isEnabled: () => boolean, now: () => number = () => performance.now()): Haptics {
  let lastAt = -Infinity;
  const buzz = (ms: number): void => {
    const t = now();
    if (t - lastAt < MIN_GAP_MS) return;
    lastAt = t;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(Math.round(ms));
    } catch {
      /* unsupported or blocked */
    }
  };
  return {
    handle(events) {
      if (events.length === 0 || !isEnabled()) return;
      let hit = 0;
      let land = 0;
      for (const e of events) {
        if (e.type === 'hit') hit = Math.max(hit, e.speed);
        else if (e.type === 'land') land = Math.max(land, e.speed);
      }
      if (hit > 0) buzz(Math.min(HIT_MS.max, HIT_MS.base + hit * HIT_MS.perSpeed));
      else if (land > 0) buzz(Math.min(LAND_MS.max, LAND_MS.base + land * LAND_MS.perSpeed));
    },
  };
}
