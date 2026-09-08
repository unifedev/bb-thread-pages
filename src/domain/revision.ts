import { createHash } from "node:crypto";

/** A page revision is the SHA-256 of the entry document's bytes. spec R2.11 */
export function revisionOf(content: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof content === "string") hash.update(content, "utf8");
  else hash.update(content);
  return hash.digest("hex");
}

export function sha256Hex(content: string | Uint8Array): string {
  return revisionOf(content);
}

/** The revision doubles as the entity tag. spec R2.12 */
export function etagFor(revision: string): string {
  return `"${revision}"`;
}

/** Whether an `If-None-Match` header names the given entity tag. */
export function ifNoneMatchMatches(header: string | undefined | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === etag || candidate === "*");
}
