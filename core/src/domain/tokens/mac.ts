// HMAC-SHA256 sign/open with constant-time compare, base64url, `lifetimeValid`, SHA-256 — the one place node:crypto is imported in the domain.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** SHA-256 of text or bytes, as lowercase hex. 05 R2.11, R3.20 */
export function sha256Hex(content: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof content === "string") hash.update(content, "utf8");
  else hash.update(content);
  return hash.digest("hex");
}

/** HMAC-SHA256 of text under a key, as lowercase hex. 03 R-C5 */
export function hmacHex(key: Uint8Array, label: string, content: string): string {
  return createHmac("sha256", createHmac("sha256", key).update(label, "utf8").digest()).update(content, "utf8").digest("hex");
}

/**
 * Signed tokens: `<base64url(json)>.<base64url(hmac-sha256)>`, verified in
 * constant time with a key only the server holds. spec 05 R2.6
 */
export function signPayload(payload: unknown, key: Uint8Array): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, key)}`;
}

/** Returns the decoded payload when the signature verifies, otherwise null. 05 R2.6 */
export function openToken(token: string, key: Uint8Array): unknown | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts as [string, string];
  if (!encoded || !supplied) return null;
  try {
    const expected = Buffer.from(signature(encoded, key), "ascii");
    const given = Buffer.from(supplied, "ascii");
    if (given.byteLength !== expected.byteLength) return null;
    if (!timingSafeEqual(given, expected)) return null;
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function signature(encoded: string, key: Uint8Array): string {
  // Tokens are signed under a key derived for them, so no workspace id (03 R-C5) can verify as one.
  return createHmac("sha256", createHmac("sha256", key).update("token", "utf8").digest()).update(encoded, "ascii").digest("base64url");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A token lifetime check shared by every token kind: issued no later than now (with 30 s of clock skew), not expired, not longer-lived than the maximum. 05 R2.7 */
export function lifetimeValid(payload: { iat: unknown; exp: unknown }, now: number, maxLifetimeMs: number): boolean {
  const { iat, exp } = payload;
  return (
    typeof iat === "number" &&
    Number.isSafeInteger(iat) &&
    typeof exp === "number" &&
    Number.isSafeInteger(exp) &&
    iat <= now + 30_000 &&
    exp > now &&
    exp > iat &&
    exp - iat <= maxLifetimeMs
  );
}
