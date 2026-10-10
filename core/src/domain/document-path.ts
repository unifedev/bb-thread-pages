// `ENTRY_DOCUMENT`, `UPLOAD_DIR`, `isDocumentPath`, `isPartPath`, `directoryOf`, `documentKey`, `documentFragment`, `checkDocumentQuery`, `RESERVED_QUERY_NAMES` (`session`, `path`, `render`).
import { LIMITS } from "./limits.ts";

/** The entry document of a page. 01 §The page root */
export const ENTRY_DOCUMENT = "index.html";
/** Where uploads land inside the page root. 02 R4.21, R4.22 */
export const UPLOAD_DIR = "uploads";

function isHtmlPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/") || path.startsWith(`${UPLOAD_DIR}/`)) return false;
  if (!path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")) return false;
  return /\.html?$/i.test(path);
}

/** A part: an HTML file a document includes at serve time — any HTML path with a segment beginning with `_`. 01 R1.20 */
export function isPartPath(path: unknown): path is string {
  return isHtmlPath(path) && path.split("/").some((segment) => segment.startsWith("_"));
}

/** A document of the page: an HTML file in the root that a link can open inside the page; a part is never one. 01 R1.12a–R1.12e */
export function isDocumentPath(path: unknown): path is string {
  return isHtmlPath(path) && !isPartPath(path);
}

/** The directory of a document, with a trailing slash; "" for the page root. 01 R1.22 */
export function directoryOf(path: string | null | undefined): string {
  if (!path) return "";
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

/** null for the entry document, so "no path" and "index.html" are one document. 01 R1.12a */
export function documentKey(path: string | null | undefined): string | null {
  return !path || path === ENTRY_DOCUMENT ? null : path;
}

/** A document's `#fragment` as the shell carries it: "#…" within `fragmentChars`, else "". It never reaches the server. 01 R1.12f */
export function documentFragment(value: unknown): string {
  return typeof value === "string" && value.length > 1 && value.length <= LIMITS.fragmentChars && value.startsWith("#") ? value : "";
}

/** Query names the host's own document URL uses; a document's query may not. 01 R1.12g, 05 §Routes */
export const RESERVED_QUERY_NAMES: readonly string[] = ["session", "path", "render"];

export type QueryCheck = { readonly ok: true; readonly query: string } | { readonly ok: false; readonly message: string };

/**
 * A document's `?query`: "" for none, or `?` and at most `documentQueryChars`
 * characters with no `#`, whitespace or control characters, using none of
 * the host's names. 01 R1.12g
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

/** A document's URL relative to the page root, as an address's `path` carries it: its path, then its query. 01 R1.12g */
export function splitDocumentUrl(raw: string): { path: string; query: string } {
  const mark = raw.indexOf("?");
  return mark < 0 ? { path: raw, query: "" } : { path: raw.slice(0, mark), query: raw.slice(mark) };
}
