import { documentKey, isDocumentPath } from "../document-path.ts";
import { isRevision, isSessionId } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

/**
 * The action token: authority to act as one page's owner session, for one
 * document revision, for a bounded time. Held only by the shell, sent only in
 * request bodies. It names the document it was minted for, so an effect is
 * checked against the document the reader is looking at. spec R2.7–R2.10, R1.12c
 */
export interface ActionToken {
  readonly v: 3;
  readonly scope: "action";
  readonly session: string;
  readonly revision: string;
  /** The document within the page; null for the entry document. */
  readonly path: string | null;
  readonly iat: number;
  readonly exp: number;
}

export function mintActionToken(args: { session: string; revision: string; path?: string | null; now: number }, key: Uint8Array): { token: string; payload: ActionToken } {
  const path = documentKey(args.path);
  const base = { v: 3 as const, scope: "action" as const, session: args.session, revision: args.revision, iat: args.now, exp: args.now + LIMITS.actionTokenMs };
  const signed = path ? { ...base, path } : base;
  return { token: signPayload(signed, key), payload: { ...base, path } };
}

export function verifyActionToken(token: string, key: Uint8Array, now: number): ActionToken | null {
  if (typeof token !== "string" || token.length === 0 || token.length > LIMITS.tokenChars) return null;
  const payload = openToken(token, key);
  if (!isRecord(payload)) return null;
  if (
    payload.v !== 3 ||
    payload.scope !== "action" ||
    !isSessionId(payload.session) ||
    !isRevision(payload.revision) ||
    !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.actionTokenMs)
  ) {
    return null;
  }
  let path: string | null = null;
  if (payload.path !== undefined) {
    if (!isDocumentPath(payload.path) || documentKey(payload.path) === null) return null;
    path = payload.path;
  }
  return {
    v: 3,
    scope: "action",
    session: payload.session,
    revision: payload.revision,
    path,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}
