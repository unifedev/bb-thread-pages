import { PageError, errorText } from "../domain/errors.ts";
import { escapeHtml } from "../domain/html/escape.ts";
import type { HostLogger } from "../host/types.ts";

/** Response helpers and the two content security policies. spec R2.41–R2.43, 03 */

export function baseHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  });
}

/** The trusted shell: nothing runs but our nonced script and style. */
export function shellCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "frame-src 'self'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
  ].join("; ");
}

/**
 * The document: open network and arbitrary code (spec R3.4, R3.11), no
 * frames (embedding is deferred), no plugins, same-origin bases only, and
 * the sandbox restated so it holds even if the frame attribute did not.
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
    "frame-src 'none'",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "sandbox allow-scripts allow-forms",
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
