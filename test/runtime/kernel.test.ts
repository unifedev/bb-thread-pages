import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { installKernel, type KernelHandle } from "../../src/runtime/kernel/install.ts";
import { collectAnswers } from "../../src/runtime/kernel/labels.ts";
import { decideAnchor } from "../../src/runtime/kernel/anchors.ts";

const REV = "f".repeat(64);

interface Posted {
  messages: unknown[];
}

type PageWindow = Window & typeof globalThis & { threadPage: ThreadPage };
interface ThreadPage {
  version: 1;
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  setDirty(dirty: boolean): void;
}

let window: PageWindow;
let document: Document;

/** Every install gets its own window: the API is non-configurable by design. */
function fresh(html: string): PageWindow {
  const dom = new JSDOM(`<!doctype html><html>${html}</html>`, { url: "https://bb.example/api/v1/plugins/thread-pages/http/document?session=thr_a", pretendToBeVisual: true });
  window = dom.window as unknown as PageWindow;
  document = window.document;
  return window;
}

function install(html: string, stale = false): { handle: KernelHandle; posted: Posted; api: ThreadPage } {
  const win = fresh(html);
  const posted: Posted = { messages: [] };
  const handle = installKernel(win, { pageRevision: REV, stale });
  handle.connect({ postMessage: (message: unknown) => posted.messages.push(message), start() {} });
  return { handle, posted, api: win.threadPage };
}

function submit(form: HTMLFormElement, submitter?: Element | null): void {
  const event = new window.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: (submitter ?? null) as HTMLElement | null });
  form.dispatchEvent(event);
}

const FORMS = `<head><title>Fixture</title></head><body><h1>Page heading</h1>
<form data-title="Form A">
  <fieldset><legend>Which approach</legend>
    <label><input type="radio" name="approach" value="first"> First</label>
    <label><input type="radio" name="approach" value="second"> Second</label>
    <small>hint</small>
  </fieldset>
  <fieldset><legend>Which apply</legend>
    <label><input type="checkbox" name="applies" value="alpha" checked> Alpha</label>
    <label><input type="checkbox" name="applies" value="beta"> Beta</label>
  </fieldset>
  <label>Is this urgent? <input type="checkbox" name="urgent"><small>lone box</small></label>
  <label>How deep? <input type="range" name="depth" min="0" max="10" value="4"></label>
  <label>Anything else <textarea name="notes"></textarea><small>Expected name: Anything else</small></label>
  <label>Pick one <select name="pick"><option value="">(none)</option><option value="x">Option X</option></select></label>
  <label for="named">Named field</label><input id="named" name="named" value="v">
  <input name="labelled" data-label="Explicit" value="w">
  <select name="multi" multiple><option value="a" selected>A</option><option value="b" selected>B</option></select>
  <button name="action" value="Submitted A">Submit</button>
</form>
<form data-title="Form B"><input name="word" value="independent"><button name="action" value="Submitted B">B</button></form>
<form data-thread-page-manual id="manual"><input name="never" value="no"><button>Local</button></form>
<dialog id="trap"><form method="dialog"><button value="cancel">Cancel</button><button value="confirm">Confirm</button></form></dialog>
</body>`;

describe("window.threadPage", () => {
  it("is frozen, non-writable and non-configurable with exactly the spec surface", () => {
    const { api } = install(FORMS);
    const descriptor = Object.getOwnPropertyDescriptor(window, "threadPage");
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual(["embed", "invoke", "setDirty", "version", "watch"]);
    expect(api.version).toBe(1);
  });
});

