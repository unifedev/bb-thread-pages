import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { LIMITS } from "../domain/limits.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import type { ServingContext } from "./context.ts";
import { homeUrl } from "./context.ts";
import { documentPathFrom } from "./document-access.ts";
import { EMPTY_REVISION, loadUnlessUnwritten } from "./empty-page.ts";
import { baseHeaders, failureResponse, shellCsp } from "./responses.ts";
import { renderShell } from "./shell-html.ts";
import { eligibleSession, sessionIdFrom } from "./session-access.ts";

/**
 * `GET /page?session=<id>[&path=<document>]` — the shell for one page, open at
 * its entry document or another of its documents. Every page but the one
 * designated as home links to home, which is the built-in home page while
 * none is designated. spec 02 §The shell, R1.12d, R6.19, R7.10
 */
export function shellRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    try {
      const id = sessionIdFrom(context);
      const path = documentPathFrom(context);
      const session = await eligibleSession(serving, id);
      const page = path ? await serving.pages.load(id, path) : await loadUnlessUnwritten(serving, id);
      const revision = page?.revision ?? EMPTY_REVISION;
      const stale = page?.stale ?? false;
      const now = serving.now();
      const { token, payload } = mintActionToken({ session: id, revision, path, now }, serving.signingKey);
      const nonce = randomBytes(18).toString("base64url");
      const settings = serving.settings.current();
      const html = renderShell({
        nonce,
        title: session.title,
        homeUrl: settings.homeSessionId !== id ? homeUrl(serving.routeBase) : null,
        working: session.state === "working",
        chrome: { hostUrl: serving.hostSessionUrl(session), pinned: session.pinned, unread: session.unread },
        config: {
          actionToken: token,
          pageRevision: revision,
          expiresAt: payload.exp,
          documentUrl: serving.site.documentUrl(id, path),
          documentPath: path ?? ENTRY_DOCUMENT,
          submitUrl: `${serving.routeBase}/submit`,
          uploadUrl: `${serving.routeBase}/upload`,
          bridgeUrl: `${serving.routeBase}/bridge`,
          chromeActionUrl: `${serving.routeBase}/chrome-action`,
          documentSessionUrl: `${serving.routeBase}/document-session`,
          navigable: true,
          workingLabel: settings.workingLabel,
          stale,
          empty: page === null,
          notice: null,
          pollMs: LIMITS.shellPollMs,
          maxUploadBytes: LIMITS.uploadFileBytes,
          maxUploads: LIMITS.uploadsPerForm,
        },
      });
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", shellCsp(nonce));
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /page", true);
    }
  };
}
