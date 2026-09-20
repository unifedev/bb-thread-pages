import type { PagesAnswerParams, PagesReadParams } from "../../../domain/capabilities/specs.ts";
import { documentKey, ENTRY_DOCUMENT } from "../../../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../../../domain/errors.ts";
import { injectKernel } from "../../../domain/html/document.ts";
import { fingerprint } from "../../../domain/json/canonical.ts";
import type { JsonValue } from "../../../domain/json/strict-json.ts";
import { LIMITS } from "../../../domain/limits.ts";
import { sha256Hex } from "../../../domain/revision.ts";
import { formatReplyMessage, formatSubmissionMessage } from "../../../domain/submissions/message.ts";
import { mintAnswerToken, verifyAnswerToken, type AnswerToken } from "../../../domain/tokens/answer-token.ts";
import { KERNEL_RUNTIME } from "../../../generated/kernel-runtime.ts";
import type { SessionRecord } from "../../../host/types.ts";
import type { LoadedPage } from "../../../pages/page-store.ts";
import type { KernelConfig } from "../../../runtime/shared/protocol.ts";
import { loadUnlessUnwritten } from "../../empty-page.ts";
import { eligibleSession } from "../../session-access.ts";
import { excerpt, handler, type HandlerContext } from "../handler.ts";

/**
 * Other sessions' pages: the one conditional read an embed is built on, and
 * the answer path bound to it. spec R5.56–R5.67, DECISIONS D29, D31
 */

type ReadEntry = Record<string, JsonValue>;

function failed(sessionId: string, path: string, code: "not_found" | "unavailable" | "response_too_large", reason: string, message: string): ReadEntry {
  return { sessionId, path, error: { code, reason, message } };
}

/** Room kept for the response envelope. Each entry's own fields are measured. */
const READ_ENVELOPE_BYTES = 4 * 1024;

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export const pagesRead = handler<PagesReadParams, unknown>({
  method: "pages.read",
  async execute(params, { serving, session: caller }) {
    let room = LIMITS.pagesReadBytes - READ_ENVELOPE_BYTES;
    const pages: ReadEntry[] = [];
    // One call loads each document once, however often it is named. spec R5.56
    const loads = new Map<string, Promise<{ owner: SessionRecord; page: LoadedPage | null }>>();
    const loaded = (sessionId: string, key: string | null) => {
      const id = `${sessionId}#${key ?? ""}`;
      let pending = loads.get(id);
      if (!pending) {
        pending = (async () => {
          // The same steps the document route takes: eligibility, then the one loading pipeline.
          const owner = await eligibleSession(serving, sessionId);
          return { owner, page: key ? await serving.pages.load(sessionId, key) : await loadUnlessUnwritten(serving, sessionId) };
        })();
        loads.set(id, pending);
      }
      return pending;
    };
    const add = (entry: ReadEntry): void => {
      room -= bytesOf(entry);
      pages.push(entry);
    };

    for (const [index, wanted] of params.pages.entries()) {
      const sessionId = wanted.sessionId;
      const key = documentKey(wanted.path);
      const path = key ?? ENTRY_DOCUMENT;
      // Nothing more fits: say so without reading anything. Never the first entry, so every call makes progress. spec R5.58
      if (index > 0 && room < READ_ENVELOPE_BYTES) {
        add({ sessionId, path, deferred: true });
        continue;
      }
      try {
        const { owner, page } = await loaded(sessionId, key);
        if (!page) {
          add(failed(sessionId, path, "not_found", "no_page", "That session has not written its page yet."));
          continue;
        }
        const shared = {
          sessionId,
          path,
          title: owner.title.slice(0, LIMITS.titleChars),
          projectId: owner.projectId,
          working: owner.state === "working",
          readOnly: page.stale,
          // Renewed with every read, so a page that keeps polling never holds an expired one. spec R5.60a
          answerToken: mintAnswerToken({ host: caller.id, target: sessionId, path: key, revision: page.revision, now: serving.now() }, serving.signingKey),
        };
        if (wanted.ifNoneMatch === page.revision) {
          add({ ...shared, unchanged: true });
          continue;
        }
        // The authored bytes are a floor for what the entry will weigh: decide before injecting and escaping.
        const floor = Buffer.byteLength(page.html, "utf8");
        if (floor > LIMITS.pagesReadBytes - READ_ENVELOPE_BYTES) {
          add(failed(sessionId, path, "response_too_large", "too_large", "That page is too large to show inside another page."));
          continue;
        }
        if (floor > room && index > 0) {
          add({ sessionId, path, deferred: true });
          continue;
        }
        const config: KernelConfig = { pageRevision: page.revision, stale: page.stale, siteRoot: serving.site.siteRoot(sessionId), embedded: true };
        const html = injectKernel(page.html, { kernel: KERNEL_RUNTIME, config, baseHref: serving.site.baseHref(sessionId, key) });
        const entry = { ...shared, revision: page.revision, html };
        const bytes = bytesOf(entry);
        if (bytes > LIMITS.pagesReadBytes - READ_ENVELOPE_BYTES) {
          add(failed(sessionId, path, "response_too_large", "too_large", "That page is too large to show inside another page."));
          continue;
        }
        if (bytes > room && index > 0) {
          add({ sessionId, path, deferred: true });
          continue;
        }
        add(entry);
      } catch (error) {
        if (!PageError.is(error)) serving.host.log.warn(`pages.read ${sessionId}: ${errorText(error)}`);
        const code = PageError.is(error) ? error.code : "unavailable";
        if (code === "page_too_large") add(failed(sessionId, path, "response_too_large", "too_large", PUBLIC_MESSAGES.pageTooLarge));
        else if (code === "not_found" || code === "ineligible" || code === "no_page") add(failed(sessionId, path, "not_found", code === "no_page" ? "no_page" : "no_session", code === "ineligible" || code === "no_page" ? (error as PageError).message : "That page is not available."));
        else add(failed(sessionId, path, "unavailable", "unreachable", PUBLIC_MESSAGES.unavailable));
      }
    }
    return { result: { pages } };
  },
});

