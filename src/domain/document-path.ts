import { LIMITS } from "./limits.ts";

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

/**
 * A document's `#fragment` as the shell carries it: from the reader's address
 * to the document, from a link to the document it opens, and back to the
 * address when the document changes it. "" for none. It never reaches the
 * server. spec R1.12f, DECISIONS D41
 */
export function documentFragment(value: unknown): string {
  return typeof value === "string" && value.length > 1 && value.length <= LIMITS.fragmentChars && value.startsWith("#") ? value : "";
}

/** Query names the host's own document URL uses; a document's query may not. spec R1.12g */
export const RESERVED_QUERY_NAMES: readonly string[] = ["session", "path"];

export type QueryCheck = { readonly ok: true; readonly query: string } | { readonly ok: false; readonly message: string };

/**
 * A document's `?query`, as a link or an address gives it: "" for none, or
 * `?` and at most 2,048 characters with no `#`, whitespace or control
 * characters, using none of the host's names. Carried to the document, which
 * reads it as `location.search`. spec R1.12g, DECISIONS D43
 */
export function checkDocumentQuery(value: unknown): QueryCheck {
  if (value === undefined || value === null || value === "" || value === "?") return { ok: true, query: "" };
  if (typeof value !== "string" || !value.startsWith("?")) return { ok: false, message: "A document's query starts with ?" };
  if (value.length > LIMITS.documentQueryChars) return { ok: false, message: `A document's query is at most ${LIMITS.documentQueryChars} characters` };
  if (/[#\s\u0000-\u001f\u007f-\u009f]/.test(value)) return { ok: false, message: "A document's query has no #, spaces or control characters" };
  const names = new URLSearchParams(value);
  const reserved = RESERVED_QUERY_NAMES.find((name) => names.has(name));
  if (reserved) return { ok: false, message: `"${reserved}" is the host's own parameter; name yours differently` };
  return { ok: true, query: value };
}

/** A document's URL relative to the page root, as an address's `path` carries it: its path, then its query. */
export function splitDocumentUrl(raw: string): { path: string; query: string } {
  const mark = raw.indexOf("?");
  return mark < 0 ? { path: raw, query: "" } : { path: raw.slice(0, mark), query: raw.slice(mark) };
}

/** null for the entry document, so "no path" and "index.html" are one document. */
export function documentKey(path: string | null | undefined): string | null {
  return !path || path === ENTRY_DOCUMENT ? null : path;
}
