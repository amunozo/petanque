/** Real-time playback of an engine World with a fixed-timestep accumulator (shared by the modes). */
import { isSettled, step, type SimEvent, type World } from '../engine';
import type { AppContext } from './context';

/** Hard cap on physics steps per frame (avoids a spiral of death on slow devices). */
const MAX_STEPS_PER_FRAME = 600;
/** A throw that has not settled after this much simulated time is forced to rest. */
const MAX_THROW_SECONDS = 40;

export interface Playback {
  /** Forgets the events collected for the current throw (call when a throw starts or ends). */
  reset(): void;
  /** Every event of the throw in progress, in order (for shot analysis once it settles). */
  events(): readonly SimEvent[];
  /** Advances `world` by `dtReal` real seconds (x playbackSpeed); true once it has settled (or timed out). */
  advance(world: World, dtReal: number): boolean;
}

/** Horizontal speed of the fastest rolling ball (m/s); 0 when none rolls. */
export function fastestRolling(w: World): number {
  let fastest = 0;
  for (const b of w.bodies) if (b.state === 'rolling') fastest = Math.max(fastest, Math.hypot(b.vel.x, b.vel.z));
  return fastest;
}

export function createPlayback(ctx: AppContext): Playback {
  let accumulator = 0;
  let collected: SimEvent[] = [];
  return {
    reset() {
      accumulator = 0;
      collected = [];
      ctx.audio.setRolling(0);
    },
    events: () => collected,
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
      for (const e of events) collected.push(e);
      ctx.haptics.handle(events);
      ctx.audio.handle(events, w.bodies);
      const done = isSettled(w) || w.time > MAX_THROW_SECONDS;
      ctx.audio.setRolling(done ? 0 : fastestRolling(w));
      return done;
    },
  };
}
