// `SiteStrategy`: how a document and its own files are addressed (05 R-S7, R-S10); the interface slice 2's `src/pages/site.ts` implements (DESIGN §F.4).

/** The two ways a page's own files reach the reader: served by URL under `/page/<id>/`, or carried inside the document. 05 R-S7, R-S10 */
export interface SiteStrategy {
  readonly kind: "by-url" | "carried";
  /** The document load URL with its render token, relative to base(). */
  documentUrl(session: string, path: string | null, query: string, renderToken: string): string;
  /** by-url: `files.url(session, directoryOf(path))`; carried: null. */
  siteRoot(session: string, path: string | null): string | null;
  /** by-url: `files.url(session, "")`; carried: null. */
  filesUrl(session: string): string | null;
  /** by-url: `files.url(session, relativePath)`; carried: the document route's file variant. */
  fileUrl(session: string, relativePath: string): string | null;
}
