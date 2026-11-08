// The page's own session: `session.activity`, `session.messages`, `session.reply`, `session.respond`, `session.usage` — never a session id (03 R5.10, R5.16–R5.17, R-C1, R-C7; DESIGN §E.4).
import { boundWaiting } from "../../../domain/capabilities/waiting.ts";
import type { MessagesParams, SessionReplyParams, SessionRespondParams } from "../../../domain/capabilities/specs.ts";
import { PageError, PUBLIC_MESSAGES, mapProviderError, notStarted } from "../../../domain/errors.ts";
import type { JsonValue } from "../../../domain/json/strict-json.ts";
import { formatPromptMessage, formatReplyMessage } from "../../../domain/submissions/message.ts";
import type { SessionRecord } from "../../../host/provider.ts";
import { startNewSession } from "../../new-session.ts";
import { deliverReply, replyIdempotencyId } from "../deliver.ts";
import { type BridgeContext, excerpt, handler, newSessionOf, senderLabel } from "../handler.ts";
import { checkFiles } from "./files.ts";
import { readTranscript } from "./messages.ts";
import { decisionRequest, executeRespond, refuseRespond } from "./respond.ts";
import { checkReplySettings, checkStartSettings, permissionModeSummary, startPermissionSummary } from "./settings.ts";

function own(context: BridgeContext): SessionRecord {
  // The dispatcher refuses every session.* method on the built-in home before a handler runs. DESIGN §E.1 step 9
  if (context.session.workspaceId === null) throw new PageError("unknown_method", "The built-in home page has no session");
  return context.session as SessionRecord;
}

export const sessionActivity = handler<{ limit: number }, unknown>({
  method: "session.activity",
  async execute(params, context) {
    // No session exists yet: an idle agent that has said nothing. 03 R-C11
    if (newSessionOf(context)) return { result: { state: "new", waiting: null, updatedAtMs: null, startedAtMs: null, turnEndedAtMs: null, items: [] } };
    const record = own(context);
    let items;
    try {
      items = await context.serving.provider.sessions.activity(record.id, params.limit);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.activity");
    }
    return {
      result: {
        state: record.state,
        waiting: boundWaiting(record.waiting, record.state),
        updatedAtMs: record.updatedAtMs,
        startedAtMs: record.startedAtMs,
        turnEndedAtMs: record.turnEndedAtMs,
        items: items.slice(-params.limit).map((item) => ({ kind: excerpt(item.kind, 80) || "item", done: item.done, atMs: item.atMs, label: excerpt(item.label, 80) || excerpt(item.kind, 80) || "item", text: excerpt(item.text, 200) })),
      },
    };
  },
});

export const sessionMessages = handler<MessagesParams, unknown>({
  method: "session.messages",
  async execute(params, context) {
    if (newSessionOf(context)) return { result: { messages: [], nextCursor: null, prevCursor: null, generatedAtMs: context.serving.now() } };
    return { result: await readTranscript(context.serving, own(context).id, params) };
  },
});

