// `PageStore.load(session, path)` → `LoadedPage` (html, revision, stale, site report); offline copy in `kv`; one load per key in flight; bounded in-memory cache (05 R2.11, R2.27–R2.30; DESIGN §F.3, DR-15, DR-31).
import { documentKey } from "../domain/document-path.ts";
import { errorText, PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { captureForms } from "../domain/html/forms.ts";
import { isRevision } from "../domain/ids.ts";
import { utf8Bytes } from "../domain/json/strict-json.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { revisionOf } from "../domain/revision.ts";
import type { FormIdentity } from "../domain/forms/identity.ts";
import type { Logger, ProviderHost } from "../host/provider.ts";
import type { LoadedPage, PageStore } from "../serving/stores.d.ts";
import { assembleDocument, pageFileIo } from "./assemble.ts";
import { ENTRY_FILE } from "./layout.ts";

/** The `kv` key of a document's offline copy. DESIGN P9 */
export const OFFLINE_COPY_PREFIX = "pages-core:cache:";

export interface PageStoreOptions {
  strategy: "by-url" | "carried";
  now(): number;
  log: Logger;
}

interface CachedDocument {
  html: string;
  revision: string;
  updatedAtMs: number;
  /** The entry file's stat the assembly was made from. */
  size: number;
  mtimeMs: number;
  checkedAt: number;
  archived: boolean;
  site: LoadedPage["site"];
  report: string;
  forms: FormIdentity[] | null;
}

interface OfflineCopy {
  revision: string;
  html: string;
  updatedAtMs: number;
}

function isProviderUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "ProviderError" && (error as { code?: unknown }).code === "unavailable";
}

function copyKey(session: string, path: string | null): string {
  return `${OFFLINE_COPY_PREFIX}${session}#${path ?? ""}`;
}

/**
 * Loads a page's documents: the entry file is stat'ed (where the provider
 * says that is cheap, else the cache is trusted for one working-poll cadence),
 * read and assembled when it changed, and its revision is the digest of the
 * assembled document. An assembled document within `offlineCopyBytes` is
 * kept in `kv` with its revision, and served read-only when the provider is
 * unreachable, only if it still digests to that revision.
 * 05 R2.11, R2.27–R2.30; 01 R1.7; DESIGN §F.3
 */
