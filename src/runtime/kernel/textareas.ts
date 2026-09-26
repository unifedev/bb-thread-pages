import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { controlsOf, filesOf, isManualForm, MANUAL_ATTRIBUTE, ownerForm } from "./forms.ts";
import type { KernelPrimitives } from "./primitives.ts";
import type { RecordAnswer } from "./record-client.ts";

/**
 * Every text area can take voice and files. spec R4.55–R4.62, DECISIONS D39
 *
 * The agent writes a plain `<textarea>`; the kernel draws one row over its
 * bottom-right corner, inside the field's box: the files the reader attached,
 * then Dictate and Attach files. None of it touches the field or the page's
 * CSS: everything lives in one shadow root whose host element is the last
 * child of `<html>`, fixed by inline `!important` declarations, so page rules
 * on `*`, `button` or `body …` cannot move, hide or restyle it, and it takes no
 * layout space. Nothing is drawn below the field, where the page may put its
 * own content.
 *
 * The host sits at the document's origin (`position: absolute`), and each row
 * is placed in document coordinates, so scrolling the page moves the controls
 * with the field on the compositor and no script runs per scroll. A field
 * inside a scrolling element, or with a sticky ancestor, is followed on its
 * scroll events; one under a fixed ancestor gets a fixed row.
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
  /**
   * Opens the shell's recording bar; resolves with the transcript.
   * `fromControl`: the reader's own press on the kernel's Dictate control. spec R3.32a
   */
  dictate(prompt: string, fromControl: boolean): Promise<RecordAnswer>;
  /** The platform functions taken when the kernel started. */
  primitives: KernelPrimitives;
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
const ROW_GAP = 3;
/** A chip's name is shortened to this, in the middle, keeping its extension. */
const CHIP_NAME = 18;

/**
 * The layer's host: at the document's origin, out of flow, above the page —
 * declared inline and `!important`, so no page rule moves or hides it. It
 * scrolls with the document, and so do the rows inside it. spec R4.57
 */
