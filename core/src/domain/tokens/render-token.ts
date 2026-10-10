// `RenderToken { v, scope:"render", session, revision, path, iat, exp }` mint/verify (05 §Tokens).
import { documentKey } from "../document-path.ts";
import { LIMITS } from "../limits.ts";
import { openScoped } from "./action-token.ts";
import { signPayload } from "./mac.ts";

/** The render token: authority to read one page revision; carried in the document URL on the one document load. 05 §Tokens, R2.7 */
export interface RenderToken {
  readonly v: 1;
  readonly scope: "render";
  readonly session: string;
  readonly revision: string;
  readonly path: string | null;
  readonly iat: number;
  readonly exp: number;
}

export function mintRenderToken(args: { session: string; revision: string; path?: string | null; now: number }, key: Uint8Array): { token: string; payload: RenderToken } {
  const path = documentKey(args.path);
  const base = { v: 1 as const, scope: "render" as const, session: args.session, revision: args.revision, iat: args.now, exp: args.now + LIMITS.actionTokenMs };
  return { token: signPayload(path ? { ...base, path } : base, key), payload: { ...base, path } };
}

export function verifyRenderToken(token: unknown, key: Uint8Array, now: number): RenderToken | null {
  const payload = openScoped(token, key, now, "render", LIMITS.actionTokenMs);
  if (!payload) return null;
  return { v: 1, scope: "render", session: payload.session, revision: payload.revision, path: payload.path, iat: payload.iat, exp: payload.exp };
}
