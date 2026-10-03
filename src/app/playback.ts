/** Real-time playback of an engine World with a fixed-timestep accumulator (shared by the modes). */
import { isSettled, step, type SimEvent, type World } from '../engine';
import type { AppContext } from './context';

/** Hard cap on physics steps per frame (avoids a spiral of death on slow devices). */
const MAX_STEPS_PER_FRAME = 600;
/** A throw that has not settled after this much simulated time is forced to rest. */
const MAX_THROW_SECONDS = 40;

export interface Playback {
  reset(): void;
  /** Advances `world` by `dtReal` real seconds (x playbackSpeed); true once it has settled (or timed out). */
  advance(world: World, dtReal: number): boolean;
}

export function createPlayback(ctx: AppContext): Playback {
  let accumulator = 0;
  return {
    reset() {
      accumulator = 0;
    },
    advance(w, dtReal) {
      const { cfg } = ctx;
      accumulator += dtReal * cfg.camera.playbackSpeed;
      const dt = cfg.physics.fixedDt;
      const events: SimEvent[] = [];
      let steps = 0;
      while (accumulator >= dt && steps < MAX_STEPS_PER_FRAME) {
        for (const e of step(w, cfg.physics)) events.push(e);
        accumulator -= dt;
        steps++;
        if (isSettled(w) || w.time > MAX_THROW_SECONDS) break;
      }
      if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0; // drop the backlog instead of spiralling
      ctx.haptics.handle(events);
      return isSettled(w) || w.time > MAX_THROW_SECONDS;
    },
  };
}
