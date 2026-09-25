import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { controlsOf, filesOf, isManualForm, MANUAL_ATTRIBUTE, ownerForm } from "./forms.ts";
import type { RecordAnswer } from "./record-client.ts";

/**
 * Every text area can take voice and files. spec R4.55–R4.62, DECISIONS D39
 *
 * The agent writes a plain `<textarea>`; the kernel draws two controls over
 * its bottom-right corner — Dictate and Attach files — and, under it, the
 * files the reader attached. None of it touches the field or the page's CSS:
 * everything lives in one shadow root whose host element is the last child of
 * `<html>`, placed from the field's box by inline `!important` declarations,
 * so page rules on `*`, `button` or `body …` cannot move, hide or restyle it,
 * and it takes no layout space.
 *
 * These controls are page territory: page script can cover or imitate them
 * (R3.33). Dictate only asks the shell for its recording bar, whose Done is
 * the consent; Attach only adds files to an answer the reader still sends.
 */
export interface TextAreaDeps {
  /** Inside an embed there is no Attach (R4.51a). */
  embedded: boolean;
  /** Whether this page's forms can upload at all (not the built-in home, R4.60). */
  uploads: boolean;
  isReadOnly(): boolean;
  /** Opens the shell's recording bar; resolves with the transcript. */
  dictate(prompt: string): Promise<RecordAnswer>;
  /** Attaching or removing a file marks the page dirty, as typing does. spec R4.61 */
  markDirty(form: HTMLFormElement): void;
}

export interface TextAreaControls {
  prepare(root: ParentNode): void;
  /** Whether Dictate may be shown: the shell says the reader can record here. spec R4.59 */
  setVoice(available: boolean): void;
  /** The files attached to the form's text areas, for its answer. spec R4.62 */
  filesOf(form: HTMLFormElement): SubmitFile[];
  /** Places the controls again now (tests, and after the page changes state). */
  update(): void;
}

export const LAYER_TAG = "thread-page-controls";
const BUTTON = 24;
const GAP = 2;
const INSET = 3;
/** Clear of the resize handle a resizable field draws in its corner. */
const HANDLE = 14;
const NOTE_MS = 8_000;

/** The layer's host: fixed, out of flow, above the page — declared inline and `!important`, so no page rule moves or hides it. spec R4.57 */
const HOST_STYLE = [
  "all:initial",
  "position:fixed",
  "top:0",
  "left:0",
  "width:0",
  "height:0",
  "margin:0",
  "padding:0",
  "border:0",
  "display:block",
  "visibility:visible",
  "opacity:1",
  "transform:none",
  "filter:none",
  "clip-path:none",
  "overflow:visible",
  "pointer-events:none",
  "z-index:2147483647",
]
  .map((declaration) => `${declaration} !important`)
  .join(";");

const LAYER_CSS = `
:host{all:initial !important;display:block !important;position:fixed !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;overflow:visible !important;pointer-events:none !important;z-index:2147483647 !important}
*{box-sizing:border-box}
.group{position:fixed;display:flex;gap:${GAP}px;pointer-events:auto;margin:0;padding:0}
.group[hidden],.list[hidden],[hidden]{display:none !important}
button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:${BUTTON}px;height:${BUTTON}px;border-radius:5px;border:1px solid transparent;color:var(--ink);opacity:.55;cursor:pointer;background:transparent}
button:hover,button:focus-visible{opacity:1;background:var(--hover);border-color:var(--edge)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
button[aria-busy=true]{opacity:1;cursor:progress}
svg{display:block;width:16px;height:16px;pointer-events:none}
.list{position:fixed;display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;pointer-events:auto;font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
.chip,.note{display:inline-flex;align-items:center;gap:2px;max-width:100%;min-height:20px;padding:1px 2px 1px 8px;border:1px solid var(--edge);border-radius:999px;color:var(--ink);background:var(--paper)}
.note{padding-right:8px;border-style:dashed}
.chip span,.note span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip button{width:18px;height:18px;border-radius:999px}
.chip svg{width:12px;height:12px}
`;

