// Other sessions: `sessions.snapshot`, `sessions.messages`, `sessions.start`, `sessions.send`, `sessions.stop`, `sessions.archive`, `sessions.markRead`, `sessions.respond`, `sessions.openHost` (03 §Core, §Optional; DESIGN §E.4).
import type { MessagesParams, SessionsRespondParams, SessionsSendParams, SessionsStartParams, SnapshotParams } from "../../../domain/capabilities/specs.ts";
import { boundWaiting } from "../../../domain/capabilities/waiting.ts";
import { PageError, boundNotice, mapProviderError } from "../../../domain/errors.ts";
import { encodeCursor } from "../../../domain/messages/cursor.ts";
import { LIMITS } from "../../../domain/limits.ts";
import type { ProviderChoice, SessionRecord } from "../../../host/provider.ts";
import { grantSummary, recordGrant } from "../grants-request.ts";
import { type BridgeContext, boundTitle, excerpt, existingSession, handler, quoted, refuseArchived, senderLabel, targetSession, visibleSession } from "../handler.ts";
import { checkFiles, checkFilesFit, fitSummary } from "./files.ts";
import { providerCursor, readTranscript } from "./messages.ts";
import { decisionRequest, executeRespond, refuseRespond } from "./respond.ts";
import { knownSettings } from "./settings.ts";

// --- reads -------------------------------------------------------------------

export const sessionsSnapshot = handler<SnapshotParams, unknown>({
  method: "sessions.snapshot",
  async execute(params, context) {
    const { serving } = context;
    const caller = context.session.id;
    const cursor = providerCursor(serving, caller, params.cursor ?? undefined);
    let listed: { sessions: SessionRecord[]; nextCursor: string | null };
    try {
      listed = await serving.provider.sessions.list({
        ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
        includeArchived: params.includeArchived,
        includeChildren: params.includeChildren,
        limit: params.limit,
        ...(cursor !== undefined ? { cursor } : {}),
      });
    } catch (error) {
      throw mapProviderError(error, serving.log, "sessions.list");
    }
    const rows = listed.sessions.filter((record) => record.visible && (params.includeArchived || !record.archived) && (params.includeChildren || record.parentSessionId === null)).slice(0, params.limit);
    const sessions = await Promise.all(
      rows.map(async (record) => {
        const available = await serving.pages.available(record.id).catch(() => false);
        return {
          id: record.id,
          title: boundTitle(record.title),
          workspaceId: record.workspaceId,
          parentSessionId: record.parentSessionId,
          state: record.state,
          status: record.state,
          waiting: boundWaiting(record.waiting, record.state),
          archived: record.archived,
          page: { available, revision: available ? serving.pages.knownRevision(record.id) : null },
          updatedAtMs: record.updatedAtMs,
          startedAtMs: record.startedAtMs,
          turnEndedAtMs: record.turnEndedAtMs,
          ...(record.unread !== undefined ? { unread: record.unread } : {}),
          ...(record.attentionAtMs !== undefined ? { attentionAtMs: record.attentionAtMs } : {}),
          ...settingsRow(record),
        };
      }),
    );
    return { result: { sessions, nextCursor: listed.nextCursor !== null ? encodeCursor(caller, listed.nextCursor, serving.signingKey) : null, generatedAtMs: serving.now() } };
  },
});

/** The row's `settings` where the host knows the session's current values (U50); the key is absent otherwise. */
function settingsRow(record: SessionRecord): { settings?: NonNullable<SessionRecord["settings"]> } {
  const settings = knownSettings(record);
  return settings ? { settings } : {};
}

export const sessionsMessages = handler<MessagesParams & { sessionId: string }, unknown>({
  method: "sessions.messages",
  /** Any session the snapshot would list, children and forks included; the writes below keep `targetSession`. 03 R-C4 */
  async refuse(params, context) {
    await visibleSession(context, params.sessionId);
  },
  async execute(params, context) {
    const { sessionId, ...rest } = params;
    return { result: await readTranscript(context.serving, sessionId, rest) };
  },
});

