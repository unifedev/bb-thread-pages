// `json(status, body)`, `html(status, body, csp)`, `failure(error)`, header sets (CSP, `Permissions-Policy`, `Cache-Control: no-store`, `X-Content-Type-Options`) (05 R2.41–R2.43, R3.3, R3.27, R3.30, R3.31; DESIGN §F.1–§F.3).
import { errorText, PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { escapeHtml } from "../domain/html/escape.ts";
import { etagFor } from "../domain/revision.ts";
import { DOCUMENT_CSP, DOCUMENT_PERMISSIONS_POLICY, FILE_CSP, SHELL_PERMISSIONS_POLICY, shellCsp } from "../domain/sandbox.ts";
import type { Logger } from "../host/provider.ts";
import type { PagesResponse } from "../host/serving.ts";

const encoder = new TextEncoder();

/** Every response: never cached, never sniffed, never a referrer. 05 R-S9; DESIGN §F.1 */
export function baseHeaders(contentType?: string): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

export function json(status: number, body: unknown, extra?: Record<string, string>): PagesResponse {
  const headers = baseHeaders("application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value);
  return { status, headers, body: encoder.encode(JSON.stringify(body)) };
}

export function html(status: number, body: string, policy: { csp: string; permissionsPolicy: string }, extra?: Record<string, string>): PagesResponse {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", policy.csp);
  headers.set("permissions-policy", policy.permissionsPolicy);
  for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value);
  return { status, headers, body: encoder.encode(body) };
}

export function noBody(status: number, headers: Headers): PagesResponse {
  return { status, headers, body: null };
}

/** The document's headers: the page sandbox restated, the microphone refused, the revision as the entity tag. 05 R3.3, R3.27, R3.30, R2.12 */
export function documentHeaders(revision: string): Headers {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", DOCUMENT_CSP);
  headers.set("permissions-policy", DOCUMENT_PERMISSIONS_POLICY);
  headers.set("etag", etagFor(revision));
  return headers;
}

/** The shell's headers: its one nonce, the microphone to itself alone. 05 R3.5, R3.6, R3.31 */
export function shellHeaders(nonce: string): Headers {
  const headers = baseHeaders("text/html; charset=utf-8");
  headers.set("content-security-policy", shellCsp(nonce));
  headers.set("permissions-policy", SHELL_PERMISSIONS_POLICY);
  return headers;
}

/** An own file served by the document route's file variant: sandboxed, typed by extension, never cross-origin. 05 §Own files by URL, R-S4 */
export function fileHeaders(contentType: string): Headers {
  const headers = baseHeaders(contentType);
  headers.set("content-security-policy", FILE_CSP);
  headers.set("accept-ranges", "bytes");
  return headers;
}

/** A host error page: one line, no script, sandboxed, no session id in it. 05 R2.5, R-S4 */
export const ERROR_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export function errorPage(status: number, message: string): PagesResponse {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Thread Page</title>
<style>body{max-width:42rem;margin:4rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas}h1{font-size:1.4rem}</style>
</head>
<body><main><h1>Thread Page</h1><p>${escapeHtml(message)}</p></main></body>
</html>
`;
  return html(status, body, { csp: ERROR_PAGE_CSP, permissionsPolicy: DOCUMENT_PERMISSIONS_POLICY });
}

/** The one body a missing reader gets: no page named, JSON on API routes, one HTML line on `/page` and `/home`. 05 R2.4, R-S8; DESIGN §B.2 */
export function unauthenticated(asPage: boolean): PagesResponse {
  if (asPage) return errorPage(401, PUBLIC_MESSAGES.unauthenticated);
  return json(401, { code: "unauthenticated", message: PUBLIC_MESSAGES.unauthenticated });
}

export interface RouteFailureBody {
  ok: false;
  code: string;
  message: string;
  reason?: string;
}

/** Turns any failure into a response: a `PageError`'s status and public message; anything else `handler_error`, its cause logged, never shown. 05 R2.41–R2.43 */
export function failure(error: unknown, log: Logger, where: string, asPage: boolean): PagesResponse {
  if (PageError.is(error)) {
    if (error.code === "unauthenticated") return unauthenticated(asPage);
    if (error.cause !== undefined) log.warn(`${where}: ${error.code}: ${errorText(error.cause)}`);
    if (asPage) return errorPage(error.status, error.message);
    const body: RouteFailureBody = { ok: false, code: error.code, message: error.message, ...(error.reason ? { reason: error.reason } : {}) };
    return json(error.status, body);
  }
  log.error(`${where}: ${errorText(error)}`);
  const generic = new PageError("handler_error", PUBLIC_MESSAGES.handler);
  return asPage ? errorPage(generic.status, generic.message) : json(generic.status, { ok: false, code: generic.code, message: generic.message });
}
