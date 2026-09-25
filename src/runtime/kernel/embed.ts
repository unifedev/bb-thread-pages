import { ENTRY_DOCUMENT, isDocumentPath } from "../../domain/document-path.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { LIMITS } from "../../domain/limits.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../../domain/sandbox.ts";
import { HANDSHAKE_VERSION, isBridgeRequest, isRecord, isScrollMessage, makeFailure, sentMessage, type BridgeRequestMessage, type BridgeResponseMessage } from "../shared/protocol.ts";

/**
 * Embedded pages: `threadPage.embed(target, { sessionId, path?, onState? })`.
 * spec 04 §Embedded pages, DECISIONS D30, D31
 *
 * The kernel of the embedding page plays the shell's part for each embed: it
 * shows the document the host returns in a sandboxed `srcdoc` frame, hands
 * its kernel — the same kernel, in embedded mode — one MessagePort, and
 * forwards only a fixed set of things. Every embed of a page is checked in
 * one batched `pages.read` per tick.
 *
 * Nothing here is a privilege: all of it runs in the embedding page's realm,
 * and the host treats what arrives as that page's own act. What keeps an
 * answer honest is the answer token the host issued with the read, and the
 * grant the reader gives once in trusted chrome.
 */
export type EmbedStatus = "loading" | "shown" | "not_found" | "no_page" | "too_large" | "unavailable" | "nested";

export interface EmbedState {
  status: EmbedStatus;
  sessionId: string;
  path: string;
  title: string | null;
  revision: string | null;
  working: boolean;
  updateAvailable: boolean;
}

export interface EmbedOptions {
  sessionId: string;
  path?: string;
  onState?: (state: EmbedState) => void;
}

export interface EmbedManagerDeps {
  invoke(method: string, params?: unknown): Promise<unknown>;
  /** Whether any embed holds unsaved reader input, so the embedding page counts as dirty. spec R4.47 */
  setDirty(dirty: boolean): void;
  /** This document is itself shown inside another page: embedding is one level deep. spec R4.52 */
  embedded: boolean;
}

export interface EmbedManager {
  embed(target: unknown, options: unknown): () => void;
}

/** Exactly the page frame's sandbox, whatever the author set. spec R3.24, R4.43, D34 */
export const EMBED_SANDBOX = PAGE_SANDBOX;
const DECLINED_COOLDOWN_MS = 10_000;

/** What an embedded page may reach through the embedding page. Everything else is `unavailable`. spec R4.48 */
const PASS_THROUGH: ReadonlySet<string> = new Set(["pages.open", "sessions.openHost", "navigation.openExternal", "sessions.snapshot", "projects.list", "providers.list"]);
/** Of those, the ones that move the reader's view without a confirmation. */
const NAVIGATES: ReadonlySet<string> = new Set(["pages.open", "sessions.openHost"]);
const INSIDE_AN_EMBED: ReadonlySet<string> = new Set(["context.get", "session.reply", ...PASS_THROUGH]);