// --- starting and steering work --------------------------------------------------

interface ResolvedStart {
  workspace: { id: string; name: string; environments?: { id: string; name: string; isDefault: boolean }[] };
  ambiguous: boolean;
  provider: string;
  model: string;
  environment: string;
}

async function providerChoices(context: BridgeContext): Promise<ProviderChoice[] | null> {
  const providers = context.serving.provider.providers;
  if (!providers) return null;
  try {
    return await providers.list();
  } catch (error) {
    throw mapProviderError(error, context.serving.log, "providers.list");
  }
}

/** The workspace, environment, provider and model a start resolves to, each refused before any dialog. 03 R5.20–R5.25 */
async function resolveStart(params: SessionsStartParams, context: BridgeContext): Promise<ResolvedStart> {
  let workspaces;
  try {
    workspaces = await context.serving.provider.workspaces.list();
  } catch (error) {
    throw mapProviderError(error, context.serving.log, "workspaces.list");
  }
  const workspace = workspaces.find((candidate) => candidate.id === params.workspaceId);
  if (!workspace) throw new PageError("not_found", "That workspace is not available; list the workspaces again");
  const ambiguous = workspaces.filter((candidate) => candidate.name === workspace.name).length > 1;
  let environment = "the workspace's default";
  if (params.environment !== undefined) {
    const found = workspace.environments?.find((candidate) => candidate.id === params.environment);
    if (!found) throw new PageError("invalid_params", workspace.environments ? "environment is not one of the workspace's environments" : "This workspace has no environments; omit environment");
    environment = quoted(found.name, 40);
  } else {
    const fallback = workspace.environments?.find((candidate) => candidate.isDefault);
    if (fallback) environment = quoted(fallback.name, 40);
  }
  let provider = params.providerId ?? "the host's default";
  let model = params.model ?? "the host's default";
  const choices = await providerChoices(context);
  if (choices) {
    const chosen = params.providerId !== undefined ? choices.find((candidate) => candidate.id === params.providerId) : (choices.find((candidate) => candidate.default) ?? choices[0]);
    if (!chosen) throw new PageError("invalid_params", "providerId is not one of providers.list");
    provider = chosen.id;
    if (params.model !== undefined) {
      if (!chosen.models.some((candidate) => candidate.id === params.model)) throw new PageError("invalid_params", "model is not one of the provider's models");
    } else {
      model = chosen.models.find((candidate) => candidate.default)?.id ?? model;
    }
    if (params.permissionMode !== undefined && chosen.permissionModes && !chosen.permissionModes.some((candidate) => candidate.id === params.permissionMode)) throw new PageError("invalid_params", "permissionMode is not one of the provider's permission modes");
  }
  return { workspace, ambiguous, provider, model, environment };
}

function startHead(resolved: ResolvedStart, params: SessionsStartParams): (length: number) => string {
  const where = `${quotable(resolved.workspace.name, 60)}${resolved.ambiguous ? ` (id ${resolved.workspace.id})` : ""}`;
  return (length) => `Start a session in ${where}: ${quoted(params.prompt, length)} — provider ${excerpt(resolved.provider, 40)}, model ${excerpt(resolved.model, 40)}, environment ${resolved.environment}`;
}

function quotable(text: string, max: number): string {
  return quoted(text, max).slice(1, -1);
}

