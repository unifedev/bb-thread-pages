import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import { mintActionToken } from "../domain/tokens/action-token.ts";
import type { ServingContext } from "./context.ts";
import { homeUrl } from "./context.ts";
import { baseHeaders, failureResponse, shellCsp } from "./responses.ts";
import { renderShell } from "./shell-html.ts";
import { eligibleSession, sessionIdFrom } from "./session-access.ts";

/** `GET /page?session=<id>` — the shell for one page. spec 02 §The shell */
export function shellRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    try {
      const id = sessionIdFrom(context);
      const session = await eligibleSession(serving, id);
      const page = await serving.pages.load(id);
      const now = serving.now();
      const { token, payload } = mintActionToken({ session: id, revision: page.revision, now }, serving.signingKey);
      const nonce = randomBytes(18).toString("base64url");
      const settings = serving.settings.current();
      const home = isSessionId(settings.homeSessionId) && settings.homeSessionId !== id ? homeUrl(serving.routeBase) : null;
      const html = renderShell({
        nonce,
        title: session.title,
        homeUrl: home,
        working: session.state === "working",
        chrome: { hostUrl: serving.hostSessionUrl(id), pinned: session.pinned, unread: session.unread },
        config: {
          actionToken: token,
          pageRevision: page.revision,
          expiresAt: payload.exp,
          documentUrl: serving.site.documentUrl(id),
          submitUrl: `${serving.routeBase}/submit`,
          uploadUrl: `${serving.routeBase}/upload`,
          bridgeUrl: `${serving.routeBase}/bridge`,
          chromeActionUrl: `${serving.routeBase}/chrome-action`,
          workingLabel: settings.workingLabel,
          stale: page.stale,
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
