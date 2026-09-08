/**
 * The confirmation dialog: rendered in trusted chrome the sandboxed page
 * cannot draw over, click or reword. The summary comes from the host, never
 * from the page. spec R2.19, R3.22
 *
 * Resolution is driven by button clicks rather than the dialog's `close`
 * event, which never fires in headless browsers (spec 09 §Testing note).
 */
export interface Confirmer {
  confirm(summary: string, onConfirmGesture?: () => void): Promise<boolean>;
}

export function createConfirmer(dialog: HTMLDialogElement): Confirmer {
  const text = dialog.querySelector("p");
  const cancel = dialog.querySelector<HTMLButtonElement>('button[value="cancel"]');
  const confirm = dialog.querySelector<HTMLButtonElement>('button[value="confirm"]');
  let active: ((approved: boolean) => void) | null = null;
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
    current?.(approved);
  }

  cancel?.addEventListener("click", (event) => {
    event.preventDefault();
    settle(false);
  });
  confirm?.addEventListener("click", (event) => {
    event.preventDefault();
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
    confirm(summary, onConfirmGesture) {
      return new Promise((resolve) => {
        if (active) settle(false);
        if (text) text.textContent = summary;
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
  };
}
