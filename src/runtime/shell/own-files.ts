import { isDocumentPath } from "../../domain/document-path.ts";
import { baseName, downloadName, encodeFilePath, isOpenableInTab, isOwnFilePath, shellFetchLimit } from "../../domain/own-files.ts";
import { mebibytes } from "../../domain/limits.ts";
import { isValidRequestId, type ShellConfig, type ShellMessage } from "../shared/protocol.ts";
import type { Confirmer } from "./confirm.ts";

/**
 * The page's own files, acted on by the shell from its own origin, which
 * carries the reader's credential — the frame's own requests carry none.
 * spec R4.15b, R4.25a, DECISIONS D33, D37
 *
 * - A link with `download`: the shell downloads the file under the name the
 *   page gave. A download across origins is ignored by the browser, so the
 *   frame cannot do it itself.
 * - A link without: the shell opens the file in a new tab at the host's own
 *   address — a top-level navigation, so the credential goes with it. Only a
 *   type that cannot run script there opens; anything else is downloaded.
 * - A large media file the document could not carry: the shell fetches it
 *   and hands the frame the bytes (D37; delete with large-media.ts).
 *
 * Every path is checked again here: inside the page root, never a document
 * (those open in place), never a part.
 */
export interface OwnFiles {
  open(path: unknown, download: unknown, name: unknown): void;
  fetchFor(port: MessagePort, id: unknown, path: unknown): Promise<void>;
}

const OPEN_WORDING = { heading: "Open this file?", confirmLabel: "Open", cancelLabel: "Cancel" };

/** A file name for the shell's own question: the host-validated path's last segment, bounded. */
function shownName(path: string): string {
  const name = baseName(path).replace(/[\u0000-\u001f\u007f“”"]/g, "");
  return name.length <= 60 ? name : `${name.slice(0, 59)}…`;
}

/**
 * `confirmer`: the shell's trusted dialog, for when the browser refuses the
 * window because the reader's click did not reach the shell — measured on iPhone
 * Safari over bb Connect (1.6.0): the page's click arrives as a message, too
 * late for a popup. Its Open button is a click of the shell's own.
 */
export function createOwnFiles(win: Window & typeof globalThis, config: ShellConfig, fetchImpl: typeof fetch, confirmer?: Confirmer): OwnFiles {
  /** Opens a tab, or null when the browser refused it. Not `noopener`, which always returns null; the opener is dropped instead. */
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
        // The tab is ours; a browser that refuses this still gave it no script to run (passive types only).
      }
    }
    return opened;
  }

  /**
   * A tab now; if refused, the shell's own question, whose Open click opens it;
   * if that is refused too, the file in place of the shell — Back returns.
   */
  function openTab(url: string, path: string): void {
    if (tryOpen(url)) return;
    if (!confirmer) {
      win.location.assign(url);
      return;
    }
    let opened = false;
    void confirmer
      .confirm(`Open “${shownName(path)}” in a new tab?`, () => {
        opened = tryOpen(url) !== null;
      }, OPEN_WORDING)
      .then((approved) => {
        if (approved && !opened) win.location.assign(url);
      });
  }

  function urlOf(path: string): string | null {
    return config.filesUrl ? `${config.filesUrl}${encodeFilePath(path)}` : null;
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

  return {
    open(path, download, name) {
      if (!isOwnFilePath(path) || (isDocumentPath(path) && download !== true)) return;
      const url = urlOf(path);
      if (!url) return;
      if (download === true || !isOpenableInTab(path)) {
        save(url, (typeof name === "string" ? downloadName(name) : null) ?? baseName(path));
        return;
      }
      openTab(url, path);
    },

    async fetchFor(port, id, path) {
      if (!isValidRequestId(id)) return;
      const reply = (message: ShellMessage) => port.postMessage(message);
      const fail = (error: string) => reply({ kind: "thread-page:file", id, ok: false, error });
      if (!isOwnFilePath(path) || isDocumentPath(path)) return fail("Not one of this page's files");
      const url = urlOf(path);
      if (!url) return fail("This page has no files of its own");
      const limit = shellFetchLimit(path);
      try {
        const response = await fetchImpl(url, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return fail(response.status === 404 ? "The file does not exist" : `The host answered ${response.status}`);
        const declared = Number(response.headers.get("content-length") ?? "");
        if (Number.isFinite(declared) && declared > limit) return fail(`Larger than ${mebibytes(limit)}, the most the host reads`);
        const blob = await response.blob();
        if (blob.size > limit) return fail(`Larger than ${mebibytes(limit)}, the most the host reads`);
        reply({ kind: "thread-page:file", id, ok: true, blob });
      } catch (error) {
        fail(error instanceof Error && error.message ? error.message.slice(0, 200) : "The file could not be fetched");
      }
    },
  };
}

