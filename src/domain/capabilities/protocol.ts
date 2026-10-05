import { boundedMessage, isBridgeErrorCode, PageError, type BridgeErrorCode } from "../errors.ts";
import { isMethodName, isRequestId, isRevision } from "../ids.ts";
import { isJsonObject, validateJson, type JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import { isCanonicalScope } from "../scope.ts";
import type { CapabilityLookup } from "./registry.ts";
import type { AnyCapabilitySpec } from "./contract.ts";
import { unknownMethodMessage } from "./renamed.ts";

/**
 * The bridge protocol: what a page sends over the port and what it gets back.
 * Version 1. spec R3.9, R4.28, R5.38
 */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export interface BridgeRequest {
  readonly v: 1;
  readonly id: string;
  readonly method: string;
  readonly params: JsonValue;
  readonly pageRevision: string;
  /**
   * The folder inside the session's folder the document scoped its calls to;
   * absent when it set none. Only contributed capabilities receive it. spec R5.81–R5.86
   */
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

/** What the shell receives from `POST /bridge`. */
export type BridgeTransport =
  | { readonly response: BridgeResponse; readonly navigate?: NavigationDirective }
  | {
      readonly confirm: {
        readonly requestId: string;
        readonly summary: string;
        readonly challenge: string;
        /** A grant asked once per pair rather than a confirmation of this call. spec R5.64 */
        readonly kind?: "grant";
        readonly grant?: { readonly sessionId: string; readonly title: string };
      };
    }
  | {
      /** Confirmed by the shell's recording bar: record with these, validated, parameters. spec R5.68 */
      readonly record: { readonly requestId: string; readonly params: JsonValue };
    };

/** A host-validated destination the trusted shell navigates to. spec R5.29–R5.34 */
export type NavigationDirective =
  | { readonly kind: "page"; readonly url: string }
  | { readonly kind: "host"; readonly url: string }
  | { readonly kind: "external"; readonly url: string };

/**
 * The envelope is checked against the largest bound any capability may
 * declare; the method's own bound is applied once it is known. spec R5.47
 */
export function decodeBridgeRequest(input: unknown): BridgeRequest {
  const checked = validateJson(input, { maxBytes: LIMITS.contributedPayloadMaxBytes + 1024 });
  if (!checked.ok) {
    const tooLarge = checked.issues.some((issue) => issue.code === "too_large");
    throw new PageError(tooLarge ? "request_too_large" : "invalid_request", tooLarge ? "Bridge request is too large" : "Bridge request is not strict JSON");
  }
  const value = checked.value;
  if (!isJsonObject(value)) throw new PageError("invalid_request", "Bridge request must be an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "id,method,pageRevision,params,v" && keys !== "id,method,pageRevision,params,scope,v") throw new PageError("invalid_request", "Bridge request has the wrong shape");
  if (value.v !== BRIDGE_PROTOCOL_VERSION) throw new PageError("unsupported_version", "Unsupported bridge protocol version");
  if (!isRequestId(value.id)) throw new PageError("invalid_request", "Invalid request id");
  if (!isMethodName(value.method)) throw new PageError("invalid_request", "Invalid method name");
  if (!isRevision(value.pageRevision)) throw new PageError("invalid_request", "Invalid page revision");
  // A scope that could name anything outside the session's folder is refused before anything else. spec R5.83
  if ("scope" in value && !isCanonicalScope(value.scope)) throw new PageError("invalid_params", "Invalid scope: a folder inside the session's folder, relative, without .. or empty segments");
  const base = { v: 1 as const, id: value.id, method: value.method, params: value.params as JsonValue, pageRevision: value.pageRevision };
  return "scope" in value ? { ...base, scope: value.scope as string } : base;
}

export function safeRequestId(value: unknown): string {
  return isRequestId(value) ? value : "invalid";
}

export function failure(id: unknown, code: BridgeErrorCode, message: string, extra?: { reason?: string; detail?: JsonValue }): BridgeFailure {
  const error = { code, message: boundedMessage(message), ...(extra?.reason ? { reason: extra.reason, ...(extra.detail !== undefined ? { detail: extra.detail } : {}) } : {}) };
  return { v: 1, id: safeRequestId(id), ok: false, error };
}

export function failureFromError(id: unknown, error: unknown): BridgeFailure {
  if (PageError.is(error) && isBridgeErrorCode(error.code)) return failure(id, error.code, error.message);
  return failure(id, "handler_error", "Could not execute the page action.");
}

export interface ResolvedInvocation<Params = unknown> {
  readonly request: BridgeRequest;
  readonly spec: AnyCapabilitySpec;
  readonly params: Params;
}

/**
 * Looks a request up in the registry and validates its parameters. Stale
 * revisions are refused before the method is even looked at. spec R2.13
 */
export function resolveInvocation(request: BridgeRequest, registry: CapabilityLookup, currentRevision: string): ResolvedInvocation {
  if (request.pageRevision !== currentRevision) throw new PageError("stale_page", "This page changed; reload it before responding.");
  const spec = registry.get(request.method);
  if (!spec || !spec.implemented) throw new PageError("unknown_method", unknownMethodMessage(request.method));
  const bound = spec.maxRequestBytes ?? LIMITS.capabilityPayloadBytes;
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > bound) {
    throw new PageError("request_too_large", `Request for ${spec.method} is larger than ${bound} bytes`);
  }
  const params = spec.validateParams(request.params);
  if (!params.ok) {
    const first = params.issues[0];
    throw new PageError("invalid_params", `Invalid parameters for ${spec.method}${first ? ` at ${first.path}: ${first.message}` : ""}`);
  }
  return { request, spec, params: params.value };
}

/** Projects a handler result through the spec's validator into a response. spec R5.3 */
export function completeInvocation(invocation: ResolvedInvocation, result: unknown): BridgeResponse {
  const projected = invocation.spec.validateResult(result);
  if (!projected.ok) return failure(invocation.request.id, "invalid_result", `Invalid result for ${invocation.spec.method}`);
  const json = validateJson(projected.value, { maxBytes: invocation.spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes });
  if (!json.ok && json.issues.some((issue) => issue.code === "too_large")) {
    return failure(invocation.request.id, "response_too_large", "Bridge response is too large");
  }
  if (!json.ok) return failure(invocation.request.id, "invalid_result", `Result for ${invocation.spec.method} is not strict JSON`);
  const response: BridgeSuccess = { v: 1, id: invocation.request.id, ok: true, result: json.value };
  if (Buffer.byteLength(JSON.stringify(response), "utf8") > (invocation.spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes)) {
    return failure(invocation.request.id, "response_too_large", "Bridge response is too large");
  }
  return response;
}
