import { LIMITS } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { collectAnswers } from "./labels.ts";

/**
 * Automatic form capture. spec R4.5–R4.9
 *
 * Every `<form>` without `data-thread-page-manual` is captured: native
 * validation is suppressed (blank is an answer), a status line is kept per
 * form, ranges get a live readout, and while a submission is in flight the
 * form's controls are disabled and restored afterwards.
 */
export const MANUAL_ATTRIBUTE = "data-thread-page-manual";
export const STATUS_ATTRIBUTE = "data-thread-page-status";
const RANGE_ATTRIBUTE = "data-thread-page-range";

export interface SubmitIntent {
  submissionId: string;
  form: HTMLFormElement;
  title: string;
  answers: ReturnType<typeof collectAnswers>;
  files: SubmitFile[];
}

export function isManualForm(form: Element): boolean {
  return form.hasAttribute(MANUAL_ATTRIBUTE);
}

export function capturedForms(root: ParentNode | Element): HTMLFormElement[] {
  const forms: HTMLFormElement[] = [];
  if ("tagName" in root && (root as Element).tagName.toLowerCase() === "form") forms.push(root as HTMLFormElement);
  if ("querySelectorAll" in root) forms.push(...Array.from(root.querySelectorAll("form")));
  return forms.filter((form) => !isManualForm(form));
}

export function statusLine(form: HTMLFormElement): HTMLElement {
  let node = form.querySelector<HTMLElement>(`[${STATUS_ATTRIBUTE}]`);
  if (!node) {
    node = form.ownerDocument.createElement("p");
    node.setAttribute(STATUS_ATTRIBUTE, "");
    node.setAttribute("role", "status");
    form.appendChild(node);
  }
  return node;
}

const preparedRanges = new WeakSet<HTMLInputElement>();

export function prepareForm(form: HTMLFormElement): void {
  form.noValidate = true;
  for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="range"]'))) {
    if (preparedRanges.has(input)) continue;
    preparedRanges.add(input);
    const output = form.ownerDocument.createElement("output");
    output.setAttribute(RANGE_ATTRIBUTE, "");
    const sync = () => {
      output.textContent = String(input.value);
    };
    input.addEventListener("input", sync);
    sync();
    input.insertAdjacentElement("afterend", output);
  }
}

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | HTMLFieldSetElement;

export function controlsOf(form: HTMLFormElement): FormControl[] {
  return Array.from(form.querySelectorAll<FormControl>("input,textarea,select,button,fieldset"));
}

export function filesOf(form: HTMLFormElement): SubmitFile[] {
  const out: SubmitFile[] = [];
  for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    if (input.disabled) continue;
    for (const file of Array.from(input.files ?? [])) {
      if (out.length >= LIMITS.uploadsPerForm) return out;
      out.push({ field: input.name || "file", file });
    }
  }
  return out;
}

export interface PendingForm {
  form: HTMLFormElement;
  disabled: FormControl[];
  dirtyVersion: number | undefined;
}

/** Disables the controls that were enabled, remembering them for restore. spec R4.8 */
export function lockForm(form: HTMLFormElement): FormControl[] {
  const disabled: FormControl[] = [];
  for (const control of controlsOf(form)) {
    if (!control.disabled) {
      control.disabled = true;
      disabled.push(control);
    }
  }
  return disabled;
}

export function unlockForm(disabled: FormControl[]): void {
  for (const control of disabled) control.disabled = false;
}

export function titleOf(form: HTMLFormElement): string {
  const explicit = form.getAttribute("data-title");
  if (explicit && explicit.trim()) return explicit.trim().slice(0, 300);
  const heading = form.ownerDocument.querySelector("h1");
  return (heading?.textContent || "").trim().slice(0, 300) || "Thread Page";
}

export function buildIntent(form: HTMLFormElement, submitter: HTMLElement | null, submissionId: string): SubmitIntent {
  return { submissionId, form, title: titleOf(form), answers: collectAnswers(form, submitter), files: filesOf(form) };
}
