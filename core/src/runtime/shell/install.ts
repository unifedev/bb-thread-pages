// The shell state machine (DESIGN §D.1): frames, handshake acceptance (05 R2.3a), ping/pong liveness (R2.18d), open-document, history; the deferred swap (R2.21, U49); session state to the kernel (R2.24–R2.26); drafts in and out of the store and the leftovers for the home; the home's grants and drafts duties (R-S12).
import { checkDocumentQuery, documentFragment, ENTRY_DOCUMENT, isDocumentPath } from "../../domain/document-path.ts";
import type { ChromeActionBody, DocumentSessionBody, PageSource, PollBody } from "../shared/envelopes.ts";
import type { DraftRecord } from "../shared/drafts.ts";
import { isKernelMessage, isReadyMessage, isRecord, type GrantSummary, type KernelMessage, type LeftoverDraft, type ShellConfig, type ShellMessage } from "../shared/protocol.ts";
import { createConfirmer, type Confirmer } from "./confirm.ts";
import { addLeftover, createDraftStore, discardLeftover, leftoverLabel, LEFTOVERS_PREFIX, pruneDocumentLeftovers, readAllLeftovers, setDocumentLeftovers, type DraftStore, type LeftoverBound } from "./draft-store.ts";
import { createReaderGesture } from "./gesture.ts";
import { createNavigator } from "./navigate.ts";
import { createOwnFiles } from "./own-files.ts";
import { createPoller, type Poller } from "./poll.ts";
import { createRelay, type FrameContext } from "./relay.ts";
import { ARCHIVED_LINE, BLOCKED_TAB_LINE, createNotice, DELETED_LINE, EXPIRED_LINE, EXPIRING_LINE, STILL_LOADING, STOPPED_LINE, STORAGE_FALLBACK_LINE, UNREACHABLE_LINE, type Notice } from "./status.ts";
import { relaySubmit } from "./submit.ts";
import { clearTimers, createFrame, discard, postTo, show, type Frame, type FrameTarget } from "./swap.ts";
import { buildRecorder, createVoice, type Voice } from "./voice.ts";

export interface ShellElements {
  /** The notice strip at the bottom: no height until it has text. U49 */
  notice: HTMLElement;
  frameHost: HTMLElement;
  dialog: HTMLDialogElement;
  recorder: HTMLElement | null;
}

export type ShellState = "LOADING" | "CONNECTING" | "SHOWN" | "INCOMING" | "DEFERRED" | "RELOAD" | "STOPPED" | "DELETED";

export interface ShellHandle {
  state(): ShellState;
  shownFrame(): HTMLIFrameElement | null;
  incomingFrame(): HTMLIFrameElement | null;
  poller: Poller;
  notice: Notice;
  store: DraftStore;
  confirmer: Confirmer;
  voice: Voice | null;
  /** For tests: open another document as a link would. */
  openDocument(path: string, push?: boolean, fragment?: string, query?: string): Promise<boolean>;
}

export interface ShellOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const HISTORY_KEY = "pagesDocument";
const HISTORY_FRAGMENT = "pagesFragment";
const HISTORY_QUERY = "pagesQuery";

type LoadReason = "revision" | "document" | "reload" | "history";

