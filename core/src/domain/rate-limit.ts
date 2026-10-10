// `createRateLimiter`, `createPageBudget` (per document+scope and per session; 05 R2.38a).
import { LIMITS } from "./limits.ts";

/** Accepted requests per minute and requests in flight for one key. 05 R2.38 */
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
  /** Returns a release function, or null when the request is refused (nothing charged). 05 R2.39 */
  acquire(key: string, now: number): (() => void) | null;
  /** Whether `acquire` would accept now, without counting anything. */
  wouldAccept(key: string, now: number): boolean;
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
    wouldAccept(key, now) {
      const bucket = buckets.get(key);
      if (!bucket) return true;
      const accepted = now - bucket.windowStartedAt >= 60_000 ? 0 : bucket.accepted;
      return bucket.inFlight < budget.concurrent && accepted < budget.perMinute;
    },
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
      };
    },
    snapshot(key) {
      const bucket = buckets.get(key);
      return bucket ? { accepted: bucket.accepted, inFlight: bucket.inFlight } : null;
    },
  };
}

export interface BudgetRequest {
  readonly session: string;
  readonly document: string;
  readonly scope?: string | null;
}

/**
 * The page budget: each request counts against its document's (the session,
 * the document's path and, for capability calls, the calling document's
 * scope) and against its session's overall cap, and is refused when either is
 * spent — charging neither. spec 05 R2.38, R2.38a
 */
export interface PageBudget {
  acquire(request: BudgetRequest, now: number): (() => void) | null;
  snapshot(request: BudgetRequest): { document: { accepted: number; inFlight: number } | null; session: { accepted: number; inFlight: number } | null };
}

export function createPageBudget(
  perDocument: RateBudget = { perMinute: LIMITS.ratePerMinute, concurrent: LIMITS.rateConcurrent },
  perSession: RateBudget = { perMinute: LIMITS.sessionRatePerMinute, concurrent: LIMITS.sessionRateConcurrent },
): PageBudget {
  const documents = createRateLimiter(perDocument);
  const sessions = createRateLimiter(perSession);
  const documentKey = (request: BudgetRequest) => JSON.stringify([request.session, request.document, request.scope ?? null]);
  return {
    acquire(request, now) {
      const key = documentKey(request);
      if (!documents.wouldAccept(key, now) || !sessions.wouldAccept(request.session, now)) return null;
      const releaseDocument = documents.acquire(key, now);
      const releaseSession = sessions.acquire(request.session, now);
      return () => {
        releaseDocument?.();
        releaseSession?.();
      };
    },
    snapshot(request) {
      return { document: documents.snapshot(documentKey(request)), session: sessions.snapshot(request.session) };
    },
  };
}
