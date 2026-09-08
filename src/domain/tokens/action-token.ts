import { isRevision, isSessionId } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

/**
 * The action token: authority to act as one page's owner session, for one
 * page revision, for a bounded time. Held only by the shell, sent only in
 * request bodies. spec R2.7–R2.10
 */
export interface ActionToken {
  readonly v: 3;
  readonly scope: "action";
  readonly session: string;
  readonly revision: string;
  readonly iat: number;
  readonly exp: number;
}

export function mintActionToken(args: { session: string; revision: string; now: number }, key: Uint8Array): { token: string; payload: ActionToken } {
  const payload: ActionToken = {
    v: 3,
    scope: "action",
    session: args.session,
    revision: args.revision,
    iat: args.now,
    exp: args.now + LIMITS.actionTokenMs,
  };
  return { token: signPayload(payload, key), payload };
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
  return {
    v: 3,
    scope: "action",
    session: payload.session,
    revision: payload.revision,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}
