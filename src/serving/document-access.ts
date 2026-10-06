import type { Context } from "hono";
import { checkDocumentQuery, documentKey, ENTRY_DOCUMENT, isDocumentPath, splitDocumentUrl } from "../domain/document-path.ts";
import { PageError } from "../domain/errors.ts";

/** Which document of a page a request names; null for the entry document. spec R1.12d */
export function documentPathFrom(context: Context): string | null {
  const raw = new URL(context.req.url).searchParams.get("path");
  if (raw === null || raw === "" || raw === ENTRY_DOCUMENT) return null;
  if (!isDocumentPath(raw)) throw new PageError("invalid_request", "That is not a document of this page.");
  return documentKey(raw);
}

/** The parameters a page's address uses itself; any other is the document's own. */
export const ADDRESS_NAMES: ReadonlySet<string> = new Set(["session", "path", "threadId"]);

/**
 * The document a page's address names: `path` is the document's URL relative
 * to the page root, its query included (`path=tool.html?scope=a`). spec R1.12d, R1.12g
 */
export function documentAddressFrom(context: Context): { path: string | null; query: string } {
  const params = new URL(context.req.url).searchParams;
  const raw = params.get("path") ?? "";
  const { path, query: written } = splitDocumentUrl(raw);
  // A query typed with a raw `&` (`path=tool.html?scope=a&view=grid`) arrives as further address parameters:
  // any the host does not use are the document's, in order. spec R1.12g
  const folded = [...params.entries()].filter(([name]) => !ADDRESS_NAMES.has(name)).map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value).replace(/%2F/gi, "/")}`);
  const query = folded.length === 0 ? written : `${written || "?"}${written && written !== "?" ? "&" : ""}${folded.join("&")}`;
  if (path === "" && query === "") return { path: null, query: "" };
  const checked = checkDocumentQuery(query);
  if (!checked.ok) throw new PageError("invalid_request", `That address's query cannot be carried: ${checked.message}.`);
  if (path === "" || path === ENTRY_DOCUMENT) return { path: null, query: checked.query };
  if (!isDocumentPath(path)) throw new PageError("invalid_request", "That is not a document of this page.");
  return { path: documentKey(path), query: checked.query };
}
