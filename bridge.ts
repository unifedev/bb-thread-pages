/**
 * Pure transport and capability contract for an untrusted Thread Page.
 *
 * This module deliberately has no bb SDK, DOM, fetch, or filesystem imports.
 * A trusted outer shell may map these narrow methods onto bb APIs, but page
 * code can only speak this protocol and cannot name an SDK method, URL, host,
 * or filesystem path.
 */

export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_MAX_ID_LENGTH = 96;
export const BRIDGE_MAX_METHOD_LENGTH = 96;
export const BRIDGE_MAX_PAGE_REVISION_LENGTH = 128;
export const BRIDGE_MAX_SERIALIZED_BYTES = 64 * 1024;
export const BRIDGE_MAX_JSON_DEPTH = 16;
export const BRIDGE_MAX_JSON_NODES = 10_000;
export const BRIDGE_MAX_CONFIRMATION_TTL_MS = 5 * 60_000;
export const BRIDGE_MAX_STORAGE_VALUE_BYTES = 32 * 1024;

const MAX_ERROR_MESSAGE_LENGTH = 512;
const MAX_PROMPT_LENGTH = 32 * 1024;
const MAX_RESULT_TEXT_LENGTH = 64 * 1024;
const MAX_TITLE_LENGTH = 240;
const MAX_ITEMS = 200;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const METHOD_PATTERN =
  /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type BridgeValidationIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "missing_key"
  | "unknown_key"
  | "not_json_safe"
  | "too_deep"
  | "too_large";

export interface BridgeValidationIssue {
  readonly code: BridgeValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type BridgeValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly BridgeValidationIssue[] };

export const BRIDGE_ERROR_CODES = [
  "invalid_json",
  "request_too_large",
  "response_too_large",
  "invalid_request",
  "invalid_response",
  "unsupported_version",
  "unknown_method",
  "invalid_params",
  "stale_page",
  "confirmation_required",
  "confirmation_invalid",
  "not_found",
  "conflict",
  "unavailable",
  "cancelled",
  "rate_limited",
  "handler_error",
  "invalid_result",
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export interface BridgeError {
  readonly code: BridgeErrorCode;
  readonly message: string;
}

export type BridgeContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: BridgeError;
      readonly issues?: readonly BridgeValidationIssue[];
    };

export interface BridgeRequest {
  readonly v: 1;
  readonly id: string;
  readonly method: string;
  readonly params: JsonValue;
  readonly pageRevision: string;
}

export interface BridgeSuccessResponse {
  readonly v: 1;
  readonly id: string;
  readonly ok: true;
  readonly result: JsonValue;
}

export interface BridgeFailureResponse {
  readonly v: 1;
  readonly id: string;
  readonly ok: false;
  readonly error: BridgeError;
}

export type BridgeResponse = BridgeSuccessResponse | BridgeFailureResponse;

export type BridgeEffect =
  | "read"
  | "navigation"
  | "current-thread-write"
  | "cross-thread-write"
  | "destructive"
  | "device";

export type BridgeConfirmationRequirement = "none" | "trusted-outer";

export type BridgeValidator<T> = (
  value: unknown,
) => BridgeValidationResult<T>;

export interface CapabilityMetadata<Params = unknown> {
  readonly method: string;
  readonly description: string;
  readonly effect: BridgeEffect;
  readonly confirmation: BridgeConfirmationRequirement;
  /** Text is only a hint for trusted chrome; it never grants authority. */
  readonly summarize?: (params: Params) => string;
}

export interface CapabilitySpec<Params = unknown, Result = unknown>
  extends CapabilityMetadata<Params> {
  readonly validateParams: BridgeValidator<Params>;
  readonly validateResult: BridgeValidator<Result>;
}

type AnyCapabilitySpec = CapabilitySpec<any, any>;

export interface CapabilityRegistry {
  get(method: string): AnyCapabilitySpec | undefined;
  list(): readonly AnyCapabilitySpec[];
}

export interface CapabilityDescriptor {
  readonly method: string;
  readonly effect: BridgeEffect;
  readonly confirmation: BridgeConfirmationRequirement;
}

function valid<T>(value: T): BridgeValidationResult<T> {
  return { ok: true, value };
}

function invalid<T>(
  path: string,
  message: string,
  code: BridgeValidationIssueCode = "invalid_value",
): BridgeValidationResult<T> {
  return { ok: false, issues: [{ code, path, message }] };
}

function contractFailure<T>(
  code: BridgeErrorCode,
  message: string,
  issues?: readonly BridgeValidationIssue[],
): BridgeContractResult<T> {
  return {
    ok: false,
    error: { code, message: boundedErrorMessage(message) },
    ...(issues ? { issues } : {}),
  };
}

function boundedErrorMessage(message: string): string {
  const normalized = message.trim() || "Bridge request failed";
  return normalized.length <= MAX_ERROR_MESSAGE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function pathForKey(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

export interface JsonValidationLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

/** Validate without JSON.stringify coercion or silent property loss. */
export function validateJsonValue(
  input: unknown,
  limits: JsonValidationLimits = {},
): BridgeValidationResult<JsonValue> {
  const maxBytes = limits.maxBytes ?? BRIDGE_MAX_SERIALIZED_BYTES;
  const maxDepth = limits.maxDepth ?? BRIDGE_MAX_JSON_DEPTH;
  const maxNodes = limits.maxNodes ?? BRIDGE_MAX_JSON_NODES;
  const ancestors = new Set<object>();
  let nodes = 0;

  function visit(value: unknown, path: string, depth: number): BridgeValidationIssue | null {
    nodes += 1;
    if (nodes > maxNodes) {
      return {
        code: "too_large",
        path,
        message: `JSON value exceeds ${maxNodes} nodes`,
      };
    }
    if (depth > maxDepth) {
      return {
        code: "too_deep",
        path,
        message: `JSON value exceeds depth ${maxDepth}`,
      };
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value)
        ? null
        : {
            code: "not_json_safe",
            path,
            message: "JSON numbers must be finite",
          };
    }
    if (typeof value !== "object") {
      return {
        code: "not_json_safe",
        path,
        message: `Unsupported JSON value type: ${typeof value}`,
      };
    }
    if (ancestors.has(value)) {
      return {
        code: "not_json_safe",
        path,
        message: "Cyclic values are not JSON-safe",
      };
    }

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const keys = Reflect.ownKeys(value);
        for (const key of keys) {
          if (typeof key === "symbol") {
            return {
              code: "not_json_safe",
              path,
              message: "Symbol properties are not JSON-safe",
            };
          }
          if (key !== "length" && !isCanonicalArrayIndex(key, value.length)) {
            return {
              code: "not_json_safe",
              path: pathForKey(path, key),
              message: "Arrays may not have extra properties",
            };
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(value, index)) {
            return {
              code: "not_json_safe",
              path: `${path}[${index}]`,
              message: "Sparse arrays are not JSON-safe",
            };
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            return {
              code: "not_json_safe",
              path: `${path}[${index}]`,
              message: "Array entries must be enumerable data properties",
            };
          }
          const issue = visit(descriptor.value, `${path}[${index}]`, depth + 1);
          if (issue) return issue;
        }
        return null;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return {
          code: "not_json_safe",
          path,
          message: "Only plain objects are JSON-safe",
        };
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") {
          return {
            code: "not_json_safe",
            path,
            message: "Symbol properties are not JSON-safe",
          };
        }
        if (UNSAFE_OBJECT_KEYS.has(key)) {
          return {
            code: "not_json_safe",
            path: pathForKey(path, key),
            message: "Unsafe object key",
          };
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return {
            code: "not_json_safe",
            path: pathForKey(path, key),
            message: "Object entries must be enumerable data properties",
          };
        }
        const issue = visit(descriptor.value, pathForKey(path, key), depth + 1);
        if (issue) return issue;
      }
      return null;
    } catch {
      return {
        code: "not_json_safe",
        path,
        message: "Value could not be safely inspected",
      };
    } finally {
      ancestors.delete(value);
    }
  }

  const issue = visit(input, "$", 0);
  if (issue) return { ok: false, issues: [issue] };

  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return invalid("$", "Value could not be serialized as JSON", "not_json_safe");
  }
  if (utf8Bytes(serialized) > maxBytes) {
    return invalid(
      "$",
      `Serialized JSON exceeds ${maxBytes} bytes`,
      "too_large",
    );
  }

  // Round-trip to detach callers from objects that may be mutated after check.
  return valid(JSON.parse(serialized) as JsonValue);
}

