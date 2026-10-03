/** Small pure helpers for the sound design (no WebAudio, unit-tested). */

/** Cheap deterministic integer hash -> [0, 1). Same input, same output, on every device. */
export function hash01(n: number): number {
  let x = Math.trunc(n) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 0 below `min`, 1 at `ref` and above, in between a gentle curve (exponent < 1 = louder soft hits). */
export function level01(speed: number, min: number, ref: number, exponent = 0.75): number {
  if (!(speed > min)) return 0;
  const t = Math.min(1, (speed - min) / Math.max(1e-6, ref - min));
  return Math.pow(t, exponent);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Keeps the `max` strongest items (stable for equal strength). */
export function loudest<T extends { level: number }>(items: readonly T[], max: number): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.level - a.item.level || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map((x) => x.item);
}

/** Deterministic white noise in [-1, 1] (LCG), for the shared noise buffer. */
export function fillNoise(out: Float32Array, seed = 12345): void {
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 4294967296) * 2 - 1;
  }
}
