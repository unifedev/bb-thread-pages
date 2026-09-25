import { isAudioCaptureInput, isManualForm, ownerForm } from "./forms.ts";
import type { RecordAnswer } from "./record-client.ts";

/**
 * A voice answer with no code: `<input type="file" accept="audio/*" capture>`
 * in a captured form. A phone answers it with its own recorder, and is left
 * to; elsewhere — where `capture` is ignored and the input would only open a
 * file picker — a click on it opens the shell's recording bar, and the
 * recording becomes the input's file. Where voice is not available it stays
 * the browser's picker. spec R4.24a, D38
 */
export interface AudioInputDeps {
  /** Inside an embed files cannot be sent (R4.51): the input is left alone. */
  embedded: boolean;
  voiceAvailable(): boolean;
  record(): Promise<RecordAnswer>;
}

/** The browser has a recorder of its own exactly when the primary pointer is coarse. spec R4.24a */
export function browserRecords(win: Window): boolean {
  try {
    return win.matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export function installAudioInputs(win: Window & typeof globalThis, deps: AudioInputDeps): void {
  const doc = win.document;
  doc.addEventListener(
    "click",
    (event) => {
      const input = event.target as Element | null;
      if (event.defaultPrevented || !isAudioCaptureInput(input) || input.disabled) return;
      const form = ownerForm(input);
      if (!form || isManualForm(form) || deps.embedded || !deps.voiceAvailable() || browserRecords(win)) return;
      event.preventDefault();
      void deps.record().then((answer) => {
        // Cancel, and every failure, leave the input as it was.
        if (!answer.ok || !answer.file || !input.isConnected || input.disabled) return;
        const Transfer = (win as unknown as { DataTransfer?: typeof DataTransfer }).DataTransfer;
        if (typeof Transfer !== "function") return;
        const transfer = new Transfer();
        transfer.items.add(answer.file);
        input.files = transfer.files;
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
        input.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
    },
    true,
  );
}
