import { invalid, isJsonObject, pathForKey, valid, validateJson, utf8Bytes, type JsonValue, type Validation } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import type { CapabilitySpec, ContributorRef, EffectClass } from "./contract.ts";

/**
 * Capabilities another installed extension contributes. The host knows
 * nothing of what they do: it checks a contributor's declaration, compiles
 * its schemas into the same validators built-in capabilities use, and turns
 * each method into a `CapabilitySpec` that is never confirmed.
 * spec 05 §Contributed capabilities, DECISIONS D18–D24, D27
 */

/** Namespaces of built-in capabilities; no contributor may declare under them. spec R5.43 */
export const RESERVED_NAMESPACES: ReadonlySet<string> = new Set([
  "context",
  "session",
  "sessions",
  "projects",
  "providers",
  "storage",
  "pages",
  "navigation",
  "voice",
]);

export const CONTRIBUTED_EFFECTS: readonly EffectClass[] = ["read", "contributed-write"];

const NAMESPACE = /^[a-z][a-z0-9-]{0,31}$/;
const LOCAL_NAME = /^[a-z][A-Za-z0-9]{0,63}$/;
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/;
const DESCRIPTION_MAX = 240;

export interface ContributedSpec extends CapabilitySpec<JsonValue, JsonValue> {
  readonly contributor: ContributorRef;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
}

export interface Contributor {
  readonly id: string;
  readonly version: string;
  readonly methods: readonly ContributedSpec[];
  /** Appended to the standing instruction. spec R6.29, D27 */
  readonly instruction: string | null;
  /** Printed in the guide's section for this contributor. spec R6.29 */
  readonly guide: string | null;
}

export interface ParsedContributor {
  /** null when the declaration as a whole is refused. */
  readonly contributor: Contributor | null;
  /** Everything refused, for the operator's log. spec R5.43 */
  readonly problems: readonly string[];
}

/** A contributor's namespace is its id. spec R5.43 */
export function namespaceOf(method: string): string {
  const dot = method.indexOf(".");
  return dot < 0 ? method : method.slice(0, dot);
}

export function isReservedNamespace(namespace: string): boolean {
  return RESERVED_NAMESPACES.has(namespace);
}

/**
 * Checks one contributor's declaration. The contributor as a whole is refused
 * when its identity is unusable; a single bad method is refused on its own and
 * the rest are kept.
 */
export function parseContributor(id: string, input: unknown): ParsedContributor {
  const problems: string[] = [];
  const refuse = (problem: string): ParsedContributor => ({ contributor: null, problems: [...problems, problem] });
  if (!NAMESPACE.test(id)) return refuse(`contributor id "${id}" is not a usable namespace`);
  if (isReservedNamespace(id)) return refuse(`contributor "${id}" uses a reserved namespace`);
  const checked = validateJson(input, { maxBytes: 256 * 1024, maxDepth: 32, maxNodes: 50_000 });
  if (!checked.ok || !isJsonObject(checked.value)) return refuse(`contributor "${id}": the declaration is not a JSON object`);
  const declaration = checked.value;
  const unknown = Object.keys(declaration).filter((key) => !["version", "methods", "instruction", "guide"].includes(key));
  if (unknown.length > 0) return refuse(`contributor "${id}": unknown keys ${unknown.join(", ")}`);
  if (typeof declaration.version !== "string" || !VERSION.test(declaration.version)) return refuse(`contributor "${id}": a version is required`);
  const ref: ContributorRef = Object.freeze({ id, version: declaration.version });

  const instruction = boundedText(declaration.instruction, LIMITS.contributorInstructionBytes);
  if (instruction === false) return refuse(`contributor "${id}": the instruction must be text of at most ${LIMITS.contributorInstructionBytes} bytes`);
  const guide = boundedText(declaration.guide, LIMITS.contributorGuideBytes);
  if (guide === false) return refuse(`contributor "${id}": the guide must be text of at most ${LIMITS.contributorGuideBytes} bytes`);

  const rawMethods = declaration.methods ?? [];
  if (!Array.isArray(rawMethods)) return refuse(`contributor "${id}": methods must be a list`);
  if (rawMethods.length > LIMITS.contributorMethods) return refuse(`contributor "${id}": at most ${LIMITS.contributorMethods} methods`);

  const methods: ContributedSpec[] = [];
  const seen = new Set<string>();
  for (const raw of rawMethods) {
    const parsed = parseMethod(ref, raw);
    if (typeof parsed === "string") {
      problems.push(`contributor "${id}": ${parsed}`);
      continue;
    }
    if (seen.has(parsed.method)) {
      problems.push(`contributor "${id}": ${parsed.method} is declared twice`);
      continue;
    }
    seen.add(parsed.method);
    methods.push(parsed);
  }
  return {
    contributor: Object.freeze({ id, version: ref.version, methods: Object.freeze(methods), instruction, guide }),
    problems,
  };
}

