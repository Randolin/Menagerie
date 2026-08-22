// In-memory token buckets per client key. Deliberately ephemeral: nothing is
// ever written to disk or logged, and a restart forgets every address.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastPrune = Date.now();
  private readonly perMinute: number;
  private readonly pruneIntervalMs: number;

  // Parameter properties would be nicer, but Node's native type stripping
  // only supports erasable syntax — plain fields keep the server runnable
  // with zero build step.
  constructor(perMinute: number, pruneIntervalMs = 10 * 60_000) {
    this.perMinute = perMinute;
    this.pruneIntervalMs = pruneIntervalMs;
  }

  /** True when the request is allowed. */
  take(key: string, now = Date.now()): boolean {
    this.maybePrune(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.perMinute, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const refill = ((now - bucket.lastRefill) / 60_000) * this.perMinute;
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + refill);
    bucket.lastRefill = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private maybePrune(now: number): void {
    if (now - this.lastPrune < this.pruneIntervalMs) return;
    this.lastPrune = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > this.pruneIntervalMs) this.buckets.delete(key);
    }
  }
}
