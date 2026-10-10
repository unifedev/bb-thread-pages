// `POST /document-session` (DESIGN §C.3): the shell opening another document of the same page in place, exchanging its action token for one bound to that document (01 R1.12a–R1.12d, R1.12g).
import { checkDocumentQuery, documentKey, ENTRY_DOCUMENT, isDocumentPath } from "../domain/document-path.ts";
import { PageError } from "../domain/errors.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { isDocumentSessionBody, type DocumentSessionResponse } from "../runtime/shared/envelopes.ts";
import { acquireBudget, requireActionToken, requireSessionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { documentUrlFor } from "./document-route.ts";
import { failure, json } from "./responses.ts";
import { readJsonBody, requireReader } from "./request.ts";
import { loadPageView, requirePageSession } from "./session-access.ts";

export function documentSessionRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      const body = await readJsonBody(request, 8_192);
      if (!isDocumentSessionBody(body)) throw new PageError("invalid_request", "Invalid document-session body");
      const token = requireActionToken(ctx, body.actionToken);
      const session = requireSessionToken(token, "The built-in home page has no other documents.");
      if (body.path !== ENTRY_DOCUMENT && !isDocumentPath(body.path)) throw new PageError("invalid_params", "That is not a document of this page.");
      const path = documentKey(body.path);
      const query = checkDocumentQuery(body.query);
      if (!query.ok) throw new PageError("invalid_params", `That link's query cannot be carried: ${query.message}.`);
      release = acquireBudget(ctx, token);
      const access = await ctx.sessionFor(session);
      requirePageSession(access);
      const view = await loadPageView(ctx.pages, access, path);
      const minted = mintActionToken({ session, revision: view.revision, path, now: ctx.now() }, ctx.signingKey);
      const answer: DocumentSessionResponse = {
        ok: true,
        actionToken: minted.token,
        pageRevision: view.revision,
        expiresAt: minted.payload.exp,
        documentUrl: documentUrlFor(ctx, access, path, query.query, view.revision),
        path: path ?? ENTRY_DOCUMENT,
        query: query.query,
        source: view.source,
        empty: view.empty,
        deferredFiles: view.deferredFiles,
      };
      return json(200, answer);
    } catch (error) {
      return failure(error, ctx.log, "POST /document-session", false);
    } finally {
      release?.();
    }
  };
}
