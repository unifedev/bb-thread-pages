// `POST /submit`: parse, token, budget, the session's state, then the one delivery path of `deliverSubmission` — form match in the current document, idempotency, wording, `matchedRevision` (05 R2.32–R2.37, R-S11; 02 R-K5, §The answer wording; DESIGN §C.3, §D.4).
import { documentKey } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, notStarted } from "../domain/errors.ts";
import { captureForms } from "../domain/html/forms.ts";
import { isNewSessionIdentity } from "../domain/ids.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { ActionToken } from "../domain/tokens/action-token.ts";
import { formatSubmissionMessage } from "../domain/submissions/message.ts";
import { parseSubmission, type Submission } from "../domain/submissions/parse.ts";
import { matchFormIn } from "../pages/forms.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { acquireBudget, boundHostWork, requireActionToken, requireSessionToken, type HostBound } from "./action-request.ts";
import { deliverSubmission } from "./bridge/deliver.ts";
import { sessionLabel } from "./bridge/handler.ts";
import type { ServingContext } from "./context.ts";
import { newSessionDocument, parseStartBlock, startNewSession, type StartBlock } from "./new-session.ts";
import { failure, json } from "./responses.ts";
import { readBodyWithStart, readJsonBody, requireReader } from "./request.ts";
import { requirePageSession } from "./session-access.ts";

/**
 * One form submission becomes one message to the owning session, through
 * the same `deliverSubmission` as `pages.answer { form }`: the form matched
 * by identity in the current document, the earlier-version line when the
 * matched revision differs from `writtenAgainst`, `stale_page` only when no
 * form matches, idempotent per submission id. 05 R2.32–R2.37, R-S11; 02 R-K5, R-K8
 */
export function submitRoute(ctx: ServingContext) {
  const maxBody = LIMITS.submissionBodyBytes + LIMITS.uploadsPerForm * LIMITS.transcriptChars * 3;
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      // A new-session page's form that starts its session also carries the storage the page held, where the provider offers such pages. 03 R-C13; 06 R-P17
      let body: JsonValue;
      let start: StartBlock | null = null;
      if (ctx.provider.workspaces.newSession) {
        const read = await readBodyWithStart(request, maxBody, LIMITS.storagePageBytes + 64 * 1024);
        body = read.value;
        if (read.start !== null) start = parseStartBlock(read.start);
      } else body = await readJsonBody(request, maxBody);
      const submission = parseSubmission(body);
      if (!submission) throw new PageError("invalid_request", "Invalid submission");
      const token = requireActionToken(ctx, submission.actionToken);
      const session = requireSessionToken(token, "The built-in home page has no session to answer.");
      if (start && !isNewSessionIdentity(session)) throw new PageError("invalid_request", "Only a new-session page's first message carries a start");
      release = acquireBudget(ctx, token);
      if (isNewSessionIdentity(session)) return await boundHostWork(ctx, () => `POST /submit ${session}`, (bound) => startBySubmission(ctx, token, submission, start, bound));
      // From the slot on, under the bridge timeout; a retry with this submission id joins the delivery still pending. 05 R2.38b, R2.33
      return await boundHostWork(ctx, () => `POST /submit ${session}`, async (bound) => {
        const access = await ctx.sessionFor(session);
        requirePageSession(access);
        if (access.archived) throw new PageError("unavailable", PUBLIC_MESSAGES.archived, { reason: "archived" });
        const page = await ctx.pages.load(session, token.path);
        if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy, { reason: "offline" });
        // From a frame of the page's own session: matched in that frame's document of this session, or, for an `html` frame, in none. 05 R2.32; 02 R4.48a
        const frame = submission.frame;
        const delivered = await deliverSubmission(ctx, {
          target: session,
          path: frame?.path ? documentKey(frame.path) : token.path,
          sender: { id: session, label: sessionLabel(access.record.title) },
          requestId: submission.submissionId,
          submission: { submissionId: submission.submissionId, title: submission.title, writtenAgainst: submission.writtenAgainst, formId: submission.formId, formTitle: submission.formTitle, action: submission.action, answers: submission.answers, files: submission.files, frame: frame?.title ?? null },
          ...(frame && !frame.path ? { held: { revision: page.revision } } : {}),
          bound,
        });
        return json(200, { ok: true, ...delivered });
      });
    } catch (error) {
      return failure(error, ctx.log, "POST /submit", false);
    } finally {
      release?.();
    }
  };
}

/**
 * A captured form on a new-session page starts its session with its worded answer as the prompt, matched in the
 * document the page shows; only beside the shell's start block, only on the reader's gesture, and with no file (an
 * upload needs a page root). 03 R-C12; 02 R-K10; 05 R-S13
 */
async function startBySubmission(ctx: ServingContext, token: ActionToken, submission: Submission, start: StartBlock | null, bound: HostBound): Promise<PagesResponse> {
  const page = await ctx.sessionFor(token.session);
  if (page.kind !== "new-session") throw new PageError("not_found", PUBLIC_MESSAGES.notFound);
  if (!start) throw notStarted(PUBLIC_MESSAGES.startNeedsReader);
  if (submission.files.length > 0) throw notStarted(PUBLIC_MESSAGES.notStartedFiles);
  const document = await newSessionDocument(ctx, page.workspace);
  // An `html` frame's form is in no stored document; any other is matched in the one the page shows. 05 R2.32; 02 R-K5
  const frame = submission.frame;
  const matched = frame && !frame.path ? { revision: document.revision, form: true } : matchFormIn(captureForms(document.html), document.revision, { formId: submission.formId, formTitle: submission.formTitle, writtenAgainst: submission.writtenAgainst, fields: submission.answers.map((answer) => answer.name) });
  if (!matched.form) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
  const revisionChanged = !(frame && !frame.path) && submission.writtenAgainst !== document.revision;
  const prompt = formatSubmissionMessage({ title: submission.title, frame: frame?.title ?? null, action: submission.action, answers: submission.answers, files: [] }, (relative) => relative, revisionChanged ? { earlierVersion: true } : {});
  const print = { writtenAgainst: submission.writtenAgainst, title: submission.title, formId: submission.formId, formTitle: submission.formTitle, action: submission.action, answers: submission.answers as unknown as JsonValue, files: [], frame: frame?.title ?? null } as JsonValue;
  const started = await startNewSession(ctx, { page, revision: token.revision, start, kind: "submit", id: submission.submissionId, print, prompt, requestId: submission.submissionId, bound });
  return json(200, { ok: true, delivery: "started", duplicate: started.duplicate, matchedRevision: document.revision, revisionChanged, sessionId: started.sessionId, started: started.started });
}