function boundedText(value: JsonValue | undefined, maxBytes: number): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || utf8Bytes(value) > maxBytes) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const METHOD_KEYS = ["name", "description", "effect", "params", "result", "maxRequestBytes", "maxResponseBytes", "reasons"];

function parseMethod(contributor: ContributorRef, raw: JsonValue): ContributedSpec | string {
  if (!isJsonObject(raw)) return "a method declaration must be an object";
  const name = typeof raw.name === "string" ? raw.name : "";
  const label = name || "a method";
  const unknown = Object.keys(raw).filter((key) => !METHOD_KEYS.includes(key));
  if (unknown.length > 0) return `${label}: unknown keys ${unknown.join(", ")}`;
  const dot = name.indexOf(".");
  const namespace = dot < 0 ? "" : name.slice(0, dot);
  const local = dot < 0 ? "" : name.slice(dot + 1);
  if (namespace !== contributor.id || !LOCAL_NAME.test(local)) return `${label}: the name must be "${contributor.id}.<name>"`;
  if (typeof raw.description !== "string" || raw.description.trim().length === 0 || raw.description.length > DESCRIPTION_MAX) {
    return `${name}: a description of at most ${DESCRIPTION_MAX} characters is required`;
  }
  // Confirmed classes, navigation and reader-state are the host's own. spec R5.7b, D19
  if (!CONTRIBUTED_EFFECTS.includes(raw.effect as EffectClass)) return `${name}: effect must be "read" or "contributed-write"`;
  const effect = raw.effect as EffectClass;

  const maxRequestBytes = bound(raw.maxRequestBytes);
  const maxResponseBytes = bound(raw.maxResponseBytes);
  if (maxRequestBytes === null || maxResponseBytes === null) {
    return `${name}: bounds must be whole numbers of bytes from 1024 to ${LIMITS.contributedPayloadMaxBytes}`;
  }

  const params = compileSchema(raw.params ?? { type: "object", properties: {}, additionalProperties: false }, "params");
  if (typeof params === "string") return `${name}: params schema: ${params}`;
  const result = compileSchema(raw.result, "result");
  if (typeof result === "string") return `${name}: result schema: ${result}`;

  const reasons = new Map<string, ((value: unknown) => Validation<JsonValue>) | null>();
  if (raw.reasons !== undefined) {
    if (!isJsonObject(raw.reasons)) return `${name}: reasons must be an object of reason → { detail? }`;
    for (const [reason, entry] of Object.entries(raw.reasons)) {
      if (!REASON.test(reason)) return `${name}: reason "${reason}" must match ${REASON}`;
      if (!isJsonObject(entry) || Object.keys(entry).some((key) => key !== "detail" && key !== "description")) {
        return `${name}: reason "${reason}" must be { detail?, description? }`;
      }
      if (entry.detail === undefined) {
        reasons.set(reason, null);
        continue;
      }
      const detail = compileSchema(entry.detail, "result");
      if (typeof detail === "string") return `${name}: detail schema for "${reason}": ${detail}`;
      reasons.set(reason, (value) => detail.parse(value as JsonValue, "$"));
    }
  }

  // A page that passes nothing to a method taking an object passes an empty object.
  const validateParams = (value: JsonValue | undefined) => params.parse(value === undefined || value === null ? params.emptyValue : value, "$");
  return Object.freeze({
    method: name,
    description: raw.description.trim(),
    effect,
    confirmed: false,
    implemented: true,
    validateParams,
    validateResult: (value: unknown) => result.parse(value as JsonValue, "$"),
    doc: { params: "Declared by the contributor.", result: "Declared by the contributor." },
    maxRequestBytes,
    maxResponseBytes,
    contributor,
    reasons,
  });
}

