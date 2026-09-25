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
 * Every path is checked again here: inside the page root; a document of the
 * page is only downloaded (it opens in place otherwise); only types that cannot
 * run script on the host's origin open in a tab; and only a file the served
 * document deferred is fetched.
 */
export interface OwnFiles {
  open(path: unknown, download: unknown, name: unknown): void;
  fetchFor(port: MessagePort, id: unknown, path: unknown): Promise<void>;
}

const OPEN_WORDING = { heading: "Open this file?", confirmLabel: "Open", cancelLabel: "Cancel" };

/**
 * A file name for the shell's own question: the host-validated path's last
 * segment, bounded, without control, quote, bidi or zero-width characters, so
 * a name cannot reorder or close the host's own sentence.
 */
export function shownName(path: string): string {
  const name = baseName(path).replace(/[\u0000-\u001f\u007f“”"\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  return name.length <= 60 ? name : `${name.slice(0, 59)}…`;
}

/** How long an embedder has to take focus after handling a popup itself, before a refusal is assumed. */
const OPEN_SETTLE_MS = 400;

/**
 * `confirmer`: the shell's trusted dialog, for when the browser refuses the
 * window because the reader's click did not reach the shell — seen on iPhone
 * Safari over bb Connect (1.6.0): the page's click arrives as a message, too
 * late for a popup. Its Open button is a click of the shell's own.
 */
export function createOwnFiles(win: Window & typeof globalThis, config: ShellConfig, fetchImpl: typeof fetch, confirmer: Confirmer, settleMs = OPEN_SETTLE_MS): OwnFiles {
  /** Opens a tab and returns it, or null. Not `noopener`, which always returns null; the opener is dropped instead. */
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
   * Whether the shell still has the reader's attention. `null` from
   * `window.open` does not mean refused: the bb app and its in-app browser
   * open the URL themselves and deny the window
   * (get-bb/bb apps/desktop/src/desktop-window-factory.ts,
   * `setWindowOpenHandler` → `openExternalUrl`, `{ action: "deny" }`;
   * desktop-browser-view.ts likewise). Whatever opened it takes focus; a
   * browser that silently blocked the popup leaves it here.
   */
  function stillHere(): boolean {
    const doc = win.document;
    return doc.visibilityState === "visible" && (typeof doc.hasFocus !== "function" || doc.hasFocus());
  }

  /** Runs `then` after the settle time, only if the shell still has the reader's attention. */
  function ifStillHere(then: () => void): void {
    win.setTimeout(() => {
      if (stillHere()) then();
    }, settleMs);
  }

  /**
   * A tab now. If `window.open` gave nothing and, a moment later, the shell
   * still has focus, it asks in its own dialog, whose Open click opens the
   * tab. If that gave nothing too — and again the shell keeps focus, since the
   * bb app answers null there as well — the file opens in place of the shell
   * and Back returns.
   */
  function openTab(url: string, path: string): void {
    if (tryOpen(url)) return;
    ifStillHere(() => {
      let opened = false;
      void confirmer
        .confirm(`Open “${shownName(path)}” in a new tab?`, () => {
          opened = tryOpen(url) !== null;
        }, OPEN_WORDING)
        .then((approved) => {
          if (approved && !opened) ifStillHere(() => win.location.assign(url));
        });
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
      if (!isOwnFilePath(path) || isDocumentPath(path) || !config.deferredFiles.includes(path)) return fail("Not a file this document defers");
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

