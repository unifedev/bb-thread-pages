// `BridgeRequest/Response`, `BridgeTransport` (bridge body shapes), `decodeBridgeRequest`, `resolveInvocation` (unknown/stale/params), `completeInvocation` (result projection, response bound).
import { boundedMessage, isBridgeErrorCode, PageError, PUBLIC_MESSAGES, type BridgeErrorCode } from "../errors.ts";
import { isMethodName, isRequestId, isRevision } from "../ids.ts";
import { boundIssue, isJsonObject, utf8Bytes, validateJson, type JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import { isCanonicalScope, scopeProblem } from "../scope.ts";
import { canonicalMethod, unknownMethodMessage } from "./aliases.ts";
import type { AnyCapabilitySpec } from "./contract.ts";
import type { CapabilityLookup } from "./registry.ts";

/** The bridge protocol: what a page sends over the port and what it gets back. Version 1. 05 R3.9, 02 R4.28, 03 R5.38 */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export interface BridgeRequest {
  readonly v: 1;
  readonly id: string;
  readonly method: string;
  readonly params: JsonValue;
  /** The kernel's configured revision; the shell never rewrites it. 02 R-K1, 05 R2.13 */
  readonly pageRevision: string;
  /** The folder the document scoped its calls to; absent when none. 07 R5.81–R5.86 */
  readonly scope?: string;
}

export interface BridgeSuccess {
  readonly v: 1;
  readonly id: string;
  readonly ok: true;
  readonly result: JsonValue;
}

export interface BridgeFailure {
  readonly v: 1;
  readonly id: string;
  readonly ok: false;
  readonly error: { readonly code: BridgeErrorCode; readonly message: string; readonly reason?: string; readonly detail?: JsonValue };
}

export type BridgeResponse = BridgeSuccess | BridgeFailure;

/** A host-validated destination the trusted shell navigates to. 03 R5.29–R5.34 */
export type NavigationDirective = { readonly kind: "page"; readonly url: string } | { readonly kind: "host"; readonly url: string } | { readonly kind: "external"; readonly url: string };

/** What the shell receives from `POST /bridge`. DESIGN §C.3 */
export type BridgeTransport =
  | { readonly response: BridgeResponse; readonly navigate?: NavigationDirective }
  | {
      readonly confirm: {
        readonly requestId: string;
        readonly summary: string;
        readonly challenge: string;
        /** A grant asked once per pair, or a decision confirmed per call, rather than a confirmation of this call alone. 03 R5.64, R-C7 */
        readonly kind?: "grant" | "decision";
        readonly grant?: { readonly sessionId: string; readonly title: string };
      };
    }
  | {
      /** Confirmed by the shell's recording bar: record with these validated parameters. 03 R5.68 */
      readonly record: { readonly requestId: string; readonly params: { language?: string; prompt?: string; maxDurationSeconds: number; keepAudio: boolean } };
    };

/**
 * Decodes the `request` of a bridge envelope: exact keys, version, id,
 * method, revision, a canonical scope; `files` never travel here (the shell
 * strips them). Bounded at the largest bound any contributed method may
 * declare plus the envelope; the method's own bound applies once it is known.
 * spec 05 R3.9, 07 R5.47, R5.83; DESIGN §E.1 step 4
 */
export function decodeBridgeRequest(input: unknown): BridgeRequest {
  const checked = validateJson(input, { maxBytes: LIMITS.contributedPayloadMaxBytes + 1024 });
  if (!checked.ok) {
    const bound = boundIssue(checked);
    if (bound === "too_large") throw new PageError("request_too_large", `Bridge request is larger than ${LIMITS.contributedPayloadMaxBytes + 1024} bytes`);
    if (bound === "too_deep") throw new PageError("request_too_large", `Bridge request is nested deeper than ${LIMITS.capabilityJsonDepth}`);
    if (bound === "too_many_nodes") throw new PageError("request_too_large", `Bridge request has more than ${LIMITS.capabilityJsonNodes} nodes`);
    throw new PageError("invalid_request", "Bridge request is not strict JSON");
  }
  const value = checked.value;
  if (!isJsonObject(value)) throw new PageError("invalid_request", "Bridge request must be an object");
  if ("files" in value) throw new PageError("invalid_request", "Files never travel in the bridge envelope");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "id,method,pageRevision,params,v" && keys !== "id,method,pageRevision,params,scope,v") throw new PageError("invalid_request", "Bridge request has the wrong shape");
  if (value.v !== BRIDGE_PROTOCOL_VERSION) throw new PageError("unsupported_version", "Unsupported bridge protocol version");
  if (!isRequestId(value.id)) throw new PageError("invalid_request", "Invalid request id");
  if (!isMethodName(value.method)) throw new PageError("invalid_request", "Invalid method name");
  if (!isRevision(value.pageRevision)) throw new PageError("invalid_request", "Invalid page revision");
  if (!("params" in value)) throw new PageError("invalid_request", "Bridge request has no params");
  // A scope that could name anything outside the session's folder is refused before anything else. 07 R5.83
  if ("scope" in value && !isCanonicalScope(value.scope)) throw new PageError("invalid_params", `Invalid scope: ${scopeProblem(value.scope)}`);
  const base = { v: 1 as const, id: value.id, method: value.method, params: value.params as JsonValue, pageRevision: value.pageRevision };
  return "scope" in value ? { ...base, scope: value.scope as string } : base;
}

