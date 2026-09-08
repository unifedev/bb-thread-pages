import { capturedForms, controlsOf, statusLine, type FormControl } from "./forms.ts";

/**
 * Read-only mode for an offline copy: disable the captured-form controls the
 * host finds enabled, show a status line per form and a banner the page
 * cannot suppress; on reconnection restore only what was disabled here.
 * spec R2.28, R4.34, R4.35
 */
export const OFFLINE_ATTRIBUTE = "data-thread-page-offline";
export const OFFLINE_STATUS = "Offline copy — responses are disabled until the source host reconnects.";

export interface ReadOnlyController {
  isReadOnly(): boolean;
  apply(readOnly: boolean): void;
  /** Applies the current state to newly added content. */
  prepare(root: ParentNode): void;
}

export function createReadOnlyController(doc: Document, initial: boolean): ReadOnlyController {
  const disabledByHost = new Set<FormControl>();
  let readOnly = initial;

  function banner(): void {
    if (!doc.body) return;
    let node = doc.querySelector<HTMLElement>(`[${OFFLINE_ATTRIBUTE}="host"]`);
    if (readOnly && !node) {
      node = doc.createElement("aside");
      node.setAttribute(OFFLINE_ATTRIBUTE, "host");
      node.setAttribute("role", "status");
      node.setAttribute(
        "style",
        "position:relative;z-index:2147483647;margin:0;padding:.75rem 1rem;border-bottom:1px solid currentColor;font:600 14px/1.4 system-ui,sans-serif;background:Canvas;color:CanvasText",
      );
      node.textContent = OFFLINE_STATUS;
      doc.body.insertBefore(node, doc.body.firstChild);
    } else if (!readOnly && node) {
      node.remove();
    }
  }

  function lock(root: ParentNode): void {
    for (const form of capturedForms(root)) {
      for (const control of controlsOf(form)) {
        if (!control.disabled) {
          control.disabled = true;
          disabledByHost.add(control);
        }
      }
      statusLine(form).textContent = OFFLINE_STATUS;
    }
  }

  function unlock(): void {
    for (const control of disabledByHost) control.disabled = false;
    disabledByHost.clear();
    for (const form of capturedForms(doc)) {
      const status = statusLine(form);
      if (status.textContent === OFFLINE_STATUS) status.textContent = "";
    }
  }

  return {
    isReadOnly: () => readOnly,
    apply(next) {
      readOnly = next;
      if (next) lock(doc);
      else unlock();
      banner();
    },
    prepare(root) {
      if (readOnly) lock(root);
      banner();
    },
  };
}
