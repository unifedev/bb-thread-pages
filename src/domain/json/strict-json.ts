import { LIMITS } from "../limits.ts";

/**
 * A value that survives a JSON round trip without loss, and the checks that
 * establish it: no cycles, accessors, symbols, sparse arrays, unsafe keys,
 * non-finite numbers, and bounded depth, node count and serialised size.
 * spec R5.2
 */
export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type IssueCode =
  | "invalid_type"
  | "invalid_value"
  | "missing_key"
  | "unknown_key"
  | "not_json_safe"
  | "too_deep"
  | "too_large";

export interface Issue {
  readonly code: IssueCode;
  readonly path: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export function valid<T>(value: T): Validation<T> {
  return { ok: true, value };
}

export function invalid<T = never>(path: string, message: string, code: IssueCode = "invalid_value"): Validation<T> {
  return { ok: false, issues: [{ code, path, message }] };
}

export interface JsonLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function pathForKey(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Validates without coercion and returns a detached copy of the value. */
export function validateJson(input: unknown, limits: JsonLimits = {}): Validation<JsonValue> {
  const maxBytes = limits.maxBytes ?? LIMITS.capabilityPayloadBytes;
  const maxDepth = limits.maxDepth ?? LIMITS.capabilityJsonDepth;
  const maxNodes = limits.maxNodes ?? LIMITS.capabilityJsonNodes;
  const ancestors = new Set<object>();
  let nodes = 0;

  function visit(value: unknown, path: string, depth: number): Issue | null {
    nodes += 1;
    if (nodes > maxNodes) return { code: "too_large", path, message: `JSON exceeds ${maxNodes} nodes` };
    if (depth > maxDepth) return { code: "too_deep", path, message: `JSON exceeds depth ${maxDepth}` };
    if (value === null || typeof value === "string" || typeof value === "boolean") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? null : { code: "not_json_safe", path, message: "Numbers must be finite" };
    }
    if (typeof value !== "object") {
      return { code: "not_json_safe", path, message: `Unsupported value type: ${typeof value}` };
    }
    if (ancestors.has(value)) return { code: "not_json_safe", path, message: "Cyclic values are not JSON-safe" };
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key === "symbol") return { code: "not_json_safe", path, message: "Symbol properties are not JSON-safe" };
          if (key !== "length" && !isCanonicalIndex(key, value.length)) {
            return { code: "not_json_safe", path: pathForKey(path, key), message: "Arrays may not carry extra properties" };
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            return { code: "not_json_safe", path: `${path}[${index}]`, message: "Sparse arrays and accessors are not JSON-safe" };
          }
          const issue = visit(descriptor.value, `${path}[${index}]`, depth + 1);
          if (issue) return issue;
        }
        return null;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return { code: "not_json_safe", path, message: "Only plain objects are JSON-safe" };
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") return { code: "not_json_safe", path, message: "Symbol properties are not JSON-safe" };
        if (UNSAFE_KEYS.has(key)) return { code: "not_json_safe", path: pathForKey(path, key), message: "Unsafe object key" };
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return { code: "not_json_safe", path: pathForKey(path, key), message: "Entries must be enumerable data properties" };
        }
        const issue = visit(descriptor.value, pathForKey(path, key), depth + 1);
        if (issue) return issue;
      }
      return null;
    } catch {
      return { code: "not_json_safe", path, message: "Value could not be inspected" };
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
    return invalid("$", "Value could not be serialised", "not_json_safe");
  }
  if (utf8Bytes(serialized) > maxBytes) {
    return invalid("$", `Serialised JSON exceeds ${maxBytes} bytes`, "too_large");
  }
  return valid(JSON.parse(serialized) as JsonValue);
}

function isCanonicalIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}
