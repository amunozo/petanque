/**
 * Continuous gravel rumble while a ball rolls: one looped noise source through
 * a low-pass filter; gain and cutoff follow the fastest rolling speed. The
 * node graph only exists while there is something to hear.
 */
import { audioConfig } from './config';
import { level01, lerp } from './shape';
import type { Runtime } from './voices';

/** Keep the (silent) graph this long after the last roll before tearing it down (s). */
const IDLE_TEARDOWN_S = 0.6;

interface Graph {
  src: AudioBufferSourceNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  amp: GainNode;
  crackle: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
}

export interface Rumble {
  /** Fastest rolling speed (m/s) right now; 0 = nothing rolls. Call every frame. */
  set(speed: number): void;
  /** Immediately stop and free everything. */
  stop(): void;
}

export function createRumble(rt: Runtime): Rumble {
  let g: Graph | null = null;
  let silentSince: number | null = null;

  function build(): Graph {
    const { ctx } = rt;
    const src = ctx.createBufferSource();
    src.buffer = rt.noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.value = audioConfig.rumble.minCutoffHz;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    // Slow irregular crackle: a low LFO modulating a stage that sits at 1 - depth/2.
    const crackle = ctx.createGain();
    const depth = audioConfig.rumble.crackle;
    crackle.gain.value = 1 - depth / 2;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 17;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = depth / 2;
    lfo.connect(lfoDepth).connect(crackle.gain);
    src.connect(hp).connect(lp).connect(amp).connect(crackle).connect(rt.out);
    src.start();
    lfo.start();
    rt.active++;
    return { src, hp, lp, amp, crackle, lfo, lfoDepth };
  }

  function teardown(): void {
    if (!g) return;
    const { src, hp, lp, amp, crackle, lfo, lfoDepth } = g;
    try {
      src.stop();
      lfo.stop();
    } catch {
      /* already stopped */
    }
    for (const n of [src, hp, lp, amp, crackle, lfo, lfoDepth]) n.disconnect();
    rt.active--;
    g = null;
    silentSince = null;
  }

  return {
    set(speed) {
      const c = audioConfig.rumble;
      const lvl = level01(speed, c.minSpeed, c.refSpeed, 0.9);
      const now = rt.ctx.currentTime;
      if (lvl <= 0) {
        if (!g) return;
        g.amp.gain.setTargetAtTime(0, now, c.smoothing);
        silentSince ??= now;
        if (now - silentSince > IDLE_TEARDOWN_S) teardown();
        return;
      }
      silentSince = null;
      g ??= build();
      g.amp.gain.setTargetAtTime(c.gain * lvl, now, c.smoothing);
      g.lp.frequency.setTargetAtTime(lerp(c.minCutoffHz, c.maxCutoffHz, lvl), now, c.smoothing);
    },
    stop: teardown,
  };
}