const ICON = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
const MIC = ICON('<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>');
const CLIP = ICON('<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>');
const REMOVE = ICON('<path d="M6 6l12 12M18 6L6 18"/>');

interface Entry {
  field: HTMLTextAreaElement;
  group: HTMLElement;
  dictate: HTMLButtonElement;
  attach: HTMLButtonElement;
  list: HTMLElement;
  picker: HTMLInputElement;
  files: File[];
  note: { text: string; until: number } | null;
  busy: boolean;
  /** What the list shows, so it is redrawn only when that changes. */
  drawn: string;
}

/** A size in the words the list uses. */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/** `rgb(r, g, b)` / `rgba(…)` as the field computes its colour, with another alpha. */
function withAlpha(color: string, alpha: number): string {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

function isTextArea(element: unknown): element is HTMLTextAreaElement {
  return typeof element === "object" && element !== null && (element as Element).tagName?.toLowerCase() === "textarea";
}

/** Opted out on the field, or on its form (descendant or associated). spec R4.6a */
function optedOut(field: HTMLTextAreaElement): boolean {
  if (field.hasAttribute(MANUAL_ATTRIBUTE)) return true;
  const form = ownerForm(field);
  return form !== null && isManualForm(form);
}

function matchesSafely(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    // An engine without the selector has no such top layer.
    return false;
  }
}

function inTopLayer(field: Element): boolean {
  for (let node = field.parentElement; node; node = node.parentElement) {
    if (matchesSafely(node, ":modal") || matchesSafely(node, ":popover-open")) return true;
  }
  return false;
}

/** Elements that take focus with Tab, in document order; enough to find what follows a field. */
const TABBABLE = "a[href],area[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable]:not([contenteditable=false])";

