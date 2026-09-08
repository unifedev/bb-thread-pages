import { LIMITS } from "../limits.ts";

/**
 * Bounded, expiring memory of outcomes keyed by a client id. A repeat with
 * the same fingerprint replays the first outcome; a repeat with a different
 * fingerprint is a conflict. spec R2.33, R2.34, R5.17
 */
export type Remembered<T> =
  | { readonly kind: "fresh"; readonly outcome: Promise<T> }
  | { readonly kind: "replay"; readonly outcome: Promise<T> }
  | { readonly kind: "conflict" };

interface Record<T> {
  expiresAt: number;
  fingerprint: string;
  outcome: Promise<T>;
}

export interface OutcomeMemory<T> {
  remember(key: string, fingerprint: string, produce: () => Promise<T>, now: number): Remembered<T>;
  size(): number;
}

export function createOutcomeMemory<T>(options: { maxRecords?: number; ttlMs?: number } = {}): OutcomeMemory<T> {
  const maxRecords = options.maxRecords ?? LIMITS.idempotencyRecords;
  const ttlMs = options.ttlMs ?? LIMITS.idempotencyMs;
  const records = new Map<string, Record<T>>();

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
    remember(key, fingerprint, produce, now) {
      prune(now);
      const existing = records.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { kind: "conflict" };
        return { kind: "replay", outcome: existing.outcome };
      }
      const outcome = produce();
      const record: Record<T> = { expiresAt: now + ttlMs, fingerprint, outcome };
      records.set(key, record);
      // A failed attempt must not poison the key: the next try is fresh.
      outcome.catch(() => {
        if (records.get(key) === record) records.delete(key);
      });
      return { kind: "fresh", outcome };
    },
    size: () => records.size,
  };
}
