// The embedding kernel as the embedded kernel's shell: method allow-list and rewrites (`session.activity`→`sessions.snapshot`, `session.messages`→`sessions.messages`, `session.respond{answers}`→`pages.answer{respond}`), `unavailable` for the rest (02 R4.48; DESIGN §E.8).
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
/** Kept from the embedding roster. */
const KEPT: ReadonlySet<string> = new Set(["context.get", "sessions.snapshot", "sessions.openHost", "providers.list", "workspaces.list", "pages.open", "navigation.openExternal", "session.activity", "session.messages", "session.respond", "session.reply", "voice.captureAndTranscribe"]);
export const GESTURE_WINDOW_MS = 5_000;

export function embeddedRoster(roster: Record<string, unknown>[]): Record<string, unknown>[] {
  return roster.filter((entry) => typeof entry.method === "string" && KEPT.has(entry.method) && entry.contributor === undefined);
}

function unavailable(message: string): never {
  throw new RelayRefusal("unavailable", message);
}

/** The relay table, one call. Throws `RelayRefusal` or the embedding bridge's own error. */
export async function relayCall(embed: EmbedView, method: string, params: unknown, deps: RelayDeps): Promise<unknown> {
  if (method === "context.get") {
    if (params !== null && params !== undefined) throw new RelayRefusal("invalid_params", "context.get takes no parameters");
    return { protocolVersion: 1, session: { id: embed.sessionId, title: embed.title ?? "", workspaceId: embed.workspaceId ?? "" }, page: { revision: embed.revision, readOnly: embed.readOnly }, capabilities: embeddedRoster(await deps.roster()) };
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
