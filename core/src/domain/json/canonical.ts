// Canonical serialisation (sorted keys) and `fingerprint` (05 R3.20).
import { sha256Hex } from "../tokens/mac.ts";
import type { JsonValue } from "./strict-json.ts";

/** Canonical serialisation: object keys sorted at every level, so reordering keys cannot change a fingerprint. 05 R3.20 */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(",")}}`;
}

/** The SHA-256 of the canonical serialisation, as hex. 05 R3.19, R3.20 */
export function fingerprint(value: JsonValue): string {
  return sha256Hex(canonicalJson(value));
}
