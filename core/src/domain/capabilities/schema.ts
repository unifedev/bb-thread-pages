// The tiny schema combinator used by `specs.ts` (object with exact keys, string with bounds/pattern, integer range, number, literal, list, map, nullable, union, refine).
import { invalid, isJsonObject, pathForKey, valid, validateJson, type Issue, type JsonLimits, type JsonValue, type Validation } from "../json/strict-json.ts";

/**
 * A typed schema language for capability parameters and results. Every
 * object is exact: unknown keys are rejected, required keys must be present,
 * optional keys may be absent (never `undefined`). Strings are bounded;
 * numbers are integers in a range unless `number` is asked for; JSON blobs
 * carry their own limits. spec 03 R5.2, R5.3
 */
export interface Schema<T> {
  parse(value: JsonValue | undefined, path: string): Validation<T>;
}

export interface OptionalSchema<T> extends Schema<T> {
  readonly isOptional: true;
}

/** Optional on the wire, always present after parsing. */
export interface DefaultedSchema<T> extends OptionalSchema<T> {
  readonly hasDefault: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends DefaultedSchema<unknown> ? never : S[K] extends OptionalSchema<unknown> ? K : never;
}[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;
export type InferShape<S extends Shape> = { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> };

function issues<T>(list: readonly Issue[]): Validation<T> {
  return { ok: false, issues: list };
}

export function string(options: { min?: number; max: number; pattern?: RegExp; label?: string }): Schema<string> {
  const label = options.label ?? "String";
  return {
    parse(value, path) {
      if (typeof value !== "string") return invalid(path, `${label}: expected a string`, "invalid_type");
      const min = options.min ?? 0;
      if (value.length < min || value.length > options.max) return invalid(path, `${label}: length must be ${min}–${options.max}`, "too_large");
      if (options.pattern && !options.pattern.test(value)) return invalid(path, `${label}: invalid format`, "pattern");
      return valid(value);
    },
  };
}

export function integer(min: number, max: number, label = "Integer"): Schema<number> {
  return {
    parse(value, path) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid(path, `${label}: expected an integer from ${min} to ${max}`, "out_of_range");
      return valid(value);
    },
  };
}

/** A read's `limit`: 1 to `max`, defaulting to `fallback`; over the maximum the message names it, never clamps. 03 R5.2, R-C1 */
export function limit(max: number, fallback: number): DefaultedSchema<number> {
  return withDefault(
    {
      parse(value, path) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return invalid(path, "limit: expected an integer of at least 1");
        if (value > max) return invalid(path, `limit is at most ${max}`, "out_of_range");
        return valid(value);
      },
    },
    fallback,
  );
}

export function number(min: number, max: number, label = "Number"): Schema<number> {
  return {
    parse(value, path) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid(path, `${label}: expected a number from ${min} to ${max}`, "out_of_range");
      return valid(value);
    },
  };
}

export function boolean(label = "Boolean"): Schema<boolean> {
  return {
    parse(value, path) {
      return typeof value === "boolean" ? valid(value) : invalid(path, `${label}: expected a boolean`, "invalid_type");
    },
  };
}

export function literal<const T extends readonly (string | number | boolean | null)[]>(values: T, label = "Value"): Schema<T[number]> {
  return {
    parse(value, path) {
      return (values as readonly unknown[]).includes(value) ? valid(value as T[number]) : invalid(path, `${label}: expected one of ${values.map((item) => JSON.stringify(item)).join(", ")}`);
    },
  };
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    parse(value, path) {
      return value === null ? valid(null) : schema.parse(value, path);
    },
  };
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return { isOptional: true, parse: (value, path) => schema.parse(value, path) };
}

/** Optional with a default applied when the key is absent. */
export function withDefault<T>(schema: Schema<T>, fallback: T): DefaultedSchema<T> {
  return {
    isOptional: true,
    hasDefault: true,
    parse(value, path) {
      return value === undefined ? valid(fallback) : schema.parse(value, path);
    },
  };
}

export function array<T>(item: Schema<T>, max: number, label = "List", min = 0): Schema<T[]> {
  return {
    parse(value, path) {
      if (!Array.isArray(value)) return invalid(path, `${label}: expected a list`, "invalid_type");
      if (value.length > max) return invalid(path, `${label}: at most ${max} items`, "too_large");
      if (value.length < min) return invalid(path, `${label}: at least ${min} item${min === 1 ? "" : "s"}`);
      const out: T[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const parsed = item.parse(value[index], `${path}[${index}]`);
        if (!parsed.ok) return issues(parsed.issues);
        out.push(parsed.value);
      }
      return valid(out);
    },
  };
}

