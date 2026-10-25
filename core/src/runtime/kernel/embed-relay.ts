// The embedding kernel as the embedded kernel's shell: method allow-list and rewrites (`session.activity`→`sessions.snapshot`, `session.messages`→`sessions.messages`, `session.respond{answers}`→`pages.answer{respond}`), `storage.*` and contributed calls relayed as the embedded document's under the embed's answer token (U56), `unavailable` for the rest (02 R4.48; DESIGN §E.8).
import { RESERVED_NAMESPACES } from "../../domain/capabilities/contributed.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { LIMITS } from "../../domain/limits.ts";
import { isRecord } from "../shared/protocol.ts";

/** What the relay knows of one embed. */
export interface EmbedView {
  sessionId: string;
  title: string | null;
  workspaceId: string | null;
  revision: string | null;
  readOnly: boolean;
  answerToken: string | null;
  /** The last trusted gesture the embedded kernel reported, in the embedding document's clock. */
  gestureAtMs: number;
}

export interface RelayDeps {
  invoke(method: string, params?: unknown): Promise<unknown>;
  /** The embedding page's own roster, read once. */
  roster(): Promise<Record<string, unknown>[]>;
  now(): number;
  /** Answers through `pages.answer` under the embed's token; the manager keeps the cooldowns. */
  answer(embed: EmbedView, body: Record<string, unknown>): Promise<unknown>;
  /** A `storage.*` or contributed call made as the embedded document, under the embed's answer token, in the document's scope. 02 R4.48 (U56) */
  asEmbedded(embed: EmbedView, method: string, params: unknown, scope: string | null): Promise<unknown>;
  /** Whether the embedded document has its whole reach here: this page is the built-in home or of the embedded session. 02 R4.48 (U56) */
  whole(embed: EmbedView): Promise<boolean>;
}

export class RelayRefusal extends Error {
  readonly reason?: string;
  readonly detail?: unknown;
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    extra?: { reason: string; detail?: unknown },
  ) {
    super(message);
    this.name = "RelayRefusal";
    if (extra) {
      this.reason = extra.reason;
      if (extra.detail !== undefined) this.detail = extra.detail;
    }
  }
}

/** Forwarded as-is. 02 R4.48 */
const FORWARDED: ReadonlySet<string> = new Set(["sessions.snapshot", "workspaces.list", "projects.list", "providers.list"]);
/** Forwarded only within the gesture window. DR-32 */
const NAVIGATIONS: ReadonlySet<string> = new Set(["pages.open", "sessions.openHost", "navigation.openExternal"]);
/** Answered for the embedded session, as its own document's calls. 02 R4.48 (U56) */
const AS_EMBEDDED: ReadonlySet<string> = new Set(["storage.get", "storage.set", "storage.setMany"]);
/** Kept from the embedding roster, beside every contributed entry. */
const KEPT: ReadonlySet<string> = new Set(["context.get", "sessions.snapshot", "sessions.openHost", "providers.list", "workspaces.list", "pages.open", "navigation.openExternal", "session.activity", "session.messages", "session.respond", "session.reply", "voice.captureAndTranscribe", ...AS_EMBEDDED]);
export const GESTURE_WINDOW_MS = 5_000;

/** What an embed lists: inside another session's page, its contributors' reads and no storage. 02 R4.48 (U56) */
export function embeddedRoster(roster: Record<string, unknown>[], whole = true): Record<string, unknown>[] {
  return roster.filter((entry) => {
    if (typeof entry.method !== "string") return false;
    if (entry.contributor !== undefined) return isContributed(entry.method) && (whole || entry.effect === "read");
    return KEPT.has(entry.method) && (whole || !AS_EMBEDDED.has(entry.method));
  });
}

const READS_ONLY = "Shown inside another session's page, this page can only read through its plugins; open it on its own or in the home to change anything.";

/** A name outside the built-in namespaces is a contributed capability's, whether or not one is installed: the host answers `unknown_method` for one nobody declares. 07 R5.52 */
function isContributed(method: string): boolean {
  const dot = method.indexOf(".");
  return dot > 0 && !RESERVED_NAMESPACES.has(method.slice(0, dot));
}

function unavailable(message: string): never {
  throw new RelayRefusal("unavailable", message);
}

