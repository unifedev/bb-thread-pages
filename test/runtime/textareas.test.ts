import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { createEmbedManager } from "../../src/runtime/kernel/embed.ts";
import { installKernel, type KernelHandle } from "../../src/runtime/kernel/install.ts";
import { capturePrimitives } from "../../src/runtime/kernel/primitives.ts";
import { chipName, LAYER_ATTRIBUTE } from "../../src/runtime/kernel/textareas.ts";

/**
 * Every text area can take voice and files, the audio capture input, and
 * files with sessions.start/send, as the kernel does them. jsdom lays nothing
 * out, so each field is given a box; the real layout is the browser pass's.
 * spec R4.24a, R4.55–R4.62, R5.75, D38–D40
 */
const REV = "f".repeat(64);
type Win = Window & typeof globalThis & { threadPage: { invoke(method: string, params?: unknown): Promise<unknown> } };

interface Fixture {
  win: Win;
  doc: Document;
  handle: KernelHandle;
  posted: Record<string, unknown>[];
  roots: ShadowRoot[];
  frame(): Promise<void>;
}

function install(body: string, options: { uploads?: boolean; embedded?: boolean; voice?: boolean; trusted?: boolean } = {}): Fixture {
  const dom = new JSDOM(`<!doctype html><html><head><style>button,svg,*{display:none !important;color:red !important}</style></head><body>${body}</body></html>`, {
    url: "https://bb.example/api/v1/plugins/thread-pages/http/document?session=thr_a",
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Win;
  // The layer is a closed shadow root; the test keeps a handle on it.
  const roots: ShadowRoot[] = [];
  const attach = win.Element.prototype.attachShadow;
  win.Element.prototype.attachShadow = function (init: ShadowRootInit) {
    const root = attach.call(this, init);
    roots.push(root);
    return root;
  };
  // A box for every text area, as a browser would lay one out.
  const proto = win.HTMLTextAreaElement.prototype as unknown as Record<string, unknown>;
  const rect = { left: 100, top: 100, right: 500, bottom: 220, width: 400, height: 120, x: 100, y: 100, toJSON() {} };
  Object.defineProperty(proto, "getBoundingClientRect", { configurable: true, value: () => rect });
  Object.defineProperty(win.HTMLElement.prototype, "getClientRects", { configurable: true, value: function (this: HTMLElement) { return this.hidden ? [] : [rect]; } });
  for (const [name, value] of [["clientWidth", 398], ["clientHeight", 118], ["clientLeft", 1], ["clientTop", 1]] as const) Object.defineProperty(proto, name, { configurable: true, get: () => value });
  const posted: Record<string, unknown>[] = [];
  // Stand-in primitives: jsdom makes no trusted event, and its file inputs and boxes are stubbed per test.
  const real = capturePrimitives(win);
  const primitives = {
    ...real,
    trusted: (event: unknown) => (options.trusted === true ? typeof event === "object" && event !== null : real.trusted(event)),
    dom: {
      ...real.dom,
      files: (input: HTMLInputElement) => Array.from(input.files ?? []),
      rect: (element: Element) => element.getBoundingClientRect(),
    },
  };
  const handle = installKernel(win, { pageRevision: REV, stale: false, ...(options.uploads === false ? { uploads: false } : {}), ...(options.embedded ? { embedded: true } : {}) }, { primitives });
  handle.connect({ postMessage: (message: unknown) => posted.push(message as Record<string, unknown>), start() {} });
  if (options.voice !== false) handle.deliver({ kind: "thread-page:voice", available: true });
  const frame = () => new Promise<void>((resolve) => win.requestAnimationFrame(() => setTimeout(resolve, 0)));
  return { win, doc: win.document, handle, posted, roots, frame };
}

function controlsFor(fixture: Fixture, index = 0): { group: HTMLElement; dictate: HTMLButtonElement; attach: HTMLButtonElement; list: HTMLElement; note: HTMLElement; more: HTMLButtonElement; popup: HTMLElement; picker: HTMLInputElement } {
  const root = fixture.roots[0]!;
  const group = root.querySelectorAll<HTMLElement>(".group")[index]!;
  return {
    group,
    dictate: group.querySelector<HTMLButtonElement>('button[aria-label="Dictate"]')!,
    attach: group.querySelector<HTMLButtonElement>('button[aria-label="Attach files"]')!,
    // The files sit in the row itself now, before the controls. Owner feedback, 1.7.0
    list: group.querySelector<HTMLElement>(".chips")!,
    note: group.querySelector<HTMLElement>(".note")!,
    more: group.querySelector<HTMLButtonElement>("button.more")!,
    popup: group.querySelector<HTMLElement>(".popup")!,
    picker: group.querySelector<HTMLInputElement>('input[type="file"]')!,
  };
}

function visible(button: HTMLElement): boolean {
  return !button.hidden && !(button.parentElement as HTMLElement).hidden;
}

function choose(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  input.dispatchEvent(new input.ownerDocument.defaultView!.Event("change"));
}

const FORM = `<h1>Question</h1><form data-title="Answer"><label>Anything else <textarea name="notes"></textarea></label><input type="file" name="upload" multiple><button name="action" value="Send">Send</button></form>`;

describe("the text-area controls (R4.55–R4.57, A126, A127, A130a)", () => {
  it("draw Dictate and Attach files in a layer that is the last child of <html>, leaving the field and the page untouched", async () => {
    const fixture = install(FORM);
    const field = fixture.doc.querySelector("textarea")!;
    const before = field.outerHTML;
    await fixture.frame();
    const host = fixture.doc.documentElement.lastElementChild!;
    // A plain <div>, which no page can define as a custom element to reach its closed root.
    expect(host.tagName.toLowerCase()).toBe("div");
    expect(host.hasAttribute(LAYER_ATTRIBUTE)).toBe(true);
    // At the document's origin, so rows in document coordinates scroll with the page on their own.
    expect(host.getAttribute("style")).toContain("position:absolute !important");
    expect(host.getAttribute("style")).toContain("z-index:2147483647 !important");
    expect(fixture.doc.body.contains(host)).toBe(false);
    const { dictate, attach, group } = controlsFor(fixture);
    expect(visible(dictate) && visible(attach)).toBe(true);
    expect(dictate.tagName).toBe("BUTTON");
    // Over the bottom-right corner, clear of the resize handle (jsdom computes no `resize`, so the inset applies).
    expect(group.style.top).toBe(`${100 + 1 + 118 - 24 - 3}px`);
    // Anchored by its right edge, at the field's inner right edge less the inset; it grows leftward.
    expect(group.style.left).toBe(`${100 + 1 + 398 - 3}px`);
    expect(group.style.position).toBe("absolute");
    expect(dictate.querySelector("svg")).not.toBeNull();
    expect(field.outerHTML).toBe(before);
    // That the page's rules on `*`, `button` and `svg` reach nothing inside is the browser pass's to see (jsdom's cascade ignores shadow boundaries).
    // Nothing of the layer is label text or part of the form.
    expect((fixture.doc.querySelector("form") as HTMLFormElement).elements).toHaveLength(3);
  });

  it("give nothing to disabled, read-only, hidden or opted-out text areas, or to other controls, and take them away while the form sends", async () => {
    const fixture = install(`
      <form><textarea name="a" disabled></textarea><textarea name="b" readonly></textarea><textarea name="c" hidden></textarea>
        <textarea name="d" data-thread-page-manual></textarea><input name="e"><textarea name="f"></textarea><button>Send</button></form>
      <form data-thread-page-manual><textarea name="g"></textarea></form>`);
    await fixture.frame();
    const groups = Array.from(fixture.roots[0]!.querySelectorAll<HTMLElement>(".group"));
    // a, b, c and f were prepared (d and g are opted out for good); only f shows anything.
    expect(groups).toHaveLength(4);
    expect(groups.map((group) => group.hidden)).toEqual([true, true, true, false]);
    const form = fixture.doc.querySelector("form")!;
    form.dispatchEvent(new fixture.win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await fixture.frame();
    expect(groups[3]!.hidden).toBe(true);
    // The opted-out field is still answered with its form. spec R4.6a
    const sent = fixture.posted.find((message) => message.kind === "thread-page:submit")!;
    expect((sent.answers as { name: string }[]).map((answer) => answer.name)).toEqual(["b", "c", "d", "e", "f"]);
    fixture.handle.deliver({ kind: "thread-page:submit-result", submissionId: sent.submissionId as string, ok: true, message: "Sent" });
    await fixture.frame();
    expect(groups[3]!.hidden).toBe(false);
  });

  it("offer Dictate only outside a form, on a page that cannot upload, and inside an embed; nothing without voice (A131)", async () => {
    const outside = install(`<textarea></textarea>`);
    await outside.frame();
    expect([visible(controlsFor(outside).dictate), visible(controlsFor(outside).attach)]).toEqual([true, false]);
    const home = install(FORM, { uploads: false });
    await home.frame();
    expect([visible(controlsFor(home).dictate), visible(controlsFor(home).attach)]).toEqual([true, false]);
    const embedded = install(FORM, { embedded: true });
    await embedded.frame();
    expect([visible(controlsFor(embedded).dictate), visible(controlsFor(embedded).attach)]).toEqual([true, false]);
    const silent = install(FORM, { voice: false });
    await silent.frame();
    expect([visible(controlsFor(silent).dictate), visible(controlsFor(silent).attach)]).toEqual([false, true]);
    silent.handle.deliver({ kind: "thread-page:voice", available: true });
    await silent.frame();
    expect(visible(controlsFor(silent).dictate)).toBe(true);
  });

  it("come right after their field with Tab, and Shift+Tab returns (R4.56)", async () => {
    // The reader's keys (stand-in: every event counts as trusted here).
    const fixture = install(`<form><textarea name="notes"></textarea><button id="next">Send</button></form>`, { trusted: true });
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    const { dictate, attach } = controlsFor(fixture);
    field.focus();
    field.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(fixture.roots[0]!.activeElement).toBe(dictate);
    dictate.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(fixture.roots[0]!.activeElement).toBe(attach);
    attach.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(fixture.doc.activeElement?.id).toBe("next");
    fixture.doc.getElementById("next")!.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(fixture.roots[0]!.activeElement).toBe(attach);
    // A page that uses Tab in its field keeps it.
    field.focus();
    field.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    field.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(fixture.doc.activeElement).toBe(field);
  });
});

describe("Dictate (R4.58, A128)", () => {
  it("sends the text before the caret, inserts the transcript there with a separating space, and fires input and change", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    field.value = "Hello world";
    field.focus();
    field.setSelectionRange(5, 5);
    const events: string[] = [];
    field.addEventListener("input", () => events.push("input"));
    field.addEventListener("change", () => events.push("change"));
    controlsFor(fixture).dictate.click();
    const ask = fixture.posted.find((message) => message.kind === "thread-page:record")!;
    expect(ask).toMatchObject({ purpose: "dictate", prompt: "Hello" });
    fixture.handle.deliver({ kind: "thread-page:recorded", id: ask.id as string, ok: true, text: "there" });
    await Promise.resolve();
    await Promise.resolve();
    expect(field.value).toBe("Hello there world");
    expect(events).toEqual(["input", "change"]);
    expect(fixture.posted).toContainEqual({ kind: "thread-page:dirty" });
  });

  it("answers an untouched field at its end, and leaves the field alone on Cancel, too short or a failure", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    field.value = "Start";
    const { dictate, list } = controlsFor(fixture);
    dictate.click();
    const first = fixture.posted.filter((message) => message.kind === "thread-page:record").at(-1)!;
    expect(first.prompt).toBe("Start");
    fixture.handle.deliver({ kind: "thread-page:recorded", id: first.id as string, ok: false, code: "cancelled", message: "cancelled" });
    await Promise.resolve();
    expect(field.value).toBe("Start");
    dictate.click();
    const second = fixture.posted.filter((message) => message.kind === "thread-page:record").at(-1)!;
    fixture.handle.deliver({ kind: "thread-page:recorded", id: second.id as string, ok: false, code: "unavailable", message: "The recording could not be transcribed." });
    await fixture.frame();
    expect(field.value).toBe("Start");
    expect(controlsFor(fixture).note.textContent).toContain("Dictation failed: The recording could not be transcribed.");
    dictate.click();
    const third = fixture.posted.filter((message) => message.kind === "thread-page:record").at(-1)!;
    fixture.handle.deliver({ kind: "thread-page:recorded", id: third.id as string, ok: true, text: "and more." });
    await Promise.resolve();
    await Promise.resolve();
    expect(field.value).toBe("Start and more.");
  });
});

describe("Attach (R4.60–R4.62, A129, A130, A132)", () => {
  it("shows chosen, pasted and dropped files in the row before the controls, removes one, and sends the rest beside the field", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    const { picker, list } = controlsFor(fixture);
    const shot = new fixture.win.File(["png"], "shot.png", { type: "image/png" });
    const memo = new fixture.win.File(["ogg"], "memo.ogg", { type: "audio/ogg" });
    const extra = new fixture.win.File(["x"], "extra.txt", { type: "text/plain" });
    choose(picker, [shot]);
    const paste = Object.assign(new fixture.win.Event("paste", { bubbles: true, cancelable: true }), { clipboardData: { files: [memo], types: ["Files"] } });
    field.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = Object.assign(new fixture.win.Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: { files: [extra], types: ["Files"] } });
    field.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await fixture.frame();
    expect(list.parentElement!.hidden).toBe(false);
    expect(Array.from(list.querySelectorAll(".chip .name")).map((node) => node.textContent)).toEqual(["shot.png", "memo.ogg", "extra.txt"]);
    // In the row, laid out before Dictate and Attach files (CSS order), which stay the row's first buttons.
    expect(list.parentElement!.querySelector("button")!.getAttribute("aria-label")).toBe("Dictate");
    expect(fixture.posted).toContainEqual({ kind: "thread-page:dirty" });
    list.querySelector<HTMLButtonElement>('button[aria-label="Remove extra.txt"]')!.click();
    await fixture.frame();
    const form = fixture.doc.querySelector("form")!;
    form.dispatchEvent(new fixture.win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    const sent = fixture.posted.find((message) => message.kind === "thread-page:submit")!;
    expect((sent.files as { field: string; file: File; transcribe?: boolean }[]).map((entry) => [entry.field, entry.file.name, entry.transcribe === true])).toEqual([
      ["notes", "shot.png", false],
      ["notes", "memo.ogg", true],
    ]);
  });

  it("counts a form's file inputs and text areas together, and refuses the ninth or an oversized file visibly", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    const upload = fixture.doc.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(upload, "files", { configurable: true, value: Array.from({ length: 8 }, (_, index) => new fixture.win.File(["x"], `f${index}.txt`)) });
    const { picker, list } = controlsFor(fixture);
    choose(picker, [new fixture.win.File(["x"], "ninth.txt")]);
    await fixture.frame();
    expect(controlsFor(fixture).note.textContent).toContain("Not added: at most 8 files per form");
    const big = new fixture.win.File(["x"], "big.bin");
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 });
    Object.defineProperty(upload, "files", { configurable: true, value: [] });
    choose(picker, [big]);
    await fixture.frame();
    expect(controlsFor(fixture).note.textContent).toContain("“big.bin” is larger than 24 MiB");
    // Nine through the file input alone: the form is not sent, and says why.
    Object.defineProperty(upload, "files", { configurable: true, value: Array.from({ length: 9 }, (_, index) => new fixture.win.File(["x"], `g${index}.txt`)) });
    const form = fixture.doc.querySelector("form")!;
    form.dispatchEvent(new fixture.win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(fixture.posted.some((message) => message.kind === "thread-page:submit")).toBe(false);
    expect(form.querySelector("[data-thread-page-status]")!.textContent).toBe("This form has 9 files; at most 8 can be sent at once. Remove 1 and send again.");
  });
});

