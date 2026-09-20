/**
 * The documents of a page: its entry document, and any other HTML file in its
 * root that a link can open inside the page. Pure, so the server, the kernel
 * and the shell apply one rule. spec R1.12a–R1.12d, DECISIONS D15
 */
export const ENTRY_DOCUMENT = "index.html";
const UPLOADS = "uploads/";

function isHtmlPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/") || path.startsWith(UPLOADS)) return false;
  if (!path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")) return false;
  return /\.html?$/i.test(path);
}

/**
 * A part: an HTML file a document includes at serve time. It is any HTML path
 * with a segment beginning with `_`, so the rule is a function of the path
 * alone and the server, the kernel and the shell agree. spec R1.20, DECISIONS D32
 */
export function isPartPath(path: unknown): path is string {
  return isHtmlPath(path) && path.split("/").some((segment) => segment.startsWith("_"));
}

/** A part is never a document of the page. spec R1.12e */
export function isDocumentPath(path: unknown): path is string {
  return isHtmlPath(path) && !isPartPath(path);
}

/** The directory of a document, with a trailing slash; "" for the page root. */
export function directoryOf(path: string | null | undefined): string {
  if (!path) return "";
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

/** null for the entry document, so "no path" and "index.html" are one document. */
export function documentKey(path: string | null | undefined): string | null {
  return !path || path === ENTRY_DOCUMENT ? null : path;
}
