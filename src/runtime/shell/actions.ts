import type { ShellConfig } from "../shared/protocol.ts";
import type { Confirmer } from "./confirm.ts";

/**
 * The bar's own actions on the session the shell is showing: pin in the
 * host, open its conversation, mark read, archive. They never cross the
 * sandboxed page's port — the shell is trusted chrome and the page cannot
 * reach this route. spec 02 §The shell
 */
export interface ChromeActionElements {
  acts: HTMLElement;
  pin: HTMLButtonElement;
  read: HTMLButtonElement;
  archive: HTMLButtonElement;
  title: HTMLElement;
}

export interface ChromeActionsView {
  setStatus(text: string, warn: boolean): void;
  /** After the session is archived its page stops being served, so the view navigates away. */
  navigateAway(): void;
}

interface ChromeState {
  pinned: boolean;
  unread: boolean;
  archived: boolean;
}

export function createChromeActions(
  config: ShellConfig,
  elements: ChromeActionElements,
  deps: { confirmer: Confirmer; view: ChromeActionsView; fetchImpl?: typeof fetch },
): void {
  const { acts, pin, read, archive, title } = elements;
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (config.stale) {
    for (const button of [pin, read, archive]) button.disabled = true;
    return;
  }

  let pinned = pin.dataset.on === "true";
  let unread = read.dataset.on === "true";
  let busy = false;

  function renderPin(): void {
    pin.textContent = pinned ? "★" : "☆";
    pin.dataset.on = String(pinned);
    pin.setAttribute("aria-pressed", String(pinned));
    pin.title = pinned ? "Pinned in bb" : "Pin in bb";
  }
  function renderRead(): void {
    read.textContent = unread ? "Read" : "Unread";
    read.dataset.on = String(unread);
    read.title = unread ? "Mark read" : "Mark unread";
  }

  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  function flash(message: string): void {
    deps.view.setStatus(message, true);
    if (statusTimer !== undefined) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => deps.view.setStatus("", false), 6000);
  }

  async function run(action: string): Promise<ChromeState | null> {
    try {
      const response = await fetchImpl(config.chromeActionUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionToken: config.actionToken, action }),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const state = body && (body.state as Record<string, unknown> | undefined);
      if (!response.ok || !body || body.ok !== true || !state) {
        flash((body && typeof body.message === "string" && body.message) || `Request failed (${response.status})`);
        return null;
      }
      return { pinned: state.pinned === true, unread: state.unread === true, archived: state.archived === true };
    } catch (error) {
      flash(error instanceof Error ? error.message : "Request failed");
      return null;
    }
  }

  async function guarded(action: string): Promise<ChromeState | null> {
    if (busy) return null;
    busy = true;
    acts.dataset.busy = "true";
    try {
      return await run(action);
    } finally {
      busy = false;
      delete acts.dataset.busy;
    }
  }

  function apply(state: ChromeState): void {
    pinned = state.pinned;
    unread = state.unread;
    renderPin();
    renderRead();
  }

  pin.addEventListener("click", () => {
    void guarded(pinned ? "unpin" : "pin").then((state) => {
      if (state) apply(state);
    });
  });

  read.addEventListener("click", () => {
    void guarded(unread ? "read" : "unread").then((state) => {
      if (state) apply(state);
    });
  });

  archive.addEventListener("click", async () => {
    if (busy) return;
    const name = title.textContent?.trim() || "this session";
    const approved = await deps.confirmer.confirm(`Archive “${name}”? Its page stops being served.`);
    if (!approved) return;
    const state = await guarded("archive");
    if (!state) return;
    if (state.archived) deps.view.navigateAway();
    else apply(state);
  });

  renderPin();
  renderRead();
}
