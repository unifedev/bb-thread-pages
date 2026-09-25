/**
 * The confirmation dialog: rendered in trusted chrome the sandboxed page
 * cannot draw over, click or reword. The summary comes from the host, never
 * from the page. spec R2.19, R3.22
 *
 * Resolution is driven by button clicks rather than the dialog's `close`
 * event, which never fires in headless browsers (spec 09 §Testing note).
 */
export interface ConfirmWording {
  heading: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface Confirmer {
  /** `wording` is the shell's own fixed text for a kind of question, never the page's. */
  confirm(summary: string, onConfirmGesture?: () => void, wording?: ConfirmWording): Promise<boolean>;
  /** Whether a question is open now. */
  isOpen?(): boolean;
}

const DEFAULT_WORDING: ConfirmWording = { heading: "Confirm this action", confirmLabel: "Confirm", cancelLabel: "Cancel" };

/**
 * `armMs`: how long after a question appears its confirm button ignores a
 * click, so a page cannot slide a question under a click the reader meant for
 * something else. A question asked while one is open is declined, never
 * swapped in.
 */
export function createConfirmer(dialog: HTMLDialogElement, armMs = 0, otherQuestionOpen: () => boolean = () => false, onClosed: () => void = () => undefined): Confirmer {
  const text = dialog.querySelector("p");
  const heading = dialog.querySelector("h2");
  const cancel = dialog.querySelector<HTMLButtonElement>('button[value="cancel"]');
  const confirm = dialog.querySelector<HTMLButtonElement>('button[value="confirm"]');
  let active: ((approved: boolean) => void) | null = null;
  let armedAt = 0;
  let gesture: (() => void) | undefined;

  function settle(approved: boolean): void {
    const current = active;
    active = null;
    if (approved && gesture) {
      try {
        gesture();
      } catch {
        // A refused popup is handled by the caller's fallback.
      }
    }
    gesture = undefined;
    if (dialog.open) dialog.close();
    if (current) onClosed();
    current?.(approved);
  }

  cancel?.addEventListener("click", (event) => {
    event.preventDefault();
    settle(false);
  });
  confirm?.addEventListener("click", (event) => {
    event.preventDefault();
    if (Date.now() < armedAt) return;
    settle(true);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    settle(false);
  });
  dialog.addEventListener("close", () => {
    if (active) settle(false);
  });

  return {
    confirm(summary, onConfirmGesture, wording = DEFAULT_WORDING) {
      return new Promise((resolve) => {
        // One question at a time: the open one stays as it is, under the reader's cursor.
        // The recording bar counts as one. spec R3.22a, R3.32a
        if (active || otherQuestionOpen()) {
          resolve(false);
          return;
        }
        armedAt = Date.now() + armMs;
        if (text) text.textContent = summary;
        if (heading) heading.textContent = wording.heading;
        if (confirm) confirm.textContent = wording.confirmLabel;
        if (cancel) cancel.textContent = wording.cancelLabel;
        active = resolve;
        gesture = onConfirmGesture;
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            settle(false);
          }
        } else {
          settle(false);
        }
      });
    },
    isOpen: () => active !== null,
  };
}
