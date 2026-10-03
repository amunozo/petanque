/**
 * Live-tunable numbers for the procedural sound design (nothing here is a
 * sample: every sound is synthesised in voices.ts / rumble.ts).
 *
 * TODO: fold into GameConfig (e.g. GameConfig.audio) and the tuning panel; for
 * now it is a plain mutable object so a console can tweak it:
 *   import { audioConfig } from './audio'; audioConfig.hit.gain = 0.5
 * Voices read these values each time they play (never cached).
 */
export interface PartialSpec {
  /** Frequency (Hz). */
  hz: number;
  /** Relative level at full brightness. */
  gain: number;
  /** Decay time (s) at full impact. */
  decay: number;
}

export interface ImpactSoundConfig {
  /** Impacts slower than this (m/s) are silent. */
  minSpeed: number;
  /** Impact speed (m/s) that gives the full level. */
  refSpeed: number;
  /** Overall level of the voice (0..1). */
  gain: number;
  partials: PartialSpec[];
  /** Random detune of every partial, +-fraction (hash-based, so deterministic). */
  detune: number;
  /** 0..1: how much the upper partials fade at low impact speed (1 = not at all). */
  brightness: number;
  /** Level / length of the noise transient on top. */
  noiseGain: number;
  noiseMs: number;
  noiseHz: number;
}

export interface AudioConfig {
  masterVolume: number;
  /** At most this many sounds are started per animation frame (the loudest win). */
  maxVoicesPerFrame: number;
  /** Hard cap on simultaneously sounding voices. */
  maxActiveVoices: number;
  /** boule against boule: bright metallic clack. */
  hit: ImpactSoundConfig;
  /** boule against jack: higher, woodier, softer. */
  jackHit: ImpactSoundConfig;
  /** Ball landing on gravel: band-passed noise grains + low thump. */
  land: {
    minSpeed: number;
    refSpeed: number;
    gain: number;
    lowHz: number;
    highHz: number;
    thumpHz: number;
    thumpGain: number;
    ms: number;
  };
  /** Ball hitting the side board: dull wooden knock. */
  board: { minSpeed: number; refSpeed: number; gain: number; hz: number; ms: number };
  /** Continuous gravel rumble while a ball rolls. */
  rumble: {
    /** Rolling speed (m/s) below which it is silent. */
    minSpeed: number;
    /** Rolling speed (m/s) that gives the full level. */
    refSpeed: number;
    gain: number;
    minCutoffHz: number;
    maxCutoffHz: number;
    /** Smoothing time constant (s) of gain and cutoff. */
    smoothing: number;
    /** Depth (0..1) of the slow crackle modulation. */
    crackle: number;
  };
  ui: { tickGain: number; tickHz: number; chimeGain: number };
}

export const audioConfig: AudioConfig = {
  masterVolume: 0.8,
  maxVoicesPerFrame: 3,
  maxActiveVoices: 28,
  hit: {
    minSpeed: 0.12,
    refSpeed: 6,
    gain: 0.5,
    partials: [
      { hz: 1580, gain: 1.0, decay: 0.3 },
      { hz: 2310, gain: 0.8, decay: 0.22 },
      { hz: 3470, gain: 0.6, decay: 0.15 },
      { hz: 5120, gain: 0.4, decay: 0.11 },
      { hz: 6870, gain: 0.25, decay: 0.08 },
    ],
    detune: 0.04,
    brightness: 0.6,
    noiseGain: 0.45,
    noiseMs: 9,
    noiseHz: 4500,
  },
  jackHit: {
    minSpeed: 0.1,
    refSpeed: 4,
    gain: 0.3,
    partials: [
      { hz: 1900, gain: 1.0, decay: 0.07 },
      { hz: 2900, gain: 0.6, decay: 0.05 },
      { hz: 4400, gain: 0.3, decay: 0.035 },
    ],
    detune: 0.05,
    brightness: 0.7,
    noiseGain: 0.4,
    noiseMs: 14,
    noiseHz: 2800,
  },
  land: {
    minSpeed: 0.3,
    refSpeed: 5,
    gain: 0.55,
    lowHz: 280,
    highHz: 1300,
    thumpHz: 95,
    thumpGain: 0.7,
    ms: 110,
  },
  board: { minSpeed: 0.2, refSpeed: 4, gain: 0.5, hz: 170, ms: 90 },
  rumble: {
    minSpeed: 0.06,
    refSpeed: 4,
    gain: 0.16,
    minCutoffHz: 260,
    maxCutoffHz: 1500,
    smoothing: 0.08,
    crackle: 0.35,
  },
  ui: { tickGain: 0.18, tickHz: 2600, chimeGain: 0.3 },
};
