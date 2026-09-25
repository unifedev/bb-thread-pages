import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { collectAnswers } from "./labels.ts";

/**
 * Automatic form capture. spec R4.5–R4.9
 *
 * Every `<form>` without `data-thread-page-manual` is captured: native
 * validation is suppressed (blank is an answer), a status line is kept per
 * form, ranges get a live readout, and while a submission is in flight the
 * form's controls are disabled and restored afterwards. A form's controls are
 * its descendants and every control joined to it from elsewhere in the
 * document with `form="<id>"`, so a question can sit beside the content it
 * concerns and still arrive as one answer. spec R4.5a, DECISIONS D12
 */
export const MANUAL_ATTRIBUTE = "data-thread-page-manual";
export const STATUS_ATTRIBUTE = "data-thread-page-status";
const RANGE_ATTRIBUTE = "data-thread-page-range";
const CONTROL_TAGS = new Set(["input", "textarea", "select", "button", "fieldset"]);

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

/** The form a node answers into: a control's form owner, which honours `form="…"`, else the enclosing form. */
export function ownerForm(node: Element | null): HTMLFormElement | null {
  if (!node) return null;
  const owner = (node as { form?: unknown }).form as Element | null | undefined;
  if (owner && typeof owner === "object" && owner.tagName?.toLowerCase() === "form") return owner as HTMLFormElement;
  return node.closest?.("form") ?? null;
}

/**
 * Captured forms reachable from `root`: the forms inside it, and the forms
 * that controls inside it are joined to from elsewhere. Used when content is
 * added, so a control joined to a form it does not sit in is still prepared.
 */
export function formsReachedFrom(root: ParentNode | Element): HTMLFormElement[] {
  const found = new Set(capturedForms(root));
  const joined: Element[] = [];
  if ("hasAttribute" in root && (root as Element).hasAttribute("form")) joined.push(root as Element);
  if ("querySelectorAll" in root) joined.push(...Array.from(root.querySelectorAll("[form]")));
  for (const element of joined) {
    const owner = ownerForm(element);
    if (owner && !isManualForm(owner)) found.add(owner);
  }
  return [...found];
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
  for (const control of controlsOf(form)) {
    if (control.tagName.toLowerCase() !== "input" || (control as HTMLInputElement).type !== "range") continue;
    const input = control as HTMLInputElement;
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

/** Every control that belongs to the form, wherever it sits. spec R4.5a */
export function controlsOf(form: HTMLFormElement): FormControl[] {
  return Array.from(form.elements).filter((element): element is FormControl => CONTROL_TAGS.has(element.tagName.toLowerCase()));
}

/**
 * `<input type="file" accept="audio/*" capture>`: answered by a recorder — the
 * phone's own, or the shell's — and its file transcribed at submit. spec R4.24a, R4.24b
 */
export function isAudioCaptureInput(element: Element | null): element is HTMLInputElement {
  if (!element || element.tagName?.toLowerCase() !== "input" || (element as HTMLInputElement).type !== "file" || !element.hasAttribute("capture")) return false;
  return (element.getAttribute("accept") ?? "")
    .split(",")
    .some((token) => token.trim().toLowerCase() === "audio/*");
}

/** The form's file inputs' files, then `extra` (a text area's attachments), all of them: limits refuse, never cut. */
export function filesOf(form: HTMLFormElement, extra: readonly SubmitFile[] = []): SubmitFile[] {
  const out: SubmitFile[] = [];
  for (const control of controlsOf(form)) {
    if (control.tagName.toLowerCase() !== "input" || (control as HTMLInputElement).type !== "file") continue;
    const input = control as HTMLInputElement;
    if (input.disabled) continue;
    // Audio from any other file input goes as it is, with no transcript. spec R4.24b
    const transcribe = isAudioCaptureInput(input);
    for (const file of Array.from(input.files ?? [])) out.push({ field: input.name || "file", file, ...(transcribe ? { transcribe: true } : {}) });
  }
  return [...out, ...extra];
}

/**
 * Why a form's files cannot be sent: more than the per-form count, file
 * inputs and text areas together, or one over the per-file size. spec R4.23, R4.62
 */
export function fileLimitProblem(files: readonly { file: { name: string; size: number } }[]): string | null {
  if (files.length > LIMITS.uploadsPerForm) {
    const over = files.length - LIMITS.uploadsPerForm;
    return `This form has ${files.length} files; at most ${LIMITS.uploadsPerForm} can be sent at once. Remove ${over} and send again.`;
  }
  const large = files.find((entry) => entry.file.size > LIMITS.uploadFileBytes);
  return large ? `“${large.file.name}” is larger than ${mebibytes(LIMITS.uploadFileBytes)}; remove it and send again.` : null;
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

export function buildIntent(form: HTMLFormElement, submitter: HTMLElement | null, submissionId: string, attached: readonly SubmitFile[] = []): SubmitIntent {
  return { submissionId, form, title: titleOf(form), answers: collectAnswers(form, submitter), files: filesOf(form, attached) };
}