function decodeJsonInput(
  input: unknown,
  sizeCode: "request_too_large" | "response_too_large",
): BridgeContractResult<JsonValue> {
  let parsed = input;
  if (typeof input === "string") {
    if (utf8Bytes(input) > BRIDGE_MAX_SERIALIZED_BYTES) {
      return contractFailure(sizeCode, "Bridge message is too large");
    }
    try {
      parsed = JSON.parse(input);
    } catch {
      return contractFailure("invalid_json", "Bridge message is not valid JSON");
    }
  }
  const json = validateJsonValue(parsed);
  if (!json.ok) {
    const tooLarge = json.issues.some((entry) => entry.code === "too_large");
    return contractFailure(
      tooLarge ? sizeCode : sizeCode === "request_too_large" ? "invalid_request" : "invalid_response",
      tooLarge ? "Bridge message is too large" : "Bridge message is not strict JSON",
      json.issues,
    );
  }
  return { ok: true, value: json.value };
}

function asObject(
  value: JsonValue,
  allowed: readonly string[],
  required: readonly string[],
  path = "$",
): BridgeValidationResult<JsonObject> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return invalid(path, "Expected an object", "invalid_type");
  }
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      return invalid(pathForKey(path, key), "Unknown key", "unknown_key");
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return invalid(pathForKey(path, key), "Missing required key", "missing_key");
    }
  }
  return valid(value);
}

function stringValue(
  value: JsonValue,
  path: string,
  options: {
    min?: number;
    max: number;
    pattern?: RegExp;
    label?: string;
  },
): BridgeValidationResult<string> {
  if (typeof value !== "string") {
    return invalid(path, "Expected a string", "invalid_type");
  }
  const min = options.min ?? 0;
  if (value.length < min || value.length > options.max) {
    return invalid(
      path,
      `${options.label ?? "String"} length must be ${min}–${options.max}`,
      "too_large",
    );
  }
  if (options.pattern && !options.pattern.test(value)) {
    return invalid(path, `${options.label ?? "String"} has an invalid format`);
  }
  return valid(value);
}

function booleanValue(value: JsonValue, path: string): BridgeValidationResult<boolean> {
  return typeof value === "boolean"
    ? valid(value)
    : invalid(path, "Expected a boolean", "invalid_type");
}

function integerValue(
  value: JsonValue,
  path: string,
  min: number,
  max: number,
): BridgeValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    return invalid(path, `Expected an integer from ${min} to ${max}`);
  }
  return valid(value);
}

function enumValue<const T extends readonly string[]>(
  value: JsonValue,
  path: string,
  values: T,
): BridgeValidationResult<T[number]> {
  return typeof value === "string" && values.includes(value)
    ? valid(value as T[number])
    : invalid(path, `Expected one of: ${values.join(", ")}`);
}

function entityId(value: JsonValue, path: string): BridgeValidationResult<string> {
  return stringValue(value, path, {
    min: 1,
    max: 128,
    pattern: ENTITY_ID_PATTERN,
    label: "Entity id",
  });
}

function nullableEntityId(
  value: JsonValue,
  path: string,
): BridgeValidationResult<string | null> {
  return value === null ? valid(null) : entityId(value, path);
}

function opaqueToken(
  value: JsonValue,
  path: string,
  max = 512,
): BridgeValidationResult<string> {
  return stringValue(value, path, {
    min: 1,
    max,
    pattern: OPAQUE_TOKEN_PATTERN,
    label: "Opaque token",
  });
}

function jsonValidator<T>(
  parser: (value: JsonValue) => BridgeValidationResult<T>,
): BridgeValidator<T> {
  return (input) => {
    const json = validateJsonValue(input);
    return json.ok ? parser(json.value) : json;
  };
}

function noParams(value: JsonValue): BridgeValidationResult<null> {
  if (value === null) return valid(null);
  const object = asObject(value, [], []);
  return object.ok ? valid(null) : object;
}

export function decodeBridgeRequest(input: unknown): BridgeContractResult<BridgeRequest> {
  const decoded = decodeJsonInput(input, "request_too_large");
  if (!decoded.ok) return decoded;
  const object = asObject(
    decoded.value,
    ["v", "id", "method", "params", "pageRevision"],
    ["v", "id", "method", "params", "pageRevision"],
  );
  if (!object.ok) {
    return contractFailure("invalid_request", "Invalid bridge request envelope", object.issues);
  }
  const value = object.value;
  if (value.v !== BRIDGE_PROTOCOL_VERSION) {
    return contractFailure("unsupported_version", "Unsupported bridge protocol version");
  }
  const id = stringValue(value.id, "$.id", {
    min: 1,
    max: BRIDGE_MAX_ID_LENGTH,
    pattern: ID_PATTERN,
    label: "Request id",
  });
  if (!id.ok) return contractFailure("invalid_request", "Invalid request id", id.issues);
  const method = stringValue(value.method, "$.method", {
    min: 3,
    max: BRIDGE_MAX_METHOD_LENGTH,
    pattern: METHOD_PATTERN,
    label: "Method name",
  });
  if (!method.ok) {
    return contractFailure("invalid_request", "Invalid method name", method.issues);
  }
  const revision = stringValue(value.pageRevision, "$.pageRevision", {
    min: 1,
    max: BRIDGE_MAX_PAGE_REVISION_LENGTH,
    pattern: ID_PATTERN,
    label: "Page revision",
  });
  if (!revision.ok) {
    return contractFailure("invalid_request", "Invalid page revision", revision.issues);
  }
  return {
    ok: true,
    value: {
      v: 1,
      id: id.value,
      method: method.value,
      params: value.params!,
      pageRevision: revision.value,
    },
  };
}

