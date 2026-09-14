import { ENTRY_DOCUMENT } from "../../domain/document-path.ts";
import { EMPTY_PAGE_STATUS, HANDSHAKE_VERSION, isRecord, type ShellConfig } from "../shared/protocol.ts";
import { createChromeActions } from "./actions.ts";
import { createConfirmer } from "./confirm.ts";
import { createNavigator } from "./navigate.ts";
import { createPoller, type Poller } from "./poll.ts";
import { createRelay } from "./relay.ts";

/**
 * Wires the shell: loads the document into the sandboxed frame, hands it one
 * MessagePort once it reports ready, relays its messages, polls for a new
 * revision, and owns the chrome. A link to another document of the page swaps
 * the frame's document in place: the shell stays, its address follows, and
 * back and forward return. spec 02 §The shell, R1.12a–R1.12d
 */
export interface ShellElements {
  frame: HTMLIFrameElement;
  status: HTMLElement;
  work: HTMLElement;
  reload: HTMLButtonElement;
  dialog: HTMLDialogElement;
  title: HTMLElement;
  /** The bar's session actions; absent on the built-in home, which has no session. */
  acts: HTMLElement | null;
  pin: HTMLButtonElement | null;
  read: HTMLButtonElement | null;
  archive: HTMLButtonElement | null;
}

export interface ShellHandle {
  poller: Poller;
  /** For tests: open another document of the page as a link would. */
  openDocument(path: string, push?: boolean): Promise<boolean>;
}

const HISTORY_KEY = "threadPageDocument";

export function installShell(win: Window & typeof globalThis, config: ShellConfig, elements: ShellElements, fetchImpl?: typeof fetch): ShellHandle {
  const { status, work, reload, dialog, acts, pin, read, archive, title } = elements;
  const request = fetchImpl ?? win.fetch.bind(win);
  let frame = elements.frame;
  let framePort: MessagePort | null = null;
  let awaitingReady = true;
  let lastStale = config.stale;

  const view = {
    setStatus(text: string, warn: boolean) {
      status.textContent = text;
      status.dataset.tone = warn ? "warn" : "";
    },
    setWorking(working: boolean) {
      work.dataset.visible = working && config.workingLabel ? "true" : "false";
    },
    showReload(visible: boolean) {
      reload.dataset.visible = visible ? "true" : "false";
    },
    onStaleChanged(stale: boolean) {
      lastStale = stale;
      framePort?.postMessage({ kind: "thread-page:source-state", stale });
    },
    reloadView() {
      win.location.reload();
    },
  };

  const poller = createPoller(win, config, view, fetchImpl);
  const navigator = createNavigator(win);
  const confirmer = createConfirmer(dialog);
  const relay = createRelay({
    config,
    confirmer,
    navigator,
    onDirty: (dirty) => poller.setDirty(dirty),
    onOpenDocument: (path) => void openDocument(path, true),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const homeLink = win.document.querySelector<HTMLAnchorElement>("a.home");
  if (acts && pin && read && archive) {
    createChromeActions(config, { acts, pin, read, archive, title }, {
      confirmer,
      view: {
        setStatus: (text, warn) => view.setStatus(text, warn),
        navigateAway: () => {
          if (homeLink?.href) win.location.assign(homeLink.href);
          else win.location.reload();
        },
      },
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }

  function connectFrame(): void {
    const channel = new win.MessageChannel();
    const port = channel.port1;
    framePort = port;
    port.onmessage = (event) => relay.handle(port, event.data);
    port.start?.();
    frame.contentWindow?.postMessage({ kind: "thread-page:connect", version: HANDSHAKE_VERSION }, "*", [channel.port2]);
    port.postMessage({ kind: "thread-page:source-state", stale: lastStale });
  }

  win.addEventListener("message", (event) => {
    // Only the current frame's opaque origin, only once per document, only the handshake.
    if (!awaitingReady || event.origin !== "null" || event.source !== frame.contentWindow) return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:ready" || data.version !== HANDSHAKE_VERSION) return;
    awaitingReady = false;
    connectFrame();
  });

  /**
   * Loads a document into a fresh frame. Navigating the existing frame would
   * add a history entry of the frame's own, so Back would step the frame
   * behind the shell's back; a new frame element adds none, and history stays
   * the shell's.
   */
  function loadFrame(url: string): void {
    const next = frame.cloneNode(false) as HTMLIFrameElement;
    next.setAttribute("src", url);
    frame.replaceWith(next);
    frame = next;
  }

  function shellAddress(path: string): string {
    const url = new URL(win.location.href);
    if (path === ENTRY_DOCUMENT) url.searchParams.delete("path");
    else url.searchParams.set("path", path);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  /** Exchanges the token for one bound to the other document, then swaps the frame. */
  async function openDocument(path: string, push = true): Promise<boolean> {
    if (!config.navigable || path === config.documentPath) return false;
    try {
      const response = await request(config.documentSessionUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionToken: config.actionToken, path }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (
        !response.ok ||
        !isRecord(body) ||
        body.ok !== true ||
        typeof body.actionToken !== "string" ||
        typeof body.pageRevision !== "string" ||
        typeof body.expiresAt !== "number" ||
        typeof body.documentUrl !== "string" ||
        !body.documentUrl.startsWith("/") ||
        typeof body.path !== "string"
      ) {
        view.setStatus((isRecord(body) && typeof body.message === "string" && body.message) || "That page could not be opened", true);
        return false;
      }
      config.actionToken = body.actionToken;
      config.pageRevision = body.pageRevision;
      config.expiresAt = body.expiresAt;
      config.documentUrl = body.documentUrl;
      config.documentPath = body.path;
      config.stale = body.stale === true;
      config.empty = body.empty === true;
      lastStale = config.stale;
      framePort = null;
      awaitingReady = true;
      loadFrame(config.documentUrl);
      poller.retarget();
      view.showReload(false);
      view.setStatus(config.stale ? "Offline copy — read-only" : config.empty ? EMPTY_PAGE_STATUS : (config.notice ?? ""), config.stale);
      if (push) win.history.pushState({ [HISTORY_KEY]: config.documentPath }, "", shellAddress(config.documentPath));
      return true;
    } catch {
      view.setStatus("That page could not be opened", true);
      return false;
    }
  }

  if (config.navigable) {
    try {
      win.history.replaceState({ [HISTORY_KEY]: config.documentPath }, "", win.location.href);
    } catch {
      // A history the shell cannot write only loses back and forward.
    }
    win.addEventListener("popstate", (event) => {
      const state = event.state as unknown;
      const path = isRecord(state) && typeof state[HISTORY_KEY] === "string" ? state[HISTORY_KEY] : null;
      if (path) void openDocument(path, false);
    });
  }

  reload.addEventListener("click", () => win.location.reload());

  frame.src = config.documentUrl;
  poller.start();
  return { poller, openDocument };
}
