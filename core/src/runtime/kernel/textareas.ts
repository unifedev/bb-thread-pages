// The Dictate/Attach layer (02 R4.55–R4.62): shadow host as last child of `<html>`, chips, paste/drop, tab order, positioning; page territory, not a trust boundary (05 R3.33).
import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { SubmitFile } from "../shared/protocol.ts";
import { controlsOf, filesOf, isManualForm, MANUAL_ATTRIBUTE, ownerForm, tagOf } from "./forms.ts";
import type { KernelPrimitives, LayerDom } from "./primitives.ts";
import type { RecordAnswer } from "./record-client.ts";

export interface TextAreaDeps {
  embedded: boolean;
  uploads: boolean;
  isReadOnly(): boolean;
  /** Opens the shell's recording bar; `fromControl` is the reader's own press on the kernel's control. 05 R3.32b */
  dictate(prompt: string, fromControl: boolean): Promise<RecordAnswer>;
  primitives: KernelPrimitives;
  /** Attaching or removing a file marks the page dirty, as typing does. 02 R4.61 */
  markDirty(form: HTMLFormElement): void;
}

export interface TextAreaControls {
  prepare(root: ParentNode): void;
  /** Dictate is shown only while the shell says the reader can record here. 02 R4.59 */
  setVoice(available: boolean): void;
  /** The files attached to the form's text areas, for its answer. 02 R4.62 */
  filesOf(form: HTMLFormElement): SubmitFile[];
  /** Places the controls again now. */
  update(): void;
}

/** Marks the layer's host, a plain `<div>`, the last child of `<html>`. 02 R4.57 */
export const LAYER_ATTRIBUTE = "data-thread-page-layer";
const BUTTON = 24;
const GAP = 2;
const INSET = 3;
const HANDLE = 14;
const NOTE_MS = 8_000;
const ROW_GAP = 3;
const CHIP_NAME = 18;
const NARROW = 56;
const SETTLE_MS = 120;

const HOST_STYLE = ["all:initial", "position:absolute", "top:0", "left:0", "width:0", "height:0", "margin:0", "padding:0", "border:0", "display:block", "visibility:visible", "opacity:1", "transform:none", "filter:none", "clip-path:none", "overflow:visible", "pointer-events:none", "z-index:2147483647"]
  .map((declaration) => `${declaration} !important`)
  .join(";");

