import { documentKey } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import { isRevision } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { revisionOf } from "../domain/revision.ts";
import type { SessionHost } from "../host/contract.ts";
import type { ResolveOutcome } from "./inline.ts";
import { ENTRY_FILE } from "./layout.ts";

/**
 * Loads a page's documents, bounds them, computes each one's revision, and
 * keeps a last-known-good copy so a document still opens read-only when its
 * source host is unreachable. The entry document is the page; any other HTML
 * file in the page root is one of its documents, tracked on its own.
 * spec R1.7, R1.12c, R2.11, R2.27–R2.30
 */
export interface LoadedPage {
  readonly html: string;
  readonly revision: string;
  readonly updatedAtMs: number;
  /** True when served from the offline copy. */
  readonly stale: boolean;
  /** Own files carried into the document, and those that could not be. */
  readonly site: { readonly resolved: number; readonly skipped: readonly { path: string; reason: string }[] };
}

interface CachedPage {
  readonly html: string;
  readonly revision: string;
  readonly updatedAtMs: number;
}

/**
 * Resolves a page's own files into a document so it renders on an origin
 * that will not authorise the sandbox's subresource requests. `path` is the
 * document within the page root, null for the entry document.
 * Temporary; see pages/inline.ts. spec R1.2, R4.25-R4.27
 */
export type PageResolver = (session: string, html: string, path: string | null) => Promise<ResolveOutcome>;

export interface PageStore {
  /** The entry document, or with `path` another document of the page. */
  load(session: string, path?: string | null): Promise<LoadedPage>;
  /** Records an entry document the plugin just wrote, so the next load is warm. */
  remember(session: string, html: string): Promise<CachedPage>;
  /** The entry document's revision last seen for a session, without touching the host. */
  knownRevision(session: string): string | null;
}

const KV_PREFIX = "cache:";

/** The entry document keeps its historical key, so existing offline copies survive. */
function cacheKey(session: string, path: string | null): string {
  return path ? `${session}#${path}` : session;
}

export function createPageStore(host: SessionHost, resolve?: PageResolver): PageStore {
  const memory = new Map<string, CachedPage>();
  let memoryBytes = 0;

  function cost(page: CachedPage): number {
    return Buffer.byteLength(page.html, "utf8") + 128;
  }

  function retain(key: string, page: CachedPage): void {
    const previous = memory.get(key);
    if (previous) {
      memoryBytes -= cost(previous);
      memory.delete(key);
    }
    memory.set(key, page);
    memoryBytes += cost(page);
    while (memory.size > LIMITS.offlineCacheEntries || memoryBytes > LIMITS.offlineCacheBytes) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      const evicted = memory.get(oldest);
      memory.delete(oldest);
      if (evicted) memoryBytes -= cost(evicted);
    }
  }

  async function persist(key: string, page: CachedPage, previousRevision: string | undefined): Promise<void> {
    if (previousRevision === page.revision) return;
    const kvKey = KV_PREFIX + key;
    const bytes = Buffer.byteLength(page.html, "utf8");
    if (bytes > LIMITS.offlineCopyBytes) {
      // Silently dropping this is how a page stops opening offline with no
      // author ever learning why. Carrying a page's own files into the
      // document makes it much easier to cross. spec R2.27-R2.31
      host.log.warn(
        `offline copy: ${key} is ${Math.round(bytes / 1024)} KiB, over the ${LIMITS.offlineCopyBytes / 1024} KiB limit — ` +
          "the page will not open while its host is unreachable",
      );
      await host.kv.delete(kvKey).catch((error: unknown) => host.log.warn(`offline copy: could not clear ${key}: ${errorText(error)}`));
      return;
    }
    await host.kv.set(kvKey, { html: page.html, revision: page.revision, updatedAtMs: page.updatedAtMs }).catch((error: unknown) => {
      host.log.warn(`offline copy: could not store ${key}: ${errorText(error)}`);
    });
  }

  async function cached(key: string): Promise<CachedPage | null> {
    const resident = memory.get(key);
    if (resident) return resident;
    try {
      const stored = await host.kv.get(KV_PREFIX + key);
      if (!isCachedPage(stored)) return null;
      retain(key, stored);
      return stored;
    } catch (error) {
      host.log.warn(`offline copy: could not read ${key}: ${errorText(error)}`);
      return null;
    }
  }

  async function remember(session: string, html: string, updatedAtMs = Date.now()): Promise<CachedPage> {
    const page: CachedPage = { html, revision: revisionOf(html), updatedAtMs };
    const previous = memory.get(session)?.revision;
    retain(session, page);
    await persist(session, page, previous);
    return page;
  }

  return {
    async load(session, requested) {
      const path = documentKey(requested);
      const key = cacheKey(session, path);
      let content;
      try {
        const location = await host.sessions.storage(session);
        content = await host.files.read(location, path ?? ENTRY_FILE);
      } catch (error) {
        const fallback = await cached(key);
        if (fallback) return { ...fallback, stale: true, site: { resolved: 0, skipped: [] } };
        throw PageError.is(error) ? error : new PageError("unavailable", PUBLIC_MESSAGES.unavailable, { cause: error });
      }
      if (!content) throw path ? new PageError("not_found", "That document of the page does not exist.") : new PageError("no_page", PUBLIC_MESSAGES.noPage);
      if (content.bytes.byteLength > LIMITS.entryDocumentBytes) {
        throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
      }
      const authored = Buffer.from(content.bytes).toString("utf8");
      let html = authored;
      let site: LoadedPage["site"] = { resolved: 0, skipped: [] };
      if (resolve) {
        try {
          const outcome = await resolve(session, authored, path);
          html = outcome.html;
          site = { resolved: outcome.resolved.length, skipped: outcome.skipped };
          for (const file of outcome.skipped) {
            host.log.warn(`page ${key}: ${file.path} is referenced but was not carried into the document (${file.reason})`);
          }
        } catch (error) {
          // A page that renders without its own files beats a page that does
          // not render. Serve what the agent wrote.
          host.log.warn(`page ${key}: could not resolve its own files: ${errorText(error)}`);
        }
      }
      const page: CachedPage = { html, revision: revisionOf(html), updatedAtMs: content.modifiedAtMs ?? Date.now() };
      const previous = memory.get(key)?.revision;
      retain(key, page);
      await persist(key, page, previous);
      return { ...page, stale: false, site };
    },
    remember,
    knownRevision(session) {
      return memory.get(session)?.revision ?? null;
    },
  };
}

function isCachedPage(value: unknown): value is CachedPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.html === "string" &&
    Buffer.byteLength(entry.html, "utf8") <= LIMITS.offlineCopyBytes &&
    isRevision(entry.revision) &&
    revisionOf(entry.html) === entry.revision &&
    typeof entry.updatedAtMs === "number" &&
    Number.isFinite(entry.updatedAtMs)
  );
}
