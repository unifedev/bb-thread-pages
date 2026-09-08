/**
 * How a page's site reaches the reader. spec R1.2, R1.3; rewrite RW-1
 *
 * The document is always served by this plugin (it needs the kernel). Where
 * its files come from depends on what the host's router can do:
 *
 * - `core-storage`: the host already serves the session's storage as a site
 *   at a stable path; the document gets one same-origin `<base>` so relative
 *   references resolve there. This is what bb 0.42.1 allows.
 * - `plugin-prefix`: the plugin serves `/page/<id>/…` itself; the document
 *   URL is path-shaped and no base is needed. Available once the host's
 *   plugin router matches prefixes.
 */
export interface SiteStrategy {
  readonly name: "core-storage" | "plugin-prefix";
  /** Origin-relative URL the shell loads into the iframe. */
  documentUrl(session: string): string;
  /** Same-origin `<base href>` to inject, or null when the document URL is path-shaped. */
  baseHref(session: string): string | null;
}

export function createCoreStorageSite(routeBase: string, storageFilesBase: (session: string) => string): SiteStrategy {
  return {
    name: "core-storage",
    documentUrl: (session) => `${routeBase}/document?session=${encodeURIComponent(session)}`,
    baseHref: (session) => storageFilesBase(session),
  };
}

export function createPluginPrefixSite(routeBase: string): SiteStrategy {
  return {
    name: "plugin-prefix",
    documentUrl: (session) => `${routeBase}/page/${encodeURIComponent(session)}/`,
    baseHref: () => null,
  };
}