function bound(value: JsonValue | undefined): number | null {
  if (value === undefined) return LIMITS.capabilityPayloadBytes;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1024 && value <= LIMITS.contributedPayloadMaxBytes ? value : null;
}

// --- the schema subset ------------------------------------------------------

/**
 * A JSON Schema subset, compiled once. Parameters are checked exactly: every
 * object must be closed (`additionalProperties: false`), so unknown keys are
 * refused as for built-in capabilities (R5.2). Results are projected: fields
 * the schema does not declare are dropped (R5.3). A keyword outside the subset
 * refuses the declaration, so a contributor never believes something is
 * checked that is not. spec R5.44, R5.48
 */
export interface CompiledSchema {
  parse(value: JsonValue | undefined, path: string): Validation<JsonValue>;
  /** What an absent value stands for: `{}` for an object schema, otherwise nothing. */
  readonly emptyValue: JsonValue | undefined;
}

const KEYWORDS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "items",
  "minItems",
  "maxItems",
]);
const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

type Mode = "params" | "result";
type Node = (value: JsonValue | undefined, path: string) => Validation<JsonValue>;

export function compileSchema(schema: JsonValue | undefined, mode: Mode): CompiledSchema | string {
  try {
    const node = compileNode(schema, mode, "$", 0);
    const types = isJsonObject(schema) ? typeList(schema.type) : [];
    return { parse: node, emptyValue: types.length === 1 && types[0] === "object" ? {} : undefined };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function typeList(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function compileNode(schema: JsonValue | undefined, mode: Mode, at: string, depth: number): Node {
  if (depth > 16) throw new Error(`${at}: the schema is nested too deeply`);
  if (!isJsonObject(schema)) throw new Error(`${at}: a schema must be an object`);
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key)) throw new Error(`${at}: "${key}" is not in the supported subset`);
  }
  const types = typeList(schema.type);
  if (schema.type !== undefined && (types.length === 0 || types.some((type) => !TYPES.has(type)) || (Array.isArray(schema.type) && types.length !== schema.type.length))) {
    throw new Error(`${at}: type must be one of ${[...TYPES].join(", ")}, or a list of them`);
  }
  if (types.length === 0 && schema.enum === undefined && schema.const === undefined) throw new Error(`${at}: a type, enum or const is required`);

  const enumValues = schema.enum;
  if (enumValues !== undefined && (!Array.isArray(enumValues) || enumValues.length === 0)) throw new Error(`${at}: enum must be a non-empty list`);
  const constValue = schema.const;
  const numberLimit = (key: "minimum" | "maximum"): number | undefined => {
    const value = schema[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number") throw new Error(`${at}: ${key} must be a number`);
    return value;
  };
  const countLimit = (key: "minLength" | "maxLength" | "minItems" | "maxItems"): number | undefined => {
    const value = schema[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${at}: ${key} must be a whole number`);
    return value;
  };
  const minimum = numberLimit("minimum");
  const maximum = numberLimit("maximum");
  const minLength = countLimit("minLength");
  const maxLength = countLimit("maxLength");
  const minItems = countLimit("minItems");
  const maxItems = countLimit("maxItems");
  let pattern: RegExp | undefined;
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string" || schema.pattern.length > 512) throw new Error(`${at}: pattern must be a string of at most 512 characters`);
    try {
      pattern = new RegExp(schema.pattern, "u");
    } catch {
      throw new Error(`${at}: pattern is not a valid regular expression`);
    }
  }

  let properties: Map<string, Node> | null = null;
  let required: Set<string> = new Set();
  if (types.includes("object")) {
    const declared = schema.properties ?? {};
    if (!isJsonObject(declared)) throw new Error(`${at}: properties must be an object`);
    properties = new Map();
    for (const [key, child] of Object.entries(declared)) properties.set(key, compileNode(child, mode, pathForKey(at, key), depth + 1));
    const requiredList = schema.required ?? [];
    if (!Array.isArray(requiredList) || requiredList.some((key) => typeof key !== "string" || !properties!.has(key))) {
      throw new Error(`${at}: required must list declared properties`);
    }
    required = new Set(requiredList as string[]);
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
      throw new Error(`${at}: additionalProperties must be true or false`);
    }
    // Exact key sets for parameters. spec R5.2, R5.44
    if (mode === "params" && schema.additionalProperties !== false) throw new Error(`${at}: a parameter object must set additionalProperties to false`);
  }
  let items: Node | null = null;
  if (types.includes("array")) {
    if (schema.items === undefined) throw new Error(`${at}: an array needs items`);
    items = compileNode(schema.items, mode, `${at}[]`, depth + 1);
  }

  const node: Node = (value, path) => {
    if (value === undefined) return invalid(path, "Missing value", "missing_key");
    if (constValue !== undefined && JSON.stringify(value) !== JSON.stringify(constValue)) return invalid(path, `Expected ${JSON.stringify(constValue)}`);
    if (enumValues !== undefined && !(enumValues as JsonValue[]).some((option) => JSON.stringify(option) === JSON.stringify(value))) {
      return invalid(path, "Not one of the allowed values");
    }
    if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
      return invalid(path, `Expected ${types.join(" or ")}`, "invalid_type");
    }
    if (typeof value === "string") {
      if (minLength !== undefined && value.length < minLength) return invalid(path, `At least ${minLength} characters`);
      if (maxLength !== undefined && value.length > maxLength) return invalid(path, `At most ${maxLength} characters`, "too_large");
      if (pattern && !pattern.test(value)) return invalid(path, "Invalid format");
      return valid(value);
    }
    if (typeof value === "number") {
      if (minimum !== undefined && value < minimum) return invalid(path, `At least ${minimum}`);
      if (maximum !== undefined && value > maximum) return invalid(path, `At most ${maximum}`);
      return valid(value);
    }
    if (Array.isArray(value)) {
      if (minItems !== undefined && value.length < minItems) return invalid(path, `At least ${minItems} items`);
      if (maxItems !== undefined && value.length > maxItems) return invalid(path, `At most ${maxItems} items`, "too_large");
      const out: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const parsed = items ? items(value[index], `${path}[${index}]`) : valid(value[index] as JsonValue);
        if (!parsed.ok) return parsed;
        out.push(parsed.value);
      }
      return valid(out);
    }
    if (isJsonObject(value) && properties) {
      const out: Record<string, JsonValue> = {};
      for (const key of Object.keys(value)) {
        // Parameters: unknown keys are refused. Results: they are dropped. spec R5.48
        if (!properties.has(key) && mode === "params") return invalid(pathForKey(path, key), "Unknown key", "unknown_key");
      }
      for (const [key, child] of properties) {
        const present = Object.prototype.hasOwnProperty.call(value, key);
        if (!present) {
          if (required.has(key)) return invalid(pathForKey(path, key), "Missing required key", "missing_key");
          continue;
        }
        const parsed = child(value[key], pathForKey(path, key));
        if (!parsed.ok) return parsed;
        out[key] = parsed.value;
      }
      return valid(out);
    }
    return valid(value);
  };
  return node;
}

function matchesType(type: string, value: JsonValue): boolean {
  switch (type) {
    case "object":
      return isJsonObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}
