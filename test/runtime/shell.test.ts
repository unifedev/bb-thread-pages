// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createConfirmer } from "../../src/runtime/shell/confirm.ts";
import { createPoller } from "../../src/runtime/shell/poll.ts";
import { createRelay } from "../../src/runtime/shell/relay.ts";
import type { ShellConfig } from "../../src/runtime/shared/protocol.ts";

const REV = "1".repeat(64);
const config: ShellConfig = {
  actionToken: "tok",
  pageRevision: REV,
  expiresAt: Date.now() + 3_600_000,
  documentUrl: "/document?session=thr_a",
  submitUrl: "/submit",
  uploadUrl: "/upload",
  bridgeUrl: "/bridge",
  chromeActionUrl: "/chrome-action",
  workingLabel: "Working",
  stale: false,
  pollMs: 10_000,
  maxUploadBytes: 1024,
  maxUploads: 2,
};

function fakePort() {
  const sent: unknown[] = [];
  return { sent, port: { postMessage: (message: unknown) => sent.push(message) } as unknown as MessagePort };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function dialogFixture(): HTMLDialogElement {
  document.body.innerHTML = `<dialog><form method="dialog"><p></p><button type="button" value="cancel">Cancel</button><button type="button" value="confirm">Confirm</button></form></dialog>`;
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  return dialog;
}

function relayWith(fetchImpl: typeof fetch, extras: Partial<Parameters<typeof createRelay>[0]> = {}) {
  const dialog = dialogFixture();
  const navigator = { inPlace: vi.fn(), reserveWindow: vi.fn(), external: vi.fn(), release: vi.fn() };
  const onDirty = vi.fn();
  const relay = createRelay({ config, confirmer: createConfirmer(dialog), navigator, onDirty, fetchImpl, ...extras });
  return { relay, dialog, navigator, onDirty };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shell relay", () => {
  it("rejects malformed or foreign requests before they reach the host", async () => {
    const fetchImpl = vi.fn();
    const { relay, onDirty } = relayWith(fetchImpl as never);
    const { port, sent } = fakePort();
    relay.handle(port, { v: 1, id: "tp-1", method: "context.get", params: null, pageRevision: "wrong" });
    relay.handle(port, { v: 1, id: "tp-2", method: "context.get", params: null, pageRevision: REV, extra: true });
    relay.handle(port, { v: 1, id: "tp-3", method: "not-a-method", params: null, pageRevision: REV });
    relay.handle(port, "garbage");
    relay.handle(port, { kind: "thread-page:dirty" });
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sent).toHaveLength(3);
    for (const entry of sent) expect(entry).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(onDirty).toHaveBeenCalledWith(true);
  });

  it("carries a request with the action token and forwards the host's response", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { actionToken: string; request: { id: string } };
      expect(body.actionToken).toBe("tok");
      return jsonResponse({ response: { v: 1, id: body.request.id, ok: true, result: { hello: 1 } } });
    });
    const { relay } = relayWith(fetchImpl as never);
    const { port, sent } = fakePort();
    relay.handle(port, { v: 1, id: "tp-1", method: "context.get", params: null, pageRevision: REV });
    await flush();
    expect(sent[0]).toEqual({ v: 1, id: "tp-1", ok: true, result: { hello: 1 } });
  });

  it("shows the host's summary, returns the challenge on Confirm, and reports cancelled on Cancel", async () => {
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { request: { id: string }; confirmation?: string };
      calls.push(body);
      if (!body.confirmation) return jsonResponse({ confirm: { requestId: body.request.id, summary: "Stop “Other”", challenge: "chal.sig" } }, 401);
      return jsonResponse({ response: { v: 1, id: body.request.id, ok: true, result: { stopped: true } } });
    });
    const { relay, dialog } = relayWith(fetchImpl as never);
    const { port, sent } = fakePort();
    relay.handle(port, { v: 1, id: "tp-1", method: "sessions.stop", params: { sessionId: "thr_b" }, pageRevision: REV });
    await flush();
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelector("p")!.textContent).toBe("Stop “Other”");
    dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    await flush();
    expect((calls[1] as { confirmation: string }).confirmation).toBe("chal.sig");
    expect(sent[0]).toEqual({ v: 1, id: "tp-1", ok: true, result: { stopped: true } });

    relay.handle(port, { v: 1, id: "tp-2", method: "sessions.stop", params: { sessionId: "thr_b" }, pageRevision: REV });
    await flush();
    dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!.click();
    await flush();
    expect(sent[1]).toMatchObject({ id: "tp-2", ok: false, error: { code: "cancelled" } });
    expect(calls).toHaveLength(3);
  });

  it("navigates in place for host-validated page directives and externally after confirmation", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { request: { id: string; method: string }; confirmation?: string };
      if (body.request.method === "pages.open") {
        return jsonResponse({ response: { v: 1, id: body.request.id, ok: true, result: { opened: true } }, navigate: { kind: "page", url: "/api/v1/plugins/thread-pages/http/page?session=thr_b" } });
      }
      if (!body.confirmation) return jsonResponse({ confirm: { requestId: body.request.id, summary: "Open example.com", challenge: "c" } }, 401);
      return jsonResponse({ response: { v: 1, id: body.request.id, ok: true, result: { opened: true } }, navigate: { kind: "external", url: "https://example.com/" } });
    });
    const { relay, dialog, navigator } = relayWith(fetchImpl as never);
    const { port, sent } = fakePort();
    relay.handle(port, { v: 1, id: "tp-1", method: "pages.open", params: { sessionId: "thr_b" }, pageRevision: REV });
    await flush();
    expect(navigator.inPlace).toHaveBeenCalledWith("/api/v1/plugins/thread-pages/http/page?session=thr_b");
    expect(sent[0]).toMatchObject({ ok: true });
    relay.handle(port, { v: 1, id: "tp-2", method: "navigation.openExternal", params: { url: "https://example.com/" }, pageRevision: REV });
    await flush();
    dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    await flush();
    expect(navigator.reserveWindow).toHaveBeenCalled();
    expect(navigator.external).toHaveBeenCalledWith("https://example.com/");
  });

  it("ignores a directive the host did not shape correctly", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { request: { id: string } };
      return jsonResponse({ response: { v: 1, id: body.request.id, ok: true, result: { opened: true } }, navigate: { kind: "external", url: "javascript:alert(1)" } });
    });
    const { relay, navigator } = relayWith(fetchImpl as never);
    const { port } = fakePort();
    relay.handle(port, { v: 1, id: "tp-1", method: "navigation.openExternal", params: { url: "https://x.example/" }, pageRevision: REV });
    await flush();
    expect(navigator.external).not.toHaveBeenCalled();
    expect(navigator.inPlace).not.toHaveBeenCalled();
  });

  it("uploads files first, then submits referencing them, and reports failures visibly", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (url === "/upload") return jsonResponse({ ok: true, name: "n", path: "uploads/n", sizeBytes: 3 });
      expect((body.files as unknown[]).length).toBe(1);
      return jsonResponse({ ok: true, delivery: "queued" });
    });
    const { relay } = relayWith(fetchImpl as never);
    const { port, sent } = fakePort();
    const file = new File(["abc"], "a.txt");
    relay.handle(port, { kind: "thread-page:submit", submissionId: "s1", title: "T", answers: [], files: [{ field: "f", file }] });
    await flush();
    await flush();
    expect(sent).toContainEqual({ kind: "thread-page:submit-progress", submissionId: "s1", message: "Uploading 1 of 1…" });
    expect(sent.at(-1)).toMatchObject({ kind: "thread-page:submit-result", submissionId: "s1", ok: true, message: "Sent (queued)" });

    const big = new File([new Uint8Array(2048)], "big.bin");
    relay.handle(port, { kind: "thread-page:submit", submissionId: "s2", title: "T", answers: [], files: [{ field: "f", file: big }] });
    await flush();
    await flush();
    expect(sent.at(-1)).toMatchObject({ kind: "thread-page:submit-result", submissionId: "s2", ok: false, error: expect.stringMatching(/larger than/) });
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/submit")).toHaveLength(1);
  });
});

