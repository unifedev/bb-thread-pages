// `pages.read` and `pages.answer`: the one conditional read other pages embed, with its answer token, and the answer path bound to that token under the pair grant (03 R5.56–R5.67; DESIGN §E.8).
import type { PagesAnswerParams, PagesReadParams } from "../../../domain/capabilities/specs.ts";
import { ENTRY_DOCUMENT, documentKey } from "../../../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../../../domain/errors.ts";
import { injectKernel } from "../../../domain/html/document.ts";
import { utf8Bytes, type JsonValue } from "../../../domain/json/strict-json.ts";
import { LIMITS } from "../../../domain/limits.ts";
import { mintAnswerToken, verifyAnswerToken, type AnswerToken } from "../../../domain/tokens/answer-token.ts";
import { KERNEL_RUNTIME } from "../../../generated/kernel-runtime.ts";
import type { SessionRecord } from "../../../host/provider.ts";
import type { KernelConfig } from "../../../runtime/shared/protocol.ts";
import type { LoadedPage } from "../../stores.d.ts";
import { grantCooldownKey } from "../cooldown.ts";
import { deliverReply, deliverSubmission, type Sender } from "../deliver.ts";
import { grantSummary, recordGrant } from "../grants-request.ts";
import { type BridgeContext, boundTitle, handler, refuseArchived, senderLabel } from "../handler.ts";
import { executeRespond, refuseRespond } from "./respond.ts";

type ReadEntry = Record<string, JsonValue>;

/** Room kept for the response envelope and the entries' own fields. */
const READ_ENVELOPE_BYTES = 4 * 1024;

function failed(sessionId: string, path: string, code: "not_found" | "unavailable" | "response_too_large", reason: string, message: string): ReadEntry {
  return { sessionId, path, error: { code, reason, message } };
}

/** The owning session as `pages.read` sees it: deleted, hidden, a fork or a child → `no_session`; archived → served read-only. 03 R5.60 */
async function readableOwner(context: BridgeContext, sessionId: string): Promise<SessionRecord> {
  const access = await context.serving.sessionFor(sessionId);
  if (access.kind !== "session") throw new PageError("not_found", "That session is not available", { reason: "no_session" });
  const { record } = access;
  if (!record.visible || record.forkOfId !== null || record.parentSessionId !== null) throw new PageError("not_found", "That session is not available", { reason: "no_session" });
  return record;
}

export const pagesRead = handler<PagesReadParams, unknown>({
  method: "pages.read",
  async execute(params, context) {
    const { serving } = context;
    let room = LIMITS.pagesReadBytes - READ_ENVELOPE_BYTES;
    const pages: ReadEntry[] = [];
    const add = (entry: ReadEntry): void => {
      room -= utf8Bytes(JSON.stringify(entry));
      pages.push(entry);
    };
    for (const [index, wanted] of params.pages.entries()) {
      const sessionId = wanted.sessionId;
      const key = documentKey(wanted.path);
      const path = key ?? ENTRY_DOCUMENT;
      if (index > 0 && room < READ_ENVELOPE_BYTES) {
        add({ sessionId, path, deferred: true });
        continue;
      }
      try {
        const owner = await readableOwner(context, sessionId);
        let page: LoadedPage;
        try {
          page = await serving.pages.load(sessionId, key);
        } catch (error) {
          if (PageError.is(error) && error.code === "no_page") {
            add(failed(sessionId, path, "not_found", "no_page", PUBLIC_MESSAGES.noPage));
            continue;
          }
          if (PageError.is(error) && error.code === "not_found") {
            add(failed(sessionId, path, "not_found", "no_page", "That page has no such document"));
            continue;
          }
          throw error;
        }
        const archived = page.archived || owner.archived;
        const shared = {
          sessionId,
          path,
          title: boundTitle(owner.title),
          workspaceId: owner.workspaceId,
          working: owner.state === "working",
          readOnly: page.stale || archived,
          // Renewed with every read, so a page that keeps polling never holds an expired one. 03 R5.60a
          answerToken: mintAnswerToken({ issuedTo: context.session.id, target: sessionId, path: key, revision: page.revision, now: serving.now() }, serving.signingKey).token,
        };
        if (wanted.ifNoneMatch === page.revision) {
          add({ ...shared, unchanged: true });
          continue;
        }
        const config: KernelConfig = { pageRevision: page.revision, stale: page.stale, archived, siteRoot: serving.strategy.siteRoot(sessionId, key), embedded: true, uploads: false, documentPath: path, ownFilesByFrame: false, embedAvailable: false, deferredFiles: page.site.deferred.map((file) => file.path), swapIdleMs: LIMITS.swapIdleMs };
        const html = injectKernel(page.html, { kernel: KERNEL_RUNTIME, config, baseHref: serving.strategy.siteRoot(sessionId, key) });
        const entry = { ...shared, revision: page.revision, html };
        const bytes = utf8Bytes(JSON.stringify(entry));
        if (bytes > LIMITS.pagesReadBytes - READ_ENVELOPE_BYTES) {
          add(failed(sessionId, path, "response_too_large", "too_large", "That page is too large to show inside another page"));
          continue;
        }
        if (bytes > room && index > 0) {
          add({ sessionId, path, deferred: true });
          continue;
        }
        add(entry);
      } catch (error) {
        if (!PageError.is(error)) serving.log.warn(`pages.read ${sessionId}: ${errorText(error)}`);
        const code = PageError.is(error) ? error.code : "unavailable";
        if (code === "page_too_large") add(failed(sessionId, path, "response_too_large", "too_large", PUBLIC_MESSAGES.pageTooLarge));
        else if (code === "not_found" || code === "ineligible") add(failed(sessionId, path, "not_found", "no_session", "That session is not available"));
        else if (code === "no_page") add(failed(sessionId, path, "not_found", "no_page", PUBLIC_MESSAGES.noPage));
        else add(failed(sessionId, path, "unavailable", "unreachable", PUBLIC_MESSAGES.unreachable));
      }
    }
    return { result: { pages } };
  },
});

