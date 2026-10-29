import { describe, expect, it } from 'vitest';
import { RESOLUTION, initialScaleState, pixelRatioFor, stepScale, type ScaleState } from './resolution';

const DESKTOP = { w: 2560, h: 1440 };
const FULL_HD = { w: 1920, h: 1080 };

/** Runs `seconds` of frames of `dt` seconds (fractional frames are dropped) through stepScale. */
function run(state: ScaleState, dt: number, seconds: number): ScaleState {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = stepScale(s, dt);
  return s;
}

describe('pixelRatioFor', () => {
  it('keeps the 2x cap on a phone (390x844 at dpr 3)', () => {
    expect(pixelRatioFor(390, 844, 3, 1)).toBe(2);
  });

  it('keeps a large phone at 2x because it is under the pixel budget (430x932 at dpr 2)', () => {
    const r = pixelRatioFor(430, 932, 2, 1);
    expect(r).toBe(2);
    expect(r * r * 430 * 932).toBeLessThanOrEqual(RESOLUTION.maxPixels);
  });

  it('shrinks a fullscreen 1440p desktop window (2560x1440 at dpr 1)', () => {
    // sqrt(2_400_000 / 3_686_400) = 0.8069.
    expect(pixelRatioFor(DESKTOP.w, DESKTOP.h, 1, 1)).toBeCloseTo(0.8069, 4);
  });

  it('caps a 1080p window at dpr 2 to the budget instead of 2x', () => {
    // sqrt(2_400_000 / 2_073_600) = 1.0758 (the budget is in device pixels, hence the square root).
    const r = pixelRatioFor(FULL_HD.w, FULL_HD.h, 2, 1);
    expect(r).toBeCloseTo(1.0758, 3);
    expect(r).toBeLessThan(2);
  });

  it('multiplies the capped ratio by scale', () => {
    const full = pixelRatioFor(DESKTOP.w, DESKTOP.h, 1, 1);
    expect(pixelRatioFor(DESKTOP.w, DESKTOP.h, 1, 0.5)).toBeCloseTo(full * 0.5, 5);
    expect(pixelRatioFor(390, 844, 3, 0.75)).toBeCloseTo(1.5, 5);
  });

  it('never goes below 0.25 even at a tiny scale on a huge canvas', () => {
    // 8000x8000 over budget gives 0.194, halved by scale = 0.097.
    expect(pixelRatioFor(8000, 8000, 1, 0.5)).toBe(0.25);
    expect(pixelRatioFor(390, 844, 2, 0.01)).toBe(0.25);
  });

  it('treats a missing device pixel ratio as 1', () => {
    expect(pixelRatioFor(100, 100, 0, 1)).toBe(1);
  });
});

describe('stepScale', () => {
  it('starts at full scale with a neutral 60 fps average', () => {
    expect(initialScaleState()).toEqual({ scale: 1, avg: 1 / 60, slowFor: 0, fastFor: 0 });
  });

  it('never changes the scale at a steady 60 fps', () => {
    const s = run(initialScaleState(), 1 / 60, 20);
    expect(s.scale).toBe(1);
    expect(s.avg).toBeCloseTo(1 / 60, 6);
  });

  it('steps down after about a second of 30 fps, and not before', () => {
    const early = run(initialScaleState(), 1 / 30, 0.5);
    expect(early.scale).toBe(1);
    expect(early.slowFor).toBeGreaterThan(0);
    const later = run(initialScaleState(), 1 / 30, 1.5);
    expect(later.scale).toBe(0.85);
  });

  it('steps down again after another downAfter second, never below minScale', () => {
    // The timer restarts on each step, so two seconds at 30 fps is two steps.
    expect(run(initialScaleState(), 1 / 30, 2.5).scale).toBeCloseTo(0.7225, 5);
    expect(run(initialScaleState(), 1 / 30, 60).scale).toBe(RESOLUTION.minScale);
  });

  it('steps back up only after about 5 s of 60 fps, and never above 1', () => {
    const slow: ScaleState = { scale: RESOLUTION.minScale, avg: 1 / 30, slowFor: 0, fastFor: 0 };
    expect(run(slow, 1 / 60, 4).scale).toBe(0.5);
    expect(run(slow, 1 / 60, 6).scale).toBeCloseTo(0.55, 5);
    expect(run(initialScaleState(), 1 / 60, 120).scale).toBe(1);
  });

  it('resets both timers when the frame time is between the thresholds', () => {
    const s: ScaleState = { scale: 0.85, avg: 0.02, slowFor: 0.5, fastFor: 3 };
    const next = stepScale(s, 0.02);
    expect(next.slowFor).toBe(0);
    expect(next.fastFor).toBe(0);
    expect(next.scale).toBe(0.85);
  });

  it('ignores hitches (loading, tab switch) and zero-length frames', () => {
    const s = initialScaleState();
    expect(stepScale(s, 0.5)).toBe(s);
    expect(stepScale(s, 0)).toBe(s);
    expect(stepScale(s, -0.01)).toBe(s);
    expect(stepScale(s, RESOLUTION.ignoreAbove + 0.001)).toBe(s);
  });

  it('does not mutate the input state', () => {
    const s: ScaleState = { scale: 0.85, avg: 1 / 60, slowFor: 0.5, fastFor: 3 };
    const copy = { ...s };
    const next = stepScale(s, 1 / 30);
    expect(s).toEqual(copy);
    expect(next).not.toBe(s);
  });
});
