import { LIMITS } from "./limits.ts";

/**
 * Per-page budget for effectful requests: accepted requests per minute and
 * requests in flight. spec R2.38–R2.40 (numbers: RW-8)
 */
export interface RateBudget {
  readonly perMinute: number;
  readonly concurrent: number;
}

interface Bucket {
  windowStartedAt: number;
  accepted: number;
  inFlight: number;
  touchedAt: number;
}

export interface RateLimiter {
  /** Returns a release function, or null when the request is refused. */
  acquire(key: string, now: number): (() => void) | null;
  /** For tests and status. */
  snapshot(key: string): { accepted: number; inFlight: number } | null;
}

export function createRateLimiter(budget: RateBudget = { perMinute: LIMITS.ratePerMinute, concurrent: LIMITS.rateConcurrent }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(now: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.inFlight === 0 && now - bucket.touchedAt > 5 * 60_000) buckets.delete(key);
    }
  }

  return {
    acquire(key, now) {
      prune(now);
      const bucket = buckets.get(key) ?? { windowStartedAt: now, accepted: 0, inFlight: 0, touchedAt: now };
      if (now - bucket.windowStartedAt >= 60_000) {
        bucket.windowStartedAt = now;
        bucket.accepted = 0;
      }
      if (bucket.inFlight >= budget.concurrent || bucket.accepted >= budget.perMinute) {
        buckets.set(key, bucket);
        return null;
      }
      bucket.accepted += 1;
      bucket.inFlight += 1;
      bucket.touchedAt = now;
      buckets.set(key, bucket);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        bucket.inFlight = Math.max(0, bucket.inFlight - 1);
        bucket.touchedAt = Date.now();
      };
    },
    snapshot(key) {
      const bucket = buckets.get(key);
      return bucket ? { accepted: bucket.accepted, inFlight: bucket.inFlight } : null;
    },
  };
}
