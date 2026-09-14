import { revisionOf } from "../domain/revision.ts";
import { BUILTIN_HOME_HTML } from "../generated/builtin-home.ts";
import type { SessionRecord } from "../host/types.ts";
import type { LoadedPage } from "../pages/page-store.ts";

/**
 * The built-in home page: served at `/home` while no page is designated as
 * home. It is a page document like any other — same sandbox, kernel and
 * capabilities — under a reserved identity of its own, so its action token,
 * its `storage` namespace and its revision belong to no session and it can
 * act as none. spec R7.9–R7.10, R5.18a, DECISIONS D14
 */
export const BUILTIN_HOME_ID = "tp-builtin-home";
export const BUILTIN_HOME_TITLE = "Sessions";

export function isBuiltinHome(session: string): boolean {
  return session === BUILTIN_HOME_ID;
}

export const BUILTIN_HOME_PAGE: LoadedPage = Object.freeze({
  html: BUILTIN_HOME_HTML,
  revision: revisionOf(BUILTIN_HOME_HTML),
  updatedAtMs: 0,
  stale: false,
  site: Object.freeze({ resolved: 0, skipped: Object.freeze([]) }),
});

/** Stands in for an owner where a handler needs one; never sent to the host. */
export const BUILTIN_HOME_SESSION: SessionRecord = Object.freeze({
  id: BUILTIN_HOME_ID,
  title: BUILTIN_HOME_TITLE,
  projectId: null,
  state: "idle",
  visibility: "visible",
  parentId: null,
  forkOfId: null,
  archived: false,
  deleted: false,
  updatedAtMs: 0,
  attentionAtMs: 0,
  unread: false,
  pinned: false,
  environmentId: null,
});

/** Capabilities that act on a page's own session, which the built-in home does not have. */
export const SESSIONLESS_CAPABILITIES: ReadonlySet<string> = new Set(["session.reply", "session.activity", "projects.browse", "projects.create"]);

export const BUILTIN_HOME_REFUSAL = "The built-in home page has no session of its own, so it cannot use this capability.";
