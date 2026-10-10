// The confirmation dialog: host summary only, arming delay 400 ms, one question at a time, titles quoted safely; settles by its buttons (05 R2.19, R3.22, R3.22a; 03 R5.64).
import { LIMITS } from "../../domain/limits.ts";

export interface ConfirmWording {
  heading: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface ConfirmOptions {
  wording?: ConfirmWording;
  /** Runs inside the Confirm click (a user gesture), before the promise resolves. */
  onConfirmGesture?: () => void;
  /** A grant names both sessions by title and id. 05 R3.22a */
  grant?: { sessionId: string; title: string };
}

export interface Confirmer {
  confirm(summary: string, options?: ConfirmOptions): Promise<boolean>;
  isOpen(): boolean;
}

export const DEFAULT_WORDING: ConfirmWording = { heading: "Confirm this action", confirmLabel: "Confirm", cancelLabel: "Cancel" };
export const GRANT_WORDING: ConfirmWording = { heading: "Allow answers from this page?", confirmLabel: "Allow", cancelLabel: "Don’t allow" };
export const DECISION_WORDING: ConfirmWording = { heading: "Decide for the agent", confirmLabel: "Confirm", cancelLabel: "Cancel" };
export const OPEN_WORDING: ConfirmWording = { heading: "Open this file?", confirmLabel: "Open", cancelLabel: "Cancel" };

/** Quoted text cannot close its quotation or carry control characters. 05 R3.22a */
export function safeQuote(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f“”"​-‏‪-‮⁦-⁩]/g, "").slice(0, 200);
}

export function createConfirmer(dialog: HTMLDialogElement, options: { armMs?: number; otherQuestionOpen?: () => boolean; onClosed?: () => void } = {}): Confirmer {
  const armMs = options.armMs ?? LIMITS.confirmArmMs;
  const otherQuestionOpen = options.otherQuestionOpen ?? (() => false);
  const onClosed = options.onClosed ?? (() => undefined);
  const doc = dialog.ownerDocument;
  const heading = doc.createElement("h2");
  const text = doc.createElement("p");
  text.setAttribute("data-tp", "confirm-summary");
  const detail = doc.createElement("p");
  detail.setAttribute("data-tp", "confirm-detail");
  detail.hidden = true;
  const row = doc.createElement("div");
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.value = "cancel";
  const confirm = doc.createElement("button");
  confirm.type = "button";
  confirm.value = "confirm";
  row.append(cancel, confirm);
  dialog.replaceChildren(heading, text, detail, row);
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
        // A refused popup is the caller's fallback.
      }
    }
    gesture = undefined;
    if (dialog.open) dialog.close();
    if (current) onClosed();
    current?.(approved);
  }

  cancel.addEventListener("click", (event) => {
    event.preventDefault();
    settle(false);
  });
  confirm.addEventListener("click", (event) => {
    event.preventDefault();
    // A click slid under a question is ignored for a moment. 05 R3.22a
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
    confirm(summary, given = {}) {
      return new Promise((resolve) => {
        // One question at a time: another asked meanwhile is declined, never swapped in. 05 R3.22a
        if (active || otherQuestionOpen()) {
          resolve(false);
          return;
        }
        const wording = given.wording ?? DEFAULT_WORDING;
        armedAt = Date.now() + armMs;
        text.textContent = summary;
        if (given.grant) {
          detail.hidden = false;
          detail.textContent = `Target: “${safeQuote(given.grant.title)}” (${safeQuote(given.grant.sessionId)}). You can revoke this later from the home page or the grants command.`;
        } else detail.hidden = true;
        heading.textContent = wording.heading;
        confirm.textContent = wording.confirmLabel;
        cancel.textContent = wording.cancelLabel;
        active = resolve;
        gesture = given.onConfirmGesture;
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            settle(false);
          }
        } else settle(false);
      });
    },
    isOpen: () => active !== null,
  };
}
