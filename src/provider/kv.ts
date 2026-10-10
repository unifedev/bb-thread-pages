// bb.storage.kv, per plugin; the server namespaces per session and scope (DESIGN §B.3).
//
// bb measures its 256 KB cap on the JSON-serialised value (measured on the SDK fake, O-3): a string of N bytes
// costs N + 2 plus escaping, and the core's storage pages are JSON text full of quotes. So a value that parses
// as JSON and round-trips byte-for-byte is stored as the parsed value (exact cost = the value's bytes); any
// other string is stored raw (cost = bytes + 2 + escaping). `get` returns strings for strings and re-serialises
// objects, which is the original text. The adapter measures before bb does, so an over-cap write is
// `too_large`, never `other`.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type ProviderHost } from "../../core/src/host/index.ts";
import { sdkCall } from "./errors.ts";

/** bb's cap per JSON-serialised value (`KV_VALUE_MAX_BYTES`, host-policy.d.ts:1116; no public SDK export, asserted by test: O-3). */
export const KV_VALUE_MAX_BYTES = 262_144;

/** What one string costs in bb's store, and what to hand bb. */
export function kvEncode(value: string): { stored: unknown; bytes: number } {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object" && JSON.stringify(parsed) === value) return { stored: parsed, bytes: Buffer.byteLength(value, "utf8") };
    } catch {
      // not JSON: stored raw
    }
  }
  return { stored: value, bytes: Buffer.byteLength(JSON.stringify(value), "utf8") };
}

export function kvDecode(stored: unknown): string | null {
  if (typeof stored === "string") return stored;
  if (stored !== null && typeof stored === "object") return JSON.stringify(stored);
  return null;
}

export function createBbKv(bb: BbPluginApi): ProviderHost["kv"] {
  return {
    async get(key) {
      return kvDecode(await sdkCall("kv.get", () => bb.storage.kv.get<unknown>(key)));
    },
    async set(key, value) {
      const { stored, bytes } = kvEncode(value);
      if (bytes > KV_VALUE_MAX_BYTES) throw new ProviderError("too_large", `kv.set: ${bytes} bytes is over bb's ${KV_VALUE_MAX_BYTES}-byte value cap`);
      await sdkCall("kv.set", () => bb.storage.kv.set(key, stored));
    },
    delete: (key) => sdkCall("kv.delete", () => bb.storage.kv.delete(key)),
    valueBytes: KV_VALUE_MAX_BYTES,
  };
}
