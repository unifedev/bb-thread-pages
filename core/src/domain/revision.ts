// `revisionOf(html)` = SHA-256 hex of the assembled document (05 R2.11); `sha256Hex`; the entity tag.
import { sha256Hex } from "./tokens/mac.ts";

/** A page revision is the SHA-256 of the assembled document's bytes. 05 R2.11 */
export function revisionOf(content: string | Uint8Array): string {
  return sha256Hex(content);
}

export { sha256Hex };

/** The revision of a page not written yet: the digest of nothing. 04 R6.19; DESIGN P23 */
export const EMPTY_REVISION = sha256Hex("");

/** The revision doubles as the entity tag. 05 R2.12 */
export function etagFor(revision: string): string {
  return `"${revision}"`;
}

/** Whether an `If-None-Match` header names the given entity tag. 05 R2.17, R-S9 */
export function ifNoneMatchMatches(header: string | undefined | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === etag || candidate === "*");
}
