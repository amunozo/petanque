/**
 * One-shot synthesised voices (WebAudio, no samples). Every voice schedules a
 * few short-lived nodes and disconnects them when the last one ends.
 * Numbers come from audioConfig, read at play time.
 */
import { audioConfig, type ImpactSoundConfig } from './config';
import { hash01, lerp } from './shape';

/** What the voices need from the audio engine. */
export interface Runtime {
  ctx: AudioContext;
  /** Where voices connect (master gain). */
  out: AudioNode;
  /** Shared looped white noise. */
  noise: AudioBuffer;
  /** Voices currently sounding. */
  active: number;
  /** Counter feeding the hash, so repeated sounds differ but deterministically. */
  seq: number;
}

const FLOOR = 0.0001;

/** Starts tracking `src`; when it ends the nodes are disconnected and the voice count drops. */
function track(rt: Runtime, src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  rt.active++;
  src.onended = () => {
    rt.active--;
    for (const n of nodes) n.disconnect();
  };
}

/** Decaying sine (optionally gliding to `glideTo`). */
function tone(rt: Runtime, t: number, hz: number, peak: number, attack: number, decay: number, glideTo?: number, type: OscillatorType = 'sine'): void {
  if (peak <= FLOOR) return;
  const { ctx } = rt;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + attack + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  osc.connect(g).connect(rt.out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.03);
  track(rt, osc, [osc, g]);
}

/** Short filtered noise burst taken from a hash-chosen spot of the shared noise buffer. */
function grain(rt: Runtime, t: number, filter: BiquadFilterType, hz: number, q: number, peak: number, attack: number, decay: number): void {
  if (peak <= FLOOR) return;
  const { ctx } = rt;
  const src = ctx.createBufferSource();
  src.buffer = rt.noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  src.connect(f).connect(g).connect(rt.out);
  const dur = attack + decay + 0.02;
  const offset = hash01(rt.seq++ * 977 + 13) * Math.max(0.01, rt.noise.duration - dur - 0.01);
  src.start(t, offset, dur);
  track(rt, src, [src, f, g]);
}

/**
 * Inharmonic ring of decaying sines + a tiny noise tick. `level` 0..1 scales
 * volume, upper partials and ring time. Metal for boule–boule, wood for the jack.
 */
function impact(rt: Runtime, c: ImpactSoundConfig, level: number): void {
  const t = rt.ctx.currentTime;
  const seed = rt.seq++;
  const bright = lerp(c.brightness, 1, level);
  const ring = lerp(0.55, 1, level);
  c.partials.forEach((p, i) => {
    const detune = 1 + (hash01(seed * 131 + i * 17) * 2 - 1) * c.detune;
    const upper = Math.pow(bright, i); // upper partials fade first on soft hits
    tone(rt, t, p.hz * detune, c.gain * level * p.gain * upper * 0.5, 0.0008, p.decay * ring);
  });
  grain(rt, t, 'highpass', c.noiseHz, 0.7, c.gain * level * c.noiseGain, 0.0005, c.noiseMs / 1000);
}

export const playHit = (rt: Runtime, level: number): void => impact(rt, audioConfig.hit, level);
export const playJackHit = (rt: Runtime, level: number): void => impact(rt, audioConfig.jackHit, level);

/** Gravel landing: a few crunchy band-passed grains + a low thump. */
export function playLand(rt: Runtime, level: number): void {
  const c = audioConfig.land;
  const t = rt.ctx.currentTime;
  const seed = rt.seq++;
  const grains = 2 + Math.round(level * 2);
  for (let i = 0; i < grains; i++) {
    const h = hash01(seed * 53 + i * 7);
    const hz = lerp(c.lowHz, c.highHz, Math.min(1, level * 0.8 + h * 0.4));
    const at = t + i * lerp(0.008, 0.024, hash01(seed * 31 + i));
    const decay = (c.ms / 1000) * lerp(0.4, 1, h);
    grain(rt, at, 'bandpass', hz, 0.8, c.gain * level * lerp(1, 0.55, i / grains), 0.002, decay);
  }
  tone(rt, t, c.thumpHz * lerp(1.15, 0.9, hash01(seed)), c.gain * c.thumpGain * level, 0.003, c.ms / 1000, c.thumpHz * 0.55);
}

/** Dull wooden knock against the side board. */
export function playBoard(rt: Runtime, level: number): void {
  const c = audioConfig.board;
  const t = rt.ctx.currentTime;
  tone(rt, t, c.hz * 1.3, c.gain * level, 0.002, c.ms / 1000, c.hz * 0.7);
  tone(rt, t, c.hz * 2.4, c.gain * level * 0.25, 0.002, (c.ms / 1000) * 0.5, undefined, 'triangle');
  grain(rt, t, 'lowpass', 650, 0.7, c.gain * level * 0.5, 0.001, 0.035);
}

/** Soft tick (loft change). */
export function playTick(rt: Runtime): void {
  const c = audioConfig.ui;
  const t = rt.ctx.currentTime;
  tone(rt, t, c.tickHz, c.tickGain, 0.001, 0.035, c.tickHz * 0.8);
  tone(rt, t, c.tickHz * 0.5, c.tickGain * 0.5, 0.001, 0.05);
}

export type ChimeKind = 'score' | 'win' | 'lose';

/** Notes (Hz) and spacing (s) of each chime. */
const CHIMES: Record<ChimeKind, { notes: number[]; step: number; ring: number; level: number }> = {
  score: { notes: [523.25, 659.25, 783.99], step: 0.11, ring: 0.7, level: 1 },
  win: { notes: [523.25, 659.25, 783.99, 1046.5, 1318.5], step: 0.12, ring: 1.1, level: 1.15 },
  lose: { notes: [587.33, 466.16, 392], step: 0.16, ring: 0.7, level: 0.8 },
};

/** Simple bell-ish synth: sine + quiet octave, soft attack, long decay. */
export function playChime(rt: Runtime, kind: ChimeKind): void {
  const spec = CHIMES[kind];
  const t = rt.ctx.currentTime + 0.02;
  const peak = audioConfig.ui.chimeGain * spec.level;
  spec.notes.forEach((hz, i) => {
    const at = t + i * spec.step;
    const last = i === spec.notes.length - 1;
    const ring = spec.ring * (last ? 1.4 : 1);
    tone(rt, at, hz, peak, 0.006, ring);
    tone(rt, at, hz * 2, peak * 0.22, 0.004, ring * 0.5, undefined, 'triangle');
  });
}
