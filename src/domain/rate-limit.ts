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
        bucket.touchedAt = Date.now();
      };
    },
    snapshot(key) {
      const bucket = buckets.get(key);
      return bucket ? { accepted: bucket.accepted, inFlight: bucket.inFlight } : null;
    },
  };
}

/**
 * The page budget: each request counts against its document's (the session,
 * the document's path and, for capability calls, the calling document's
 * scope) and against its session's overall cap, and is refused when either is
 * spent. One session shows many documents — the generic tool once per folder —
 * so a per-session budget alone refused ordinary use. spec R2.38, R2.38a, D45
 */
export interface PageBudget {
  /** Returns a release function, or null when the request is refused. */
  acquire(request: { readonly session: string; readonly document: string; readonly scope?: string | null }, now: number): (() => void) | null;
  /** For tests and status. */
  snapshot(request: { readonly session: string; readonly document: string; readonly scope?: string | null }): { document: { accepted: number; inFlight: number } | null; session: { accepted: number; inFlight: number } | null };
}

export function createPageBudget(
  perDocument: RateBudget = { perMinute: LIMITS.ratePerMinute, concurrent: LIMITS.rateConcurrent },
  perSession: RateBudget = { perMinute: LIMITS.sessionRatePerMinute, concurrent: LIMITS.sessionRateConcurrent },
): PageBudget {
  const documents = createRateLimiter(perDocument);
  const sessions = createRateLimiter(perSession);
  const documentKey = (request: { session: string; document: string; scope?: string | null }) => JSON.stringify([request.session, request.document, request.scope ?? null]);
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
