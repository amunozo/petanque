/** Token bucket (pure; the caller supplies the clock). */
export interface Bucket {
  tokens: number;
  at: number;
  strikes: number;
}

export const newBucket = (burst: number, now: number): Bucket => ({ tokens: burst, at: now, strikes: 0 });

/** Takes one token. Returns false (and counts a strike) when the bucket is empty. Mutates `b`. */
export function take(b: Bucket, now: number, burst: number, refillPerSec: number): boolean {
  b.tokens = Math.min(burst, b.tokens + (Math.max(0, now - b.at) / 1000) * refillPerSec);
  b.at = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  b.strikes++;
  return false;
}
