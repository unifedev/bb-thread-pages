import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { createEmbedManager, EMBED_SANDBOX, EMBEDDED_FILES_REFUSAL, type EmbedState } from "../../src/runtime/kernel/embed.ts";
import { installKernel } from "../../src/runtime/kernel/install.ts";

/**
 * `threadPage.embed`: the embedding page's kernel plays the shell's part for
 * each embed. spec R4.42–R4.54, A94, A99–A102, A104
 */
const REV1 = "1".repeat(64);
const REV2 = "2".repeat(64);

type Win = Window & typeof globalThis;

function page(body = '<div id="box"></div><iframe id="own" sandbox="allow-same-origin allow-scripts allow-top-navigation" allow="camera" src="https://example.com/"></iframe>'): Win {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: "https://bb.example/document?session=thr_a", pretendToBeVisual: true });
  const win = dom.window as unknown as Win;
  (win as unknown as { MessageChannel: typeof MessageChannel }).MessageChannel = MessageChannel;
  return win;
}

type Invoke = (method: string, params?: unknown) => Promise<unknown>;

interface Host {
  invoke: Invoke & { mock: { calls: unknown[][] } };
  calls(method: string): unknown[];
  pages: Map<string, Record<string, unknown>>;
  dirty: boolean[];
}

function host(): Host {
  const pages = new Map<string, Record<string, unknown>>();
  const made: { method: string; params: unknown }[] = [];
  const invoke = vi.fn<Invoke>(async (method, params) => {
    made.push({ method, params });
    if (method === "pages.read") {
      const wanted = (params as { pages: { sessionId: string; path?: string; ifNoneMatch?: string }[] }).pages;
      return {
        pages: wanted.map((entry) => {
          const path = entry.path ?? "index.html";
          const found = pages.get(`${entry.sessionId}#${path}`);
          if (!found) return { sessionId: entry.sessionId, path, error: { code: "not_found", reason: "no_session", message: "gone" } };
          if (found.error) return { sessionId: entry.sessionId, path, error: found.error };
          const shared = { sessionId: entry.sessionId, path, title: found.title ?? "Embedded", projectId: "proj_a", working: found.working === true, readOnly: false, answerToken: `tok.${found.revision as string}` };
          return entry.ifNoneMatch === found.revision ? { ...shared, unchanged: true } : { ...shared, revision: found.revision, html: found.html };
        }),
      };
    }
    if (method === "pages.answer") return { delivery: "queued", duplicate: false };
    if (method === "context.get") return { capabilities: [{ method: "context.get" }, { method: "session.reply" }, { method: "storage.get" }, { method: "pages.open" }, { method: "sessions.send" }] };
    if (method === "sessions.snapshot") return { sessions: [] };
    throw Object.assign(new Error("unexpected"), { code: "handler_error" });
  });
  return { invoke, pages, dirty: [], calls: (method) => made.filter((entry) => entry.method === method).map((entry) => entry.params) };
}

