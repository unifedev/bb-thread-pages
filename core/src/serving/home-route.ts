// `GET /home`: redirect to the designated page or serve the built-in home shell; `GET /home-document` (05 R-S12, R2.15; 04 R6.8; 08 A61; DESIGN §F.5).
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import type { ServingContext, SessionAccess } from "./context.ts";
import { serveDocument } from "./document-route.ts";
import { baseHeaders, failure, html as htmlResponse, shellHeaders } from "./responses.ts";
import { requireReader } from "./request.ts";
import { loadPageView } from "./session-access.ts";
import { renderShell } from "./shell-html.ts";
import { buildShellConfig, shellNonce } from "./shell-route.ts";

/** The notice when a designation no longer resolves, written into the home document itself. 08 A61; U49 */
export const STALE_HOME_NOTICE = "Home pointed at a session that no longer exists — this is the built-in home page";
/** The built-in home's `<title>`. */
export const HOME_TITLE = "Home";

const HOME_ACCESS: SessionAccess = { kind: "home" };

/** Whether a designated session still has a page to serve as home. 05 R-S12 */
async function designatedHome(ctx: ServingContext): Promise<{ id: string | null; stale: boolean }> {
  const id = await ctx.home.get();
  if (id === null) return { id: null, stale: false };
  const record = await ctx.provider.sessions.get(id).catch(() => null);
  if (!record || !record.visible || (!ctx.provider.sessions.isEligible(record) && !record.archived)) return { id: null, stale: true };
  if (!(await ctx.pages.available(id))) return { id: null, stale: true };
  return { id, stale: false };
}

/** `/home?builtin=1`: the built-in home even while a page is designated, so its duties (drafts, grants) stay reachable. 05 R-S12 */
export const BUILTIN_QUERY = "builtin";

/** `GET /home` — `302` to the designated page while it exists with a page, else (or with `?builtin=1`) the built-in home page under its own identity. 05 R-S12, R2.15 */
export function homeRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      const designated = await designatedHome(ctx);
      if (designated.id !== null && request.query.get(BUILTIN_QUERY) !== "1") {
        const headers = baseHeaders();
        headers.set("location", `page?session=${encodeURIComponent(designated.id)}`);
        return { status: 302, headers, body: null };
      }
      const view = await loadPageView(ctx.pages, HOME_ACCESS, null);
      const config = await buildShellConfig(ctx, request, { access: HOME_ACCESS, path: null, query: "", view, title: HOME_TITLE });
      const nonce = shellNonce(ctx);
      const headers = shellHeaders(nonce);
      return htmlResponse(200, renderShell({ nonce, config }), { csp: headers.get("content-security-policy")!, permissionsPolicy: headers.get("permissions-policy")! });
    } catch (error) {
      return failure(error, ctx.log, "GET /home", true);
    }
  };
}

/** `GET /home-document?render=<token>` — the built-in home's document with the kernel, in the page sandbox, with `uploads: false`, carrying the stale-designation notice itself; polls like any document. 05 R-S12; 02 R4.60; 08 A61 */
export function homeDocumentRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    try {
      requireReader(request);
      const designated = await designatedHome(ctx);
      return await serveDocument(ctx, request, { access: HOME_ACCESS, path: null, query: "", notice: designated.stale ? STALE_HOME_NOTICE : null });
    } catch (error) {
      return failure(error, ctx.log, "GET /home-document", false);
    }
  };
}