export const sessionsStart = handler<SessionsStartParams, unknown>({
  method: "sessions.start",
  async refuse(params, context) {
    checkFiles(params.files, context);
    const resolved = await resolveStart(params, context);
    checkFilesFit(startHead(resolved, params), params.files);
  },
  async summarize(params, context) {
    return fitSummary(startHead(await resolveStart(params, context), params), params.files);
  },
  async execute(params, context) {
    const { serving } = context;
    if (params.files && params.files.length > 0 && !context.attachments) throw new PageError("confirmation_invalid", "The approved files were not uploaded");
    const attachments = context.attachments ? [...context.attachments] : undefined;
    try {
      const started = await serving.provider.sessions.start({
        workspaceId: params.workspaceId,
        prompt: params.prompt,
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.providerId !== undefined ? { providerId: params.providerId } : {}),
        ...(params.model !== undefined ? { model: params.model } : {}),
        ...(params.reasoningLevel !== undefined ? { reasoningLevel: params.reasoningLevel } : {}),
        ...(params.permissionMode !== undefined ? { permissionMode: params.permissionMode } : {}),
        ...(params.environment !== undefined ? { environment: params.environment } : {}),
        ...(attachments ? { attachments } : {}),
      });
      return { result: { sessionId: started.id } };
    } catch (error) {
      throw mapProviderError(error, serving.log, "sessions.start");
    }
  },
});

function sendHead(target: SessionRecord, params: SessionsSendParams): (length: number) => string {
  return (length) => `Send to ${quoted(target.title, 60)} (${target.id}): ${quoted(params.prompt, length)}${params.mode === "steer" ? ", interrupting its current turn" : ""}`;
}

export const sessionsSend = handler<SessionsSendParams, unknown>({
  method: "sessions.send",
  async refuse(params, context) {
    if (params.sessionId === context.session.id) throw new PageError("invalid_params", "Use session.reply to answer this page's own session");
    const target = await targetSession(context, params.sessionId);
    refuseArchived(target);
    checkFiles(params.files, context);
    checkFilesFit(sendHead(target, params), params.files);
  },
  async summarize(params, context) {
    return fitSummary(sendHead(await targetSession(context, params.sessionId), params), params.files);
  },
  async execute(params, context) {
    const { serving } = context;
    if (params.files && params.files.length > 0 && !context.attachments) throw new PageError("confirmation_invalid", "The approved files were not uploaded");
    const attachments = context.attachments ? [...context.attachments] : undefined;
    let sent;
    try {
      sent = await serving.provider.sessions.send(params.sessionId, params.prompt, params.mode, attachments);
    } catch (error) {
      throw mapProviderError(error, serving.log, "sessions.send");
    }
    serving.ledger.note(params.sessionId, { requestId: context.requestId, ...(sent.messageId !== undefined ? { messageId: sent.messageId } : {}), text: params.prompt, label: senderLabel(context), sentAtMs: serving.now() });
    return { result: { sessionId: params.sessionId, delivery: sent.delivery, duplicate: false } };
  },
});

export const sessionsStop = handler<{ sessionId: string }, unknown>({
  method: "sessions.stop",
  async refuse(params, context) {
    if (params.sessionId === context.session.id) throw new PageError("invalid_params", "A page cannot stop its own session: that would kill the turn about to read its answer");
    await targetSession(context, params.sessionId);
  },
  async summarize(params, context) {
    const target = await targetSession(context, params.sessionId);
    return `Stop ${quoted(target.title, 60)} (${target.id})?`;
  },
  async execute(params, context) {
    try {
      await context.serving.provider.sessions.stop(params.sessionId);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.stop");
    }
    return { result: { stopped: true } };
  },
});

export const sessionsArchive = handler<{ sessionId: string }, unknown>({
  method: "sessions.archive",
  async refuse(params, context) {
    // Archiving the page's own session from the page would turn the page read-only under the reader's hands; the home page is the route. DESIGN P7
    if (params.sessionId === context.session.id) throw new PageError("invalid_params", "A page cannot archive its own session; the reader archives it from the home page");
    await targetSession(context, params.sessionId);
  },
  async summarize(params, context) {
    const target = await targetSession(context, params.sessionId);
    return `Archive ${quoted(target.title, 60)} (${target.id})?`;
  },
  async execute(params, context) {
    const archive = context.serving.provider.sessions.archive;
    if (!archive) throw new PageError("unknown_method", "This host does not archive sessions from a page");
    try {
      await archive.call(context.serving.provider.sessions, params.sessionId);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.archive");
    }
    return { result: { archived: true } };
  },
});

