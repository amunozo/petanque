/**
 * The reward for a good shot, with no words on screen: a stinger (double clack + chime +
 * crowd "oh!" for a carreau, a milder one for a tir réussi), a vibration pattern, a burst of
 * dust and sparks where the target lay, and a light nudge of the view. Sound and vibration
 * follow the player's mute / haptics settings (audio.ts and haptics.ts check them).
 */
import type { Vec3 } from '../engine';
import type { Audio } from '../audio';
import type { Fx, FxKind } from './fx';
import type { Haptics } from './haptics';

export interface ShotEffectDeps {
  audio: Pick<Audio, 'celebrate'>;
  haptics: Pick<Haptics, 'celebrate'>;
  fx: Pick<Fx, 'burst' | 'nudge'>;
}

export function playShotEffects(deps: ShotEffectDeps, kind: FxKind, spot: Vec3 | undefined): void {
  deps.audio.celebrate(kind);
  deps.haptics.celebrate(kind);
  deps.fx.nudge(kind);
  if (spot) deps.fx.burst({ x: spot.x, y: 0, z: spot.z }, kind);
}
