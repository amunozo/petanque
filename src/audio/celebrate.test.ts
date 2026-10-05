import { describe, expect, it, vi } from 'vitest';
import { createAudio } from './index';
import { playCarreau, playGoodHit, type Runtime } from './voices';

/** Just enough of WebAudio to run the voice recipes and see what they schedule. */
function fakeRuntime(): { rt: Runtime; started: { at: number; type: string }[] } {
  const started: { at: number; type: string }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const chain = () => {
    const n = { connect: vi.fn((to: unknown) => to), disconnect: vi.fn() };
    return n;
  };
  const ctx = {
    currentTime: 1,
    createOscillator: () => ({ ...chain(), type: 'sine', frequency: param(), onended: null as null | (() => void), start: (at: number) => started.push({ at, type: 'osc' }), stop: vi.fn() }),
    createGain: () => ({ ...chain(), gain: param() }),
    createBiquadFilter: () => ({ ...chain(), type: 'lowpass', frequency: param(), Q: param() }),
    createBufferSource: () => ({ ...chain(), buffer: null, onended: null as null | (() => void), start: (at: number) => started.push({ at, type: 'noise' }), stop: vi.fn() }),
  };
  const rt = { ctx: ctx as unknown as AudioContext, out: chain() as unknown as AudioNode, noise: { duration: 2 } as AudioBuffer, active: 0, seq: 1 };
  return { rt, started };
}

describe('good-shot stingers', () => {
  it('a carreau is a double clack, a rising chime, an "oh" and a murmur, all in the next second', () => {
    const { rt, started } = fakeRuntime();
    playCarreau(rt);
    expect(started.filter((s) => s.type === 'noise').length).toBeGreaterThanOrEqual(3); // 2 clack transients + crowd
    expect(started.filter((s) => s.type === 'osc').length).toBeGreaterThan(12);
    const clacks = [...new Set(started.map((s) => s.at))].sort((a, b) => a - b);
    expect(clacks[0]).toBeCloseTo(1, 3);
    expect(Math.max(...clacks) - 1).toBeLessThan(0.6);
    expect(rt.active).toBe(started.length);
  });

  it('a tir réussi is lighter than a carreau', () => {
    const a = fakeRuntime();
    const b = fakeRuntime();
    playCarreau(a.rt);
    playGoodHit(b.rt);
    expect(b.started.length).toBeGreaterThan(0);
    expect(b.started.length).toBeLessThan(a.started.length);
  });

  it('is silent (and harmless) without a running audio context', () => {
    const audio = createAudio({ gestureTarget: null, storage: null });
    expect(() => {
      audio.celebrate('carreau');
      audio.celebrate('hit');
    }).not.toThrow();
  });
});