/** The relay table, one call; `scope` is the embedded document's (07 R5.81). Throws `RelayRefusal` or the embedding bridge's own error. */
export async function relayCall(embed: EmbedView, method: string, params: unknown, deps: RelayDeps, scope: string | null = null): Promise<unknown> {
  if (method === "context.get") {
    // As on its own URL: nothing, null or an empty object (03 §context.get).
    if (params !== null && params !== undefined && !(isRecord(params) && Object.keys(params).length === 0)) throw new RelayRefusal("invalid_params", "context.get takes no parameters");
    return { protocolVersion: 1, session: { id: embed.sessionId, title: embed.title ?? "", workspaceId: embed.workspaceId ?? "" }, page: { revision: embed.revision, readOnly: embed.readOnly }, capabilities: embeddedRoster(await deps.roster(), await deps.whole(embed)) };
  }
  if (method === "session.activity") return activityOf(embed, deps);
  if (method === "session.messages") return deps.invoke("sessions.messages", { ...(isRecord(params) ? params : {}), sessionId: embed.sessionId });
  if (method === "session.reply") {
    // The next turn's settings are the page's own session's business (U47): an embedded reply naming any is refused whole, never delivered with them dropped; one naming none is relayed without the key, since `pages.answer`'s reply has no `settings` (RS-6).
    if (isRecord(params) && isRecord(params.settings)) {
      const named = Object.keys(params.settings).filter((field) => params.settings && (params.settings as Record<string, unknown>)[field] !== undefined);
      if (named.length) throw new RelayRefusal("settings_unsupported", "A page shown inside another page cannot set the next turn's settings; send the reply without `settings`.", { reason: "settings", detail: { unsupported: named } });
      const { settings: _empty, ...rest } = params;
      return deps.answer(embed, { reply: rest });
    }
    return deps.answer(embed, { reply: params });
  }
  if (method === "session.respond") {
    if (!isRecord(params) || "decision" in params || !("answers" in params)) unavailable("A permission decision is made on the page's own URL or in the host, not inside another page.");
    return deps.answer(embed, { respond: { id: params.id, answers: params.answers } });
  }
  if (NAVIGATIONS.has(method)) {
    // An embedded page may not take the reader away by itself: only right after the reader acted in it. 02 R4.48
    if (deps.now() - embed.gestureAtMs > GESTURE_WINDOW_MS) unavailable("A page shown inside another page can only navigate right after the reader acts in it.");
    return deps.invoke(method, params);
  }
  if (FORWARDED.has(method)) return deps.invoke(method, params);
  // Its own storage and its contributors' calls, for the embedded session: the host takes the caller from the embed's answer token. 02 R4.48; 07 R5.49 (U56)
  if (AS_EMBEDDED.has(method) || isContributed(method)) {
    // Inside another session's page, only its contributors' reads; the host refuses the rest too. 02 R4.48 (U56)
    if (!(await deps.whole(embed))) {
      if (AS_EMBEDDED.has(method)) unavailable(READS_ONLY);
      const entry = (await deps.roster()).find((one) => one.method === method);
      if (entry && entry.effect !== "read") unavailable(READS_ONLY);
    }
    if (!embed.answerToken) unavailable("This page is still loading; try again in a moment.");
    return deps.asEmbedded(embed, method, params, scope);
  }
  if (method === "voice.captureAndTranscribe") unavailable("voice.captureAndTranscribe is not available inside an embedded page; the text-area Dictate control is.");
  return unavailable(`${method} is not available to a page shown inside another page.`);
}

/** `session.activity` from one `sessions.snapshot` of the embed's workspace; a session not among its first `snapshotMax` rows is `not_found`. D-15; DESIGN P18 */
async function activityOf(embed: EmbedView, deps: RelayDeps): Promise<unknown> {
  const result = (await deps.invoke("sessions.snapshot", { ...(embed.workspaceId ? { workspaceId: embed.workspaceId } : {}), includeArchived: true, includeChildren: true, limit: LIMITS.snapshotMax })) as { sessions?: unknown };
  const rows = Array.isArray(result?.sessions) ? result.sessions : [];
  const row = rows.find((entry) => isRecord(entry) && entry.id === embed.sessionId) as Record<string, unknown> | undefined;
  if (row) return { state: row.state, waiting: row.waiting ?? null, updatedAtMs: row.updatedAtMs, startedAtMs: row.startedAtMs, turnEndedAtMs: row.turnEndedAtMs ?? null, items: [] };
  throw new RelayRefusal("not_found", "This session was not found");
}