function isBridgeErrorCode(value: JsonValue): value is BridgeErrorCode {
  return typeof value === "string" &&
    (BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}

export function decodeBridgeResponse(input: unknown): BridgeContractResult<BridgeResponse> {
  const decoded = decodeJsonInput(input, "response_too_large");
  if (!decoded.ok) return decoded;
  if (decoded.value === null || Array.isArray(decoded.value) || typeof decoded.value !== "object") {
    return contractFailure("invalid_response", "Invalid bridge response envelope");
  }
  const okValue = decoded.value.ok;
  if (typeof okValue !== "boolean") {
    return contractFailure("invalid_response", "Response ok flag must be boolean");
  }
  const expected = okValue
    ? asObject(decoded.value, ["v", "id", "ok", "result"], ["v", "id", "ok", "result"])
    : asObject(decoded.value, ["v", "id", "ok", "error"], ["v", "id", "ok", "error"]);
  if (!expected.ok) {
    return contractFailure("invalid_response", "Invalid bridge response envelope", expected.issues);
  }
  if (expected.value.v !== 1) {
    return contractFailure("unsupported_version", "Unsupported bridge protocol version");
  }
  const id = stringValue(expected.value.id, "$.id", {
    min: 1,
    max: BRIDGE_MAX_ID_LENGTH,
    pattern: ID_PATTERN,
    label: "Response id",
  });
  if (!id.ok) return contractFailure("invalid_response", "Invalid response id", id.issues);

  if (okValue) {
    return {
      ok: true,
      value: { v: 1, id: id.value, ok: true, result: expected.value.result! },
    };
  }

  const errorObject = asObject(expected.value.error!, ["code", "message"], ["code", "message"], "$.error");
  if (!errorObject.ok) {
    return contractFailure("invalid_response", "Invalid bridge error", errorObject.issues);
  }
  if (!isBridgeErrorCode(errorObject.value.code!)) {
    return contractFailure("invalid_response", "Unknown bridge error code");
  }
  const message = stringValue(errorObject.value.message!, "$.error.message", {
    min: 1,
    max: MAX_ERROR_MESSAGE_LENGTH,
    label: "Error message",
  });
  if (!message.ok) {
    return contractFailure("invalid_response", "Invalid bridge error message", message.issues);
  }
  return {
    ok: true,
    value: {
      v: 1,
      id: id.value,
      ok: false,
      error: { code: errorObject.value.code, message: message.value },
    },
  };
}

function safeResponseId(id: unknown): string {
  return typeof id === "string" &&
    id.length >= 1 &&
    id.length <= BRIDGE_MAX_ID_LENGTH &&
    ID_PATTERN.test(id)
    ? id
    : "invalid";
}

export function makeBridgeFailureResponse(
  id: unknown,
  code: BridgeErrorCode,
  message: string,
): BridgeFailureResponse {
  return {
    v: 1,
    id: safeResponseId(id),
    ok: false,
    error: { code, message: boundedErrorMessage(message) },
  };
}

export function encodeBridgeResponse(
  response: BridgeResponse,
): BridgeContractResult<string> {
  const decoded = decodeBridgeResponse(response);
  if (!decoded.ok) return decoded;
  const serialized = JSON.stringify(decoded.value);
  if (utf8Bytes(serialized) > BRIDGE_MAX_SERIALIZED_BYTES) {
    return contractFailure("response_too_large", "Bridge response is too large");
  }
  return { ok: true, value: serialized };
}

const EFFECTS: readonly BridgeEffect[] = [
  "read",
  "navigation",
  "current-thread-write",
  "cross-thread-write",
  "destructive",
  "device",
];

const EFFECTS_REQUIRING_CONFIRMATION = new Set<BridgeEffect>([
  "cross-thread-write",
  "destructive",
  "device",
]);

export function createCapabilityRegistry(
  specifications: readonly AnyCapabilitySpec[],
): CapabilityRegistry {
  const byMethod = new Map<string, AnyCapabilitySpec>();
  const list: AnyCapabilitySpec[] = [];
  for (const original of specifications) {
    if (
      original.method.length < 3 ||
      original.method.length > BRIDGE_MAX_METHOD_LENGTH ||
      !METHOD_PATTERN.test(original.method)
    ) {
      throw new TypeError(`Invalid bridge capability method: ${original.method}`);
    }
    if (byMethod.has(original.method)) {
      throw new TypeError(`Duplicate bridge capability method: ${original.method}`);
    }
    if (!EFFECTS.includes(original.effect)) {
      throw new TypeError(`Invalid effect for ${original.method}`);
    }
    if (
      original.confirmation !== "none" &&
      original.confirmation !== "trusted-outer"
    ) {
      throw new TypeError(`Invalid confirmation policy for ${original.method}`);
    }
    if (
      EFFECTS_REQUIRING_CONFIRMATION.has(original.effect) &&
      original.confirmation !== "trusted-outer"
    ) {
      throw new TypeError(
        `${original.method} must require trusted outer confirmation`,
      );
    }
    if (
      original.method === "projects.create" &&
      original.confirmation !== "trusted-outer"
    ) {
      throw new TypeError(
        "projects.create must require trusted outer confirmation",
      );
    }
    if (
      typeof original.description !== "string" ||
      original.description.trim().length === 0 ||
      original.description.length > 240
    ) {
      throw new TypeError(`Invalid description for ${original.method}`);
    }
    if (
      typeof original.validateParams !== "function" ||
      typeof original.validateResult !== "function" ||
      (original.summarize !== undefined && typeof original.summarize !== "function")
    ) {
      throw new TypeError(`Invalid validators for ${original.method}`);
    }
    const specification = Object.freeze({ ...original });
    byMethod.set(specification.method, specification);
    list.push(specification);
  }
  const frozenList = Object.freeze(list.slice());
  return Object.freeze({
    get(method: string) {
      return byMethod.get(method);
    },
    list() {
      return frozenList;
    },
  });
}

const VALIDATED_INVOCATION = Symbol("validated-thread-page-invocation");

export interface ValidatedBridgeInvocation {
  readonly request: BridgeRequest;
  readonly capability: AnyCapabilitySpec;
  readonly params: unknown;
  readonly [VALIDATED_INVOCATION]: true;
}

export function resolveBridgeInvocation(
  input: unknown,
  registry: CapabilityRegistry = strictParityCapabilityRegistry,
  expectedPageRevision?: string,
): BridgeContractResult<ValidatedBridgeInvocation> {
  const decoded = decodeBridgeRequest(input);
  if (!decoded.ok) return decoded;
  if (
    expectedPageRevision !== undefined &&
    decoded.value.pageRevision !== expectedPageRevision
  ) {
    return contractFailure("stale_page", "The Thread Page revision has changed");
  }
  const capability = registry.get(decoded.value.method);
  if (!capability) {
    return contractFailure("unknown_method", "Unknown Thread Page capability");
  }
  const params = capability.validateParams(decoded.value.params);
  if (!params.ok) {
    return contractFailure(
      "invalid_params",
      `Invalid parameters for ${capability.method}`,
      params.issues,
    );
  }
  const normalizedParams = validateJsonValue(params.value);
  if (!normalizedParams.ok) {
    return contractFailure(
      "invalid_params",
      `Parameter validator for ${capability.method} produced non-JSON data`,
      normalizedParams.issues,
    );
  }
  const invocation = {
    request: decoded.value,
    capability,
    params: normalizedParams.value,
  } as Omit<ValidatedBridgeInvocation, typeof VALIDATED_INVOCATION> & {
    [VALIDATED_INVOCATION]?: true;
  };
  Object.defineProperty(invocation, VALIDATED_INVOCATION, {
    enumerable: false,
    value: true,
  });
  return { ok: true, value: Object.freeze(invocation) as ValidatedBridgeInvocation };
}

const TRUSTED_CONFIRMATION = Symbol("trusted-outer-confirmation");
const CONFIRMED_REQUEST = Symbol("confirmed-request-fingerprint");

export interface TrustedOuterConfirmation {
  readonly source: "trusted-outer";
  readonly requestId: string;
  readonly method: string;
  readonly pageRevision: string;
  readonly confirmedAtMs: number;
  readonly expiresAtMs: number;
  readonly humanSummary: string;
  readonly [TRUSTED_CONFIRMATION]: true;
  readonly [CONFIRMED_REQUEST]: string;
}

export interface TrustedOuterConfirmationOptions {
  readonly confirmedAtMs: number;
  readonly expiresAtMs: number;
  /** Trusted chrome may replace the capability's generic summary. */
  readonly humanSummary?: string;
}

function invocationFingerprint(invocation: ValidatedBridgeInvocation): string {
  return JSON.stringify({
    id: invocation.request.id,
    method: invocation.request.method,
    params: invocation.request.params,
    pageRevision: invocation.request.pageRevision,
  });
}

export function createTrustedOuterConfirmation(
  invocation: ValidatedBridgeInvocation,
  options: TrustedOuterConfirmationOptions,
): TrustedOuterConfirmation {
  if (invocation[VALIDATED_INVOCATION] !== true) {
    throw new TypeError("Confirmation requires a validated bridge invocation");
  }
  if (
    !Number.isSafeInteger(options.confirmedAtMs) ||
    !Number.isSafeInteger(options.expiresAtMs) ||
    options.confirmedAtMs < 0 ||
    options.expiresAtMs <= options.confirmedAtMs ||
    options.expiresAtMs - options.confirmedAtMs > BRIDGE_MAX_CONFIRMATION_TTL_MS
  ) {
    throw new TypeError("Invalid trusted confirmation lifetime");
  }
  const generated = invocation.capability.summarize?.(invocation.params) ??
    invocation.capability.description;
  const summary = options.humanSummary ?? generated;
  if (typeof summary !== "string" || summary.trim().length === 0 || summary.length > 512) {
    throw new TypeError("Invalid trusted confirmation summary");
  }
  const confirmation = {
    source: "trusted-outer" as const,
    requestId: invocation.request.id,
    method: invocation.request.method,
    pageRevision: invocation.request.pageRevision,
    confirmedAtMs: options.confirmedAtMs,
    expiresAtMs: options.expiresAtMs,
    humanSummary: summary,
  } as Omit<TrustedOuterConfirmation, typeof TRUSTED_CONFIRMATION | typeof CONFIRMED_REQUEST> &
    Partial<Pick<TrustedOuterConfirmation, typeof TRUSTED_CONFIRMATION | typeof CONFIRMED_REQUEST>>;
  Object.defineProperties(confirmation, {
    [TRUSTED_CONFIRMATION]: { enumerable: false, value: true },
    [CONFIRMED_REQUEST]: {
      enumerable: false,
      value: invocationFingerprint(invocation),
    },
  });
  return Object.freeze(confirmation) as TrustedOuterConfirmation;
}

export function authorizeBridgeInvocation(
  invocation: ValidatedBridgeInvocation,
  confirmation: unknown,
  nowMs: number,
): BridgeContractResult<ValidatedBridgeInvocation> {
  if (invocation.capability.confirmation === "none") {
    return { ok: true, value: invocation };
  }
  if (
    typeof confirmation !== "object" ||
    confirmation === null ||
    (confirmation as Partial<TrustedOuterConfirmation>)[TRUSTED_CONFIRMATION] !== true
  ) {
    return contractFailure(
      "confirmation_required",
      "This action requires confirmation in trusted Thread Page chrome",
    );
  }
  const trusted = confirmation as TrustedOuterConfirmation;
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < trusted.confirmedAtMs ||
    nowMs >= trusted.expiresAtMs ||
    trusted.requestId !== invocation.request.id ||
    trusted.method !== invocation.request.method ||
    trusted.pageRevision !== invocation.request.pageRevision ||
    trusted[CONFIRMED_REQUEST] !== invocationFingerprint(invocation)
  ) {
    return contractFailure(
      "confirmation_invalid",
      "Trusted confirmation is expired or does not match this request",
    );
  }
  return { ok: true, value: invocation };
}