describe("shell poller", () => {
  function view() {
    return { setStatus: vi.fn(), setWorking: vi.fn(), showReload: vi.fn(), onStaleChanged: vi.fn(), reloadView: vi.fn() };
  }

  it("reads activity and stale state off the poll and reloads on a new revision unless dirty", async () => {
    const etag = { value: `"${REV}"` };
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304, headers: { etag: etag.value, "x-thread-page-activity": "working", "x-thread-page-stale": "false" } }));
    const seen = view();
    const poller = createPoller(window, config, seen, fetchImpl as never);
    await poller.pollNow();
    expect(seen.setWorking).toHaveBeenCalledWith(true);
    expect(seen.reloadView).not.toHaveBeenCalled();
    etag.value = `"${"2".repeat(64)}"`;
    poller.setDirty(true);
    await poller.pollNow();
    expect(seen.reloadView).not.toHaveBeenCalled();
    expect(seen.showReload).toHaveBeenCalledWith(true);
    expect(seen.setStatus).toHaveBeenCalledWith("Page changed — reload when ready", true);
    poller.setDirty(false);
    etag.value = `"${"3".repeat(64)}"`;
    await poller.pollNow();
    expect(seen.reloadView).toHaveBeenCalledTimes(1);
  });

  it("announces stale transitions and stops on an expired session", async () => {
    let stale = "true";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304, headers: { etag: `"${REV}"`, "x-thread-page-activity": "idle", "x-thread-page-stale": stale } }));
    const seen = view();
    const poller = createPoller(window, config, seen, fetchImpl as never);
    await poller.pollNow();
    expect(seen.onStaleChanged).toHaveBeenCalledWith(true);
    expect(seen.setStatus).toHaveBeenCalledWith("Offline copy — read-only", true);
    stale = "false";
    await poller.pollNow();
    expect(seen.onStaleChanged).toHaveBeenLastCalledWith(false);
    const expiring = createPoller(window, { ...config, expiresAt: Date.now() + 1000 }, seen, fetchImpl as never);
    await expiring.pollNow();
    expect(seen.reloadView).toHaveBeenCalled();
    expect(expiring.isStopped()).toBe(true);
  });
});