// --- pages.answer ----------------------------------------------------------------

function openToken(params: PagesAnswerParams, context: BridgeContext): AnswerToken {
  const token = verifyAnswerToken(params.answerToken, context.serving.signingKey, context.serving.now());
  // A token issued to another page's session is as good as none. 03 R5.62
  if (!token || token.issuedTo !== context.session.id) throw new PageError("confirmation_invalid", "This answer token was not issued to this page; read the page again");
  return token;
}

/** The target as an answer may reach it: `not_found` when gone or unseen; archived → `unavailable` with reason `archived`. 03 R5.63 */
async function answerTarget(token: AnswerToken, context: BridgeContext): Promise<SessionRecord> {
  const target = await readableOwner(context, token.target).catch(() => {
    throw new PageError("not_found", "That page's session is no longer available");
  });
  refuseArchived(target);
  return target;
}

function senderOf(context: BridgeContext): Sender {
  return { id: context.session.id, label: senderLabel(context) };
}

async function grantHeld(context: BridgeContext, target: string): Promise<boolean> {
  return target === context.session.id || !context.serving.settings().embedAnswerGrants || (await context.serving.grants.has(context.session.id, target));
}

export const pagesAnswer = handler<PagesAnswerParams, unknown>({
  method: "pages.answer",
  async refuse(params, context) {
    const token = openToken(params, context);
    const target = await answerTarget(token, context);
    const held = await grantHeld(context, target.id);
    if (!held && context.serving.cooldowns.active(grantCooldownKey(context.session.id, target.id), context.serving.now())) throw new PageError("cancelled", PUBLIC_MESSAGES.cancelled);
    if (params.respond) refuseRespond(context, target, params.respond, held);
  },
  /** One grant per (this page's session → the embedded session); the page's own session needs none. 03 R5.64, R5.66 */
  async grant(params, context) {
    const token = openToken(params, context);
    if (await grantHeld(context, token.target)) return null;
    const target = await answerTarget(token, context);
    return { summary: grantSummary(context, target), target: { sessionId: target.id, title: boundTitle(target.title) }, record: () => recordGrant(context, target.id) };
  },
  async execute(params, context) {
    const { serving, requestId } = context;
    const token = openToken(params, context);
    const target = await answerTarget(token, context);
    const sender = senderOf(context);
    let result: { delivery: "started" | "queued" | "steered"; duplicate: boolean; matchedRevision?: string };
    if (params.form) {
      const delivered = await deliverSubmission(serving, {
        target: target.id,
        path: token.path,
        sender,
        requestId,
        submission: { submissionId: params.form.submissionId, title: params.form.title, writtenAgainst: params.form.writtenAgainst, formId: params.form.formId ?? null, formTitle: params.form.formTitle ?? null, action: params.form.action ?? null, answers: params.form.answers, files: [] },
      });
      result = { delivery: delivered.delivery, duplicate: delivered.duplicate, matchedRevision: delivered.matchedRevision };
    } else if (params.reply) {
      result = await deliverReply(serving, { target: target.id, sender, reply: params.reply, requestId });
    } else if (params.respond) {
      await executeRespond(serving, target.id, params.respond, sender, requestId);
      result = { delivery: "started", duplicate: false };
    } else {
      throw new PageError("invalid_params", "Give exactly one of form, reply, respond");
    }
    // Every delivery under the pair is visible after the fact, with the grant setting on or off. 03 R5.65; DESIGN P27
    if (target.id !== context.session.id) await serving.grants.touch(context.session.id, target.id);
    return { result };
  },
});