export function completeBridgeInvocation(
  invocation: ValidatedBridgeInvocation,
  result: unknown,
): BridgeResponse {
  const validated = invocation.capability.validateResult(result);
  if (!validated.ok) {
    return makeBridgeFailureResponse(
      invocation.request.id,
      "invalid_result",
      `Invalid result for ${invocation.capability.method}`,
    );
  }
  const json = validateJsonValue(validated.value);
  if (!json.ok) {
    return makeBridgeFailureResponse(
      invocation.request.id,
      "invalid_result",
      `Result validator for ${invocation.capability.method} produced non-JSON data`,
    );
  }
  const response: BridgeSuccessResponse = {
    v: 1,
    id: invocation.request.id,
    ok: true,
    result: json.value,
  };
  const encoded = encodeBridgeResponse(response);
  return encoded.ok
    ? response
    : makeBridgeFailureResponse(
        invocation.request.id,
        "response_too_large",
        "Bridge response is too large",
      );
}

export interface ContextGetResult {
  readonly protocolVersion: 1;
  readonly thread: {
    readonly id: string;
    readonly title: string;
    readonly projectId: string | null;
  };
  readonly page: { readonly revision: string; readonly readOnly: boolean };
  readonly capabilities: readonly CapabilityDescriptor[];
}

export interface ThreadActivityParams {
  readonly limit: number;
}

export type ThreadActivityState =
  | "working"
  | "idle"
  | "waiting"
  | "failed"
  | "stopped";

export interface ThreadActivityItem {
  readonly kind: string;
  readonly done: boolean;
  readonly atMs: number;
  readonly label: string;
  readonly text: string;
}

export interface ThreadActivityResult {
  readonly state: ThreadActivityState;
  readonly updatedAtMs: number;
  readonly items: readonly ThreadActivityItem[];
}

export interface ThreadsSnapshotParams {
  readonly projectId: string | null;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly cursor: string | null;
}

export type ThreadSnapshotStatus =
  | "idle"
  | "active"
  | "waiting"
  | "failed"
  | "stopped";

export interface ThreadSnapshotItem {
  readonly id: string;
  readonly title: string;
  readonly projectId: string | null;
  readonly parentThreadId: string | null;
  readonly status: ThreadSnapshotStatus;
  readonly archived: boolean;
  readonly page: { readonly available: boolean; readonly revision: string | null };
  readonly updatedAtMs: number;
}

export interface ThreadsSnapshotResult {
  readonly threads: readonly ThreadSnapshotItem[];
  readonly nextCursor: string | null;
  readonly generatedAtMs: number;
}

export interface ThreadReplyParams {
  readonly result: JsonValue;
  readonly mode: "queue" | "steer";
  readonly title?: string;
  readonly idempotencyKey?: string;
}

export interface ThreadDeliveryResult {
  readonly delivery: "started" | "queued" | "steered";
  readonly duplicate: boolean;
}

export interface ThreadsContinueParams {
  readonly threadId: string;
  readonly prompt: string;
  readonly mode: "queue" | "steer";
}

export interface ThreadsContinueResult extends ThreadDeliveryResult {
  readonly threadId: string;
}

export interface ThreadsSpawnParams {
  readonly projectId: string;
  readonly prompt: string;
  readonly title?: string;
  readonly providerId?: string;
  readonly model?: string;
  readonly reasoningLevel?: string;
}

export interface ThreadTargetParams { readonly threadId: string }
export interface OpenResult { readonly opened: boolean }
export interface ArchiveResult { readonly archived: boolean }
export interface StopResult { readonly stopped: boolean }

export interface NavigationOpenExternalParams {
  readonly url: string;
  /** Presentation hint only; trusted chrome derives authority from `url`. */
  readonly label?: string;
}

export interface ProjectChoice {
  readonly id: string;
  readonly name: string;
  readonly kind: "standard" | "personal";
}

export interface ProjectsBrowseParams {
  readonly startProjectId: string | null;
}

export interface ProjectsBrowseResult {
  readonly selection: null | {
    readonly token: string;
    readonly displayPath: string;
    readonly hostName: string;
  };
}

export interface ProjectsCreateParams {
  readonly selectionToken: string;
  readonly name?: string;
}

export interface ProviderChoice {
  readonly id: string;
  readonly displayName: string;
  readonly available: boolean;
  readonly models: readonly {
    readonly id: string;
    readonly displayName: string;
  }[];
}

function title(value: JsonValue, path: string): BridgeValidationResult<string> {
  return stringValue(value, path, { max: MAX_TITLE_LENGTH, label: "Title" });
}

function prompt(value: JsonValue, path: string): BridgeValidationResult<string> {
  return stringValue(value, path, {
    min: 1,
    max: MAX_PROMPT_LENGTH,
    label: "Prompt",
  });
}

function timestamp(value: JsonValue, path: string): BridgeValidationResult<number> {
  return integerValue(value, path, 0, Number.MAX_SAFE_INTEGER);
}

