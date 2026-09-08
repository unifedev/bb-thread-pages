import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed tokens: `<base64url(json)>.<base64url(hmac-sha256)>`, verified in
 * constant time with a key only the host holds. spec R2.6
 */
export function signPayload(payload: unknown, key: Uint8Array): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, key)}`;
}

/** Returns the decoded payload when the signature verifies, otherwise null. */
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
  return createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A token lifetime check shared by every token kind. */
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
