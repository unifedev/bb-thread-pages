// The in-place swap: load hidden, pre-show relay, restore, wait `restored`, show in one task, 4 s timeout, deferred while the reader types (U49), cancel-and-restart on a newer revision (05 R2.18a, R-S11; DESIGN §D.1–D.2; M3 measured: `opacity: 0`, never `visibility: hidden`, offscreen or `display: none`).
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../../domain/sandbox.ts";
import type { PageSource } from "../shared/envelopes.ts";
import type { ScrollState } from "../shared/scroll-state.ts";
import type { ShellMessage } from "../shared/protocol.ts";
import type { DraftRecord } from "../shared/drafts.ts";

/** What one frame of the shell shows. */
export interface FrameTarget {
  documentUrl: string;
  path: string;
  query: string;
  fragment: string;
  token: string;
  revision: string;
  expiresAt: number;
  source: PageSource;
  empty: boolean;
  deferredFiles: string[];
}

export interface Frame {
  element: HTMLIFrameElement;
  target: FrameTarget;
  port: MessagePort | null;
  /** The handshake happened: the port is connected. */
  connected: boolean;
  /** The kernel confirmed `restored`. */
  restored: boolean;
  /** The frame is the shown one; effects flow. */
  shown: boolean;
  /** The page called `setDirty(true)`. 05 R2.21 */
  dirty: boolean;
  embedDirty: boolean;
  /** A text control is focused and was typed into within `swapIdleMs`. U49 */
  typing: boolean;
  /** Submissions in flight from this frame. */
  pending: number;
  /** The kernel was told a newer version waits. */
  toldUpdate: boolean;
  scroll: ScrollState | null;
  /** Work waiting for the show; dropped with the frame. DESIGN §D.1 pre-show relay */
  queue: (() => void)[];
  /** The records handed in `restore`, by key, until the kernel reports them back. DESIGN §D.3 panel */
  handed: Map<string, DraftRecord>;
  nonce: number;
  /** The last pong nonce the kernel answered. */
  answered: number;
  pinged: number;
  loadStartedAt: number;
  timers: ReturnType<typeof setTimeout>[];
  cancelled: boolean;
}

/** Exactly over the shown frame, hidden by opacity alone, inert to the pointer and to assistive technology. M3; DESIGN §D.1 INCOMING */
export const HIDDEN_STYLE: Record<string, string> = { opacity: "0", "pointer-events": "none", "z-index": "0" };
export const SHOWN_STYLE: Record<string, string> = { opacity: "1", "pointer-events": "", "z-index": "1" };

export function createFrameElement(doc: Document, target: FrameTarget, hidden: boolean): HTMLIFrameElement {
  const element = doc.createElement("iframe");
  element.setAttribute("sandbox", PAGE_SANDBOX);
  element.setAttribute("allow", PAGE_FRAME_ALLOW);
  element.setAttribute("referrerpolicy", "no-referrer");
  element.setAttribute("title", "Page");
  element.setAttribute("data-tp-frame", hidden ? "incoming" : "shown");
  if (hidden) hide(element);
  else show(element);
  element.setAttribute("src", target.documentUrl + target.fragment);
  return element;
}

export function hide(element: HTMLIFrameElement): void {
  for (const [property, value] of Object.entries(HIDDEN_STYLE)) element.style.setProperty(property, value);
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
}

/** The one show task: opacity up, pointer events back, the frame raised. DESIGN §D.1 SWAP */
export function show(element: HTMLIFrameElement): void {
  for (const [property, value] of Object.entries(SHOWN_STYLE)) {
    if (value === "") element.style.removeProperty(property);
    else element.style.setProperty(property, value);
  }
  element.removeAttribute("aria-hidden");
  element.removeAttribute("inert");
  element.setAttribute("data-tp-frame", "shown");
}

export function createFrame(doc: Document, target: FrameTarget, hidden: boolean): Frame {
  return { element: createFrameElement(doc, target, hidden), target, port: null, connected: false, restored: false, shown: false, dirty: false, embedDirty: false, typing: false, pending: 0, toldUpdate: false, scroll: null, queue: [], handed: new Map(), nonce: 0, answered: 0, pinged: 0, loadStartedAt: Date.now(), timers: [], cancelled: false };
}

export function postTo(frame: Frame, message: ShellMessage): boolean {
  if (!frame.port) return false;
  try {
    frame.port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

export function clearTimers(frame: Frame): void {
  for (const timer of frame.timers) clearTimeout(timer);
  frame.timers = [];
}

/** Drops a frame: its timers, its queued work, its port, its element. */
export function discard(frame: Frame): void {
  frame.cancelled = true;
  clearTimers(frame);
  frame.queue = [];
  try {
    frame.port?.close();
  } catch {
    // Already closed.
  }
  frame.port = null;
  frame.element.remove();
}