const LAYER_CSS = `
:host{all:initial !important;display:block !important;position:absolute !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;overflow:visible !important;pointer-events:none !important;z-index:2147483647 !important}
*{box-sizing:border-box}
[hidden]{display:none !important}
.group{position:absolute;display:flex;align-items:center;justify-content:flex-end;gap:${ROW_GAP}px;margin:0;padding:0;transform:translateX(-100%);pointer-events:none;font:11px/1 system-ui,sans-serif;color:var(--ink);color-scheme:var(--scheme,normal)}
.group.rtl{direction:rtl;transform:none}
.group>*{pointer-events:auto}
.chips{order:-2;display:flex;align-items:center;justify-content:flex-end;gap:${ROW_GAP}px;min-width:0;overflow:hidden;pointer-events:auto}
button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:${BUTTON}px;height:${BUTTON}px;border-radius:5px;border:1px solid transparent;color:var(--ink);opacity:.55;cursor:pointer;background:transparent}
button:hover,button:focus-visible{opacity:1;background:var(--hover);border-color:var(--edge)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
button[aria-busy=true]{opacity:1;cursor:progress}
svg{display:block;width:${LIMITS.textareaIconPx}px;height:${LIMITS.textareaIconPx}px;pointer-events:none}
.chip{display:inline-flex;align-items:center;gap:3px;flex:none;height:22px;padding:0 1px 0 5px;border:1px solid var(--edge);border-radius:6px;background:var(--paper);color:var(--ink);white-space:nowrap}
.chip .name{opacity:.8}
.chip svg{width:12px;height:12px}
.chip button{width:18px;height:18px;border-radius:4px}
button.more{order:-1;width:auto;height:22px;padding:0 6px;border:1px solid var(--edge);border-radius:6px;background:var(--paper);font:inherit;opacity:.8;white-space:nowrap}
.stack{position:absolute;right:0;bottom:calc(100% + 4px);display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.popup{display:flex;flex-direction:column;gap:2px;min-width:180px;max-width:320px;max-height:200px;overflow:auto;padding:4px;border:1px solid var(--edge);border-radius:8px;background:var(--paper);box-shadow:0 4px 14px rgba(0,0,0,.18)}
.popup .chip{border:0;justify-content:space-between;height:24px}
.note{max-width:320px;padding:4px 8px;border:1px dashed var(--edge);border-radius:6px;background:var(--paper);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

const ICON = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
const MIC = ICON('<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>');
const CLIP = ICON('<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>');
const REMOVE = ICON('<path d="M6 6l12 12M18 6L6 18"/>');
const FILE = ICON('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>');

interface Entry {
  field: HTMLTextAreaElement;
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
  open: boolean;
  drawn: string;
  mode: "document" | "fixed";
  follows: boolean;
  scrollers: Element[];
  settling: number;
  rtl: boolean;
  shown: boolean;
}

/** A file name as a chip shows it: shortened in the middle, keeping its extension. 02 R4.61 */
export function chipName(name: string, max = CHIP_NAME): string {
  if (name.length <= max) return name;
  const extension = /\.[^.\s]{1,8}$/.exec(name)?.[0] ?? "";
  const keep = Math.max(1, max - extension.length - 1);
  const front = Math.ceil(keep * 0.6);
  const back = keep - front;
  const stem = name.slice(0, name.length - extension.length);
  return `${stem.slice(0, front)}…${back > 0 ? stem.slice(-back) : ""}${extension}`;
}

function channels(color: string): { rgb: string; alpha: number } | null {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  return { rgb: `${parts[0]},${parts[1]},${parts[2]}`, alpha: parts.length >= 4 ? Number(parts[3]) : 1 };
}

function withAlpha(color: string, alpha: number): string {
  const found = channels(color);
  return found ? `rgba(${found.rgb},${alpha})` : `rgba(128,128,128,${alpha})`;
}

function isTextArea(element: unknown): element is HTMLTextAreaElement {
  return tagOf(element as Element) === "textarea";
}

/** Opted out on the field, or on its form. 02 R4.6a */
function optedOut(field: HTMLTextAreaElement): boolean {
  if (field.hasAttribute(MANUAL_ATTRIBUTE)) return true;
  const form = ownerForm(field);
  return form !== null && isManualForm(form);
}

function matchesSafely(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function unusable(field: Element): boolean {
  return matchesSafely(field, ":disabled") || field.closest("[inert]") !== null;
}

const TABBABLE = "a[href],area[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable]:not([contenteditable=false])";

export function createTextAreaControls(win: Window & typeof globalThis, deps: TextAreaDeps): TextAreaControls {
  const doc = win.document;
  const prim = deps.primitives;
  const dom: LayerDom = prim.dom;
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
      if (host && doc.documentElement && dom.lastChild(doc.documentElement) !== host) dom.append(doc.documentElement, host);
      return root;
    }
    if (!doc.documentElement) return null;
    host = dom.create("div");
    dom.setAttribute(host, "style", HOST_STYLE);
    dom.setAttribute(host, LAYER_ATTRIBUTE, "");
    root = dom.attachShadow(host, { mode: "closed" });
    const style = dom.create("style");
    dom.setText(style, LAYER_CSS);
    dom.append(root, style);
    dom.append(doc.documentElement, host);
    return root;
  }

  /** The captured form whose answer this field's files ride on, else null. 02 R4.60 */
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

  /** Adds files to a field's row, refusing visibly what would go over the form's limits. 02 R4.62 */
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
    const next = controls(entry).find((button) => button !== entry.dictate && button !== entry.attach);
    if (next) dom.focus(next);
    else entry.field.focus?.();
  }

  /** Whether the row is plainly there to be seen, so a press on Dictate is the reader's choice. 05 R3.32b, R3.33 */
  function plainlyVisible(entry: Entry): boolean {
    const html = doc.documentElement;
    if (!html || !host || dom.lastChild(html) !== host) return false;
    for (const selector of [":popover-open", ":modal"]) {
      try {
        if (dom.query(doc, selector)) return false;
      } catch {
        // No such top layer in this engine.
      }
    }
    const page = dom.computed(html);
    if (page.opacity !== "1" || page.filter !== "none" || page.visibility !== "visible") return false;
    const ink = channels(dom.computed(entry.field).color);
    return ink !== null && ink.alpha >= 0.35;
  }

  async function dictate(entry: Entry, fromControl: boolean): Promise<void> {
    if (entry.busy) return;
    const field = entry.field;
    const value = field.value;
    const start = touched.has(field) ? Math.min(field.selectionStart ?? value.length, value.length) : value.length;
    const end = touched.has(field) ? Math.min(Math.max(field.selectionEnd ?? start, start), value.length) : start;
    entry.busy = true;
    dom.setAttribute(entry.dictate, "aria-busy", "true");
    let answer: RecordAnswer;
    try {
      // The text before the caret, its last 1000 characters, as context. 02 R4.58
      answer = await deps.dictate(value.slice(0, start).slice(-LIMITS.voicePromptChars), fromControl);
    } finally {
      entry.busy = false;
      dom.removeAttribute(entry.dictate, "aria-busy");
    }
    if (!answer.ok) {
      if (answer.code !== "cancelled") note(entry, `Dictation failed: ${answer.message}`);
      return;
    }
    const text = (answer.text ?? "").trim();
    if (!text || unusable(field) || field.readOnly || !field.isConnected) return;
    insert(field, Math.min(start, field.value.length), Math.min(end, field.value.length), text);
  }

  /** Inserts at the caret with a separating space where the text beside it needs one, then `input` and `change`. 02 R4.58 */
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
      inserted = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text) && field.value !== previous;
    } catch {
      inserted = false;
    }
    if (!inserted) {
      field.value = previous;
      field.setRangeText(text, start, end, "end");
      field.dispatchEvent(new win.Event("input", { bubbles: true }));
    }
    field.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  function element<T extends HTMLElement>(tag: string, className = ""): T {
    const node = dom.create(tag) as T;
    if (className) dom.setAttribute(node, "class", className);
    return node;
  }

  function button(label: string, icon: string, className = ""): HTMLButtonElement {
    const node = element<HTMLButtonElement>("button", className);
    dom.setAttribute(node, "type", "button");
    dom.setHtml(node, icon);
    if (label) {
      dom.setAttribute(node, "aria-label", label);
      dom.setAttribute(node, "title", label);
    }
    // Reached by Tab right after their field, which the kernel does itself, not at the end of the document. 02 R4.56
    dom.setAttribute(node, "tabindex", "-1");
    return node;
  }

  function hide(node: HTMLElement, hidden: boolean): void {
    dom.setHidden(node, hidden);
  }

  function create(field: HTMLTextAreaElement): Entry | null {
    const shadow = layer();
    if (!shadow) return null;
    const group = element("div", "group");
    hide(group, true);
    const chips = element("div", "chips");
    dom.setAttribute(chips, "role", "list");
    dom.setAttribute(chips, "aria-label", "Attached files");
    const more = button("", "", "more");
    hide(more, true);
    dom.setAttribute(more, "aria-expanded", "false");
    const stack = element("div", "stack");
    const popup = element("div", "popup");
    hide(popup, true);
    dom.setAttribute(popup, "role", "list");
    const noteBox = element("div", "note");
    hide(noteBox, true);
    dom.setAttribute(noteBox, "role", "status");
    dom.append(stack, noteBox, popup);
    const dictateButton = button("Dictate", MIC);
    const attachButton = button("Attach files", CLIP);
    const picker = element<HTMLInputElement>("input");
    dom.setAttribute(picker, "type", "file");
    dom.setAttribute(picker, "multiple", "");
    hide(picker, true);
    dom.setAttribute(picker, "tabindex", "-1");
    dom.append(group, dictateButton, attachButton, picker, chips, more, stack);
    dom.append(shadow, group);
    const entry: Entry = { field, group, chips, more, popup, noteBox, dictate: dictateButton, attach: attachButton, picker, files: [], note: null, busy: false, open: false, drawn: "", mode: "document", follows: false, scrollers: [], settling: 0, rtl: false, shown: false };
    // Only the reader's own press (a trusted event) on a plainly visible control counts as the control. 05 R3.32b
    prim.on(dictateButton, "click", (event) => void dictate(entry, prim.trusted(event) && plainlyVisible(entry)));
    prim.on(attachButton, "click", () => dom.click(picker));
    prim.on(more, "click", () => {
      entry.open = !entry.open;
      update();
      const first = entry.open ? dom.query<HTMLButtonElement>(popup, "button") : null;
      if (first) dom.focus(first);
    });
    prim.on(popup, "keydown", (event) => {
      if (!prim.trusted(event) || prim.key(event).key !== "Escape") return;
      entry.open = false;
      update();
      dom.focus(more);
    });
    prim.on(picker, "change", () => {
      add(entry, dom.files(picker));
      try {
        picker.value = "";
      } catch {
        // A test DOM may refuse.
      }
    });
    for (const control of [dictateButton, attachButton, more]) prim.on(control, "keydown", (event) => onControlKey(entry, control, event));
    resizeObserver?.observe(field);
    return entry;
  }

  function discover(from: ParentNode): void {
    const found: HTMLTextAreaElement[] = [];
    if (isTextArea(from)) found.push(from);
    if (typeof from.querySelectorAll === "function") found.push(...Array.from(from.querySelectorAll("textarea")));
    for (const field of found) {
      if (entries.has(field) || optedOut(field)) continue;
      const entry = create(field);
      if (entry) entries.set(field, entry);
    }
    if (entries.size > 0) observe();
  }

  function observe(): void {
    if (observing || typeof win.MutationObserver !== "function" || !doc.documentElement) return;
    observing = true;
    new win.MutationObserver(() => schedule()).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "readonly", "hidden", "inert", "open", MANUAL_ATTRIBUTE, "form", "dir"] });
  }

  function scrolls(node: Element, style: CSSStyleDeclaration): boolean {
    const container = style.overflowX !== "visible" || style.overflowY !== "visible";
    return container && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth);
  }

  /** One walk up from the field: clipping, and how its row must follow it. 02 R4.57 */
  function survey(field: HTMLElement, rect: DOMRect): { box: { left: number; top: number; right: number; bottom: number } | null; mode: "document" | "fixed"; follows: boolean; scrollers: Element[] } {
    let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    let mode: "document" | "fixed" = "document";
    let follows = false;
    let sticky = false;
    const scrollers: Element[] = [];
    const htmlStyle = doc.documentElement ? dom.computed(doc.documentElement) : null;
    const bodyScrollsAlone = htmlStyle !== null && (htmlStyle.overflowX !== "visible" || htmlStyle.overflowY !== "visible");
    for (let node: HTMLElement | null = field; node && node !== doc.documentElement; node = node.parentElement) {
      const style = dom.computed(node);
      if (style.position === "fixed") mode = "fixed";
      if (style.position === "sticky") sticky = true;
      if (node === field) continue;
      if (node === doc.body && !bodyScrollsAlone) continue;
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        if (scrolls(node, style)) {
          follows = true;
          scrollers.push(node);
        }
        const outer = node.getBoundingClientRect();
        box = { left: Math.max(box.left, outer.left + node.clientLeft), top: Math.max(box.top, outer.top + node.clientTop), right: Math.min(box.right, outer.left + node.clientLeft + node.clientWidth), bottom: Math.min(box.bottom, outer.top + node.clientTop + node.clientHeight) };
      }
    }
    if (sticky && scrollers.length === 0) mode = "fixed";
    if (sticky) follows = true;
    return { box: box.right > box.left && box.bottom > box.top ? box : null, mode, follows, scrollers };
  }

  function uncovered(field: HTMLElement, x: number, y: number): boolean {
    if (typeof doc.elementsFromPoint !== "function") return true;
    const stack = doc.elementsFromPoint(x, y).filter((node) => node !== host);
    return stack.length === 0 || stack[0] === field;
  }

  function shown(field: HTMLTextAreaElement): boolean {
    if (unusable(field) || field.readOnly || field.hidden || !field.isConnected || optedOut(field)) return false;
    // Read-only pages answer nothing: their fields lose the controls too. 02 R4.55
    if (deps.isReadOnly()) return false;
    if (field.getClientRects().length === 0) return false;
    for (let node = field.parentElement; node; node = node.parentElement) if (matchesSafely(node, ":modal") || matchesSafely(node, ":popover-open")) return false;
    return dom.computed(field).visibility === "visible";
  }

  function chip(entry: Entry, file: File, index: number, removable: boolean): HTMLElement {
    const item = element("span", "chip");
    dom.setAttribute(item, "role", "listitem");
    dom.setAttribute(item, "title", `${file.name} (${file.size} bytes)`);
    dom.setHtml(item, FILE);
    const name = element("span", "name");
    dom.setText(name, chipName(file.name));
    dom.append(item, name);
    if (removable) {
      const drop = button(`Remove ${file.name}`, REMOVE);
      prim.on(drop, "click", () => remove(entry, index));
      prim.on(drop, "keydown", (event) => onControlKey(entry, drop, event));
      dom.append(item, drop);
    }
    return item;
  }

  /** The attached files in the row before the controls, as many as fit; the rest behind "+N". 02 R4.61 */
  function drawFiles(entry: Entry, available: number, removable: boolean): void {
    const count = entry.files.length;
    const print = JSON.stringify([entry.files.map((file) => [file.name, file.size]), removable, entry.open, Math.round(available)]);
    if (print !== entry.drawn) {
      entry.drawn = print;
      const all = entry.files.map((file, index) => chip(entry, file, index, removable));
      dom.replaceChildren(entry.chips, ...all);
      hide(entry.more, false);
      dom.setText(entry.more, `+${count}`);
      const widths = all.map((node) => dom.rect(node).width);
      const moreWidth = dom.rect(entry.more).width;
      const total = (shownCount: number) => widths.slice(0, shownCount).reduce((sum, width) => sum + width, 0) + Math.max(0, shownCount - 1) * ROW_GAP;
      let shownCount = count;
      if (available < NARROW) shownCount = 0;
      else if (total(count) > available) {
        shownCount = 0;
        while (shownCount < count && total(shownCount + 1) + ROW_GAP + moreWidth <= available) shownCount += 1;
      }
      for (const node of all.slice(shownCount)) dom.remove(node);
      const rest = count - shownCount;
      const label = shownCount === 0 ? `${rest} ${rest === 1 ? "file" : "files"}` : `+${rest}`;
      dom.setText(entry.more, label);
      const spoken = shownCount === 0 ? `Show ${rest} attached ${rest === 1 ? "file" : "files"}` : `Show ${rest} more ${rest === 1 ? "file" : "files"}`;
      dom.setAttribute(entry.more, "aria-label", spoken);
      dom.setAttribute(entry.more, "title", spoken);
      if (rest === 0) entry.open = false;
      dom.setAttribute(entry.more, "aria-expanded", String(entry.open));
      dom.replaceChildren(entry.popup, ...entry.files.slice(shownCount).map((file, offset) => chip(entry, file, shownCount + offset, removable)));
      hide(entry.more, rest === 0 || (rest > 0 && available < moreWidth));
      const attachLabel = count > 0 ? `Attach files (${count} attached)` : "Attach files";
      dom.setAttribute(entry.attach, "aria-label", attachLabel);
      dom.setAttribute(entry.attach, "title", attachLabel);
    }
    hide(entry.popup, !entry.open || count === 0);
  }

  function geometry(entry: Entry, rect: DOMRect, style: CSSStyleDeclaration, origin: { left: number; top: number }): { edge: number; top: number; left: number; placedTop: number; start: number } {
    const field = entry.field;
    const resizable = style.resize && style.resize !== "none";
    const innerLeft = rect.left + field.clientLeft;
    const innerRight = innerLeft + field.clientWidth;
    const innerBottom = rect.top + field.clientTop + field.clientHeight;
    const edge = entry.rtl ? innerLeft + (resizable ? HANDLE : INSET) : innerRight - (resizable ? HANDLE : INSET);
    const start = entry.rtl ? innerRight - INSET : innerLeft + INSET;
    const top = field.clientHeight < BUTTON + 2 * INSET ? rect.top + (rect.height - BUTTON) / 2 : innerBottom - BUTTON - INSET;
    return { edge, top, left: Math.round(edge - origin.left), placedTop: Math.round(top - origin.top), start };
  }

  function originFor(entry: Entry): { left: number; top: number } {
    return entry.mode === "fixed" || !host ? { left: 0, top: 0 } : dom.rect(host);
  }

  function place(entry: Entry, left: number, top: number): void {
    dom.style(entry.group, "position", entry.mode === "fixed" ? "fixed" : "absolute");
    dom.style(entry.group, "left", `${left}px`);
    dom.style(entry.group, "top", `${top}px`);
  }

  function paperFor(field: HTMLElement): string {
    for (let node: Element | null = field; node; node = node.parentElement) {
      const background = dom.computed(node).backgroundColor;
      const found = channels(background);
      if (found && found.alpha > 0.9) return background;
    }
    return "Canvas";
  }

  /** Places every field's row from its box, or hides it. 02 R4.56, R4.57 */
  function update(): void {
    scheduled = 0;
    if (entries.size > 0) layer();
    const now = Date.now();
    for (const [field, entry] of entries) {
      if (!field.isConnected) {
        dom.remove(entry.group);
        resizeObserver?.unobserve(field);
        entries.delete(field);
        continue;
      }
      const visible = shown(field);
      const form = attachable(field);
      const withDictate = visible && voice;
      const withAttach = visible && form !== null;
      hide(entry.dictate, !withDictate);
      hide(entry.attach, !withAttach);
      const rect = field.getBoundingClientRect();
      const surveyed = visible ? survey(field, rect) : { box: null, mode: "document" as const, follows: false, scrollers: [] as Element[] };
      entry.mode = surveyed.mode;
      entry.follows = surveyed.follows;
      entry.scrollers = surveyed.scrollers;
      const style = dom.computed(field);
      entry.rtl = style.direction === "rtl";
      dom.setAttribute(entry.group, "class", entry.rtl ? "group rtl" : "group");
      const ink = style.color || "rgb(0,0,0)";
      dom.style(entry.group, "--ink", ink);
      dom.style(entry.group, "--hover", withAlpha(ink, 0.12));
      dom.style(entry.group, "--edge", withAlpha(ink, 0.3));
      dom.style(entry.group, "--paper", paperFor(field));
      dom.style(entry.group, "--scheme", doc.documentElement ? dom.computed(doc.documentElement).colorScheme || "normal" : "normal");
      const count = Number(withDictate) + Number(withAttach);
      const controlsWidth = count * BUTTON + Math.max(0, count - 1) * GAP;
      const noteText = entry.note && entry.note.until > now ? entry.note.text : "";
      if (!noteText) entry.note = null;
      const { edge, top, left, placedTop, start } = geometry(entry, rect, style, originFor(entry));
      place(entry, left, placedTop);
      const box = surveyed.box;
      const near = entry.rtl ? edge : edge - controlsWidth;
      const far = entry.rtl ? edge + controlsWidth : edge;
      const fits = (count > 0 || entry.files.length > 0) && box !== null && near >= box.left - 0.5 && far <= box.right + 0.5 && top >= box.top - 0.5 && top + BUTTON <= box.bottom + 0.5 && uncovered(field, (near + far) / 2, top + BUTTON / 2) && entry.settling <= now;
      entry.shown = fits;
      hide(entry.group, !fits);
      if (fits) {
        const span = Math.abs(edge - start);
        const available = Math.max(0, span - controlsWidth - (count > 0 ? ROW_GAP : 0));
        dom.style(entry.group, "max-width", `${Math.round(span)}px`);
        drawFiles(entry, available, !unusable(field) && !field.readOnly);
        hide(entry.noteBox, !noteText);
        dom.setText(entry.noteBox, noteText);
      }
    }
    const showing = [...entries.values()].some((entry) => entry.shown);
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

  /** A scroll: rows in a scrolling element hide while it scrolls and come back placed; a sticky field's row is placed again at once. */
  function onScroll(event: Event): void {
    const target = event.target;
    const now = Date.now();
    const affected: { entry: Entry; left: number; top: number }[] = [];
    let settling = false;
    for (const entry of entries.values()) {
      if (!entry.shown && entry.settling <= now) continue;
      const inScroller = target !== doc && entry.scrollers.some((scroller) => scroller === target || (target instanceof win.Node && scroller.contains(target)));
      if (inScroller) {
        entry.settling = now + SETTLE_MS;
        settling = true;
        continue;
      }
      if (!entry.follows) continue;
      const { left, placedTop } = geometry(entry, entry.field.getBoundingClientRect(), dom.computed(entry.field), originFor(entry));
      affected.push({ entry, left, top: placedTop });
    }
    for (const { entry, left, top } of affected) place(entry, left, top);
    for (const entry of entries.values()) {
      if (entry.settling > now && entry.shown) {
        entry.shown = false;
        hide(entry.group, true);
      }
    }
    if (settling) setTimeout(schedule, SETTLE_MS + 10);
    schedule();
  }

  function controls(entry: Entry): HTMLButtonElement[] {
    if (!entry.shown) return [];
    const files = [...dom.queryAll<HTMLButtonElement>(entry.chips, ".chip button"), ...(dom.isHidden(entry.more) ? [] : [entry.more]), ...(dom.isHidden(entry.popup) ? [] : dom.queryAll<HTMLButtonElement>(entry.popup, "button"))];
    return [entry.dictate, entry.attach, ...files].filter((node) => !dom.isHidden(node));
  }

  function tabbables(): HTMLElement[] {
    return dom.queryAll<HTMLElement>(doc, TABBABLE).filter((node) => {
      if ((node as HTMLButtonElement).disabled || node.tabIndex < 0 || node.hidden) return false;
      if (tagOf(node) === "input" && (node as HTMLInputElement).type === "hidden") return false;
      return node.getClientRects().length > 0;
    });
  }

  function after(field: HTMLElement): HTMLElement | null {
    const list = tabbables();
    const index = list.indexOf(field);
    return index >= 0 ? (list[index + 1] ?? null) : null;
  }

  // The controls come right after their field in the tab order; only the reader's keys move focus. 02 R4.56
  function onControlKey(entry: Entry, control: HTMLButtonElement, event: Event): void {
    if (!prim.trusted(event)) return;
    const key = prim.key(event);
    if (key.key !== "Tab" || key.alt || key.ctrl || key.meta) return;
    const buttons = controls(entry);
    const index = buttons.indexOf(control);
    if (index < 0) return;
    if (key.shift) {
      prim.preventDefault(event);
      const previous = buttons[index - 1];
      if (previous) dom.focus(previous);
      else entry.field.focus();
      return;
    }
    const next = buttons[index + 1];
    if (next) {
      prim.preventDefault(event);
      dom.focus(next);
      return;
    }
    const following = after(entry.field);
    if (!following) return;
    prim.preventDefault(event);
    following.focus();
  }

  function onDocumentKey(event: Event): void {
    // Only the reader's own key, and only when the page has not used it. 02 R4.56
    if (!prim.trusted(event) || prim.prevented(event)) return;
    const key = prim.key(event);
    if (key.key !== "Tab" || key.alt || key.ctrl || key.meta) return;
    const target = event.target as Element | null;
    if (!target || target === host) return;
    if (!key.shift) {
      const entry = isTextArea(target) ? entries.get(target) : undefined;
      const first = entry ? controls(entry)[0] : undefined;
      if (!first) return;
      prim.preventDefault(event);
      dom.focus(first);
      return;
    }
    const list = tabbables();
    const previous = list[list.indexOf(target as HTMLElement) - 1];
    const entry = isTextArea(previous) ? entries.get(previous) : undefined;
    const last = entry ? controls(entry).at(-1) : undefined;
    if (!last) return;
    prim.preventDefault(event);
    dom.focus(last);
  }

  function entryFor(target: EventTarget | null): Entry | undefined {
    const field = target as Element | null;
    if (!isTextArea(field)) return undefined;
    const entry = entries.get(field);
    return entry && shown(field) && attachable(field) ? entry : undefined;
  }

  // Pasting files into the field or dropping them on it adds them too. 02 R4.61
  function onPaste(event: Event): void {
    const paste = event as ClipboardEvent;
    if (prim.prevented(event)) return;
    const entry = entryFor(paste.target);
    const files = Array.from(paste.clipboardData?.files ?? []);
    if (!entry || files.length === 0) return;
    if (!paste.clipboardData?.types.includes("text/plain")) prim.preventDefault(event);
    add(entry, files);
  }

  function onDragOver(event: Event): void {
    const drag = event as DragEvent;
    if (prim.prevented(event) || !entryFor(drag.target) || !drag.dataTransfer?.types.includes("Files")) return;
    prim.preventDefault(event);
    drag.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: Event): void {
    const drag = event as DragEvent;
    if (prim.prevented(event)) return;
    const entry = entryFor(drag.target);
    const files = Array.from(drag.dataTransfer?.files ?? []);
    if (!entry || files.length === 0) return;
    prim.preventDefault(event);
    add(entry, files);
  }

  function collected(form: HTMLFormElement): SubmitFile[] {
    const out: SubmitFile[] = [];
    for (const control of controlsOf(form)) {
      if (!isTextArea(control)) continue;
      const entry = entries.get(control);
      if (!entry || entry.files.length === 0 || unusable(control) || optedOut(control)) continue;
      const field = control.name || "attachment";
      for (const file of entry.files) out.push({ field, file, ...(/^audio\//i.test(file.type) ? { transcribe: true } : {}) });
    }
    return out;
  }

  if (typeof win.ResizeObserver === "function") resizeObserver = new win.ResizeObserver(() => schedule());
  prim.on(
    doc,
    "focusin",
    (event) => {
      if (isTextArea(event.target)) touched.add(event.target);
    },
    true,
  );
  prim.on(win, "keydown", onDocumentKey);
  prim.on(doc, "paste", onPaste);
  prim.on(doc, "dragover", onDragOver);
  prim.on(doc, "drop", onDrop);
  prim.on(doc, "scroll", onScroll, { capture: true, passive: true });
  prim.on(win, "resize", schedule);
  prim.on(doc, "visibilitychange", schedule);

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
