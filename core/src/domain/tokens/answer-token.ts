// `AnswerToken { v, scope:"answer", issuedTo, target, path, revision, iat, exp }` (03 R5.62).
import { documentKey, isDocumentPath } from "../document-path.ts";
import { isRevision, isSessionId, isSessionIdentity } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

/**
 * The answer token: authority for one page to answer one document of another
 * session's page, at one revision. Returned with a `pages.read` of exactly
 * that document, so `pages.answer` can only deliver to a session whose page
 * the caller obtained through the host. spec 03 R5.60a, R5.62; 05 R3.26
 */
export interface AnswerToken {
  readonly v: 1;
  readonly scope: "answer";
  /** The session of the page the token was issued to (the built-in home's identity included). */
  readonly issuedTo: string;
  /** The session whose page is answered. */
  readonly target: string;
  /** The document within the target's page; null for its entry document. */
  readonly path: string | null;
  readonly revision: string;
  readonly iat: number;
  readonly exp: number;
}

export function mintAnswerToken(args: { issuedTo: string; target: string; path?: string | null; revision: string; now: number }, key: Uint8Array): { token: string; payload: AnswerToken } {
  const path = documentKey(args.path);
  const base = { v: 1 as const, scope: "answer" as const, issuedTo: args.issuedTo, target: args.target, revision: args.revision, iat: args.now, exp: args.now + LIMITS.answerTokenMs };
  return { token: signPayload(path ? { ...base, path } : base, key), payload: { ...base, path } };
}

export function verifyAnswerToken(token: unknown, key: Uint8Array, now: number): AnswerToken | null {
  if (typeof token !== "string" || token.length === 0 || token.length > LIMITS.tokenChars) return null;
  const payload = openToken(token, key);
  if (!isRecord(payload)) return null;
  if (payload.v !== 1 || payload.scope !== "answer" || !isSessionIdentity(payload.issuedTo) || !isSessionId(payload.target) || !isRevision(payload.revision) || !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.answerTokenMs)) return null;
  const allowed = new Set(["v", "scope", "issuedTo", "target", "revision", "iat", "exp", "path"]);
  if (Object.keys(payload).some((field) => !allowed.has(field))) return null;
  let path: string | null = null;
  if (payload.path !== undefined) {
    if (!isDocumentPath(payload.path) || documentKey(payload.path) === null) return null;
    path = payload.path;
  }
  return { v: 1, scope: "answer", issuedTo: payload.issuedTo, target: payload.target, path, revision: payload.revision, iat: payload.iat as number, exp: payload.exp as number };
}
