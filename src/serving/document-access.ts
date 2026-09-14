import type { Context } from "hono";
import { documentKey, ENTRY_DOCUMENT, isDocumentPath } from "../domain/document-path.ts";
import { PageError } from "../domain/errors.ts";

/** Which document of a page a request names; null for the entry document. spec R1.12d */
export function documentPathFrom(context: Context): string | null {
  const raw = new URL(context.req.url).searchParams.get("path");
  if (raw === null || raw === "" || raw === ENTRY_DOCUMENT) return null;
  if (!isDocumentPath(raw)) throw new PageError("invalid_request", "That is not a document of this page.");
  return documentKey(raw);
}
