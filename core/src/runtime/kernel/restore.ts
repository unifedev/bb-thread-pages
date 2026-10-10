// The `restore` → `restored` sequence: drafts, scroll, then two of the kernel's own animation frames (DESIGN §D.2; M3 measured); one scroll repeat after the first mutation batch (05 R-S11).
import type { ScrollState } from "../shared/scroll-state.ts";
import type { DraftRecord } from "../shared/drafts.ts";
import type { KernelMessage } from "../shared/protocol.ts";
import type { Drafts } from "./drafts.ts";
import type { ScrollKeeper } from "./scroll.ts";

export interface RestoreDeps {
  drafts: Drafts;
  scroll: ScrollKeeper;
  send(message: KernelMessage): void;
}

export interface RestoreMessage {
  nonce: number;
  scroll: ScrollState | null;
  drafts: DraftRecord[];
  clearedNotice: { form: { key: string }; fields: string[] }[];
}

export interface Restorer {
  restore(message: RestoreMessage): void;
  /** The frame became the shown one: focus the restored control. */
  shown(): void;
}

export function createRestorer(win: Window & typeof globalThis, deps: RestoreDeps): Restorer {
  const doc = win.document;
  let firstPaintAt: number | null = null;
  const raf = (callback: () => void): void => {
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(() => callback());
    else setTimeout(callback, 16);
  };

  // The first animation frame after DOMContentLoaded: the start of A161's gap. DESIGN §D.2 step 6
  const markPaint = () => raf(() => {
    if (firstPaintAt === null) firstPaintAt = win.performance?.now?.() ?? null;
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", markPaint, { once: true });
  else markPaint();

  function run(message: RestoreMessage): void {
    deps.drafts.restore(message.drafts, message.clearedNotice);
    deps.scroll.restore(message.scroll);
    // Two of this document's own frames: the engine has laid out, scrolled and produced a frame while hidden. M3
    raf(() =>
      raf(() => {
        const now = win.performance?.now?.();
        deps.send({ kind: "thread-page:restored", nonce: message.nonce, firstPaintToRestoreMs: firstPaintAt !== null && typeof now === "number" ? Math.max(0, now - firstPaintAt) : null });
        repeatScrollOnce(message.scroll);
      }),
    );
  }

  /** A page whose first render needs a bridge call lays out late: the scroll is applied once more after the first mutation batch. DESIGN §D.2 step 5 */
  function repeatScrollOnce(state: ScrollState | null): void {
    if (!state || typeof win.MutationObserver !== "function" || !doc.documentElement) return;
    const observer = new win.MutationObserver(() => {
      observer.disconnect();
      deps.scroll.restore(state);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  return {
    restore(message) {
      // After the page's own DOMContentLoaded handlers have run. 02 R-K4
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => run(message), { once: true });
      else run(message);
    },
    shown() {
      deps.drafts.focusRestored();
    },
  };
}
