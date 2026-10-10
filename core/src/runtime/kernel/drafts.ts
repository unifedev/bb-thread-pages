// Debounced `draft` messages (250 ms), flush on `flush`/`pagehide`/hidden, restore on `restore` (events fired, non-empty fields not overwritten), the never-drafted rule, `matchForm` on restore (02 R-K4, R-K4a, R-K5, R-K7; DESIGN §D.3).
import { controlKey, matchForm, type FormIdentity, type WantedForm } from "../../domain/forms/identity.ts";
import { LIMITS } from "../../domain/limits.ts";
import { isDraftable, type DraftFocus, type DraftRecord, type DraftValue } from "../shared/drafts.ts";
import type { KernelMessage } from "../shared/protocol.ts";
import { allForms, identityOf, formKeyOf, ownerForm, setStatus, tagOf } from "./forms.ts";
import type { KernelPrimitives } from "./primitives.ts";

export type DraftControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface Drafts {
  /** Sends every pending draft now. 02 R-K4 */
  flush(): void;
  /** Restores records into matching forms; returns the control to focus once shown. DESIGN §D.3 restore rule */
  restore(records: readonly DraftRecord[], clearedNotice: readonly { form: { key: string }; fields: string[] }[]): { restored: number; focus: DraftControl | null };
  /** The form (or the document, for a bare control) was delivered: nothing of it is a draft any more. */
  forget(form: HTMLFormElement): void;
  /** Focus and selection to the restored control, once the frame is shown. */
  focusRestored(): void;
}

export interface DraftsDeps {
  revision: string;
  send(message: KernelMessage): void;
  prim: KernelPrimitives;
  /** A shell notice for a form's status. */
  notice?(form: HTMLFormElement | null, text: string): void;
}

function isControl(node: unknown): node is DraftControl {
  const tag = tagOf(node as Element);
  return tag === "input" || tag === "textarea" || tag === "select";
}

/** The pure predicate over the control's attributes. 02 R-K4a */
export function draftable(control: DraftControl, form: HTMLFormElement | null): boolean {
  return isDraftable({
    tag: tagOf(control),
    type: control.getAttribute("type"),
    autocomplete: control.getAttribute("autocomplete"),
    formAutocomplete: form?.getAttribute("autocomplete") ?? null,
    inForm: form !== null,
    name: control.getAttribute("name"),
    id: control.getAttribute("id"),
    contentEditable: control.isContentEditable === true,
  });
}

function isChecked(control: DraftControl): boolean {
  const type = ((control as HTMLInputElement).type || "").toLowerCase();
  return tagOf(control) === "input" && (type === "checkbox" || type === "radio");
}

/** The draftable controls of a form (descendants and `form=`-associated), by name, groups collapsed. */
export function fieldsOf(form: HTMLFormElement): { fields: Record<string, DraftValue>; cleared: string[]; empty: boolean } {
  const fields: Record<string, DraftValue> = {};
  const cleared: string[] = [];
  const seen = new Set<string>();
  let empty = true;
  const controls = Array.from(form.elements).filter(isControl);
  for (const control of controls) {
    const name = control.name;
    if (!name || seen.has(name)) continue;
    if (!draftable(control, form)) {
      // A never-drafted field with a value: named, never valued. 02 R-K4a
      if (!isChecked(control) && (control as HTMLInputElement).type !== "file" && control.value !== "") cleared.push(name);
      seen.add(name);
      continue;
    }
    seen.add(name);
    const value = valueOf(control, controls.filter((item) => item.name === name));
    fields[name] = value;
    if (!isEmptyValue(value)) empty = false;
  }
  return { fields, cleared, empty };
}

export function valueOf(control: DraftControl, group: DraftControl[]): DraftValue {
  if (isChecked(control)) {
    const boxes = group.filter(isChecked) as HTMLInputElement[];
    if (boxes.length === 1 && (boxes[0]!.type || "").toLowerCase() === "checkbox") return boxes[0]!.checked;
    return boxes.filter((box) => box.checked).map((box) => box.value);
  }
  if (tagOf(control) === "select" && (control as HTMLSelectElement).multiple) return Array.from((control as HTMLSelectElement).selectedOptions).map((option) => option.value);
  return String(control.value ?? "");
}

export function isEmptyValue(value: DraftValue): boolean {
  return value === "" || value === false || (Array.isArray(value) && value.length === 0);
}

/** Whether the page filled the control: a text value present, a checkable or select state other than its default. DESIGN §D.3 restore rule */
export function pageFilled(control: DraftControl, group: DraftControl[]): boolean {
  if (isChecked(control)) return group.some((item) => (item as HTMLInputElement).checked !== (item as HTMLInputElement).defaultChecked);
  if (tagOf(control) === "select") return Array.from((control as HTMLSelectElement).options).some((option) => option.selected !== option.defaultSelected);
  return control.value !== "";
}

