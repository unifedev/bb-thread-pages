import { directoryOf } from "../domain/document-path.ts";
import type { SessionHost } from "../host/contract.ts";
import { expandIncludes } from "./include.ts";
import { resolveOwnFiles } from "./inline.ts";
import type { PageResolver } from "./page-store.ts";

/**
 * The one pipeline a document goes through before it is served — at its own
 * URL, and through `pages.read` alike: its parts are included, then its own
 * files are carried in. spec R1.19–R1.26, R5.56
 */
export function createAssembler(host: SessionHost): PageResolver {
  return async (session, html, path) => {
    const location = await host.sessions.storage(session);
    const read = async (relativePath: string) => {
      const file = await host.files.read(location, relativePath);
      return file ? { bytes: file.bytes, sha256: file.sha256 } : null;
    };
    const directory = directoryOf(path);
    const expanded = await expandIncludes(html, { read, list: (dir) => host.files.list(location, dir) }, directory);
    // Strategy A cannot serve a sandboxed document's own files on an
    // authenticated origin, so the document carries them. Delete this pass, and
    // pages/inline.ts, once the host can authorise them.
    const carried = await resolveOwnFiles(expanded.html, read, directory);
    return { html: carried.html, resolved: [...expanded.parts, ...carried.resolved], skipped: [...expanded.skipped, ...carried.skipped], ...(carried.deferred ? { deferred: carried.deferred } : {}) };
  };
}
