// The `from.kind: "page"` ledger: by `messageId` or by text within 60 s (06 R-P5).
import { LIMITS } from "../limits.ts";

/** One delivery the server made. 06 R-P5; DESIGN §E.5 */
export interface LedgerEntry {
  readonly requestId: string;
  readonly messageId?: string | undefined;
  readonly text: string;
  readonly sentAtMs: number;
  /** The sending page's session title, or "Home". */
  readonly label: string;
}

/** The parts of a transcript row the ledger reads and marks. 03 §`session.messages` */
export interface LedgerRow {
  id: string;
  atMs: number;
  kind: string;
  text?: string;
  from?: { kind: "reader" | "page" | "session" | "plugin" | "schedule"; label?: string };
  [key: string]: unknown;
}

export interface Ledger {
  note(session: string, entry: LedgerEntry): void;
  /** Rows with `from` set: `page` where the ledger claims them, the provider's kind kept otherwise, `reader` for user rows with none. 06 R-P5 */
  markFrom<T extends LedgerRow>(session: string, rows: readonly T[]): T[];
  forget(session: string): void;
}

interface Claimable extends LedgerEntry {
  claimedRowId: string | null;
}

/** A ring of `ledgerEntries` deliveries per session, matched by id first, then by equal text within `ledgerWindowMs`. 06 R-P5; DESIGN P21 */
export function createLedger(options: { entries?: number; windowMs?: number } = {}): Ledger {
  const maxEntries = options.entries ?? LIMITS.ledgerEntries;
  const windowMs = options.windowMs ?? LIMITS.ledgerWindowMs;
  const sessions = new Map<string, Claimable[]>();
  return {
    note(session, entry) {
      const ring = sessions.get(session) ?? [];
      ring.push({ ...entry, claimedRowId: null });
      while (ring.length > maxEntries) ring.shift();
      sessions.set(session, ring);
    },
    markFrom(session, rows) {
      const ring = sessions.get(session) ?? [];
      return rows.map((row) => {
        const byId = ring.find((entry) => entry.messageId !== undefined && entry.messageId === row.id);
        if (byId) {
          byId.claimedRowId = row.id;
          return { ...row, from: { kind: "page" as const, label: byId.label } };
        }
        if (row.kind === "user" && typeof row.text === "string") {
          const byText = ring.find((entry) => entry.messageId === undefined && (entry.claimedRowId === null || entry.claimedRowId === row.id) && entry.text === row.text && row.atMs >= entry.sentAtMs && row.atMs - entry.sentAtMs <= windowMs);
          if (byText) {
            byText.claimedRowId = row.id;
            return { ...row, from: { kind: "page" as const, label: byText.label } };
          }
        }
        if (row.from) return row;
        return row.kind === "user" ? { ...row, from: { kind: "reader" as const } } : row;
      });
    },
    forget(session) {
      sessions.delete(session);
    },
  };
}
