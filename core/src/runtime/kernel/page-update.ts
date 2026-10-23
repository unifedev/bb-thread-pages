// `threadPage.onPageUpdate(cb)`: a document that shows its own new version; the host's scripts left out of the handed page, the revision taken, a throwing callback logged (02 R4.66, R4.33; 05 R2.18).
import { CONTRIBUTOR_SCRIPT_ATTRIBUTE, KERNEL_ATTRIBUTE } from "../../domain/html/markers.ts";
import type { KernelMessage, ShellMessage } from "../shared/protocol.ts";

export interface PageUpdate {
  html: string;
  revision: string;
  documentPath: string;
}

export interface PageUpdates {
  /** Registers a callback; the returned function stops it. While one is registered the document is handed its new versions instead of being swapped. */
  register(callback: unknown): () => void;
  /** A hand-over from the shell (or the embedding kernel): answered `page-updated`, `ok: false` when no callback is registered any more. */
  receive(message: Extract<ShellMessage, { kind: "thread-page:page-update" }>): void;
}

export interface PageUpdateDeps {
  send(message: KernelMessage): void;
  /** The document takes the new revision: answers and drafts are written against it from now on. */
  take(revision: string): void;
  log(error: unknown): void;
}

/**
 * The page as the host would serve it, without what the host put in: the
 * kernel script, the `<base>` right before it, and the contributors' page
 * scripts right after it. The rest is the document as parsed. 02 R4.66
 */
export function withoutHostScripts(win: Window & typeof globalThis, html: string): string {
  const parsed = new win.DOMParser().parseFromString(html, "text/html");
  const kernel = parsed.querySelector(`script[${KERNEL_ATTRIBUTE}]`);
  if (kernel) {
    const before = kernel.previousElementSibling;
    if (before && before.tagName.toLowerCase() === "base" && before.previousElementSibling === null) before.remove();
    let after = kernel.nextElementSibling;
    while (after && after.tagName.toLowerCase() === "script" && after.hasAttribute(CONTRIBUTOR_SCRIPT_ATTRIBUTE)) {
      const next = after.nextElementSibling;
      after.remove();
      after = next;
    }
    kernel.remove();
  }
  const doctype = parsed.doctype ? `<!DOCTYPE ${parsed.doctype.name}>` : "";
  return doctype + (parsed.documentElement?.outerHTML ?? "");
}

export function createPageUpdates(win: Window & typeof globalThis, deps: PageUpdateDeps): PageUpdates {
  const callbacks = new Set<{ callback: (update: PageUpdate) => void }>();

  return {
    register(callback) {
      if (typeof callback !== "function") throw new TypeError("threadPage.onPageUpdate needs a function");
      // An entry per call, so the same function registered twice is stopped once per stop. Like `watch`. 02 R4.66
      const entry = { callback: callback as (update: PageUpdate) => void };
      callbacks.add(entry);
      if (callbacks.size === 1) deps.send({ kind: "thread-page:page-update-listen", active: true });
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        callbacks.delete(entry);
        if (callbacks.size === 0) deps.send({ kind: "thread-page:page-update-listen", active: false });
      };
    },
    receive(message) {
      if (callbacks.size === 0) {
        deps.send({ kind: "thread-page:page-updated", nonce: message.nonce, ok: false });
        return;
      }
      deps.take(message.revision);
      deps.send({ kind: "thread-page:page-updated", nonce: message.nonce, ok: true });
      const update: PageUpdate = Object.freeze({ html: withoutHostScripts(win, message.html), revision: message.revision, documentPath: message.documentPath });
      for (const entry of [...callbacks]) {
        try {
          entry.callback(update);
        } catch (error) {
          // The document opted in: a throw leaves it as it is, and the next version calls it again. 02 R4.66
          deps.log(error);
        }
      }
    },
  };
}
