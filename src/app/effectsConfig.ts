/**
 * Live-tunable numbers for the app-level effects: measuring lines, the carreau
 * celebration (dust, camera nudge, haptics). Plain mutable objects, read each time
 * an effect runs (like audio/config.ts).
 *
 * TODO: fold into GameConfig + the tuning panel (src/tuning/config.ts is owned by
 * another change right now).
 */
import { DEFAULT_CARREAU, type CarreauConfig } from '../games/petanque/carreau';

export interface MeasureEffectConfig {
  /** Wait after the last boule rests, so the camera has reached the close-up (ms). */
  startMs: number;
  /** Time to draw the lines (ms). */
  drawMs: number;
  /** Time the lines are shown before the end card follows (ms). */
  holdMs: number;
  /** Also measure after a throw when both teams' best boules are within this gap of each other (m); 0 = off. */
  tightGap: number;
  /** A team's line is skipped when its boule is farther than this from the jack (m): nothing to compare. */
  maxMeasured: number;
  /** Line width (CSS px) and end-tick half length (px). */
  lineWidth: number;
  tickHalf: number;
}

export interface BurstEffectConfig {
  dust: number;
  sparks: number;
  /** Total life of the burst (ms). */
  ms: number;
  /** Peak dust puff radius (px) and how far sparks fly (px). */
  puffPx: number;
  sparkPx: number;
}

export interface NudgeConfig {
  ms: number;
  /** Peak zoom (1 = none) and downward shift (px) of the view. */
  scale: number;
  shiftPx: number;
}

export interface HapticPatterns {
  /** vibrate() patterns (ms on / off / on ...). */
  carreau: readonly number[];
  hit: readonly number[];
}

export interface EffectsConfig {
  measure: MeasureEffectConfig;
  carreau: CarreauConfig;
  burst: { carreau: BurstEffectConfig; hit: BurstEffectConfig };
  nudge: { carreau: NudgeConfig; hit: NudgeConfig };
  haptics: HapticPatterns;
}

export const effectsConfig: EffectsConfig = {
  measure: { startMs: 650, drawMs: 550, holdMs: 900, tightGap: 0.08, maxMeasured: 4, lineWidth: 2.4, tickHalf: 5 },
  carreau: { ...DEFAULT_CARREAU },
  burst: {
    carreau: { dust: 12, sparks: 16, ms: 950, puffPx: 46, sparkPx: 95 },
    hit: { dust: 6, sparks: 5, ms: 650, puffPx: 24, sparkPx: 40 },
  },
  nudge: {
    carreau: { ms: 420, scale: 1.045, shiftPx: 6 },
    hit: { ms: 300, scale: 1.02, shiftPx: 3 },
  },
  haptics: { carreau: [35, 45, 35, 45, 130], hit: [30, 40, 55] },
};
