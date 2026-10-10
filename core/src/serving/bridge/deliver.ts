// The one delivery path every answer takes — a submission, a reply, a prompt — with the idempotency record, the wording, the framing lines and the ledger entry shared by `/submit`, `session.reply` and `pages.answer` (03 R5.61; DESIGN §E.5, §E.8).
import { PageError, PUBLIC_MESSAGES, mapProviderError, settingsUnsupported } from "../../domain/errors.ts";
import { fingerprint } from "../../domain/json/canonical.ts";
import type { JsonValue } from "../../domain/json/strict-json.ts";
import { formatPromptMessage, formatReplyMessage, formatSubmissionMessage, type Framing } from "../../domain/submissions/message.ts";
import type { Answer, SubmissionFile } from "../../domain/submissions/parse.ts";
import type { AppliedSettings, AttachmentRef, ReplySettings } from "../../host/provider.ts";
import { matchSubmissionForm } from "../../pages/forms.ts";
import type { ServingContext } from "../context.ts";

/** Who sends: the page's session (or the built-in home) and the label a framing line names. 02 §Framing lines */
export interface Sender {
  readonly id: string;
  readonly label: string;
}

export interface ReplyToDeliver {
  readonly kind: "result" | "prompt";
  readonly title?: string;
  readonly mode: "queue" | "steer";
  readonly result?: JsonValue;
  readonly text?: string;
  readonly idempotencyKey?: string;
  /** The next turn's settings, already checked against the provider's roster (handlers/settings.ts). U47 */
  readonly settings?: ReplySettings;
}

export interface SubmissionToDeliver {
  readonly submissionId: string;
  readonly title: string;
  readonly writtenAgainst: string;
  readonly formId: string | null;
  readonly formTitle: string | null;
  /** The submitter's value; null when the form was sent another way. 05 R2.36 */
  readonly action: string | null;
  readonly answers: readonly Answer[];
  readonly files: readonly SubmissionFile[];
}

export interface Delivered {
  readonly delivery: "started" | "queued" | "steered";
  readonly duplicate: boolean;
  /** What the provider applied, each with its scope; present only when the reply named settings. U47 */
  readonly settings?: AppliedSettings;
}

export interface DeliveredSubmission extends Delivered {
  readonly matchedRevision: string;
  readonly revisionChanged: boolean;
}

function framingFor(sender: Sender, target: string, earlierVersion = false): Framing {
  const framing: { sentFrom?: string; earlierVersion?: boolean } = {};
  if (sender.id !== target) framing.sentFrom = sender.label;
  if (earlierVersion) framing.earlierVersion = true;
  return framing;
}

/** The idempotency id of a reply: the page's key, else the request id (a retried request delivers once). 03 R5.17 */
export function replyIdempotencyId(idempotencyKey: string | undefined, requestId: string): string {
  return idempotencyKey ?? `request:${requestId}`;
}

async function send(ctx: ServingContext, target: string, text: string, mode: "queue" | "steer", sender: Sender, requestId: string, attachments?: readonly AttachmentRef[], settings?: ReplySettings): Promise<{ delivery: "started" | "queued" | "steered"; settings?: AppliedSettings }> {
  let sent: { delivery: "started" | "queued" | "steered"; messageId?: string; settings?: AppliedSettings };
  try {
    sent = await ctx.provider.sessions.send(target, text, mode, attachments ? [...attachments] : undefined, settings);
  } catch (error) {
    throw mapProviderError(error, ctx.log, `sessions.send ${target}`);
  }
  ctx.ledger.note(target, { requestId, ...(sent.messageId !== undefined ? { messageId: sent.messageId } : {}), text, label: sender.label, sentAtMs: ctx.now() });
  if (settings) {
    // The host never delivers with a setting silently dropped: every field asked for must come back applied. 03 §`session.reply`, U47
    const dropped = (Object.keys(settings) as (keyof ReplySettings)[]).filter((field) => settings[field] !== undefined && sent.settings?.[field] === undefined);
    if (dropped.length) {
      ctx.log.error(`sessions.send ${target}: the provider applied no scope for ${dropped.join(", ")} after delivering; the roster or the provider's send is wrong`);
      throw settingsUnsupported(dropped);
    }
    return { delivery: sent.delivery, settings: sent.settings ?? {} };
  }
  return { delivery: sent.delivery };
}