/** An object of `key → value` with keys of one shape. */
export function map<T>(item: Schema<T>, options: { max: number; keyPattern?: RegExp; label?: string }): Schema<Record<string, T>> {
  const label = options.label ?? "Map";
  return {
    parse(value, path) {
      if (!isJsonObject(value)) return invalid(path, `${label}: expected an object`, "invalid_type");
      const keys = Object.keys(value);
      if (keys.length > options.max) return invalid(path, `${label}: at most ${options.max} entries`, "too_large");
      const out: Record<string, T> = {};
      for (const key of keys) {
        if (options.keyPattern && !options.keyPattern.test(key)) return invalid(pathForKey(path, key), `${label}: invalid key`);
        const parsed = item.parse(value[key], pathForKey(path, key));
        if (!parsed.ok) return issues(parsed.issues);
        out[key] = parsed.value;
      }
      return valid(out);
    },
  };
}

export function object<S extends Shape>(shape: S, label = "Object"): Schema<InferShape<S>> {
  const keys = Object.keys(shape);
  const known = new Set(keys);
  return {
    parse(value, path) {
      if (!isJsonObject(value)) return invalid(path, `${label}: expected an object`, "invalid_type");
      for (const key of Object.keys(value)) {
        if (!known.has(key)) return invalid(pathForKey(path, key), "Unknown key", "unknown_key");
      }
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const schema = shape[key] as Schema<unknown> & { isOptional?: boolean };
        const present = Object.prototype.hasOwnProperty.call(value, key);
        if (!present) {
          if (schema.isOptional) {
            const parsed = schema.parse(undefined, pathForKey(path, key));
            if (parsed.ok && parsed.value !== undefined) out[key] = parsed.value;
            continue;
          }
          return invalid(pathForKey(path, key), "Missing required key", "missing_key");
        }
        const parsed = schema.parse(value[key], pathForKey(path, key));
        if (!parsed.ok) return issues(parsed.issues);
        out[key] = parsed.value;
      }
      return valid(out as InferShape<S>);
    },
  };
}

/** `null`, absent, or `{}` all mean "no parameters". */
export function noParams(): Schema<null> {
  return {
    parse(value, path) {
      if (value === undefined || value === null) return valid(null);
      if (isJsonObject(value) && Object.keys(value).length === 0) return valid(null);
      return invalid(path, "This capability takes no parameters", "unknown_key");
    },
  };
}

/** Any strict JSON value within the given limits. */
export function json(limits: JsonLimits = {}, label = "Value"): Schema<JsonValue> {
  return {
    parse(value, path) {
      if (value === undefined) return invalid(path, `${label}: missing`, "missing_key");
      const checked = validateJson(value, limits);
      if (!checked.ok) {
        const first = checked.issues[0];
        return first ? invalid(path === "$" ? first.path : `${path}${first.path.slice(1)}`, first.message, first.code) : checked;
      }
      return checked;
    },
  };
}

export function union<A, B>(first: Schema<A>, second: Schema<B>, label = "Value"): Schema<A | B> {
  return {
    parse(value, path) {
      const a = first.parse(value, path);
      if (a.ok) return a;
      const b = second.parse(value, path);
      if (b.ok) return b;
      return invalid(path, `${label}: did not match any accepted shape`);
    },
  };
}

export function refine<T>(schema: Schema<T>, check: (value: T) => string | null): Schema<T> {
  return {
    parse(value, path) {
      const parsed = schema.parse(value, path);
      if (!parsed.ok) return parsed;
      const problem = check(parsed.value);
      return problem ? invalid(path, problem) : parsed;
    },
  };
}

/** Rewrites one key to another before parsing: `projectId` → `workspaceId`; both present is refused. 03 §Renames (U34) */
export function renamingKey<T>(schema: Schema<T>, from: string, to: string): Schema<T> {
  return {
    parse(value, path) {
      if (isJsonObject(value) && Object.prototype.hasOwnProperty.call(value, from)) {
        if (Object.prototype.hasOwnProperty.call(value, to)) return invalid(pathForKey(path, from), `Give ${to} or ${from}, not both`);
        const { [from]: renamed, ...rest } = value;
        return schema.parse({ ...rest, [to]: renamed } as JsonValue, path);
      }
      return schema.parse(value, path);
    },
  };
}