describe("kernel forms", () => {
  let posted: Posted;
  let handle: KernelHandle;

  beforeEach(() => {
    ({ posted, handle } = install(FORMS));
  });

  it("suppresses native validation on captured forms only and adds a range readout", () => {
    const [formA, formB, manual] = Array.from(document.querySelectorAll("form"));
    expect(formA!.noValidate).toBe(true);
    expect(formB!.noValidate).toBe(true);
    expect(manual!.noValidate).toBe(false);
    expect(manual!.querySelector("[data-thread-page-status]")).toBeNull();
    expect(formA!.querySelector("output[data-thread-page-range]")?.textContent).toBe("4");
  });

  it("collects answers with labels, groups collapsed and the submitter first", () => {
    const form = document.querySelector<HTMLFormElement>('form[data-title="Form A"]')!;
    const button = form.querySelector("button")!;
    const answers = collectAnswers(form, button);
    expect(answers[0]).toEqual({ name: "action", label: "Action", value: "Submitted A" });
    const byName = Object.fromEntries(answers.map((answer) => [answer.name, answer]));
    expect(byName.approach).toEqual({ name: "approach", label: "Which approach", value: "" });
    expect(byName.applies).toEqual({ name: "applies", label: "Which apply", value: ["alpha"] });
    expect(byName.urgent).toEqual({ name: "urgent", label: "Is this urgent?", value: false });
    expect(byName.notes).toEqual({ name: "notes", label: "Anything else", value: "" });
    expect(byName.pick!.label).toBe("Pick one");
    expect(byName.named!.label).toBe("Named field");
    expect(byName.labelled!.label).toBe("Explicit");
    expect(byName.multi!.value).toEqual(["a", "b"]);
    expect(byName.depth!.value).toBe("4");
  });

  it("delivers a submission over the port, locks the form, and restores it on the result", () => {
    const form = document.querySelector<HTMLFormElement>('form[data-title="Form A"]')!;
    submit(form, form.querySelector("button"));
    const message = posted.messages.find((entry) => (entry as { kind?: string }).kind === "thread-page:submit") as { submissionId: string; title: string; answers: unknown[] };
    expect(message.title).toBe("Form A");
    expect(message.answers[0]).toEqual({ name: "action", label: "Action", value: "Submitted A" });
    expect(form.querySelector("textarea")!.disabled).toBe(true);
    expect(form.querySelector("[data-thread-page-status]")!.textContent).toBe("Sending…");
    handle.deliver({ kind: "thread-page:submit-result", submissionId: message.submissionId, ok: true, message: "Sent (queued)" });
    expect(form.querySelector("textarea")!.disabled).toBe(false);
    expect(form.querySelector("[data-thread-page-status]")!.textContent).toBe("Sent (queued)");
  });

  it("keeps forms independent and ignores a second submit while one is pending", () => {
    const [formA, formB] = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
    formA!.querySelector("textarea")!.value = "typed";
    submit(formB!, formB!.querySelector("button"));
    expect(formA!.querySelector("textarea")!.value).toBe("typed");
    expect(formA!.querySelector("textarea")!.disabled).toBe(false);
    submit(formB!, formB!.querySelector("button"));
    expect(posted.messages.filter((entry) => (entry as { kind?: string }).kind === "thread-page:submit")).toHaveLength(1);
  });

  it("leaves the opt-out form alone and captures the dialog form (the documented trap)", () => {
    const manual = document.getElementById("manual") as HTMLFormElement;
    submit(manual);
    expect(posted.messages.filter((entry) => (entry as { kind?: string }).kind === "thread-page:submit")).toHaveLength(0);
    const trap = document.querySelector<HTMLFormElement>("#trap form")!;
    submit(trap, trap.querySelector('button[value="confirm"]'));
    const message = posted.messages.find((entry) => (entry as { kind?: string }).kind === "thread-page:submit") as { title: string; answers: { label: string; value: unknown }[] };
    expect(message.title).toBe("Page heading");
    expect(message.answers).toEqual([{ name: "", label: "Action", value: "confirm" }].map((answer) => ({ ...answer, name: "action" })));
  });

  it("marks the page dirty on input without page code and clears it after a successful submit", () => {
    const form = document.querySelector<HTMLFormElement>('form[data-title="Form A"]')!;
    const textarea = form.querySelector("textarea")!;
    textarea.value = "x";
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(posted.messages).toContainEqual({ kind: "thread-page:dirty" });
    submit(form, form.querySelector("button"));
    const message = posted.messages.find((entry) => (entry as { kind?: string }).kind === "thread-page:submit") as { submissionId: string };
    handle.deliver({ kind: "thread-page:submit-result", submissionId: message.submissionId, ok: true });
    expect(posted.messages).toContainEqual({ kind: "thread-page:clean" });
    window.threadPage.setDirty(true);
    expect(posted.messages.filter((entry) => (entry as { kind?: string }).kind === "thread-page:dirty")).toHaveLength(2);
  });
});

