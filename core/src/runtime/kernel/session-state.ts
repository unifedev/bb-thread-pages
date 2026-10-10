// The owning session's state as the host tells it: `data-thread-page-session="working|idle"` on `<html>` and on every captured form, the host's working label as each captured form's standing status while the session works (05 R2.24–R2.26; U49). Nothing is drawn: a page styles the attribute or ignores it.
import { capturedForms, clearStatusOverride, formsReachedFrom, setStandingStatus } from "./forms.ts";

export const SESSION_ATTRIBUTE = "data-thread-page-session";

export interface SessionStateController {
  /** From the shell's `session-state`; a change clears the forms' delivery notices so the standing text shows. */
  apply(working: boolean, label: string): void;
  /** Marks forms added later. */
  prepare(root: ParentNode): void;
  working(): boolean;
  label(): string;
}

export function createSessionState(doc: Document): SessionStateController {
  let working = false;
  let label = "";
  let known = false;

  function markForm(form: HTMLFormElement): void {
    form.setAttribute(SESSION_ATTRIBUTE, working ? "working" : "idle");
    setStandingStatus(form, working ? label : "");
  }

  function mark(): void {
    doc.documentElement?.setAttribute(SESSION_ATTRIBUTE, working ? "working" : "idle");
    for (const form of capturedForms(doc)) markForm(form);
  }

  mark();
  return {
    apply(nextWorking, nextLabel) {
      const changed = known && nextWorking !== working;
      known = true;
      working = nextWorking;
      label = nextLabel;
      // A delivery outcome ("Sent", "Queued") has had its say once the session's state moves on; an error stands (NS-8). U49
      if (changed) for (const form of capturedForms(doc)) clearStatusOverride(form, true);
      mark();
    },
    prepare(root) {
      for (const form of formsReachedFrom(root)) markForm(form);
    },
    working: () => working,
    label: () => label,
  };
}