/**
 * A `session.reply` into `target`, worded by kind, framed when the sender
 * is another session, remembered under (target, "reply", key). 03 R5.16–R5.17, R-C8, R5.61
 */
export async function deliverReply(ctx: ServingContext, args: { target: string; sender: Sender; reply: ReplyToDeliver; requestId: string; attachments?: readonly AttachmentRef[] | null }): Promise<Delivered> {
  const { reply, target, sender } = args;
  const framing = framingFor(sender, target);
  const text = reply.kind === "prompt" ? formatPromptMessage(reply.text ?? "", framing) : formatReplyMessage(reply.title, reply.result, framing);
  const attachments = args.attachments ?? undefined;
  const settings = reply.settings && Object.values(reply.settings).some((value) => value !== undefined) ? reply.settings : undefined;
  const print = fingerprint({ kind: reply.kind, title: reply.title ?? null, mode: reply.mode, result: reply.result ?? null, text: reply.text ?? null, attachments: attachments ? attachments.map((item) => item.attachmentId) : null, settings: settings ? { model: settings.model ?? null, reasoningLevel: settings.reasoningLevel ?? null, permissionMode: settings.permissionMode ?? null } : null });
  const remembered = ctx.idempotency.remember({ session: target, kind: "reply", id: replyIdempotencyId(reply.idempotencyKey, args.requestId) }, print, () => send(ctx, target, text, reply.mode, sender, args.requestId, attachments, settings), ctx.now());
  if (remembered.kind === "conflict") throw new PageError("conflict", "This idempotency key was already used with a different reply");
  const outcome = await remembered.outcome;
  return { delivery: outcome.delivery, duplicate: remembered.kind === "duplicate", ...(outcome.settings ? { settings: outcome.settings } : {}) };
}

/**
 * A form answer into `target`'s document at `path`: matched by the one rule
 * of `matchSubmissionForm` — by identity in the current revision, an
 * identity-less form only on the revision it was written against and only
 * when it carries every field the submission names, never by position
 * across revisions — worded as 02 states with the earlier-version line when
 * the revision moved and the sent-from line when the sender is another
 * session, remembered under (target, "submit", submissionId) so a repeat
 * replays the first outcome. `stale_page` only when no form matches.
 * 05 R2.32–R2.37, R-S11; 03 R5.61, R5.63; 02 R-K5, R-K6
 */
export async function deliverSubmission(ctx: ServingContext, args: { target: string; path: string | null; sender: Sender; submission: SubmissionToDeliver; requestId: string; pathForAgent?: (relative: string) => string }): Promise<DeliveredSubmission> {
  const { submission, target, sender } = args;
  const print = fingerprint({ writtenAgainst: submission.writtenAgainst, title: submission.title, formId: submission.formId, formTitle: submission.formTitle, action: submission.action, answers: submission.answers as unknown as JsonValue, files: submission.files.map((file) => ({ field: file.field, name: file.name, path: file.path, sizeBytes: file.sizeBytes })) });
  const deliver = async (): Promise<{ delivery: "started" | "queued" | "steered"; matchedRevision: string; revisionChanged: boolean }> => {
    const match = await matchSubmissionForm(ctx.pages, target, args.path, { formId: submission.formId, formTitle: submission.formTitle, writtenAgainst: submission.writtenAgainst, fields: submission.answers.map((answer) => answer.name) });
    if (match.form === null) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
    const revisionChanged = submission.writtenAgainst !== match.revision;
    const pathForAgent =
      args.pathForAgent ??
      (
        await ctx.provider.sessions.storage(target).catch((error: unknown) => {
          throw mapProviderError(error, ctx.log, "sessions.storage");
        })
      ).pathForAgent;
    const text = formatSubmissionMessage({ title: submission.title, action: submission.action, answers: submission.answers, files: submission.files }, pathForAgent, framingFor(sender, target, revisionChanged));
    const sent = await send(ctx, target, text, "queue", sender, args.requestId);
    return { delivery: sent.delivery, matchedRevision: match.revision, revisionChanged };
  };
  const remembered = ctx.idempotency.remember({ session: target, kind: "submit", id: submission.submissionId }, print, deliver, ctx.now());
  if (remembered.kind === "conflict") throw new PageError("conflict", "This submission id was already used with different answers");
  const outcome = await remembered.outcome;
  return { ...outcome, duplicate: remembered.kind === "duplicate" };
}
