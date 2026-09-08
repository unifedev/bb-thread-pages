import { randomBytes } from "node:crypto";
import { LIMITS } from "../../domain/limits.ts";

/**
 * Folder-picker selections, held server-side so a page only ever sees an
 * opaque token: single use, short-lived, bound to the requesting session.
 * spec R5.35–R5.37
 */
export interface Selection {
  readonly session: string;
  readonly hostId: string;
  readonly path: string;
  readonly expiresAt: number;
}

export interface SelectionStore {
  issue(selection: Omit<Selection, "expiresAt">, now: number): string;
  /** Looks a selection up without consuming it. */
  peek(token: string, session: string, now: number): Selection | null;
  /** Returns and forgets the selection when the token is valid for the session. */
  redeem(token: string, session: string, now: number): Selection | null;
}

export function createSelectionStore(): SelectionStore {
  const selections = new Map<string, Selection>();

  function prune(now: number): void {
    for (const [token, selection] of selections) {
      if (selection.expiresAt <= now) selections.delete(token);
    }
    while (selections.size > LIMITS.selectionTokens) {
      const oldest = selections.keys().next().value;
      if (oldest === undefined) break;
      selections.delete(oldest);
    }
  }

  return {
    issue(selection, now) {
      prune(now);
      const token = `sel.${randomBytes(18).toString("base64url")}`;
      selections.set(token, { ...selection, expiresAt: now + LIMITS.selectionTokenMs });
      return token;
    },
    peek(token, session, now) {
      prune(now);
      const selection = selections.get(token);
      return selection && selection.session === session ? selection : null;
    },
    redeem(token, session, now) {
      prune(now);
      const selection = selections.get(token);
      if (!selection || selection.session !== session) return null;
      selections.delete(token);
      return selection;
    },
  };
}
