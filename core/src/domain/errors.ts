// `BRIDGE_ERROR_CODES`, `PageError` (code, public message, HTTP status, cause), `PUBLIC_MESSAGES` (host-neutral), `mapProviderError` (06 R-P9).
import { LIMITS } from "./limits.ts";

/** The fixed error set a page may see. 03 R5.38 */
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
  "settings_unsupported",
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

const BRIDGE_ERROR_CODE_SET: ReadonlySet<string> = new Set(BRIDGE_ERROR_CODES);

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === "string" && BRIDGE_ERROR_CODE_SET.has(value);
}

/** Codes only routes produce: a bad token, no reader. 05 R2.4, R-S8; DESIGN §B.2 */
export type RouteErrorCode = "forbidden" | "ineligible" | "no_page" | "page_too_large" | "unauthenticated";

export type PageErrorCode = BridgeErrorCode | RouteErrorCode;

/** The HTTP status of each code. DESIGN §E.1 */
export const STATUS_BY_CODE: Readonly<Record<PageErrorCode, number>> = Object.freeze({
  invalid_json: 400,
  invalid_request: 400,
  invalid_params: 400,
  unsupported_version: 400,
  cancelled: 400,
  settings_unsupported: 400,
  confirmation_required: 401,
  unauthenticated: 401,
  confirmation_invalid: 403,
  forbidden: 403,
  ineligible: 404,
  no_page: 404,
  page_too_large: 413,
  unknown_method: 404,
  not_found: 404,
  stale_page: 409,
  conflict: 409,
  request_too_large: 413,
  rate_limited: 429,
  handler_error: 500,
  invalid_result: 500,
  response_too_large: 500,
  invalid_response: 502,
  unavailable: 503,
});

/**
 * One failure: a machine code, a message safe to show a reader or a page,
 * an HTTP status, an optional declared reason with its detail, and
 * (server-side only) the real cause for the log. spec 05 R2.41–R2.43, 03 R5.41b
 */
export class PageError extends Error {
  readonly code: PageErrorCode;
  readonly status: number;
  readonly reason: string | undefined;
  readonly detail: unknown;
  override readonly cause: unknown;

  constructor(code: PageErrorCode, publicMessage: string, options?: { cause?: unknown; status?: number; reason?: string; detail?: unknown }) {
    super(boundedMessage(publicMessage));
    this.name = "PageError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.reason = options?.reason;
    this.detail = options?.detail;
    this.cause = options?.cause;
  }

  /** The same as `status`, under the name DESIGN §B.9 uses. */
  get httpStatus(): number {
    return this.status;
  }

  static is(value: unknown): value is PageError {
    return value instanceof PageError;
  }
}

/** Where the server writes what an operator reads; structurally the host's `Logger`. 05 R2.43 */
export interface LogSink {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** A message within `errorMessageChars`, one line. 05 R2.41 */
export function boundedMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim() || "Request failed";
  return normalized.length <= LIMITS.errorMessageChars ? normalized : `${normalized.slice(0, LIMITS.errorMessageChars - 1)}…`;
}

/** The text of an unknown error, for logs only (never for a page). 05 R2.43 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Every message a page or reader may see from the server. None names a host, a path or a command. 05 R2.42 */
export const PUBLIC_MESSAGES = Object.freeze({
  unauthenticated: "Sign in to read pages.",
  noPage: "This session has no page yet.",
  ineligible: "Only visible root sessions have pages.",
  deleted: "This session was deleted.",
  pageTooLarge: `The page's entry document is larger than ${LIMITS.entryDocumentBytes / (1024 * 1024)} MiB and was not served.`,
  unreachable: "The page's source is unreachable. Reconnect its host and try again.",
  staleCopy: "The source host is offline; this cached page is read-only.",
  archived: "This session is archived; its page is read-only.",
  stalePage: "This page changed; reload it before responding.",
  handler: "Could not execute the page action.",
  rateLimited: "Too many requests from this page; try again shortly.",
  invalidSession: "A valid session id is required.",
  tokenInvalid: "This page session is invalid or expired; reload the page.",
  confirmationRequired: "This action needs the reader's confirmation.",
  confirmationInvalid: "This confirmation is not valid for this request.",
  cancelled: "The reader declined.",
  notFound: "Not found.",
  conflict: "The request conflicts with the current state.",
  unavailable: "This cannot be served right now.",
  tooLarge: "The request is too large.",
  invalidJson: "The body is not valid JSON.",
  summaryTooLong: "The decision's summary is too long to show; decide in the host's own interface.",
  homeNoSession: "The built-in home page has no session.",
  settingsUnsupported: "This session cannot take those settings here; send the reply without them.",
});

