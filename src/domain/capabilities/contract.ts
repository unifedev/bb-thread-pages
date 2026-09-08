import type { JsonValue, Validation } from "../json/strict-json.ts";

/**
 * What every capability declares. spec R5.1
 *
 * A spec is pure: it names the capability, classes its effect, and validates
 * its parameters and its result. Execution and confirmation wording live in
 * the server-side handler, which is the only place with host access.
 */
export const EFFECT_CLASSES = ["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device"] as const;
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
}

export type AnyCapabilitySpec = CapabilitySpec<any, any>;

/** What `context.get` reports about one capability. spec R5.9 */
export interface CapabilityDescriptor {
  readonly method: string;
  readonly effect: EffectClass;
  readonly confirmation: "none" | "required";
}