export function safeRequestId(value: unknown): string {
  return isRequestId(value) ? value : "invalid";
}

export function failure(id: unknown, code: BridgeErrorCode, message: string, extra?: { reason?: string | undefined; detail?: JsonValue | undefined }): BridgeFailure {
  const error = { code, message: boundedMessage(message), ...(extra?.reason ? { reason: extra.reason, ...(extra.detail !== undefined ? { detail: extra.detail } : {}) } : {}) };
  return { v: 1, id: safeRequestId(id), ok: false, error };
}

/** The page's view of a thrown error: a `PageError` with a bridge code as it is; anything else `handler_error` with the generic message. 03 R5.41 */
export function failureFromError(id: unknown, error: unknown): BridgeFailure {
  if (PageError.is(error) && isBridgeErrorCode(error.code)) return failure(id, error.code, error.message, { reason: error.reason, detail: error.detail as JsonValue | undefined });
  return failure(id, "handler_error", PUBLIC_MESSAGES.handler);
}

export interface ResolvedInvocation<Params = unknown> {
  readonly request: BridgeRequest;
  readonly spec: AnyCapabilitySpec;
  readonly params: Params;
  /** The method the spec answers to; an alias resolves to it. 03 §Renames (U34) */
  readonly method: string;
}

/**
 * Looks a request up (aliases first), refuses a stale revision, applies the
 * method's request bound and validates the parameters. spec 03 R5.2, R5.6,
 * 05 R2.13, 07 R5.47; DESIGN §E.1 steps 6–8
 */
export function resolveInvocation(request: BridgeRequest, lookup: CapabilityLookup, currentRevision: string): ResolvedInvocation {
  const method = canonicalMethod(request.method);
  const spec = lookup.get(method);
  if (!spec || !spec.implemented) throw new PageError("unknown_method", unknownMethodMessage(request.method));
  if (request.pageRevision !== currentRevision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
  const bound = spec.maxRequestBytes ?? LIMITS.capabilityPayloadBytes;
  if (utf8Bytes(JSON.stringify(request)) > bound) throw new PageError("request_too_large", `Request for ${spec.method} is larger than ${bound} bytes`);
  const params = spec.validateParams(request.params);
  if (!params.ok) {
    const first = params.issues[0];
    throw new PageError("invalid_params", `Invalid parameters for ${spec.method}${first ? ` at ${first.path}: ${first.message}` : ""}`);
  }
  return { request, spec, params: params.value, method };
}

/**
 * Projects a handler result through the spec's validator into a response and
 * measures the whole envelope against the method's response bound, depth and
 * nodes — three distinct refusals, never a truncation. 03 R5.3, 07 R5.47, R-X4
 */
export function completeInvocation(invocation: ResolvedInvocation, result: unknown): BridgeResponse {
  const projected = invocation.spec.validateResult(result);
  if (!projected.ok) {
    const first = projected.issues[0];
    return failure(invocation.request.id, "invalid_result", `Invalid result for ${invocation.spec.method}${first ? ` at ${first.path}: ${first.message}` : ""}`);
  }
  const bound = invocation.spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes;
  const response: BridgeSuccess = { v: 1, id: invocation.request.id, ok: true, result: projected.value as JsonValue };
  const checked = validateJson(response, { maxBytes: bound });
  if (!checked.ok) {
    const issue = boundIssue(checked);
    if (issue === "too_large") return failure(invocation.request.id, "response_too_large", `Response for ${invocation.spec.method} is larger than ${bound} bytes`);
    if (issue === "too_deep") return failure(invocation.request.id, "response_too_large", `Response for ${invocation.spec.method} is nested deeper than ${LIMITS.capabilityJsonDepth}`);
    if (issue === "too_many_nodes") return failure(invocation.request.id, "response_too_large", `Response for ${invocation.spec.method} has more than ${LIMITS.capabilityJsonNodes} nodes`);
    return failure(invocation.request.id, "invalid_result", `Result for ${invocation.spec.method} is not strict JSON`);
  }
  return checked.value as unknown as BridgeSuccess;
}