function fire(control: DraftControl, win: Window & typeof globalThis): void {
  control.dispatchEvent(new win.Event("input", { bubbles: true }));
  control.dispatchEvent(new win.Event("change", { bubbles: true }));
}

/** Applies one value: text, checked state, selected options; then `input` and `change`. 02 R-K4 */
export function applyValue(control: DraftControl, group: DraftControl[], value: DraftValue, win: Window & typeof globalThis): boolean {
  if (isChecked(control)) {
    const boxes = group.filter(isChecked) as HTMLInputElement[];
    if (typeof value === "boolean") {
      if (boxes.length !== 1) return false;
      boxes[0]!.checked = value;
      fire(boxes[0]!, win);
      return true;
    }
    if (!Array.isArray(value)) return false;
    for (const box of boxes) box.checked = value.includes(box.value);
    for (const box of boxes) if (box.checked) fire(box, win);
    if (!boxes.some((box) => box.checked) && boxes[0]) fire(boxes[0], win);
    return true;
  }
  if (tagOf(control) === "select") {
    const select = control as HTMLSelectElement;
    if (select.multiple && Array.isArray(value)) {
      for (const option of Array.from(select.options)) option.selected = value.includes(option.value);
    } else if (typeof value === "string") select.value = value;
    else return false;
    fire(select, win);
    return true;
  }
  if (typeof value !== "string") return false;
  control.value = value;
  fire(control, win);
  return true;
}

/** `WantedForm` and the index from a draft key. DESIGN §D.3 keys */
export function wantedFromKey(key: string, fields: readonly string[], revision: string): { wanted: WantedForm; index?: number } | null {
  if (key.startsWith("id:")) return { wanted: { formId: key.slice(3), formTitle: null, writtenAgainst: revision, fields } };
  if (key.startsWith("title:")) return { wanted: { formId: null, formTitle: key.slice(6), writtenAgainst: revision, fields } };
  const none = /^none:([a-f0-9]{64}):(\d+)$/.exec(key);
  if (none) return { wanted: { formId: null, formTitle: null, writtenAgainst: none[1]!, fields }, index: Number(none[2]) };
  return null;
}

