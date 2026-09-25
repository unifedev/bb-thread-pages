// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { isOpenableInTab, isOwnFilePath, shellFetchLimit } from "../../src/domain/own-files.ts";
import { installKernel } from "../../src/runtime/kernel/install.ts";
import { EMBEDDED_MEDIA_REFUSAL, UNAVAILABLE_ATTRIBUTE } from "../../src/runtime/kernel/large-media.ts";
import type { ShellConfig } from "../../src/runtime/shared/protocol.ts";
import { createOwnFiles } from "../../src/runtime/shell/own-files.ts";

// A page's own non-document files (D33) and its large media (D37), at the
// kernel and at the shell. The serve-time half is in test/pages/inline.test.ts.

const FILES = "/api/v1/threads/thr_a/thread-storage/files/";
const config = { filesUrl: FILES } as ShellConfig;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakePort() {
  const sent: Record<string, unknown>[] = [];
  return { sent, port: { postMessage: (message: Record<string, unknown>) => sent.push(message) } as unknown as MessagePort };
}

describe("the rules for a page's own files", () => {
  it("confines paths to the page root (R1.4, R1.5)", () => {
    for (const path of ["clip.mp4", "media/a b.mp4", "uploads/x.pdf"]) expect(isOwnFilePath(path), path).toBe(true);
    for (const path of ["", "/etc/passwd", "../x", "a/../../x", "a//b", "a\\b", "a/./b", "x\0y", 42, null]) expect(isOwnFilePath(path), String(path)).toBe(false);
  });

  it("opens in a tab only what cannot run script on the host's origin (D33)", () => {
    for (const path of ["a.pdf", "a.MP4", "b.png", "notes.txt"]) expect(isOpenableInTab(path), path).toBe(true);
    for (const path of ["a.svg", "a.xml", "a.xhtml", "a.xsl", "archive.zip", "noextension", "_evil.htm", "_parts/x.HTM", "uploads/20260925-x.htm", "uploads/report.html", "_part.html", "a.HTML", "a.shtml"]) expect(isOpenableInTab(path), path).toBe(false);
  });

  it("fetches up to the host's own read limit, lower for images (D37)", () => {
    expect(shellFetchLimit("clip.mp4")).toBe(LIMITS.shellFetchBytes);
    expect(shellFetchLimit("photo.JPG")).toBe(LIMITS.shellFetchImageBytes);
    expect(shellFetchLimit("drawing.svg")).toBe(LIMITS.shellFetchBytes);
  });
});