const PROVIDER_REASON_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  archived: PUBLIC_MESSAGES.archived,
  offline: PUBLIC_MESSAGES.staleCopy,
  summary_too_long: PUBLIC_MESSAGES.summaryTooLong,
});

/** The shape a provider member rejects with; declared in `src/host/provider.ts`, matched here structurally so the domain imports nothing from the host. 06 R-P9 */
export interface ProviderFailure {
  readonly code: "not_found" | "unavailable" | "too_large" | "conflict" | "unsupported" | "other";
  readonly message: string;
  readonly reason?: string | undefined;
  readonly detail?: { unsupported: string[] } | undefined;
}

export function isProviderFailure(value: unknown): value is ProviderFailure {
  return (
    value instanceof Error &&
    value.name === "ProviderError" &&
    typeof (value as unknown as { code?: unknown }).code === "string" &&
    ["not_found", "unavailable", "too_large", "conflict", "unsupported", "other"].includes((value as unknown as { code: string }).code)
  );
}

/**
 * Maps what a provider member threw onto the page's fixed set. `other` and
 * anything else → `handler_error` with the generic message; the cause rides
 * on the error for the log and never reaches the page. 06 R-P9, 05 R2.42
 */
/** A host's `{ opened: false, notice }` line for the reader (06 `sessions.openHost`), bounded like an error message and never empty. */
export function boundNotice(notice: unknown): string {
  const text = typeof notice === "string" ? notice.trim().slice(0, LIMITS.errorMessageChars) : "";
  return text || "This session cannot be opened from here.";
}

/** The `settings_unsupported` failure: `reason: "settings"`, `detail.unsupported` naming the fields the host could not apply. 03 §Errors, U47 */
export function settingsUnsupported(unsupported: readonly string[], cause?: unknown): PageError {
  const fields = [...new Set(unsupported)];
  return new PageError("settings_unsupported", fields.length ? `${PUBLIC_MESSAGES.settingsUnsupported} Unsupported: ${fields.join(", ")}` : PUBLIC_MESSAGES.settingsUnsupported, { reason: "settings", detail: { unsupported: fields }, ...(cause !== undefined ? { cause } : {}) });
}

export function mapProviderError(error: unknown, log?: LogSink, where = "provider"): PageError {
  if (PageError.is(error)) return error;
  if (isProviderFailure(error)) {
    const reason = error.reason;
    // A cursor the session did not issue, whatever code the provider chose: the page's parameter was wrong. 03 R-C1; DR-6
    if (reason === "cursor") return new PageError("invalid_params", "Unknown cursor: the session did not issue it", { cause: error, reason });
    const reasoned = reason ? PROVIDER_REASON_MESSAGES[reason] : undefined;
    const options = reason ? { cause: error, reason } : { cause: error };
    switch (error.code) {
      case "not_found":
        return new PageError("not_found", reasoned ?? PUBLIC_MESSAGES.notFound, options);
      case "unavailable":
        return new PageError("unavailable", reasoned ?? PUBLIC_MESSAGES.unavailable, options);
      case "too_large":
        return new PageError("request_too_large", reasoned ?? PUBLIC_MESSAGES.tooLarge, options);
      case "conflict":
        return new PageError("conflict", reasoned ?? PUBLIC_MESSAGES.conflict, options);
      case "unsupported":
        // A reply's settings the provider cannot apply: the whole call fails before delivery, naming the fields, and the page may resend without them. 03 §Errors, U47
        return settingsUnsupported(error.detail?.unsupported ?? [], error);
      default:
        break;
    }
  }
  log?.error(`${where}: ${errorText(error)}`);
  return new PageError("handler_error", PUBLIC_MESSAGES.handler, { cause: error });
}
