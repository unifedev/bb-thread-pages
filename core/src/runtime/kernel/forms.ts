// Form capture (02 R4.5–R4.9): captured set, associated controls, per-form state, submit interception helpers, the status line and its layers (read-only, a delivery or notice, a waiting update, the session's standing text — U49), disabled-while-sending; the form's identity for drafts and submissions (02 R-K5).
import { formKey, normalizeTitle, type FormIdentity } from "../../domain/forms/identity.ts";
import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { actionOf, collectAnswers } from "./labels.ts";

// The same names `src/domain/html/forms.ts` uses on the server; declared here so the kernel bundle carries no parser. 02 R4.6, §Attributes
/** The opt-out attribute: a form carrying it is left alone. 02 R4.6 */
export const MANUAL_ATTRIBUTE = "data-thread-page-manual";
/** The form's title attribute. 02 §Attributes */
export const TITLE_ATTRIBUTE = "data-title";
/** The kernel's status line inside a captured form. 02 R4.8 */
export const STATUS_ATTRIBUTE = "data-thread-page-status";
const CONTROL_TAGS = new Set(["input", "textarea", "select", "button", "fieldset"]);
const NOT_ANSWERS = new Set(["submit", "reset", "button", "image"]);

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | HTMLFieldSetElement;

export function tagOf(element: Element | null | undefined): string {
  return (element?.tagName ?? "").toLowerCase();
}

export function isManualForm(form: Element): boolean {
  return form.hasAttribute(MANUAL_ATTRIBUTE);
}

/** Every `<form>` of the document in document order, opted-out ones included: the index of 02 R-K5. */
export function allForms(doc: Document): HTMLFormElement[] {
  return Array.from(doc.querySelectorAll("form"));
}

export function capturedForms(root: ParentNode | Element): HTMLFormElement[] {
  const forms: HTMLFormElement[] = [];
  if (tagOf(root as Element) === "form") forms.push(root as HTMLFormElement);
  if ("querySelectorAll" in root) forms.push(...Array.from(root.querySelectorAll("form")));
  return forms.filter((form) => !isManualForm(form));
}

/** The form a control answers into: its form owner (honours `form=`), else the enclosing form. 02 R4.5a */
export function ownerForm(node: Element | null): HTMLFormElement | null {
  if (!node) return null;
  const owner = (node as { form?: unknown }).form as Element | null | undefined;
  if (owner && typeof owner === "object" && tagOf(owner) === "form") return owner as HTMLFormElement;
  return node.closest?.("form") ?? null;
}

/** Captured forms reachable from `root`: inside it, and the forms controls inside it are joined to from elsewhere. */
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

/** Every control that belongs to the form, wherever it sits. 02 R4.5a */
export function controlsOf(form: HTMLFormElement): FormControl[] {
  return Array.from(form.elements).filter((element): element is FormControl => CONTROL_TAGS.has(tagOf(element)));
}

