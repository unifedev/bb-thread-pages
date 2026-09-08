import type { SubmitAnswer } from "../shared/protocol.ts";

/**
 * Answer naming and group collapsing. spec R4.10–R4.12
 *
 * The reader sees labels, not field names, so a delivered answer carries the
 * label. Order: explicit `data-label`; the nearest fieldset's legend; the
 * control's `aria-label`; the text of a wrapping `<label>`; the text of a
 * `<label for>`; the raw name. Derived text excludes nested controls, option
 * text, hints and host-injected nodes.
 */
const EXCLUDED_FROM_TEXT = "input,textarea,select,button,option,small,output,[data-thread-page-range],[data-thread-page-status]";

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;

export function labelText(node: Element | null): string {
  if (!node) return "";
  const clone = node.cloneNode(true) as Element;
  for (const child of Array.from(clone.querySelectorAll(EXCLUDED_FROM_TEXT))) child.remove();
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

export function labelFor(form: HTMLFormElement, control: FormControl): string {
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
    const doc = form.ownerDocument;
    const referenced = Array.from(doc.querySelectorAll("label[for]")).find((label) => (label as HTMLLabelElement).htmlFor === control.id);
    const text = labelText(referenced ?? null);
    if (text) return text;
  }
  return control.name;
}

const SKIPPED_TYPES = new Set(["button", "submit", "reset", "image", "file"]);

export function namedControls(form: HTMLFormElement): FormControl[] {
  return Array.from(form.elements).filter((element): element is FormControl => {
    const control = element as FormControl;
    return typeof control.name === "string" && control.name.length > 0 && !control.disabled && "type" in control;
  });
}

/** Collects answers in document order; the submitter leads as the chosen action. spec R2.36 */
export function collectAnswers(form: HTMLFormElement, submitter: HTMLElement | null): SubmitAnswer[] {
  const controls = namedControls(form);
  const answers: SubmitAnswer[] = [];
  const seen = new Set<string>();
  if (submitter && (tagOf(submitter) === "button" || tagOf(submitter) === "input")) {
    const control = submitter as HTMLButtonElement | HTMLInputElement;
    const value = control.value || (control.textContent || "").trim();
    answers.push({ name: control.name || "action", label: "Action", value });
    if (control.name) seen.add(control.name);
  }
  for (const control of controls) {
    const name = control.name;
    const type = String(control.type || "").toLowerCase();
    if (seen.has(name) || SKIPPED_TYPES.has(type)) continue;
    seen.add(name);
    const group = controls.filter((item) => item.name === name);
    answers.push({ name, label: labelFor(form, control), value: collapse(control, group, type) });
  }
  return answers;
}

/** Tag checks rather than `instanceof`, so the kernel works across realms and with custom elements. */
export function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

function collapse(control: FormControl, group: FormControl[], type: string): string | string[] | boolean {
  if (type === "checkbox") {
    const boxes = group.filter((item): item is HTMLInputElement => tagOf(item) === "input");
    if (boxes.length === 1) return boxes[0]?.checked === true;
    return boxes.filter((item) => item.checked).map((item) => item.value);
  }
  if (type === "radio") {
    const checked = group.find((item) => tagOf(item) === "input" && (item as HTMLInputElement).checked) as HTMLInputElement | undefined;
    return checked ? checked.value : "";
  }
  if (tagOf(control) === "select" && (control as HTMLSelectElement).multiple) {
    return Array.from((control as HTMLSelectElement).selectedOptions).map((option) => option.value);
  }
  if (group.length > 1) return group.map((item) => String((item as HTMLInputElement).value ?? ""));
  return String((control as HTMLInputElement).value ?? "");
}
