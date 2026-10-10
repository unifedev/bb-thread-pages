// Capture-phase `scroll` on `document` for window and inner scrollers; report debounced 100 ms; restore by key (05 R-S11, R2.18b; DESIGN §D.2).
import { elementKey, SCROLL_ELEMENTS, type ScrollState } from "../shared/scroll-state.ts";
import type { KernelPrimitives } from "./primitives.ts";

export interface ScrollKeeper {
  /** The state now: the window and every inner scroller scrolled so far. */
  current(): ScrollState;
  /** Window and each element by key; elements not found are skipped. */
  restore(state: ScrollState | null): void;
  /** Sends the state now if a report is pending. */
  flush(): void;
}

const REPORT_MS = 100;

/** `tag:nth-of-type` path from the body, for an element with neither id nor `data-title`. DESIGN §D.2 */
export function pathOf(element: Element): string | null {
  const parts: string[] = [];
  const doc = element.ownerDocument;
  for (let node: Element | null = element; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    let index = 1;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === node.tagName) index += 1;
    parts.unshift(`${tag}:${index}`);
  }
  return parts.length > 0 ? parts.join("/") : null;
}

export function keyOf(element: Element): string | null {
  return elementKey({ id: element.id || null, title: element.getAttribute("data-title"), path: pathOf(element) });
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export function findByKey(doc: Document, key: string): Element | null {
  if (key.startsWith("#")) return doc.getElementById(key.slice(1));
  if (key.startsWith("title:")) return doc.querySelector(`[data-title="${cssEscape(key.slice(6))}"]`);
  if (!key.startsWith("path:")) return null;
  let node: Element | null = doc.body;
  for (const part of key.slice(5).split("/")) {
    const colon = part.lastIndexOf(":");
    const tag = part.slice(0, colon).toUpperCase();
    const index = Number(part.slice(colon + 1));
    if (!node || !Number.isInteger(index) || index < 1) return null;
    let count = 0;
    let found: Element | null = null;
    for (const child of Array.from(node.children)) {
      if (child.tagName !== tag) continue;
      count += 1;
      if (count === index) {
        found = child;
        break;
      }
    }
    node = found;
  }
  return node;
}

export function installScroll(win: Window & typeof globalThis, prim: KernelPrimitives, report: (state: ScrollState) => void): ScrollKeeper {
  const doc = win.document;
  /** Inner scrollers in the order they were scrolled, most recent last. */
  const scrolled: Element[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";

  function current(): ScrollState {
    const elements: ScrollState["elements"] = [];
    for (const element of scrolled.slice(-SCROLL_ELEMENTS)) {
      if (!element.isConnected) continue;
      const key = keyOf(element);
      if (!key) continue;
      elements.push({ key, top: Math.max(0, Math.round(element.scrollTop)), left: Math.max(0, Math.round(element.scrollLeft)) });
    }
    return { window: { x: Math.max(0, Math.round(win.scrollX || 0)), y: Math.max(0, Math.round(win.scrollY || 0)) }, elements };
  }

  function send(): void {
    timer = null;
    const state = current();
    const print = JSON.stringify(state);
    if (print === last) return;
    last = print;
    report(state);
  }

  prim.on(
    doc,
    "scroll",
    (event) => {
      const target = event.target;
      if (target !== doc && target && typeof (target as Element).tagName === "string") {
        const element = target as Element;
        const at = scrolled.indexOf(element);
        if (at >= 0) scrolled.splice(at, 1);
        scrolled.push(element);
        if (scrolled.length > SCROLL_ELEMENTS) scrolled.shift();
      }
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(send, REPORT_MS);
    },
    { capture: true, passive: true },
  );

  return {
    current,
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        send();
      }
    },
    restore(state) {
      if (!state) return;
      try {
        win.scrollTo(state.window.x, state.window.y);
      } catch {
        // Nothing to scroll.
      }
      for (const entry of state.elements) {
        const element = findByKey(doc, entry.key);
        if (!element) continue;
        element.scrollTop = entry.top;
        element.scrollLeft = entry.left;
        if (!scrolled.includes(element)) scrolled.push(element);
      }
    },
  };
}
