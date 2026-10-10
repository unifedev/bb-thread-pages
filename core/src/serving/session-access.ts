// `sessionFor(id)`: `not_found` for null, `ineligible` for an ineligible live session, `archived` marker for an archived one with a page; and the one page view every GET route shares (05 R2.5, U21; DESIGN §F.3).
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { HOME_IDENTITY, isSessionId } from "../domain/ids.ts";
import { EMPTY_REVISION, revisionOf } from "../domain/revision.ts";
import type { ProviderHost } from "../host/provider.ts";
import type { PageSource } from "../runtime/shared/envelopes.ts";
import type { SessionAccess } from "./context.ts";
import { BUILTIN_HOME_HTML } from "../generated/builtin-home.ts";
import type { LoadedPage, PageStore } from "./stores.d.ts";

/** Which session a request names: the home's identity, a live record with its eligibility, an archived record, or `not_found`. 05 R2.5; 01 §Eligibility */
export function createSessionAccess(provider: ProviderHost): (id: string) => Promise<SessionAccess> {
  return async (id) => {
    if (id === HOME_IDENTITY) return { kind: "home" };
    if (!isSessionId(id)) throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
    const record = await provider.sessions.get(id);
    if (record === null) throw new PageError("not_found", PUBLIC_MESSAGES.deleted);
    return { kind: "session", record, eligible: provider.sessions.isEligible(record), archived: record.archived };
  };
}

/** A session that may have a page: eligible, or archived with the page it already had (U21). Anything else has none. 05 R2.5 */
export function requirePageSession(access: SessionAccess): asserts access is Extract<SessionAccess, { kind: "session" }> {
  if (access.kind !== "session") throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  if (!access.eligible && !access.archived) throw new PageError("ineligible", PUBLIC_MESSAGES.ineligible);
  if (!access.record.visible) throw new PageError("ineligible", PUBLIC_MESSAGES.ineligible);
}

let home: LoadedPage | null = null;

/** The built-in home page as a loaded page: one fixed revision, no site report, never stale. 05 R-S12 */
export function homePage(): LoadedPage {
  home ??= { html: BUILTIN_HOME_HTML, revision: revisionOf(BUILTIN_HOME_HTML), updatedAtMs: 0, path: null, stale: false, archived: false, site: { resolved: 0, skipped: [], deferred: [] } };
  return home;
}

/** What the shell, the document route and the poll agree on about one document. */
export interface PageView {
  readonly page: LoadedPage | null;
  readonly revision: string;
  readonly source: PageSource;
  readonly empty: boolean;
  readonly archived: boolean;
  readonly stale: boolean;
  readonly deferredFiles: string[];
  readonly working: boolean;
}

/** The entry document, or null while the agent has not written it yet. 04 R6.19 */
export async function loadUnlessUnwritten(pages: PageStore, session: string): Promise<LoadedPage | null> {
  try {
    return await pages.load(session, null);
  } catch (error) {
    if (PageError.is(error) && error.code === "no_page") return null;
    throw error;
  }
}

/** The view of one document of a session's page; another document than the entry must exist. 05 R2.5, R2.28; 02 R-K8 */
export async function loadPageView(pages: PageStore, access: SessionAccess, path: string | null): Promise<PageView> {
  if (access.kind === "home") {
    const page = homePage();
    return { page, revision: page.revision, source: "live", empty: false, archived: false, stale: false, deferredFiles: [], working: false };
  }
  const id = access.record.id;
  const page = path === null ? await loadUnlessUnwritten(pages, id) : await pages.load(id, path);
  const archived = access.archived;
  const stale = page?.stale ?? false;
  return {
    page,
    revision: page?.revision ?? EMPTY_REVISION,
    source: archived ? "archived" : stale ? "offline" : "live",
    empty: page === null,
    archived,
    stale,
    deferredFiles: (page?.site.deferred ?? []).map((file) => file.path),
    working: access.record.state === "working",
  };
}