function parseCapabilityDescriptor(
  value: JsonValue,
  path: string,
): BridgeValidationResult<CapabilityDescriptor> {
  const object = asObject(value, ["method", "effect", "confirmation"], ["method", "effect", "confirmation"], path);
  if (!object.ok) return object;
  const method = stringValue(object.value.method!, `${path}.method`, {
    min: 3,
    max: BRIDGE_MAX_METHOD_LENGTH,
    pattern: METHOD_PATTERN,
    label: "Method name",
  });
  if (!method.ok) return method;
  const effect = enumValue(object.value.effect!, `${path}.effect`, EFFECTS);
  if (!effect.ok) return effect;
  const confirmation = enumValue(
    object.value.confirmation!,
    `${path}.confirmation`,
    ["none", "trusted-outer"] as const,
  );
  if (!confirmation.ok) return confirmation;
  return valid({ method: method.value, effect: effect.value, confirmation: confirmation.value });
}

function parseContextResult(value: JsonValue): BridgeValidationResult<ContextGetResult> {
  const root = asObject(value, ["protocolVersion", "thread", "page", "capabilities"], ["protocolVersion", "thread", "page", "capabilities"]);
  if (!root.ok) return root;
  if (root.value.protocolVersion !== 1) return invalid("$.protocolVersion", "Expected protocol version 1");
  const thread = asObject(root.value.thread!, ["id", "title", "projectId"], ["id", "title", "projectId"], "$.thread");
  if (!thread.ok) return thread;
  const threadId = entityId(thread.value.id!, "$.thread.id");
  if (!threadId.ok) return threadId;
  const threadTitle = title(thread.value.title!, "$.thread.title");
  if (!threadTitle.ok) return threadTitle;
  const projectId = nullableEntityId(thread.value.projectId!, "$.thread.projectId");
  if (!projectId.ok) return projectId;
  const page = asObject(root.value.page!, ["revision", "readOnly"], ["revision", "readOnly"], "$.page");
  if (!page.ok) return page;
  const revision = stringValue(page.value.revision!, "$.page.revision", {
    min: 1,
    max: BRIDGE_MAX_PAGE_REVISION_LENGTH,
    pattern: ID_PATTERN,
    label: "Page revision",
  });
  if (!revision.ok) return revision;
  const readOnly = booleanValue(page.value.readOnly!, "$.page.readOnly");
  if (!readOnly.ok) return readOnly;
  if (!Array.isArray(root.value.capabilities) || root.value.capabilities.length > 64) {
    return invalid("$.capabilities", "Expected at most 64 capabilities");
  }
  const capabilities: CapabilityDescriptor[] = [];
  for (let index = 0; index < root.value.capabilities.length; index += 1) {
    const item = parseCapabilityDescriptor(root.value.capabilities[index]!, `$.capabilities[${index}]`);
    if (!item.ok) return item;
    capabilities.push(item.value);
  }
  return valid({
    protocolVersion: 1,
    thread: { id: threadId.value, title: threadTitle.value, projectId: projectId.value },
    page: { revision: revision.value, readOnly: readOnly.value },
    capabilities,
  });
}

function parseActivityParams(value: JsonValue): BridgeValidationResult<ThreadActivityParams> {
  const object = asObject(value, ["limit"], []);
  if (!object.ok) return object;
  const limit = object.value.limit === undefined
    ? valid(8)
    : integerValue(object.value.limit, "$.limit", 1, 20);
  return limit.ok ? valid({ limit: limit.value }) : limit;
}

function parseActivityItem(
  value: JsonValue,
  path: string,
): BridgeValidationResult<ThreadActivityItem> {
  const object = asObject(
    value,
    ["kind", "done", "atMs", "label", "text"],
    ["kind", "done", "atMs", "label", "text"],
    path,
  );
  if (!object.ok) return object;
  const kind = stringValue(object.value.kind!, path + ".kind", {
    min: 1,
    max: 80,
    label: "Activity kind",
  });
  if (!kind.ok) return kind;
  const done = booleanValue(object.value.done!, path + ".done");
  if (!done.ok) return done;
  const atMs = timestamp(object.value.atMs!, path + ".atMs");
  if (!atMs.ok) return atMs;
  const label = stringValue(object.value.label!, path + ".label", {
    min: 1,
    max: 80,
    label: "Activity label",
  });
  if (!label.ok) return label;
  const text = stringValue(object.value.text!, path + ".text", {
    max: 200,
    label: "Activity text",
  });
  if (!text.ok) return text;
  return valid({
    kind: kind.value,
    done: done.value,
    atMs: atMs.value,
    label: label.value,
    text: text.value,
  });
}

function parseActivityResult(
  value: JsonValue,
): BridgeValidationResult<ThreadActivityResult> {
  const object = asObject(
    value,
    ["state", "updatedAtMs", "items"],
    ["state", "updatedAtMs", "items"],
  );
  if (!object.ok) return object;
  const state = enumValue(
    object.value.state!,
    "$.state",
    ["working", "idle", "waiting", "failed", "stopped"] as const,
  );
  if (!state.ok) return state;
  const updatedAtMs = timestamp(object.value.updatedAtMs!, "$.updatedAtMs");
  if (!updatedAtMs.ok) return updatedAtMs;
  if (!Array.isArray(object.value.items) || object.value.items.length > 20) {
    return invalid("$.items", "Expected at most 20 activity items");
  }
  const items: ThreadActivityItem[] = [];
  for (let index = 0; index < object.value.items.length; index += 1) {
    const item = parseActivityItem(
      object.value.items[index]!,
      "$.items[" + index + "]",
    );
    if (!item.ok) return item;
    items.push(item.value);
  }
  return valid({ state: state.value, updatedAtMs: updatedAtMs.value, items });
}

function parseSnapshotParams(value: JsonValue): BridgeValidationResult<ThreadsSnapshotParams> {
  const object = asObject(value, ["projectId", "includeArchived", "limit", "cursor"], []);
  if (!object.ok) return object;
  const projectId = object.value.projectId === undefined
    ? valid<string | null>(null)
    : nullableEntityId(object.value.projectId, "$.projectId");
  if (!projectId.ok) return projectId;
  const includeArchived = object.value.includeArchived === undefined
    ? valid(false)
    : booleanValue(object.value.includeArchived, "$.includeArchived");
  if (!includeArchived.ok) return includeArchived;
  const limit = object.value.limit === undefined
    ? valid(100)
    : integerValue(object.value.limit, "$.limit", 1, MAX_ITEMS);
  if (!limit.ok) return limit;
  const cursor = object.value.cursor === undefined || object.value.cursor === null
    ? valid<string | null>(null)
    : opaqueToken(object.value.cursor, "$.cursor");
  if (!cursor.ok) return cursor;
  return valid({ projectId: projectId.value, includeArchived: includeArchived.value, limit: limit.value, cursor: cursor.value });
}

function parseThreadSnapshotItem(value: JsonValue, path: string): BridgeValidationResult<ThreadSnapshotItem> {
  const object = asObject(value, ["id", "title", "projectId", "parentThreadId", "status", "archived", "page", "updatedAtMs"], ["id", "title", "projectId", "parentThreadId", "status", "archived", "page", "updatedAtMs"], path);
  if (!object.ok) return object;
  const id = entityId(object.value.id!, `${path}.id`); if (!id.ok) return id;
  const itemTitle = title(object.value.title!, `${path}.title`); if (!itemTitle.ok) return itemTitle;
  const projectId = nullableEntityId(object.value.projectId!, `${path}.projectId`); if (!projectId.ok) return projectId;
  const parentThreadId = nullableEntityId(object.value.parentThreadId!, `${path}.parentThreadId`); if (!parentThreadId.ok) return parentThreadId;
  const status = enumValue(object.value.status!, `${path}.status`, ["idle", "active", "waiting", "failed", "stopped"] as const); if (!status.ok) return status;
  const archived = booleanValue(object.value.archived!, `${path}.archived`); if (!archived.ok) return archived;
  const page = asObject(object.value.page!, ["available", "revision"], ["available", "revision"], `${path}.page`); if (!page.ok) return page;
  const available = booleanValue(page.value.available!, `${path}.page.available`); if (!available.ok) return available;
  const revision = page.value.revision === null ? valid<string | null>(null) : stringValue(page.value.revision!, `${path}.page.revision`, { min: 1, max: BRIDGE_MAX_PAGE_REVISION_LENGTH, pattern: ID_PATTERN, label: "Page revision" }); if (!revision.ok) return revision;
  const updatedAtMs = timestamp(object.value.updatedAtMs!, `${path}.updatedAtMs`); if (!updatedAtMs.ok) return updatedAtMs;
  return valid({ id: id.value, title: itemTitle.value, projectId: projectId.value, parentThreadId: parentThreadId.value, status: status.value, archived: archived.value, page: { available: available.value, revision: revision.value }, updatedAtMs: updatedAtMs.value });
}