describe("kernel bridge client", () => {
  it("queues invocations made before the port is ready and resolves them afterwards", async () => {
    const win = fresh("<head></head><body></body>");
    const handle = installKernel(win, { pageRevision: REV, stale: false });
    const pending = win.threadPage.invoke("context.get");
    const posted: unknown[] = [];
    handle.connect({ postMessage: (message: unknown) => posted.push(message), start() {} });
    const request = posted[0] as { id: string; method: string; pageRevision: string; params: unknown };
    expect(request.method).toBe("context.get");
    expect(request.pageRevision).toBe(REV);
    expect(request.params).toBeNull();
    handle.deliver({ v: 1, id: request.id, ok: true, result: { protocolVersion: 1 } });
    await expect(pending).resolves.toEqual({ protocolVersion: 1 });
  });

  it("rejects with a coded error, and with invalid_response for a malformed reply", async () => {
    const { handle, posted } = install("<head></head><body></body>");
    const failing = window.threadPage.invoke("sessions.stop", { sessionId: "thr_x" });
    const request = posted.messages[0] as { id: string };
    handle.deliver({ v: 1, id: request.id, ok: false, error: { code: "cancelled", message: "You declined" } });
    await expect(failing).rejects.toMatchObject({ code: "cancelled", message: "You declined" });
    const malformed = window.threadPage.invoke("context.get");
    const second = posted.messages[1] as { id: string };
    handle.deliver({ v: 1, id: second.id, ok: true, result: 1, extra: true } as never);
    await expect(malformed).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("clamps watch intervals, pauses when hidden, and stops polling when stopped", async () => {
    vi.useFakeTimers();
    try {
      const { handle, posted } = install("<head></head><body></body>");
      const seen: unknown[] = [];
      const stop = window.threadPage.watch("session.activity", { limit: 1 }, (value: unknown) => seen.push(value), { intervalMs: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(posted.messages).toHaveLength(1);
      handle.deliver({ v: 1, id: (posted.messages[0] as { id: string }).id, ok: true, result: { state: "idle" } });
      await vi.advanceTimersByTimeAsync(LIMITS.watchMinMs - 1);
      expect(posted.messages).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2);
      expect(posted.messages).toHaveLength(2);
      handle.deliver({ v: 1, id: (posted.messages[1] as { id: string }).id, ok: true, result: { state: "idle" } });
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new window.Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(LIMITS.watchMinMs * 3);
      expect(posted.messages).toHaveLength(2);
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new window.Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1);
      expect(posted.messages).toHaveLength(3);
      stop();
      handle.deliver({ v: 1, id: (posted.messages[2] as { id: string }).id, ok: true, result: { state: "idle" } });
      await vi.advanceTimersByTimeAsync(LIMITS.watchMaxMs);
      expect(posted.messages).toHaveLength(3);
      expect(seen).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("contributed capabilities in the kernel", () => {
  it("carries a declared reason and detail on the rejected error, beside code (R4.28a)", async () => {
    const { handle, posted } = install("<head></head><body></body>");
    const failing = window.threadPage.invoke("syns.write", { path: "a.md" });
    const request = posted.messages[0] as { id: string };
    handle.deliver({ v: 1, id: request.id, ok: false, error: { code: "conflict", message: "moved", reason: "stale_head", detail: { current: "v9" } } });
    await expect(failing).rejects.toMatchObject({ code: "conflict", reason: "stale_head", detail: { current: "v9" } });
    // A detail without a reason is not a shape the host sends: invalid_response.
    const odd = window.threadPage.invoke("syns.write", {});
    handle.deliver({ v: 1, id: (posted.messages[1] as { id: string }).id, ok: false, error: { code: "conflict", message: "moved", detail: 1 } } as never);
    await expect(odd).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("watches a contributed read, and refuses to poll a contributed write (R5.54)", async () => {
    vi.useFakeTimers();
    try {
      const { handle, posted } = install("<head></head><body></body>");
      const roster = { capabilities: [{ method: "syns.head", effect: "read" }, { method: "syns.write", effect: "contributed-write" }] };
      const errors: unknown[] = [];
      window.threadPage.watch("syns.write", {}, (_value: unknown, error: unknown) => errors.push(error));
      await vi.advanceTimersByTimeAsync(0);
      const first = posted.messages[0] as { id: string; method: string };
      expect(first.method).toBe("context.get");
      handle.deliver({ v: 1, id: first.id, ok: true, result: roster });
      await vi.advanceTimersByTimeAsync(LIMITS.watchMaxMs);
      expect(posted.messages).toHaveLength(1);
      expect(errors).toEqual([expect.objectContaining({ code: "invalid_params" })]);

      const seen: unknown[] = [];
      const stop = window.threadPage.watch("syns.head", {}, (value: unknown) => seen.push(value));
      await vi.advanceTimersByTimeAsync(0);
      const poll = posted.messages[1] as { id: string; method: string };
      expect(poll.method).toBe("syns.head");
      handle.deliver({ v: 1, id: poll.id, ok: true, result: { version: "v1" } });
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual([{ version: "v1" }]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("kernel read-only mode", () => {
  it("disables only what it disabled, shows the banner, and restores on reconnection", () => {
    const { handle } = install(`<head></head><body><form><input name="a"><input name="b" disabled><button>Go</button></form></body>`, true);
    const [a, b] = Array.from(document.querySelectorAll("input"));
    expect(a!.disabled).toBe(true);
    expect(b!.disabled).toBe(true);
    expect(document.querySelector('[data-thread-page-offline="host"]')).not.toBeNull();
    expect(document.querySelector("[data-thread-page-status]")!.textContent).toMatch(/Offline copy/);
    handle.deliver({ kind: "thread-page:source-state", stale: false });
    expect(a!.disabled).toBe(false);
    expect(b!.disabled).toBe(true);
    expect(document.querySelector('[data-thread-page-offline="host"]')).toBeNull();
  });
});

describe("controls outside their form", () => {
  const JOINED = `<head></head><body><h1>Joined</h1>
<section><fieldset><legend>Pick a plan</legend>
  <label><input type="radio" name="plan" value="a" form="answer" checked> A</label>
  <label><input type="radio" name="plan" value="b" form="answer"> B</label>
</fieldset></section>
<section><label>Notes on B <textarea name="notes" form="answer"></textarea></label>
  <label>Depth <input type="range" name="depth" value="3" form="answer"></label></section>
<form id="answer" data-title="Joined"></form>
<button id="far" form="answer" name="action" value="Send from the card">Send</button>
</body>`;

  // A question beside the content it concerns still arrives as one answer.
  // spec R4.5a, DECISIONS D12
  it("delivers, names, dirties and locks a control joined with form=", () => {
    const { posted, handle } = install(JOINED);
    const form = document.getElementById("answer") as HTMLFormElement;
    const notes = document.querySelector("textarea")!;
    const far = document.getElementById("far") as HTMLButtonElement;
    expect(document.querySelector("output[data-thread-page-range]")?.textContent).toBe("3");
    notes.value = "because";
    notes.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(posted.messages).toContainEqual({ kind: "thread-page:dirty" });
    submit(form, far);
    const message = posted.messages.find((entry) => (entry as { kind?: string }).kind === "thread-page:submit") as { submissionId: string; title: string; answers: unknown[] };
    expect(message.title).toBe("Joined");
    expect(message.answers).toEqual([
      { name: "action", label: "Action", value: "Send from the card" },
      { name: "plan", label: "Pick a plan", value: "a" },
      { name: "notes", label: "Notes on B", value: "because" },
      { name: "depth", label: "Depth", value: "3" },
    ]);
    expect(notes.disabled).toBe(true);
    expect(far.disabled).toBe(true);
    handle.deliver({ kind: "thread-page:submit-result", submissionId: message.submissionId, ok: true, message: "Sent (queued)" });
    expect(notes.disabled).toBe(false);
    expect(far.disabled).toBe(false);
    expect(posted.messages).toContainEqual({ kind: "thread-page:clean" });
  });

  it("locks joined controls in read-only mode and leaves a manual form's joined controls alone", () => {
    install(`<head></head><body><form id="a"></form><input name="x" form="a"><form id="m" data-thread-page-manual></form><input name="y" form="m"></body>`, true);
    const [x, y] = Array.from(document.querySelectorAll("input"));
    expect(x!.disabled).toBe(true);
    expect(y!.disabled).toBe(false);
  });
});

describe("anchors", () => {
  const base = "https://bb.example/api/v1/threads/thr_a/thread-storage/files/";
  const documentUrl = "https://bb.example/api/v1/plugins/thread-pages/http/document?session=thr_a";
  const anchor = (href: string, text = "link") => {
    const element = document.createElement("a");
    element.setAttribute("href", href);
    element.textContent = text;
    return element;
  };

  // A link to another document of the page opens in place; any other own file goes to the shell;
  // another site opens natively in a new tab. spec R4.15, R4.15a, R4.15b, D33, D34
  it("decides every kind of link: documents, own files, other sites, handlers, built files", () => {
    expect(decideAnchor(anchor("#section"), documentUrl, base)).toEqual({ kind: "default" });
    expect(decideAnchor(anchor("other.html"), documentUrl, base)).toEqual({ kind: "document", path: "other.html" });
    expect(decideAnchor(anchor("../index.html"), documentUrl, `${base}guides/`, base)).toEqual({ kind: "document", path: "index.html" });
    expect(decideAnchor(anchor("next.html#part"), documentUrl, `${base}guides/`, base)).toEqual({ kind: "document", path: "guides/next.html" });
    // Own files that are not documents: the shell opens or downloads them. D33
    expect(decideAnchor(anchor("data.json"), documentUrl, base)).toEqual({ kind: "file", path: "data.json", download: false, name: null });
    expect(decideAnchor(anchor("uploads/report.html"), documentUrl, base)).toEqual({ kind: "file", path: "uploads/report.html", download: false, name: null });
    expect(decideAnchor(anchor("_parts/a.html"), documentUrl, base)).toEqual({ kind: "file", path: "_parts/a.html", download: false, name: null });
    expect(decideAnchor(anchor("media/clip%20one.mp4"), documentUrl, base)).toEqual({ kind: "file", path: "media/clip one.mp4", download: false, name: null });
    const saved = anchor("clip.mp4");
    saved.setAttribute("download", "../../Thanks for Alua.mp4");
    expect(decideAnchor(saved, documentUrl, base)).toEqual({ kind: "file", path: "clip.mp4", download: true, name: "Thanks for Alua.mp4" });
    const bare = anchor("other.html");
    bare.setAttribute("download", "");
    expect(decideAnchor(bare, documentUrl, base)).toEqual({ kind: "file", path: "other.html", download: true, name: null });
    // Climbing out of the page root is refused, not sent to the host's other routes. R1.4, R1.5, D33
    expect(decideAnchor(anchor("../../etc/passwd"), documentUrl, base)).toEqual({ kind: "block" });
    expect(decideAnchor(anchor("../thr_b/thread-storage/files/secret.pdf"), documentUrl, base)).toEqual({ kind: "block" });
    // Inside an embed the shell is not this page's: its own files are refused, visibly in the guide. R4.50
    expect(decideAnchor(anchor("data.json"), documentUrl, base, base, true)).toEqual({ kind: "block" });
    expect(decideAnchor(anchor("other.html"), documentUrl, base, base, true)).toEqual({ kind: "document", path: "other.html" });
    // Other sites: through the confirmed capability, whatever the target; the page's own popups stay sandboxed. D34 (option D)
    expect(decideAnchor(anchor("https://github.com/x/y", "Repo"), documentUrl, base)).toEqual({ kind: "external", url: "https://github.com/x/y", label: "Repo" });
    for (const target of ["_self", "_top", "_blank", "docs"]) {
      const link = anchor("https://example.com/", "E");
      link.setAttribute("target", target);
      expect(decideAnchor(link, documentUrl, base), target).toEqual({ kind: "external", url: "https://example.com/", label: "E" });
    }
    // The reader's own handlers, and files the page built. D34
    expect(decideAnchor(anchor("mailto:a@b.c"), documentUrl, base)).toEqual({ kind: "new-tab", url: "mailto:a@b.c" });
    expect(decideAnchor(anchor("tel:+48123"), documentUrl, base)).toEqual({ kind: "new-tab", url: "tel:+48123" });
    const mail = anchor("mailto:a@b.c");
    mail.setAttribute("target", "_blank");
    expect(decideAnchor(mail, documentUrl, base)).toEqual({ kind: "default" });
    const csv = anchor("blob:null/1234");
    csv.setAttribute("download", "rows.csv");
    expect(decideAnchor(csv, documentUrl, base)).toEqual({ kind: "default" });
    const data = anchor("data:text/csv,a,b");
    data.setAttribute("download", "rows.csv");
    expect(decideAnchor(data, documentUrl, base)).toEqual({ kind: "default" });
    expect(decideAnchor(anchor("data:text/html,<p>x"), documentUrl, base)).toEqual({ kind: "block" });
    expect(decideAnchor(anchor("blob:null/1234"), documentUrl, base)).toEqual({ kind: "block" });
    const shown = anchor("blob:null/1234");
    shown.setAttribute("target", "_blank");
    expect(decideAnchor(shown, documentUrl, base)).toEqual({ kind: "default" });
    expect(decideAnchor(anchor("javascript:alert(1)"), documentUrl, base)).toEqual({ kind: "block" });
  });

  function click(element: Element, init: MouseEventInit = {}): MouseEvent {
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    element.dispatchEvent(event);
    return event;
  }

  it("routes a click on another site's link through navigation.openExternal, whatever its target (R4.15, D34 option D)", () => {
    const { posted } = install(`<head></head><body><a id="ext" href="https://example.com/docs">Docs</a><a id="blank" href="https://example.com/b" target="_blank">B</a></body>`);
    const open = vi.fn(() => null);
    window.open = open as never;
    expect(click(document.getElementById("ext")!).defaultPrevented).toBe(true);
    expect(click(document.getElementById("blank")!, { metaKey: true }).defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
    const sent = posted.messages.filter((entry) => (entry as { method?: string }).method === "navigation.openExternal") as { params: unknown }[];
    expect(sent.map((entry) => entry.params)).toEqual([{ url: "https://example.com/docs", label: "Docs" }, { url: "https://example.com/b", label: "B" }]);
  });

  it("hands a link to one of the page's own files to the shell, with the download name (D33)", () => {
    const { posted } = install(`<head><base href="https://bb.example/files/"></head><body><a id="open" href="clip.mp4">Open</a><a id="save" href="clip.mp4" download="Alua.mp4">Save</a></body>`);
    expect(click(document.getElementById("open")!).defaultPrevented).toBe(true);
    expect(click(document.getElementById("save")!).defaultPrevented).toBe(true);
    expect(posted.messages).toContainEqual({ kind: "thread-page:open-file", path: "clip.mp4", download: false, name: null });
    expect(posted.messages).toContainEqual({ kind: "thread-page:open-file", path: "clip.mp4", download: true, name: "Alua.mp4" });
  });

  it("sends navigation.openExternal to the host, which confirms, even during a click (D34 option D)", async () => {
    const { posted, api } = install(`<head></head><body></body>`);
    const open = vi.fn(() => null);
    window.open = open as never;
    Object.defineProperty(window.navigator, "userActivation", { value: { isActive: true, hasBeenActive: true }, configurable: true });
    void api.invoke("navigation.openExternal", { url: "https://example.com/a", label: "A" }).catch(() => undefined);
    expect(open).not.toHaveBeenCalled();
    expect(posted.messages.some((entry) => (entry as { method?: string }).method === "navigation.openExternal")).toBe(true);
  });

  it("asks the shell to open another document of the page on click", () => {
    const { posted } = install(`<head><base href="https://bb.example/files/"></head><body><a id="doc" href="guides/next.html">Next</a></body>`);
    const link = document.getElementById("doc")!;
    const event = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(posted.messages).toContainEqual({ kind: "thread-page:open-document", path: "guides/next.html" });
  });
});
