// `workspaceIdFor(path, signingKey)`: HMAC under the label `workspace-id` (03 R-C5).
import { hmacHex } from "./mac.ts";

/**
 * An opaque, stable workspace id for a provider that has only paths: an HMAC
 * of the canonical absolute path under a key derived from the server's
 * signing key with the label `workspace-id`, used for nothing else, so no
 * digest verifies as a token and no token as an id. Regenerating the signing
 * key rotates every id. The provider resolves an id by lookup among what it
 * lists, never by inverting it. spec 03 R-C5; DESIGN P16, DR-16
 */
export function workspaceIdFor(path: string, signingKey: Uint8Array): string {
  const canonical = path.length > 1 ? path.replace(/[\\/]+$/, "") : path;
  return `ws_${hmacHex(signingKey, "workspace-id", canonical)}`;
}

export function isWorkspaceDigest(value: unknown): value is string {
  return typeof value === "string" && /^ws_[0-9a-f]{64}$/.test(value);
}
