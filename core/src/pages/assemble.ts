// The one pipeline: includes → (strategy `carried`: own files inlined + large media marked) → kernel injection point; used by `/document`, `/page/*`, `/home-document` and `pages.read` (03 R5.56, 01 R1.19–R1.26, 05 R2.11).
import { directoryOf } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { utf8Bytes } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import { revisionOf } from "../domain/revision.ts";
import type { ProviderHost } from "../host/provider.ts";
import type { LoadedPage } from "../serving/stores.d.ts";
import { expandIncludes, type PageFileIo } from "./include.ts";
import { carryOwnFiles } from "./inline.ts";

export interface AssembledDocument {
  /** The document as served, before the kernel is injected: what the revision covers. 05 R2.11 */
  readonly html: string;
  readonly revision: string;
  readonly parts: readonly { path: string; bytes: number }[];
  readonly site: LoadedPage["site"];
}

function isProviderNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "ProviderError" && (error as { code?: unknown }).code === "not_found";
}

/** The provider's three file reads for one session, as assembly sees them: a missing file is null; an unreachable host throws through. 06 R-P10 */
export function pageFileIo(provider: ProviderHost, session: string): PageFileIo {
  return {
    async read(path) {
      try {
        return await provider.files.read(session, path);
      } catch (error) {
        if (isProviderNotFound(error)) return null;
        throw error;
      }
    },
    async stat(path) {
      try {
        return await provider.files.stat(session, path);
      } catch (error) {
        if (isProviderNotFound(error)) return null;
        throw error;
      }
    },
    async list(directory) {
      try {
        return await provider.files.list(session, directory);
      } catch (error) {
        if (isProviderNotFound(error)) return null;
        throw error;
      }
    },
  };
}

/**
 * Assembles one document of a page: its includes expanded from the
 * document's directory, then — under the carried strategy — its own files
 * carried in. The assembled document is bounded by `entryDocumentBytes` and
 * its revision is the digest of the result. 01 R1.7, R1.26; 05 R2.11; 03 R5.56
 */
export async function assembleDocument(io: PageFileIo, authored: string, path: string | null, strategy: "by-url" | "carried"): Promise<AssembledDocument> {
  const directory = directoryOf(path);
  const expanded = await expandIncludes(authored, io, directory);
  if (utf8Bytes(expanded.html) > LIMITS.entryDocumentBytes) throw new PageError("page_too_large", PUBLIC_MESSAGES.pageTooLarge);
  const skipped: { path: string; reason: string }[] = [...expanded.skipped];
  let html = expanded.html;
  let resolved = expanded.parts.length;
  let deferred: { path: string; bytes: number }[] = [];
  if (strategy === "carried") {
    const carried = await carryOwnFiles(html, io, directory);
    html = carried.html;
    resolved += carried.resolved.length;
    skipped.push(...carried.skipped);
    deferred = [...carried.deferred];
  }
  return { html, revision: revisionOf(html), parts: expanded.parts, site: { resolved, skipped, deferred } };
}
