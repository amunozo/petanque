/**
 * "Touch here" cue for the slingshot gesture: a soft pulsing circle with a
 * small pull-down arrow. Purely visual (pointer-events: none): the gesture
 * still starts anywhere on the screen. Text appears only before the player's
 * first throw; afterwards a fainter marker stays for a couple more throws.
 */

/** Throws (per page load) during which a faint marker (no text) stays after the first one. */
export const FAINT_THROWS = 2;

export type TouchHintLevel = 'full' | 'faint' | 'none';

/** Which version of the cue to show after `throwsDone` throws this page load. */
export function touchHintLevel(throwsDone: number): TouchHintLevel {
  if (throwsDone <= 0) return 'full';
  return throwsDone <= FAINT_THROWS ? 'faint' : 'none';
}

export interface TouchHint {
  /** `active` = aiming, no drag in progress, no panel / end card in the way. */
  update(active: boolean, throwsDone: number): void;
}

export function createTouchHint(parent: HTMLElement): TouchHint {
  const root = document.createElement('div');
  root.className = 'touch-hint';
  root.hidden = true;
  root.innerHTML =
    '<div class="touch-hint-text">Put your finger anywhere,<br><b>pull down</b> and <b>let go</b> to throw</div>' +
    '<div class="touch-hint-marker"><span class="touch-hint-arrow"></span></div>';
  parent.append(root);

  return {
    update(active, throwsDone) {
      const level = touchHintLevel(throwsDone);
      root.hidden = !active || level === 'none';
      root.classList.toggle('is-faint', level === 'faint');
    },
  };
}
