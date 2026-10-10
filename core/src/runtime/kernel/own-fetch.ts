// The `fetch` patch of 05 R-S7a: relative own-file URLs under the page root → `file-request` with `purpose: "fetch"`; everything else passes; off when `config.ownFilesByFrame`.
import { directoryOf } from "../../domain/document-path.ts";
import { ownFileReference } from "../../domain/own-files.ts";

export interface OwnFetchDeps {
  documentPath: string;
  /** The page root's URL when files are served by URL, else null. */
  rootUrl: string | null;
  /** Asks the shell for the file; resolves with its status, type and body, or null when the shell cannot. */
  request(path: string, method: "GET" | "HEAD"): Promise<{ ok: true; status: number; contentType: string; blob: Blob } | { ok: false; status: number; error: string }>;
}

/** The root-relative own-file path a `fetch` input names, or null when the request is not an own file. 05 R-S7a */
export function ownPathOf(input: unknown, deps: Pick<OwnFetchDeps, "documentPath" | "rootUrl">): string | null {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : typeof (input as Request)?.url === "string" ? (input as Request).url : null;
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (deps.rootUrl && trimmed.startsWith(deps.rootUrl)) {
    try {
      const target = new URL(trimmed);
      return ownFileReference(decodeURIComponent(target.pathname.slice(new URL(deps.rootUrl).pathname.length)), "");
    } catch {
      return null;
    }
  }
  if (trimmed === "" || trimmed.startsWith("/") || trimmed.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith("#") || trimmed.startsWith("?")) return null;
  return ownFileReference(trimmed, directoryOf(deps.documentPath));
}

export function installOwnFetch(win: Window & typeof globalThis, deps: OwnFetchDeps): void {
  // A test DOM has neither; a browser has both on the window.
  const original = typeof win.fetch === "function" ? win.fetch : globalThis.fetch;
  const ResponseOf = typeof win.Response === "function" ? win.Response : globalThis.Response;
  if (typeof original !== "function" || typeof ResponseOf !== "function") return;
  const patched = function fetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const path = ownPathOf(input, deps);
    const method = String(init?.method ?? (typeof input === "object" && input !== null && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    if (path === null || (method !== "GET" && method !== "HEAD")) return Reflect.apply(original, win, [input, init]);
    return deps.request(path, method as "GET" | "HEAD").then(async (answer) => {
      // The bytes, not the Blob: a Blob from the shell's realm is not this realm's. 05 R-S7a
      if (answer.ok) return new ResponseOf(method === "HEAD" ? null : await answer.blob.arrayBuffer(), { status: answer.status, headers: { "content-type": answer.contentType || "application/octet-stream" } });
      return new ResponseOf(null, { status: answer.status >= 400 ? answer.status : 502, statusText: answer.error.slice(0, 120) });
    });
  };
  try {
    Object.defineProperty(win, "fetch", { value: patched, writable: true, configurable: true });
  } catch {
    win.fetch = patched as typeof fetch;
  }
}