/** Plays the embedded document's kernel: says ready with a port of its own, and talks over the other end. */
async function connect(win: Win, frame: HTMLIFrameElement): Promise<{ port: MessagePort; received: unknown[] }> {
  const received: unknown[] = [];
  const channel = new MessageChannel();
  const posted = vi.spyOn(frame.contentWindow!, "postMessage");
  win.dispatchEvent(new win.MessageEvent("message", { data: { kind: "thread-page:ready", version: 2 }, origin: "null", source: frame.contentWindow, ports: [channel.port2] as never }));
  // The manager posts nothing into the frame: the port came from the embedded runtime. D44
  expect(posted).not.toHaveBeenCalled();
  posted.mockRestore();
  const port = channel.port1;
  port.onmessage = (event) => received.push(event.data);
  return { port, received };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

afterEach(() => vi.useRealTimers());

describe("threadPage.embed", () => {
  it("creates a frame in a container, always sandboxes it, and shows the document through srcdoc (A94, R4.43)", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>one</p>", title: "Build the importer" });
    const states: EmbedState[] = [];
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: (value) => h.dirty.push(value), embedded: false });
    const stop = manager.embed(win.document.getElementById("box"), { sessionId: "thr_b", onState: (state: EmbedState) => states.push(state) });
    await settle();
    const frame = win.document.querySelector<HTMLIFrameElement>("#box iframe")!;
    expect(frame.getAttribute("sandbox")).toBe(EMBED_SANDBOX);
    expect(frame.srcdoc).toBe("<p>one</p>");
    expect(states.map((state) => state.status)).toEqual(["loading", "shown"]);
    expect(states.at(-1)).toMatchObject({ sessionId: "thr_b", path: "index.html", title: "Build the importer", revision: REV1, working: false, updateAvailable: false });
    stop();
    expect(win.document.querySelector("#box iframe")).toBeNull();
  });

  it("narrows an author's own iframe to the fixed sandbox on every load, whatever it carried (R3.24)", async () => {
    vi.useFakeTimers();
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>one</p>" });
    const own = win.document.querySelector<HTMLIFrameElement>("#own")!;
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(own, { sessionId: "thr_b" });
    await vi.advanceTimersByTimeAsync(10);
    expect(own.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-popups allow-downloads");
    expect(own.hasAttribute("src")).toBe(false);
    // Full screen, and nothing else the author asked for. D35
    expect(own.getAttribute("allow")).toBe("fullscreen *");
    // The author widens it afterwards: the next load narrows it again.
    own.setAttribute("sandbox", "allow-same-origin allow-scripts");
    h.pages.set("thr_b#index.html", { revision: REV2, html: "<p>two</p>" });
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollMs + 10);
    expect(own.srcdoc).toBe("<p>two</p>");
    expect(own.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-popups allow-downloads");
    // The same element, in the same place: it was only taken out while it changed,
    // so the refresh is a first load of a new browsing context and adds no history entry.
    expect(win.document.querySelector("#own")).toBe(own);
    expect(own.previousElementSibling?.id).toBe("box");
  });

  it("follows a changed page without touching the embedding page, keeps its scroll, and makes one read per tick for twelve embeds (A94, A102)", async () => {
    vi.useFakeTimers();
    const win = page(Array.from({ length: 12 }, (_, index) => `<div id="box${index}"></div>`).join(""));
    const h = host();
    for (let index = 0; index < 12; index += 1) h.pages.set(`thr_${index}#index.html`, { revision: REV1, html: `<p>${index}</p>` });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    for (let index = 0; index < 12; index += 1) manager.embed(win.document.getElementById(`box${index}`), { sessionId: `thr_${index}` });
    await vi.advanceTimersByTimeAsync(10);
    expect(h.calls("pages.read")).toHaveLength(1);
    expect((h.calls("pages.read")[0] as { pages: unknown[] }).pages).toHaveLength(12);

    const frame = win.document.querySelector<HTMLIFrameElement>("#box3 iframe")!;
    const { port, received } = await connect(win, frame);
    port.postMessage({ kind: "thread-page:scroll", x: 0, y: 640 });
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollMs);
    expect(h.calls("pages.read")).toHaveLength(2);
    // Conditional from now on: nothing is fetched twice.
    expect((h.calls("pages.read")[1] as { pages: { ifNoneMatch?: string }[] }).pages.every((entry) => entry.ifNoneMatch === REV1)).toBe(true);
    expect(frame.srcdoc).toBe("<p>3</p>");

    h.pages.set("thr_3#index.html", { revision: REV2, html: "<p>three, rewritten</p>" });
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollMs);
    expect(frame.srcdoc).toBe("<p>three, rewritten</p>");
    expect(win.document.querySelector<HTMLIFrameElement>("#box4 iframe")!.srcdoc).toBe("<p>4</p>");
    // The refreshed document's kernel is told where the previous one was scrolled.
    const next = await connect(win, frame);
    await vi.advanceTimersByTimeAsync(5);
    expect(next.received).toContainEqual({ kind: "thread-page:restore-scroll", x: 0, y: 640 });
    // The old document hears nothing after its connection was told whether the reader can record.
    expect(received.filter((message) => (message as { kind?: string }).kind !== "thread-page:voice")).toEqual([]);
  });

  it("polls faster while an embedded session works, and not at all while hidden or after stop (R4.44)", async () => {
    vi.useFakeTimers();
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>", working: true });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    const stop = manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollWorkingMs * 3);
    expect(h.calls("pages.read")).toHaveLength(4);
    const hidden = vi.spyOn(win.document, "visibilityState", "get").mockReturnValue("hidden");
    win.document.dispatchEvent(new win.Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls("pages.read")).toHaveLength(4);
    hidden.mockRestore();
    win.document.dispatchEvent(new win.Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
    expect(h.calls("pages.read")).toHaveLength(5);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls("pages.read")).toHaveLength(5);
  });

  it("answers a form inside an embed through pages.answer with the token of the shown revision, worded as the shell words it (A95)", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    const answers = [{ name: "a", label: "A", value: "x" }];
    port.postMessage({ kind: "thread-page:submit", submissionId: "sub-1", title: "Form", answers, files: [] });
    await settle();
    expect(h.calls("pages.answer")).toEqual([{ answerToken: `tok.${REV1}`, form: { submissionId: "sub-1", title: "Form", answers } }]);
    expect(received).toContainEqual({ kind: "thread-page:submit-result", submissionId: "sub-1", ok: true, message: "Sent (queued)" });

    port.postMessage({ v: 1, id: "tp-1", method: "session.reply", params: { result: { ok: 1 } }, pageRevision: REV1 });
    await settle();
    expect(h.calls("pages.answer")[1]).toEqual({ answerToken: `tok.${REV1}`, reply: { result: { ok: 1 } } });
    expect(received).toContainEqual({ v: 1, id: "tp-1", ok: true, result: { delivery: "queued", duplicate: false } });

    // A form with files is never sent from inside an embed. A104
    port.postMessage({ kind: "thread-page:submit", submissionId: "sub-2", title: "Form", answers, files: [{ field: "f", file: {} }] });
    await settle();
    expect(h.calls("pages.answer")).toHaveLength(2);
    expect(received).toContainEqual({ kind: "thread-page:submit-result", submissionId: "sub-2", ok: false, error: EMBEDDED_FILES_REFUSAL });
  });

  it("gives an embedded page its own identity and refuses what would act as the embedding page (A99)", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>", title: "Build the importer" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    const ask = (id: string, method: string, params: unknown = null, pageRevision = REV1) => port.postMessage({ v: 1, id, method, params, pageRevision });
    ask("c-1", "context.get");
    for (const [index, method] of ["storage.get", "storage.set", "sessions.send", "session.activity", "pages.read", "pages.answer", "sessions.start", "syns.read"].entries()) ask(`r-${index}`, method, {});
    ask("p-1", "sessions.snapshot", {});
    ask("s-1", "context.get", null, REV2);
    await settle();
    const byId = new Map((received as { id: string }[]).map((message) => [message.id, message as Record<string, unknown>]));
    expect(byId.get("c-1")).toMatchObject({ ok: true, result: { protocolVersion: 1, session: { id: "thr_b", title: "Build the importer", projectId: "proj_a" }, page: { revision: REV1, readOnly: false }, capabilities: [{ method: "context.get" }, { method: "session.reply" }, { method: "pages.open" }] } });
    for (let index = 0; index < 8; index += 1) expect(byId.get(`r-${index}`)).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(byId.get("p-1")).toMatchObject({ ok: true, result: { sessions: [] } });
    // A request for another revision, or of another shape, never leaves the page.
    expect(byId.get("s-1")).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(h.calls("storage.get")).toEqual([]);
    expect(h.calls("sessions.send")).toEqual([]);
  });

  it("caps the calls of one embed so it cannot spend the embedding page's budget (R4.49)", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    for (let index = 0; index < LIMITS.embedCallsPerMinute + 10; index += 1) port.postMessage({ v: 1, id: `n-${index}`, method: "sessions.snapshot", params: {}, pageRevision: REV1 });
    await settle();
    expect(h.calls("sessions.snapshot")).toHaveLength(LIMITS.embedCallsPerMinute);
    expect((received as { error?: { code: string } }[]).filter((message) => message.error?.code === "rate_limited")).toHaveLength(10);
  });

  it("never refreshes an embed being typed into: it offers the update inside it, and the embedding page is dirty meanwhile (A100)", async () => {
    vi.useFakeTimers();
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>one</p>" });
    const states: EmbedState[] = [];
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: (value) => h.dirty.push(value), embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b", onState: (state: EmbedState) => states.push(state) });
    await vi.advanceTimersByTimeAsync(10);
    const frame = win.document.querySelector<HTMLIFrameElement>("#box iframe")!;
    const { port, received } = await connect(win, frame);
    port.postMessage({ kind: "thread-page:dirty" });
    await vi.advanceTimersByTimeAsync(5);
    expect(h.dirty.at(-1)).toBe(true);
    h.pages.set("thr_b#index.html", { revision: REV2, html: "<p>two</p>" });
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollMs);
    expect(frame.srcdoc).toBe("<p>one</p>");
    expect(received).toContainEqual({ kind: "thread-page:update-available" });
    expect(states.at(-1)).toMatchObject({ updateAvailable: true, revision: REV1 });
    // Answering what is on screen uses the token of what is on screen, never the newer one.
    port.postMessage({ kind: "thread-page:submit", submissionId: "s", title: "T", answers: [], files: [] });
    await vi.advanceTimersByTimeAsync(5);
    expect((h.calls("pages.answer")[0] as { answerToken: string }).answerToken).toBe(`tok.${REV1}`);
    // The reader accepts.
    port.postMessage({ kind: "thread-page:apply-update" });
    await vi.advanceTimersByTimeAsync(20);
    expect(frame.srcdoc).toBe("<p>two</p>");
    expect(h.dirty.at(-1)).toBe(false);
    expect(states.at(-1)).toMatchObject({ updateAvailable: false, revision: REV2 });
  });

  // Found by the independent review of 1.5.0, each confirmed before it was fixed.
  it("with more than 16 embeds takes turns per tick instead of polling without pause", async () => {
    vi.useFakeTimers();
    const win = page(Array.from({ length: 17 }, (_, index) => `<div id="box${index}"></div>`).join(""));
    const h = host();
    for (let index = 0; index < 17; index += 1) h.pages.set(`thr_${index}#index.html`, { revision: REV1, html: `<p>${index}</p>` });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    for (let index = 0; index < 17; index += 1) manager.embed(win.document.getElementById(`box${index}`), { sessionId: `thr_${index}` });
    await vi.advanceTimersByTimeAsync(1_000);
    // Two calls show all seventeen.
    expect(h.calls("pages.read")).toHaveLength(2);
    expect(win.document.querySelector<HTMLIFrameElement>("#box16 iframe")!.srcdoc).toBe("<p>16</p>");
    const before = h.calls("pages.read").length;
    await vi.advanceTimersByTimeAsync(60_000);
    // Idle: two calls per ten-second round, not four a second.
    expect(h.calls("pages.read").length - before).toBeLessThanOrEqual(14);
  });

  it("counts an embed's answers, followed links and accepted updates against its one budget, and never counts a refusal", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    for (let index = 0; index < 200; index += 1) port.postMessage({ kind: "thread-page:submit", submissionId: `flood-${index}`, title: "T", answers: [], files: [] });
    await settle();
    expect(h.calls("pages.answer")).toHaveLength(LIMITS.embedCallsPerMinute);
    expect((received as { ok?: boolean; error?: string }[]).filter((message) => message.ok === false && /Too many requests/.test(message.error ?? ""))).toHaveLength(200 - LIMITS.embedCallsPerMinute);
    const reads = h.calls("pages.read").length;
    for (let index = 0; index < 50; index += 1) port.postMessage({ kind: "thread-page:apply-update" });
    await settle();
    expect(h.calls("pages.read").length).toBe(reads);
  });

  it("does not put the grant question straight back up after the reader declined", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    let asked = 0;
    const invoke = async (method: string, params?: unknown) => {
      if (method === "pages.answer") {
        asked += 1;
        throw Object.assign(new Error("You did not allow it, so the answer was not sent"), { code: "cancelled" });
      }
      return h.invoke(method, params);
    };
    const manager = createEmbedManager(win, { invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    for (let index = 0; index < 5; index += 1) port.postMessage({ kind: "thread-page:submit", submissionId: `again-${index}`, title: "T", answers: [], files: [] });
    await settle();
    expect(asked).toBe(1);
    expect((received as { ok?: boolean }[]).filter((message) => message.ok === false)).toHaveLength(5);
  });

  it("lets an embedded page navigate the reader only on the reader's click, and count as dirty only once they have acted", async () => {
    const win = page();
    const activation = { isActive: false, hasBeenActive: false };
    Object.defineProperty(win.navigator, "userActivation", { value: activation, configurable: true });
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    const opened: unknown[] = [];
    const invoke = async (method: string, params?: unknown) => {
      if (method === "pages.open" || method === "sessions.openHost") {
        opened.push(params);
        return { opened: true };
      }
      return h.invoke(method, params);
    };
    const manager = createEmbedManager(win, { invoke, setDirty: (value) => h.dirty.push(value), embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const { port, received } = await connect(win, win.document.querySelector<HTMLIFrameElement>("#box iframe")!);
    port.postMessage({ v: 1, id: "nav-1", method: "pages.open", params: { sessionId: "thr_b" }, pageRevision: REV1 });
    port.postMessage({ kind: "thread-page:dirty" });
    await settle();
    expect(opened).toEqual([]);
    expect(received).toContainEqual(expect.objectContaining({ id: "nav-1", ok: false, error: expect.objectContaining({ code: "unavailable" }) }));
    expect(h.dirty.at(-1)).toBe(false);
    activation.isActive = true;
    activation.hasBeenActive = true;
    port.postMessage({ v: 1, id: "nav-2", method: "pages.open", params: { sessionId: "thr_b" }, pageRevision: REV1 });
    port.postMessage({ kind: "thread-page:dirty" });
    await settle();
    expect(opened).toEqual([{ sessionId: "thr_b" }]);
    expect(h.dirty.at(-1)).toBe(true);
  });

  it("opens a link to another document of the embedded page inside the embed, and nothing that is not one (R4.50)", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>entry</p>" });
    h.pages.set("thr_b#detail.html", { revision: REV2, html: "<p>detail</p>" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    const pushed = vi.spyOn(win.history, "pushState");
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b" });
    await settle();
    const frame = win.document.querySelector<HTMLIFrameElement>("#box iframe")!;
    const { port } = await connect(win, frame);
    for (const path of ["../thr_c/index.html", "_parts/x.html", "/etc/passwd.html", "data.json", 7]) port.postMessage({ kind: "thread-page:open-document", path });
    await settle();
    expect(frame.srcdoc).toBe("<p>entry</p>");
    port.postMessage({ kind: "thread-page:open-document", path: "detail.html" });
    await settle();
    expect(frame.srcdoc).toBe("<p>detail</p>");
    expect(pushed).not.toHaveBeenCalled();
  });

  it("shows a placeholder for a page that cannot be shown, keeps checking, and keeps the rest of the page working (A101)", async () => {
    vi.useFakeTimers();
    const win = page('<div id="box"></div><div id="other"></div>');
    const h = host();
    h.pages.set("thr_ok#index.html", { revision: REV1, html: "<p>ok</p>" });
    h.pages.set("thr_blank#index.html", { error: { code: "not_found", reason: "no_page", message: "no page" } });
    const states: EmbedState[] = [];
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_blank", onState: (state: EmbedState) => states.push(state) });
    manager.embed(win.document.getElementById("other"), { sessionId: "thr_ok" });
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)?.status).toBe("no_page");
    expect(win.document.querySelector<HTMLIFrameElement>("#box iframe")!.srcdoc).toContain("has not written its page yet");
    expect(win.document.querySelector<HTMLIFrameElement>("#other iframe")!.srcdoc).toBe("<p>ok</p>");
    h.pages.set("thr_blank#index.html", { revision: REV2, html: "<p>written</p>" });
    await vi.advanceTimersByTimeAsync(LIMITS.embedPollMs);
    expect(states.at(-1)?.status).toBe("shown");
    expect(win.document.querySelector<HTMLIFrameElement>("#box iframe")!.srcdoc).toBe("<p>written</p>");
  });

  it("is one level deep: inside an embedded page it shows a placeholder and reads nothing (A101, R4.52)", async () => {
    const win = page();
    const h = host();
    const states: EmbedState[] = [];
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: true });
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b", onState: (state: EmbedState) => states.push(state) });
    await settle();
    expect(states.map((state) => state.status)).toEqual(["nested"]);
    expect(win.document.querySelector<HTMLIFrameElement>("#box iframe")!.srcdoc).toContain("does not show further pages");
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("rejects a target or options that cannot be an embed, and contains an author's failing callback", async () => {
    const win = page();
    const h = host();
    h.pages.set("thr_b#index.html", { revision: REV1, html: "<p>b</p>" });
    const manager = createEmbedManager(win, { invoke: h.invoke, setDirty: () => undefined, embedded: false });
    expect(() => manager.embed(null, { sessionId: "thr_b" })).toThrow(TypeError);
    expect(() => manager.embed(win.document.getElementById("box"), {})).toThrow(TypeError);
    expect(() => manager.embed(win.document.getElementById("box"), { sessionId: "thr_b", path: "_o/part.html" })).toThrow(TypeError);
    manager.embed(win.document.getElementById("box"), { sessionId: "thr_b", onState: () => { throw new Error("author bug"); } });
    await settle();
    expect(win.document.querySelector<HTMLIFrameElement>("#box iframe")!.srcdoc).toBe("<p>b</p>");
  });
});

