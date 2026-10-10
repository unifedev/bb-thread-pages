// Open/download own files with the reader's credential (02 R4.15b), the `file-request` answers for large media and for own-file `fetch` (05 R-S7a, R4.25a).
import { isDocumentPath } from "../../domain/document-path.ts";
import { mebibytes } from "../../domain/limits.ts";
import { baseName, downloadName, encodeFilePath, isOpenableInTab, isOwnFilePath, shellFetchLimit } from "../../domain/own-files.ts";
import type { ShellConfig, ShellMessage } from "../shared/protocol.ts";
import { OPEN_WORDING, type Confirmer } from "./confirm.ts";

export interface OwnFiles {
  open(path: string, download: boolean, name: string | null): void;
  /** Answers a `file-request` on the port. */
  fetchFor(post: (message: ShellMessage) => void, request: { id: string; path: string; purpose: "media" | "fetch"; init?: { method: "GET" | "HEAD" } }): Promise<void>;
  /** The URL of an own file at the host's own address, or null when the host serves none by URL. */
  urlOf(path: string): string | null;
}

export function shownName(path: string): string {
  const name = baseName(path).replace(/[\u0000-\u001f\u007f“”"​-‏‪-‮⁦-⁩]/g, "");
  return name.length <= 60 ? name : `${name.slice(0, 59)}…`;
}

const OPEN_SETTLE_MS = 400;

/** The file variant of the document route (carried strategy): `GET /document?session=<id>&file=<relative>`, the reader's credential alone. 05 R-S7a; DESIGN §C.4 */
export function fileUrlOf(config: Pick<ShellConfig, "filesUrl" | "documentUrl">, path: string): string | null {
  if (config.filesUrl) return `${config.filesUrl}${encodeFilePath(path)}`;
  const mark = config.documentUrl.indexOf("?");
  if (mark < 0) return null;
  const session = new URLSearchParams(config.documentUrl.slice(mark + 1)).get("session");
  if (session === null) return null;
  return `${config.documentUrl.slice(0, mark)}?session=${encodeURIComponent(session)}&file=${encodeURIComponent(path)}`;
}

export function createOwnFiles(win: Window & typeof globalThis, config: ShellConfig, fetchImpl: typeof fetch, confirmer: Confirmer, settleMs = OPEN_SETTLE_MS): OwnFiles {
  function tryOpen(url: string): Window | null {
    let opened: Window | null = null;
    try {
      opened = win.open(url, "_blank");
    } catch {
      opened = null;
    }
    if (opened) {
      try {
        opened.opener = null;
      } catch {
        // Passive types only open here.
      }
    }
    return opened;
  }

  function stillHere(): boolean {
    const doc = win.document;
    return doc.visibilityState === "visible" && (typeof doc.hasFocus !== "function" || doc.hasFocus());
  }

  /** A tab now; a refused window is asked about in the shell's own dialog when the shell still has focus. 02 R4.15b */
  function openTab(url: string, path: string): void {
    if (tryOpen(url)) return;
    win.setTimeout(() => {
      if (!stillHere()) return;
      let opened = false;
      void confirmer
        .confirm(`Open “${shownName(path)}” in a new tab?`, {
          wording: OPEN_WORDING,
          onConfirmGesture: () => {
            opened = tryOpen(url) !== null;
          },
        })
        .then((approved) => {
          if (approved && !opened) {
            win.setTimeout(() => {
              if (stillHere()) win.location.assign(url);
            }, settleMs);
          }
        });
    }, settleMs);
  }

  function save(url: string, name: string): void {
    const doc = win.document;
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    doc.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  }

  const urlOf = (path: string) => fileUrlOf(config, path);

  return {
    urlOf,
    open(path, download, name) {
      // Checked again here: inside the root, a document only downloaded, only passive types opened. 02 R4.15b
      if (!isOwnFilePath(path) || (isDocumentPath(path) && !download)) return;
      const url = urlOf(path);
      if (!url) return;
      if (download || !isOpenableInTab(path)) {
        save(url, (name ? downloadName(name) : null) ?? baseName(path));
        return;
      }
      openTab(url, path);
    },
    async fetchFor(post, request) {
      const { id, path } = request;
      const fail = (status: number, error: string) => post({ kind: "thread-page:file", id, ok: false, status, error });
      if (!isOwnFilePath(path)) return fail(400, "Not a file of this page");
      if (request.purpose === "media" && !config.deferredFiles.includes(path)) return fail(400, "Not a file this document defers");
      const url = urlOf(path);
      if (!url) return fail(404, "This page has no files of its own");
      const limit = shellFetchLimit(path);
      try {
        const response = await fetchImpl(url, { method: request.init?.method ?? "GET", credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return fail(response.status, response.status === 404 ? "The file does not exist" : `The host answered ${response.status}`);
        const declared = Number(response.headers.get("content-length") ?? "");
        if (Number.isFinite(declared) && declared > limit) return fail(413, `Larger than ${mebibytes(limit)}, the most the host reads`);
        const blob = await response.blob();
        if (blob.size > limit) return fail(413, `Larger than ${mebibytes(limit)}, the most the host reads`);
        post({ kind: "thread-page:file", id, ok: true, status: response.status, contentType: response.headers.get("content-type") ?? blob.type ?? "", blob });
      } catch (error) {
        fail(502, error instanceof Error && error.message ? error.message.slice(0, 200) : "The file could not be fetched");
      }
    },
  };
}
