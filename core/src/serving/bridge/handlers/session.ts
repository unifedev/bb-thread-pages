// The page's own session: `session.activity`, `session.messages`, `session.reply`, `session.respond`, `session.usage` — never a session id (03 R5.10, R5.16–R5.17, R-C1, R-C7; DESIGN §E.4).
import { boundWaiting } from "../../../domain/capabilities/waiting.ts";
import type { MessagesParams, SessionReplyParams, SessionRespondParams } from "../../../domain/capabilities/specs.ts";
import { PageError, mapProviderError } from "../../../domain/errors.ts";
import type { SessionRecord } from "../../../host/provider.ts";
import { deliverReply } from "../deliver.ts";
import { type BridgeContext, excerpt, handler, senderLabel } from "../handler.ts";
import { checkFiles } from "./files.ts";
import { readTranscript } from "./messages.ts";
import { decisionRequest, executeRespond, refuseRespond } from "./respond.ts";
import { checkReplySettings, permissionModeSummary } from "./settings.ts";

function own(context: BridgeContext): SessionRecord {
  // The dispatcher refuses every session.* method on the built-in home before a handler runs. DESIGN §E.1 step 9
  if (context.session.workspaceId === null) throw new PageError("unknown_method", "The built-in home page has no session");
  return context.session as SessionRecord;
}

export const sessionActivity = handler<{ limit: number }, unknown>({
  method: "session.activity",
  async execute(params, context) {
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
    return { result: await readTranscript(context.serving, own(context).id, params) };
  },
});

export const sessionReply = handler<SessionReplyParams, unknown>({
  method: "session.reply",
  async refuse(params, context) {
    checkFiles(params.files, context);
    // Its files ride on /attach under the action token before the call; a call still carrying them has not uploaded. DESIGN P29
    if (params.files && params.files.length > 0 && params.attachments === undefined) throw new PageError("invalid_params", "Upload the files first; the call then names their attachments");
    // Settings for the next turn are checked against the session's provider row before any dialog: a field or value the host cannot apply fails the whole call. 03 §`session.reply`, U47
    await checkReplySettings(context.serving, own(context), params.settings);
  },
  // `settings.permissionMode` raises the session's posture, more than one permission answer: confirmed per call like a decision, the summary naming the mode and its scope. 03 R-C7, U29, U47
  async decision(params, context) {
    if (params.settings?.permissionMode === undefined) return null;
    const record = own(context);
    const checked = await checkReplySettings(context.serving, record, params.settings);
    return checked ? { summary: permissionModeSummary(record, params.settings, checked) } : null;
  },
  async execute(params, context) {
    const record = own(context);
    const delivered = await deliverReply(context.serving, { target: record.id, sender: { id: record.id, label: senderLabel(context) }, reply: params, requestId: context.requestId, attachments: context.attachments });
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
