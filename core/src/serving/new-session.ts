// The new-session page (05 R-S13): which workspaces offer one (06 R-P17), its document (the seed with `{title}` the
// workspace's name, else 04 R6.19's host document), the shell and the document routes, and the start — the first
// message from it starts the session through the provider, writes the document it showed and the storage it held into
// the new page root, and answers with the session's token and document address for the shell (02 R-K10, R-K11; 03
// R-C11–R-C13; 01 §Lifecycle step 0, R1.13b).
import { hasSeed, renderSeed } from "../agent/seed.ts";
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, errorText, mapProviderError, notStarted } from "../domain/errors.ts";
import { fingerprint } from "../domain/json/canonical.ts";
import { isJsonObject, utf8Bytes, type JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS, kibibytes } from "../domain/limits.ts";
import { isEntityId, isOpening, isStorageKey, newSessionIdentity, newSessionWorkspaceOf } from "../domain/ids.ts";
import { EMPTY_REVISION } from "../domain/revision.ts";
import { isCanonicalScope } from "../domain/scope.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import { mintRenderToken } from "../domain/tokens/render-token.ts";
import type { AppliedSettings, AttachmentRef, ProviderHost, ReplySettings } from "../host/provider.ts";
import { assembleDocument } from "../pages/assemble.ts";
import { HELD_SCOPES_MAX } from "../runtime/shared/envelopes.ts";
import type { PageFileIo } from "../pages/include.ts";
import type { HostBound } from "./action-request.ts";
import { boundTitle } from "./bridge/handler.ts";
import type { NewSessionWorkspace, ServingContext, SessionAccess } from "./context.ts";
import { EMPTY_DOCUMENT } from "./empty-page.ts";

/** What the provider says of one workspace's new-session page. 06 R-P17 */
export type NewSessionLookup = { kind: "offered"; workspace: NewSessionWorkspace } | { kind: "unlisted" } | { kind: "not-offered" };

/**
 * Whether a workspace offers a new-session page: one `workspaces.list` lists (the reader can see it), for which
 * `workspaces.newSession` names a folder. The provider is asked about a listed workspace only. 06 R-P17; 03 R-C5
 */
export async function lookupNewSession(provider: ProviderHost, workspaceId: string, log?: ServingContext["log"]): Promise<NewSessionLookup> {
  if (!isEntityId(workspaceId)) return { kind: "unlisted" };
  let listed;
  try {
    listed = (await provider.workspaces.list()).find((workspace) => workspace.id === workspaceId);
  } catch (error) {
    throw mapProviderError(error, log, "workspaces.list");
  }
  if (!listed) return { kind: "unlisted" };
  const offer = provider.workspaces.newSession;
  if (!offer) return { kind: "not-offered" };
  let folder;
  try {
    folder = await offer.call(provider.workspaces, workspaceId);
  } catch (error) {
    throw mapProviderError(error, log, "workspaces.newSession");
  }
  if (!folder || typeof folder.path !== "string") return { kind: "not-offered" };
  return { kind: "offered", workspace: { id: workspaceId, name: boundTitle(listed.name), path: folder.path, machine: folder.machine ?? null } };
}

/** The access a new-session identity names, or `not_found` — R2.5's answer — where the workspace offers none now. 05 R-S13 */
export async function newSessionAccess(provider: ProviderHost, identity: string, log?: ServingContext["log"]): Promise<SessionAccess> {
  const workspaceId = newSessionWorkspaceOf(identity);
  if (workspaceId === null) throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  const found = await lookupNewSession(provider, workspaceId, log);
  if (found.kind !== "offered") throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  return { kind: "new-session", identity, workspace: found.workspace };
}

/** A page root with nothing in it: before its session starts, a new-session page has none. */
const NO_FILES: PageFileIo = { read: async () => null, stat: async () => null, list: async () => null };

/** The document a new-session page shows: `authored` is what the start writes as the entry document (null: nothing). */
export interface NewSessionDocument {
  readonly authored: string | null;
  /** As served, before the kernel: what the revision covers. */
  readonly html: string;
  readonly revision: string;
}

/**
 * The operator's seed with `{title}` the workspace's name (escaped), assembled as any page's entry document so its
 * revision is the one the session's page has once the start writes it; else 04 R6.19's host document under
 * `EMPTY_REVISION`, which the start writes nothing for. 05 R-S13; 04 R6.18–R6.21
 */
export async function newSessionDocument(ctx: ServingContext, workspace: NewSessionWorkspace): Promise<NewSessionDocument> {
  const seed = ctx.settings().seed;
  if (!hasSeed(seed)) return { authored: null, html: EMPTY_DOCUMENT, revision: EMPTY_REVISION };
  const authored = renderSeed(seed, workspace.name);
  const assembled = await assembleDocument(NO_FILES, authored, null, ctx.strategy.kind);
  return { authored, html: assembled.html, revision: assembled.revision };
}

