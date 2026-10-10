// Answer naming R4.10–R4.11 and group collapsing R4.12 → `SubmitAnswer[]`; a submitter with a `name` is not repeated among the answers (02 §Action first).
import type { SubmitAnswer } from "../shared/protocol.ts";

/** Excluded from derived label text: nested controls, option text, hints, host-injected nodes. 02 R4.11 */
const EXCLUDED_FROM_TEXT = "input,textarea,select,button,option,small,output,[data-thread-page-status],[data-thread-page-layer]";
const SKIPPED_TYPES = new Set(["button", "submit", "reset", "image", "file"]);

export type AnswerControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

export function labelText(node: Element | null): string {
  if (!node) return "";
  const clone = node.cloneNode(true) as Element;
  for (const child of Array.from(clone.querySelectorAll(EXCLUDED_FROM_TEXT))) child.remove();
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

/** The name the reader saw, in the order of 02 R4.10; "enclosing" is around the control itself. */
export function labelFor(control: AnswerControl): string {
  const explicit = control.getAttribute("data-label");
  if (explicit && explicit.trim()) return explicit.trim();
  const fieldset = control.closest("fieldset");
  if (fieldset) {
    const legend = labelText(fieldset.querySelector("legend"));
    if (legend) return legend;
  }
  const aria = control.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const wrapping = control.closest("label");
  if (wrapping) {
    const text = labelText(wrapping);
    if (text) return text;
  }
  if (control.id) {
    const referenced = Array.from(control.ownerDocument.querySelectorAll("label[for]")).find((label) => (label as HTMLLabelElement).htmlFor === control.id);
    const text = labelText(referenced ?? null);
    if (text) return text;
  }
  return control.name;
}

/** Named, enabled answer controls of the form in document order (file and button types excluded). */
export function namedControls(form: HTMLFormElement): AnswerControl[] {
  return Array.from(form.elements).filter((element): element is AnswerControl => {
    const tag = tagOf(element);
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
    const control = element as AnswerControl;
    if (control.disabled || typeof control.name !== "string" || control.name.length === 0) return false;
    return !SKIPPED_TYPES.has(String(control.type || "").toLowerCase());
  });
}

/** The submitter's value — the reader's chosen action — carried as its own field of the submission, never as an answer. 02 §Action first; 05 R2.36 */
export function actionOf(submitter: HTMLElement | null): string | null {
  if (!submitter || (tagOf(submitter) !== "button" && tagOf(submitter) !== "input")) return null;
  const control = submitter as HTMLButtonElement | HTMLInputElement;
  return control.value || (control.textContent || "").trim();
}

/** Collects answers in document order; a named submitter is the action, not an answer. 02 §Action first; 05 R2.36 */
export function collectAnswers(form: HTMLFormElement, submitter: HTMLElement | null): SubmitAnswer[] {
  const controls = namedControls(form);
  const answers: SubmitAnswer[] = [];
  const seen = new Set<string>();
  if (submitter && (tagOf(submitter) === "button" || tagOf(submitter) === "input")) {
    const control = submitter as HTMLButtonElement | HTMLInputElement;
    if (control.name) seen.add(control.name);
  }
  for (const control of controls) {
    const name = control.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const group = controls.filter((item) => item.name === name);
    answers.push({ name, label: labelFor(control), value: collapse(control, group) });
  }
  return answers;
}

/** A lone checkbox is a boolean; shared names a list; radios one value or blank; a multiple select a list. 02 R4.12 */
export function collapse(control: AnswerControl, group: AnswerControl[]): string | string[] | boolean {
  const type = String(control.type || "").toLowerCase();
  if (type === "checkbox") {
    const boxes = group.filter((item): item is HTMLInputElement => tagOf(item) === "input" && (item as HTMLInputElement).type === "checkbox");
    if (boxes.length === 1) return boxes[0]!.checked === true;
    return boxes.filter((item) => item.checked).map((item) => item.value);
  }
  if (type === "radio") {
    const checked = group.find((item) => tagOf(item) === "input" && (item as HTMLInputElement).checked) as HTMLInputElement | undefined;
    return checked ? checked.value : "";
  }
  if (tagOf(control) === "select" && (control as HTMLSelectElement).multiple) return Array.from((control as HTMLSelectElement).selectedOptions).map((option) => option.value);
  if (group.length > 1) return group.map((item) => String(item.value ?? ""));
  return String(control.value ?? "");
}