export function createDrafts(win: Window & typeof globalThis, deps: DraftsDeps): Drafts {
  const doc = win.document;
  const timers = new Map<HTMLFormElement | DraftControl, ReturnType<typeof setTimeout>>();
  let focusTarget: { control: DraftControl; focus: DraftFocus | null } | null = null;

  function bareKey(control: DraftControl): string | null {
    return controlKey({ id: control.getAttribute("id"), name: control.getAttribute("name") });
  }

  function focusOf(form: HTMLFormElement | null, controls: DraftControl[]): DraftFocus | null {
    const active = doc.activeElement;
    if (!isControl(active) || !controls.includes(active) || !active.name) return null;
    if (form !== null && !draftable(active, form)) return null;
    const text = active as HTMLInputElement;
    return { name: active.name, selectionStart: Math.max(0, text.selectionStart ?? 0), selectionEnd: Math.max(0, text.selectionEnd ?? 0) };
  }

  function sendForm(form: HTMLFormElement): void {
    const { fields, cleared } = fieldsOf(form);
    // A form with no draftable field at all (autocomplete="off" on the form) sends nothing. 02 R-K4a
    if (Object.keys(fields).length === 0) return;
    const empty = Object.values(fields).every(isEmptyValue);
    deps.send({ kind: "thread-page:draft", form: { key: formKeyOf(form, deps.revision) }, fields: empty ? {} : fields, focus: empty ? null : focusOf(form, Array.from(form.elements).filter(isControl)), cleared });
  }

  function sendBare(control: DraftControl): void {
    const key = bareKey(control);
    if (!key) return;
    const name = control.name || control.id;
    const value = valueOf(control, [control]);
    deps.send({ kind: "thread-page:draft", form: { key }, fields: isEmptyValue(value) ? {} : { [name]: value }, focus: isEmptyValue(value) ? null : focusOf(null, [control]), cleared: [] });
  }

  function send(target: HTMLFormElement | DraftControl): void {
    const timer = timers.get(target);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(target);
    if (!target.isConnected) return;
    if (tagOf(target) === "form") sendForm(target as HTMLFormElement);
    else sendBare(target as DraftControl);
  }

  function schedule(target: HTMLFormElement | DraftControl): void {
    const existing = timers.get(target);
    if (existing !== undefined) clearTimeout(existing);
    timers.set(target, setTimeout(() => send(target), LIMITS.draftDebounceMs));
  }

  function targetOf(control: DraftControl): HTMLFormElement | DraftControl | null {
    const form = ownerForm(control);
    if (form) return control.name ? form : null;
    // A bare control: drafted when text-like and keyed by id or name. 02 R-K4
    return draftable(control, null) ? control : null;
  }

  function onInput(event: Event): void {
    const control = event.target;
    if (!isControl(control)) return;
    const target = targetOf(control);
    if (target) schedule(target);
  }

  function flush(): void {
    for (const target of Array.from(timers.keys())) send(target);
  }

  function restoreBare(record: DraftRecord): DraftControl | null {
    const key = record.form.key;
    const candidates = Array.from(doc.querySelectorAll("input,textarea")).filter(isControl).filter((control) => ownerForm(control) === null && bareKey(control) === key);
    const control = candidates[0];
    if (!control || !draftable(control, null)) return null;
    const name = control.name || control.id;
    const value = record.fields[name];
    if (value === undefined || isEmptyValue(value) || pageFilled(control, [control])) return null;
    return applyValue(control, [control], value, win) ? control : null;
  }

  function restoreForm(record: DraftRecord, current: { form: HTMLFormElement; identity: FormIdentity }[]): { form: HTMLFormElement; applied: string[]; control: DraftControl | null } | null {
    const names = Object.keys(record.fields);
    const parsed = wantedFromKey(record.form.key, names, record.revision);
    if (!parsed) return null;
    const matched = matchForm(current.map((entry) => entry.identity), parsed.wanted, deps.revision, parsed.index);
    const entry = matched ? current.find((candidate) => candidate.identity === matched) : undefined;
    if (!entry) return null;
    const controls = Array.from(entry.form.elements).filter(isControl);
    const applied: string[] = [];
    let focused: DraftControl | null = null;
    for (const name of names) {
      const group = controls.filter((control) => control.name === name);
      const control = group[0];
      if (!control || !draftable(control, entry.form)) continue;
      const value = record.fields[name]!;
      if (isEmptyValue(value) || pageFilled(control, group)) continue;
      if (applyValue(control, group, value, win)) {
        applied.push(name);
        if (record.focus && record.focus.name === name) focused = control;
      }
    }
    return { form: entry.form, applied, control: focused };
  }

  // A form sends its draft at most 250 ms behind the keystroke; hidden and leaving send at once. 02 R-K4
  deps.prim.on(doc, "input", onInput, true);
  deps.prim.on(doc, "change", onInput, true);
  deps.prim.on(doc, "visibilitychange", () => {
    if (doc.visibilityState === "hidden") flush();
  });
  deps.prim.on(win, "pagehide", () => flush());

  return {
    flush,
    restore(records, clearedNotice) {
      const current = allForms(doc).map((form) => ({ form, identity: identityOf(form) }));
      let restored = 0;
      focusTarget = null;
      for (const record of records) {
        if (record.form.key.startsWith("ctl:")) {
          const control = restoreBare(record);
          if (!control) continue;
          restored += 1;
          send(control);
          if (record.focus) focusTarget = { control, focus: record.focus };
          continue;
        }
        const outcome = restoreForm(record, current);
        if (!outcome || outcome.applied.length === 0) continue;
        restored += outcome.applied.length;
        // The shell learns at once which drafts landed on this version. DESIGN §D.3 panel
        send(outcome.form);
        if (outcome.control) focusTarget = { control: outcome.control, focus: record.focus };
      }
      for (const notice of clearedNotice) {
        const parsed = wantedFromKey(notice.form.key, notice.fields, deps.revision);
        const matched = parsed ? matchForm(current.map((entry) => entry.identity), { ...parsed.wanted, fields: [] }, deps.revision, parsed.index) : null;
        const entry = matched ? current.find((candidate) => candidate.identity === matched) : undefined;
        const text = notice.fields.length === 1 ? `Your ${notice.fields[0]} was not kept across the update` : "Some fields were not kept across the update";
        if (entry) setStatus(entry.form, text);
        else deps.notice?.(null, text);
      }
      return { restored, focus: focusTarget?.control ?? null };
    },
    forget(form) {
      const timer = timers.get(form);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(form);
      deps.send({ kind: "thread-page:draft", form: { key: formKeyOf(form, deps.revision) }, fields: {}, focus: null, cleared: [] });
    },
    focusRestored() {
      const target = focusTarget;
      focusTarget = null;
      if (!target || !target.control.isConnected) return;
      try {
        target.control.focus({ preventScroll: true });
        const text = target.control as HTMLInputElement;
        if (target.focus && typeof text.setSelectionRange === "function") text.setSelectionRange(Math.min(target.focus.selectionStart, text.value.length), Math.min(target.focus.selectionEnd, text.value.length));
      } catch {
        // A control that cannot take the caret keeps its text.
      }
    },
  };
}
