// `POST /submit`: parse, token, budget, the session's state, then the one delivery path of `deliverSubmission` — form match in the current document, idempotency, wording, `matchedRevision` (05 R2.32–R2.37, R-S11; 02 R-K5, §The answer wording; DESIGN §C.3, §D.4).
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import { parseSubmission } from "../domain/submissions/parse.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { acquireBudget, requireActionToken, requireSessionToken } from "./action-request.ts";
import { deliverSubmission } from "./bridge/deliver.ts";
import { sessionLabel } from "./bridge/handler.ts";
import type { ServingContext } from "./context.ts";
import { failure, json } from "./responses.ts";
import { readJsonBody, requireReader } from "./request.ts";
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
      const body = await readJsonBody(request, maxBody);
      const submission = parseSubmission(body);
      if (!submission) throw new PageError("invalid_request", "Invalid submission");
      const token = requireActionToken(ctx, submission.actionToken);
      const session = requireSessionToken(token, "The built-in home page has no session to answer.");
      release = acquireBudget(ctx, token);
      const access = await ctx.sessionFor(session);
      requirePageSession(access);
      if (access.archived) throw new PageError("unavailable", PUBLIC_MESSAGES.archived, { reason: "archived" });
      const page = await ctx.pages.load(session, token.path);
      if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy, { reason: "offline" });
      const delivered = await deliverSubmission(ctx, {
        target: session,
        path: token.path,
        sender: { id: session, label: sessionLabel(access.record.title) },
        requestId: submission.submissionId,
        submission: { submissionId: submission.submissionId, title: submission.title, writtenAgainst: submission.writtenAgainst, formId: submission.formId, formTitle: submission.formTitle, action: submission.action, answers: submission.answers, files: submission.files },
      });
      return json(200, { ok: true, ...delivered });
    } catch (error) {
      return failure(error, ctx.log, "POST /submit", false);
    } finally {
      release?.();
    }
  };
}
