import { ENTRY_DOCUMENT } from "../../domain/document-path.ts";
import { EMPTY_PAGE_STATUS, HANDSHAKE_VERSION, isRecord, type ShellConfig } from "../shared/protocol.ts";
import { createChromeActions } from "./actions.ts";
import { createConfirmer } from "./confirm.ts";
import { createGrantsChrome, type GrantElements, type GrantsChrome } from "./grants.ts";
import { createNavigator } from "./navigate.ts";
import { createOwnFiles } from "./own-files.ts";
import { createPoller, type Poller } from "./poll.ts";
import { createRelay } from "./relay.ts";

/**
 * Wires the shell: loads the document into the sandboxed frame, hands it one
 * MessagePort once it reports ready, relays its messages, polls for a new
 * revision, and owns the chrome. A link to another document of the page swaps
 * the frame's document in place: the shell stays, its address follows, and
 * back and forward return. A new revision of the open document is swapped in
 * the same way, behind the shown one, with no history entry and the address
 * unchanged. spec 02 §The shell, R1.12a–R1.12d, R2.18a
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
  /** The list of sessions this page may answer from an embed. spec R5.65 */
  grants?: GrantElements | null;
}

export interface ShellHandle {
  poller: Poller;
  /** For tests: open another document of the page as a link would. */
  openDocument(path: string, push?: boolean): Promise<boolean>;
  /** For tests: show the open document's current revision in place. */
  refreshDocument(): Promise<boolean>;
  /** For tests: the frame the reader sees. */
  shownFrame(): HTMLIFrameElement;
}

const HISTORY_KEY = "threadPageDocument";
/** A question's confirm button ignores clicks this long after it appears. */
const CONFIRM_ARM_MS = 400;

