// `threadPage.embed`: frame creation, sandbox/allow set on every load, `pages.read` batching (16 per call), cadence, the deferred refresh (typing, a pending answer, `setDirty` — U49), session state forwarded, grant cooldown, per-embed budget, the message relay (R4.48 allow-list), `onState`, drafts forwarding (02 §Embedded pages).
import { ENTRY_DOCUMENT, isDocumentPath } from "../../domain/document-path.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { isSessionId } from "../../domain/ids.ts";
import { LIMITS } from "../../domain/limits.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../../domain/sandbox.ts";
import type { DraftRecord } from "../shared/drafts.ts";
import { isKernelMessage, isReadyMessage, isRecord, makeFailure, type BridgeRequestMessage, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import type { ScrollState } from "../shared/scroll-state.ts";
import { embeddedRoster, GESTURE_WINDOW_MS, relayCall, RelayRefusal, type EmbedView } from "./embed-relay.ts";
import type { KernelPrimitives } from "./primitives.ts";
import type { RecordAnswer } from "./record-client.ts";

export type EmbedStatus = "loading" | "shown" | "not_found" | "no_page" | "too_large" | "unavailable" | "nested";

export interface EmbedState {
  status: EmbedStatus;
  sessionId: string;
  path: string;
  title: string | null;
  revision: string | null;
  working: boolean;
  readOnly: boolean;
  updateAvailable: boolean;
}

export interface EmbedOptions {
  sessionId: string;
  path?: string;
  onState?: (state: EmbedState) => void;
}

export interface EmbedManagerDeps {
  invoke(method: string, params?: unknown): Promise<unknown>;
  /** Whether any embed is holding its refresh (typing, a pending answer, `setDirty(true)`): the page counts as dirty toward its shell meanwhile. 02 R4.47; U49 */
  setDirty(dirty: boolean): void;
  /** The host's working label, as this page's shell told it; forwarded with each embed's own state. 05 R2.26 */
  workingLabel(): string;
  /** This document is itself shown inside another page. 02 R4.52 */
  embedded: boolean;
  /** Forwards to the shell: drafts with `embed` set, Dictate asks, Escape. */
  send(message: KernelMessage): void;
  dictate(prompt: string, fromControl: boolean): Promise<RecordAnswer>;
  voiceAvailable(): boolean;
  prim: KernelPrimitives;
}

export interface EmbedManager {
  embed(target: unknown, options: unknown): () => void;
  setVoice(available: boolean): void;
  /** The host's label changed: every embed hears its own state again. */
  setWorkingLabel(): void;
  /** A shell `draft-notice` or similar the embedding kernel may pass on; unused for now. */
  stopAll(): void;
}

export const EMBED_SANDBOX = PAGE_SANDBOX;
export const EMBEDDED_FILES_REFUSAL = "Files cannot be attached from inside another page. Open this page on its own to send them.";

const PLACEHOLDERS: Record<Exclude<EmbedStatus, "loading" | "shown">, string> = {
  not_found: "This page is not available: its session was deleted or never had a page.",
  no_page: "This session has not written its page yet. It appears here as soon as the agent saves it.",
  too_large: "This page is too large to show inside another page. Open it on its own.",
  unavailable: "This page cannot be reached right now. It appears here when it can.",
  nested: "A page shown inside another page does not show further pages. Open this page on its own to see them.",
};
const TOO_MANY = `This page already shows ${LIMITS.embedsPerPage} other pages, which is the most one page can.`;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export function placeholderDocument(text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font:14px/1.5 system-ui,sans-serif;color:GrayText;background:Canvas}p{margin:0;padding:1rem;max-width:30rem;text-align:center}</style></head><body><p>${escapeText(text)}</p></body></html>`;
}

interface Embed extends EmbedView {
  readonly frame: HTMLIFrameElement;
  readonly created: boolean;
  readonly onState: ((state: EmbedState) => void) | null;
  path: string;
  status: EmbedStatus;
  latest: string | null;
  working: boolean;
  /** The embedded page called `setDirty(true)` (counted once the reader acted in the page). 02 R4.47 */
  dirty: boolean;
  /** The reader is typing in the embed. U49 */
  typing: boolean;
  /** Answers in flight from the embed. */
  pending: number;
  updateAvailable: boolean;
  reload: boolean;
  port: MessagePort | null;
  scroll: ScrollState | null;
  /** The embedded document's drafts, by key, kept for its next load. 02 R4.46 */
  drafts: Map<string, DraftRecord>;
  calls: number[];
  answeredUntil: number;
  declinedUntil: number;
  stopped: boolean;
  inert: boolean;
  lastState: string;
  nonce: number;
}

export function createEmbedManager(win: Window & typeof globalThis, deps: EmbedManagerDeps): EmbedManager {
  const doc = win.document;
  const prim = deps.prim;
  const embeds: Embed[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reading = false;
  let rotation = 0;
  let listening = false;
  let roster: Promise<Record<string, unknown>[]> | null = null;

  function report(embed: Embed): void {
    if (!embed.onState) return;
    const state: EmbedState = { status: embed.status, sessionId: embed.sessionId, path: embed.path, title: embed.title, revision: embed.revision, working: embed.working, readOnly: embed.readOnly, updateAvailable: embed.updateAvailable };
    const print = JSON.stringify(state);
    if (print === embed.lastState) return;
    embed.lastState = print;
    try {
      embed.onState(state);
    } catch {
      // An author's callback cannot break the embed. 02 R4.53
    }
  }

  /** What holds an embed's refresh, the page-level rule applied inside it. 02 R4.46; U49 */
  function deferring(embed: Embed): boolean {
    return embed.typing || embed.dirty || embed.pending > 0;
  }

  function syncDirty(): void {
    deps.setDirty(embeds.some((embed) => !embed.stopped && deferring(embed)));
  }

  /** A deferred version is taken as soon as nothing holds it. */
  function reconsider(embed: Embed): void {
    syncDirty();
    if (embed.updateAvailable && !deferring(embed) && !embed.reload) {
      embed.reload = true;
      soon();
    }
  }

  function tellSession(embed: Embed): void {
    reply(embed, { kind: "thread-page:session-state", working: embed.working, label: deps.workingLabel() });
  }

  /** The frame is configured by the kernel on every load, taken out of the document so no history entry is added. 02 R4.43 */
  function load(embed: Embed, html: string): void {
    embed.port?.close?.();
    embed.port = null;
    const frame = embed.frame;
    const parent = frame.parentNode;
    const next = frame.nextSibling;
    if (parent) parent.removeChild(frame);
    frame.removeAttribute("src");
    frame.removeAttribute("name");
    frame.removeAttribute("csp");
    frame.setAttribute("allow", PAGE_FRAME_ALLOW);
    frame.setAttribute("sandbox", EMBED_SANDBOX);
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc = html;
    if (parent) parent.insertBefore(frame, next);
  }

  function placeholder(embed: Embed, status: Exclude<EmbedStatus, "loading" | "shown">, text = PLACEHOLDERS[status]): void {
    const changed = embed.status !== status || embed.revision !== null;
    embed.status = status;
    embed.revision = null;
    embed.latest = null;
    embed.answerToken = null;
    embed.dirty = false;
    embed.typing = false;
    embed.pending = 0;
    embed.updateAvailable = false;
    if (changed) load(embed, placeholderDocument(text));
    syncDirty();
    report(embed);
  }

  function show(embed: Embed, entry: Record<string, unknown>): void {
    embed.status = "shown";
    embed.revision = entry.revision as string;
    embed.latest = embed.revision;
    embed.answerToken = typeof entry.answerToken === "string" ? entry.answerToken : null;
    embed.dirty = false;
    embed.typing = false;
    embed.pending = 0;
    embed.updateAvailable = false;
    embed.reload = false;
    load(embed, entry.html as string);
    syncDirty();
    report(embed);
  }

  function describe(embed: Embed, entry: Record<string, unknown>): void {
    if (typeof entry.title === "string") embed.title = entry.title;
    embed.workspaceId = typeof entry.workspaceId === "string" ? entry.workspaceId : null;
    const working = entry.working === true;
    const readOnly = entry.readOnly === true;
    const changed = working !== embed.working || readOnly !== embed.readOnly;
    embed.working = working;
    embed.readOnly = readOnly;
    if (changed && embed.port) {
      tellSession(embed);
      reply(embed, { kind: "thread-page:source-state", stale: false, archived: embed.readOnly, reason: null });
    }
  }

  function apply(embed: Embed, entry: Record<string, unknown>): void {
    if (embed.stopped || entry.deferred === true) return;
    if (isRecord(entry.error)) {
      const reason = entry.error.reason;
      placeholder(embed, reason === "no_page" ? "no_page" : reason === "too_large" ? "too_large" : reason === "unreachable" ? "unavailable" : "not_found");
      return;
    }
    describe(embed, entry);
    if (entry.unchanged === true) {
      if (embed.latest === embed.revision && typeof entry.answerToken === "string") embed.answerToken = entry.answerToken;
      report(embed);
      return;
    }
    if (typeof entry.revision !== "string" || typeof entry.html !== "string") return;
    // Never under a reader who is typing, answering or mid-flow: deferred inside the embed until they pause. 02 R4.46; U49
    if (deferring(embed) && embed.revision !== null && !embed.reload) {
      embed.latest = entry.revision;
      if (!embed.updateAvailable) {
        embed.updateAvailable = true;
        reply(embed, { kind: "thread-page:update", available: true });
      }
      report(embed);
      return;
    }
    show(embed, entry);
  }

  function active(): Embed[] {
    return embeds.filter((embed) => !embed.stopped && !embed.inert);
  }

  function schedule(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (active().length === 0 || doc.visibilityState === "hidden") return;
    timer = setTimeout(() => void tick(), delay);
  }

  /** One `pages.read` per tick for up to 16 embeds; more take turns. 02 R4.44 */
  async function tick(): Promise<void> {
    timer = null;
    if (reading || doc.visibilityState === "hidden") return;
    const all = active();
    if (all.length === 0) return;
    reading = true;
    const size = LIMITS.pagesReadEntries;
    if (rotation >= all.length) rotation = 0;
    const batch = all.slice(rotation, rotation + size);
    rotation = rotation + size >= all.length ? 0 : rotation + size;
    let again = rotation !== 0;
    try {
      const pages = batch.map((embed) => ({ sessionId: embed.sessionId, ...(embed.path === ENTRY_DOCUMENT ? {} : { path: embed.path }), ...(embed.latest && !embed.reload ? { ifNoneMatch: embed.latest } : {}) }));
      const result = (await deps.invoke("pages.read", { pages })) as { pages?: unknown };
      const entries = Array.isArray(result?.pages) ? result.pages : [];
      batch.forEach((embed, index) => {
        const entry = entries[index];
        if (!isRecord(entry) || entry.sessionId !== embed.sessionId) return;
        if (entry.path !== undefined && entry.path !== embed.path) return;
        if (entry.deferred === true) again = true;
        apply(embed, entry);
      });
    } catch {
      for (const embed of batch) if (embed.status === "loading") report(embed);
    } finally {
      reading = false;
      const now = Date.now();
      const lively = active().some((embed) => embed.working || embed.answeredUntil > now || embed.status === "loading");
      schedule(again ? 250 : lively ? LIMITS.embedPollWorkingMs : LIMITS.embedPollMs);
    }
  }

  function soon(): void {
    if (!reading) schedule(0);
  }

  function reply(embed: Embed, message: ShellMessage): void {
    try {
      if (embed.port) prim.post(embed.port, message);
    } catch {
      // The frame went away.
    }
  }

  function fail(embed: Embed, id: unknown, error: unknown): void {
    const code = (isRecord(error) && typeof error.code === "string" ? error.code : "handler_error") as BridgeErrorCode;
    // A declared reason and its detail reach the embedded page as they would on its own URL (`settings_unsupported` names its fields there). RS-5
    const reason = isRecord(error) && typeof error.reason === "string" ? error.reason : undefined;
    reply(embed, makeFailure(id, code, error instanceof Error && error.message ? error.message : "Request failed", reason, reason !== undefined && isRecord(error) ? error.detail : undefined));
  }

  function ownRoster(): Promise<Record<string, unknown>[]> {
    roster ??= deps.invoke("context.get").then(
      (value) => (isRecord(value) && Array.isArray(value.capabilities) ? value.capabilities.filter(isRecord) : []),
      (error: unknown) => {
        roster = null;
        throw error;
      },
    );
    return roster;
  }

  async function answer(embed: Embed, body: Record<string, unknown>): Promise<unknown> {
    if (!embed.answerToken) throw new RelayRefusal("unavailable", "This page is still loading; try again in a moment.");
    // The reader declined a grant a moment ago: the embed may not put the question straight back up. 02 R4.49
    if (Date.now() < embed.declinedUntil) throw new RelayRefusal("cancelled", "You did not allow this page to send answers there. Try again in a moment.");
    charge(embed);
    try {
      const sent = await deps.invoke("pages.answer", { answerToken: embed.answerToken, ...body });
      embed.answeredUntil = Date.now() + LIMITS.embedPollAfterAnswerMs;
      soon();
      return sent;
    } catch (error) {
      if (isRecord(error) && error.code === "cancelled") embed.declinedUntil = Date.now() + LIMITS.declinedCooldownMs;
      if (isRecord(error) && (error.code === "stale_page" || error.code === "confirmation_invalid")) {
        if (error.code === "confirmation_invalid") embed.latest = null;
        soon();
      }
      throw error;
    }
  }

  /** One budget for everything an embed can make this page spend: charged when a call leaves the kernel, so a call the relay refuses counts nothing. 02 R4.49 */
  function atBound(embed: Embed): boolean {
    const now = Date.now();
    embed.calls = embed.calls.filter((at) => now - at < 60_000);
    return embed.calls.length >= LIMITS.embedCallsPerMinute;
  }
  function charge(embed: Embed): void {
    embed.calls.push(Date.now());
  }
  const RATE_LIMITED = "Too many requests from this embedded page; try again shortly.";

  async function bridge(embed: Embed, request: BridgeRequestMessage): Promise<void> {
    if (atBound(embed)) {
      reply(embed, makeFailure(request.id, "rate_limited", RATE_LIMITED));
      return;
    }
    try {
      const invoke = (method: string, params?: unknown): Promise<unknown> => {
        charge(embed);
        return deps.invoke(method, params);
      };
      const result = await relayCall(embed, request.method, request.params, { invoke, roster: ownRoster, now: () => Date.now(), answer: (view, body) => answer(view as Embed, body) });
      reply(embed, { v: 1, id: request.id, ok: true, result });
    } catch (error) {
      fail(embed, request.id, error);
    }
  }

  async function submit(embed: Embed, data: Extract<KernelMessage, { kind: "thread-page:submit" }>): Promise<void> {
    const submissionId = data.submissionId;
    embed.pending += 1;
    syncDirty();
    try {
      if (atBound(embed)) throw new RelayRefusal("rate_limited", RATE_LIMITED);
      // Uploads take the shell's token, which names the embedding page. 02 R4.51
      if (data.files.length > 0) throw new RelayRefusal("unavailable", EMBEDDED_FILES_REFUSAL);
      const sent = (await answer(embed, { form: { submissionId, title: data.title, writtenAgainst: data.writtenAgainst, ...(data.formId !== null ? { formId: data.formId } : {}), ...(data.formTitle !== null ? { formTitle: data.formTitle } : {}), ...(data.action !== null ? { action: data.action } : {}), answers: data.answers } })) as { delivery?: unknown; matchedRevision?: unknown };
      const delivery = sent.delivery === "queued" || sent.delivery === "steered" ? sent.delivery : "started";
      reply(embed, { kind: "thread-page:submit-result", submissionId, ok: true, delivery, ...(typeof sent.matchedRevision === "string" ? { matchedRevision: sent.matchedRevision, revisionChanged: sent.matchedRevision !== data.writtenAgainst } : {}) });
    } catch (error) {
      const code = (isRecord(error) && typeof error.code === "string" ? error.code : "handler_error") as BridgeErrorCode;
      reply(embed, { kind: "thread-page:submit-result", submissionId, ok: false, error: code, message: (error instanceof Error && error.message ? error.message : "Request failed").slice(0, LIMITS.errorMessageChars) });
    } finally {
      embed.pending = Math.max(0, embed.pending - 1);
      if (!embed.stopped) reconsider(embed);
    }
  }

  /** Dictate in an embedded text area: this page's shell records; it counts toward the embed's bound. 02 R4.51a */
  async function record(embed: Embed, data: Extract<KernelMessage, { kind: "thread-page:record" }>): Promise<void> {
    let outcome: RecordAnswer;
    if (data.purpose !== "dictate" || data.control !== true) outcome = { ok: false, code: "unavailable", message: "Only dictation works inside another page." };
    else if (atBound(embed)) outcome = { ok: false, code: "rate_limited", message: RATE_LIMITED };
    else {
      charge(embed);
      outcome = await deps.dictate(data.prompt ?? "", true);
      try {
        embed.frame.focus({ preventScroll: true });
      } catch {
        // Focus is a courtesy.
      }
    }
    if (embed.stopped) return;
    reply(embed, outcome.ok ? { kind: "thread-page:recorded", id: data.id, ok: true, ...(outcome.text !== undefined ? { text: outcome.text } : {}) } : { kind: "thread-page:recorded", id: data.id, ok: false, code: outcome.code, message: outcome.message });
  }

  function onEmbedMessage(embed: Embed, data: unknown): void {
    if (embed.stopped || !isRecord(data)) return;
    // Kernel-to-kernel only: the embedded kernel's trusted gesture, opening the navigation window. DR-32
    if (data.kind === "thread-page:gesture") {
      if (typeof data.atMs === "number") embed.gestureAtMs = Date.now();
      return;
    }
    if (!isKernelMessage(data)) {
      if (typeof data.id === "string") reply(embed, makeFailure(data.id, "invalid_request", "Invalid bridge request"));
      return;
    }
    if (!("kind" in data)) {
      const request = data as BridgeRequestMessage;
      if (embed.revision === null || request.pageRevision !== embed.revision) {
        reply(embed, makeFailure(request.id, "stale_page", "This page changed; reload it before responding."));
        return;
      }
      void bridge(embed, request);
      return;
    }
    switch (data.kind) {
      case "thread-page:dirty":
      case "thread-page:clean": {
        // `setDirty(true)` holds the refresh, once the reader has acted in the page, where the engine can tell. 02 R4.47; U49
        const activation = (win.navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
        embed.dirty = data.kind === "thread-page:dirty" && data.custom && (activation ? activation.hasBeenActive : true);
        reconsider(embed);
        return;
      }
      case "thread-page:typing":
        embed.typing = data.active;
        reconsider(embed);
        return;
      case "thread-page:scroll":
        embed.scroll = data.state;
        return;
      case "thread-page:draft":
        // Kept for the embed's next load, and forwarded to the shell keyed by the embedded session. 02 R-K4
        if (Object.keys(data.fields).length === 0) embed.drafts.delete(data.form.key);
        else embed.drafts.set(data.form.key, { form: data.form, fields: data.fields, focus: data.focus, savedAtMs: Date.now(), revision: embed.revision ?? "0".repeat(64) });
        deps.send({ ...data, embed: { sessionId: embed.sessionId, documentPath: embed.path } });
        return;
      case "thread-page:open-document":
        // A link to another document of the embedded page opens it here; no history entry. 02 R4.50
        if (!isDocumentPath(data.path) || data.path === embed.path || atBound(embed)) return;
        charge(embed);
        embed.path = data.path;
        embed.revision = null;
        embed.latest = null;
        embed.answerToken = null;
        embed.dirty = false;
        embed.typing = false;
        embed.pending = 0;
        embed.updateAvailable = false;
        embed.scroll = null;
        embed.status = "loading";
        syncDirty();
        report(embed);
        soon();
        return;
      case "thread-page:submit":
        void submit(embed, data);
        return;
      case "thread-page:record":
        void record(embed, data);
        return;
      case "thread-page:escape":
        deps.send({ kind: "thread-page:escape" });
        return;
      case "thread-page:restored":
      case "thread-page:flushed":
      case "thread-page:pong":
      case "thread-page:fragment":
      case "thread-page:open-file":
      case "thread-page:file-request":
      case "thread-page:embed-dirty":
      case "thread-page:draft-discard":
      case "thread-page:grant-revoke":
        return;
      default:
        return;
    }
  }

  function onWindowMessage(event: MessageEvent): void {
    const source = prim.source(event);
    const embed = embeds.find((candidate) => !candidate.stopped && candidate.frame.contentWindow === source);
    if (!embed || embed.port || embed.status !== "shown") return;
    const data = prim.data(event);
    if (!isReadyMessage(data) || !data.embedded) return;
    const ports = prim.ports(event);
    const port = ports.length === 1 ? ports[0] : undefined;
    if (!port) return;
    embed.port = port;
    prim.listen(port, (message) => {
      if (embed.port === port) onEmbedMessage(embed, prim.data(message));
    });
    embed.nonce += 1;
    reply(embed, { kind: "thread-page:source-state", stale: false, archived: embed.readOnly, reason: null });
    tellSession(embed);
    reply(embed, { kind: "thread-page:restore", nonce: embed.nonce, scroll: embed.scroll, drafts: [...embed.drafts.values()], clearedNotice: [] });
    reply(embed, { kind: "thread-page:shown" });
    reply(embed, { kind: "thread-page:voice", available: deps.voiceAvailable(), reason: null });
  }

  function listen(): void {
    if (listening) return;
    listening = true;
    prim.on(win, "message", (event) => onWindowMessage(event as MessageEvent));
    prim.on(doc, "visibilitychange", () => {
      if (doc.visibilityState === "hidden") {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else soon();
    });
  }

  function frameFor(target: unknown): { frame: HTMLIFrameElement; created: boolean } {
    const element = target as Element | null;
    if (!element || typeof element !== "object" || element.nodeType !== 1 || element.ownerDocument !== doc) throw new TypeError("threadPage.embed needs an <iframe> or a container element of this document");
    if (element.tagName.toLowerCase() === "iframe") return { frame: element as HTMLIFrameElement, created: false };
    const frame = doc.createElement("iframe");
    frame.setAttribute("title", "Embedded page");
    frame.setAttribute("style", "display:block;width:100%;height:100%;border:0");
    element.appendChild(frame);
    return { frame, created: true };
  }

  function stop(embed: Embed): void {
    if (embed.stopped) return;
    embed.stopped = true;
    embed.port?.close?.();
    embed.port = null;
    embeds.splice(embeds.indexOf(embed), 1);
    if (embed.created) embed.frame.remove();
    else embed.frame.removeAttribute("srcdoc");
    syncDirty();
    if (active().length === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    setVoice(available) {
      for (const embed of embeds) if (!embed.stopped && embed.port) reply(embed, { kind: "thread-page:voice", available, reason: null });
    },
    setWorkingLabel() {
      for (const embed of embeds) if (!embed.stopped && embed.port) tellSession(embed);
    },
    stopAll() {
      for (const embed of [...embeds]) stop(embed);
    },
    embed(target, options) {
      const wanted = options as EmbedOptions | null;
      if (!wanted || typeof wanted !== "object" || !isSessionId(wanted.sessionId)) throw new TypeError("threadPage.embed needs { sessionId }");
      if (wanted.path !== undefined && !isDocumentPath(wanted.path)) throw new TypeError("threadPage.embed: path is not a document of a page");
      if (wanted.onState !== undefined && typeof wanted.onState !== "function") throw new TypeError("threadPage.embed: onState must be a function");
      const { frame, created } = frameFor(target);
      const embed: Embed = {
        frame,
        created,
        sessionId: wanted.sessionId,
        onState: wanted.onState ?? null,
        path: wanted.path ?? ENTRY_DOCUMENT,
        status: "loading",
        revision: null,
        latest: null,
        answerToken: null,
        title: null,
        workspaceId: null,
        working: false,
        readOnly: false,
        dirty: false,
        typing: false,
        pending: 0,
        updateAvailable: false,
        reload: false,
        port: null,
        scroll: null,
        drafts: new Map(),
        calls: [],
        answeredUntil: 0,
        declinedUntil: 0,
        gestureAtMs: -GESTURE_WINDOW_MS,
        stopped: false,
        inert: false,
        lastState: "",
        nonce: 0,
      };
      for (const other of embeds) if (!other.stopped && other.frame === frame) stop(other);
      embeds.push(embed);
      if (deps.embedded) {
        embed.inert = true;
        placeholder(embed, "nested");
      } else if (active().length >= LIMITS.embedsPerPage + 1) {
        embed.inert = true;
        placeholder(embed, "unavailable", TOO_MANY);
      } else {
        report(embed);
        listen();
        soon();
      }
      return () => stop(embed);
    },
  };
}