/**
 * A session's title as the grant dialog quotes it. Titles are agent-chosen, so
 * every kind of quotation mark is dropped: a title cannot close the quotes it
 * sits in and continue the sentence in the host's voice. spec R3.18
 */
function quotable(title: string): string {
  return excerpt(title.replace(/["'`\u00ab\u00bb\u2018-\u201f\u2039\u203a\u300c-\u300f]/g, ""), 70) || "(untitled)";
}

function openToken(params: PagesAnswerParams, context: HandlerContext): AnswerToken {
  const token = verifyAnswerToken(params.answerToken, context.serving.signingKey, context.serving.now());
  // A token issued to another page's session is as good as none. spec R5.62
  if (!token || token.host !== context.session.id) throw new PageError("confirmation_invalid", "This answer is not bound to a page this page has read; read it again.");
  return token;
}

async function targetOf(token: AnswerToken, context: HandlerContext): Promise<SessionRecord> {
  try {
    return await eligibleSession(context.serving, token.target);
  } catch (error) {
    if (PageError.is(error) && (error.code === "not_found" || error.code === "ineligible")) throw new PageError("not_found", "That page's session is no longer available.");
    throw error;
  }
}

export const pagesAnswer = handler<PagesAnswerParams, unknown>({
  method: "pages.answer",
  async refuse(params, context) {
    await targetOf(openToken(params, context), context);
  },
  /** One grant per (this page's session → the embedded session); the page's own session needs none. spec R5.64, R5.66 */
  async grant(params, context) {
    const token = openToken(params, context);
    if (token.target === context.session.id || !context.serving.settings.current().embedAnswerGrants) return null;
    if (await context.serving.grants.has(context.session.id, token.target)) return null;
    const target = await targetOf(token, context);
    const from = quotable(context.session.title);
    const to = quotable(target.title);
    return {
      summary: `Let “${from}” send your answers to “${to}” (${target.id})? It shows that session's page inside it. You are asked once; what is answered there then goes to “${to}” as if you had answered on its own page.`,
      target: { sessionId: target.id, title: target.title.slice(0, LIMITS.titleChars) },
      record: () => context.serving.grants.add(context.session.id, target.id, context.serving.now()),
    };
  },
  async execute(params, context) {
    const { serving, requestId } = context;
    const token = openToken(params, context);
    await targetOf(token, context);
    const page = await serving.pages.load(token.target, token.path);
    if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
    if (page.revision !== token.revision) throw new PageError("stale_page", "The embedded page changed; it refreshes before you answer.");

    if (params.form) {
      // The same message, fingerprint and idempotency record as `POST /submit`. spec R5.61
      const submission = { actionToken: "", submissionId: params.form.submissionId, pageRevision: token.revision, title: params.form.title, answers: params.form.answers, files: [] };
      const print = sha256Hex(JSON.stringify({ revision: submission.pageRevision, title: submission.title, answers: submission.answers, files: submission.files }));
      const remembered = serving.submissions.remember(
        `${token.target}:${submission.submissionId}`,
        print,
        async () => {
          const sent = await serving.host.sessions.send(token.target, formatSubmissionMessage(submission), "queue");
          return { status: 200, body: { ok: true, delivery: sent.delivery } };
        },
        serving.now(),
      );
      if (remembered.kind === "conflict") throw new PageError("conflict", "This submission id was already used with different answers");
      const outcome = await remembered.outcome;
      return { result: { delivery: outcome.body.delivery, duplicate: remembered.kind === "replay" } };
    }

    // The same message and idempotency record as `session.reply` on that page. spec R5.61
    const reply = params.reply!;
    const print = fingerprint({ revision: token.revision, result: reply.result, mode: reply.mode, title: reply.title ?? null });
    const remembered = serving.replies.remember(`${token.target}:${reply.idempotencyKey ?? requestId}`, print, () => serving.host.sessions.send(token.target, formatReplyMessage(reply.title, reply.result), reply.mode), serving.now());
    if (remembered.kind === "conflict") throw new PageError("conflict", "This idempotency key was already used with a different reply");
    const outcome = await remembered.outcome;
    return { result: { delivery: outcome.delivery, duplicate: remembered.kind === "replay" } };
  },
});
