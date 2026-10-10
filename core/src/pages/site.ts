// `SiteStrategy`: `by-url` (files present) vs `carried` (absent); `documentUrl(session, path, query, renderToken)`, `filesUrl(session)`; route prefix vs query (05 R-S7, R-S10; DESIGN §F.4).
import { directoryOf, ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { encodeFilePath } from "../domain/own-files.ts";
import type { SiteStrategy } from "../domain/site-strategy.ts";
import type { ServingHost } from "../host/serving.ts";

export type RouteStrategy = "prefix" | "exact";

/** The query a document's own `?…` becomes after the host's parameters: its `?` dropped, joined with `&`. 01 R1.12g */
function appendQuery(url: string, query: string): string {
  return query.length > 1 ? `${url}&${query.slice(1)}` : url;
}

/**
 * `by-url`: the document is served at its own path under `/page/<id>/`, so a
 * relative reference resolves by the browser's own rule and the host's
 * `files` route answers it; nothing is carried, nothing is injected. 05 §Routes
 */
export function createByUrlSite(base: string, files: NonNullable<ServingHost["files"]>): SiteStrategy {
  return {
    kind: "by-url",
    documentUrl: (session, path, query, renderToken) => appendQuery(`${base}/page/${encodeURIComponent(session)}/${encodeFilePath(path ?? ENTRY_DOCUMENT)}?render=${encodeURIComponent(renderToken)}`, query),
    siteRoot: (session, path) => `${base}${files.url(session, directoryOf(path))}`,
    filesUrl: (session) => `${base}${files.url(session, "")}`,
    fileUrl: (session, relativePath) => `${base}${files.url(session, relativePath)}`,
  };
}

/**
 * `carried`: the document is served from `/document?session=&path=` with its
 * own files carried inside it; a file the document could not carry is fetched
 * by the shell from the document route's file variant. 05 R-S7, R-S7a
 */
export function createCarriedSite(base: string): SiteStrategy {
  const documentBase = (session: string, path: string | null) => `${base}/document?session=${encodeURIComponent(session)}${path ? `&path=${encodeURIComponent(path)}` : ""}`;
  return {
    kind: "carried",
    documentUrl: (session, path, query, renderToken) => appendQuery(`${documentBase(session, path)}&render=${encodeURIComponent(renderToken)}`, query),
    siteRoot: () => null,
    filesUrl: () => null,
    fileUrl: (session, relativePath) => `${base}/document?session=${encodeURIComponent(session)}&file=${encodeURIComponent(relativePath)}`,
  };
}

/** The strategy a mount runs: prefix routes need the host's `files`; without it the server carries. DESIGN P2 */
export function createSiteStrategy(base: string, files: ServingHost["files"] | undefined, routeStrategy: RouteStrategy): SiteStrategy {
  if (routeStrategy === "prefix") {
    if (!files) throw new TypeError('routeStrategy "prefix" needs the serving host\'s `files`: without it the server carries own files and routes exactly');
    return createByUrlSite(base, files);
  }
  return createCarriedSite(base);
}
