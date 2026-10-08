/** What the app modes (practice, match) share: view, HUD, config and input plumbing. */
import type { AimPreview, LoftPicker, ThrowIntent } from '../input';
import type { Audio } from '../audio';
import type { PitchScene } from '../render';
import type { ConfigStore, GameConfig } from '../tuning';
import type { Fx } from './fx';
import type { Haptics } from './haptics';
import type { Hud } from './hud';
import type { MatchHud } from './matchHud';
import type { MeasureOverlay } from './measure';

export interface AppContext {
  app: HTMLElement;
  store: ConfigStore;
  /** Live config (mutated in place by the tuning panel). */
  cfg: GameConfig;
  scene: PitchScene;
  hud: Hud;
  matchHud: MatchHud;
  haptics: Haptics;
  audio: Audio;
  loftPicker: LoftPicker;
  /** Screen effects (dust burst, camera nudge) and the measuring lines drawn over the scene. */
  fx: Fx;
  measure: MeasureOverlay;
  /** Re-evaluates whether throw gestures / the touch cue are active (call after any state change). */
  refreshInput(): void;
  /** True while the tuning panel, the menu or a dialog is up: nothing automatic (the computer's turn) may advance. */
  uiBlocked(): boolean;
  /** Counts a throw for the "touch here" cue. */
  noteThrow(): void;
  /** Fresh seed for a new session (the `?seed=` URL param for the first one, for reproducible runs). */
  newSeed(): number;
}

export interface ThrowSetup {
  ball: 'boule' | 'jack';
  cfg: GameConfig;
}

export interface Mode {
  /** Show this mode's UI and start a fresh session. */
  enter(): void;
  /** Hide this mode's UI and drop any simulation in progress. */
  exit(): void;
  /** May a throw gesture start now (menu / panel / dialogs are checked by the caller)? */
  canAim(): boolean;
  /** Leaving would lose progress, so the menu button asks first. */
  inProgress(): boolean;
  /** Text of the "Leave the match?" dialog (default: the match will be lost). */
  leaveText?(): string;
  /** Leaving for the menu was confirmed (online: tell the server). */
  leave?(): void;
  onPreview(p: AimPreview | null): void;
  onThrow(intent: ThrowIntent): void;
  /** What the next throw is (the jack or a boule) and the config it is played with (online: the server's defaults). For the landing-spot controls. */
  throwSetup(): ThrowSetup;
  /** Once per animation frame: advance the simulation and sync the view's bodies. */
  frame(dtReal: number): void;
}