export function installShell(win: Window & typeof globalThis, config: ShellConfig, elements: ShellElements, fetchImpl?: typeof fetch): ShellHandle {
  const { status, work, reload, dialog, acts, pin, read, archive, title } = elements;
  const request = fetchImpl ?? win.fetch.bind(win);
  let frame = elements.frame;
  let framePort: MessagePort | null = null;
  let lastStale = config.stale;
  /** Frames whose kernel has not reported ready yet; each is connected once. */
  const awaitingReady = new WeakSet<HTMLIFrameElement>([frame]);
  /** Where the shown document is scrolled to, as its kernel reports it. spec R2.18b */
  let scroll = { x: 0, y: 0 };
  /** A refreshed document loading behind the shown one. spec R2.18a */
  let incoming: { frame: HTMLIFrameElement; ready: boolean; revision: string | null; loaded: boolean; apply: DocumentSession; timer: ReturnType<typeof setTimeout>; settle(shown: boolean): void } | null = null;
  let grantsChrome: GrantsChrome | null = null;
  /** Where to return the shown frame's document to, once its kernel connects. */
  let pendingRestore: { x: number; y: number } | null = null;
  /** Counts document switches, so work that awaited one can tell it was overtaken. */
  let generation = 0;

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
    refreshDocument() {
      void refreshDocument();
    },
  };

  const poller = createPoller(win, config, view, fetchImpl);
  const navigator = createNavigator(win);
  const confirmer = createConfirmer(dialog, CONFIRM_ARM_MS);
  const relay = createRelay({
    config,
    confirmer,
    navigator,
    onDirty: (dirty) => {
      poller.setDirty(dirty);
      // The reader started typing while a new version was loading: keep what they see. spec R2.21
      if (dirty && incoming) {
        cancelIncoming();
        poller.offer();
      }
    },
    onOpenDocument: (path) => void openDocument(path, true),
    onAnswered: () => poller.expectChange(),
    onScroll: (x, y) => {
      scroll = { x, y };
    },
    onGranted: (grant) => grantsChrome?.add(grant),
    ownFiles: createOwnFiles(win, config, request),
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

  if (elements.grants) {
    grantsChrome = createGrantsChrome(config, elements.grants, { setStatus: (text, warn) => view.setStatus(text, warn), ...(fetchImpl ? { fetchImpl } : {}) });
  }

  function connectFrame(target: HTMLIFrameElement, restore: { x: number; y: number } | null): void {
    const channel = new win.MessageChannel();
    const port = channel.port1;
    framePort = port;
    port.onmessage = (event) => {
      // A frame that was replaced may still be posting; only the shown one is heard.
      if (framePort === port) relay.handle(port, event.data);
    };
    port.start?.();
    target.contentWindow?.postMessage({ kind: "thread-page:connect", version: HANDSHAKE_VERSION }, "*", [channel.port2]);
    port.postMessage({ kind: "thread-page:source-state", stale: lastStale });
    if (restore && (restore.x > 0 || restore.y > 0)) port.postMessage({ kind: "thread-page:restore-scroll", x: restore.x, y: restore.y });
  }

  win.addEventListener("message", (event) => {
    // Only a frame of ours, on its opaque origin, only once per document, only the handshake.
    if (event.origin !== "null") return;
    const from = event.source === frame.contentWindow ? frame : incoming && event.source === incoming.frame.contentWindow ? incoming.frame : null;
    if (!from || !awaitingReady.has(from)) return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:ready" || data.version !== HANDSHAKE_VERSION) return;
    awaitingReady.delete(from);
    if (from === frame) {
      const restore = pendingRestore;
      pendingRestore = null;
      connectFrame(frame, restore);
      checkRevision(data.revision);
      return;
    }
    // A refreshed document is connected when it is shown, so the shown one keeps its channel until then.
    if (incoming) {
      incoming.ready = true;
      incoming.revision = typeof data.revision === "string" ? data.revision : null;
      if (incoming.loaded) showIncoming();
    }
  });

  /**
   * The document is served at whatever revision is current when it loads, which
   * can be newer than the one the token was exchanged for a moment earlier. Its
   * calls would be refused until the next poll noticed, so look now.
   */
  function checkRevision(served: unknown): void {
    if (typeof served === "string" && served !== config.pageRevision) void poller.pollNow();
  }

  /**
   * Loads a document into a fresh frame. Navigating the existing frame would
   * add a history entry of the frame's own, so Back would step the frame
   * behind the shell's back; a new frame element adds none, and history stays
   * the shell's.
   */
  function loadFrame(url: string): void {
    const next = frame.cloneNode(false) as HTMLIFrameElement;
    next.removeAttribute("data-incoming");
    next.setAttribute("src", url);
    awaitingReady.add(next);
    frame.replaceWith(next);
    frame = next;
  }

  function cancelIncoming(): void {
    const current = incoming;
    if (!current) return;
    incoming = null;
    clearTimeout(current.timer);
    current.frame.remove();
    current.settle(false);
  }

  /** The refreshed document has loaded: it takes the shown one's place and its kernel is connected. */
  function showIncoming(): void {
    const current = incoming;
    if (!current) return;
    incoming = null;
    clearTimeout(current.timer);
    applySession(current.apply);
    const previous = frame;
    frame = current.frame;
    framePort = null;
    const restore = scroll;
    scroll = { x: 0, y: 0 };
    generation += 1;
    // A document still loading when its time ran out connects when its kernel reports, and returns there then.
    if (current.ready) connectFrame(frame, restore);
    else pendingRestore = restore;
    previous.remove();
    frame.removeAttribute("data-incoming");
    poller.retarget();
    view.showReload(false);
    view.setStatus(config.stale ? "Offline copy — read-only" : config.empty ? EMPTY_PAGE_STATUS : (config.notice ?? ""), config.stale);
    if (current.ready) checkRevision(current.revision);
    current.settle(true);
  }

  function shellAddress(path: string): string {
    const url = new URL(win.location.href);
    if (path === ENTRY_DOCUMENT) url.searchParams.delete("path");
    else url.searchParams.set("path", path);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  interface DocumentSession {
    actionToken: string;
    pageRevision: string;
    expiresAt: number;
    documentUrl: string;
    path: string;
    stale: boolean;
    empty: boolean;
  }

  /** Exchanges the token for one bound to a document of the page at its current revision. */
  async function documentSession(path: string): Promise<DocumentSession | string> {
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
      return (isRecord(body) && typeof body.message === "string" && body.message) || "That page could not be opened";
    }
    return { actionToken: body.actionToken, pageRevision: body.pageRevision, expiresAt: body.expiresAt, documentUrl: body.documentUrl, path: body.path, stale: body.stale === true, empty: body.empty === true };
  }

  function applySession(session: DocumentSession): void {
    config.actionToken = session.actionToken;
    config.pageRevision = session.pageRevision;
    config.expiresAt = session.expiresAt;
    config.documentUrl = session.documentUrl;
    config.documentPath = session.path;
    config.stale = session.stale;
    config.empty = session.empty;
    lastStale = config.stale;
  }

  /** A link to another document of the page: the frame is swapped and the address follows. */
  async function openDocument(path: string, push = true): Promise<boolean> {
    if (!config.navigable || path === config.documentPath) return false;
    try {
      const session = await documentSession(path);
      if (typeof session === "string") {
        view.setStatus(session, true);
        return false;
      }
      cancelIncoming();
      applySession(session);
      framePort = null;
      scroll = { x: 0, y: 0 };
      pendingRestore = null;
      generation += 1;
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

  /**
   * Shows the open document's new revision in place: a fresh token, the
   * document loaded in a second frame behind the shown one, and the two
   * exchanged once it has loaded — no empty frame, no history entry, the
   * address unchanged. Falls back to reloading the shell. spec R2.18a, D28
   */
  async function refreshDocument(): Promise<boolean> {
    if (!config.navigable) {
      win.location.reload();
      return false;
    }
    cancelIncoming();
    const startedAt = generation;
    let session: DocumentSession | string;
    try {
      session = await documentSession(config.documentPath);
    } catch {
      session = "unavailable";
    }
    // The reader opened another document, or another refresh finished, while the token was exchanged.
    if (startedAt !== generation) return false;
    if (typeof session === "string") {
      win.location.reload();
      return false;
    }
    // The reader began typing while the token was exchanged.
    if (poller.isDirty()) {
      poller.offer();
      return false;
    }
    cancelIncoming();
    const next = frame.cloneNode(false) as HTMLIFrameElement;
    next.setAttribute("data-incoming", "");
    next.setAttribute("src", session.documentUrl);
    awaitingReady.add(next);
    return new Promise<boolean>((resolve) => {
      const entry = {
        frame: next,
        ready: false,
        revision: null as string | null,
        loaded: false,
        apply: session as DocumentSession,
        // A document that never finishes loading — a slow remote font — is shown anyway.
        timer: setTimeout(() => {
          if (incoming === entry) showIncoming();
        }, config.refreshSwapMs),
        settle: resolve,
      };
      incoming = entry;
      next.addEventListener("load", () => {
        entry.loaded = true;
        if (incoming === entry && entry.ready) showIncoming();
      });
      frame.insertAdjacentElement("afterend", next);
    });
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

  // A new version the reader chose to see is shown in place, discarding what they typed;
  // a token that ran out needs the shell itself again.
  reload.addEventListener("click", () => {
    if (poller.isStopped()) {
      win.location.reload();
      return;
    }
    // Clearing the dirt shows an offered version; with none offered, refresh anyway.
    const wasOffered = reload.dataset.visible === "true" && poller.isDirty();
    poller.setDirty(false);
    if (!wasOffered) void refreshDocument();
  });

  frame.src = config.documentUrl;
  poller.start();
  return { poller, openDocument, refreshDocument, shownFrame: () => frame };
}
