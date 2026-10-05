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

/**
 * The document a page's address names: `path` is the document's URL relative
 * to the page root, its query included (`path=tool.html?scope=a`). spec R1.12d, R1.12g
 */
export function documentAddressFrom(context: Context): { path: string | null; query: string } {
  const raw = new URL(context.req.url).searchParams.get("path");
  if (raw === null || raw === "") return { path: null, query: "" };
  const { path, query } = splitDocumentUrl(raw);
  const checked = checkDocumentQuery(query);
  if (!checked.ok) throw new PageError("invalid_request", `That address's query cannot be carried: ${checked.message}.`);
  if (path === "" || path === ENTRY_DOCUMENT) return { path: null, query: checked.query };
  if (!isDocumentPath(path)) throw new PageError("invalid_request", "That is not a document of this page.");
  return { path: documentKey(path), query: checked.query };
}
