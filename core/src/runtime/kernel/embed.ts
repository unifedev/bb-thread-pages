// `threadPage.embed`: frame creation, sandbox/allow set on every load, `pages.read` batching (16 per call), cadence, the deferred refresh (typing, a pending answer, `setDirty` — U49), the hand-over to an embedded `onPageUpdate` (R4.66), session state forwarded, `onState`, drafts kept; a frame of the page's own session (`html`, or the page's own session) passed to this page's shell as the page's own (R4.48a); another session's page under grant cooldown, its own budget and the relay's allow-list (R4.48) (02 §Embedded pages).
import { ENTRY_DOCUMENT, isDocumentPath } from "../../domain/document-path.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { isSessionId } from "../../domain/ids.ts";
import { LIMITS } from "../../domain/limits.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../../domain/sandbox.ts";
import { checkScope } from "../../domain/scope.ts";
import type { DraftRecord } from "../shared/drafts.ts";
import { isKernelMessage, isReadyMessage, isRecord, makeFailure, type BridgeRequestMessage, type KernelConfig, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import type { ScrollState } from "../shared/scroll-state.ts";
import { embeddedRoster, GESTURE_WINDOW_MS, relayCall, RelayRefusal, type EmbedView } from "./embed-relay.ts";
import type { RelayedAs } from "./bridge-client.ts";
import { contributorScripts, frameDocument, type HostScripts } from "./frame-document.ts";
import { EMBEDDED_MEDIA_REFUSAL } from "./large-media.ts";
import type { KernelPrimitives } from "./primitives.ts";
import type { RecordAnswer } from "./record-client.ts";

export type EmbedStatus = "loading" | "shown" | "not_found" | "no_page" | "too_large" | "unavailable";

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
  sessionId?: string;
  path?: string;
  /** A document the page holds, shown as a frame of the page's own session. 02 R4.42a */
  html?: string;
  scope?: string | null;
  title?: string;
  onState?: (state: EmbedState) => void;
}

export interface EmbedManagerDeps {
  invoke(method: string, params?: unknown): Promise<unknown>;
  /** An embedded document's `storage.*` or contributed call, sent through this page's channel as that document's. 02 R4.48 (U56) */
  relay(method: string, params: unknown, as: RelayedAs): Promise<unknown>;
  /** Whether any embed is holding its refresh (typing, a pending answer, `setDirty(true)`): the page counts as dirty toward its shell meanwhile. 02 R4.47; U49 */
  setDirty(dirty: boolean): void;
  /** The host's working label, as this page's shell told it; forwarded with each embed's own state. 05 R2.26 */
  workingLabel(): string;
  /** This page's own session's state, as its shell told it: an `html` frame's. 02 R4.42a */
  working(): boolean;
  /** This page's configuration now (its revision moves with a hand-over, 02 R4.66): an `html` frame's is made from it. */
  config(): KernelConfig;
  /** Forwards to the shell: drafts with `embed` set, Dictate asks, Escape, and everything a frame of the page's own session sends. 02 R4.48a */
  send(message: KernelMessage): boolean;
  /** A fresh id on this page's channel, for what a frame of the page's own session sends through it. */
  nextId(prefix: string): string;
  /** The kernel's own source, as it was when it installed: an `html` frame runs the same. 02 R4.42a */
  kernelSource: string | null;
  dictate(prompt: string, fromControl: boolean): Promise<RecordAnswer>;
  voiceAvailable(): boolean;
  prim: KernelPrimitives;
}

