import { boundedMessage, isBridgeErrorCode, PageError, type BridgeErrorCode } from "../errors.ts";
import { isMethodName, isRequestId, isRevision } from "../ids.ts";
import { isJsonObject, validateJson, type JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import type { CapabilityRegistry } from "./registry.ts";
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
  readonly error: { readonly code: BridgeErrorCode; readonly message: string };
}

export type BridgeResponse = BridgeSuccess | BridgeFailure;

/** What the shell receives from `POST /bridge`. */
export type BridgeTransport =
  | { readonly response: BridgeResponse; readonly navigate?: NavigationDirective }
  | { readonly confirm: { readonly requestId: string; readonly summary: string; readonly challenge: string } };

/** A host-validated destination the trusted shell navigates to. spec R5.29–R5.34 */
export type NavigationDirective =
  | { readonly kind: "page"; readonly url: string }
  | { readonly kind: "host"; readonly url: string }
  | { readonly kind: "external"; readonly url: string };

export function decodeBridgeRequest(input: unknown): BridgeRequest {
  const checked = validateJson(input);
  if (!checked.ok) {
    const tooLarge = checked.issues.some((issue) => issue.code === "too_large");
    throw new PageError(tooLarge ? "request_too_large" : "invalid_request", tooLarge ? "Bridge request is too large" : "Bridge request is not strict JSON");
  }
  const value = checked.value;
  if (!isJsonObject(value)) throw new PageError("invalid_request", "Bridge request must be an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "id,method,pageRevision,params,v") throw new PageError("invalid_request", "Bridge request has the wrong shape");
  if (value.v !== BRIDGE_PROTOCOL_VERSION) throw new PageError("unsupported_version", "Unsupported bridge protocol version");
  if (!isRequestId(value.id)) throw new PageError("invalid_request", "Invalid request id");
  if (!isMethodName(value.method)) throw new PageError("invalid_request", "Invalid method name");
  if (!isRevision(value.pageRevision)) throw new PageError("invalid_request", "Invalid page revision");
  return { v: 1, id: value.id, method: value.method, params: value.params as JsonValue, pageRevision: value.pageRevision };
}

export function safeRequestId(value: unknown): string {
  return isRequestId(value) ? value : "invalid";
}

export function failure(id: unknown, code: BridgeErrorCode, message: string): BridgeFailure {
  return { v: 1, id: safeRequestId(id), ok: false, error: { code, message: boundedMessage(message) } };
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
export function resolveInvocation(request: BridgeRequest, registry: CapabilityRegistry, currentRevision: string): ResolvedInvocation {
  if (request.pageRevision !== currentRevision) throw new PageError("stale_page", "This page changed; reload it before responding.");
  const spec = registry.get(request.method);
  if (!spec || !spec.implemented) throw new PageError("unknown_method", unknownMethodMessage(request.method));
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
  const json = validateJson(projected.value);
  if (!json.ok) return failure(invocation.request.id, "invalid_result", `Result for ${invocation.spec.method} is not strict JSON`);
  const response: BridgeSuccess = { v: 1, id: invocation.request.id, ok: true, result: json.value };
  if (Buffer.byteLength(JSON.stringify(response), "utf8") > LIMITS.capabilityPayloadBytes) {
    return failure(invocation.request.id, "response_too_large", "Bridge response is too large");
  }
  return response;
}
