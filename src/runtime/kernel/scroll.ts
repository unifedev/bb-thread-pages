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
  /** The reader acted on the new document themselves, so a pending restore gives way. */
  let acted = false;

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
      // Once at once, then once more when it settles: a refresh may come at any moment.
      if (timer !== null) return;
      send();
      timer = setTimeout(send, REPORT_MS);
    },
    { passive: true },
  );
  // A scroll event cannot tell the reader's scrolling from a restore's own, so watch what causes one.
  for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) {
    win.addEventListener(type, () => (acted = true), { passive: true, capture: true });
  }

  return {
    restore(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
      acted = false;
      const go = () => {
        if (acted) return;
        try {
          win.scrollTo(x, y);
        } catch {
          // Nothing to scroll.
        }
      };
      go();
      // The document may still be growing: try again as it completes.
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go, { once: true });
      if (doc.readyState !== "complete") win.addEventListener("load", go, { once: true });
    },
  };
}
