/**
 * Maps a player's intent (aim, power, loft) plus random error samples to the
 * physical ThrowParams. All feel numbers come from the config.
 */
import type { ThrowParams } from './types';

/** 'shoot' = le tir: fast, flat throw to knock boules away (speeds scaled by shootSpeedMul). */
export type Loft = 'roll' | 'half' | 'lob' | 'shoot';

/** Structurally identical to GameConfig['throw'] so callers can pass it directly. */
export interface ThrowModelConfig {
  /** Hand position at release. */
  originX: number;
  originY: number;
  originZ: number;
  /** Launch speed at power = 1 (m/s). */
  maxSpeed: number;
  /** Launch speed at power = 0 (m/s). */
  minSpeed: number;
  /** power -> speed curve exponent. */
  powerCurve: number;
  /** Elevation angle per loft preset (degrees). */
  loftRollDeg: number;
  loftHalfDeg: number;
  loftLobDeg: number;
  loftShootDeg: number;
  /** Backspin per loft preset (rad/s). */
  backspinRoll: number;
  backspinHalf: number;
  backspinLob: number;
  backspinShoot: number;
  /** Multiplies min/max launch speed for the 'shoot' loft. */
  shootSpeedMul: number;
  /** Random error, 1 standard deviation. */
  aimNoiseDeg: number;
  powerNoisePct: number;
  /**
   * Per-loft multipliers on the random error above (absent = 1): some throws are
   * harder to execute than others (a high lob is harder to judge than a roll,
   * a practised shot is thrown along a very straight line).
   */
  aimNoiseMulRoll?: number;
  aimNoiseMulHalf?: number;
  aimNoiseMulLob?: number;
  aimNoiseMulShoot?: number;
  powerNoiseMulRoll?: number;
  powerNoiseMulHalf?: number;
  powerNoiseMulLob?: number;
  powerNoiseMulShoot?: number;
}

export interface ThrowIntent {
  /** Aim angle in radians (0 = straight toward -Z, positive = toward -X). */
  aim: number;
  /** 0..1 (clamped). */
  power: number;
  loft: Loft;
}

/** Standard-normal samples (mean 0, sd 1) supplied by the caller, e.g. from `Rng.normal()`. */
export interface ThrowNoise {
  aim: number;
  power: number;
}

const DEG_TO_RAD = Math.PI / 180;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Execution-error multipliers [aim, power] for a loft (1 when not configured). */
export function noiseMuls(loft: Loft, cfg: ThrowModelConfig): [number, number] {
  switch (loft) {
    case 'roll':
      return [cfg.aimNoiseMulRoll ?? 1, cfg.powerNoiseMulRoll ?? 1];
    case 'half':
      return [cfg.aimNoiseMulHalf ?? 1, cfg.powerNoiseMulHalf ?? 1];
    case 'lob':
      return [cfg.aimNoiseMulLob ?? 1, cfg.powerNoiseMulLob ?? 1];
    case 'shoot':
      return [cfg.aimNoiseMulShoot ?? 1, cfg.powerNoiseMulShoot ?? 1];
  }
}

export function intentToThrow(intent: ThrowIntent, cfg: ThrowModelConfig, noise: ThrowNoise): ThrowParams {
  const power = clamp01(Number.isFinite(intent.power) ? intent.power : 0);
  const speedMul = intent.loft === 'shoot' ? cfg.shootSpeedMul : 1;
  const [aimMul, powerMul] = noiseMuls(intent.loft, cfg);
  const baseSpeed = (cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * Math.pow(power, cfg.powerCurve)) * speedMul;
  const speed = Math.max(0, baseSpeed * (1 + (noise.power * cfg.powerNoisePct * powerMul) / 100));
  const yaw = intent.aim + noise.aim * cfg.aimNoiseDeg * aimMul * DEG_TO_RAD;

  let pitchDeg: number;
  let backspin: number;
  switch (intent.loft) {
    case 'roll':
      pitchDeg = cfg.loftRollDeg;
      backspin = cfg.backspinRoll;
      break;
    case 'half':
      pitchDeg = cfg.loftHalfDeg;
      backspin = cfg.backspinHalf;
      break;
    case 'lob':
      pitchDeg = cfg.loftLobDeg;
      backspin = cfg.backspinLob;
      break;
    case 'shoot':
      pitchDeg = cfg.loftShootDeg;
      backspin = cfg.backspinShoot;
      break;
  }

  return {
    yaw,
    pitch: pitchDeg * DEG_TO_RAD,
    speed,
    origin: { x: cfg.originX, y: cfg.originY, z: cfg.originZ },
    backspin,
  };
}
