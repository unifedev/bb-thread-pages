// `pages.open` and `navigation.openExternal`: the host validates the destination and the trusted shell navigates — in place to a page or the home, or after confirmation to another site in a new tab; the host's own page address is `pages.open`, its other own addresses are refused before any dialog (03 R5.29–R5.34; DESIGN §E.4).
import type { OpenExternalParams, PagesOpenParams } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import { externalUrlProblem, hostPageTarget } from "../../../domain/external-url.ts";
import type { PagesRequest } from "../../../host/serving.ts";
import type { ServingContext } from "../../context.ts";
import { requestOrigins } from "../../request.ts";
import { existingSession, handler, quoted } from "../handler.ts";

export const pagesOpen = handler<PagesOpenParams, unknown>({
  method: "pages.open",
  async refuse(params, context) {
    // An archived or page-less session still opens: the shell shows its state. Only a deleted one is refused. 03 R5.29
    if (params.sessionId !== undefined) await existingSession(context, params.sessionId);
  },
  async execute(params, context) {
    const base = context.serving.serving.base();
    // Home is the route, which serves whatever is designated when the reader arrives. 03 R5.29a, 05 R-S12 (U58)
    if (params.sessionId === undefined) return { result: { opened: true }, navigate: { kind: "page", url: `${base}/home` } };
    // The document and place ride the page address as the shell writes it; the shell opens them. 03 R5.29b, 01 R1.12d, R1.12f
    const query = new URLSearchParams({ session: params.sessionId });
    if (params.path !== undefined) query.set("path", params.path);
    const url = `${base}/page?${query}${params.fragment !== undefined ? `#${params.fragment}` : ""}`;
    return { result: { opened: true }, navigate: { kind: "page", url } };
  },
});

/** Every origin that is this host: the request's, the published one, and the serving host's declared ones. 03 R5.32a */
async function ownOrigins(context: { requestOrigins: readonly string[]; serving: { serving: { origin(): Promise<string | null>; ownOrigins(): Promise<string[]> } } }): Promise<string[]> {
  const own = [...context.requestOrigins];
  const published = await context.serving.serving.origin().catch(() => null);
  if (published) own.push(published);
  const declared = await context.serving.serving.ownOrigins().catch(() => [] as string[]);
  own.push(...declared);
  return own;
}

/** `pages.open`'s parameters when `url` is the host's own page address on any of its origins, else null. 03 R5.32b */
export async function hostPageParams(url: string, serving: ServingContext, request: PagesRequest): Promise<PagesOpenParams | null> {
  return hostPageTarget(url, await ownOrigins({ requestOrigins: requestOrigins(request.headers), serving }), serving.serving.base());
}

export const navigationOpenExternal = handler<OpenExternalParams, unknown>({
  method: "navigation.openExternal",
  async refuse(params, context) {
    const problem = externalUrlProblem(params.url, await ownOrigins(context));
    if (problem) throw new PageError("invalid_params", problem);
  },
  // The page stays; the site opens beside it. 03 R5.33
  async summarize(params) {
    const origin = new URL(params.url).origin;
    return params.label !== undefined ? `Open ${quoted(params.label, 60)} (${origin}) in a new tab?` : `Open ${origin} in a new tab?`;
  },
  async execute(params) {
    return { result: { opened: true }, navigate: { kind: "external", url: new URL(params.url).href } };
  },
});
