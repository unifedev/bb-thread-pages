// `createStorageStore(kv)`: one `kv` document per (identity, scope) and a scope index per identity; `set` is all or none, bounded per value and per page across scopes, writes nothing on refusal, and every write of one identity is serialised so concurrent sets never lose a key (03 R5.18–R5.19, R-C6; 07 R5.84a; DESIGN §E.9, P8).
import { PageError, errorText } from "../domain/errors.ts";
import { utf8Bytes, type JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS, kibibytes } from "../domain/limits.ts";
import type { Logger, ProviderHost } from "../host/provider.ts";
import type { StorageStore } from "./stores.d.ts";

const PREFIX = "pages-core:storage:";
const INDEX_PREFIX = "pages-core:storage-scopes:";
/** How long the other scopes' sizes of one identity are trusted between writes. DESIGN §E.9 */
const SIZE_CACHE_MS = 2_000;
/** Identities whose scope sizes are cached at once; past this, expired entries are swept. */
const SIZE_CACHE_ENTRIES = 256;

export function storageDocumentKey(identity: string, scope: string | null): string {
  return `${PREFIX}${identity}:${scope ?? ""}`;
}

export function storageIndexKey(identity: string): string {
  return `${INDEX_PREFIX}${identity}`;
}

function isProviderTooLarge(error: unknown): boolean {
  return error instanceof Error && error.name === "ProviderError" && (error as { code?: unknown }).code === "too_large";
}

export function createStorageStore(kv: ProviderHost["kv"], options: { log?: Logger; now?: () => number } = {}): StorageStore {
  const now = options.now ?? (() => Date.now());
  const pageBytes = Math.min(LIMITS.storagePageBytes, kv.valueBytes ?? Number.POSITIVE_INFINITY);
  const sizes = new Map<string, { at: number; byScope: Map<string, number> }>();
  // Writes are read-modify-write over one document and the identity's scope index: serialised per identity, so two sets in flight from one page (up to `rateConcurrent`) never drop each other's keys (R-C6). The chain is dropped once idle.
  const chains = new Map<string, Promise<unknown>>();
  function serial<T>(identity: string, work: () => Promise<T>): Promise<T> {
    const previous = chains.get(identity) ?? Promise.resolve();
    const next = previous.then(work, work);
    const tail = next.catch(() => undefined);
    chains.set(identity, tail);
    void tail.then(() => {
      if (chains.get(identity) === tail) chains.delete(identity);
    });
    return next;
  }

  async function readDocument(identity: string, scope: string | null): Promise<Record<string, JsonValue>> {
    const raw = await kv.get(storageDocumentKey(identity, scope));
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, JsonValue>) : {};
    } catch (error) {
      options.log?.warn(`storage: document of ${identity}/${scope ?? ""} is not JSON, treated as empty: ${errorText(error)}`);
      return {};
    }
  }

  async function readIndex(identity: string): Promise<string[]> {
    const raw = await kv.get(storageIndexKey(identity));
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === "string") : [];
    } catch {
      return [];
    }
  }

  /** The serialised length of every scope's document of one identity, read through the index and cached for a moment. */
  async function scopeSizes(identity: string): Promise<Map<string, number>> {
    const cached = sizes.get(identity);
    if (cached && now() - cached.at < SIZE_CACHE_MS) return cached.byScope;
    const byScope = new Map<string, number>();
    for (const other of await readIndex(identity)) {
      const raw = await kv.get(storageDocumentKey(identity, other === "" ? null : other));
      if (raw !== null) byScope.set(other, utf8Bytes(raw));
    }
    if (sizes.size >= SIZE_CACHE_ENTRIES) {
      const at = now();
      for (const [other, entry] of sizes) if (at - entry.at >= SIZE_CACHE_MS) sizes.delete(other);
    }
    sizes.set(identity, { at: now(), byScope });
    return byScope;
  }

  return {
    async get(identity, scope, key) {
      const document = await readDocument(identity, scope);
      if (!Object.prototype.hasOwnProperty.call(document, key)) return { found: false };
      return { found: true, value: document[key] as JsonValue };
    },
    async set(identity, scope, entries) {
      if (entries.length > LIMITS.storageSetManyEntries) throw new PageError("invalid_params", `At most ${LIMITS.storageSetManyEntries} entries in one call`);
      const keys = entries.map((entry) => entry.key);
      if (new Set(keys).size !== keys.length) throw new PageError("invalid_params", "A key appears twice in one call");
      return serial(identity, () => write(identity, scope, entries));
    },
    forget(identity) {
      return serial(identity, async () => {
        for (const scope of await readIndex(identity)) await kv.delete(storageDocumentKey(identity, scope === "" ? null : scope));
        await kv.delete(storageDocumentKey(identity, null));
        await kv.delete(storageIndexKey(identity));
        sizes.delete(identity);
      });
    },
  };

  async function write(identity: string, scope: string | null, entries: readonly { key: string; value: JsonValue | null }[]): Promise<{ stored: number }> {
    const scopeKey = scope ?? "";
    const next = { ...(await readDocument(identity, scope)) };
    for (const entry of entries) {
      if (entry.value === null) {
        delete next[entry.key];
        continue;
      }
      if (utf8Bytes(JSON.stringify(entry.value)) > LIMITS.storageValueBytes) throw new PageError("request_too_large", `A storage value is at most ${kibibytes(LIMITS.storageValueBytes)} serialised; "${entry.key}" is larger`);
      next[entry.key] = entry.value;
    }
    const serialised = JSON.stringify(next);
    const own = Object.keys(next).length === 0 ? 0 : utf8Bytes(serialised);
    let total = own;
    const byScope = await scopeSizes(identity);
    for (const [other, bytes] of byScope) if (other !== scopeKey) total += bytes;
    if (total > pageBytes) throw new PageError("request_too_large", `A page's storage is at most ${kibibytes(pageBytes)} across its scopes; this write would make it ${kibibytes(total)}`);
    const index = await readIndex(identity);
    if (own === 0) {
      await kv.delete(storageDocumentKey(identity, scope));
      if (index.includes(scopeKey)) await kv.set(storageIndexKey(identity), JSON.stringify(index.filter((item) => item !== scopeKey)));
    } else {
      try {
        await kv.set(storageDocumentKey(identity, scope), serialised);
      } catch (error) {
        if (isProviderTooLarge(error)) throw new PageError("request_too_large", `A page's storage is at most ${kibibytes(pageBytes)}`, { cause: error });
        throw new PageError("unavailable", "The page's storage could not be written right now", { cause: error });
      }
      if (!index.includes(scopeKey)) await kv.set(storageIndexKey(identity), JSON.stringify([...index, scopeKey]));
    }
    if (own === 0) byScope.delete(scopeKey);
    else byScope.set(scopeKey, own);
    return { stored: entries.length };
  }
}