export interface EmbedManager {
  embed(target: unknown, options: unknown): () => void;
  setVoice(available: boolean): void;
  /** The host's label or this page's session state changed: every embed hears its own state again. */
  setSession(): void;
  /** This page's own read-only state changed: an `html` frame shares it. 02 R4.42a */
  setSource(source: { stale: boolean; archived: boolean; reason: string | null }): void;
  /** A shell answer to something a frame of the page's own session sent; true when it was one. 02 R4.48a */
  receive(message: ShellMessage): boolean;
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
};
/** What an `html` frame shows instead, for the page's author. 02 R4.42a */
const HELD_TOO_LARGE = `This document is larger than ${LIMITS.pagesReadBytes / (1024 * 1024)} MiB, the most a frame of the page can show.`;
const HELD_NO_KERNEL = "This frame cannot be shown: the page's runtime script is missing from the page.";
const HELD_TOO_DEEP = `This frame is not shown: frames of the page go at most ${LIMITS.frameDepth} deep.`;
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
  onState: ((state: EmbedState) => void) | null;
  /** An `html` frame: the document the page holds, never read through `pages.read`. 02 R4.42a */
  held: { html: string; scope: string | null } | null;
  /** An `html` frame's newer version, waiting while R4.46's holds stand. 02 R4.42a */
  waiting: HeldVersion | null;
  /** The flush asked before that version is taken: its nonce, while the frame flushes. */
  taking: number | null;
  /** A frame of the page's own session: an `html` frame, or one `pages.read` marked `own`. 02 R4.48a */
  own: boolean;
  /** Its own embeds are held (02 R4.47, one level down). */
  nestedDirty: boolean;
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
  /** The embedded document registered `onPageUpdate`. 02 R4.66 */
  pageUpdate: boolean;
  /** The hand-over in flight: the entry it carries, taken once the embedded kernel answers. */
  handing: { nonce: number; entry: Record<string, unknown>; timer: ReturnType<typeof setTimeout> } | null;
  handNonce: number;
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

interface HeldVersion {
  html: string;
  tooLarge: boolean;
}

