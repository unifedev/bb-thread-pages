// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createChromeActions } from "../../src/runtime/shell/actions.ts";
import { createConfirmer } from "../../src/runtime/shell/confirm.ts";
import type { ShellConfig } from "../../src/runtime/shared/protocol.ts";

const config: ShellConfig = {
  actionToken: "tok",
  pageRevision: "1".repeat(64),
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

function fixture(options: { pinned?: boolean; unread?: boolean; stale?: boolean } = {}) {
  document.body.innerHTML = `
    <span class="title">Test session</span>
    <span class="acts" data-shell-acts>
      <button type="button" data-act="pin" data-on="${options.pinned === true}" aria-pressed="${options.pinned === true}">${options.pinned ? "★" : "☆"}</button>
      <button type="button" data-act="read" data-on="${options.unread === true}">${options.unread ? "Read" : "Unread"}</button>
      <button type="button" data-act="archive">Archive</button>
    </span>
    <dialog><form method="dialog"><p></p><button type="button" value="cancel">Cancel</button><button type="button" value="confirm">Confirm</button></form></dialog>`;
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  const elements = {
    acts: document.querySelector<HTMLElement>("[data-shell-acts]")!,
    pin: document.querySelector<HTMLButtonElement>('[data-act="pin"]')!,
    read: document.querySelector<HTMLButtonElement>('[data-act="read"]')!,
    archive: document.querySelector<HTMLButtonElement>('[data-act="archive"]')!,
    title: document.querySelector<HTMLElement>(".title")!,
  };
  const view = { setStatus: vi.fn(), navigateAway: vi.fn() };
  const fetchImpl = vi.fn();
  createChromeActions(
    { ...config, stale: options.stale === true },
    elements,
    { confirmer: createConfirmer(dialog), view, fetchImpl: fetchImpl as never },
  );
  return { elements, view, fetchImpl, dialog };
}

function stateResponse(state: { pinned?: boolean; unread?: boolean; archived?: boolean }, status = 200): Response {
  return new Response(JSON.stringify({ ok: status === 200, state: { pinned: false, unread: false, archived: false, ...state } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shell chrome actions", () => {
  it("pins and unpins from the bar", async () => {
    const { elements, fetchImpl } = fixture();
    fetchImpl.mockResolvedValue(stateResponse({ pinned: true }));
    elements.pin.click();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/chrome-action");
    expect(JSON.parse(String(init.body))).toEqual({ actionToken: "tok", action: "pin" });
    expect(elements.pin.textContent).toBe("★");
    expect(elements.pin.getAttribute("aria-pressed")).toBe("true");

    fetchImpl.mockResolvedValue(stateResponse({ pinned: false }));
    elements.pin.click();
    await flush();
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ actionToken: "tok", action: "unpin" });
    expect(elements.pin.textContent).toBe("☆");
  });

  it("marks an unread session read and back", async () => {
    const { elements, fetchImpl } = fixture({ unread: true });
    expect(elements.read.textContent).toBe("Read");
    fetchImpl.mockResolvedValue(stateResponse({ unread: false }));
    elements.read.click();
    await flush();
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ actionToken: "tok", action: "read" });
    expect(elements.read.textContent).toBe("Unread");
  });

  it("does not archive when the confirmation is declined", async () => {
    const { elements, fetchImpl, dialog } = fixture();
    elements.archive.click();
    await flush();
    dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!.click();
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("archives after confirmation and navigates away", async () => {
    const { elements, view, fetchImpl, dialog } = fixture();
    fetchImpl.mockResolvedValue(stateResponse({ archived: true }));
    elements.archive.click();
    await flush();
    expect(dialog.querySelector("p")!.textContent).toContain("Test session");
    dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    await flush();
    await flush();
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ actionToken: "tok", action: "archive" });
    expect(view.navigateAway).toHaveBeenCalledTimes(1);
  });

  it("reports a failure and keeps the state", async () => {
    const { elements, view, fetchImpl } = fixture();
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ ok: false, message: "confirmation_invalid: token expired" }), { status: 401, headers: { "content-type": "application/json" } }));
    elements.pin.click();
    await flush();
    expect(view.setStatus).toHaveBeenCalledWith("confirmation_invalid: token expired", true);
    expect(elements.pin.textContent).toBe("☆");
  });

  it("stays inert on a stale offline copy", async () => {
    const { elements, fetchImpl } = fixture({ stale: true });
    expect(elements.pin.disabled).toBe(true);
    expect(elements.read.disabled).toBe(true);
    expect(elements.archive.disabled).toBe(true);
    elements.pin.click();
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
