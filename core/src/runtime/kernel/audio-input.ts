// `<input type="file" accept="audio/*" capture>` on a fine pointer → the shell's recorder (02 R4.24a).
import { isAudioCaptureInput, isManualForm, ownerForm } from "./forms.ts";
import type { RecordAnswer } from "./record-client.ts";

export interface AudioInputDeps {
  embedded: boolean;
  voiceAvailable(): boolean;
  record(): Promise<RecordAnswer>;
}

/** The browser has a recorder of its own exactly when the primary pointer is coarse. 02 R4.24a */
export function browserRecords(win: Window): boolean {
  try {
    return win.matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export function installAudioInputs(win: Window & typeof globalThis, deps: AudioInputDeps): void {
  win.document.addEventListener(
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