describe("the shell and a page's own files", () => {
  function shell() {
    document.body.innerHTML = "";
    // A browser that allows the window returns it; the shell then drops its opener.
    const open = vi.fn(() => ({ opener: window }) as unknown as Window);
    window.open = open as never;
    const clicks: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
    });
    return { open, clicks, restore: () => click.mockRestore() };
  }

  it("downloads from its own origin under the page's name, and opens a passive file in a new tab (D33)", () => {
    const { open, clicks, restore } = shell();
    const files = createOwnFiles(window as never, config, vi.fn() as never);
    files.open("media/clip one.mp4", true, "Thanks for Alua.mp4");
    files.open("clip.mp4", true, null);
    files.open("report.pdf", false, null);
    expect(clicks).toEqual([
      { href: `${FILES}media/clip%20one.mp4`, download: "Thanks for Alua.mp4" },
      { href: `${FILES}clip.mp4`, download: "clip.mp4" },
    ]);
    expect(open).toHaveBeenCalledWith(`${FILES}report.pdf`, "_blank");
    restore();
  });

  it("downloads rather than opens a type that could run script, and refuses anything outside the page (hostile page)", () => {
    const { open, clicks, restore } = shell();
    const files = createOwnFiles(window as never, config, vi.fn() as never);
    files.open("drawing.svg", false, null);
    for (const path of ["../other/x.pdf", "/etc/passwd", "a/../../x.pdf", "https://evil.example/x.pdf", 7, null]) files.open(path, false, null);
    // A document of the page opens in place, never raw in a tab.
    files.open("second.html", false, null);
    files.open("x.pdf", "yes", "../../evil.sh");
    expect(clicks).toEqual([{ href: `${FILES}drawing.svg`, download: "drawing.svg" }]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(`${FILES}x.pdf`, "_blank");
    restore();
  });

  // null from window.open is not a refusal: the bb app opens the URL itself and denies the window
  // (get-bb/bb desktop-window-factory.ts). Only a shell that keeps focus asks. D33
  function fakeWindow(opens: (Window | null)[], focus: { visible: boolean; focused: boolean }) {
    const open = vi.fn(() => opens.shift() ?? null);
    const assign = vi.fn();
    const doc = { get visibilityState() { return focus.visible ? "visible" : "hidden"; }, hasFocus: () => focus.focused };
    const win = { open, location: { assign }, document: doc, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) } as unknown as Window & typeof globalThis;
    return { win, open, assign };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  const tab = { opener: null } as unknown as Window;

  it("asks in its own dialog when window.open gave nothing and the shell kept focus, and opens inside that Open click", async () => {
    const { win, open, assign } = fakeWindow([null, tab], { visible: true, focused: true });
    const asked: string[] = [];
    const confirmer = { confirm: vi.fn(async (summary: string, onGesture?: () => void) => { asked.push(summary); onGesture?.(); return true; }) };
    createOwnFiles(win, config, vi.fn() as never, confirmer, 0).open("media/Full size.jpg", false, null);
    await settle();
    expect(asked).toEqual(["Open “Full size.jpg” in a new tab?"]);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith(`${FILES}media/Full%20size.jpg`, "_blank");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not ask when window.open gave nothing but the shell lost focus: an embedder opened it", async () => {
    for (const focus of [{ visible: true, focused: false }, { visible: false, focused: true }]) {
      const { win, open, assign } = fakeWindow([null], focus);
      const confirmer = { confirm: vi.fn(async () => true) };
      createOwnFiles(win, config, vi.fn() as never, confirmer, 0).open("report.pdf", false, null);
      await settle();
      expect(confirmer.confirm, JSON.stringify(focus)).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();
    }
  });

  it("does not ask when a window was returned", async () => {
    const { win, open } = fakeWindow([tab], { visible: true, focused: true });
    const confirmer = { confirm: vi.fn(async () => true) };
    createOwnFiles(win, config, vi.fn() as never, confirmer, 0).open("report.pdf", false, null);
    await settle();
    expect(open).toHaveBeenCalledWith(`${FILES}report.pdf`, "_blank");
    expect(confirmer.confirm).not.toHaveBeenCalled();
  });

  it("opens the file in place when the tab is refused even inside the Open click, and does nothing when declined", async () => {
    const refused = fakeWindow([], { visible: true, focused: true });
    createOwnFiles(refused.win, config, vi.fn() as never, { confirm: vi.fn(async (_s: string, onGesture?: () => void) => { onGesture?.(); return true; }) }, 0).open("report.pdf", false, null);
    await settle();
    expect(refused.open).toHaveBeenCalledTimes(2);
    expect(refused.assign).toHaveBeenCalledWith(`${FILES}report.pdf`);
    const declined = fakeWindow([], { visible: true, focused: true });
    createOwnFiles(declined.win, config, vi.fn() as never, { confirm: vi.fn(async () => false) }, 0).open("report.pdf", false, null);
    await settle();
    expect(declined.assign).not.toHaveBeenCalled();
  });

  it("does nothing on the built-in home, which has no files", () => {
    const { open, clicks, restore } = shell();
    createOwnFiles(window as never, { filesUrl: null } as ShellConfig, vi.fn() as never).open("clip.mp4", true, null);
    expect(open).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);
    restore();
  });

  it("fetches a large media file with the reader's credential and hands the frame the bytes (D37)", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(3000), { status: 200, headers: { "content-type": "video/mp4" } }));
    const files = createOwnFiles(window as never, config, fetchImpl as never);
    const { port, sent } = fakePort();
    await files.fetchFor(port, "tp-file-1", "media/clip.mp4");
    expect(fetchImpl).toHaveBeenCalledWith(`${FILES}media/clip.mp4`, { credentials: "same-origin", cache: "no-store" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "thread-page:file", id: "tp-file-1", ok: true });
    expect((sent[0]!.blob as Blob).size).toBe(3000);
  });

  it("says why a file cannot come: outside the page, missing, over the host's limit (D37)", async () => {
    const big = LIMITS.shellFetchBytes + 1;
    const answers: Record<string, Response> = {
      [`${FILES}gone.mp4`]: new Response("", { status: 404 }),
      [`${FILES}huge.mp4`]: new Response("", { status: 200, headers: { "content-length": String(big) } }),
      [`${FILES}locked.mp4`]: new Response("", { status: 401 }),
    };
    const fetchImpl = vi.fn(async (url: string) => answers[url]!);
    const files = createOwnFiles(window as never, config, fetchImpl as never);
    const { port, sent } = fakePort();
    await files.fetchFor(port, "tp-file-1", "../x.mp4");
    await files.fetchFor(port, "tp-file-2", "gone.mp4");
    await files.fetchFor(port, "tp-file-3", "huge.mp4");
    await files.fetchFor(port, "tp-file-4", "locked.mp4");
    await files.fetchFor(port, "not an id!", "gone.mp4");
    expect(sent.map((message) => [message.id, message.ok, message.error])).toEqual([
      ["tp-file-1", false, "Not one of this page's files"],
      ["tp-file-2", false, "The file does not exist"],
      ["tp-file-3", false, "Larger than 25 MiB, the most the host reads"],
      ["tp-file-4", false, "The host answered 401"],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("the kernel and large media (D37)", () => {
  const REV = "f".repeat(64);
  const MEDIA = `<head></head><body>
<video id="v" controls data-thread-page-src="media/clip.mp4" data-thread-page-poster="poster.jpg" data-thread-page-stamp="ab"></video>
<video id="w"><source id="s" data-thread-page-src="media/clip.mp4" type="video/mp4"></video>
<img id="i" data-thread-page-src="gone.png" alt="x">
</body>`;

  let document: Document;
  /** A window per install: the API is non-configurable by design. */
  function kernel(embedded = false) {
    const win = new JSDOM(`<!doctype html><html>${MEDIA}</html>`, { url: "https://bb.example/document?session=thr_a", pretendToBeVisual: true }).window;
    document = win.document;
    const posted: Record<string, unknown>[] = [];
    let objects = 0;
    (win.URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => `blob:null/${++objects}`;
    const handle = installKernel(win as never, { pageRevision: REV, stale: false, embedded });
    return { handle, posted, connect: () => handle.connect({ postMessage: (message: unknown) => posted.push(message as Record<string, unknown>), start() {} }) };
  }

  it("asks once per file, even before the channel is up, and sets blob: URLs when the bytes come", async () => {
    const { handle, posted, connect } = kernel();
    expect(posted).toEqual([]);
    connect();
    const requests = posted.filter((message) => message.kind === "thread-page:file-request");
    expect(requests.map((message) => message.path).sort()).toEqual(["gone.png", "media/clip.mp4", "poster.jpg"]);
    const idOf = (path: string) => requests.find((message) => message.path === path)!.id as string;
    handle.deliver({ kind: "thread-page:file", id: idOf("media/clip.mp4"), ok: true, blob: new Blob(["v"]) });
    handle.deliver({ kind: "thread-page:file", id: idOf("poster.jpg"), ok: true, blob: new Blob(["p"]) });
    handle.deliver({ kind: "thread-page:file", id: idOf("gone.png"), ok: false, error: "The file does not exist" });
    await flush();
    const video = document.getElementById("v")!;
    expect(video.getAttribute("src")).toMatch(/^blob:null\//);
    expect(video.getAttribute("poster")).toMatch(/^blob:null\//);
    expect(video.hasAttribute("data-thread-page-src")).toBe(false);
    // One fetch, one object URL, for both elements that show the file.
    expect(document.getElementById("s")!.getAttribute("src")).toBe(video.getAttribute("src"));
    expect(document.getElementById("i")!.getAttribute(UNAVAILABLE_ATTRIBUTE)).toBe("The file does not exist");
    expect(document.getElementById("i")!.hasAttribute("src")).toBe(false);
  });

  it("marks a reference added by page script later, and ignores answers it did not ask for", async () => {
    const { handle, posted, connect } = kernel();
    connect();
    const late = document.createElement("img");
    late.setAttribute("data-thread-page-src", "late.png");
    document.body.appendChild(late);
    await flush();
    const request = posted.find((message) => message.path === "late.png");
    expect(request).toBeDefined();
    handle.deliver({ kind: "thread-page:file", id: "tp-file-999", ok: true, blob: new Blob(["x"]) });
    expect(late.hasAttribute("src")).toBe(false);
  });

  it("inside an embed asks nothing and says why", async () => {
    const { posted, connect } = kernel(true);
    connect();
    await flush();
    expect(posted.filter((message) => message.kind === "thread-page:file-request")).toEqual([]);
    expect(document.getElementById("v")!.getAttribute(UNAVAILABLE_ATTRIBUTE)).toBe(EMBEDDED_MEDIA_REFUSAL);
  });
});
