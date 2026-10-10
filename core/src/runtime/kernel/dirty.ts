// The dirty flag: `input`/`change`/`beforeinput` at the document in capture phase, `setDirty`, embed dirt (02 R-K9, R4.47; 05 R2.21–R2.23).
import type { KernelPrimitives } from "./primitives.ts";

export interface DirtyTracker {
  isDirty(): boolean;
  /** The forms the reader touched since they were last delivered or cleared: where a waiting update is announced. U49 */
  dirtyForms(): HTMLFormElement[];
  /** Any reader input anywhere; returns the version stamped on it. 02 R-K9 */
  touch(form: HTMLFormElement | null): number;
  /** The version the form (or, for null, the document outside forms) was last touched at. */
  versionOf(form: HTMLFormElement | null): number | undefined;
  /** A delivered form clears its dirt only when nothing else was touched since `version`. 02 R-K9 */
  clearDelivered(form: HTMLFormElement, version: number | undefined): void;
  setCustom(dirty: boolean): void;
  /** Embeds hold unsaved input. 02 R4.47 */
  setEmbedded(dirty: boolean): void;
}

/** `onChange(dirty, custom)`: `custom` is `setDirty(true)` or a deferring embed — what holds a swap beyond the reader's own typing. U49 */
export function createDirtyTracker(doc: Document, prim: KernelPrimitives, onChange: (dirty: boolean, custom: boolean) => void): DirtyTracker {
  const versions = new Map<HTMLFormElement | null, number>();
  let sequence = 0;
  let latest = 0;
  let custom = false;
  let embedded = false;
  /** An edited `contenteditable` keeps focus: its text cannot be drafted, so it holds a swap like `setDirty(true)` until the element blurs (review NS-6). */
  let editable: Element | null = null;
  let last = false;
  let lastCustom = false;

  function sync(): void {
    const next = custom || embedded || versions.size > 0;
    const nextCustom = custom || embedded || editable !== null;
    if (next === last && nextCustom === lastCustom) return;
    last = next;
    lastCustom = nextCustom;
    onChange(next, nextCustom);
  }

  function touch(form: HTMLFormElement | null): number {
    sequence += 1;
    latest = sequence;
    versions.set(form, sequence);
    sync();
    return sequence;
  }

  function onInput(event: Event): void {
    const target = event.target as Element | null;
    if (!target || typeof (target as Element).closest !== "function") return;
    const owner = ((target as { form?: unknown }).form as HTMLFormElement | null | undefined) ?? target.closest("form");
    if ((target as HTMLElement).isContentEditable === true && event.type === "input") editable = target;
    touch(owner && owner.tagName?.toLowerCase() === "form" ? owner : null);
  }
  function onFocusOut(event: Event): void {
    if (editable && event.target === editable) {
      editable = null;
      sync();
    }
  }
  // Capture phase at the document: a page that stops propagation still marks itself. 02 R-K9
  for (const type of ["input", "change", "beforeinput"]) prim.on(doc, type, onInput, true);
  prim.on(doc, "focusout", onFocusOut, true);

  return {
    isDirty: () => last,
    dirtyForms: () => [...versions.keys()].filter((form): form is HTMLFormElement => form !== null && form.isConnected),
    touch,
    versionOf: (form) => versions.get(form),
    clearDelivered(form, version) {
      // Only when nothing else anywhere was touched since the submission was captured.
      if (version !== undefined && latest === version && versions.get(form) === version) {
        versions.delete(form);
        sync();
      }
    },
    setCustom(dirty) {
      custom = dirty === true;
      // setDirty(false) is the one explicit clear of what the reader typed; an embed's dirt is the embed's own. 02 R-K9, R4.47
      if (!custom) {
        versions.clear();
        editable = null;
      }
      sync();
    },
    setEmbedded(dirty) {
      embedded = dirty === true;
      sync();
    },
  };
}
