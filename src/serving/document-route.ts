import type { Context } from "hono";
import { injectKernel } from "../domain/html/document.ts";
import { etagFor, ifNoneMatchMatches } from "../domain/revision.ts";
import { KERNEL_RUNTIME } from "../generated/kernel-runtime.ts";
import type { KernelConfig } from "../runtime/shared/protocol.ts";
import type { ServingContext } from "./context.ts";
import { baseHeaders, documentCsp, failureResponse } from "./responses.ts";
import { eligibleSession, sessionIdFrom } from "./session-access.ts";

/**
 * `GET /document?session=<id>` — the entry document with the kernel injected,
 * and the shell's revision poll: the ETag is the revision, the activity and
 * source state ride along as headers. spec R2.11–R2.13, R2.17, R2.25
 */
export function documentRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    try {
      const id = sessionIdFrom(context);
      const session = await eligibleSession(serving, id);
      const page = await serving.pages.load(id);
      const headers = baseHeaders("text/html; charset=utf-8");
      headers.set("content-security-policy", documentCsp());
      headers.set("etag", etagFor(page.revision));
      headers.set("x-thread-page-stale", String(page.stale));
      headers.set("x-thread-page-activity", session.state);
      headers.set("x-thread-page-updated-at", String(page.updatedAtMs));
      if (ifNoneMatchMatches(context.req.header("if-none-match"), etagFor(page.revision))) {
        return new Response(null, { status: 304, headers });
      }
      const config: KernelConfig = { pageRevision: page.revision, stale: page.stale };
      const html = injectKernel(page.html, { kernel: KERNEL_RUNTIME, config, baseHref: serving.site.baseHref(id) });
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return failureResponse(error, serving.host.log, "GET /document", true);
    }
  };
}