/** `{ html, scope?, title? }` checked: a bad scope or title throws as a bad `sessionId` does; a text over the bound is a state. 02 R4.42a */
function heldOptions(wanted: EmbedOptions): { html: string; scope: string | null; title: string | null; tooLarge: boolean } {
  if (typeof wanted.html !== "string") throw new TypeError("threadPage.embed: html must be text");
  if (wanted.sessionId !== undefined || wanted.path !== undefined) throw new TypeError("threadPage.embed takes { html } or { sessionId }, not both");
  const scope = checkScope(wanted.scope);
  if (!scope.ok) throw new TypeError(`threadPage.embed: ${scope.message}`);
  if (wanted.title !== undefined && (typeof wanted.title !== "string" || wanted.title.length > 300)) throw new TypeError("threadPage.embed: title must be text of at most 300 characters");
  const title = wanted.title?.trim() || null;
  return { html: wanted.html, scope: scope.scope, title, tooLarge: new TextEncoder().encode(wanted.html).length > LIMITS.pagesReadBytes };
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
  /** This page's own session (null on the built-in home), from the same `context.get` as the roster. */
  let ownSession: string | null | undefined;

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
    return embed.typing || embed.dirty || embed.nestedDirty || embed.pending > 0;
  }

  function syncDirty(): void {
    deps.setDirty(embeds.some((embed) => !embed.stopped && deferring(embed)));
  }

  /** A deferred version is taken as soon as nothing holds it. */
  function reconsider(embed: Embed): void {
    syncDirty();
    if (embed.held) {
      if (!embed.waiting) return;
      if (!deferring(embed)) take(embed, LIMITS.frameVersionGraceMs);
      else if (embed.taking !== null) {
        // A hold that begins during the grace or the flush cancels the take: the next lift gets a whole grace.
        embed.taking = null;
        announce(embed);
      }
      return;
    }
    if (embed.updateAvailable && !deferring(embed) && !embed.reload) {
      embed.reload = true;
      soon();
    }
  }

  function tellSession(embed: Embed): void {
    reply(embed, { kind: "thread-page:session-state", working: embed.held ? deps.working() : embed.working, label: deps.workingLabel() });
  }

  /** This page's own read-only state, which an `html` frame shares. 02 R4.42a */
  let pageSource: { stale: boolean; archived: boolean; reason: string | null } = { stale: deps.config().stale, archived: deps.config().archived, reason: null };
  function tellSource(embed: Embed): void {
    reply(embed, embed.held ? { kind: "thread-page:source-state", ...pageSource } : { kind: "thread-page:source-state", stale: false, archived: embed.readOnly, reason: null });
  }

  /** The frame is configured by the kernel on every load, taken out of the document so no history entry is added. 02 R4.43 */
  function load(embed: Embed, html: string): void {
    embed.port?.close?.();
    embed.port = null;
    embed.pageUpdate = false;
    dropHandOver(embed);
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
      tellSource(embed);
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
    embed.own = entry.own === true;
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
    if (embed.pageUpdate && embed.port && embed.status === "shown" && embed.revision !== null) {
      handOver(embed, entry);
      return;
    }
    show(embed, entry);
  }

  /** The embedded document stays and is handed its new version, as `pages.read` served it; the version is taken once it answers. 02 R4.66 */
  function handOver(embed: Embed, entry: Record<string, unknown>): void {
    dropHandOver(embed);
    const nonce = ++embed.handNonce;
    embed.latest = entry.revision as string;
    const timer = setTimeout(() => settleHandOver(embed, nonce, false), LIMITS.refreshSwapMs);
    embed.handing = { nonce, entry, timer };
    reply(embed, { kind: "thread-page:page-update", nonce, revision: entry.revision as string, documentPath: embed.path, html: entry.html as string });
  }

  function dropHandOver(embed: Embed): void {
    if (!embed.handing) return;
    clearTimeout(embed.handing.timer);
    embed.handing = null;
  }

  function settleHandOver(embed: Embed, nonce: number, ok: boolean): void {
    if (embed.stopped || !embed.handing || embed.handing.nonce !== nonce) return;
    const entry = embed.handing.entry;
    dropHandOver(embed);
    if (!ok) {
      // No callback any more, or no answer: the embed is loaded afresh, as before.
      show(embed, entry);
      return;
    }
    embed.revision = entry.revision as string;
    embed.answerToken = typeof entry.answerToken === "string" ? entry.answerToken : null;
    embed.reload = false;
    if (embed.updateAvailable) {
      embed.updateAvailable = false;
      reply(embed, { kind: "thread-page:update", available: false });
    }
    syncDirty();
    report(embed);
  }

  /** The embeds `pages.read` keeps fresh. */
  function active(): Embed[] {
    return embeds.filter((embed) => !embed.stopped && !embed.inert && !embed.held);
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
      (value) => {
        ownSession = isRecord(value) && isRecord(value.session) && typeof value.session.id === "string" ? value.session.id : null;
        return isRecord(value) && Array.isArray(value.capabilities) ? value.capabilities.filter(isRecord) : [];
      },
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

  /** The embedded document's own storage and contributed calls, as that document: its revision, its scope, the embed's answer token. 02 R4.48 (U56) */
  async function asEmbedded(embed: Embed, method: string, params: unknown, scope: string | null): Promise<unknown> {
    if (!embed.answerToken || embed.revision === null) throw new RelayRefusal("unavailable", "This page is still loading; try again in a moment.");
    // Checked again as it leaves: calls that waited on the roster were not charged when they arrived. 02 R4.49
    if (atBound(embed)) throw new RelayRefusal("rate_limited", RATE_LIMITED);
    charge(embed);
    try {
      return await deps.relay(method, params, { embed: embed.answerToken, pageRevision: embed.revision, scope });
    } catch (error) {
      // A token the host no longer takes is renewed by the next read, which costs nothing to the embed. 03 R5.60a
      if (isRecord(error) && error.code === "confirmation_invalid") soon();
      throw error;
    }
  }

  /** One budget for everything an embed can make this page spend: charged when a call leaves the kernel, so a call the relay refuses counts nothing. 02 R4.49 */
  function atBound(embed: Embed): boolean {
    const now = Date.now();
    embed.calls = embed.calls.filter((at) => now - at < 60_000);
    // The built-in home's main view is the page the reader opened there; known from this page's own context.get, until then the general bound. U59
    return embed.calls.length >= (ownSession === null ? LIMITS.homeEmbedCallsPerMinute : LIMITS.embedCallsPerMinute);
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
      const result = await relayCall(embed, request.method, request.params, { invoke, roster: ownRoster, now: () => Date.now(), answer: (view, body) => answer(view as Embed, body), asEmbedded: (view, method, params, scope) => asEmbedded(view as Embed, method, params, scope), whole: async (view) => (await ownRoster(), ownSession === null || ownSession === view.sessionId) }, request.scope ?? null);
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

  /** What a frame of the page's own session sent, waiting on this page's shell's answer: by the id it went out under. 02 R4.48a */
  const passed = new Map<string, { embed: Embed; id: string }>();
  const submissions = new Map<string, Embed>();

  /** Sent on as this page's own, under an id of this page's channel; the answer goes back to the frame under its own. */
  function pass(embed: Embed, id: string, message: (passedId: string) => KernelMessage): boolean {
    const passedId = deps.nextId("e");
    passed.set(passedId, { embed, id });
    if (deps.send(message(passedId))) return true;
    passed.delete(passedId);
    reply(embed, makeFailure(id, "unavailable", "The request could not be sent"));
    return false;
  }

  /** A frame of the page's own session is the page: what its kernel sends goes to this page's shell as this page's own. 02 R4.48a */
  function asPage(embed: Embed, data: KernelMessage): boolean {
    if (!("kind" in data)) {
      const request = data as BridgeRequestMessage;
      // A relayed call of the frame's own embed keeps that document's revision and token; the frame's own calls go under this page's revision. 02 R4.48
      pass(embed, request.id, (id) => ({ ...request, id, ...(request.embed === undefined ? { pageRevision: deps.config().pageRevision } : {}) }));
      return true;
    }
    switch (data.kind) {
      case "thread-page:submit":
        submissions.set(data.submissionId, embed);
        embed.pending += 1;
        syncDirty();
        if (!deps.send({ ...data, ...(embed.held ? { writtenAgainst: deps.config().pageRevision } : {}), frame: embed.held ? { title: embed.title } : { title: null, path: embed.path } })) {
          submissions.delete(data.submissionId);
          settleSubmission(embed, { kind: "thread-page:submit-result", submissionId: data.submissionId, ok: false, error: "unavailable", message: "The request could not be sent" });
        }
        return true;
      case "thread-page:record":
        // An open recorder holds the frame as it holds the page (05 R2.21 (d)), until its answer comes back.
        embed.pending += 1;
        syncDirty();
        if (!pass(embed, data.id, (id) => ({ ...data, id }))) {
          embed.pending = Math.max(0, embed.pending - 1);
          reconsider(embed);
        }
        return true;
      case "thread-page:file-request":
        pass(embed, data.id, (id) => ({ ...data, id }));
        return true;
      case "thread-page:open-file":
        deps.send(data);
        return true;
      case "thread-page:open-document":
        // An `html` frame's link to a document of the page is the page's own link (R4.15a); a document frame keeps R4.50.
        if (!embed.held) return false;
        deps.send(data);
        return true;
      default:
        return false;
    }
  }

  function settleSubmission(embed: Embed, message: ShellMessage): void {
    embed.pending = Math.max(0, embed.pending - 1);
    reply(embed, message);
    if (!embed.stopped) reconsider(embed);
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
    // A document frame's own calls are checked against the version it shows; a call its own embed relays carries that document's. 02 R-K1
    if (!("kind" in data) && !embed.held && !(embed.own && (data as BridgeRequestMessage).embed !== undefined)) {
      const request = data as BridgeRequestMessage;
      if (embed.revision === null || request.pageRevision !== embed.revision) {
        reply(embed, makeFailure(request.id, "stale_page", "This page changed; reload it before responding."));
        return;
      }
    }
    if (embed.own && asPage(embed, data)) return;
    if (!("kind" in data)) {
      void bridge(embed, data as BridgeRequestMessage);
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
        // Kept for the embed's next load, and forwarded to the shell keyed by the embedded session; an `html` frame is no stored document, so its drafts stay here. 02 R-K4, R4.48a
        if (Object.keys(data.fields).length === 0) embed.drafts.delete(data.form.key);
        else embed.drafts.set(data.form.key, { form: data.form, fields: data.fields, focus: data.focus, savedAtMs: Date.now(), revision: embed.revision ?? "0".repeat(64) });
        if (!embed.held) deps.send({ ...data, embed: { sessionId: embed.sessionId, documentPath: embed.path } });
        return;
      case "thread-page:open-document":
        // A link to another document of the embedded page opens it here; no history entry. 02 R4.50
        if (!isDocumentPath(data.path) || data.path === embed.path || (!embed.own && atBound(embed))) return;
        if (!embed.own) charge(embed);
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
      case "thread-page:page-update-listen":
        embed.pageUpdate = data.active;
        return;
      case "thread-page:page-updated":
        settleHandOver(embed, data.nonce, data.ok);
        return;
      case "thread-page:record":
        void record(embed, data);
        return;
      case "thread-page:escape":
        deps.send({ kind: "thread-page:escape" });
        return;
      case "thread-page:embed-dirty":
        embed.nestedDirty = data.dirty;
        reconsider(embed);
        return;
      case "thread-page:file-request":
        // Another session's files are not this page's shell's to fetch. 02 R4.25a
        reply(embed, { kind: "thread-page:file", id: data.id, ok: false, status: 403, error: EMBEDDED_MEDIA_REFUSAL });
        return;
      case "thread-page:flushed":
        if (embed.taking === data.nonce) taken(embed, data.nonce);
        return;
      case "thread-page:restored":
      case "thread-page:pong":
      case "thread-page:fragment":
      case "thread-page:open-file":
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
    tellSource(embed);
    tellSession(embed);
    reply(embed, { kind: "thread-page:restore", nonce: embed.nonce, scroll: embed.scroll, drafts: [...embed.drafts.values()], clearedNotice: [] });
    reply(embed, { kind: "thread-page:shown" });
    reply(embed, { kind: "thread-page:voice", available: deps.voiceAvailable(), reason: null });
    // This page's own context, once, charged to no embed: it says whether this is the built-in home, whose bound is higher. U59
    void ownRoster().catch(() => undefined);
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
    dropHandOver(embed);
    for (const [id, waiting] of passed) if (waiting.embed === embed) passed.delete(id);
    for (const [id, owner] of submissions) if (owner === embed) submissions.delete(id);
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

  /** The document an `html` frame shows: the page's text behind this kernel and the page's contributors' scripts, configured as this page is, with its scope. 02 R4.42a */
  let scripts: HostScripts | null | undefined;
  function showHeld(embed: Embed): void {
    const held = embed.held!;
    scripts ??= deps.kernelSource ? { kernel: deps.kernelSource, contributors: contributorScripts(doc) } : null;
    if (!scripts) {
      placeholder(embed, "unavailable", HELD_NO_KERNEL);
      return;
    }
    const { scope: _pages, frameDepth, ...page } = deps.config();
    const depth = (frameDepth ?? 0) + 1;
    // Frames of the page inside one another, as a page script that shows its apps on load would make them inside each app. 02 R4.42a
    if (depth > LIMITS.frameDepth) {
      placeholder(embed, "unavailable", HELD_TOO_DEEP);
      return;
    }
    const config: KernelConfig = { ...page, embedded: true, frameDepth: depth, ...(held.scope !== null ? { scope: held.scope } : {}) };
    embed.status = "shown";
    load(embed, frameDocument(win, held.html, scripts, config));
    report(embed);
  }

  let flushes = 0;

  /** The frame is told once that a newer version waits, as R4.46 tells an embed. */
  function announce(embed: Embed): void {
    if (!embed.updateAvailable) {
      embed.updateAvailable = true;
      reply(embed, { kind: "thread-page:update", available: true });
    }
    report(embed);
  }
  /** An `html` frame takes its waiting version once the frame has flushed its drafts and scroll and handled what it was sent, as the page's own swap does (05 R2.21): first a grace, so the tap that lifted a hold lands where it was aimed. 02 R4.42a */
  function take(embed: Embed, graceMs: number): void {
    if (embed.taking !== null || !embed.waiting) return;
    const nonce = ++flushes;
    embed.taking = nonce;
    const flush = (): void => {
      if (embed.stopped || embed.taking !== nonce) return;
      if (!embed.port) {
        taken(embed, nonce);
        return;
      }
      reply(embed, { kind: "thread-page:flush", nonce });
      setTimeout(() => taken(embed, nonce), LIMITS.draftFlushMs);
    };
    if (graceMs > 0) setTimeout(flush, graceMs);
    else flush();
  }

  /** The frame flushed (or did not answer in time): the latest version loads, unless a hold began meanwhile. */
  function taken(embed: Embed, nonce: number): void {
    if (embed.stopped || embed.taking !== nonce) return;
    embed.taking = null;
    const version = embed.waiting;
    if (!version) return;
    if (deferring(embed)) {
      announce(embed);
      return;
    }
    // A form with neither id nor title is keyed by its place under the page's revision, which an `html` frame's versions share: its draft could land in another form. 02 R-K4
    for (const key of embed.drafts.keys()) if (key.startsWith("none:")) embed.drafts.delete(key);
    embed.held = { html: version.html, scope: embed.held!.scope };
    embed.waiting = null;
    embed.updateAvailable = false;
    if (version.tooLarge) placeholder(embed, "too_large", HELD_TOO_LARGE);
    else showHeld(embed);
  }

  /** A call on the same frame with the same scope is a new version of its document, never shown under a reader who is typing, answering or mid-flow. 02 R4.42a, R4.46 */
  function newVersion(embed: Embed, version: HeldVersion, title: string | null, onState: ((state: EmbedState) => void) | null): () => void {
    embed.title = title;
    embed.onState = onState;
    embed.lastState = "";
    if (version.html === embed.held!.html && embed.status === "shown") {
      embed.waiting = null;
      embed.taking = null;
      if (embed.updateAvailable) {
        embed.updateAvailable = false;
        reply(embed, { kind: "thread-page:update", available: false });
      }
      report(embed);
    } else if (deferring(embed)) {
      embed.waiting = version;
      announce(embed);
    } else {
      embed.waiting = version;
      report(embed);
      take(embed, 0);
    }
    return () => stop(embed);
  }

  /** What an `html` frame reports: the page's own state. 02 R4.42a */
  function heldState(embed: Embed): void {
    embed.working = deps.working();
    embed.readOnly = pageSource.archived || pageSource.stale;
  }

  function settle(message: ShellMessage): boolean {
    if (!("kind" in message)) {
      const waiting = passed.get(message.id);
      if (!waiting) return false;
      passed.delete(message.id);
      reply(waiting.embed, { ...message, id: waiting.id });
      return true;
    }
    switch (message.kind) {
      case "thread-page:recorded":
      case "thread-page:file": {
        const waiting = passed.get(message.id);
        if (!waiting) return false;
        passed.delete(message.id);
        reply(waiting.embed, { ...message, id: waiting.id });
        if (message.kind === "thread-page:recorded") {
          try {
            waiting.embed.frame.focus({ preventScroll: true });
          } catch {
            // Focus is a courtesy.
          }
          waiting.embed.pending = Math.max(0, waiting.embed.pending - 1);
          if (!waiting.embed.stopped) reconsider(waiting.embed);
        }
        return true;
      }
      case "thread-page:submit-progress": {
        const embed = submissions.get(message.submissionId);
        if (!embed) return false;
        reply(embed, message);
        return true;
      }
      case "thread-page:submit-result": {
        const embed = submissions.get(message.submissionId);
        if (!embed) return false;
        submissions.delete(message.submissionId);
        settleSubmission(embed, message);
        return true;
      }
      default:
        return false;
    }
  }

  return {
    receive: settle,
    setVoice(available) {
      for (const embed of embeds) if (!embed.stopped && embed.port) reply(embed, { kind: "thread-page:voice", available, reason: null });
    },
    setSession() {
      for (const embed of embeds) {
        if (embed.stopped) continue;
        if (embed.held) {
          heldState(embed);
          report(embed);
        }
        if (embed.port) tellSession(embed);
      }
    },
    setSource(source) {
      pageSource = source;
      for (const embed of embeds) {
        if (embed.stopped || !embed.held) continue;
        heldState(embed);
        report(embed);
        if (embed.port) tellSource(embed);
      }
    },
    stopAll() {
      for (const embed of [...embeds]) stop(embed);
    },
    embed(target, options) {
      const wanted = options as EmbedOptions | null;
      const held = wanted && typeof wanted === "object" && wanted.html !== undefined ? heldOptions(wanted) : null;
      if (!held && (!wanted || typeof wanted !== "object" || !isSessionId(wanted.sessionId))) throw new TypeError("threadPage.embed needs { sessionId } or { html }");
      if (!held && wanted!.path !== undefined && !isDocumentPath(wanted!.path)) throw new TypeError("threadPage.embed: path is not a document of a page");
      if (wanted!.onState !== undefined && typeof wanted!.onState !== "function") throw new TypeError("threadPage.embed: onState must be a function");
      const { frame, created } = frameFor(target);
      const live = held && !created ? embeds.find((other) => !other.stopped && !other.inert && other.frame === frame) : undefined;
      if (live?.held && live.held.scope === held!.scope) return newVersion(live, held!, held!.title, wanted!.onState ?? null);
      const embed: Embed = {
        frame,
        created,
        sessionId: held ? "" : wanted!.sessionId!,
        onState: wanted!.onState ?? null,
        held: held ? { html: held.html, scope: held.scope } : null,
        waiting: null,
        taking: null,
        own: held !== null,
        nestedDirty: false,
        path: held ? "" : (wanted!.path ?? ENTRY_DOCUMENT),
        status: "loading",
        revision: null,
        latest: null,
        answerToken: null,
        title: held ? held.title : null,
        workspaceId: null,
        working: false,
        readOnly: false,
        dirty: false,
        typing: false,
        pending: 0,
        updateAvailable: false,
        reload: false,
        pageUpdate: false,
        handing: null,
        handNonce: 0,
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
      if (embeds.filter((one) => !one.stopped && !one.inert).length >= LIMITS.embedsPerPage + 1) {
        embed.inert = true;
        placeholder(embed, "unavailable", TOO_MANY);
      } else if (held) {
        listen();
        heldState(embed);
        if (held.tooLarge) placeholder(embed, "too_large", HELD_TOO_LARGE);
        else showHeld(embed);
      } else {
        report(embed);
        listen();
        soon();
      }
      return () => stop(embed);
    },
  };
}
