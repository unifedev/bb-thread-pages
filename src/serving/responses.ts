import { PageError, errorText } from "../domain/errors.ts";
import { escapeHtml } from "../domain/html/escape.ts";
import { PAGE_SANDBOX } from "../domain/sandbox.ts";
import type { HostLogger } from "../host/types.ts";

/** Response helpers and the two content security policies. spec R2.41–R2.43, 03 */

/**
 * Every response refuses the powerful features. The page document keeps the
 * microphone refused too: only the shell records (R3.30).
 */
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
/**
 * The shell alone may use the microphone, for its own recording bar; it
 * delegates nothing to the page frame, whose `allow` never names it. Every
 * other feature stays refused. spec R3.31, D38
 */
export const SHELL_PERMISSIONS_POLICY = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()";

export function baseHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "permissions-policy": PERMISSIONS_POLICY,
  });
}

/** The trusted shell's headers: its nonce policy, and the microphone for itself. */
export function shellHeaders(nonce: string): Headers {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", shellCsp(nonce));
  headers.set("permissions-policy", SHELL_PERMISSIONS_POLICY);
  return headers;
}

/** The trusted shell: nothing runs but our nonced script and style. */
export function shellCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    // blob: and data: only because WebKit checks a download the page builds against its parent's
    // frame-src, as a navigation of the page frame (measured). The frame keeps its sandbox whatever it shows.
    "frame-src 'self' blob: data:",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
  ].join("; ");
}

/**
 * The document: open network and arbitrary code (spec R3.4, R3.11), frames
 * of any https site (R3.27, D36), no plugins, same-origin bases only, and
 * the sandbox restated so it holds even if the frame attribute did not.
 *
 * `frame-ancestors 'self'` is what keeps this host's own pages out of a
 * page's frames by URL (R3.27): a document may be framed by the shell, whose
 * origin is this host's, and by nothing else — an opaque-origin page among
 * its ancestors never matches `'self'`. The shell's policy says the same.
 */
export function documentCsp(): string {
  return [
    "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
    "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
    "style-src * data: blob: 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src * data: blob:",
    "media-src * data: blob:",
    "connect-src * data: blob:",
    "worker-src * blob: data:",
    // blob: and data: too: WebKit checks a download's navigation against frame-src, so without them a
    // download the page built is refused there (measured). Such a frame is the page's own content, in its sandbox.
    "frame-src https: blob: data:",
    "child-src https: blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    `sandbox ${PAGE_SANDBOX}`,
  ].join("; ");
}

export function jsonResponse(value: unknown, status = 200, extra?: Record<string, string>): Response {
  const headers = baseHeaders("application/json; charset=utf-8");
  for (const [key, entry] of Object.entries(extra ?? {})) headers.set(key, entry);
  return new Response(JSON.stringify(value), { status, headers });
}

export function errorJson(error: PageError): Response {
  return jsonResponse({ ok: false, code: error.code, message: error.message }, error.status);
}

export function errorPage(message: string, status: number): Response {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thread Page</title><style>body{max-width:42rem;margin:4rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas}h1{font-size:1.4rem}</style></head><body><main><h1>Thread Page</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return new Response(html, { status, headers });
}

/** Turns any failure into a response, logging the cause when it is not a page error. */
export function failureResponse(error: unknown, log: HostLogger, where: string, asPage: boolean): Response {
  if (PageError.is(error)) {
    if (error.cause !== undefined) log.warn(`${where}: ${error.code}: ${errorText(error.cause)}`);
    return asPage ? errorPage(error.message, error.status) : errorJson(error);
  }
  log.warn(`${where}: ${errorText(error)}`);
  const generic = new PageError("handler_error", "Something went wrong serving this page.");
  return asPage ? errorPage(generic.message, 500) : errorJson(generic);
}
