// `DraftRecord`, `DraftKey`, `draftKeyOf`, the never-drafted rule `isDraftable(control)` as a pure predicate (02 R-K4, R-K4a; DR-22 decided as the spec says).

/** One form's draft: the values typed, where the caret was, when, against which revision. 02 R-K4; DESIGN §D.3 */
export interface DraftRecord {
  form: DraftFormRef;
  fields: Record<string, DraftValue>;
  focus: DraftFocus | null;
  savedAtMs: number;
  revision: string;
}

/** `formKey()`: "id:<id>" | "title:<data-title>" | "none:<revision>:<n>" | "ctl:<id>" | "ctl:name:<name>" for a control outside any form. */
export interface DraftFormRef {
  key: string;
}

/** Text, a multi-select's or a group's checked values, or a lone checkbox. DESIGN P13 */
export type DraftValue = string | string[] | boolean;

export interface DraftFocus {
  name: string;
  selectionStart: number;
  selectionEnd: number;
}

/** The shell's storage keys. DESIGN §D.3 */
export const DRAFT_KEY_PREFIX = "up:draft:";
export const DRAFT_INDEX_PREFIX = "up:drafts:";

export type DraftKey = `${typeof DRAFT_KEY_PREFIX}${string}`;

export function draftKeyOf(session: string, documentPath: string, formKey: string): DraftKey {
  return `${DRAFT_KEY_PREFIX}${session}:${documentPath}:${formKey}`;
}

export function draftIndexKeyOf(session: string): string {
  return `${DRAFT_INDEX_PREFIX}${session}`;
}

/** The input types whose value is a draft. 02 R-K4; DESIGN §D.3 */
export const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(["text", "search", "url", "tel", "email", "number", "date", "datetime-local", "month", "week", "time", "color", "range"]);
export const CHECKED_INPUT_TYPES: ReadonlySet<string> = new Set(["checkbox", "radio"]);

/** The `autocomplete` values that mean never drafted. 02 R-K4a */
export const NEVER_DRAFTED_AUTOCOMPLETE: ReadonlySet<string> = new Set(["off", "current-password", "new-password", "one-time-code"]);

/** What `isDraftable` reads of a control: its tag, type, autocomplete, its form's autocomplete, and how it is keyed. */
export interface DraftableControl {
  tag: "input" | "textarea" | "select" | string;
  type?: string | null;
  autocomplete?: string | null;
  formAutocomplete?: string | null;
  /** Whether the control belongs to a form (as a descendant or by `form=`). */
  inForm: boolean;
  name?: string | null;
  id?: string | null;
  /** `contenteditable` elements are never drafted (DR-22). */
  contentEditable?: boolean;
}

/**
 * The never-drafted rule, pure and shared by kernel and shell: `input` of
 * the text-like and checked types, `textarea` and `select`; never a password,
 * a control or form with `autocomplete` off (the password-family values count
 * as off), a file input, a `contenteditable`, a control in a form with no
 * `name`, or one outside a form with neither `id` nor `name`. 02 R-K4, R-K4a
 */
export function isDraftable(control: DraftableControl): boolean {
  if (control.contentEditable) return false;
  const tag = control.tag.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
  if (tag === "input") {
    const type = (control.type ?? "text").trim().toLowerCase();
    if (type === "password" || type === "file") return false;
    if (!TEXT_INPUT_TYPES.has(type) && !CHECKED_INPUT_TYPES.has(type)) return false;
  }
  const autocomplete = (control.autocomplete ?? "").trim().toLowerCase();
  if (NEVER_DRAFTED_AUTOCOMPLETE.has(autocomplete)) return false;
  if ((control.formAutocomplete ?? "").trim().toLowerCase() === "off") return false;
  if (control.inForm) return Boolean(control.name);
  if (tag === "input") {
    const type = (control.type ?? "text").trim().toLowerCase();
    if (!TEXT_INPUT_TYPES.has(type)) return false;
  }
  if (tag === "select") return false;
  return Boolean(control.id || control.name);
}

export function isDraftValue(value: unknown): value is DraftValue {
  return typeof value === "string" || typeof value === "boolean" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

export function isDraftFormRef(value: unknown): value is DraftFormRef {
  return typeof value === "object" && value !== null && typeof (value as DraftFormRef).key === "string" && (value as DraftFormRef).key.length > 0 && (value as DraftFormRef).key.length <= 1024;
}

export function isDraftFocus(value: unknown): value is DraftFocus {
  if (typeof value !== "object" || value === null) return false;
  const focus = value as DraftFocus;
  return typeof focus.name === "string" && Number.isSafeInteger(focus.selectionStart) && Number.isSafeInteger(focus.selectionEnd) && focus.selectionStart >= 0 && focus.selectionEnd >= 0;
}

export function isDraftFields(value: unknown): value is Record<string, DraftValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([name, item]) => name.length <= 512 && isDraftValue(item));
}

export function isDraftRecord(value: unknown): value is DraftRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as DraftRecord;
  return isDraftFormRef(record.form) && isDraftFields(record.fields) && (record.focus === null || isDraftFocus(record.focus)) && Number.isSafeInteger(record.savedAtMs) && typeof record.revision === "string" && /^[a-f0-9]{64}$/.test(record.revision);
}