describe("the kernel in embedded mode", () => {
  function embeddedKernel(body: string) {
    const win = page(body) as Win & { threadPage: { embed(target: unknown, options: unknown): () => void } };
    const posted: unknown[] = [];
    const handle = installKernel(win, { pageRevision: REV1, stale: false, embedded: true });
    handle.connect({ postMessage: (message: unknown) => posted.push(message), start() {} });
    return { win, posted, handle };
  }

  it("refuses a form with a file attached, in the form's own status line, and sends nothing (A104)", () => {
    const { win, posted } = embeddedKernel('<form><input type="file" name="f"><button>Send</button></form>');
    const form = win.document.querySelector("form")!;
    const input = form.querySelector("input")!;
    Object.defineProperty(input, "files", { value: [new win.File(["x"], "x.txt")] });
    form.dispatchEvent(new win.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(form.querySelector("[data-thread-page-status]")!.textContent).toBe(EMBEDDED_FILES_REFUSAL);
    expect(posted.filter((message) => (message as { kind?: string }).kind === "thread-page:submit")).toEqual([]);
    expect(form.querySelector("button")!.disabled).toBe(false);
  });

  it("offers a new version in host-authored chrome and tells the embedding kernel when the reader accepts (A100)", () => {
    const { win, posted, handle } = embeddedKernel("<p>content</p>");
    handle.deliver({ kind: "thread-page:update-available" });
    const bar = win.document.querySelector('[data-thread-page-update="host"]')!;
    expect(bar.textContent).toContain("This page changed");
    // The page cannot simply delete it: it is drawn again with the next change to the document.
    bar.remove();
    win.document.body.appendChild(win.document.createElement("p"));
    return new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => {
      const again = win.document.querySelector('[data-thread-page-update="host"]')!;
      expect(again).not.toBeNull();
      again.querySelector("button")!.click();
      expect(posted).toContainEqual({ kind: "thread-page:apply-update" });
    });
  });

  it("returns to the scroll position it is given, and reports its own", async () => {
    const { win, posted, handle } = embeddedKernel("<p>content</p>");
    const scrolled = vi.fn();
    win.scrollTo = scrolled as never;
    handle.deliver({ kind: "thread-page:restore-scroll", x: 0, y: 420 });
    expect(scrolled).toHaveBeenCalledWith(0, 420);
    Object.defineProperty(win, "scrollY", { value: 99, configurable: true });
    win.dispatchEvent(new win.Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(posted).toContainEqual({ kind: "thread-page:scroll", x: 0, y: 99 });
  });

  it("does not show the update offer on a page read at its own URL", () => {
    const win = page("<p>content</p>");
    const handle = installKernel(win, { pageRevision: REV1, stale: false });
    handle.deliver({ kind: "thread-page:update-available" });
    expect(win.document.querySelector("[data-thread-page-update]")).toBeNull();
  });
});