export function installShell(win: Window & typeof globalThis, config: ShellConfig, elements: ShellElements, options: ShellOptions = {}): ShellHandle {
  const doc = win.document;
  const fetchImpl = options.fetchImpl ?? win.fetch.bind(win);
  const now = options.now ?? (() => Date.now());
  const notice = createNotice(elements.notice);
  let state: ShellState = "LOADING";
  let shown: Frame | null = null;
  let incoming: Frame | null = null;
  let incomingReason: LoadReason = "revision";
  /** The newest revision the poll reported that is not shown yet. */
  let latest: PollBody | null = null;
  let fragment = config.navigable ? documentFragment(win.location.hash) : "";
  let failedReloads = 0;
  let settledTimer: ReturnType<typeof setTimeout> | null = null;
  /** The never-drafted fields the old document reported non-empty, by key, for the next restore of the same path. 02 R-K4a */
  const cleared = new Map<string, string[]>();
  let generation = 0;
  /** Storage is the one source of leftovers; the per-session bound counts the drafts too. DESIGN §D.3 */
  const leftoverBound: LeftoverBound = { retentionMs: config.drafts.retentionMs, perSessionBytes: config.drafts.perSessionBytes };

  const store = createDraftStore(win, { session: config.session, retentionMs: config.drafts.retentionMs, perSessionBytes: config.drafts.perSessionBytes, now, onFallback: () => notice.notice(STORAGE_FALLBACK_LINE) });
  const navigator = createNavigator(win);
  const gesture = createReaderGesture(win);
  let voice: Voice | null = null;
  const confirmer = createConfirmer(elements.dialog, {
    otherQuestionOpen: () => voice?.isOpen() ?? false,
    onClosed: () => {
      gesture.closed();
      reconsider();
    },
  });
  if (elements.recorder) {
    voice = createVoice(win, config, buildRecorder(elements.recorder), {
      questionOpen: () => confirmer.isOpen(),
      restoreFocus: () => {
        try {
          shown?.element.focus({ preventScroll: true });
        } catch {
          // Focus is a courtesy.
        }
      },
      setStatus: (text) => notice.notice(text),
      onClosed: () => {
        gesture.closed();
        reconsider();
      },
      fetchImpl,
    });
    voice.onChange(() => {
      void tellVoice();
      reconsider();
    });
  }
  const ownFiles = createOwnFiles(win, config, fetchImpl, confirmer);
  const relay = createRelay({
    config,
    confirmer,
    navigator,
    voice,
    readerGesture: (given) => gesture.decide(given),
    onGranted: () => void poller.pollNow(),
    onAnswered: () => poller.expectChange(),
    onStatus: (text) => (text ? notice.set(text) : notice.clear()),
    onBlockedOpen: (url) => notice.link(BLOCKED_TAB_LINE, url, "Open it"),
    fetchImpl,
  });

  // --- the poll ---------------------------------------------------------------

  const poller = createPoller(win, config, {
    onBody: (body) => onPollBody(body),
    onWorking: (working) => applyWorking(working),
    onSource: (source) => applySource(source),
    onDeleted: () => {
      state = "DELETED";
      store.clearSession();
      if (incoming) cancelIncoming();
      notice.set(DELETED_LINE);
    },
    onUnauthorized: () => notice.set(EXPIRED_LINE),
    onUnreachable: () => notice.set(UNREACHABLE_LINE),
    onReachable: () => {
      if (notice.text() === UNREACHABLE_LINE) notice.clear();
    },
    onExpiring: () => notice.set(EXPIRING_LINE),
  }, fetchImpl);

  function applySource(source: PageSource): void {
    config.source = source;
    for (const frame of [shown, incoming]) if (frame) postTo(frame, sourceState());
  }

  function sourceState(): ShellMessage {
    return { kind: "thread-page:source-state", stale: config.source === "offline", archived: config.source === "archived", reason: config.source === "archived" ? ARCHIVED_LINE : null };
  }

  /** The session's state rides on the poll; the kernel draws whatever the page styles. 05 R2.24–R2.26; U49 */
  function sessionState(): ShellMessage {
    return { kind: "thread-page:session-state", working: config.working, label: config.workingLabel };
  }

  function applyWorking(working: boolean): void {
    if (working === config.working) return;
    config.working = working;
    for (const frame of [shown, incoming]) if (frame) postTo(frame, sessionState());
  }

  async function tellVoice(): Promise<void> {
    const usable = voice ? await voice.usable() : { available: false, reason: config.voice.reason };
    for (const frame of [shown, incoming]) if (frame) postTo(frame, { kind: "thread-page:voice", available: usable.available, reason: usable.reason });
  }

  function onPollBody(body: PollBody): void {
    config.actionToken = body.actionToken;
    config.expiresAt = body.expiresAt;
    config.readMethods = body.readMethods;
    config.empty = body.empty;
    if (JSON.stringify(body.grants) !== JSON.stringify(config.grants)) {
      config.grants = body.grants;
      tellGrants();
    }
    if (body.voice.available !== config.voice.available || body.voice.reason !== config.voice.reason) {
      config.voice = { ...config.voice, available: body.voice.available, reason: body.voice.reason };
      void tellVoice();
    }
    // The token is renewed for every frame of the open path, shown or loading. 05 R2.10; DESIGN P4
    for (const frame of [shown, incoming]) if (frame && frame.target.path === config.documentPath) frame.target.token = body.actionToken;
    if (state === "DELETED" || state === "STOPPED") return;
    const current = shown?.target.revision ?? config.pageRevision;
    if (body.revision === current) {
      if (incoming && incomingReason === "revision" && incoming.target.revision !== body.revision && incoming.target.path === config.documentPath) cancelIncoming();
      if (latest) {
        // The newer version was withdrawn: the page is current again; a later one is announced afresh (NS-4).
        latest = null;
        if (shown) {
          shown.toldUpdate = false;
          postTo(shown, { kind: "thread-page:update", available: false });
        }
        if (state === "DEFERRED") state = "SHOWN";
      }
      return;
    }
    newRevision(body);
  }

  function targetOf(body: PollBody): FrameTarget {
    return { documentUrl: body.documentUrl, path: config.documentPath, query: config.documentQuery, fragment, token: body.actionToken, revision: body.revision, expiresAt: body.expiresAt, source: body.source, empty: body.empty, deferredFiles: body.deferredFiles };
  }

  function newRevision(body: PollBody): void {
    latest = body;
    if (incoming && incoming.target.revision === body.revision) return;
    // An even newer revision while one loads: one swap, not two (DESIGN §D.1; NS-5).
    if (incoming && incomingReason === "revision") cancelIncoming();
    reconsider();
  }

  /** A hold is told to the kernel once per deferred revision. */
  function defer(): void {
    if (!shown) return;
    if (incoming && incomingReason === "revision") cancelIncoming();
    if (state === "SHOWN" || state === "INCOMING") state = "DEFERRED";
    if (!shown.toldUpdate) {
      shown.toldUpdate = true;
      postTo(shown, { kind: "thread-page:update", available: true });
    }
  }

  // --- the deferred swap ----------------------------------------------------------------

  /**
   * What holds a new revision back: typing within `swapIdleMs`, a pending
   * submission, `setDirty(true)` (or a deferring embed), an open dialog or
   * recorder. Hidden, only what cannot be interrupted holds: the reader is
   * not looking at their typing. 05 R2.21; U49
   */
  function held(frame: Frame): boolean {
    const dialogOpen = confirmer.isOpen() || (voice?.isOpen() ?? false);
    if (frame.pending > 0 || dialogOpen) return true;
    if (doc.visibilityState === "hidden") return false;
    return frame.typing || frame.dirty || frame.embedDirty;
  }

  /** Re-evaluated on every signal: a hold cancels a revision load, its lifting starts one. */
  function reconsider(): void {
    if (!shown || !latest || state === "DELETED" || state === "STOPPED" || state === "RELOAD") return;
    if (held(shown)) {
      // Deferred, not loaded: a deferred revision is not kept loaded. 05 R2.18a, R2.21
      defer();
      return;
    }
    if (incoming) return;
    startIncoming(targetOf(latest), "revision");
  }

  // --- frames -----------------------------------------------------------------

  function frameContext(frame: Frame): FrameContext {
    return {
      token: () => frame.target.token,
      readMethods: () => config.readMethods,
      isShown: () => frame.shown,
      whenShown: (work) => {
        if (frame.shown) work();
        else frame.queue.push(work);
      },
      post: (message) => void postTo(frame, message),
    };
  }

  function schedule(frame: Frame, ms: number, work: () => void): void {
    const timer = setTimeout(() => {
      if (!frame.cancelled) work();
    }, ms);
    frame.timers.push(timer);
  }

  /** Pinged at the load and `reloadPingMs` later; taken for gone only when neither is answered within `reloadWaitMs`. 05 R2.18d */
  function watchLiveness(frame: Frame): void {
    const first = ++frame.pinged;
    postTo(frame, { kind: "thread-page:ping", nonce: first });
    schedule(frame, config.reload.pingMs, () => {
      if (frame.answered < first) postTo(frame, { kind: "thread-page:ping", nonce: ++frame.pinged });
    });
    schedule(frame, config.reload.waitMs, () => {
      if (frame.answered >= first) return;
      void reloadShown();
    });
  }

  /** Waits for `flushed` up to `draftFlushMs`; drafts received meanwhile are stored. DESIGN §D.1 */
  function flushFrame(frame: Frame): Promise<void> {
    if (!frame.port) return Promise.resolve();
    return new Promise((resolve) => {
      const nonce = ++frame.nonce;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      flushWaiters.set(frame, { nonce, finish });
      setTimeout(finish, config.drafts.flushMs);
      postTo(frame, { kind: "thread-page:flush", nonce });
    });
  }
  const flushWaiters = new Map<Frame, { nonce: number; finish: () => void }>();

  function restoreMessage(frame: Frame, sameDocument: boolean): ShellMessage {
    const drafts = store.forDocument(frame.target.path);
    frame.handed = new Map(drafts.map((record) => [record.form.key, record]));
    const clearedNotice = [...cleared.entries()].filter(([key]) => key.startsWith(`${frame.target.path}:`)).map(([key, fields]) => ({ form: { key: key.slice(frame.target.path.length + 1) }, fields }));
    cleared.clear();
    const message: ShellMessage = { kind: "thread-page:restore", nonce: ++frame.nonce, scroll: sameDocument ? (shown?.scroll ?? null) : null, drafts, clearedNotice };
    // The built-in home page alone lists what no page could restore; a designated agent page never sees it. 05 R-S12, R3.7a (NS-1)
    if (config.builtinHome) message.leftovers = readAllLeftovers(win, config.drafts.retentionMs, now());
    return message;
  }

  /** CONNECTING: accept the port, send source, session state, voice and restore, wait `restored`. DESIGN §D.1 */
  function connect(frame: Frame, port: MessagePort): void {
    frame.port = port;
    frame.connected = true;
    port.onmessage = (event) => onFrameMessage(frame, event.data as unknown);
    port.start?.();
    postTo(frame, sourceState());
    postTo(frame, sessionState());
    void tellVoice();
    if (config.builtinHome) postTo(frame, { kind: "thread-page:grants", grants: config.grants });
    const sameDocument = frame !== shown && shown !== null && shown.target.path === frame.target.path;
    postTo(frame, restoreMessage(frame, sameDocument || frame === shown));
    watchLiveness(frame);
    if (frame === shown) {
      state = "CONNECTING";
      // The first frame is visible from the start; it is "shown" to the relay once restored, or at the timeout.
      schedule(frame, config.refreshSwapMs, () => {
        if (!frame.shown) markShown(frame);
      });
    }
  }

  function markShown(frame: Frame): void {
    if (frame.shown) return;
    frame.shown = true;
    state = "SHOWN";
    postTo(frame, { kind: "thread-page:shown" });
    const queue = frame.queue;
    frame.queue = [];
    for (const work of queue) work();
    try {
      frame.element.focus({ preventScroll: true });
    } catch {
      // Focus is a courtesy.
    }
    reconcileLeftovers(frame);
    settle(frame);
    reconsider();
  }

  /** The reload counter clears once a document has kept answering for `reloadLoopClearMs`. 05 R2.18d */
  function settle(frame: Frame): void {
    if (settledTimer !== null) clearTimeout(settledTimer);
    settledTimer = setTimeout(() => {
      settledTimer = null;
      if (shown === frame && frame.answered > 0) failedReloads = 0;
    }, config.reload.clearMs);
  }

  function startIncoming(target: FrameTarget, reason: LoadReason): void {
    if (incoming) cancelIncoming();
    const previous = shown;
    const turn = ++generation;
    const begin = () => {
      if (turn !== generation || state === "DELETED") return;
      // A hold that began during the flush defers the revision instead of loading it under the reader (NS-2).
      if (reason === "revision" && shown && held(shown)) {
        defer();
        return;
      }
      const frame = createFrame(doc, target, true);
      incoming = frame;
      incomingReason = reason;
      state = "INCOMING";
      elements.frameHost.appendChild(frame.element);
      // Until the incoming document confirms, the old one stays shown; at the timeout it is shown as it is. A162; DR-11
      schedule(frame, config.refreshSwapMs, () => {
        if (incoming !== frame) return;
        if (reason === "revision" && shown && held(shown)) {
          defer();
          return;
        }
        swap(frame, true);
      });
      schedule(frame, config.reload.waitMs, () => {
        if (incoming === frame && !frame.connected) void reloadShown();
      });
      if (reason !== "revision") {
        applyTarget(target);
        if (reason === "document") notice.clear();
      }
    };
    if (previous?.port) void flushFrame(previous).then(begin);
    else begin();
  }

  function cancelIncoming(): void {
    const frame = incoming;
    if (!frame) return;
    incoming = null;
    discard(frame);
    if (state === "INCOMING") state = shown ? "SHOWN" : "LOADING";
  }

  function applyTarget(target: FrameTarget): void {
    config.actionToken = target.token;
    config.pageRevision = target.revision;
    config.expiresAt = target.expiresAt;
    config.documentUrl = target.documentUrl;
    config.documentPath = target.path;
    config.documentQuery = target.query;
    config.source = target.source;
    config.empty = target.empty;
    config.deferredFiles = target.deferredFiles;
    fragment = target.fragment;
  }

  /** SWAP, one task: the incoming frame up, the old one gone, `shown` sent, the token swapped. DESIGN §D.1 */
  function swap(frame: Frame, byTimeout: boolean): void {
    if (incoming !== frame) return;
    incoming = null;
    clearTimers(frame);
    const previous = shown;
    show(frame.element);
    if (previous) discard(previous);
    shown = frame;
    applyTarget(frame.target);
    if (latest && latest.revision === frame.target.revision) latest = null;
    // Hidden, the frames never ran and the reader is not looking: nothing to say (NS-11).
    if (byTimeout && !frame.restored && doc.visibilityState !== "hidden") notice.set(STILL_LOADING);
    else if (notice.text() === STILL_LOADING) notice.clear();
    markShown(frame);
    poller.retarget();
    if (frame.connected) {
      // The liveness timers were cleared with the swap; the shown document is watched afresh. 05 R2.18d
      watchLiveness(frame);
    } else {
      schedule(frame, config.reload.waitMs, () => {
        if (!frame.connected) void reloadShown();
      });
    }
  }

  // --- messages from a frame ------------------------------------------------------

  function onFrameMessage(frame: Frame, data: unknown): void {
    if (frame.cancelled || !isKernelMessage(data)) return;
    if (!("kind" in data)) {
      relay.bridge(frameContext(frame), data);
      return;
    }
    const message: KernelMessage = data;
    switch (message.kind) {
      case "thread-page:pong":
        frame.answered = Math.max(frame.answered, message.nonce);
        return;
      case "thread-page:restored":
        frame.restored = true;
        if (incoming === frame) {
          // A hold raised while it loaded: the loaded revision is dropped and fetched again on release (R2.18a; NS-2).
          if (incomingReason === "revision" && shown && held(shown)) defer();
          else swap(frame, false);
        }
        else if (shown === frame) {
          if (!frame.shown) markShown(frame);
          else if (notice.text() === STILL_LOADING) notice.clear();
        }
        return;
      case "thread-page:flushed": {
        const waiter = flushWaiters.get(frame);
        if (waiter && waiter.nonce === message.nonce) {
          flushWaiters.delete(frame);
          waiter.finish();
        }
        return;
      }
      case "thread-page:scroll":
        frame.scroll = message.state;
        return;
      case "thread-page:draft":
        onDraft(frame, message);
        return;
      case "thread-page:dirty":
        // Reader input alone no longer holds a swap; `setDirty(true)` does until `setDirty(false)`. U49
        frame.dirty = message.custom;
        if (frame === shown) reconsider();
        return;
      case "thread-page:clean":
        frame.dirty = false;
        if (frame === shown) reconsider();
        return;
      case "thread-page:typing":
        frame.typing = message.active;
        if (frame === shown) reconsider();
        return;
      case "thread-page:embed-dirty":
        frame.embedDirty = message.dirty;
        if (frame === shown) reconsider();
        return;
      case "thread-page:submit":
        frameContext(frame).whenShown(() => {
          frame.pending += 1;
          void relaySubmit({ config, token: () => frame.target.token, fetchImpl, voice, onAnswered: () => poller.expectChange() }, (reply) => {
            if ("kind" in reply && reply.kind === "thread-page:submit-result") {
              frame.pending = Math.max(0, frame.pending - 1);
              postTo(frame, reply);
              if (frame === shown) reconsider();
              return;
            }
            postTo(frame, reply);
          }, message);
        });
        return;
      case "thread-page:open-document":
        frameContext(frame).whenShown(() => {
          const query = checkDocumentQuery(message.query);
          if (!query.ok) {
            notice.notice(`That link cannot be opened: ${query.message}.`);
            return;
          }
          void openDocument(message.path, true, documentFragment(message.fragment), query.query);
        });
        return;
      case "thread-page:open-file":
        frameContext(frame).whenShown(() => ownFiles.open(message.path, message.download, message.name));
        return;
      case "thread-page:file-request":
        void ownFiles.fetchFor((reply) => void postTo(frame, reply), message);
        return;
      case "thread-page:fragment":
        if (frame === shown) onFragment(documentFragment(message.fragment), message.step === true);
        return;
      case "thread-page:record":
        relay.record(frameContext(frame), message);
        return;
      case "thread-page:escape":
        voice?.cancel();
        return;
      case "thread-page:draft-discard":
        // Only the built-in home page, the host's own document, may discard a draft; an agent's page never. 05 R-S12 (NS-1)
        if (!config.builtinHome) return;
        discardLeftover(win, message, leftoverBound);
        tellLeftovers();
        return;
      case "thread-page:grant-revoke":
        if (!config.builtinHome) return;
        frameContext(frame).whenShown(() => void revokeGrant(message.from, message.to));
        return;
      default:
        return;
    }
  }

  // --- drafts ---------------------------------------------------------------------

  function onDraft(frame: Frame, message: Extract<KernelMessage, { kind: "thread-page:draft" }>): void {
    const path = message.embed ? message.embed.documentPath : frame.target.path;
    const session = message.embed ? message.embed.sessionId : config.session;
    const record: DraftRecord = { form: message.form, fields: message.fields, focus: message.focus, savedAtMs: now(), revision: frame.target.revision };
    if (message.cleared.length > 0 && !message.embed) cleared.set(`${path}:${message.form.key}`, message.cleared);
    if (message.embed) {
      // An embedded document's drafts are keyed by the embedded session and path. DESIGN §D.3
      const other = createDraftStore(win, { session, retentionMs: config.drafts.retentionMs, perSessionBytes: config.drafts.perSessionBytes, now });
      for (const text of other.put(path, record)) postTo(frame, { kind: "thread-page:draft-notice", text });
      return;
    }
    const handed = frame.handed.get(message.form.key);
    if (handed) {
      frame.handed.delete(message.form.key);
      for (const [field, value] of Object.entries(handed.fields)) {
        const reported = message.fields[field];
        // The page filled the field over the reader's text: the text goes to storage for the home page, by id. DESIGN §D.3
        if (JSON.stringify(reported) !== JSON.stringify(value) && typeof value === "string" && value !== "" && !config.builtinHome) {
          for (const text of addLeftover(win, { session: config.session, documentPath: path, key: message.form.key, label: leftoverLabel(message.form.key), field, value, reason: "field-filled", atMs: now() }, leftoverBound)) postTo(frame, { kind: "thread-page:draft-notice", text });
        }
      }
      reconcileLeftovers(frame);
    }
    for (const text of store.put(path, record)) postTo(frame, { kind: "thread-page:draft-notice", text });
  }

  /** The handed records the kernel did not report back, as the store holds them now: a field the reader discarded from the home is gone from the record and is not listed again. DESIGN §D.3 */
  function leftoversOf(frame: Frame): LeftoverDraft[] {
    const stored = new Map(store.forDocument(frame.target.path).map((record) => [record.form.key, record]));
    const notRestored: LeftoverDraft[] = [];
    for (const key of frame.handed.keys()) {
      const record = stored.get(key);
      if (!record) continue;
      for (const [field, value] of Object.entries(record.fields)) {
        if (typeof value === "string" && value !== "") notRestored.push({ session: config.session, documentPath: frame.target.path, key, label: leftoverLabel(key), field, value, reason: "not-on-this-version", atMs: record.savedAtMs });
      }
    }
    return notRestored;
  }

  /** Storage holds the list; this frame's document's entries are replaced, the rest kept (NS-3). The built-in home keeps none. */
  function reconcileLeftovers(frame: Frame): void {
    if (config.builtinHome) return;
    for (const text of setDocumentLeftovers(win, config.session, frame.target.path, leftoversOf(frame), leftoverBound)) postTo(frame, { kind: "thread-page:draft-notice", text });
  }

  function tellLeftovers(): void {
    if (shown) postTo(shown, { kind: "thread-page:drafts", leftovers: readAllLeftovers(win, config.drafts.retentionMs, now()) });
  }

  // --- the home's grants --------------------------------------------------------------

  function tellGrants(): void {
    if (!config.builtinHome) return;
    for (const frame of [shown, incoming]) if (frame) postTo(frame, { kind: "thread-page:grants", grants: config.grants });
  }

  async function revokeGrant(from: string, to: string): Promise<void> {
    const body: ChromeActionBody = { actionToken: config.actionToken, action: "revokeGrant", target: to, from };
    try {
      const response = await fetchImpl(config.routes.chromeAction, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const answer = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isRecord(answer) || answer.ok !== true) throw new Error((isRecord(answer) && typeof answer.message === "string" && answer.message) || `Request failed (${response.status})`);
      config.grants = config.grants.filter((grant: GrantSummary) => !(grant.from === from && grant.sessionId === to));
      tellGrants();
      void poller.pollNow();
    } catch (error) {
      notice.notice(error instanceof Error ? error.message : "Could not revoke");
    }
  }

  // --- the handshake ---------------------------------------------------------------

  win.addEventListener("message", (event) => {
    const data = event.data as unknown;
    if (!isReadyMessage(data)) return;
    const from = shown && event.source === shown.element.contentWindow ? shown : incoming && event.source === incoming.element.contentWindow ? incoming : null;
    if (!from) return;
    if (from.connected) {
      // A load the shell did not make: the document navigated itself. 05 R2.18d, D44
      if (from === shown) void reloadShown();
      return;
    }
    const port = event.ports.length === 1 ? event.ports[0] : undefined;
    if (!port) return;
    connect(from, port);
    if (from === shown && data.pageRevision !== from.target.revision) void poller.pollNow();
  });

  // --- reload, exchange, history -----------------------------------------------------

  async function documentSession(path: string, query: string): Promise<FrameTarget | string> {
    const body: DocumentSessionBody = { actionToken: config.actionToken, path, query };
    try {
      const response = await fetchImpl(config.routes.documentSession, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const answer = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isRecord(answer) || answer.ok !== true || typeof answer.actionToken !== "string" || typeof answer.pageRevision !== "string" || typeof answer.documentUrl !== "string" || typeof answer.path !== "string" || typeof answer.expiresAt !== "number") {
        return (isRecord(answer) && typeof answer.message === "string" && answer.message) || "That page could not be opened";
      }
      const source = answer.source === "offline" || answer.source === "archived" ? answer.source : "live";
      return { documentUrl: answer.documentUrl, path: answer.path, query: typeof answer.query === "string" ? answer.query : "", fragment: "", token: answer.actionToken, revision: answer.pageRevision, expiresAt: answer.expiresAt, source, empty: answer.empty === true, deferredFiles: Array.isArray(answer.deferredFiles) ? answer.deferredFiles.filter((item): item is string => typeof item === "string") : [] };
    } catch {
      return "The host could not be reached";
    }
  }

  let reloading = false;
  /** RELOAD: the open document again in a fresh frame, or STOPPED after too many in a row. 05 R2.18d */
  async function reloadShown(): Promise<void> {
    if (reloading || state === "DELETED") return;
    if (failedReloads >= config.reload.loopCount) {
      state = "STOPPED";
      if (shown) {
        try {
          shown.port?.close();
        } catch {
          // ignore
        }
        shown.port = null;
      }
      notice.set(STOPPED_LINE);
      return;
    }
    failedReloads += 1;
    reloading = true;
    try {
      if (!config.navigable) {
        win.location.reload();
        return;
      }
      state = "RELOAD";
      const target = await documentSession(config.documentPath, config.documentQuery);
      if (typeof target === "string") {
        win.location.reload();
        return;
      }
      target.fragment = fragment;
      startIncoming(target, "reload");
    } finally {
      reloading = false;
    }
  }

  function shellAddress(path: string, query: string): string {
    const url = new URL(win.location.href);
    for (const name of [...url.searchParams.keys()]) if (name !== "session") url.searchParams.delete(name);
    const value = path === ENTRY_DOCUMENT && !query ? "" : `${path}${query}`;
    if (value) url.searchParams.set("path", value);
    return `${url.pathname}${url.search}${fragment}`;
  }

  function historyState(): Record<string, string> {
    return { [HISTORY_KEY]: config.documentPath, [HISTORY_FRAGMENT]: fragment, [HISTORY_QUERY]: config.documentQuery };
  }

  function onFragment(next: string, step: boolean): void {
    if (!config.navigable || next === fragment) return;
    fragment = next;
    try {
      if (step) win.history.pushState(historyState(), "", shellAddress(config.documentPath, config.documentQuery));
      else win.history.replaceState(historyState(), "", shellAddress(config.documentPath, config.documentQuery));
    } catch {
      // The address is a courtesy.
    }
  }

  /** EXCHANGE: a link to another document of the page, or history. DESIGN §D.1 */
  async function openDocument(path: string, push = true, nextFragment = "", nextQuery = ""): Promise<boolean> {
    if (!config.navigable || !isDocumentPath(path)) return false;
    if (path === config.documentPath && nextQuery === config.documentQuery) {
      if (nextFragment !== fragment) {
        // The same document at another place: the frame moves there itself; the shell only follows. 01 R1.12f
        const target = await documentSession(path, nextQuery);
        if (typeof target === "string") return false;
        target.fragment = nextFragment;
        fragment = nextFragment;
        startIncoming(target, "document");
        if (push) win.history.pushState(historyState(), "", shellAddress(path, nextQuery));
        return true;
      }
      return false;
    }
    const target = await documentSession(path, nextQuery);
    if (typeof target === "string") {
      notice.notice(target);
      return false;
    }
    target.fragment = nextFragment;
    fragment = nextFragment;
    latest = null;
    startIncoming(target, push ? "document" : "history");
    if (push) {
      try {
        win.history.pushState(historyState(), "", shellAddress(path, nextQuery));
      } catch {
        // ignore
      }
    }
    return true;
  }

  if (config.navigable) {
    try {
      win.history.replaceState(historyState(), "", shellAddress(config.documentPath, config.documentQuery));
    } catch {
      // A history the shell cannot write only loses back and forward.
    }
    win.addEventListener("popstate", (event) => {
      const entry = event.state as unknown;
      if (!isRecord(entry) || typeof entry[HISTORY_KEY] !== "string") return;
      const query = checkDocumentQuery(entry[HISTORY_QUERY]);
      void openDocument(entry[HISTORY_KEY], false, documentFragment(entry[HISTORY_FRAGMENT]), query.ok ? query.query : "");
    });
  }

  // While hidden the reader is not looking: typing and dirt no longer hold a deferred revision. DESIGN §D.1 DEFERRED
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden" && shown) void flushFrame(shown);
    reconsider();
  });

  // The built-in home page follows the drafts other tabs leave behind; a page only prunes its own list when another tab changed it — never re-adds, so two tabs converge (NS-14). 05 R-S12
  win.addEventListener("storage", (event) => {
    if (event.key !== null && !event.key.startsWith(LEFTOVERS_PREFIX) && !event.key.startsWith("up:draft")) return;
    if (config.builtinHome) tellLeftovers();
    else if (shown && shown.shown) pruneDocumentLeftovers(win, config.session, shown.target.path, leftoverBound);
  });

  // --- start ---------------------------------------------------------------------

  const first = createFrame(doc, { documentUrl: config.documentUrl, path: config.documentPath, query: config.documentQuery, fragment, token: config.actionToken, revision: config.pageRevision, expiresAt: config.expiresAt, source: config.source, empty: config.empty, deferredFiles: config.deferredFiles }, false);
  shown = first;
  elements.frameHost.appendChild(first.element);
  schedule(first, config.reload.waitMs, () => {
    if (!first.connected) void reloadShown();
  });
  poller.start();

  return {
    state: () => state,
    shownFrame: () => shown?.element ?? null,
    incomingFrame: () => incoming?.element ?? null,
    poller,
    notice,
    store,
    confirmer,
    voice,
    openDocument,
  };
}
