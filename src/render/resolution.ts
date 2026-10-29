/**
 * Render resolution budget + adaptive scale. Phones are fine at device pixel ratio (they are small),
 * but a fullscreen desktop window is millions of pixels and the software/AMD+Firefox path drops
 * frames, so we cap the total number of device pixels drawn per frame and let the scale drift down
 * (and slowly back up) with the measured frame time. Pure TS: no DOM, no three.js, no timers —
 * src/render/pitchScene.ts feeds it the real frame time and applies the resulting pixel ratio.
 *
 * The resolution is `pixelRatio` (device pixels per CSS pixel, the value handed to
 * renderer.setPixelRatio) = min(devicePixelRatio, maxPixelRatio, budget) * scale. The budget only
 * ever shrinks the ratio, so a phone at 2x looks exactly as before: 390x844 at dpr 3 still draws at
 * 2, and 430x932 at dpr 2 is ~1.6M device pixels, well under the cap.
 */

export const RESOLUTION = {
  maxPixelRatio: 2,
  /** Never draw more than this many device pixels per frame (a large phone at 2x is ~1.6M; fullscreen 1440p at 1x is 3.7M). */
  maxPixels: 2_400_000,
  /** Adaptive scale on top of that: never below this. */
  minScale: 0.5,
  /** Smoothing of the frame time (exponential moving average weight per frame). */
  smoothing: 0.1,
  /** Too slow: average frame time above this (s) for `downAfter` s → scale *= stepDown. */
  slowFrame: 1 / 45, downAfter: 1, stepDown: 0.85,
  /** Smooth again: average below this for `upAfter` s → scale = min(1, scale * stepUp). */
  fastFrame: 1 / 57, upAfter: 5, stepUp: 1.1,
  /** Frames longer than this (s) are hitches (loading, tab switch) and are ignored entirely. */
  ignoreAbove: 0.25,
  /**
   * The adaptive scale only runs on views at least this big (CSS px²): desktop windows, not phones. iPhones in Low
   * Power Mode cap frames at 30 fps, which would read as "slow" and blur the picture without making anything smoother.
   */
  adaptiveMinArea: 600_000,
} as const;

/** Extra safety net: below this the picture is a blur, so never go under it (a tiny window at a tiny scale). */
const MIN_PIXEL_RATIO = 0.25;
/** Neutral average frame time: 60 fps, so a fresh state starts out neither slow nor fast. */
const NEUTRAL_DT = 1 / 60;

/**
 * Pixel ratio to draw `cssW` x `cssH` CSS pixels at. The budget is in device pixels, so the ratio
 * is squared in it: ratio^2 * cssW * cssH <= maxPixels. `scale` (from stepScale) multiplies the
 * capped ratio; the result is never below 0.25.
 */
export function pixelRatioFor(cssW: number, cssH: number, dpr: number, scale: number, cfg = RESOLUTION): number {
  const area = Math.max(1, cssW * cssH);
  const budget = Math.sqrt(cfg.maxPixels / area);
  const ratio = Math.min(dpr || 1, cfg.maxPixelRatio, budget) * scale;
  return Math.max(MIN_PIXEL_RATIO, ratio);
}

/** Adaptive state: the scale applied to the pixel ratio, the smoothed frame time (s) and the time spent too slow / fast (s). */
export interface ScaleState {
  scale: number;
  avg: number;
  slowFor: number;
  fastFor: number;
}

/** Full resolution, average at 60 fps, no timers running. */
export function initialScaleState(): ScaleState {
  return { scale: 1, avg: NEUTRAL_DT, slowFor: 0, fastFor: 0 };
}

/**
 * One frame of adaptive scaling. Pure: returns a new state (or `s` itself when the frame is ignored).
 * `dt` is the real frame time in seconds. Short hitches (loading, tab switch) and zero-length frames
 * are dropped so they never trigger a resolution change. Sustained slowness for `downAfter` seconds
 * steps the scale down; sustained speed for `upAfter` seconds steps it back up; anything in between
 * resets both timers.
 */
export function stepScale(s: ScaleState, dt: number, cfg = RESOLUTION): ScaleState {
  if (!(dt > 0) || dt > cfg.ignoreAbove) return s;
  const avg = s.avg + (dt - s.avg) * cfg.smoothing;
  let scale = s.scale;
  let slowFor = s.slowFor;
  let fastFor = s.fastFor;
  if (avg > cfg.slowFrame) {
    slowFor = s.slowFor + dt;
    fastFor = 0;
    if (slowFor >= cfg.downAfter) {
      scale = Math.max(cfg.minScale, s.scale * cfg.stepDown);
      // Keep the average (it is still slow) but restart the timer: the next step needs another downAfter.
      slowFor = 0;
    }
  } else if (avg < cfg.fastFrame) {
    fastFor = s.fastFor + dt;
    slowFor = 0;
    if (fastFor >= cfg.upAfter && s.scale < 1) {
      scale = Math.min(1, s.scale * cfg.stepUp);
      fastFor = 0;
    }
  } else {
    slowFor = 0;
    fastFor = 0;
  }
  return { scale, avg, slowFor, fastFor };
}
