import type { OpenExternalParams } from "../../../domain/capabilities/specs.ts";
import { ineligibleReason } from "../../../domain/eligibility.ts";
import { PageError } from "../../../domain/errors.ts";
import { pageUrl } from "../../context.ts";
import { excerpt, handler } from "../handler.ts";

/**
 * Navigation: the host validates the destination and the trusted shell
 * performs it in place (pages, host application) or, after confirmation,
 * to an external origin. spec R5.29–R5.34
 */
export const pagesOpen = handler<{ sessionId: string }, unknown>({
  method: "pages.open",
  async refuse(params, { serving }) {
    const target = await serving.host.sessions.get(params.sessionId);
    if (!target || ineligibleReason(target)) throw new PageError("not_found", "That session has no page");
  },
  async execute(params, { serving }) {
    return { result: { opened: true }, navigate: { kind: "page", url: pageUrl(serving.routeBase, params.sessionId) } };
  },
});

export const sessionsOpenHost = handler<{ sessionId: string }, unknown>({
  method: "sessions.openHost",
  async refuse(params, { serving }) {
    const target = await serving.host.sessions.get(params.sessionId);
    if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
  },
  async execute(params, { serving }) {
    return { result: { opened: true }, navigate: { kind: "host", url: serving.hostSessionUrl(params.sessionId) } };
  },
});

export const navigationOpenExternal = handler<OpenExternalParams, unknown>({
  method: "navigation.openExternal",
  async summarize(params) {
    const origin = new URL(params.url).origin;
    return params.label ? `Leave this page and open “${excerpt(params.label, 60)}” at ${origin}` : `Leave this page and open ${origin}`;
  },
  async execute(params) {
    return { result: { opened: true }, navigate: { kind: "external", url: new URL(params.url).href } };
  },
});
