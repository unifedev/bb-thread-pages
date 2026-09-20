import type { JsonValue, Validation } from "../json/strict-json.ts";

/**
 * What every capability declares. spec R5.1
 *
 * A spec is pure: it names the capability, classes its effect, and validates
 * its parameters and its result. Execution and confirmation wording live in
 * the server-side handler, which is the only place with host access.
 */
/**
 * `reader-state` changes only what the reader sees about a session — its
 * read mark — never the session's work; it is not confirmed. spec R5.7a
 */
/**
 * `contributed-write` changes state a contributor holds, outside the host's
 * sessions; only contributed capabilities declare it, and it is never
 * confirmed. spec R5.7b, DECISIONS D19
 */
/**
 * `granted-write` delivers the reader's answer to the session whose page this
 * page embeds. It is confirmed once per pair — a durable, revocable grant —
 * not per call; only `pages.answer` declares it. spec R5.7c, DECISIONS D31
 */
export const EFFECT_CLASSES = ["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device", "reader-state", "contributed-write", "granted-write"] as const;
export type EffectClass = (typeof EFFECT_CLASSES)[number];

/** Effects that must be confirmed in trusted chrome. spec R5.7 */
export const CONFIRMED_EFFECTS: ReadonlySet<EffectClass> = new Set(["cross-session-write", "destructive", "device"]);

export interface CapabilityDoc {
  /** One paragraph on the parameters, for the guide. */
  readonly params: string;
  /** One paragraph on the result, for the guide. */
  readonly result: string;
  /** Anything an author must know: refusals, defaults, confirmation wording. */
  readonly notes?: string;
}

/** Who contributed a capability, for capabilities the host did not define. spec R5.9a */
export interface ContributorRef {
  readonly id: string;
  readonly version: string;
}

export interface CapabilitySpec<Params = unknown, Result = unknown> {
  readonly method: string;
  readonly description: string;
  readonly effect: EffectClass;
  readonly confirmed: boolean;
  /** `false` means the contract exists but the host does not implement it: `unknown_method`. spec R5.6 */
  readonly implemented: boolean;
  readonly validateParams: (value: JsonValue | undefined) => Validation<Params>;
  readonly validateResult: (value: unknown) => Validation<Result>;
  readonly doc: CapabilityDoc;
  /** Request and response bounds, serialised; built-ins use the capability payload limit. spec R5.47 */
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  /** Set only on contributed capabilities. spec R5.42–R5.55 */
  readonly contributor?: ContributorRef;
  /** Error reasons a contributed method declares, each with its detail validator (null: no detail). spec R5.41b */
  readonly reasons?: ReadonlyMap<string, ((value: unknown) => Validation<JsonValue>) | null>;
}

export type AnyCapabilitySpec = CapabilitySpec<any, any>;

/** What `context.get` reports about one capability. spec R5.9 */
export interface CapabilityDescriptor {
  readonly method: string;
  readonly effect: EffectClass;
  /** `grant`: asked once per pair, then remembered. spec R5.7c */
  readonly confirmation: "none" | "required" | "grant";
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  /** Contributed capabilities only. spec R5.9a */
  readonly contributor?: ContributorRef;
  readonly description?: string;
  readonly reasons?: readonly string[];
}
