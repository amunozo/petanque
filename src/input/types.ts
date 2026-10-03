import type { LoftPreset } from '../tuning/config';

/**
 * What a gesture produced: the player's *intention*, before noise and before
 * converting to physical launch values (see engine/throwModel.ts).
 * Serializable — AI players and network peers produce the same shape.
 */
export interface ThrowIntent {
  /** Aim angle in radians. 0 = straight toward -Z, positive = toward -X (left). */
  aim: number;
  /** 0..1 */
  power: number;
  loft: LoftPreset;
}

/** Live state while the finger is down, for previews (aim line, landing marker, power bar). */
export interface AimPreview {
  aim: number;
  power: number;
  /** Raw finger positions in CSS px, for drawing the gesture itself. */
  start: { x: number; y: number };
  current: { x: number; y: number };
}
