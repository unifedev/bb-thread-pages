// Typing, for the deferred swap: a text control is focused and the last `input` was less than `swapIdleMs` ago; reported to the shell as `typing { active }` on each transition (05 R2.21; U49). `focusin`/`focusout`/`input` at the document, capture phase.
import type { KernelMessage } from "../shared/protocol.ts";
import type { KernelPrimitives } from "./primitives.ts";

const NOT_TEXT = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "image", "range", "color", "hidden"]);

/** A control the reader types into: a text-like input, a text area, or an editable element. */
export function isTextControl(node: unknown): node is HTMLElement {
  const element = node as HTMLElement | null;
  if (!element || typeof element !== "object" || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") return !NOT_TEXT.has(((element as HTMLInputElement).type || "text").toLowerCase());
  return element.isContentEditable === true;
}

export interface TypingTracker {
  isActive(): boolean;
}

export function createTypingTracker(doc: Document, prim: KernelPrimitives, swapIdleMs: number, send: (message: KernelMessage) => void): TypingTracker {
  let lastInputAt = -Infinity;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function focusedText(): boolean {
    return isTextControl(doc.activeElement);
  }

  function set(next: boolean): void {
    if (next === active) return;
    active = next;
    send({ kind: "thread-page:typing", active });
  }

  function arm(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      evaluate();
    }, swapIdleMs);
  }

  function evaluate(): void {
    set(focusedText() && Date.now() - lastInputAt < swapIdleMs);
  }

  prim.on(
    doc,
    "input",
    (event) => {
      if (!isTextControl(event.target) || event.target !== doc.activeElement) return;
      lastInputAt = Date.now();
      arm();
      evaluate();
    },
    true,
  );
  prim.on(doc, "focusin", () => evaluate(), true);
  prim.on(
    doc,
    "focusout",
    () => {
      // After the blur has settled: the next focused element, if any, decides.
      setTimeout(evaluate, 0);
    },
    true,
  );

  return { isActive: () => active };
}
