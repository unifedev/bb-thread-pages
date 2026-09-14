import { directoryOf } from "../domain/document-path.ts";

/**
 * How a page's site reaches the reader. spec R1.2, R1.3; rewrite RW-1
 *
 * A document is always served by this plugin (it needs the kernel). Where
 * its files come from depends on what the host's router can do:
 *
 * - `core-storage`: the host already serves the session's storage as a site
 *   at a stable path; the document gets one same-origin `<base>` — the
 *   document's own directory there — so relative references resolve. This is
 *   what bb 0.42.1 allows.
 * - `plugin-prefix`: the plugin serves `/page/<id>/…` itself; the document
 *   URL is path-shaped and no base is needed. Available once the host's
 *   plugin router matches prefixes.
 *
 * `path` names a document other than the entry document; null or absent is
 * the entry document. spec R1.12a–R1.12d
 */
export interface SiteStrategy {
  readonly name: "core-storage" | "plugin-prefix";
  /** Origin-relative URL the shell loads into the iframe. */
  documentUrl(session: string, path?: string | null): string;
  /** Same-origin `<base href>` to inject, or null when the document URL is path-shaped. */
  baseHref(session: string, path?: string | null): string | null;
  /** The URL every file of the page sits under, so the kernel can tell the page's own documents from other links. */
  siteRoot(session: string): string;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function createCoreStorageSite(routeBase: string, storageFilesBase: (session: string) => string): SiteStrategy {
  return {
    name: "core-storage",
    documentUrl: (session, path) => `${routeBase}/document?session=${encodeURIComponent(session)}${path ? `&path=${encodeURIComponent(path)}` : ""}`,
    baseHref: (session, path) => `${storageFilesBase(session)}${encodePath(directoryOf(path))}`,
    siteRoot: (session) => storageFilesBase(session),
  };
}

export function createPluginPrefixSite(routeBase: string): SiteStrategy {
  return {
    name: "plugin-prefix",
    documentUrl: (session, path) => `${routeBase}/page/${encodeURIComponent(session)}/${path ? encodePath(path) : ""}`,
    baseHref: () => null,
    siteRoot: (session) => `${routeBase}/page/${encodeURIComponent(session)}/`,
  };
}