export const sessionReply = handler<SessionReplyParams, unknown>({
  method: "session.reply",
  async refuse(params, context) {
    const workspace = newSessionOf(context);
    // Before the start the paths fallback has no page root: files are native attachments or `not_started`. 03 R-C12
    if (workspace && params.files && params.files.length > 0 && !context.serving.provider.attachments) throw notStarted(PUBLIC_MESSAGES.notStartedFiles);
    checkFiles(params.files, context);
    // Its files ride on /attach under the action token before the call; a call still carrying them has not uploaded. DESIGN P29
    if (params.files && params.files.length > 0 && params.attachments === undefined) throw new PageError("invalid_params", "Upload the files first; the call then names their attachments");
    // The first message's settings are the new session's, from the default AI provider's lists, before anything starts. 03 R-C12
    if (workspace) {
      await checkStartSettings(context.serving, params.settings);
      return;
    }
    // Settings for the next turn are checked against the session's provider row before any dialog: a field or value the host cannot apply fails the whole call. 03 §`session.reply`, U47
    await checkReplySettings(context.serving, own(context), params.settings);
  },
  // `settings.permissionMode` raises the session's posture, more than one permission answer: confirmed per call like a decision, the summary naming the mode and its scope. 03 R-C7, U29, U47
  async decision(params, context) {
    if (params.settings?.permissionMode === undefined) return null;
    const workspace = newSessionOf(context);
    if (workspace) {
      const checked = await checkStartSettings(context.serving, params.settings);
      return { summary: startPermissionSummary(workspace.name, params.settings.permissionMode, checked?.permissionModeLabel ?? null) };
    }
    const record = own(context);
    const checked = await checkReplySettings(context.serving, record, params.settings);
    return checked ? { summary: permissionModeSummary(record, params.settings, checked) } : null;
  },
  async execute(params, context) {
    const workspace = newSessionOf(context);
    if (workspace) return startFromReply(params, context);
    const record = own(context);
    const delivered = await deliverReply(context.serving, { target: record.id, sender: { id: record.id, label: senderLabel(context) }, reply: params, requestId: context.requestId, attachments: context.attachments, bound: context.bound });
    return { result: delivered };
  },
});

export const sessionRespond = handler<SessionRespondParams, unknown>({
  method: "session.respond",
  async refuse(params, context) {
    refuseRespond(context, own(context), params, true);
  },
  async decision(params, context) {
    return decisionRequest(own(context), params);
  },
  async execute(params, context) {
    const record = own(context);
    return { result: await executeRespond(context.serving, record.id, params, { id: record.id, label: senderLabel(context) }, context.requestId) };
  },
});

export const sessionUsage = handler<null, unknown>({
  method: "session.usage",
  async execute(_params, context) {
    const record = own(context);
    const usage = context.serving.provider.sessions.usage;
    if (!usage) throw new PageError("unknown_method", "This host does not report usage");
    let reported;
    try {
      reported = await usage.call(context.serving.provider.sessions, record.id);
    } catch (error) {
      throw mapProviderError(error, context.serving.log, "sessions.usage");
    }
    const { used, limit } = reported.context;
    const percent = limit > 0 ? Math.min(100, Math.max(0, Math.round((used / limit) * 1000) / 10)) : 0;
    return { result: { context: { tokens: used, window: limit, percent }, ...(reported.cost ? { cost: { usd: reported.cost.usd } } : {}) } };
  },
});

/**
 * The first `session.reply` from a new-session page starts its session, worded as on any page and unframed: the
 * reader's own words to their own agent. Only beside the shell's start block, which says whether the reader's gesture
 * was there. 03 R-C12; 05 R-S13
 */
async function startFromReply(params: SessionReplyParams, context: BridgeContext) {
  const start = context.start;
  if (!start) throw notStarted(PUBLIC_MESSAGES.startNeedsReader);
  const access = { kind: "new-session" as const, identity: context.session.id, workspace: newSessionOf(context)! };
  const prompt = params.kind === "prompt" ? formatPromptMessage(params.text ?? "") : formatReplyMessage(params.title, params.result, {});
  const attachments = context.attachments ?? null;
  const settings = params.settings && Object.values(params.settings).some((value) => value !== undefined) ? params.settings : undefined;
  const print = { kind: params.kind, title: params.title ?? null, result: params.result ?? null, text: params.text ?? null, attachments: attachments ? attachments.map((item) => item.attachmentId) : null, settings: settings ? { model: settings.model ?? null, reasoningLevel: settings.reasoningLevel ?? null, permissionMode: settings.permissionMode ?? null } : null } as JsonValue;
  const started = await startNewSession(context.serving, { page: access, revision: context.page.revision, start, kind: "reply", id: replyIdempotencyId(params.idempotencyKey, context.requestId), print, prompt, settings, attachments, requestId: context.requestId, bound: context.bound });
  return { result: { delivery: "started", duplicate: started.duplicate, sessionId: started.sessionId, ...(started.settings ? { settings: started.settings } : {}) }, started: started.started };
}
