// The cursor codec for transcripts and snapshots (03 R-C1; DR-6): the server wraps every provider cursor with a session-bound HMAC tag and refuses a foreign or forged one before the provider is called.
import { hmacHex } from "../tokens/mac.ts";

const CURSOR = /^([A-Za-z0-9_-]+)\.([0-9a-f]{16})$/;

function tag(session: string, providerCursor: string, key: Uint8Array): string {
  return hmacHex(key, "cursor", `${session}\u0000${providerCursor}`).slice(0, 16);
}

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(text: string): string | null {
  try {
    const decoded = Buffer.from(text, "base64url");
    if (decoded.toString("base64url") !== text) return null;
    return decoded.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The cursor a page carries: base64url of the provider's cursor plus an
 * 8-byte HMAC tag over the session and the provider's cursor under the
 * signing key. 03 R-C1, 06 R-P8; DESIGN §E.6 (DR-6)
 */
export function encodeCursor(session: string, providerCursor: string, key: Uint8Array): string {
  if (providerCursor.length === 0 || providerCursor.length > 512) throw new RangeError("A provider cursor is 1–512 characters");
  return `${toBase64Url(providerCursor)}.${tag(session, providerCursor, key)}`;
}

/** The provider's cursor behind a page's, or null for a malformed cursor, a tag for another session, or a forged one. 03 R-C1 */
export function decodeCursor(session: string, cursor: unknown, key: Uint8Array): string | null {
  if (typeof cursor !== "string" || cursor.length > 1024) return null;
  const match = CURSOR.exec(cursor);
  if (!match) return null;
  const providerCursor = fromBase64Url(match[1]!);
  if (providerCursor === null || providerCursor.length === 0) return null;
  return tag(session, providerCursor, key) === match[2] ? providerCursor : null;
}

/** Whether a value has the cursor form at all (any session, any key). */
export function isCursorString(value: unknown): value is string {
  return typeof value === "string" && CURSOR.test(value);
}