function parseSnapshotResult(value: JsonValue): BridgeValidationResult<ThreadsSnapshotResult> {
  const object = asObject(value, ["threads", "nextCursor", "generatedAtMs"], ["threads", "nextCursor", "generatedAtMs"]);
  if (!object.ok) return object;
  if (!Array.isArray(object.value.threads) || object.value.threads.length > MAX_ITEMS) return invalid("$.threads", `Expected at most ${MAX_ITEMS} threads`);
  const threads: ThreadSnapshotItem[] = [];
  for (let index = 0; index < object.value.threads.length; index += 1) {
    const item = parseThreadSnapshotItem(object.value.threads[index]!, `$.threads[${index}]`); if (!item.ok) return item; threads.push(item.value);
  }
  const nextCursor = object.value.nextCursor === null ? valid<string | null>(null) : opaqueToken(object.value.nextCursor!, "$.nextCursor"); if (!nextCursor.ok) return nextCursor;
  const generatedAtMs = timestamp(object.value.generatedAtMs!, "$.generatedAtMs"); if (!generatedAtMs.ok) return generatedAtMs;
  return valid({ threads, nextCursor: nextCursor.value, generatedAtMs: generatedAtMs.value });
}

function parseReplyParams(value: JsonValue): BridgeValidationResult<ThreadReplyParams> {
  const object = asObject(value, ["result", "mode", "title", "idempotencyKey"], ["result"]); if (!object.ok) return object;
  const result = validateJsonValue(object.value.result); if (!result.ok) return result;
  const mode = object.value.mode === undefined ? valid<"queue" | "steer">("queue") : enumValue(object.value.mode, "$.mode", ["queue", "steer"] as const); if (!mode.ok) return mode;
  const replyTitle = object.value.title === undefined ? undefined : title(object.value.title, "$.title"); if (replyTitle && !replyTitle.ok) return replyTitle;
  const idempotencyKey = object.value.idempotencyKey === undefined ? undefined : stringValue(object.value.idempotencyKey, "$.idempotencyKey", { min: 1, max: BRIDGE_MAX_ID_LENGTH, pattern: ID_PATTERN, label: "Idempotency key" }); if (idempotencyKey && !idempotencyKey.ok) return idempotencyKey;
  return valid({ result: result.value, mode: mode.value, ...(replyTitle ? { title: replyTitle.value } : {}), ...(idempotencyKey ? { idempotencyKey: idempotencyKey.value } : {}) });
}

function parseDeliveryResult(value: JsonValue): BridgeValidationResult<ThreadDeliveryResult> {
  const object = asObject(value, ["delivery", "duplicate"], ["delivery", "duplicate"]); if (!object.ok) return object;
  const delivery = enumValue(object.value.delivery!, "$.delivery", ["started", "queued", "steered"] as const); if (!delivery.ok) return delivery;
  const duplicate = booleanValue(object.value.duplicate!, "$.duplicate"); if (!duplicate.ok) return duplicate;
  return valid({ delivery: delivery.value, duplicate: duplicate.value });
}

function parseContinueParams(value: JsonValue): BridgeValidationResult<ThreadsContinueParams> {
  const object = asObject(value, ["threadId", "prompt", "mode"], ["threadId", "prompt"]); if (!object.ok) return object;
  const threadId = entityId(object.value.threadId!, "$.threadId"); if (!threadId.ok) return threadId;
  const text = prompt(object.value.prompt!, "$.prompt"); if (!text.ok) return text;
  const mode = object.value.mode === undefined ? valid<"queue" | "steer">("queue") : enumValue(object.value.mode, "$.mode", ["queue", "steer"] as const); if (!mode.ok) return mode;
  return valid({ threadId: threadId.value, prompt: text.value, mode: mode.value });
}

function parseContinueResult(value: JsonValue): BridgeValidationResult<ThreadsContinueResult> {
  const object = asObject(value, ["threadId", "delivery", "duplicate"], ["threadId", "delivery", "duplicate"]); if (!object.ok) return object;
  const threadId = entityId(object.value.threadId!, "$.threadId"); if (!threadId.ok) return threadId;
  const delivery = parseDeliveryResult({ delivery: object.value.delivery!, duplicate: object.value.duplicate! }); if (!delivery.ok) return delivery;
  return valid({ threadId: threadId.value, ...delivery.value });
}

function optionalSafeName(value: JsonValue, path: string, max = 160): BridgeValidationResult<string> {
  return stringValue(value, path, { min: 1, max, pattern: /^[^\u0000-\u001f\u007f]+$/, label: "Name" });
}

function parseSpawnParams(value: JsonValue): BridgeValidationResult<ThreadsSpawnParams> {
  const object = asObject(value, ["projectId", "prompt", "title", "providerId", "model", "reasoningLevel"], ["projectId", "prompt"]); if (!object.ok) return object;
  const projectId = entityId(object.value.projectId!, "$.projectId"); if (!projectId.ok) return projectId;
  const text = prompt(object.value.prompt!, "$.prompt"); if (!text.ok) return text;
  const threadTitle = object.value.title === undefined ? undefined : title(object.value.title, "$.title"); if (threadTitle && !threadTitle.ok) return threadTitle;
  const providerId = object.value.providerId === undefined ? undefined : entityId(object.value.providerId, "$.providerId"); if (providerId && !providerId.ok) return providerId;
  const model = object.value.model === undefined ? undefined : optionalSafeName(object.value.model, "$.model"); if (model && !model.ok) return model;
  const reasoningLevel = object.value.reasoningLevel === undefined ? undefined : entityId(object.value.reasoningLevel, "$.reasoningLevel"); if (reasoningLevel && !reasoningLevel.ok) return reasoningLevel;
  return valid({ projectId: projectId.value, prompt: text.value, ...(threadTitle ? { title: threadTitle.value } : {}), ...(providerId ? { providerId: providerId.value } : {}), ...(model ? { model: model.value } : {}), ...(reasoningLevel ? { reasoningLevel: reasoningLevel.value } : {}) });
}

function parseThreadTarget(value: JsonValue): BridgeValidationResult<ThreadTargetParams> {
  const object = asObject(value, ["threadId"], ["threadId"]); if (!object.ok) return object;
  const threadId = entityId(object.value.threadId!, "$.threadId"); return threadId.ok ? valid({ threadId: threadId.value }) : threadId;
}

function parseBooleanResult(key: "opened", value: JsonValue): BridgeValidationResult<OpenResult>;
function parseBooleanResult(key: "archived", value: JsonValue): BridgeValidationResult<ArchiveResult>;
function parseBooleanResult(key: "stopped", value: JsonValue): BridgeValidationResult<StopResult>;
function parseBooleanResult(key: "opened" | "archived" | "stopped", value: JsonValue): BridgeValidationResult<OpenResult | ArchiveResult | StopResult> {
  const object = asObject(value, [key], [key]); if (!object.ok) return object;
  const flag = booleanValue(object.value[key]!, `$.${key}`);
  if (!flag.ok) return flag;
  if (key === "opened") return valid({ opened: flag.value });
  if (key === "archived") return valid({ archived: flag.value });
  return valid({ stopped: flag.value });
}

