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
    const target = await serving.host.sessions.get(params.sessionId);
    if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
    // The host's canonical address includes the session's project. spec R5.31a
    return { result: { opened: true }, navigate: { kind: "host", url: serving.hostSessionUrl(target) } };
  },
});

/** bb Connect's addresses: whatever the reader reaches this host at over the internet. */
const HOSTED_DOMAIN = "getbb.app";

export const OWN_ORIGIN_REFUSAL = "navigation.openExternal does not open this host's own addresses; open a page with pages.open and a session with sessions.openHost";

export const navigationOpenExternal = handler<OpenExternalParams, unknown>({
  method: "navigation.openExternal",
  /**
   * Never this host: the shell opens the URL unsandboxed, with the reader's
   * credential, and the host serves files a page chose on its own origin
   * (spec R5.32a, X37). Host addresses have their own capabilities.
   */
  async refuse(params, { serving, requestOrigins }) {
    const target = new URL(params.url);
    const hostname = target.hostname.toLowerCase();
    const own = new Set(requestOrigins ?? []);
    const published = await serving.host.origin.public().catch(() => null);
    if (published) own.add(new URL(published).origin);
    if (hostname === HOSTED_DOMAIN || hostname.endsWith(`.${HOSTED_DOMAIN}`) || own.has(target.origin)) {
      throw new PageError("invalid_params", OWN_ORIGIN_REFUSAL);
    }
  },
  // The page stays; the site opens beside it. spec R5.33
  async summarize(params) {
    const origin = new URL(params.url).origin;
    return params.label ? `Open “${excerpt(params.label, 60)}” (${origin}) in a new tab?` : `Open ${origin} in a new tab?`;
  },
  async execute(params) {
    return { result: { opened: true }, navigate: { kind: "external", url: new URL(params.url).href } };
  },
});