const HOST_STYLE = [
  "all:initial",
  "position:absolute",
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
:host{all:initial !important;display:block !important;position:absolute !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;overflow:visible !important;pointer-events:none !important;z-index:2147483647 !important}
*{box-sizing:border-box}
[hidden]{display:none !important}
.group{position:absolute;display:flex;align-items:center;justify-content:flex-end;gap:${ROW_GAP}px;margin:0;padding:0;transform:translateX(-100%);pointer-events:none;font:11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
.group>*{pointer-events:auto}
.chips{order:-2;display:flex;align-items:center;justify-content:flex-end;gap:${ROW_GAP}px;min-width:0;overflow:hidden;pointer-events:auto}
button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:${BUTTON}px;height:${BUTTON}px;border-radius:5px;border:1px solid transparent;color:var(--ink);opacity:.55;cursor:pointer;background:transparent}
button:hover,button:focus-visible{opacity:1;background:var(--hover);border-color:var(--edge)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
button[aria-busy=true]{opacity:1;cursor:progress}
svg{display:block;width:16px;height:16px;pointer-events:none}
.chip{display:inline-flex;align-items:center;gap:3px;flex:none;height:22px;padding:0 1px 0 5px;border:1px solid var(--edge);border-radius:6px;background:var(--paper);color:var(--ink);white-space:nowrap}
.chip .name{opacity:.8}
.chip svg{width:12px;height:12px}
.chip>svg{opacity:.55}
.chip button{width:18px;height:18px;border-radius:4px}
button.more{order:-1;width:auto;height:22px;padding:0 6px;border:1px solid var(--edge);border-radius:6px;background:var(--paper);font:inherit;opacity:.8}
.popup{position:absolute;right:0;bottom:calc(100% + 4px);display:flex;flex-direction:column;gap:2px;min-width:180px;max-width:320px;max-height:200px;overflow:auto;padding:4px;border:1px solid var(--edge);border-radius:8px;background:var(--paper);box-shadow:0 4px 14px rgba(0,0,0,.18)}
.popup .chip{border:0;justify-content:space-between;height:24px}
.note{position:absolute;right:0;bottom:calc(100% + 4px);max-width:320px;padding:4px 8px;border:1px dashed var(--edge);border-radius:6px;background:var(--paper);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

const ICON = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
const MIC = ICON('<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>');
const CLIP = ICON('<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>');
const REMOVE = ICON('<path d="M6 6l12 12M18 6L6 18"/>');
const FILE = ICON('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>');

interface Entry {
  field: HTMLTextAreaElement;
  /** The row: attached files, then Dictate and Attach files. */
  group: HTMLElement;
  chips: HTMLElement;
  more: HTMLButtonElement;
  popup: HTMLElement;
  noteBox: HTMLElement;
  dictate: HTMLButtonElement;
  attach: HTMLButtonElement;
  picker: HTMLInputElement;
  files: File[];
  note: { text: string; until: number } | null;
  busy: boolean;
  /** Whether the list of files the row cannot show is open. */
  open: boolean;
  /** What the chips show, so they are rebuilt only when that changes. */
  drawn: string;
  /** How the row follows the field: with the document, fixed to the viewport, or on every scroll. */
  mode: "document" | "fixed";
  follows: boolean;
}

/** A file name as a chip shows it: shortened in the middle, keeping its extension. */
export function chipName(name: string, max = CHIP_NAME): string {
  if (name.length <= max) return name;
  const extension = /\.[^.\s]{1,8}$/.exec(name)?.[0] ?? "";
  const keep = Math.max(1, max - extension.length - 1);
  const front = Math.ceil(keep * 0.6);
  const back = keep - front;
  const stem = name.slice(0, name.length - extension.length);
  return `${stem.slice(0, front)}…${back > 0 ? stem.slice(-back) : ""}${extension}`;
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

/** Disabled — itself, by a disabled fieldset — or inert: nothing can be typed or attached. spec R4.55 */
function unusable(field: Element): boolean {
  return matchesSafely(field, ":disabled") || field.closest("[inert]") !== null;
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
  const prim = deps.primitives;
  const entries = new Map<HTMLTextAreaElement, Entry>();
  const touched = new WeakSet<HTMLTextAreaElement>();
  let voice = false;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let scheduled = 0;
  let resizeObserver: ResizeObserver | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let observing = false;

  function layer(): ShadowRoot | null {
    if (root) {
      // The host stays the last child of <html>, outside <body>. spec R4.57
      if (host && doc.documentElement && (host.parentNode !== doc.documentElement || doc.documentElement.lastElementChild !== host)) doc.documentElement.appendChild(host);
      return root;
    }
    if (!doc.documentElement || typeof (doc.documentElement as Element & { attachShadow?: unknown }).attachShadow !== "function") return null;
    host = doc.createElement(LAYER_TAG);
    host.setAttribute("style", HOST_STYLE);
    root = prim.attachShadow(host, { mode: "closed" });
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

  /** Adds files to a field's row, refusing visibly what would go over the form's limits. spec R4.62 */
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
    update();
    // The keyboard stays with the files, or returns to the field.
    const next = controls(entry).find((button) => button !== entry.dictate && button !== entry.attach);
    (next ?? entry.field).focus?.();
  }

  async function dictate(entry: Entry, fromControl: boolean): Promise<void> {
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
      answer = await deps.dictate(value.slice(0, start).slice(-LIMITS.voicePromptChars), fromControl);
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
    if (!text || unusable(field) || field.readOnly || !field.isConnected) return;
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

  function button(label: string, icon: string, className = ""): HTMLButtonElement {
    const element = doc.createElement("button");
    element.type = "button";
    element.innerHTML = icon;
    element.setAttribute("aria-label", label);
    element.title = label;
    if (className) element.className = className;
    // Reached by Tab right after their field, which the kernel does itself (below), not at the end of the document.
    element.tabIndex = -1;
    return element;
  }

  function create(field: HTMLTextAreaElement): Entry | null {
    const shadow = layer();
    if (!shadow) return null;
    const group = doc.createElement("div");
    group.className = "group";
    group.hidden = true;
    const chips = doc.createElement("div");
    chips.className = "chips";
    chips.setAttribute("role", "list");
    chips.setAttribute("aria-label", "Attached files");
    const more = button("", "", "more");
    more.hidden = true;
    more.setAttribute("aria-expanded", "false");
    const popup = doc.createElement("div");
    popup.className = "popup";
    popup.hidden = true;
    popup.setAttribute("role", "list");
    popup.setAttribute("aria-label", "More attached files");
    const noteBox = doc.createElement("div");
    noteBox.className = "note";
    noteBox.hidden = true;
    noteBox.setAttribute("role", "status");
    const dictateButton = button("Dictate", MIC);
    const attachButton = button("Attach files", CLIP);
    const picker = doc.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.hidden = true;
    picker.tabIndex = -1;
    // The controls come first in the tree — they are the row's first buttons, and Tab reaches them first —
    // and last on screen: the files are laid out before them (CSS order).
    group.append(dictateButton, attachButton, picker, chips, more, popup, noteBox);
    shadow.append(group);
    const entry: Entry = { field, group, chips, more, popup, noteBox, dictate: dictateButton, attach: attachButton, picker, files: [], note: null, busy: false, open: false, drawn: "", mode: "document", follows: false };
    // The handlers are added with the original addEventListener and never handed to page code;
    // only the reader's own press — a trusted event — counts as the control. spec R3.32a
    prim.on(dictateButton, "click", (event) => void dictate(entry, prim.trusted(event)));
    prim.on(attachButton, "click", () => picker.click());
    prim.on(more, "click", () => {
      entry.open = !entry.open;
      update();
      if (entry.open) popup.querySelector<HTMLButtonElement>("button")?.focus();
    });
    prim.on(popup, "keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      entry.open = false;
      update();
      more.focus();
    });
    prim.on(picker, "change", () => {
      add(entry, Array.from(picker.files ?? []));
      picker.value = "";
    });
    for (const control of [dictateButton, attachButton, more]) prim.on(control, "keydown", (event) => onControlKey(entry, event as KeyboardEvent));
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
    if (entries.size > 0) observe();
  }

  /**
   * Watched only once there is a text area: a field disabled while its form
   * sends, made read-only, inert, hidden or opted out loses its controls
   * (R4.55). Its size and visibility come from the ResizeObserver; a row in
   * document coordinates needs nothing on scroll.
   */
  function observe(): void {
    if (observing || typeof win.MutationObserver !== "function" || !doc.documentElement) return;
    observing = true;
    new win.MutationObserver(() => schedule()).observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "readonly", "hidden", "inert", "open", MANUAL_ATTRIBUTE, "form"],
    });
  }

  /**
   * One walk up from the field: the part of it clipping ancestors leave
   * visible, and how its row must follow it — fixed under a fixed ancestor,
   * on scroll events under a sticky one or inside a scrolling element.
   */
  function survey(field: HTMLElement, rect: DOMRect): { box: { left: number; top: number; right: number; bottom: number } | null; mode: "document" | "fixed"; follows: boolean } {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    let mode: "document" | "fixed" = "document";
    let follows = false;
    const clip = (other: { left: number; top: number; right: number; bottom: number }) => {
      box = { left: Math.max(box.left, other.left), top: Math.max(box.top, other.top), right: Math.min(box.right, other.right), bottom: Math.min(box.bottom, other.bottom) };
    };
    for (let node: HTMLElement | null = field; node && node !== doc.documentElement; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.position === "fixed") mode = "fixed";
      if (style.position === "sticky") follows = true;
      if (node === field || node === doc.body) continue;
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) follows = true;
        const outer = node.getBoundingClientRect();
        clip({ left: outer.left + node.clientLeft, top: outer.top + node.clientTop, right: outer.left + node.clientLeft + node.clientWidth, bottom: outer.top + node.clientTop + node.clientHeight });
      }
    }
    return { box: box.right > box.left && box.bottom > box.top ? box : null, mode, follows };
  }

  /** Nothing of the page's lies over this point of the field — a dialog, a sticky header. */
  function uncovered(field: HTMLElement, x: number, y: number): boolean {
    if (typeof doc.elementsFromPoint !== "function") return true;
    const stack = doc.elementsFromPoint(x, y).filter((element) => element !== host);
    return stack.length === 0 || stack[0] === field;
  }

  function shown(field: HTMLTextAreaElement): boolean {
    if (unusable(field) || field.readOnly || field.hidden || !field.isConnected || optedOut(field)) return false;
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

  function chip(entry: Entry, file: File, index: number, removable: boolean): HTMLElement {
    const item = doc.createElement("span");
    item.className = "chip";
    item.setAttribute("role", "listitem");
    item.title = `${file.name} (${sizeLabel(file.size)})`;
    item.insertAdjacentHTML("beforeend", FILE);
    const name = doc.createElement("span");
    name.className = "name";
    name.textContent = chipName(file.name);
    item.append(name);
    if (removable) {
      const drop = button(`Remove ${file.name}`, REMOVE);
      prim.on(drop, "click", () => remove(entry, index));
      prim.on(drop, "keydown", (event) => onControlKey(entry, event as KeyboardEvent));
      item.append(drop);
    }
    return item;
  }

  /**
   * The attached files, in the row before the controls, as many as fit the
   * field's width; the rest behind a "+N" that opens a list of them, each
   * removable. spec R4.61
   */
  function drawFiles(entry: Entry, available: number, removable: boolean): void {
    const print = JSON.stringify([entry.files.map((file) => [file.name, file.size]), removable, entry.open, Math.round(available)]);
    if (print !== entry.drawn) {
      entry.drawn = print;
      entry.chips.replaceChildren(...entry.files.map((file, index) => chip(entry, file, index, removable)));
      const all = Array.from(entry.chips.children) as HTMLElement[];
      // How many fit, with room for a "+N" when some do not. Measured, since names differ in width.
      entry.more.hidden = true;
      const widths = all.map((element) => element.getBoundingClientRect().width);
      entry.more.hidden = false;
      entry.more.textContent = `+${entry.files.length}`;
      const moreWidth = entry.more.getBoundingClientRect().width;
      let shownCount = entry.files.length;
      const total = (count: number) => widths.slice(0, count).reduce((sum, width) => sum + width, 0) + Math.max(0, count - 1) * ROW_GAP;
      if (total(shownCount) > available) {
        shownCount = 0;
        while (shownCount < entry.files.length && total(shownCount + 1) + ROW_GAP + moreWidth <= available) shownCount += 1;
      }
      // Those that do not fit leave the row: each file is in the row or in the "+N" list, never both.
      for (const element of all.slice(shownCount)) element.remove();
      const rest = entry.files.length - shownCount;
      entry.more.hidden = rest === 0;
      entry.more.textContent = `+${rest}`;
      entry.more.setAttribute("aria-label", `Show ${rest} more ${rest === 1 ? "file" : "files"}`);
      entry.more.title = entry.more.getAttribute("aria-label") ?? "";
      if (rest === 0) entry.open = false;
      entry.more.setAttribute("aria-expanded", String(entry.open));
      entry.popup.replaceChildren(...entry.files.slice(shownCount).map((file, offset) => chip(entry, file, shownCount + offset, removable)));
    }
    entry.popup.hidden = !entry.open || entry.more.hidden;
  }

  /** Places one field's row from its box: in document coordinates, or the viewport's under a fixed ancestor. */
  function place(entry: Entry, rect: DOMRect, style: CSSStyleDeclaration): { right: number; top: number } {
    const field = entry.field;
    const innerRight = rect.left + field.clientLeft + field.clientWidth;
    const innerBottom = rect.top + field.clientTop + field.clientHeight;
    const right = innerRight - (style.resize && style.resize !== "none" ? HANDLE : INSET);
    const top = field.clientHeight < BUTTON + 2 * INSET ? rect.top + (rect.height - BUTTON) / 2 : innerBottom - BUTTON - INSET;
    const origin = entry.mode === "fixed" || !host ? { left: 0, top: 0 } : host.getBoundingClientRect();
    entry.group.style.position = entry.mode === "fixed" ? "fixed" : "absolute";
    entry.group.style.left = `${Math.round(right - origin.left)}px`;
    entry.group.style.top = `${Math.round(top - origin.top)}px`;
    return { right, top };
  }

  /** Places every field's row from its box, or hides it. */
  function update(): void {
    scheduled = 0;
    if (entries.size > 0) layer();
    for (const [field, entry] of entries) {
      if (!field.isConnected) {
        entry.group.remove();
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
      const { box, mode, follows } = visible ? survey(field, rect) : { box: null, mode: "document" as const, follows: false };
      entry.mode = mode;
      entry.follows = follows;
      const style = win.getComputedStyle(field);
      const ink = style.color || "rgb(0,0,0)";
      const paper = /rgba?\([^)]*,\s*0\)|transparent/.test(style.backgroundColor) ? win.getComputedStyle(doc.body ?? doc.documentElement).backgroundColor : style.backgroundColor;
      entry.group.style.setProperty("--ink", ink);
      entry.group.style.setProperty("--hover", withAlpha(ink, 0.12));
      entry.group.style.setProperty("--edge", withAlpha(ink, 0.3));
      entry.group.style.setProperty("--paper", /rgba?\([^)]*,\s*0\)|transparent/.test(paper) ? "Canvas" : paper);

      // The controls over the bottom-right corner, clear of a resize handle; the files before them. spec R4.56, R4.61
      const count = Number(withDictate) + Number(withAttach);
      const controlsWidth = count * BUTTON + Math.max(0, count - 1) * GAP;
      const noteText = entry.note && entry.note.until > Date.now() ? entry.note.text : "";
      if (!noteText) entry.note = null;
      const { right, top } = place(entry, rect, style);
      const fits =
        (count > 0 || entry.files.length > 0) &&
        box !== null &&
        right - controlsWidth >= box.left - 0.5 &&
        right <= box.right + 0.5 &&
        top >= box.top - 0.5 &&
        top + BUTTON <= box.bottom + 0.5 &&
        uncovered(field, right - Math.max(controlsWidth, BUTTON) / 2, top + BUTTON / 2);
      entry.group.hidden = !fits;
      if (fits) {
        // The files take what the field's width leaves beside the controls.
        const available = Math.max(0, right - (rect.left + field.clientLeft + INSET) - controlsWidth - (count > 0 ? ROW_GAP : 0));
        entry.group.style.maxWidth = `${Math.round(right - (rect.left + field.clientLeft + INSET))}px`;
        drawFiles(entry, available, !unusable(field) && !field.readOnly);
        entry.noteBox.hidden = !noteText;
        entry.noteBox.textContent = noteText;
      }
    }
    // Layout moves without telling anyone (an image loads above a field): while controls show, look
    // again now and then; while none shows there is nothing to keep in place.
    const showing = [...entries.values()].some((entry) => !entry.group.hidden);
    if (showing && ticker === null) {
      ticker = setInterval(() => {
        if (doc.visibilityState !== "hidden") schedule();
      }, 750);
    } else if (!showing && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame(update) : (setTimeout(update, 16) as unknown as number);
  }

  /**
   * A scroll: rows in document coordinates already moved with the page. Rows
   * of fields in a scrolling element or under a sticky ancestor are placed
   * again at once, in the same frame; everything is looked at again on the
   * next one (a sticky header may now cover a field).
   */
  function onScroll(): void {
    for (const entry of entries.values()) {
      if (!entry.follows || entry.group.hidden) continue;
      place(entry, entry.field.getBoundingClientRect(), win.getComputedStyle(entry.field));
    }
    schedule();
  }

  // --- the keyboard: the controls come right after their field. spec R4.56 ---

  /** In the keyboard's order: Dictate, Attach files, then the files' own buttons. */
  function controls(entry: Entry): HTMLButtonElement[] {
    if (entry.group.hidden) return [];
    const files = [
      ...Array.from(entry.chips.querySelectorAll<HTMLButtonElement>(".chip:not([hidden]) button")),
      ...(entry.more.hidden ? [] : [entry.more]),
      ...(entry.popup.hidden ? [] : Array.from(entry.popup.querySelectorAll<HTMLButtonElement>("button"))),
    ];
    return [entry.dictate, entry.attach, ...files].filter((element) => !element.hidden);
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

  // In the bubble phase, and only when the page's own handlers left the event alone.
  function onPaste(event: ClipboardEvent): void {
    if (event.defaultPrevented) return;
    const entry = entryFor(event.target);
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!entry || files.length === 0) return;
    // Text that came with the files is pasted as usual; files alone are only attached.
    if (!event.clipboardData?.types.includes("text/plain")) event.preventDefault();
    add(entry, files);
  }

  function onDragOver(event: DragEvent): void {
    if (event.defaultPrevented || !entryFor(event.target) || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: DragEvent): void {
    if (event.defaultPrevented) return;
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
      if (!entry || entry.files.length === 0 || unusable(control) || optedOut(control)) continue;
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
  doc.addEventListener("paste", onPaste);
  doc.addEventListener("dragover", onDragOver);
  doc.addEventListener("drop", onDrop);
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  win.addEventListener("resize", schedule);
  doc.addEventListener("visibilitychange", schedule);

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