const PLACEHOLDERS: Record<Exclude<EmbedStatus, "loading" | "shown">, string> = {
  not_found: "This page is not available: its session was archived, deleted, or never had a page.",
  no_page: "This session has not written its page yet. It appears here as soon as the agent saves it.",
  too_large: "This page is too large to show inside another page. Open it on its own.",
  unavailable: "This page cannot be reached right now. It appears here when it can.",
  nested: "A page shown inside another page does not show further pages. Open this page on its own to see them.",
};
const TOO_MANY = `This page already shows ${LIMITS.embedsPerPage} other pages, which is the most one page can.`;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Host-authored text for a frame that has no page to show. */
export function placeholderDocument(text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font:14px/1.5 system-ui,sans-serif;color:GrayText;background:Canvas}p{margin:0;padding:1rem;max-width:30rem;text-align:center}</style></head><body><p>${escapeText(text)}</p></body></html>`;
}

interface Embed {
  readonly frame: HTMLIFrameElement;
  readonly created: boolean;
  readonly sessionId: string;
  readonly onState: ((state: EmbedState) => void) | null;
  path: string;
  status: EmbedStatus;
  /** The revision the frame shows, and the newest the host reported. They differ while an update is only offered. */
  shown: string | null;
  latest: string | null;
  /** Authorises answering the shown revision, never a newer one the reader has not seen. */
  answerToken: string | null;
  title: string | null;
  projectId: string | null;
  working: boolean;
  readOnly: boolean;
  dirty: boolean;
  updateAvailable: boolean;
  /** Load the newest revision on the next read, whatever is shown. */
  reload: boolean;
  port: MessagePort | null;
  scroll: { x: number; y: number };
  restore: { x: number; y: number } | null;
  calls: number[];
  answeredUntil: number;
  declinedUntil: number;
  stopped: boolean;
  /** Shows a placeholder for good and is never read: a nested embed, or one too many. */
  inert: boolean;
  lastState: string;
}

export function createEmbedManager(win: Window & typeof globalThis, deps: EmbedManagerDeps): EmbedManager {
  const doc = win.document;
  const embeds: Embed[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reading = false;
  let rotation = 0;
  let listening = false;
  let roster: Promise<unknown[]> | null = null;

  function report(embed: Embed): void {
    if (!embed.onState) return;
    const state: EmbedState = { status: embed.status, sessionId: embed.sessionId, path: embed.path, title: embed.title, revision: embed.shown, working: embed.working, updateAvailable: embed.updateAvailable };
    const print = JSON.stringify(state);
    if (print === embed.lastState) return;
    embed.lastState = print;
    try {
      embed.onState(state);
    } catch {
      // An author's callback cannot break the embed. spec R4.53
    }
  }

  function syncDirty(): void {
    deps.setDirty(embeds.some((embed) => !embed.stopped && embed.dirty));
  }

  /**
   * The frame is configured by the kernel on every load, whatever the author
   * set. It is taken out of the document while it changes: assigning `srcdoc`
   * to a frame in place is a navigation, which adds an entry to the reader's
   * history for every refresh (measured); a frame put back in gets a new
   * browsing context, whose first load adds none. The element stays the
   * author's element, in the same place. spec R3.24, R4.43, R4.50
   */
  function load(embed: Embed, html: string): void {
    embed.port?.close?.();
    embed.port = null;
    const frame = embed.frame;
    const parent = frame.parentNode;
    const next = frame.nextSibling;
    if (parent) parent.removeChild(frame);
    frame.removeAttribute("src");
    frame.setAttribute("allow", PAGE_FRAME_ALLOW);
    frame.removeAttribute("name");
    frame.removeAttribute("csp");
    frame.setAttribute("sandbox", EMBED_SANDBOX);
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc = html;
    if (parent) parent.insertBefore(frame, next);
  }

  function placeholder(embed: Embed, status: Exclude<EmbedStatus, "loading" | "shown">, text = PLACEHOLDERS[status]): void {
    const changed = embed.status !== status || embed.shown !== null;
    embed.status = status;
    embed.shown = null;
    embed.latest = null;
    embed.answerToken = null;
    embed.dirty = false;
    embed.updateAvailable = false;
    if (changed) load(embed, placeholderDocument(text));
    syncDirty();
    report(embed);
  }

  function show(embed: Embed, entry: Record<string, unknown>): void {
    const refreshing = embed.shown !== null;
    embed.restore = refreshing ? embed.scroll : null;
    embed.scroll = { x: 0, y: 0 };
    embed.status = "shown";
    embed.shown = entry.revision as string;
    embed.latest = embed.shown;
    embed.answerToken = typeof entry.answerToken === "string" ? entry.answerToken : null;
    embed.dirty = false;
    embed.updateAvailable = false;
    embed.reload = false;
    load(embed, entry.html as string);
    syncDirty();
    report(embed);
  }

  function describe(embed: Embed, entry: Record<string, unknown>): void {
    if (typeof entry.title === "string") embed.title = entry.title;
    embed.projectId = typeof entry.projectId === "string" ? entry.projectId : null;
    embed.working = entry.working === true;
    embed.readOnly = entry.readOnly === true;
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
      // The token belongs to the revision asked about; keep it only when that is the one on screen.
      if (embed.latest === embed.shown && typeof entry.answerToken === "string") embed.answerToken = entry.answerToken;
      report(embed);
      return;
    }
    if (typeof entry.revision !== "string" || typeof entry.html !== "string") return;
    // Never under a reader who is typing: offer it inside the embed instead. spec R4.46
    if (embed.dirty && embed.shown !== null && !embed.reload) {
      embed.latest = entry.revision;
      embed.updateAvailable = true;
      embed.port?.postMessage({ kind: "thread-page:update-available" });
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

  /** One `pages.read` per tick for up to 16 embeds; more take turns. spec R4.44 */
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
    // More embeds than one call holds take turns: the rest of this round follows at once, the next round waits its tick.
    let again = rotation !== 0;
    try {
      const pages = batch.map((embed) => ({
        sessionId: embed.sessionId,
        ...(embed.path === ENTRY_DOCUMENT ? {} : { path: embed.path }),
        ...(embed.latest && !embed.reload ? { ifNoneMatch: embed.latest } : {}),
      }));
      const result = (await deps.invoke("pages.read", { pages })) as { pages?: unknown };
      const entries = Array.isArray(result?.pages) ? result.pages : [];
      batch.forEach((embed, index) => {
        const entry = entries[index];
        if (!isRecord(entry) || entry.sessionId !== embed.sessionId) return;
        // The reader followed a link inside the embed while this read was out.
        if (entry.path !== embed.path) return;
        if (entry.deferred === true) again = true;
        apply(embed, entry);
      });
    } catch {
      // The embedding page changed, the budget ran out, or the host is away: keep what is shown and ask again.
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

  function reply(embed: Embed, message: BridgeResponseMessage | Record<string, unknown>): void {
    try {
      embed.port?.postMessage(message);
    } catch {
      // The frame went away.
    }
  }

  function fail(embed: Embed, id: unknown, error: unknown): void {
    const code = (isRecord(error) && typeof error.code === "string" ? error.code : "handler_error") as BridgeErrorCode;
    const message = error instanceof Error && error.message ? error.message : "Request failed";
    reply(embed, makeFailure(id, code, message));
  }

  /** The capabilities an embedded page sees, read once from this page's own roster. */
  function embeddedRoster(): Promise<unknown[]> {
    roster ??= deps.invoke("context.get").then(
      (value) => {
        const list = isRecord(value) && Array.isArray(value.capabilities) ? value.capabilities : [];
        return list.filter((entry) => isRecord(entry) && typeof entry.method === "string" && INSIDE_AN_EMBED.has(entry.method));
      },
      (error: unknown) => {
        roster = null;
        throw error;
      },
    );
    return roster;
  }

  async function answer(embed: Embed, body: Record<string, unknown>): Promise<{ delivery: unknown; duplicate: unknown }> {
    if (!embed.answerToken) throw Object.assign(new Error("This page is still loading; try again in a moment."), { code: "unavailable" });
    // The reader said no a moment ago: an embedded page may not put the question straight back up.
    if (Date.now() < embed.declinedUntil) throw Object.assign(new Error("You did not allow this page to send answers there. Try again in a moment."), { code: "cancelled" });
    try {
      const sent = (await deps.invoke("pages.answer", { answerToken: embed.answerToken, ...body })) as { delivery: unknown; duplicate: unknown };
      embed.answeredUntil = Date.now() + LIMITS.embedPollAfterAnswerMs;
      soon();
      return sent;
    } catch (error) {
      // The embedded page moved on, or the token ran out: fetch what is current.
      if (isRecord(error) && error.code === "cancelled") embed.declinedUntil = Date.now() + DECLINED_COOLDOWN_MS;
      if (isRecord(error) && (error.code === "stale_page" || error.code === "confirmation_invalid")) {
        if (error.code === "confirmation_invalid") embed.latest = null;
        soon();
      }
      throw error;
    }
  }

  /**
   * One budget for everything an embedded page can make this page spend: its
   * capability calls, its answers, and the reads a link or an accepted update
   * causes. A refused call is not counted, so a page that floods recovers.
   * spec R4.49
   */
  function allowed(embed: Embed): boolean {
    const now = Date.now();
    if (embed.calls.length > 0 && now - (embed.calls[0] as number) >= 60_000) embed.calls = embed.calls.filter((at) => now - at < 60_000);
    if (embed.calls.length >= LIMITS.embedCallsPerMinute) return false;
    embed.calls.push(now);
    return true;
  }

  /** Whether the reader has just acted, here or inside a frame of this page (activation reaches ancestors). */
  function readerActed(): boolean {
    const activation = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    // An engine without the API cannot tell; links inside an embed must keep working there.
    return activation ? activation.isActive : true;
  }

  async function bridge(embed: Embed, request: BridgeRequestMessage): Promise<void> {
    if (!allowed(embed)) {
      reply(embed, makeFailure(request.id, "rate_limited", "Too many requests from this embedded page; try again shortly."));
      return;
    }
    try {
      let result: unknown;
      if (request.method === "context.get") {
        if (request.params !== null) throw Object.assign(new Error("Invalid parameters for context.get"), { code: "invalid_params" });
        result = {
          protocolVersion: 1,
          session: { id: embed.sessionId, title: embed.title ?? "", projectId: embed.projectId },
          page: { revision: embed.shown, readOnly: embed.readOnly },
          capabilities: await embeddedRoster(),
        };
      } else if (request.method === "session.reply") {
        result = await answer(embed, { reply: request.params });
      } else if (PASS_THROUGH.has(request.method)) {
        // An embedded page may not take the reader's whole view elsewhere by itself. spec R4.48
        if (NAVIGATES.has(request.method) && !readerActed()) {
          throw Object.assign(new Error("A page shown inside another page can only navigate when the reader clicks."), { code: "unavailable" });
        }
        result = await deps.invoke(request.method, request.params);
      } else {
        throw Object.assign(new Error(`${request.method} is not available to a page shown inside another page.`), { code: "unavailable" });
      }
      reply(embed, { v: 1, id: request.id, ok: true, result });
    } catch (error) {
      fail(embed, request.id, error);
    }
  }

  async function submit(embed: Embed, data: Record<string, unknown>): Promise<void> {
    const submissionId = typeof data.submissionId === "string" ? data.submissionId : "";
    try {
      if (!allowed(embed)) throw new Error("Too many requests from this embedded page; try again shortly.");
      // Uploads take the shell's token, which names the embedding page. spec R4.51
      if (Array.isArray(data.files) && data.files.length > 0) throw new Error(EMBEDDED_FILES_REFUSAL);
      const sent = await answer(embed, { form: { submissionId, title: data.title, answers: data.answers } });
      reply(embed, { kind: "thread-page:submit-result", submissionId, ok: true, message: sentMessage(sent.delivery) });
    } catch (error) {
      reply(embed, { kind: "thread-page:submit-result", submissionId, ok: false, error: error instanceof Error && error.message ? error.message : "Request failed" });
    }
  }

  function onEmbedMessage(embed: Embed, data: unknown): void {
    if (embed.stopped || !isRecord(data)) return;
    if (data.kind === "thread-page:dirty" || data.kind === "thread-page:clean") {
      // Dirt is what the reader typed. A page nobody has touched cannot hold this page's refresh hostage.
      const sticky = (win.navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      embed.dirty = data.kind === "thread-page:dirty" && (sticky ? sticky.hasBeenActive : true);
      syncDirty();
      // What was only offered while the reader typed is shown once they are done.
      if (!embed.dirty && embed.updateAvailable) {
        embed.reload = true;
        soon();
      }
      return;
    }
    if (data.kind === "thread-page:scroll") {
      if (isScrollMessage(data)) embed.scroll = { x: data.x, y: data.y };
      return;
    }
    if (data.kind === "thread-page:apply-update") {
      if (!embed.updateAvailable || !allowed(embed)) return;
      embed.reload = true;
      soon();
      return;
    }
    if (data.kind === "thread-page:open-document") {
      // A link to another document of the embedded page opens it here; no history entry. spec R4.50
      if (!isDocumentPath(data.path) || data.path === embed.path || !allowed(embed)) return;
      embed.path = data.path;
      embed.shown = null;
      embed.latest = null;
      embed.answerToken = null;
      embed.dirty = false;
      embed.updateAvailable = false;
      embed.scroll = { x: 0, y: 0 };
      embed.status = "loading";
      syncDirty();
      report(embed);
      soon();
      return;
    }
    if (data.kind === "thread-page:submit") {
      void submit(embed, data);
      return;
    }
    if (embed.shown === null || !isBridgeRequest(data, embed.shown)) {
      reply(embed, makeFailure(data.id, "invalid_request", "Invalid Thread Page bridge request"));
      return;
    }
    void bridge(embed, data);
  }

  function onWindowMessage(event: MessageEvent): void {
    const embed = embeds.find((candidate) => !candidate.stopped && candidate.frame.contentWindow === event.source);
    if (!embed || embed.port || embed.status !== "shown") return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:ready" || data.version !== HANDSHAKE_VERSION) return;
    const channel = new win.MessageChannel();
    const port = channel.port1;
    embed.port = port;
    port.onmessage = (message) => {
      if (embed.port === port) onEmbedMessage(embed, message.data);
    };
    port.start?.();
    embed.frame.contentWindow?.postMessage({ kind: "thread-page:connect", version: HANDSHAKE_VERSION }, "*", [channel.port2]);
    const restore = embed.restore;
    embed.restore = null;
    if (restore && (restore.x > 0 || restore.y > 0)) port.postMessage({ kind: "thread-page:restore-scroll", x: restore.x, y: restore.y });
  }

  function listen(): void {
    if (listening) return;
    listening = true;
    win.addEventListener("message", onWindowMessage);
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "hidden") {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else {
        soon();
      }
    });
  }

  function frameFor(target: unknown): { frame: HTMLIFrameElement; created: boolean } {
    const element = target as Element | null;
    if (!element || typeof element !== "object" || element.nodeType !== 1 || element.ownerDocument !== doc) {
      throw new TypeError("threadPage.embed needs an <iframe> or a container element of this document");
    }
    if (element.tagName.toLowerCase() === "iframe") return { frame: element as HTMLIFrameElement, created: false };
    const frame = doc.createElement("iframe");
    frame.setAttribute("title", "Embedded page");
    frame.setAttribute("style", "display:block;width:100%;height:100%;border:0");
    element.appendChild(frame);
    return { frame, created: true };
  }

  return {
    embed(target, options) {
      const wanted = options as EmbedOptions | null;
      if (!wanted || typeof wanted !== "object" || typeof wanted.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(wanted.sessionId)) {
        throw new TypeError("threadPage.embed needs { sessionId }");
      }
      if (wanted.path !== undefined && wanted.path !== ENTRY_DOCUMENT && !isDocumentPath(wanted.path)) throw new TypeError("threadPage.embed: path is not a document of a page");
      if (wanted.onState !== undefined && typeof wanted.onState !== "function") throw new TypeError("threadPage.embed: onState must be a function");
      const { frame, created } = frameFor(target);
      const embed: Embed = {
        frame,
        created,
        sessionId: wanted.sessionId,
        onState: wanted.onState ?? null,
        path: wanted.path ?? ENTRY_DOCUMENT,
        status: "loading",
        shown: null,
        latest: null,
        answerToken: null,
        title: null,
        projectId: null,
        working: false,
        readOnly: false,
        dirty: false,
        updateAvailable: false,
        reload: false,
        port: null,
        scroll: { x: 0, y: 0 },
        restore: null,
        calls: [],
        answeredUntil: 0,
        declinedUntil: 0,
        stopped: false,
        inert: false,
        lastState: "",
      };
      // An <iframe> embedded twice keeps only the newer embed.
      for (const other of embeds) if (!other.stopped && other.frame === frame) stop(other);
      embeds.push(embed);
      if (deps.embedded) {
        embed.inert = true;
        placeholder(embed, "nested");
      } else if (active().length > LIMITS.embedsPerPage) {
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
}

export const EMBEDDED_FILES_REFUSAL = "Files cannot be attached from inside another page. Open this page on its own to send them.";
