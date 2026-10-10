// `pages.open` and `navigation.openExternal`: the host validates the destination and the trusted shell navigates — in place to a page, or after confirmation to another site in a new tab; the host's own origins are refused before any dialog (03 R5.29–R5.34; DESIGN §E.4).
import type { OpenExternalParams } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import { externalUrlProblem } from "../../../domain/external-url.ts";
import { existingSession, handler, quoted } from "../handler.ts";

export const pagesOpen = handler<{ sessionId: string }, unknown>({
  method: "pages.open",
  async refuse(params, context) {
    // An archived or page-less session still opens: the shell shows its state. Only a deleted one is refused. 03 R5.29
    await existingSession(context, params.sessionId);
  },
  async execute(params, context) {
    return { result: { opened: true }, navigate: { kind: "page", url: `${context.serving.serving.base()}/page?session=${encodeURIComponent(params.sessionId)}` } };
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
