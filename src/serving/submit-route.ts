import type { Context } from "hono";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import { sha256Hex } from "../domain/revision.ts";
import { formatSubmissionMessage } from "../domain/submissions/message.ts";
import { parseSubmission } from "../domain/submissions/parse.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failureResponse, jsonResponse } from "./responses.ts";
import { eligibleSession } from "./session-access.ts";

/** `POST /submit` — one form submission becomes one message. spec R2.32–R2.37 */
export function submitRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    let release: (() => void) | null = null;
    try {
      const body = await readJsonBody(context, LIMITS.submissionBodyBytes);
      const submission = parseSubmission(body);
      if (!submission) throw new PageError("invalid_request", "Invalid submission");
      const token = requireActionToken(serving, submission.actionToken);
      if (submission.pageRevision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      release = acquireRate(serving, token.session);
      const now = serving.now();
      const fingerprint = sha256Hex(JSON.stringify({ revision: submission.pageRevision, title: submission.title, answers: submission.answers, files: submission.files }));
      const remembered = serving.submissions.remember(
        `${token.session}:${submission.submissionId}`,
        fingerprint,
        async () => {
          await eligibleSession(serving, token.session);
          const page = await serving.pages.load(token.session);
          if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
          if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
          const sent = await serving.host.sessions.send(token.session, formatSubmissionMessage(submission), "queue");
          return { status: 200, body: { ok: true, delivery: sent.delivery } };
        },
        now,
      );
      if (remembered.kind === "conflict") throw new PageError("conflict", "This submission id was already used with different answers");
      const outcome = await remembered.outcome;
      return jsonResponse(outcome.body, outcome.status);
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /submit", false);
    } finally {
      release?.();
    }
  };
}