describe("the audio capture input (R4.24a, R4.24b, A133)", () => {
  const INPUT = `<form><input type="file" name="voice" accept="audio/*" capture><input type="file" name="plain" accept="audio/*"><button>Send</button></form>`;

  it("opens the shell's recorder on desktop, and the recording becomes the input's file", async () => {
    const fixture = install(INPUT);
    let stored: unknown = null;
    const input = fixture.doc.querySelector<HTMLInputElement>('input[name="voice"]')!;
    Object.defineProperty(input, "files", { configurable: true, get: () => stored, set: (value) => (stored = value) });
    (fixture.win as unknown as { DataTransfer: unknown }).DataTransfer = class {
      list: File[] = [];
      items = { add: (file: File) => this.list.push(file) };
      get files() {
        return this.list;
      }
    };
    const changes: string[] = [];
    input.addEventListener("change", () => changes.push("change"));
    const click = new fixture.win.MouseEvent("click", { bubbles: true, cancelable: true });
    input.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    const ask = fixture.posted.find((message) => message.kind === "thread-page:record")!;
    expect(ask.purpose).toBe("audio");
    const file = new fixture.win.File(["webm"], "recording-20260925-120000.webm", { type: "audio/webm" });
    fixture.handle.deliver({ kind: "thread-page:recorded", id: ask.id as string, ok: true, file });
    await Promise.resolve();
    await Promise.resolve();
    expect(stored).toEqual([file]);
    expect(changes).toEqual(["change"]);
    // On submit it is transcribed; audio from a plain file input is not.
    Object.defineProperty(fixture.doc.querySelector('input[name="plain"]')!, "files", { configurable: true, value: [new fixture.win.File(["x"], "song.mp3", { type: "audio/mpeg" })] });
    fixture.doc.querySelector("form")!.dispatchEvent(new fixture.win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    const sent = fixture.posted.find((message) => message.kind === "thread-page:submit")!;
    expect((sent.files as { field: string; transcribe?: boolean }[]).map((entry) => [entry.field, entry.transcribe === true])).toEqual([
      ["voice", true],
      ["plain", false],
    ]);
  });

  it("is left to the browser with a coarse pointer, without voice, and inside an embed", () => {
    for (const setup of [
      (fixture: Fixture) => ((fixture.win as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query === "(pointer: coarse)" })),
      (fixture: Fixture) => fixture.handle.deliver({ kind: "thread-page:voice", available: false }),
    ]) {
      const fixture = install(INPUT);
      setup(fixture);
      const click = new fixture.win.MouseEvent("click", { bubbles: true, cancelable: true });
      fixture.doc.querySelector('input[name="voice"]')!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
      expect(fixture.posted.some((message) => message.kind === "thread-page:record")).toBe(false);
    }
    const embedded = install(INPUT, { embedded: true });
    const click = new embedded.win.MouseEvent("click", { bubbles: true, cancelable: true });
    embedded.doc.querySelector('input[name="voice"]')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
});

describe("files with sessions.start and sessions.send (R5.75)", () => {
  it("pass the Files beside the JSON, from a list, an array or an <input type=file>", async () => {
    const fixture = install(`<input type="file" id="pick" multiple>`);
    const file = new fixture.win.File(["abc"], "a.txt", { type: "text/plain" });
    void fixture.win.threadPage.invoke("sessions.start", { projectId: "proj_a", prompt: "go", files: [file] });
    const request = fixture.posted.find((message) => message.method === "sessions.start")!;
    expect(request.params).toEqual({ projectId: "proj_a", prompt: "go" });
    expect(request.files).toEqual([file]);
    const pick = fixture.doc.getElementById("pick") as HTMLInputElement;
    Object.defineProperty(pick, "files", { configurable: true, value: [file] });
    void fixture.win.threadPage.invoke("sessions.send", { sessionId: "thr_b", prompt: "go", files: pick });
    expect(fixture.posted.find((message) => message.method === "sessions.send")!.files).toEqual([file]);
    // No files is a plain call; anything else is refused before it leaves.
    void fixture.win.threadPage.invoke("sessions.start", { projectId: "proj_a", prompt: "go", files: [] });
    expect(fixture.posted.filter((message) => message.method === "sessions.start").at(-1)).not.toHaveProperty("files");
    await expect(fixture.win.threadPage.invoke("sessions.start", { projectId: "p", prompt: "go", files: [{ name: "a", size: 1 }] })).rejects.toMatchObject({ code: "invalid_params" });
    await expect(fixture.win.threadPage.invoke("sessions.start", { projectId: "p", prompt: "go", files: "a.txt" })).rejects.toMatchObject({ code: "invalid_params" });
  });
});

describe("dictation inside an embed (R4.51a, A131)", () => {
  it("is answered by the embedding page's recorder, counts toward the embed's bound, and nothing else records there", async () => {
    const dom = new JSDOM(`<!doctype html><html><body><div id="box"></div></body></html>`, { url: "https://bb.example/document?session=thr_a", pretendToBeVisual: true });
    const win = dom.window as unknown as Window & typeof globalThis;
    (win as unknown as { MessageChannel: typeof MessageChannel }).MessageChannel = MessageChannel;
    const invoke = vi.fn(async (method: string) => {
      if (method === "pages.read") return { pages: [{ sessionId: "thr_b", path: "index.html", revision: "2".repeat(64), html: "<p>b</p>", title: "B", projectId: "proj_a", working: false, readOnly: false, answerToken: "tok.x" }] };
      throw new Error("unexpected");
    });
    const dictate = vi.fn(async (prompt: string) => ({ ok: true as const, text: `heard after “${prompt}”` }));
    const manager = createEmbedManager(win, { invoke, setDirty: () => undefined, embedded: false, dictate, voiceAvailable: () => true });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const frame = win.document.querySelector("iframe")!;
    const channel = new MessageChannel();
    win.dispatchEvent(new win.MessageEvent("message", { data: { kind: "thread-page:ready", version: 2 }, origin: "null", source: frame.contentWindow, ports: [channel.port2] as never }));
    const port: MessagePort | null = channel.port1;
    const received: Record<string, unknown>[] = [];
    port!.onmessage = (event) => received.push(event.data as Record<string, unknown>);
    port!.postMessage({ kind: "thread-page:record", id: "tp-record-1", purpose: "dictate", prompt: "so far" });
    port!.postMessage({ kind: "thread-page:record", id: "tp-record-2", purpose: "audio" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toContainEqual({ kind: "thread-page:voice", available: true });
    expect(received).toContainEqual({ kind: "thread-page:recorded", id: "tp-record-1", ok: true, text: "heard after “so far”" });
    expect(received).toContainEqual(expect.objectContaining({ kind: "thread-page:recorded", id: "tp-record-2", ok: false, code: "unavailable" }));
    expect(dictate).toHaveBeenCalledTimes(1);
    manager.setVoice(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(received.at(-1)).toEqual({ kind: "thread-page:voice", available: false });
  });
});

describe("after review", () => {
  it("ignore a script's Tab: focus never moves onto Dictate under a real Enter", async () => {
    const fixture = install(`<form><textarea name="notes"></textarea><button id="next">Send</button></form>`);
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    field.focus();
    field.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(fixture.roots[0]!.activeElement).toBeNull();
    expect(fixture.doc.activeElement).toBe(field);
  });

  it("give nothing to a field disabled by its fieldset or made inert", async () => {
    const fixture = install(`<form><fieldset disabled><textarea name="a"></textarea></fieldset><div inert><textarea name="b"></textarea></div><textarea name="c"></textarea></form>`);
    await fixture.frame();
    const groups = Array.from(fixture.roots[0]!.querySelectorAll<HTMLElement>(".group"));
    expect(groups.map((group) => group.hidden)).toEqual([true, true, false]);
  });

  it("leave a paste the page handled itself alone, and post Escape to the shell", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    const field = fixture.doc.querySelector("textarea")!;
    field.addEventListener("paste", (event) => event.preventDefault());
    field.dispatchEvent(Object.assign(new fixture.win.Event("paste", { bubbles: true, cancelable: true }), { clipboardData: { files: [new fixture.win.File(["x"], "x.txt")], types: ["Files"] } }));
    await fixture.frame();
    expect(controlsFor(fixture).list.children).toHaveLength(0);
    field.dispatchEvent(new fixture.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(fixture.posted).toContainEqual({ kind: "thread-page:escape" });
  });

  it("treat files: undefined as no files", () => {
    const fixture = install(`<p></p>`);
    void fixture.win.threadPage.invoke("sessions.start", { projectId: "proj_a", prompt: "go", files: undefined });
    const request = fixture.posted.find((message) => message.method === "sessions.start")!;
    expect(request.params).toEqual({ projectId: "proj_a", prompt: "go" });
    expect(request).not.toHaveProperty("files");
  });
});

describe("files in the row (owner feedback, 1.7.0)", () => {
  it("shorten a long name in the middle, keeping its extension", () => {
    expect(chipName("report.pdf")).toBe("report.pdf");
    expect(chipName("quarterly-financial-report-final.pdf")).toBe("quarterl…final.pdf");
    expect(chipName("quarterly-financial-report-final.pdf").length).toBe(18);
    expect(chipName("a-very-long-name-without-extension")).toMatch(/^a-very-long…/);
  });

  it("show as many chips as fit beside the controls, the rest behind +N, which lists them removable", async () => {
    const fixture = install(FORM);
    // Chips 120 px wide, the "+N" 30 px: 339 px of room beside the controls in this field.
    Object.defineProperty(fixture.win.HTMLSpanElement.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ width: 120 }) });
    Object.defineProperty(fixture.win.HTMLButtonElement.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ width: 30 }) });
    await fixture.frame();
    const { picker, list, more, popup } = controlsFor(fixture);
    choose(picker, ["a.txt", "b.txt", "c.txt"].map((name) => new fixture.win.File(["x"], name)));
    await fixture.frame();
    const shown = Array.from(list.querySelectorAll<HTMLElement>(".chip")).filter((chip) => !chip.hidden);
    expect(shown.map((chip) => chip.querySelector(".name")!.textContent)).toEqual(["a.txt", "b.txt"]);
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe("+1");
    expect(more.getAttribute("aria-label")).toBe("Show 1 more file");
    expect(popup.hidden).toBe(true);
    more.click();
    expect(popup.hidden).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    popup.querySelector<HTMLButtonElement>('button[aria-label="Remove c.txt"]')!.click();
    await fixture.frame();
    expect(more.hidden).toBe(true);
    const form = fixture.doc.querySelector("form")!;
    form.dispatchEvent(new fixture.win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    const sent = fixture.posted.find((message) => message.kind === "thread-page:submit")!;
    expect((sent.files as { file: File }[]).map((entry) => entry.file.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("send the control flag only for the reader's own press, never for a script's click", async () => {
    const fixture = install(FORM);
    await fixture.frame();
    controlsFor(fixture).dictate.click();
    const ask = fixture.posted.find((message) => message.kind === "thread-page:record")!;
    expect(ask.purpose).toBe("dictate");
    expect(ask).not.toHaveProperty("control");
  });
});
