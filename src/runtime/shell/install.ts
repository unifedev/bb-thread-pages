import { checkDocumentQuery, documentFragment, ENTRY_DOCUMENT } from "../../domain/document-path.ts";
import { EMPTY_PAGE_STATUS, HANDSHAKE_VERSION, isRecord, type ShellConfig } from "../shared/protocol.ts";
import { createChromeActions } from "./actions.ts";
import { createConfirmer } from "./confirm.ts";
import { createGrantsChrome, type GrantElements, type GrantsChrome } from "./grants.ts";
import { createNavigator } from "./navigate.ts";
import { createOwnFiles } from "./own-files.ts";
import { createPoller, type Poller } from "./poll.ts";
import { createRelay } from "./relay.ts";
import { createReaderGesture } from "./gesture.ts";
import { createVoice, type RecorderElements, type Voice } from "./voice.ts";

/**
 * Wires the shell: loads the document into the sandboxed frame, hands it one
 * MessagePort once it reports ready, relays its messages, polls for a new
 * revision, and owns the chrome. A link to another document of the page swaps
 * the frame's document in place: the shell stays, its address follows, and
 * back and forward return. A new revision of the open document is swapped in
 * the same way, behind the shown one, with no history entry and the address
 * unchanged. spec 02 §The shell, R1.12a–R1.12d, R2.18a
 *
 * A document's `#fragment` is the reader's address's: the shell loads the
 * document at it, a link carries its own, back, forward and reload return to
 * it, and when the document changes it the address follows. It never reaches
 * the server. spec R1.12f
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
  /** The recording bar. spec R3.32 */
  recorder?: RecorderElements | null;
}

export interface ShellHandle {
  poller: Poller;
  /** For tests: open another document of the page as a link would. */
  openDocument(path: string, push?: boolean, fragment?: string, query?: string): Promise<boolean>;
  /** For tests: show the open document's current revision in place. */
  refreshDocument(): Promise<boolean>;
  /** For tests: the frame the reader sees. */
  shownFrame(): HTMLIFrameElement;
}