export function createTextAreaControls(win: Window & typeof globalThis, deps: TextAreaDeps): TextAreaControls {
  const doc = win.document;
  const entries = new Map<HTMLTextAreaElement, Entry>();
  const touched = new WeakSet<HTMLTextAreaElement>();
  let voice = false;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let scheduled = 0;
  let resizeObserver: ResizeObserver | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  function layer(): ShadowRoot | null {
    if (root) {
      // The host stays the last child of <html>, outside <body>. spec R4.57
      if (host && doc.documentElement && (host.parentNode !== doc.documentElement || doc.documentElement.lastElementChild !== host)) doc.documentElement.appendChild(host);
      return root;
    }
    if (!doc.documentElement || typeof (doc.documentElement as Element & { attachShadow?: unknown }).attachShadow !== "function") return null;
    host = doc.createElement(LAYER_TAG);
    host.setAttribute("style", HOST_STYLE);
    root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = LAYER_CSS;
    root.appendChild(style);
    doc.documentElement.appendChild(host);
    return root;
  }

  function attachable(field: HTMLTextAreaElement): HTMLFormElement | null {
    if (deps.embedded || !deps.uploads) return null;
    const form = ownerForm(field);
    return form && !isManualForm(form) ? form : null;
  }

  function note(entry: Entry, text: string): void {
    entry.note = { text, until: Date.now() + NOTE_MS };
    schedule();
    setTimeout(schedule, NOTE_MS + 50);
  }

  function formFiles(form: HTMLFormElement): number {
    return filesOf(form, collected(form)).length;
  }

  /** Adds files to a field's list, refusing visibly what would go over the form's limits. spec R4.62 */
  function add(entry: Entry, files: File[]): void {
    const form = attachable(entry.field);
    if (!form || files.length === 0) return;
    const refused: string[] = [];
    let added = 0;
    for (const file of files) {
      if (file.size > LIMITS.uploadFileBytes) {
        refused.push(`“${file.name}” is larger than ${mebibytes(LIMITS.uploadFileBytes)}`);
        continue;
      }
      if (formFiles(form) >= LIMITS.uploadsPerForm) {
        refused.push(`at most ${LIMITS.uploadsPerForm} files per form`);
        break;
      }
      entry.files.push(file);
      added += 1;
    }
    if (added > 0) deps.markDirty(form);
    if (refused.length > 0) note(entry, `Not added: ${refused.join("; ")}`);
    schedule();
  }

  function remove(entry: Entry, index: number): void {
    const form = attachable(entry.field) ?? ownerForm(entry.field);
    entry.files.splice(index, 1);
    if (form) deps.markDirty(form);
    schedule();
    // The keyboard stays in the list, or returns to the field.
    setTimeout(() => {
      const next = entry.list.querySelector("button");
      (next ?? entry.field).focus?.();
    }, 0);
  }

  async function dictate(entry: Entry): Promise<void> {
    if (entry.busy) return;
    const field = entry.field;
    const value = field.value;
    // The caret the field had when Dictate was pressed; an untouched field is answered at its end.
    const start = touched.has(field) ? Math.min(field.selectionStart ?? value.length, value.length) : value.length;
    const end = touched.has(field) ? Math.min(Math.max(field.selectionEnd ?? start, start), value.length) : start;
    entry.busy = true;
    entry.dictate.setAttribute("aria-busy", "true");
    let answer: RecordAnswer;
    try {
      answer = await deps.dictate(value.slice(0, start).slice(-LIMITS.voicePromptChars));
    } finally {
      entry.busy = false;
      entry.dictate.removeAttribute("aria-busy");
    }
    if (!answer.ok) {
      // Cancel and a too-short recording leave the field as it was; a failure is said. spec R4.58
      if (answer.code !== "cancelled") note(entry, `Dictation failed: ${answer.message}`);
      return;
    }
    const text = (answer.text ?? "").trim();
    if (!text || field.disabled || field.readOnly || !field.isConnected) return;
    insert(field, Math.min(start, field.value.length), Math.min(end, field.value.length), text);
  }

  /** Inserts at the caret with a separating space where the text beside it needs one, then `input` and `change`. spec R4.58 */
  function insert(field: HTMLTextAreaElement, start: number, end: number, spoken: string): void {
    const before = field.value.slice(0, start);
    const after = field.value.slice(end);
    let text = spoken;
    if (before && !/\s$/.test(before)) text = ` ${text}`;
    if (after && !/^\s/.test(after)) text = `${text} `;
    try {
      field.focus({ preventScroll: true });
      field.setSelectionRange(start, end);
    } catch {
      // A field that cannot take the caret still takes the text.
    }
    const previous = field.value;
    let inserted = false;
    try {
      // The editing command keeps the reader's undo history and fires `input` itself.
      inserted = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text) && field.value !== previous;
    } catch {
      inserted = false;
    }
    if (!inserted) {
      field.value = previous;
      field.setRangeText(text, start, end, "end");
      field.dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    field.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  function create(field: HTMLTextAreaElement): Entry | null {
    const shadow = layer();
    if (!shadow) return null;
    const group = doc.createElement("div");
    group.className = "group";
    group.hidden = true;
    const dictateButton = doc.createElement("button");
    dictateButton.type = "button";
    dictateButton.innerHTML = MIC;
    dictateButton.setAttribute("aria-label", "Dictate");
    dictateButton.title = "Dictate";
    const attachButton = doc.createElement("button");
    attachButton.type = "button";
    attachButton.innerHTML = CLIP;
    attachButton.setAttribute("aria-label", "Attach files");
    attachButton.title = "Attach files";
    // Reached by Tab right after their field, which the kernel does itself (below), not at the end of the document.
    dictateButton.tabIndex = -1;
    attachButton.tabIndex = -1;
    const picker = doc.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.hidden = true;
    picker.tabIndex = -1;
    group.append(dictateButton, attachButton, picker);
    const list = doc.createElement("ul");
    list.className = "list";
    list.hidden = true;
    list.setAttribute("aria-label", "Attached files");
    shadow.append(group, list);
    const entry: Entry = { field, group, dictate: dictateButton, attach: attachButton, list, picker, files: [], note: null, busy: false, drawn: "" };
    dictateButton.addEventListener("click", () => void dictate(entry));
    attachButton.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
      add(entry, Array.from(picker.files ?? []));
      picker.value = "";
    });
    for (const button of [dictateButton, attachButton]) button.addEventListener("keydown", (event) => onControlKey(entry, event));
    resizeObserver?.observe(field);
    return entry;
  }

  function discover(from: ParentNode): void {
    const found: HTMLTextAreaElement[] = [];
    if (isTextArea(from)) found.push(from);
    if (typeof (from as ParentNode).querySelectorAll === "function") found.push(...Array.from(from.querySelectorAll("textarea")));
    for (const field of found) {
      if (entries.has(field) || optedOut(field)) continue;
      const entry = create(field);
      if (entry) entries.set(field, entry);
    }
    if (entries.size > 0 && ticker === null) {
      // Layout moves without telling anyone (an image loads above a field); look again now and then.
      ticker = setInterval(() => {
        if (doc.visibilityState !== "hidden") schedule();
      }, 750);
    }
  }

  /** The part of the field the reader can actually see: the viewport, and every clipping ancestor. */
  function visibleBox(field: HTMLElement, rect: DOMRect): { left: number; top: number; right: number; bottom: number } | null {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    const clip = (other: { left: number; top: number; right: number; bottom: number }) => {
      box = { left: Math.max(box.left, other.left), top: Math.max(box.top, other.top), right: Math.min(box.right, other.right), bottom: Math.min(box.bottom, other.bottom) };
    };
    clip({ left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight });
    for (let node = field.parentElement; node && node !== doc.documentElement && node !== doc.body; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const outer = node.getBoundingClientRect();
        clip({ left: outer.left + node.clientLeft, top: outer.top + node.clientTop, right: outer.left + node.clientLeft + node.clientWidth, bottom: outer.top + node.clientTop + node.clientHeight });
      }
    }
    return box.right > box.left && box.bottom > box.top ? box : null;
  }

  /** Nothing of the page's lies over this point of the field — a dialog, a sticky header. */
  function uncovered(field: HTMLElement, x: number, y: number): boolean {
    if (typeof doc.elementsFromPoint !== "function") return true;
    const stack = doc.elementsFromPoint(x, y).filter((element) => element !== host);
    return stack.length === 0 || stack[0] === field;
  }

  function shown(field: HTMLTextAreaElement): boolean {
    if (field.disabled || field.readOnly || field.hidden || !field.isConnected || optedOut(field)) return false;
    // An offline copy answers nothing: its fields lose the controls too. spec R4.55
    if (deps.isReadOnly()) return false;
    if (field.getClientRects().length === 0) return false;
    // A modal dialog or an open popover is painted above everything, the layer included: the
    // controls would sit under it, so a field there gets none rather than hidden ones.
    if (inTopLayer(field)) return false;
    const check = (field as HTMLElement & { checkVisibility?(options: object): boolean }).checkVisibility;
    if (typeof check === "function" && !check.call(field, { visibilityProperty: true, contentVisibilityAuto: true })) return false;
    return win.getComputedStyle(field).visibility === "visible";
  }

  function drawList(entry: Entry, removable: boolean): void {
    const noteText = entry.note && entry.note.until > Date.now() ? entry.note.text : "";
    if (!noteText) entry.note = null;
    const print = JSON.stringify([entry.files.map((file) => [file.name, file.size]), noteText, removable]);
    if (print === entry.drawn) return;
    entry.drawn = print;
    entry.list.replaceChildren();
    entry.files.forEach((file, index) => {
      const item = doc.createElement("li");
      item.className = "chip";
      const name = doc.createElement("span");
      name.textContent = `${file.name} (${sizeLabel(file.size)})`;
      item.title = file.name;
      item.append(name);
      if (removable) {
        const drop = doc.createElement("button");
        drop.type = "button";
        drop.innerHTML = REMOVE;
        drop.setAttribute("aria-label", `Remove ${file.name}`);
        drop.addEventListener("click", () => remove(entry, index));
        item.append(drop);
      }
      entry.list.append(item);
    });
    if (noteText) {
      const item = doc.createElement("li");
      item.className = "note";
      item.setAttribute("role", "status");
      const text = doc.createElement("span");
      text.textContent = noteText;
      item.append(text);
      entry.list.append(item);
    }
  }

  /** Places every field's controls and list from its box, or hides them. */
  function update(): void {
    scheduled = 0;
    if (entries.size > 0) layer();
    for (const [field, entry] of entries) {
      if (!field.isConnected) {
        entry.group.remove();
        entry.list.remove();
        resizeObserver?.unobserve(field);
        entries.delete(field);
        continue;
      }
      const visible = shown(field);
      const form = attachable(field);
      const withDictate = visible && voice;
      const withAttach = visible && form !== null;
      entry.dictate.hidden = !withDictate;
      entry.attach.hidden = !withAttach;
      const rect = field.getBoundingClientRect();
      const box = visible ? visibleBox(field, rect) : null;
      const style = win.getComputedStyle(field);
      const ink = style.color || "rgb(0,0,0)";
      const paper = /rgba?\([^)]*,\s*0\)|transparent/.test(style.backgroundColor) ? win.getComputedStyle(doc.body ?? doc.documentElement).backgroundColor : style.backgroundColor;
      for (const node of [entry.group, entry.list]) {
        node.style.setProperty("--ink", ink);
        node.style.setProperty("--hover", withAlpha(ink, 0.12));
        node.style.setProperty("--edge", withAlpha(ink, 0.3));
        node.style.setProperty("--paper", /rgba?\([^)]*,\s*0\)|transparent/.test(paper) ? "Canvas" : paper);
      }

      // The two controls, over the bottom-right corner, clear of a resize handle. spec R4.56
      const count = Number(withDictate) + Number(withAttach);
      const width = count * BUTTON + Math.max(0, count - 1) * GAP;
      const innerRight = rect.left + field.clientLeft + field.clientWidth;
      const innerBottom = rect.top + field.clientTop + field.clientHeight;
      const right = innerRight - (style.resize && style.resize !== "none" ? HANDLE : INSET);
      const left = right - width;
      const top = field.clientHeight < BUTTON + 2 * INSET ? rect.top + (rect.height - BUTTON) / 2 : innerBottom - BUTTON - INSET;
      const fits =
        count > 0 &&
        box !== null &&
        left >= box.left - 0.5 &&
        right <= box.right + 0.5 &&
        top >= box.top - 0.5 &&
        top + BUTTON <= box.bottom + 0.5 &&
        uncovered(field, left + width / 2, top + BUTTON / 2);
      entry.group.hidden = !fits;
      if (fits) {
        entry.group.style.left = `${Math.round(left)}px`;
        entry.group.style.top = `${Math.round(top)}px`;
      }

      // The attached files, just below the field's bottom edge, over what follows it. spec R4.61
      const listed = entry.files.length > 0 || entry.note !== null;
      const edgeVisible = box !== null && box.bottom >= rect.bottom - 1 && uncovered(field, rect.left + Math.min(rect.width / 2, 8), rect.bottom - 2);
      entry.list.hidden = !(listed && visible && edgeVisible);
      if (!entry.list.hidden) {
        drawList(entry, !field.disabled && !field.readOnly);
        entry.list.style.left = `${Math.round(rect.left)}px`;
        entry.list.style.top = `${Math.round(rect.bottom + 4)}px`;
        entry.list.style.maxWidth = `${Math.max(120, Math.round(rect.width))}px`;
      }
    }
    if (entries.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame(update) : (setTimeout(update, 16) as unknown as number);
  }

  // --- the keyboard: the controls come right after their field. spec R4.56 ---

  function controls(entry: Entry): HTMLButtonElement[] {
    if (entry.group.hidden) return [];
    return [entry.dictate, entry.attach].filter((button) => !button.hidden);
  }

  function tabbables(): HTMLElement[] {
    return Array.from(doc.querySelectorAll<HTMLElement>(TABBABLE)).filter((element) => {
      if ((element as HTMLButtonElement).disabled || element.tabIndex < 0 || element.hidden) return false;
      if (element.tagName.toLowerCase() === "input" && (element as HTMLInputElement).type === "hidden") return false;
      return element.getClientRects().length > 0;
    });
  }

  function after(field: HTMLElement): HTMLElement | null {
    const list = tabbables();
    const index = list.indexOf(field);
    return index >= 0 ? (list[index + 1] ?? null) : null;
  }

  function onControlKey(entry: Entry, event: KeyboardEvent): void {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = controls(entry);
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    if (index < 0) return;
    if (event.shiftKey) {
      event.preventDefault();
      (buttons[index - 1] ?? entry.field).focus();
      return;
    }
    const next = buttons[index + 1] ?? after(entry.field);
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  function onDocumentKey(event: KeyboardEvent): void {
    // Only when the page has not used the key itself: an editor may indent with Tab.
    if (event.defaultPrevented || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as Element | null;
    if (!target || target === host) return;
    if (!event.shiftKey) {
      const entry = isTextArea(target) ? entries.get(target) : undefined;
      const first = entry ? controls(entry)[0] : undefined;
      if (!first) return;
      event.preventDefault();
      first.focus();
      return;
    }
    // Shift+Tab from what follows a field returns to the field's last control.
    const list = tabbables();
    const previous = list[list.indexOf(target as HTMLElement) - 1];
    const entry = isTextArea(previous) ? entries.get(previous) : undefined;
    const last = entry ? controls(entry).at(-1) : undefined;
    if (!last) return;
    event.preventDefault();
    last.focus();
  }

  // --- pasting and dropping files onto a field. spec R4.61 ---

  function entryFor(target: EventTarget | null): Entry | undefined {
    const field = target as Element | null;
    if (!isTextArea(field)) return undefined;
    const entry = entries.get(field);
    return entry && shown(field) && attachable(field) ? entry : undefined;
  }

  function onPaste(event: ClipboardEvent): void {
    const entry = entryFor(event.target);
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!entry || files.length === 0) return;
    // Text that came with the files is pasted as usual; files alone are only attached.
    if (!event.clipboardData?.types.includes("text/plain")) event.preventDefault();
    add(entry, files);
  }

  function onDragOver(event: DragEvent): void {
    if (!entryFor(event.target) || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: DragEvent): void {
    const entry = entryFor(event.target);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!entry || files.length === 0) return;
    event.preventDefault();
    add(entry, files);
  }

  function collected(form: HTMLFormElement): SubmitFile[] {
    const out: SubmitFile[] = [];
    for (const control of controlsOf(form)) {
      if (!isTextArea(control)) continue;
      const entry = entries.get(control);
      if (!entry || entry.files.length === 0 || control.disabled || optedOut(control)) continue;
      // Beside that field's text in the answer; an audio file is transcribed. spec R4.62, R4.24b
      const field = control.name || "attachment";
      for (const file of entry.files) out.push({ field, file, ...(/^audio\//i.test(file.type) ? { transcribe: true } : {}) });
    }
    return out;
  }

  if (typeof win.ResizeObserver === "function") resizeObserver = new win.ResizeObserver(() => schedule());
  doc.addEventListener("focusin", (event) => {
    if (isTextArea(event.target)) touched.add(event.target);
  }, true);
  win.addEventListener("keydown", onDocumentKey);
  doc.addEventListener("paste", onPaste, true);
  doc.addEventListener("dragover", onDragOver, true);
  doc.addEventListener("drop", onDrop, true);
  doc.addEventListener("scroll", schedule, { capture: true, passive: true });
  win.addEventListener("resize", schedule);
  doc.addEventListener("visibilitychange", schedule);
  if (typeof win.MutationObserver === "function" && doc.documentElement) {
    // A field disabled while its form sends, made read-only, hidden or opted out loses its controls. spec R4.55
    new win.MutationObserver(() => schedule()).observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "readonly", "hidden", "style", "class", "open", MANUAL_ATTRIBUTE, "form"],
    });
  }

  return {
    prepare(from) {
      discover(from);
      schedule();
    },
    setVoice(available) {
      voice = available;
      schedule();
    },
    filesOf: (form) => collected(form),
    update,
  };
}
