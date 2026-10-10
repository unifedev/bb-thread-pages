// `workspaces.browse` single-use token (03 R5.36): signed, bound to the requesting session, short-lived; the store holds the selection and marks use.
import { isSessionIdentity } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

export interface SelectionToken {
  readonly v: 1;
  readonly scope: "selection";
  readonly session: string;
  /** Random, the key of the selection the server holds. */
  readonly id: string;
  readonly iat: number;
  readonly exp: number;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mintSelectionToken(args: { session: string; now: number; random: (bytes: number) => Uint8Array }, key: Uint8Array): { token: string; payload: SelectionToken } {
  const payload: SelectionToken = { v: 1, scope: "selection", session: args.session, id: hex(args.random(16)), iat: args.now, exp: args.now + LIMITS.selectionTokenMs };
  return { token: signPayload(payload, key), payload };
}

/** Opens a selection token for one session; another session's, an expired or a tampered one is null. 03 R5.37 */
export function verifySelectionToken(token: unknown, key: Uint8Array, now: number, session: string): SelectionToken | null {
  if (typeof token !== "string" || token.length === 0 || token.length > LIMITS.tokenChars) return null;
  const payload = openToken(token, key);
  if (!isRecord(payload)) return null;
  if (payload.v !== 1 || payload.scope !== "selection" || !isSessionIdentity(payload.session) || payload.session !== session || typeof payload.id !== "string" || !/^[0-9a-f]{32}$/.test(payload.id) || !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.selectionTokenMs)) return null;
  const allowed = new Set(["v", "scope", "session", "id", "iat", "exp"]);
  if (Object.keys(payload).some((field) => !allowed.has(field))) return null;
  return { v: 1, scope: "selection", session: payload.session, id: payload.id, iat: payload.iat as number, exp: payload.exp as number };
}