const HISTORY_KEY = "threadPageDocument";
const HISTORY_FRAGMENT = "threadPageFragment";
const HISTORY_QUERY = "threadPageQuery";
/** A question's confirm button ignores clicks this long after it appears. */
const CONFIRM_ARM_MS = 400;
/** How long a runtime has to answer the shell's ping after its frame loads. */
const LOADED_GRACE_MS = 3_000;
/** Reloads in a row that never come back working before the shell stops and says so. */
const RELOADS_ALLOWED = 3;

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
  let incoming: { frame: HTMLIFrameElement; ready: boolean; port: MessagePort | null; revision: string | null; loaded: boolean; apply: DocumentSession; timer: ReturnType<typeof setTimeout>; settle(shown: boolean): void } | null = null;
  /** The port each frame's runtime handed over in its first ready. */
  const portOf = new WeakMap<HTMLIFrameElement, MessagePort>();
  /** A refreshed document's messages, kept until it is shown. */
  const waiting = new WeakMap<MessagePort, unknown[]>();
  /** The last ping each runtime answered: proof its document is still the one in the frame. */
  const answered = new WeakMap<MessagePort, number>();
  let pings = 0;
  /** Reloads in a row whose document never answered: a page that keeps leaving is stopped. */
  let failedReloads = 0;
  /** Frames already being replaced: one reload per frame, however many signs it gives. */
  const replacing = new WeakSet<HTMLIFrameElement>();

  /**
   * After every load of a frame whose runtime handed over a port, the shell
   * asks that runtime, over its port, whether it is still there. A document
   * that left its frame — swapped out by a page for a file with no runtime,
   * even before it finished loading — cannot answer: its port died with it.
   * Whatever order an engine fires `load` and messages in, the answer decides,
   * and the shell loads its own document again. spec R2.18d, D44
   */
  function watchLoads(target: HTMLIFrameElement): void {
    target.addEventListener("load", () => {
      const port = portOf.get(target);
      if (!port) return;
      pings += 1;
      const ping = pings;
      try {
        port.postMessage({ kind: "thread-page:ping", nonce: ping });
      } catch {
        // A closed port answers nothing; the check below says so.
      }
      setTimeout(() => {
        if ((answered.get(port) ?? 0) >= ping) return;
        if (target === frame) void reloadShown();
        else if (incoming && target === incoming.frame) {
          cancelIncoming();
          void reloadShown();
        }
      }, LOADED_GRACE_MS);
    });
  }

  /** Hears a runtime's port from its first ready: answers to pings always, the rest once its document is shown. */
  function accept(port: MessagePort, from: HTMLIFrameElement): void {
    portOf.set(from, port);
    port.onmessage = (event) => {
      const data = event.data as unknown;
      if (isRecord(data) && data.kind === "thread-page:pong") {
        if (typeof data.nonce === "number") answered.set(port, Math.max(answered.get(port) ?? 0, data.nonce));
        // The shown document is working: reloads that came back count for nothing.
        if (framePort === port) {
          failedReloads = 0;
          if (stoppedLine !== null) {
            stoppedLine = null;
            view.setStatus(config.notice ?? "", false);
          }
        }
        return;
      }
      // A frame that was replaced may still be posting; only the shown one is heard, and a refreshed one later.
      if (framePort === port) relay.handle(port, data);
      else if (incoming && incoming.port === port) waiting.get(port)?.push(data);
    };
    waiting.set(port, []);
    port.start?.();
    watchLoads(from);
  }
  let grantsChrome: GrantsChrome | null = null;
  /** Where to return the shown frame's document to, once its kernel connects. */
  let pendingRestore: { x: number; y: number } | null = null;
  /** Counts document switches, so work that awaited one can tell it was overtaken. */
  let generation = 0;
  /** The shown document's `#fragment`, or "". spec R1.12f */
  let fragment = config.navigable ? documentFragment(win.location.hash) : "";

  /** A line that stays until a document of the page is shown working again: the page that kept leaving. */
  let stoppedLine: string | null = null;
  const view = {
    setStatus(text: string, warn: boolean) {
      if (stoppedLine !== null && !warn) {
        text = stoppedLine;
        warn = true;
      }
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
  let voice: Voice | null = null;
  // The reader's gestures in the shell's own chrome, told apart from those in the page. spec R3.32a
  const gesture = createReaderGesture(win);
  // The recording bar is a question too: one of the two at a time. spec R3.22a, R3.32a
  const confirmer = createConfirmer(dialog, CONFIRM_ARM_MS, () => voice?.isOpen() ?? false, () => gesture.closed());
  if (elements.recorder) {
    voice = createVoice(win, config, elements.recorder, {
      questionOpen: () => confirmer.isOpen?.() ?? false,
      // The bar took the keyboard; the page gets it back, so the reader can go on typing.
      restoreFocus: () => {
        try {
          frame.focus({ preventScroll: true });
        } catch {
          // Focus is a courtesy.
        }
      },
      setStatus: (text, warn) => view.setStatus(text, warn),
      onClosed: () => gesture.closed(),
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    voice.onChange((usable) => framePort?.postMessage({ kind: "thread-page:voice", available: usable }));
  }
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
    onOpenDocument: (path, next, nextQuery) => void openDocument(path, true, next, nextQuery),
    onFragment: (next, step) => {
      if (!config.navigable || next === fragment) return;
      fragment = next;
      try {
        // A link's move is a step of the shell's own history, which outlives the frame; a change the
        // document made itself (its own history entry, if any) only moves the address. spec R1.12f
        if (step) win.history.pushState(historyState(), "", shellAddress(config.documentPath));
        else win.history.replaceState(historyState(), "", shellAddress(config.documentPath));
      } catch {
        // The address is a courtesy; the document has its fragment either way.
      }
    },
    onAnswered: () => poller.expectChange(),
    onScroll: (x, y) => {
      scroll = { x, y };
    },
    onGranted: (grant) => grantsChrome?.add(grant),
    ownFiles: createOwnFiles(win, config, request, confirmer),
    ...(voice ? { voice } : {}),
    readerGesture: (options) => gesture.decide(options),
    onStatus: (text, warn) => view.setStatus(text, warn),
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

  /**
   * Starts talking over the port the frame's runtime handed over in its first
   * `ready`. Nothing is ever posted into the frame itself. spec R2.3, R2.18d, D44
   */
  function connectFrame(port: MessagePort, restore: { x: number; y: number } | null): void {
    // Another document now: a bar the previous one asked for is not this one's to finish.
    voice?.cancel();
    framePort = port;
    // What a refreshed document said while it waited behind the shown one.
    const held = waiting.get(port) ?? [];
    waiting.set(port, []);
    for (const data of held) relay.handle(port, data);
    port.postMessage({ kind: "thread-page:source-state", stale: lastStale });
    if (restore && (restore.x > 0 || restore.y > 0)) port.postMessage({ kind: "thread-page:restore-scroll", x: restore.x, y: restore.y });
    // Dictate is shown only where recording can work. spec R4.59
    if (voice) void voice.usable().then((available) => {
      if (framePort === port) port.postMessage({ kind: "thread-page:voice", available });
    });
    else port.postMessage({ kind: "thread-page:voice", available: false });
  }

  win.addEventListener("message", (event) => {
    // Only a frame of ours, on its opaque origin, only the handshake.
    if (event.origin !== "null") return;
    const from = event.source === frame.contentWindow ? frame : incoming && event.source === incoming.frame.contentWindow ? incoming.frame : null;
    if (!from) return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:ready" || data.version !== HANDSHAKE_VERSION) return;
    const port = event.ports.length === 1 ? event.ports[0] : undefined;
    if (!awaitingReady.has(from)) {
      // The shown frame loaded something the shell did not load: the document's own location.reload(), or
      // anything a page navigated its frame to — another document, an HTML file with no runtime at all. The
      // shell cannot tell which, so it connects nothing and loads its own document again into a fresh frame,
      // which is connected as any load is. spec R2.18d, D44
      if (from === frame) void reloadShown();
      return;
    }
    // The first ready of a frame the shell loaded, with the runtime's own port: nothing else is taken.
    if (!port) return;
    awaitingReady.delete(from);
    accept(port, from);
    if (from === frame) {
      const restore = pendingRestore;
      pendingRestore = null;
      connectFrame(port, restore);
      checkRevision(data.revision);
      return;
    }
    // A refreshed document's port is kept and heard from when it is shown, so the shown one keeps its
    // channel until then; its messages wait meanwhile.
    if (incoming) {
      incoming.ready = true;
      incoming.port = port;
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
    voice?.cancel();
    const next = frame.cloneNode(false) as HTMLIFrameElement;
    next.removeAttribute("data-incoming");
    next.setAttribute("src", url + fragment);
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
    if (current.ready && current.port) connectFrame(current.port, restore);
    else pendingRestore = restore;
    previous.remove();
    frame.removeAttribute("data-incoming");
    poller.retarget();
    view.showReload(false);
    view.setStatus(config.stale ? "Offline copy — read-only" : config.empty ? EMPTY_PAGE_STATUS : (config.notice ?? ""), config.stale);
    if (current.ready) checkRevision(current.revision);
    current.settle(true);
  }

  /**
   * The shell's address for a document with its query and fragment: `path` is
   * the document's URL relative to the page root, written readably
   * (`path=tool.html?scope=clients/vela/q3-board`), only `&`, `#`, `%`, `+` and
   * spaces escaped. The fragment is the document's, not the last one's. spec R1.12d, R1.12g
   */
  function shellAddress(path: string): string {
    const url = new URL(win.location.href);
    // Only the address's own parameters; the document's are written into `path`. spec R1.12g
    for (const name of [...url.searchParams.keys()]) if (name !== "session" && name !== "threadId") url.searchParams.delete(name);
    const query = config.documentQuery ?? "";
    const value = path === ENTRY_DOCUMENT && !query ? "" : readable(`${path}${query}`);
    const search = url.search ? `${url.search}${value ? `&path=${value}` : ""}` : value ? `?path=${value}` : "";
    return `${url.pathname}${search}${fragment}`;
  }

  function historyState(): Record<string, string> {
    return { [HISTORY_KEY]: config.documentPath, [HISTORY_FRAGMENT]: fragment, [HISTORY_QUERY]: config.documentQuery ?? "" };
  }

  interface DocumentSession {
    actionToken: string;
    pageRevision: string;
    expiresAt: number;
    documentUrl: string;
    path: string;
    query: string;
    stale: boolean;
    empty: boolean;
    deferredFiles: string[];
  }

  /** Exchanges the token for one bound to a document of the page at its current revision. */
  async function documentSession(path: string, query = config.documentQuery ?? ""): Promise<DocumentSession | string> {
    const response = await request(config.documentSessionUrl, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionToken: config.actionToken, path, ...(query ? { query } : {}) }),
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
    const deferredFiles = Array.isArray(body.deferredFiles) ? body.deferredFiles.filter((path): path is string => typeof path === "string") : [];
    const answered = typeof body.query === "string" ? body.query : "";
    return { actionToken: body.actionToken, pageRevision: body.pageRevision, expiresAt: body.expiresAt, documentUrl: body.documentUrl, path: body.path, query: answered, stale: body.stale === true, empty: body.empty === true, deferredFiles };
  }

  function applySession(session: DocumentSession): void {
    config.actionToken = session.actionToken;
    config.pageRevision = session.pageRevision;
    config.expiresAt = session.expiresAt;
    config.documentUrl = session.documentUrl;
    config.documentPath = session.path;
    config.documentQuery = session.query;
    config.stale = session.stale;
    config.empty = session.empty;
    config.deferredFiles = session.deferredFiles;
    lastStale = config.stale;
  }

  /** The shown document again, into a fresh frame the shell made, at its query and fragment. One at a time. */
  let reloading = false;
  async function reloadShown(): Promise<void> {
    if (reloading || replacing.has(frame)) return;
    if (failedReloads >= RELOADS_ALLOWED) {
      stoppedLine = "This page keeps leaving its own document, so it was stopped. Reload to try again.";
      view.setStatus(stoppedLine, true);
      return;
    }
    failedReloads += 1;
    replacing.add(frame);
    reloading = true;
    try {
      if (!config.navigable) {
        win.location.reload();
        return;
      }
      const startedAt = generation;
      let session: DocumentSession | string;
      try {
        session = await documentSession(config.documentPath);
      } catch {
        session = "unavailable";
      }
      if (startedAt !== generation) return;
      if (typeof session === "string") {
        win.location.reload();
        return;
      }
      cancelIncoming();
      applySession(session);
      framePort = null;
      scroll = { x: 0, y: 0 };
      pendingRestore = null;
      generation += 1;
      loadFrame(config.documentUrl);
      poller.retarget();
    } finally {
      reloading = false;
    }
  }

  /** A link to another document of the page: the frame is swapped and the address follows. */
  async function openDocument(path: string, push = true, nextFragment = "", nextQuery = ""): Promise<boolean> {
    if (!config.navigable || (path === config.documentPath && nextFragment === fragment && nextQuery === (config.documentQuery ?? ""))) return false;
    try {
      const session = await documentSession(path, nextQuery);
      if (typeof session === "string") {
        view.setStatus(session, true);
        return false;
      }
      cancelIncoming();
      applySession(session);
      fragment = nextFragment;
      framePort = null;
      scroll = { x: 0, y: 0 };
      pendingRestore = null;
      generation += 1;
      loadFrame(config.documentUrl);
      poller.retarget();
      view.showReload(false);
      view.setStatus(config.stale ? "Offline copy — read-only" : config.empty ? EMPTY_PAGE_STATUS : (config.notice ?? ""), config.stale);
      if (push) win.history.pushState(historyState(), "", shellAddress(config.documentPath));
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
    next.setAttribute("src", session.documentUrl + fragment);
    awaitingReady.add(next);
    return new Promise<boolean>((resolve) => {
      const entry = {
        frame: next,
        ready: false,
        port: null as MessagePort | null,
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
      // The address in its own form: a query typed with a raw `&` is written back inside `path`.
      win.history.replaceState(historyState(), "", shellAddress(config.documentPath));
    } catch {
      // A history the shell cannot write only loses back and forward.
    }
    win.addEventListener("popstate", (event) => {
      const state = event.state as unknown;
      const path = isRecord(state) && typeof state[HISTORY_KEY] === "string" ? state[HISTORY_KEY] : null;
      if (path && isRecord(state)) {
        const query = checkDocumentQuery(state[HISTORY_QUERY]);
        void openDocument(path, false, documentFragment(state[HISTORY_FRAGMENT]), query.ok ? query.query : "");
      }
    });
    // The reader's address changed only its fragment — a link to this page at another one, or the address
    // edited — which the browser does without loading the shell: the document is opened at it. An entry the
    // shell wrote is popstate's to restore. spec R1.12f
    win.addEventListener("hashchange", () => {
      const state = win.history.state as unknown;
      if (isRecord(state) && typeof state[HISTORY_KEY] === "string") return;
      const next = documentFragment(win.location.hash);
      if (next === fragment) return;
      void openDocument(config.documentPath, false, next, config.documentQuery ?? "").then((opened) => {
        if (!opened) return;
        try {
          win.history.replaceState(historyState(), "", shellAddress(config.documentPath));
        } catch {
          // Back and forward still work from the address alone.
        }
      });
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

  frame.src = config.documentUrl + fragment;
  poller.start();
  return { poller, openDocument, refreshDocument, shownFrame: () => frame };
}

/** A document URL as an address shows it: escaped only where its own query would break the address's. */
function readable(value: string): string {
  return encodeURIComponent(value).replace(/%(2F|3F|3D|3A|2C|40|7E|21|27|28|29|2A|3B|24)/gi, (match) => decodeURIComponent(match));
}
