import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import { isRevision } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { revisionOf } from "../domain/revision.ts";
import type { SessionHost } from "../host/contract.ts";
import type { ResolveOutcome } from "./inline.ts";
import { ENTRY_FILE } from "./layout.ts";

/**
 * Loads a page's entry document, bounds it, computes its revision, and keeps
 * a last-known-good copy so the page still opens read-only when its source
 * host is unreachable. spec R1.7, R2.11, R2.27–R2.30
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
 * Resolves a page's own files into its entry document so it renders on an
 * origin that will not authorise the sandbox's subresource requests.
 * Temporary; see pages/inline.ts. spec R1.2, R4.25-R4.27
 */
export type PageResolver = (session: string, html: string) => Promise<ResolveOutcome>;

export interface PageStore {
  load(session: string): Promise<LoadedPage>;
  /** Records a document the plugin just wrote, so the next load is warm. */
  remember(session: string, html: string): Promise<CachedPage>;
  /** The revision last seen for a session, without touching the host. */
  knownRevision(session: string): string | null;
}

const KV_PREFIX = "cache:";

export function createPageStore(host: SessionHost, resolve?: PageResolver): PageStore {
  const memory = new Map<string, CachedPage>();
  let memoryBytes = 0;

  function cost(page: CachedPage): number {
    return Buffer.byteLength(page.html, "utf8") + 128;
  }

  function retain(session: string, page: CachedPage): void {
    const previous = memory.get(session);
    if (previous) {
      memoryBytes -= cost(previous);
      memory.delete(session);
    }
    memory.set(session, page);
    memoryBytes += cost(page);
    while (memory.size > LIMITS.offlineCacheEntries || memoryBytes > LIMITS.offlineCacheBytes) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      const evicted = memory.get(oldest);
      memory.delete(oldest);
      if (evicted) memoryBytes -= cost(evicted);
    }
  }

  async function persist(session: string, page: CachedPage, previousRevision: string | undefined): Promise<void> {
    if (previousRevision === page.revision) return;
    const key = KV_PREFIX + session;
    const bytes = Buffer.byteLength(page.html, "utf8");
    if (bytes > LIMITS.offlineCopyBytes) {
      // Silently dropping this is how a page stops opening offline with no
      // author ever learning why. Carrying a page's own files into the
      // document makes it much easier to cross. spec R2.27-R2.31
      host.log.warn(
        `offline copy: ${session} is ${Math.round(bytes / 1024)} KiB, over the ${LIMITS.offlineCopyBytes / 1024} KiB limit — ` +
          "the page will not open while its host is unreachable",
      );
      await host.kv.delete(key).catch((error: unknown) => host.log.warn(`offline copy: could not clear ${session}: ${errorText(error)}`));
      return;
    }
    await host.kv.set(key, { html: page.html, revision: page.revision, updatedAtMs: page.updatedAtMs }).catch((error: unknown) => {
      host.log.warn(`offline copy: could not store ${session}: ${errorText(error)}`);
    });
  }

  async function cached(session: string): Promise<CachedPage | null> {
    const resident = memory.get(session);
    if (resident) return resident;
    try {
      const stored = await host.kv.get(KV_PREFIX + session);
      if (!isCachedPage(stored)) return null;
      retain(session, stored);
      return stored;
    } catch (error) {
      host.log.warn(`offline copy: could not read ${session}: ${errorText(error)}`);
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
    async load(session) {
      let content;
      try {
        const location = await host.sessions.storage(session);
        content = await host.files.read(location, ENTRY_FILE);
      } catch (error) {
        const fallback = await cached(session);
        if (fallback) return { ...fallback, stale: true, site: { resolved: 0, skipped: [] } };
        throw PageError.is(error) ? error : new PageError("unavailable", PUBLIC_MESSAGES.unavailable, { cause: error });
      }
      if (!content) throw new PageError("no_page", PUBLIC_MESSAGES.noPage);
      if (content.bytes.byteLength > LIMITS.entryDocumentBytes) {
        throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
      }
      const authored = Buffer.from(content.bytes).toString("utf8");
      let html = authored;
      let site: LoadedPage["site"] = { resolved: 0, skipped: [] };
      if (resolve) {
        try {
          const outcome = await resolve(session, authored);
          html = outcome.html;
          site = { resolved: outcome.resolved.length, skipped: outcome.skipped };
          for (const file of outcome.skipped) {
            host.log.warn(`page ${session}: ${file.path} is referenced but was not carried into the document (${file.reason})`);
          }
        } catch (error) {
          // A page that renders without its own files beats a page that does
          // not render. Serve what the agent wrote.
          host.log.warn(`page ${session}: could not resolve its own files: ${errorText(error)}`);
        }
      }
      const page: CachedPage = { html, revision: revisionOf(html), updatedAtMs: content.modifiedAtMs ?? Date.now() };
      const previous = memory.get(session)?.revision;
      retain(session, page);
      await persist(session, page, previous);
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
