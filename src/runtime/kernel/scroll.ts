/**
 * The document's scroll position, reported so a refresh can return to it,
 * and restored when the host says where the previous document was.
 * spec R2.18b, R4.45
 */
export interface ScrollKeeper {
  restore(x: number, y: number): void;
}

const REPORT_MS = 200;

export function installScroll(win: Window, report: (x: number, y: number) => void): ScrollKeeper {
  const doc = win.document;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "0,0";
  let moved = false;

  function send(): void {
    timer = null;
    const x = Math.max(0, Math.round(win.scrollX || 0));
    const y = Math.max(0, Math.round(win.scrollY || 0));
    const next = `${x},${y}`;
    if (next === last) return;
    last = next;
    report(x, y);
  }

  // Only the document's own scroll reaches the window; inner scrollers do not bubble.
  win.addEventListener(
    "scroll",
    () => {
      moved = true;
      if (timer === null) timer = setTimeout(send, REPORT_MS);
    },
    { passive: true },
  );

  return {
    restore(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
      moved = false;
      const go = () => {
        // The reader has scrolled the new document themselves: leave them there.
        if (moved) return;
        try {
          win.scrollTo(x, y);
        } catch {
          // Nothing to scroll.
        }
        moved = false;
      };
      go();
      // The document may still be growing: try again as it completes.
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go, { once: true });
      if (doc.readyState !== "complete") win.addEventListener("load", go, { once: true });
    },
  };
}
