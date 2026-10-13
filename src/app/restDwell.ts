/**
 * The result "dwell": after a throw settles the camera shows the close-up over
 * the jack ('rest') long enough to read the result, then glides back behind
 * the throwing circle ('aim') when the next throw is made from this device.
 * No throw gesture may start while it runs (the player would aim from above);
 * a touch on the field ends it at once instead (the mode
 * clears it and glides back; that touch never starts a throw). Pure: time is passed in.
 */

/** Who makes the next throw, as this device sees it. */
export type NextThrower =
  /** A player on this phone (practice, pass-and-play, the human vs the computer, this device online). */
  | 'local'
  /** The computer opponent: its aim is shown from the circle like a player's. */
  | 'computer'
  /** The other player online: the close-up stays until their throw comes in. */
  | 'remote'
  /** Nobody (end over, match over): the cards decide when the view moves on. */
  | 'none';

/** Does the view go back behind the circle (after the dwell) for this next thrower? */
export const returnsToAim = (next: NextThrower): boolean => next === 'local' || next === 'computer';

export interface DwellSettings {
  /** Minimum time on the result (s). */
  dwellS: number;
  /** false = no automatic return: only a touch ends the dwell. */
  auto: boolean;
}

export interface RestDwell {
  /** A throw settled: start showing the result. `holdS` = something on screen needs at least this long (measuring lines). */
  start(holdS?: number): void;
  /** Drop it (a new throw, a new end, leaving the mode). */
  clear(): void;
  /** Running: the camera is on the result and throw gestures must wait. */
  active(): boolean;
  /** Advance by `dt` real seconds; true exactly once, when it is time to glide back to the aim view. */
  tick(dt: number): boolean;
}

/** Is the dwell over after `elapsedS`? (`holdS` lengthens it; `auto` false waits for a touch.) */
export function dwellDone(elapsedS: number, holdS: number, s: DwellSettings): boolean {
  if (!s.auto) return false;
  return elapsedS >= Math.max(0, s.dwellS, holdS);
}

/** `onChange(running)` reports start / end (the app marks the page with it, a hook for tests and styling). */
export function createRestDwell(settings: () => DwellSettings, onChange: (running: boolean) => void = () => undefined): RestDwell {
  let running = false;
  let elapsed = 0;
  let hold = 0;
  const set = (next: boolean): void => {
    if (next === running) return;
    running = next;
    onChange(next);
  };
  return {
    start(holdS = 0) {
      elapsed = 0;
      hold = holdS;
      set(true);
    },
    clear() {
      set(false);
    },
    active: () => running,
    tick(dt) {
      if (!running) return false;
      elapsed += Math.max(0, dt);
      if (!dwellDone(elapsed, hold, settings())) return false;
      set(false);
      return true;
    },
  };
}

/** Marks `#app[data-dwell]` while the result is shown from above. */
export const markDwell =
  (app: HTMLElement) =>
  (running: boolean): void => {
    if (running) app.dataset['dwell'] = '1';
    else delete app.dataset['dwell'];
  };
