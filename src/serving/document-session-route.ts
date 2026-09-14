import type { Context } from "hono";
import { documentKey, ENTRY_DOCUMENT, isDocumentPath } from "../domain/document-path.ts";
import { PageError } from "../domain/errors.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import { isBuiltinHome } from "./builtin-home.ts";
import type { ServingContext } from "./context.ts";
import { EMPTY_REVISION, loadUnlessUnwritten } from "./empty-page.ts";
import { failureResponse, jsonResponse } from "./responses.ts";
import { eligibleSession } from "./session-access.ts";

/**
 * `POST /document-session` — the shell opening another document of the same
 * page in place. It exchanges its action token for one bound to that
 * document, and learns where to load it from; the shell never builds either
 * from page-supplied text. Only the shell holds a token, so a page cannot
 * call this. spec R1.12a–R1.12d
 */
export function documentSessionRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    let release: (() => void) | null = null;
    try {
      const body = await readJsonBody(context, 8_192);
      const record = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const token = requireActionToken(serving, record.actionToken);
      if (isBuiltinHome(token.session)) throw new PageError("forbidden", "The built-in home page has no other documents.");
      if (record.path !== ENTRY_DOCUMENT && !isDocumentPath(record.path)) throw new PageError("invalid_params", "That is not a document of this page.");
      const path = documentKey(record.path as string);
      release = acquireRate(serving, token.session);
      await eligibleSession(serving, token.session);
      const page = path ? await serving.pages.load(token.session, path) : await loadUnlessUnwritten(serving, token.session);
      const revision = page?.revision ?? EMPTY_REVISION;
      const minted = mintActionToken({ session: token.session, revision, path, now: serving.now() }, serving.signingKey);
      return jsonResponse({
        ok: true,
        actionToken: minted.token,
        pageRevision: revision,
        expiresAt: minted.payload.exp,
        documentUrl: serving.site.documentUrl(token.session, path),
        path: path ?? ENTRY_DOCUMENT,
        stale: page?.stale ?? false,
        empty: page === null,
      });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /document-session", false);
    } finally {
      release?.();
    }
  };
}
