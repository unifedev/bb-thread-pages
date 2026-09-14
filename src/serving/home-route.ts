import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { injectKernel } from "../domain/html/document.ts";
import { isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { etagFor, ifNoneMatchMatches } from "../domain/revision.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import { KERNEL_RUNTIME } from "../generated/kernel-runtime.ts";
import type { KernelConfig } from "../runtime/shared/protocol.ts";
import { BUILTIN_HOME_ID, BUILTIN_HOME_PAGE, BUILTIN_HOME_TITLE } from "./builtin-home.ts";
import type { ServingContext } from "./context.ts";
import { pageUrl } from "./context.ts";
import { baseHeaders, documentCsp, failureResponse, shellCsp } from "./responses.ts";
import { renderShell } from "./shell-html.ts";

export const STALE_HOME_NOTICE = "Home pointed at a session that no longer exists — this is the built-in home page";

/**
 * `GET /home` — the designated home page, or the built-in home page while
 * none is designated or the designation no longer resolves.
 * spec R7.4, R7.9–R7.10, DECISIONS D14
 */
export function homeRoute(serving: ServingContext) {
  return async (_context: Context): Promise<Response> => {
    try {
      const designated = serving.settings.current().homeSessionId;
      let notice: string | null = null;
      if (isSessionId(designated)) {
        const session = await serving.host.sessions.get(designated).catch(() => null);
        if (session && !session.deleted && !session.archived) {
          return new Response(null, { status: 302, headers: { location: pageUrl(serving.routeBase, designated), "cache-control": "no-store, max-age=0" } });
        }
        notice = STALE_HOME_NOTICE;
      }
      const now = serving.now();
      const { token, payload } = mintActionToken({ session: BUILTIN_HOME_ID, revision: BUILTIN_HOME_PAGE.revision, now }, serving.signingKey);
      const nonce = randomBytes(18).toString("base64url");
      const settings = serving.settings.current();
      const html = renderShell({
        nonce,
        title: BUILTIN_HOME_TITLE,
        homeUrl: null,
        working: false,
        chrome: null,
        config: {
          actionToken: token,
          pageRevision: BUILTIN_HOME_PAGE.revision,
          expiresAt: payload.exp,
          documentUrl: `${serving.routeBase}/home-document`,
          documentPath: ENTRY_DOCUMENT,
          submitUrl: `${serving.routeBase}/submit`,
          uploadUrl: `${serving.routeBase}/upload`,
          bridgeUrl: `${serving.routeBase}/bridge`,
          chromeActionUrl: `${serving.routeBase}/chrome-action`,
          documentSessionUrl: `${serving.routeBase}/document-session`,
          navigable: false,
          workingLabel: settings.workingLabel,
          stale: false,
          empty: false,
          notice,
          pollMs: LIMITS.shellPollMs,
          maxUploadBytes: LIMITS.uploadFileBytes,
          maxUploads: LIMITS.uploadsPerForm,
        },
      });
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", shellCsp(nonce));
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /home", true);
    }
  };
}

/** `GET /home-document` — the built-in home page's document, with the kernel, in the page sandbox. spec R7.9 */
export function homeDocumentRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    try {
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", documentCsp());
      headers.set("etag", etagFor(BUILTIN_HOME_PAGE.revision));
      headers.set("x-thread-page-stale", "false");
      headers.set("x-thread-page-activity", "idle");
      if (ifNoneMatchMatches(context.req.header("if-none-match"), etagFor(BUILTIN_HOME_PAGE.revision))) {
        return new Response(null, { status: 304, headers });
      }
      const config: KernelConfig = { pageRevision: BUILTIN_HOME_PAGE.revision, stale: false, siteRoot: null };
      return new Response(injectKernel(BUILTIN_HOME_PAGE.html, { kernel: KERNEL_RUNTIME, config, baseHref: null }), { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /home-document", true);
    }
  };
}