/** Controls whose value is an answer: named, not a button and not a file. 02 §The answer wording */
export function answerControls(form: HTMLFormElement): (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[] {
  return controlsOf(form).filter((control): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
    const tag = tagOf(control);
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
    if (tag === "input" && NOT_ANSWERS.has(((control as HTMLInputElement).type || "text").toLowerCase())) return false;
    return typeof (control as HTMLInputElement).name === "string" && (control as HTMLInputElement).name.length > 0;
  });
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

/**
 * What a form's status line can say, by precedence: read-only (the cause),
 * then a delivery outcome or notice, then a newer version waiting for the
 * reader to pause, then the session's standing text (the host's working
 * label while the session works). 02 R4.8, R4.34; 05 R2.21, R2.24–R2.26; U49
 */
interface FormStatus {
  readOnly: string | null;
  override: string | null;
  /** A delivery outcome ("Sent", "Queued") goes when the session's state moves on; an error or a notice stands until the reader's next input in the form (review NS-8). */
  transient: boolean;
  update: string | null;
  standing: string;
}

const statuses = new WeakMap<HTMLFormElement, FormStatus>();

function statusOf(form: HTMLFormElement): FormStatus {
  let status = statuses.get(form);
  if (!status) {
    status = { readOnly: null, override: null, transient: false, update: null, standing: "" };
    statuses.set(form, status);
  }
  return status;
}

export function renderStatus(form: HTMLFormElement): void {
  const status = statusOf(form);
  statusLine(form).textContent = (status.readOnly ?? status.override ?? status.update ?? status.standing).slice(0, LIMITS.errorMessageChars);
}

/** An error or a notice: shown over the standing text until the reader's next input in the form or the next status. */
export function setStatus(form: HTMLFormElement, text: string): void {
  const status = statusOf(form);
  status.override = text || null;
  status.transient = false;
  renderStatus(form);
}

/** A delivery outcome ("Sent", "Queued"): shown until the session's state next changes. 02 R4.8; U49 */
export function setDeliveryStatus(form: HTMLFormElement, text: string): void {
  const status = statusOf(form);
  status.override = text || null;
  status.transient = true;
  renderStatus(form);
}

/** `transientOnly`: a state change clears delivery outcomes and leaves errors standing. */
export function clearStatusOverride(form: HTMLFormElement, transientOnly = false): void {
  const status = statusOf(form);
  if (transientOnly && !status.transient) return;
  status.override = null;
  status.transient = false;
  renderStatus(form);
}

export function setReadOnlyStatus(form: HTMLFormElement, text: string | null): void {
  statusOf(form).readOnly = text;
  renderStatus(form);
}

export function setUpdateStatus(form: HTMLFormElement, text: string | null): void {
  statusOf(form).update = text;
  renderStatus(form);
}

export function setStandingStatus(form: HTMLFormElement, text: string): void {
  statusOf(form).standing = text;
  renderStatus(form);
}

/** Native validation off: a blank answer is a real answer. 02 R4.9 */
export function prepareForm(form: HTMLFormElement): void {
  form.noValidate = true;
}

/** The form's identity as `matchForm` reads it; `index` counts every form of the document. 02 R-K5 */
export function identityOf(form: HTMLFormElement): FormIdentity {
  const doc = form.ownerDocument;
  return {
    id: form.getAttribute("id") || null,
    title: normalizeTitle(form.getAttribute(TITLE_ATTRIBUTE)),
    index: allForms(doc).indexOf(form),
    fields: new Set(answerControls(form).map((control) => control.name)),
  };
}

/** The key the form's drafts live under. 02 R-K5; DESIGN P12 */
export function formKeyOf(form: HTMLFormElement, revision: string): string {
  return formKey(identityOf(form), revision);
}

/** `<input type="file" accept="audio/*" capture>`: answered by a recorder, transcribed at submit. 02 R4.24a, R4.24b */
export function isAudioCaptureInput(element: Element | null): element is HTMLInputElement {
  if (!element || tagOf(element) !== "input" || (element as HTMLInputElement).type !== "file" || !element.hasAttribute("capture")) return false;
  return (element.getAttribute("accept") ?? "").split(",").some((token) => token.trim().toLowerCase() === "audio/*");
}

/** The form's file inputs' files, then `extra` (text-area attachments). Limits refuse, never cut. 02 R4.20, R4.62 */
export function filesOf(form: HTMLFormElement, extra: readonly SubmitFile[] = []): SubmitFile[] {
  const out: SubmitFile[] = [];
  for (const control of controlsOf(form)) {
    if (tagOf(control) !== "input" || (control as HTMLInputElement).type !== "file") continue;
    const input = control as HTMLInputElement;
    if (input.disabled) continue;
    const transcribe = isAudioCaptureInput(input);
    for (const file of Array.from(input.files ?? [])) out.push({ field: input.name || "file", file, ...(transcribe ? { transcribe: true } : {}) });
  }
  return [...out, ...extra];
}

/** Why a form's files cannot be sent, or null. 02 R4.23, R4.62 */
export function fileLimitProblem(files: readonly { file: { name: string; size: number } }[]): string | null {
  if (files.length > LIMITS.uploadsPerForm) return `This form has ${files.length} files; at most ${LIMITS.uploadsPerForm} can be sent at once. Remove ${files.length - LIMITS.uploadsPerForm} and send again.`;
  const large = files.find((entry) => entry.file.size > LIMITS.uploadFileBytes);
  return large ? `“${large.file.name}” is larger than ${mebibytes(LIMITS.uploadFileBytes)}; remove it and send again.` : null;
}

/** Disables the controls that were enabled, remembering them for restore. 02 R4.8 */
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

/** The answer's title: `data-title`, else the first `h1`, else "Thread Page". 02 §The answer wording */
export function titleOf(form: HTMLFormElement): string {
  const explicit = normalizeTitle(form.getAttribute(TITLE_ATTRIBUTE));
  if (explicit) return explicit.slice(0, 300);
  const heading = form.ownerDocument.querySelector("h1");
  return normalizeTitle((heading?.textContent || "").replace(/\s+/g, " "))?.slice(0, 300) || "Thread Page";
}

export interface SubmitIntent {
  submissionId: string;
  form: HTMLFormElement;
  title: string;
  identity: FormIdentity;
  /** The submitter's value; null when the form was sent another way. 05 R2.36 */
  action: string | null;
  answers: ReturnType<typeof collectAnswers>;
  files: SubmitFile[];
}

export function buildIntent(form: HTMLFormElement, submitter: HTMLElement | null, submissionId: string, attached: readonly SubmitFile[] = []): SubmitIntent {
  return { submissionId, form, title: titleOf(form), identity: identityOf(form), action: actionOf(submitter), answers: collectAnswers(form, submitter), files: filesOf(form, attached) };
}

export function newSubmissionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