/** Where the shell loads a new-session page's document, on every serving host. 05 §Routes */
export function newSessionDocumentUrl(ctx: ServingContext, workspace: NewSessionWorkspace, revision: string): string {
  const render = mintRenderToken({ session: newSessionIdentity(workspace.id), revision, path: null, now: ctx.now() }, ctx.signingKey).token;
  return `${ctx.serving.base()}/new-session-document?workspace=${encodeURIComponent(workspace.id)}&render=${encodeURIComponent(render)}`;
}

/** The workspace a new-session address names: `workspace` alone, once, and nothing else in the address. 05 R-S13 */
export function newSessionAddress(params: URLSearchParams, also: readonly string[] = []): string {
  const names = [...params.keys()];
  const values = params.getAll("workspace");
  if (values.length !== 1 || !values[0] || names.some((name) => name !== "workspace" && !also.includes(name)) || also.some((name) => params.getAll(name).length > 1)) throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  return values[0];
}

/** The page access a new-session address names, or R2.5's `not_found`. 05 R-S13 */
export async function requireNewSession(ctx: ServingContext, workspaceId: string): Promise<Extract<SessionAccess, { kind: "new-session" }>> {
  const access = await newSessionAccess(ctx.provider, newSessionIdentity(workspaceId), ctx.log);
  return access as Extract<SessionAccess, { kind: "new-session" }>;
}

// --- the start ------------------------------------------------------------------------

/** One scope's storage the open page held, as the start carries it. 03 R-C13 */
export interface HeldDocument {
  readonly scope: string | null;
  readonly entries: Readonly<Record<string, JsonValue>>;
}

/** What the shell sends with the start, and only with it: the opening, whether the reader's gesture was there, the held storage. 02 R-K11; 05 R-S13 */
export interface StartBlock {
  readonly opening: string;
  readonly gesture: boolean;
  readonly held: readonly HeldDocument[];
}


/**
 * The start block as the envelope carries it, checked whole: exact keys, an opening id, the held storage one document
 * per distinct scope, each key a storage key, each value within `storageValueBytes` and the whole within
 * `storagePageBytes` across scopes, as the page's own storage is bounded. 03 R5.18–R5.19, R-C6, R-C13
 */