export const sessionsMarkRead = handler<{ sessionId: string; read: boolean }, unknown>({
  method: "sessions.markRead",
  async refuse(params, context) {
    await targetSession(context, params.sessionId);
  },
  async execute(params, context) {
    const markRead = context.serving.provider.sessions.markRead;
    if (!markRead) throw new PageError("unknown_method", "This host has no read marks");
    try {
      await markRead.call(context.serving.provider.sessions, params.sessionId, params.read);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.markRead");
    }
    const after = await existingSession(context, params.sessionId);
    return { result: { sessionId: params.sessionId, unread: after.unread ?? false } };
  },
});

/** What the shell's `directiveOf` accepts for a host navigation: `/`-relative or http(s). */
const navigableHostUrl = (url: unknown): boolean => typeof url === "string" && (url.startsWith("/") || /^https?:\/\//i.test(url));

export const sessionsOpenHost = handler<{ sessionId: string }, unknown>({
  method: "sessions.openHost",
  async refuse(params, context) {
    await existingSession(context, params.sessionId);
  },
  async execute(params, context) {
    const openHost = context.serving.provider.sessions.openHost;
    if (!openHost) throw new PageError("unknown_method", "This host has no application to open a session in");
    let opened;
    try {
      opened = await openHost.call(context.serving.provider.sessions, params.sessionId);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.openHost");
    }
    // The host's canonical address for that session, which may differ by workspace. 03 R5.31a
    if ("url" in opened) {
      // The shell navigates to `/`-relative and http(s) addresses only (`directiveOf`); any other scheme would be dropped there and the reader would see nothing
      // while the result said `opened: true` (a host's app-scheme deep link did exactly that, fix round 3). Said here instead, and logged for the host.
      if (!navigableHostUrl(opened.url)) {
        context.serving.log.warn(`sessions.openHost: the provider answered a URL the shell cannot open (${String(opened.url).split(":")[0]}:); told the reader`);
        return { result: { opened: false, notice: "This host gave an address the page cannot open." } };
      }
      return { result: { opened: true }, navigate: { kind: "host", url: opened.url } };
    }
    // Nowhere to open it from here: `{ opened: false, notice }`, the host's line, not an error (fix round 2).
    return opened.opened ? { result: { opened: true } } : { result: { opened: false, notice: boundNotice(opened.notice) } };
  },
});

// --- respond -------------------------------------------------------------------

async function respondTarget(params: SessionsRespondParams, context: BridgeContext): Promise<SessionRecord> {
  if (params.sessionId === context.session.id) throw new PageError("invalid_params", "Use session.respond to answer this page's own session");
  return targetSession(context, params.sessionId);
}

export const sessionsRespond = handler<SessionsRespondParams, unknown>({
  method: "sessions.respond",
  async refuse(params, context) {
    const target = await respondTarget(params, context);
    const held = params.answers !== undefined && (await context.serving.grants.has(context.session.id, target.id));
    refuseRespond(context, target, params, held);
  },
  /** `answers` into another session: the pair grant, shared with `pages.answer`. 03 R5.64, U14 */
  async grant(params, context) {
    if (params.answers === undefined || !context.serving.settings().embedAnswerGrants) return null;
    const target = await respondTarget(params, context);
    if (await context.serving.grants.has(context.session.id, target.id)) return null;
    return { summary: grantSummary(context, target), target: { sessionId: target.id, title: boundTitle(target.title) }, record: () => recordGrant(context, target.id) };
  },
  async decision(params, context) {
    return decisionRequest(await respondTarget(params, context), params);
  },
  async execute(params, context) {
    const target = await respondTarget(params, context);
    const { sessionId: _target, ...rest } = params;
    const result = await executeRespond(context.serving, target.id, rest, { id: context.session.id, label: senderLabel(context) }, context.requestId);
    if (params.answers !== undefined) await context.serving.grants.touch(context.session.id, target.id);
    return { result };
  },
});
