// Read-only: disable captured controls, per-form status naming the cause (offline / archived), `data-thread-page-readonly` on `<html>` for the page to style; restore only what it disabled (02 R4.34–R4.35, R-K8; U49).
import { capturedForms, controlsOf, formsReachedFrom, setReadOnlyStatus, type FormControl } from "./forms.ts";

export const READONLY_ATTRIBUTE = "data-thread-page-readonly";
export const OFFLINE_STATUS = "Offline copy — responses are disabled until the source host reconnects.";
export const ARCHIVED_STATUS = "This session is archived — its page is read-only.";

export type ReadOnlyCause = "offline" | "archived" | null;

export interface ReadOnlyController {
  isReadOnly(): boolean;
  cause(): ReadOnlyCause;
  apply(cause: ReadOnlyCause, reason?: string | null): void;
  /** Applies the current state to newly added content. */
  prepare(root: ParentNode): void;
}

export function createReadOnlyController(doc: Document, initial: ReadOnlyCause): ReadOnlyController {
  const disabledByHost = new Set<FormControl>();
  let cause: ReadOnlyCause = initial;
  let text = initial === "archived" ? ARCHIVED_STATUS : OFFLINE_STATUS;

  /** The one mark on the document: an attribute, nothing drawn. The page styles it or ignores it. U49 */
  function mark(): void {
    const root = doc.documentElement;
    if (!root) return;
    if (cause) root.setAttribute(READONLY_ATTRIBUTE, cause);
    else root.removeAttribute(READONLY_ATTRIBUTE);
  }

  function lock(root: ParentNode): void {
    for (const form of formsReachedFrom(root)) {
      for (const control of controlsOf(form)) {
        if (!control.disabled) {
          control.disabled = true;
          disabledByHost.add(control);
        }
      }
      setReadOnlyStatus(form, text);
    }
  }

  function unlock(): void {
    for (const control of disabledByHost) control.disabled = false;
    disabledByHost.clear();
    for (const form of capturedForms(doc)) setReadOnlyStatus(form, null);
  }

  return {
    isReadOnly: () => cause !== null,
    cause: () => cause,
    apply(next, reason) {
      const wording = next === "archived" ? ARCHIVED_STATUS : next === "offline" ? (reason && reason.trim() ? reason.trim() : OFFLINE_STATUS) : "";
      if (next === cause && wording === text) return;
      if (cause) unlock();
      cause = next;
      text = wording;
      if (cause) lock(doc);
      mark();
    },
    prepare(root) {
      if (cause) lock(root);
      mark();
    },
  };
}
