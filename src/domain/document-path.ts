/**
 * The documents of a page: its entry document, and any other HTML file in its
 * root that a link can open inside the page. Pure, so the server, the kernel
 * and the shell apply one rule. spec R1.12a–R1.12d, DECISIONS D15
 */
export const ENTRY_DOCUMENT = "index.html";
const UPLOADS = "uploads/";

export function isDocumentPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/") || path.startsWith(UPLOADS)) return false;
  if (!path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")) return false;
  return /\.html?$/i.test(path);
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
