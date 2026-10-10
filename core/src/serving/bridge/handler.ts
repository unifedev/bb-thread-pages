// The handler contract as the bridge uses it: `BridgeContext` (the HandlerContext plus the request and the approved attachments), `handler()`, and the helpers every handler family shares — `excerpt`, `quoted`, `sizeLabel`, `boundTitle`, `targetSession`, `isHome` (DESIGN §E.3).
import type { NavigationDirective } from "../../domain/capabilities/protocol.ts";
import { PageError } from "../../domain/errors.ts";
import { HOME_IDENTITY } from "../../domain/ids.ts";
import { LIMITS } from "../../domain/limits.ts";
import { oneLine, quotable } from "../../domain/quotable.ts";
import type { AttachmentRef, SessionRecord } from "../../host/provider.ts";
import type { PagesRequest } from "../../host/serving.ts";
import type { CapabilityHandler, DecisionRequest, GrantRequest, HandlerContext, HomeSession } from "../context.ts";

export type { DecisionRequest, GrantRequest, HandlerContext, HomeSession };

/** What the dispatcher hands a handler beyond the frozen `HandlerContext` of DESIGN §E.3. */
export interface BridgeContext extends HandlerContext {
  /** The HTTP request, for the serving host's `surface()` (06 R8.37). */
  readonly request: PagesRequest;
  /** For `sessions.start`, `sessions.send` and `session.reply`: the attachments `/attach` held for this approved call, in order; null when the call carries none. 05 R3.20a; DESIGN P29 */
  readonly attachments: readonly AttachmentRef[] | null;
}

export interface HandlerOutcome<R> {
  readonly result: R;
  readonly navigate?: NavigationDirective;
}

/** A handler written against `BridgeContext`; assignable to `CapabilityHandler`, which the dispatcher consumes. DESIGN §E.3 */
export interface BridgeHandler<P, R> {
  readonly method: string;
  readonly confirmedBy?: "recording-bar";
  refuse?(params: P, context: BridgeContext): Promise<void>;
  summarize?(params: P, context: BridgeContext): Promise<string>;
  grant?(params: P, context: BridgeContext): Promise<GrantRequest | null>;
  decision?(params: P, context: BridgeContext): Promise<DecisionRequest | null>;
  execute(params: P, context: BridgeContext): Promise<HandlerOutcome<R>>;
}

export function handler<P, R>(definition: BridgeHandler<P, R>): CapabilityHandler<P, R> {
  return definition as unknown as CapabilityHandler<P, R>;
}

/** The home session as a handler sees it. 05 R-S12 */
export const HOME_SESSION: HomeSession = Object.freeze({ id: HOME_IDENTITY, title: "Home", archived: false, workspaceId: null });

export function isHome(context: HandlerContext): boolean {
  return context.session.id === HOME_IDENTITY;
}

/** A session's title as a framing line or a ledger entry names it: bounded, on one line, controls and bidi characters removed, quotation marks kept. 02 §Framing lines (T-22) */
export function sessionLabel(title: string): string {
  return oneLine(boundTitle(title)) || "untitled";
}

/** The sending page's label for framing lines and the ledger: its session title, or "Home". 02 §Framing lines */
export function senderLabel(context: HandlerContext): string {
  return isHome(context) ? "Home" : sessionLabel(context.session.title);
}

/** One line of at most `max` characters, cut with an ellipsis. */
export function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, Math.max(0, max - 1))}…`;
}

/** Host-foreign text inside the host's own quotation marks, unable to close them. 05 R3.22a */
export function quoted(text: string, max = 80): string {
  return `“${quotable(text, max) || "untitled"}”`;
}

/** A title as every result reports it. 08 §Limits `titleChars` */
export function boundTitle(title: string): string {
  return title.length <= LIMITS.titleChars ? title : title.slice(0, LIMITS.titleChars);
}

/** A byte count for a reader. 03 R5.78 */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A session the reader can see, as 03 R-C4 defines it: one `sessions.snapshot`
 * would list with `includeArchived` and `includeChildren` set — visible to this
 * reader, children and forks included; archived returned, `not_found` when
 * deleted or hidden. The read `sessions.messages` uses this; the writes keep
 * the stricter `targetSession`. 03 R-C4
 */
export async function visibleSession(context: HandlerContext, id: string): Promise<SessionRecord> {
  const access = await context.serving.sessionFor(id);
  if (access.kind !== "session" || !access.record.visible) throw new PageError("not_found", "That session is not available");
  return access.record;
}

/**
 * Another session as a handler may act on it: `not_found` for a deleted one
 * and for one the reader cannot see (hidden, a fork, a child); an archived
 * session is returned and the caller decides. 03 R-C4, R5.60; DESIGN §E.1 step 10
 */
export async function targetSession(context: HandlerContext, id: string): Promise<SessionRecord> {
  const access = await context.serving.sessionFor(id);
  if (access.kind !== "session") throw new PageError("not_found", "That session is not available");
  const { record } = access;
  if (!record.visible || record.forkOfId !== null || record.parentSessionId !== null) throw new PageError("not_found", "That session is not available");
  return record;
}

/** A session that exists at all, whatever the reader can see of it: `not_found` only when deleted. 03 R5.29 */
export async function existingSession(context: HandlerContext, id: string): Promise<SessionRecord> {
  const access = await context.serving.sessionFor(id);
  if (access.kind !== "session") throw new PageError("not_found", "That session is not available");
  return access.record;
}

/** The archived target of a write: `unavailable` with reason `archived`. 02 R-K8 */
export function refuseArchived(record: { archived: boolean }): void {
  if (record.archived) throw new PageError("unavailable", "That session is archived; nothing can be sent into it", { reason: "archived" });
}
