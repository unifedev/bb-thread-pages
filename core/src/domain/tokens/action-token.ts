// `ActionToken { v, scope:"action", session, revision, path, iat, exp }` mint/verify (05 R2.7).
import { documentKey, isDocumentPath } from "../document-path.ts";
import { isRevision, isSessionIdentity } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

/**
 * The action token: authority to act as one page's owner session, for one
 * document revision, for a bounded time. Held only by the shell, sent only in
 * request bodies. spec 05 R2.7–R2.10, 01 R1.12c
 */
export interface ActionToken {
  readonly v: 1;
  readonly scope: "action";
  /** A session id, or the built-in home's identity. 05 R-S12 */
  readonly session: string;
  readonly revision: string;
  /** The document within the page; null for the entry document. */
  readonly path: string | null;
  readonly iat: number;
  readonly exp: number;
}

export function mintActionToken(args: { session: string; revision: string; path?: string | null; now: number }, key: Uint8Array): { token: string; payload: ActionToken } {
  const path = documentKey(args.path);
  const base = { v: 1 as const, scope: "action" as const, session: args.session, revision: args.revision, iat: args.now, exp: args.now + LIMITS.actionTokenMs };
  return { token: signPayload(path ? { ...base, path } : base, key), payload: { ...base, path } };
}

export function verifyActionToken(token: unknown, key: Uint8Array, now: number): ActionToken | null {
  const payload = openScoped(token, key, now, "action", LIMITS.actionTokenMs);
  if (!payload) return null;
  return { v: 1, scope: "action", session: payload.session, revision: payload.revision, path: payload.path, iat: payload.iat, exp: payload.exp };
}

/** Shared by the action and render tokens: every field checked, an unknown scope refused, a lifetime over the maximum refused. 05 R2.7 */
export function openScoped(token: unknown, key: Uint8Array, now: number, scope: "action" | "render", maxLifetimeMs: number): { session: string; revision: string; path: string | null; iat: number; exp: number } | null {
  if (typeof token !== "string" || token.length === 0 || token.length > LIMITS.tokenChars) return null;
  const payload = openToken(token, key);
  if (!isRecord(payload)) return null;
  if (payload.v !== 1 || payload.scope !== scope || !isSessionIdentity(payload.session) || !isRevision(payload.revision) || !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, maxLifetimeMs)) return null;
  const allowed = new Set(["v", "scope", "session", "revision", "iat", "exp", "path"]);
  if (Object.keys(payload).some((field) => !allowed.has(field))) return null;
  let path: string | null = null;
  if (payload.path !== undefined) {
    if (!isDocumentPath(payload.path) || documentKey(payload.path) === null) return null;
    path = payload.path;
  }
  return { session: payload.session, revision: payload.revision, path, iat: payload.iat as number, exp: payload.exp as number };
}