export function parseStartBlock(value: unknown): StartBlock {
  const invalid = (message: string) => new PageError("invalid_request", `The start is malformed: ${message}`);
  if (!isJsonObject(value)) throw invalid("not an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "gesture,held,opening") throw invalid("it has the wrong keys");
  if (!isOpening(value.opening)) throw invalid("no usable opening");
  if (typeof value.gesture !== "boolean") throw invalid("gesture is not a boolean");
  const held = value.held;
  if (!Array.isArray(held) || held.length > HELD_SCOPES_MAX) throw invalid("held is not a list of scopes");
  const seen = new Set<string>();
  const documents: HeldDocument[] = [];
  let total = 0;
  for (const entry of held) {
    if (!isJsonObject(entry) || Object.keys(entry).sort().join(",") !== "entries,scope") throw invalid("a held scope has the wrong keys");
    const scope = entry.scope;
    if (scope !== null && !isCanonicalScope(scope)) throw invalid("a held scope is not a canonical folder");
    const name = scope ?? "";
    if (seen.has(name)) throw invalid("a scope is held twice");
    seen.add(name);
    if (!isJsonObject(entry.entries)) throw invalid("a held scope's entries are not an object");
    for (const [key, item] of Object.entries(entry.entries)) {
      if (!isStorageKey(key)) throw invalid(`"${String(key).slice(0, 40)}" is not a storage key`);
      if (utf8Bytes(JSON.stringify(item)) > LIMITS.storageValueBytes) throw new PageError("request_too_large", `A storage value is at most ${kibibytes(LIMITS.storageValueBytes)} serialised; "${key}" is larger`);
    }
    if (Object.keys(entry.entries).length > 0) total += utf8Bytes(JSON.stringify(entry.entries));
    if (total > LIMITS.storagePageBytes) throw new PageError("request_too_large", `A page's storage is at most ${kibibytes(LIMITS.storagePageBytes)} across its scopes`);
    documents.push({ scope: scope as string | null, entries: entry.entries as Record<string, JsonValue> });
  }
  return { opening: value.opening, gesture: value.gesture, held: documents };
}

/** For the shell only, beside the page's result: the session's token and document address. 05 R-S13; 02 R-K11 */
export interface StartedTransport {
  session: string;
  actionToken: string;
  expiresAt: number;
  documentUrl: string;
  filesUrl: string | null;
  siteRoot: string | null;
}

export interface StartArgs {
  page: Extract<SessionAccess, { kind: "new-session" }>;
  /** The revision the page was served, from its token. */
  revision: string;
  start: StartBlock;
  /** The delivery the start is remembered under: a reply's key (or its request id), a form's submission id. 03 R5.17 */
  kind: "reply" | "submit";
  id: string;
  /** Everything the message says, so a repeat with other content is a `conflict`. */
  print: JsonValue;
  prompt: string;
  settings?: ReplySettings | undefined;
  attachments?: readonly AttachmentRef[] | null | undefined;
  requestId: string;
  bound?: HostBound | undefined;
}

export interface Started {
  readonly sessionId: string;
  readonly duplicate: boolean;
  readonly settings?: AppliedSettings;
  readonly started: StartedTransport;
}

/**
 * The first message from a new-session page starts its session, once per (opening, kind, key): without the reader's
 * gesture only a repeat of a start this opening already made is answered (duplicate) and nothing starts; else the
 * provider's start runs with the message as its prompt and the settings and attachments it names, then — before the
 * answer — the document the page showed is written as the entry document (only if absent; nothing for R6.19's host
 * document) and the held storage into the session's namespace, per scope. A start is never undone: a write that fails
 * after it is logged and the answer is still `started`. 03 R-C12, R-C13; 05 R-S13
 */
export async function startNewSession(ctx: ServingContext, args: StartArgs): Promise<Started> {
  const { page, start } = args;
  args.bound?.check();
  const run = async (): Promise<{ sessionId: string; settings?: AppliedSettings }> => {
    if (!start.gesture) throw notStarted(PUBLIC_MESSAGES.startNeedsReader);
    // The document is the one the page was served, or the call was refused `stale_page` before this. 05 R2.13
    const document = await newSessionDocument(ctx, page.workspace);
    args.bound?.check();
    let id: string;
    try {
      ({ id } = await ctx.provider.sessions.start({
        workspaceId: page.workspace.id,
        prompt: args.prompt,
        ...(args.settings?.model !== undefined ? { model: args.settings.model } : {}),
        ...(args.settings?.reasoningLevel !== undefined ? { reasoningLevel: args.settings.reasoningLevel } : {}),
        ...(args.settings?.permissionMode !== undefined ? { permissionMode: args.settings.permissionMode } : {}),
        ...(args.attachments && args.attachments.length > 0 ? { attachments: [...args.attachments] } : {}),
      }));
    } catch (error) {
      throw mapProviderError(error, ctx.log, `sessions.start ${page.workspace.id}`);
    }
    ctx.log.info(`new-session page ${page.identity}: started session ${id}`);
    ctx.ledger.note(id, { requestId: args.requestId, text: args.prompt, label: page.workspace.name, sentAtMs: ctx.now() });
    if (document.authored !== null && document.revision === args.revision) {
      try {
        await ctx.provider.files.write(id, ENTRY_DOCUMENT, new TextEncoder().encode(document.authored), { onlyIfAbsent: true });
      } catch (error) {
        // `conflict`: the agent wrote its page first; it is the session's now. 04 R6.4
        if (!(error instanceof Error && error.name === "ProviderError" && (error as { code?: unknown }).code === "conflict")) ctx.log.warn(`new-session page ${page.identity}: the document shown was not written into session ${id}: ${errorText(error)}`);
      }
    }
    for (const held of start.held) {
      if (Object.keys(held.entries).length === 0) continue;
      try {
        await ctx.storage.put(id, held.scope, held.entries);
      } catch (error) {
        ctx.log.warn(`new-session page ${page.identity}: the storage held for scope "${held.scope ?? ""}" was not written into session ${id}: ${errorText(error)}`);
      }
    }
    const settings = args.settings ? scopesOf(args.settings) : undefined;
    return { sessionId: id, ...(settings ? { settings } : {}) };
  };
  const remembered = ctx.idempotency.remember({ session: `${page.identity}#${start.opening}`, kind: args.kind, id: args.id }, fingerprint(args.print), run, ctx.now());
  if (remembered.kind === "conflict") throw new PageError("conflict", "This idempotency key was already used with a different message");
  const outcome = (await remembered.outcome) as { sessionId: string; settings?: AppliedSettings };
  return { sessionId: outcome.sessionId, duplicate: remembered.kind === "duplicate", ...(outcome.settings ? { settings: outcome.settings } : {}), started: await startedTransport(ctx, outcome.sessionId) };
}

/** Each setting the first message names holds for the session it starts. 03 R-C12 */
function scopesOf(settings: ReplySettings): AppliedSettings | undefined {
  const scopes: AppliedSettings = {};
  for (const field of ["model", "reasoningLevel", "permissionMode"] as const) if (settings[field] !== undefined) scopes[field] = "session";
  return Object.keys(scopes).length > 0 ? scopes : undefined;
}

/** The session's own token for its entry document's current revision, and where its document and files are. 05 R-S13 */
async function startedTransport(ctx: ServingContext, sessionId: string): Promise<StartedTransport> {
  const revision = await ctx.currentRevision(sessionId, null).catch(() => EMPTY_REVISION);
  const action = mintActionToken({ session: sessionId, revision, path: null, now: ctx.now() }, ctx.signingKey);
  const render = mintRenderToken({ session: sessionId, revision, path: null, now: ctx.now() }, ctx.signingKey).token;
  return { session: sessionId, actionToken: action.token, expiresAt: action.payload.exp, documentUrl: ctx.strategy.documentUrl(sessionId, null, "", render), filesUrl: ctx.strategy.filesUrl(sessionId), siteRoot: ctx.strategy.siteRoot(sessionId, null) };
}
