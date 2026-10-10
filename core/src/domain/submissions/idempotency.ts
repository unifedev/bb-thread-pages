// Bounded, expiring idempotency records keyed by (session, kind, id) with a content fingerprint (05 R2.33–R2.34).
import { LIMITS } from "../limits.ts";

/**
 * Bounded, expiring memory of outcomes keyed by a client id. A repeat with
 * the same fingerprint replays the first outcome; a repeat with a different
 * fingerprint is a conflict. spec 05 R2.33, R2.34, 03 R5.17, R5.61
 */
export type Remembered<T> = { readonly kind: "fresh"; readonly outcome: Promise<T> } | { readonly kind: "duplicate"; readonly outcome: Promise<T> } | { readonly kind: "conflict" };

/** What a delivery is remembered under: the target session, the route kind and the client id. 03 R5.61 */
export interface IdempotencyKey {
  readonly session: string;
  readonly kind: "submit" | "reply";
  readonly id: string;
}

interface Entry<T> {
  expiresAt: number;
  fingerprint: string;
  outcome: Promise<T>;
}

export interface OutcomeMemory<T = unknown> {
  remember<R extends T>(key: IdempotencyKey, fingerprint: string, run: () => Promise<R>, now: number): Remembered<R>;
  size(): number;
}

/** The one key form every delivery route shares. 03 R5.61 */
export function idempotencyKey(key: IdempotencyKey): string {
  return JSON.stringify([key.session, key.kind, key.id]);
}

export function createOutcomeMemory<T>(options: { maxRecords?: number; ttlMs?: number } = {}): OutcomeMemory<T> {
  const maxRecords = options.maxRecords ?? LIMITS.idempotencyRecords;
  const ttlMs = options.ttlMs ?? LIMITS.idempotencyMs;
  const records = new Map<string, Entry<T>>();

  function prune(now: number): void {
    for (const [key, record] of records) {
      if (record.expiresAt <= now) records.delete(key);
    }
    while (records.size >= maxRecords) {
      const oldest = records.keys().next().value;
      if (oldest === undefined) break;
      records.delete(oldest);
    }
  }

  return {
    remember<R extends T>(key: IdempotencyKey, fingerprint: string, run: () => Promise<R>, now: number): Remembered<R> {
      prune(now);
      const id = idempotencyKey(key);
      const existing = records.get(id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { kind: "conflict" };
        return { kind: "duplicate", outcome: existing.outcome as Promise<R> };
      }
      const outcome = run();
      const record: Entry<T> = { expiresAt: now + ttlMs, fingerprint, outcome };
      records.set(id, record);
      // A failed attempt must not poison the key: the next try is fresh.
      outcome.catch(() => {
        if (records.get(id) === record) records.delete(id);
      });
      return { kind: "fresh", outcome };
    },
    size: () => records.size,
  };
}
