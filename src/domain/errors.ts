import { LIMITS } from "./limits.ts";

/** The fixed error set a page may see. spec R5.38 */
export const BRIDGE_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "invalid_params",
  "invalid_response",
  "request_too_large",
  "response_too_large",
  "unsupported_version",
  "unknown_method",
  "stale_page",
  "confirmation_required",
  "confirmation_invalid",
  "cancelled",
  "not_found",
  "conflict",
  "unavailable",
  "rate_limited",
  "handler_error",
  "invalid_result",
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

const BRIDGE_ERROR_CODE_SET: ReadonlySet<string> = new Set(BRIDGE_ERROR_CODES);

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === "string" && BRIDGE_ERROR_CODE_SET.has(value);
}

/** Codes that only routes (not the bridge) produce. */
export type RouteErrorCode =
  | "forbidden"
  | "ineligible"
  | "invalid_session"
  | "no_page"
  | "page_too_large";

export type PageErrorCode = BridgeErrorCode | RouteErrorCode;

const STATUS_BY_CODE: Record<PageErrorCode, number> = {
  invalid_json: 400,
  invalid_request: 400,
  invalid_params: 400,
  invalid_response: 502,
  request_too_large: 413,
  response_too_large: 500,
  unsupported_version: 400,
  unknown_method: 404,
  stale_page: 409,
  confirmation_required: 401,
  confirmation_invalid: 403,
  cancelled: 400,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  rate_limited: 429,
  handler_error: 500,
  invalid_result: 500,
  forbidden: 403,
  ineligible: 404,
  invalid_session: 400,
  no_page: 404,
  page_too_large: 413,
};

/**
 * One failure: a machine code, a message safe to show a reader or a page,
 * an HTTP status, and (server-side only) the real cause for the log.
 * spec R2.41–R2.43
 */
export class PageError extends Error {
  readonly code: PageErrorCode;
  readonly status: number;
  override readonly cause: unknown;

  constructor(code: PageErrorCode, publicMessage: string, options?: { cause?: unknown; status?: number }) {
    super(boundedMessage(publicMessage));
    this.name = "PageError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.cause = options?.cause;
  }

  static is(value: unknown): value is PageError {
    return value instanceof PageError;
  }
}

export function boundedMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim() || "Request failed";
  return normalized.length <= LIMITS.errorMessageChars
    ? normalized
    : `${normalized.slice(0, LIMITS.errorMessageChars - 1)}…`;
}

/** The text of an unknown error, for logs only (never for a page). */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const PUBLIC_MESSAGES = Object.freeze({
  noPage: "This session has no page yet. Run `bb thread-page init` in the session first.",
  ineligible: "Only visible root sessions have pages.",
  pageTooLarge: `The page's entry document is larger than ${LIMITS.entryDocumentBytes / (1024 * 1024)} MiB and was not served.`,
  unavailable: "The page's source is unreachable. Reconnect its host and try again.",
  staleCopy: "The source host is offline; this cached page is read-only.",
  stalePage: "This page changed; reload it before responding.",
  handler: "Could not execute the page action.",
  rateLimited: "Too many requests from this page; try again shortly.",
  invalidSession: "A valid session id is required.",
  tokenInvalid: "This page session is invalid or expired; reload the page.",
});
