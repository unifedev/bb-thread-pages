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

const OWN_ORIGIN_REFUSAL = "navigation.openExternal does not open this host's own addresses; open a page with pages.open and a session with sessions.openHost";

/** A hostname as a server sees it: lower case, no trailing dots, no IPv6 brackets. */
function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[(.*)\]$/, "$1");
}

/** Every name for this machine's own loopback: `localhost` (and `*.localhost`), 127.0.0.0/8, `::1`, `0.0.0.0`. */
function isLoopback(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host) || host === "::1" || host === "0.0.0.0" || /^::ffff:(127\.|7f)/.test(host);
}

function portOf(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

/**
 * Whether `target` is this host: a `getbb.app` name whatever its port, or the
 * same server as one of `own` under another name — the same host and port, or,
 * when the reader is on loopback, **any** host on that port: a LAN address of an
 * all-interfaces bind, or a DNS name that resolves to 127.0.0.1 (`lvh.me`,
 * `*.nip.io`), reaches the same server and cannot be told apart by name. The URL
 * parser has already folded case, numeric IPv4 forms and punycode, so a
 * look-alike stays another site. spec R5.32a
 */
export function isOwnHost(target: URL, own: readonly string[]): boolean {
  const host = hostKey(target.hostname);
  if (host === HOSTED_DOMAIN || host.endsWith(`.${HOSTED_DOMAIN}`)) return true;
  const port = portOf(target);
  return own.some((origin) => {
    let mine: URL;
    try {
      mine = new URL(origin);
    } catch {
      return false;
    }
    if (portOf(mine) !== port) return false;
    const other = hostKey(mine.hostname);
    return other === host || isLoopback(other);
  });
}

export const navigationOpenExternal = handler<OpenExternalParams, unknown>({
  method: "navigation.openExternal",
  /**
   * Never this host: the shell opens the URL unsandboxed, with the reader's
   * credential, and the host serves files a page chose on its own origin
   * (spec R5.32a, X37). Host addresses have their own capabilities.
   */
  async refuse(params, { serving, requestOrigins }) {
    const own = [...(requestOrigins ?? [])];
    const published = await serving.host.origin.public().catch(() => null);
    if (published) own.push(published);
    if (isOwnHost(new URL(params.url), own)) throw new PageError("invalid_params", OWN_ORIGIN_REFUSAL);
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