function parseExternalHttpUrl(
  value: JsonValue,
  path: string,
): BridgeValidationResult<string> {
  const bounded = stringValue(value, path, {
    min: 1,
    max: 2_048,
    pattern: /^[^\u0000-\u0020\u007f]+$/,
    label: "External URL",
  });
  if (!bounded.ok) return bounded;
  let parsed: URL;
  try {
    parsed = new URL(bounded.value);
  } catch {
    return invalid(path, "Expected an absolute http or https URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return invalid(path, "Expected an absolute http or https URL without credentials");
  }
  return valid(bounded.value);
}

function parseOpenExternalParams(
  value: JsonValue,
): BridgeValidationResult<NavigationOpenExternalParams> {
  const object = asObject(value, ["url", "label"], ["url"]);
  if (!object.ok) return object;
  const url = parseExternalHttpUrl(object.value.url!, "$.url");
  if (!url.ok) return url;
  const label = object.value.label === undefined
    ? undefined
    : stringValue(object.value.label, "$.label", {
        min: 1,
        max: 160,
        label: "Target label",
      });
  if (label && !label.ok) return label;
  return valid({ url: url.value, ...(label ? { label: label.value } : {}) });
}

function parseProjectChoice(value: JsonValue, path: string): BridgeValidationResult<ProjectChoice> {
  const object = asObject(value, ["id", "name", "kind"], ["id", "name", "kind"], path); if (!object.ok) return object;
  const id = entityId(object.value.id!, `${path}.id`); if (!id.ok) return id;
  const name = title(object.value.name!, `${path}.name`); if (!name.ok) return name;
  const kind = enumValue(object.value.kind!, `${path}.kind`, ["standard", "personal"] as const); if (!kind.ok) return kind;
  return valid({ id: id.value, name: name.value, kind: kind.value });
}

function parseProjectsResult(value: JsonValue): BridgeValidationResult<{ projects: readonly ProjectChoice[] }> {
  const object = asObject(value, ["projects"], ["projects"]); if (!object.ok) return object;
  if (!Array.isArray(object.value.projects) || object.value.projects.length > MAX_ITEMS) return invalid("$.projects", `Expected at most ${MAX_ITEMS} projects`);
  const projects: ProjectChoice[] = [];
  for (let index = 0; index < object.value.projects.length; index += 1) { const item = parseProjectChoice(object.value.projects[index]!, `$.projects[${index}]`); if (!item.ok) return item; projects.push(item.value); }
  return valid({ projects });
}

function parseBrowseParams(value: JsonValue): BridgeValidationResult<ProjectsBrowseParams> {
  const object = asObject(value, ["startProjectId"], []); if (!object.ok) return object;
  const startProjectId = object.value.startProjectId === undefined || object.value.startProjectId === null ? valid<string | null>(null) : entityId(object.value.startProjectId, "$.startProjectId");
  return startProjectId.ok ? valid({ startProjectId: startProjectId.value }) : startProjectId;
}

function parseBrowseResult(value: JsonValue): BridgeValidationResult<ProjectsBrowseResult> {
  const object = asObject(value, ["selection"], ["selection"]); if (!object.ok) return object;
  if (object.value.selection === null) return valid({ selection: null });
  const selection = asObject(object.value.selection!, ["token", "displayPath", "hostName"], ["token", "displayPath", "hostName"], "$.selection"); if (!selection.ok) return selection;
  const token = opaqueToken(selection.value.token!, "$.selection.token"); if (!token.ok) return token;
  const displayPath = stringValue(selection.value.displayPath!, "$.selection.displayPath", { min: 1, max: 1024, label: "Display path" }); if (!displayPath.ok) return displayPath;
  const hostName = title(selection.value.hostName!, "$.selection.hostName"); if (!hostName.ok) return hostName;
  return valid({ selection: { token: token.value, displayPath: displayPath.value, hostName: hostName.value } });
}

function parseCreateProjectParams(value: JsonValue): BridgeValidationResult<ProjectsCreateParams> {
  const object = asObject(value, ["selectionToken", "name"], ["selectionToken"]); if (!object.ok) return object;
  const selectionToken = opaqueToken(object.value.selectionToken!, "$.selectionToken"); if (!selectionToken.ok) return selectionToken;
  const name = object.value.name === undefined ? undefined : title(object.value.name, "$.name"); if (name && !name.ok) return name;
  return valid({ selectionToken: selectionToken.value, ...(name ? { name: name.value } : {}) });
}

function parseProviderChoice(value: JsonValue, path: string): BridgeValidationResult<ProviderChoice> {
  const object = asObject(value, ["id", "displayName", "available", "models"], ["id", "displayName", "available", "models"], path); if (!object.ok) return object;
  const id = entityId(object.value.id!, `${path}.id`); if (!id.ok) return id;
  const displayName = title(object.value.displayName!, `${path}.displayName`); if (!displayName.ok) return displayName;
  const available = booleanValue(object.value.available!, `${path}.available`); if (!available.ok) return available;
  if (!Array.isArray(object.value.models) || object.value.models.length > MAX_ITEMS) return invalid(`${path}.models`, `Expected at most ${MAX_ITEMS} models`);
  const models: { id: string; displayName: string }[] = [];
  for (let index = 0; index < object.value.models.length; index += 1) {
    const model = asObject(object.value.models[index]!, ["id", "displayName"], ["id", "displayName"], `${path}.models[${index}]`); if (!model.ok) return model;
    const modelId = optionalSafeName(model.value.id!, `${path}.models[${index}].id`); if (!modelId.ok) return modelId;
    const modelName = title(model.value.displayName!, `${path}.models[${index}].displayName`); if (!modelName.ok) return modelName;
    models.push({ id: modelId.value, displayName: modelName.value });
  }
  return valid({ id: id.value, displayName: displayName.value, available: available.value, models });
}

function parseProvidersResult(value: JsonValue): BridgeValidationResult<{ providers: readonly ProviderChoice[] }> {
  const object = asObject(value, ["providers"], ["providers"]); if (!object.ok) return object;
  if (!Array.isArray(object.value.providers) || object.value.providers.length > 64) return invalid("$.providers", "Expected at most 64 providers");
  const providers: ProviderChoice[] = [];
  for (let index = 0; index < object.value.providers.length; index += 1) { const item = parseProviderChoice(object.value.providers[index]!, `$.providers[${index}]`); if (!item.ok) return item; providers.push(item.value); }
  return valid({ providers });
}

function parseStorageKey(value: JsonValue, path = "$.key"): BridgeValidationResult<string> {
  return stringValue(value, path, { min: 1, max: 128, pattern: STORAGE_KEY_PATTERN, label: "Storage key" });
}

function parseStorageGetParams(value: JsonValue): BridgeValidationResult<{ key: string }> {
  const object = asObject(value, ["key"], ["key"]); if (!object.ok) return object;
  const key = parseStorageKey(object.value.key!); return key.ok ? valid({ key: key.value }) : key;
}

function parseStorageGetResult(value: JsonValue): BridgeValidationResult<{ found: false } | { found: true; value: JsonValue }> {
  if (value === null || Array.isArray(value) || typeof value !== "object" || typeof value.found !== "boolean") return invalid("$.found", "Expected a boolean found flag");
  const object = value.found ? asObject(value, ["found", "value"], ["found", "value"]) : asObject(value, ["found"], ["found"]); if (!object.ok) return object;
  if (!value.found) return valid({ found: false });
  const stored = validateJsonValue(object.value.value, { maxBytes: BRIDGE_MAX_STORAGE_VALUE_BYTES, maxDepth: 12 });
  return stored.ok ? valid({ found: true, value: stored.value }) : stored;
}

function parseStorageSetParams(value: JsonValue): BridgeValidationResult<{ key: string; value: JsonValue }> {
  const object = asObject(value, ["key", "value"], ["key", "value"]); if (!object.ok) return object;
  const key = parseStorageKey(object.value.key!); if (!key.ok) return key;
  const stored = validateJsonValue(object.value.value, { maxBytes: BRIDGE_MAX_STORAGE_VALUE_BYTES, maxDepth: 12 }); if (!stored.ok) return stored;
  return valid({ key: key.value, value: stored.value });
}

function parseStoredResult(value: JsonValue): BridgeValidationResult<{ stored: boolean }> {
  const object = asObject(value, ["stored"], ["stored"]); if (!object.ok) return object;
  const stored = booleanValue(object.value.stored!, "$.stored"); return stored.ok ? valid({ stored: stored.value }) : stored;
}

function parseVoiceParams(value: JsonValue): BridgeValidationResult<{ language?: string; prompt?: string; maxDurationSeconds: number }> {
  const object = asObject(value, ["language", "prompt", "maxDurationSeconds"], []); if (!object.ok) return object;
  const language = object.value.language === undefined ? undefined : stringValue(object.value.language, "$.language", { min: 2, max: 64, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" }); if (language && !language.ok) return language;
  const voicePrompt = object.value.prompt === undefined ? undefined : stringValue(object.value.prompt, "$.prompt", { max: 1000, label: "Transcription prompt" }); if (voicePrompt && !voicePrompt.ok) return voicePrompt;
  const maxDurationSeconds = object.value.maxDurationSeconds === undefined ? valid(120) : integerValue(object.value.maxDurationSeconds, "$.maxDurationSeconds", 1, 120); if (!maxDurationSeconds.ok) return maxDurationSeconds;
  return valid({ ...(language ? { language: language.value } : {}), ...(voicePrompt ? { prompt: voicePrompt.value } : {}), maxDurationSeconds: maxDurationSeconds.value });
}

function parseVoiceResult(value: JsonValue): BridgeValidationResult<{ text: string }> {
  const object = asObject(value, ["text"], ["text"]); if (!object.ok) return object;
  const text = stringValue(object.value.text!, "$.text", { max: MAX_RESULT_TEXT_LENGTH, label: "Transcription" }); return text.ok ? valid({ text: text.value }) : text;
}

function excerpt(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= 80 ? singleLine : `${singleLine.slice(0, 79)}…`;
}

const strictParitySpecs = [
  {
    method: "context.get",
    description: "Read the current Thread Page context and capability roster.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseContextResult),
  },
  {
    method: "thread.activity",
    description: "Read this thread's current state and recent presented activity.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseActivityParams),
    validateResult: jsonValidator(parseActivityResult),
  },
  {
    method: "threads.snapshot",
    description: "Read a bounded, projected snapshot of threads and page status.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseSnapshotParams),
    validateResult: jsonValidator(parseSnapshotResult),
  },
  {
    method: "thread.reply",
    description: "Reply to the Thread Page's owning thread.",
    effect: "current-thread-write",
    confirmation: "none",
    validateParams: jsonValidator(parseReplyParams),
    validateResult: jsonValidator(parseDeliveryResult),
  },
  {
    method: "threads.continue",
    description: "Send a prompt to another existing thread.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params: ThreadsContinueParams) => `Continue thread ${params.threadId}: ${excerpt(params.prompt)}`,
    validateParams: jsonValidator(parseContinueParams),
    validateResult: jsonValidator(parseContinueResult),
  },
  {
    method: "threads.spawn",
    description: "Start a visible root thread in a selected project.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params: ThreadsSpawnParams) => `Start a thread in ${params.projectId}: ${excerpt(params.prompt)}`,
    validateParams: jsonValidator(parseSpawnParams),
    validateResult: jsonValidator((value) => {
      const object = asObject(value, ["threadId"], ["threadId"]); if (!object.ok) return object;
      const threadId = entityId(object.value.threadId!, "$.threadId"); return threadId.ok ? valid({ threadId: threadId.value }) : threadId;
    }),
  },
  {
    method: "threads.openPage",
    description: "Open another Thread Page using trusted client navigation.",
    effect: "navigation",
    confirmation: "none",
    summarize: (params: ThreadTargetParams) => `Open the Thread Page for ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value)),
  },
  {
    method: "threads.openBb",
    description: "Open a thread in the bb application.",
    effect: "navigation",
    confirmation: "none",
    summarize: (params: ThreadTargetParams) => `Open thread ${params.threadId} in bb`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value)),
  },
  {
    method: "threads.stop",
    description: "Stop the selected thread's active provider runtime.",
    effect: "destructive",
    confirmation: "trusted-outer",
    summarize: (params: ThreadTargetParams) => `Stop thread ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("stopped", value)),
  },
  {
    method: "threads.archive",
    description: "Archive a selected thread.",
    effect: "destructive",
    confirmation: "trusted-outer",
    summarize: (params: ThreadTargetParams) => `Archive thread ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("archived", value)),
  },
  {
    method: "navigation.openExternal",
    description: "Open an external http or https URL through trusted client chrome.",
    effect: "navigation",
    confirmation: "trusted-outer",
    summarize: (params: NavigationOpenExternalParams) => {
      const target = new URL(params.url);
      return `Open ${params.label ? `“${params.label}” at ` : ""}${target.origin}`;
    },
    validateParams: jsonValidator(parseOpenExternalParams),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value)),
  },
  {
    method: "projects.list",
    description: "Read safe project choices without host or path details.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseProjectsResult),
  },
  {
    method: "projects.browse",
    description: "Open a trusted folder picker and return an opaque selection token.",
    effect: "device",
    confirmation: "trusted-outer",
    summarize: () => "Choose a project folder on this device",
    validateParams: jsonValidator(parseBrowseParams),
    validateResult: jsonValidator(parseBrowseResult),
  },
  {
    method: "projects.create",
    description: "Create a project from a trusted folder-picker selection.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params: ProjectsCreateParams) => `Create project ${params.name ? `“${params.name}”` : "from the selected folder"}`,
    validateParams: jsonValidator(parseCreateProjectParams),
    validateResult: jsonValidator((value) => {
      const object = asObject(value, ["project"], ["project"]); if (!object.ok) return object;
      const project = parseProjectChoice(object.value.project!, "$.project"); return project.ok ? valid({ project: project.value }) : project;
    }),
  },
  {
    method: "providers.list",
    description: "Read available provider and model choices.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseProvidersResult),
  },
  {
    method: "storage.get",
    description: "Read small JSON state scoped to the owning Thread Page.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseStorageGetParams),
    validateResult: jsonValidator(parseStorageGetResult),
  },
  {
    method: "storage.set",
    description: "Write small JSON state scoped to the owning Thread Page.",
    effect: "current-thread-write",
    confirmation: "none",
    validateParams: jsonValidator(parseStorageSetParams),
    validateResult: jsonValidator(parseStoredResult),
  },
  {
    method: "voice.captureAndTranscribe",
    description: "Record and transcribe voice through trusted client chrome.",
    effect: "device",
    confirmation: "trusted-outer",
    summarize: () => "Allow this Thread Page to record and transcribe voice",
    validateParams: jsonValidator(parseVoiceParams),
    validateResult: jsonValidator(parseVoiceResult),
  },
] as const satisfies readonly AnyCapabilitySpec[];

export const strictParityCapabilityRegistry =
  createCapabilityRegistry(strictParitySpecs);

export function capabilityDescriptors(
  registry: CapabilityRegistry = strictParityCapabilityRegistry,
): readonly CapabilityDescriptor[] {
  return registry.list().map(({ method, effect, confirmation }) => ({
    method,
    effect,
    confirmation,
  }));
}