export function createPageStore(provider: ProviderHost, options: PageStoreOptions): PageStore {
  const cache = new Map<string, CachedDocument>();
  const loading = new Map<string, Promise<LoadedPage>>();
  // Both per session, bounded at `offlineCacheEntries` like the cache: stale availability answers are swept, the oldest copy set dropped (its `forget` then clears the entry copy alone, as after a restart).
  const availability = new Map<string, { value: boolean; at: number }>();
  const copies = new Map<string, Set<string>>();
  function noteAvailability(session: string, value: boolean, now: number): void {
    if (availability.size >= LIMITS.offlineCacheEntries) {
      for (const [other, known] of availability) if (now - known.at >= LIMITS.shellPollWorkingMs) availability.delete(other);
    }
    availability.delete(session);
    availability.set(session, { value, at: now });
  }
  function copySet(session: string): Set<string> {
    const known = copies.get(session) ?? new Set<string>();
    copies.delete(session);
    while (copies.size >= LIMITS.offlineCacheEntries) {
      const oldest = copies.keys().next().value;
      if (oldest === undefined) break;
      copies.delete(oldest);
    }
    copies.set(session, known);
    return known;
  }
  let cacheBytes = 0;
  const statIsCheap = provider.files.statIsCheap === true;

  const keyOf = (session: string, path: string | null) => `${session}\u0000${path ?? ""}`;
  const cost = (entry: { html: string }) => utf8Bytes(entry.html) + 256;

  function retain(key: string, entry: CachedDocument): void {
    const previous = cache.get(key);
    if (previous) {
      cacheBytes -= cost(previous);
      cache.delete(key);
    }
    cache.set(key, entry);
    cacheBytes += cost(entry);
    while (cache.size > LIMITS.offlineCacheEntries || cacheBytes > LIMITS.offlineCacheBytes) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      if (evicted) cacheBytes -= cost(evicted);
    }
  }

  async function persist(session: string, path: string | null, entry: CachedDocument, previousRevision: string | undefined): Promise<void> {
    if (previousRevision === entry.revision) return;
    const key = copyKey(session, path);
    const known = copySet(session);
    if (utf8Bytes(entry.html) > LIMITS.offlineCopyBytes) {
      if (known.has(key)) {
        options.log.warn(`offline copy: ${session}#${path ?? ENTRY_FILE} is over ${LIMITS.offlineCopyBytes / 1024} KiB and will not open while its host is unreachable`);
        known.delete(key);
        await provider.kv.delete(key).catch((error: unknown) => options.log.warn(`offline copy: could not clear ${key}: ${errorText(error)}`));
      }
      return;
    }
    const copy: OfflineCopy = { revision: entry.revision, html: entry.html, updatedAtMs: entry.updatedAtMs };
    try {
      await provider.kv.set(key, JSON.stringify(copy));
      known.add(key);
    } catch (error) {
      options.log.warn(`offline copy: could not store ${key}: ${errorText(error)}`);
    }
  }

  /** The offline copy, only when it still digests to its recorded revision. 05 R2.30; DR-31 */
  async function offlineCopy(session: string, path: string | null): Promise<OfflineCopy | null> {
    const key = copyKey(session, path);
    let raw: string | null;
    try {
      raw = await provider.kv.get(key);
    } catch (error) {
      options.log.warn(`offline copy: could not read ${key}: ${errorText(error)}`);
      return null;
    }
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const copy = parsed as Partial<OfflineCopy> | null;
    if (copy && typeof copy.html === "string" && isRevision(copy.revision) && typeof copy.updatedAtMs === "number" && revisionOf(copy.html) === copy.revision) {
      return { revision: copy.revision, html: copy.html, updatedAtMs: copy.updatedAtMs };
    }
    options.log.warn(`offline copy: ${key} does not match its recorded revision; deleted`);
    await provider.kv.delete(key).catch(() => undefined);
    return null;
  }

  function reportOnce(session: string, path: string | null, entry: CachedDocument, previous: string | undefined): void {
    if (entry.report === previous) return;
    for (const file of entry.site.skipped) options.log.warn(`page ${session}#${path ?? ENTRY_FILE}: ${file.path} is referenced but was not carried into the document (${file.reason})`);
    for (const file of entry.site.deferred) options.log.info(`page ${session}#${path ?? ENTRY_FILE}: ${file.path} (${mebibytes(file.bytes)}) is too large to carry; the shell fetches it for the reader`);
  }

  async function loadNow(session: string, path: string | null): Promise<LoadedPage> {
    const key = keyOf(session, path);
    const file = path ?? ENTRY_FILE;
    const now = options.now();
    const cached = cache.get(key);
    const record = await provider.sessions.get(session);
    if (record === null) throw new PageError("not_found", PUBLIC_MESSAGES.deleted);
    const archived = record.archived;
    if (cached && !statIsCheap && now - cached.checkedAt < LIMITS.shellPollWorkingMs) {
      return { html: cached.html, revision: cached.revision, updatedAtMs: cached.updatedAtMs, path, stale: false, archived, site: cached.site };
    }
    let stat: Awaited<ReturnType<ProviderHost["files"]["stat"]>>;
    try {
      stat = await provider.files.stat(session, file);
    } catch (error) {
      if (!isProviderUnavailable(error)) throw new PageError("unavailable", PUBLIC_MESSAGES.unreachable, { cause: error });
      return fallback(session, path, archived, error);
    }
    if (stat === null || stat.kind !== "file") throw path ? new PageError("not_found", "That document of the page does not exist.") : new PageError("no_page", PUBLIC_MESSAGES.noPage);
    if (stat.size > LIMITS.entryDocumentBytes) throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
    noteAvailability(session, true, now);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      cached.checkedAt = now;
      cached.archived = archived;
      return { html: cached.html, revision: cached.revision, updatedAtMs: cached.updatedAtMs, path, stale: false, archived, site: cached.site };
    }
    const io = pageFileIo(provider, session);
    let assembled;
    try {
      const bytes = await io.read(file);
      if (bytes === null) throw path ? new PageError("not_found", "That document of the page does not exist.") : new PageError("no_page", PUBLIC_MESSAGES.noPage);
      if (bytes.byteLength > LIMITS.entryDocumentBytes) throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
      assembled = await assembleDocument(io, Buffer.from(bytes).toString("utf8"), path, options.strategy);
    } catch (error) {
      if (PageError.is(error)) throw error;
      if (!isProviderUnavailable(error)) throw new PageError("unavailable", PUBLIC_MESSAGES.unreachable, { cause: error });
      return fallback(session, path, archived, error);
    }
    const entry: CachedDocument = {
      html: assembled.html,
      revision: assembled.revision,
      updatedAtMs: stat.mtimeMs,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      checkedAt: now,
      archived,
      site: assembled.site,
      report: [...assembled.site.skipped.map((entry) => `${entry.path} (${entry.reason})`), ...assembled.site.deferred.map((entry) => `${entry.path} (deferred)`)].join(", "),
      forms: null,
    };
    reportOnce(session, path, entry, cached?.report);
    retain(key, entry);
    await persist(session, path, entry, cached?.revision);
    return { html: entry.html, revision: entry.revision, updatedAtMs: entry.updatedAtMs, path, stale: false, archived, site: entry.site };
  }

  async function fallback(session: string, path: string | null, archived: boolean, cause: unknown): Promise<LoadedPage> {
    const copy = await offlineCopy(session, path);
    if (!copy) throw new PageError("unavailable", PUBLIC_MESSAGES.unreachable, { cause, reason: "offline" });
    return { html: copy.html, revision: copy.revision, updatedAtMs: copy.updatedAtMs, path, stale: true, archived, site: { resolved: 0, skipped: [], deferred: [] } };
  }

  const store: PageStore = {
    load(session, requested) {
      const path = documentKey(requested);
      const key = keyOf(session, path);
      const current = loading.get(key);
      if (current) return current;
      const started = loadNow(session, path).finally(() => loading.delete(key));
      loading.set(key, started);
      return started;
    },
    async forms(session, requested) {
      const path = documentKey(requested);
      const page = await store.load(session, path);
      const cached = cache.get(keyOf(session, path));
      if (cached && cached.revision === page.revision) {
        if (!cached.forms) cached.forms = captureForms(page.html);
        return { revision: page.revision, forms: cached.forms };
      }
      return { revision: page.revision, forms: captureForms(page.html) };
    },
    knownRevision(session) {
      return cache.get(keyOf(session, null))?.revision ?? null;
    },
    async available(session) {
      const now = options.now();
      const known = availability.get(session);
      if (known && now - known.at < LIMITS.shellPollWorkingMs) return known.value;
      let value = false;
      try {
        if (statIsCheap) {
          const stat = await provider.files.stat(session, ENTRY_FILE);
          value = stat !== null && stat.kind === "file";
        } else {
          const listing = await provider.files.list(session, "");
          value = listing.some((entry) => entry.name === ENTRY_FILE && entry.kind === "file");
        }
      } catch (error) {
        if (!isProviderUnavailable(error)) return false;
        value = known?.value ?? (await offlineCopy(session, null)) !== null;
      }
      noteAvailability(session, value, now);
      return value;
    },
    async forget(session) {
      for (const key of [...cache.keys()]) {
        if (!key.startsWith(`${session}\u0000`)) continue;
        const entry = cache.get(key);
        cache.delete(key);
        if (entry) cacheBytes -= cost(entry);
      }
      availability.delete(session);
      const known = copies.get(session) ?? new Set<string>([copyKey(session, null)]);
      copies.delete(session);
      for (const key of known) await provider.kv.delete(key).catch(() => undefined);
    },
  };
  return store;
}
