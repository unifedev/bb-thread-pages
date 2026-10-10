// `EffectClass`, `CapabilitySpec`, `CapabilityDescriptor`, `CONFIRMED_EFFECTS`.
import type { JsonValue, Validation } from "../json/strict-json.ts";

/**
 * The effect classes of 03 §Effect classes and confirmation. `reader-state`
 * changes only the reader's marks (R5.7a); `contributed-write` is a
 * contributor's own state, never confirmed by the host (R5.7b);
 * `granted-write` is confirmed once per session pair (R5.7c).
 */
export const EFFECT_CLASSES = ["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device", "reader-state", "contributed-write", "granted-write"] as const;
export type EffectClass = (typeof EFFECT_CLASSES)[number];

/** Effects that must be confirmed in trusted chrome per call. 03 R5.7 */
export const CONFIRMED_EFFECTS: ReadonlySet<EffectClass> = new Set(["cross-session-write", "destructive", "device"]);

/** Effects that never see a per-call confirmation. 03 R5.7a, R5.7b */
export const UNCONFIRMED_EFFECTS: ReadonlySet<EffectClass> = new Set(["read", "own-session-write", "reader-state", "contributed-write"]);

/** The methods that may declare `granted-write`. 03 R5.7c */
export const GRANTED_METHODS: ReadonlySet<string> = new Set(["pages.answer", "sessions.respond"]);

/** The methods whose per-call confirmation applies to the `decision` form only. 03 R-C7 */
export const DECISION_METHODS: ReadonlySet<string> = new Set(["session.respond", "sessions.respond"]);

export interface CapabilityDoc {
  /** One paragraph on the parameters, for the guide. 04 R6.24 */
  readonly params: string;
  /** One paragraph on the result, for the guide. */
  readonly result: string;
  /** Anything an author must know: refusals, defaults, confirmation wording. */
  readonly notes?: string;
}

/** Who contributed a capability, for capabilities the host did not define. 03 R5.9a */
export interface ContributorRef {
  readonly id: string;
  readonly version: string;
}

/**
 * What every capability declares: a fixed name, a parameter validator, a
 * result validator, an effect class and a confirmation requirement. A spec
 * is pure; execution and summary wording live in the server's handler.
 * spec 03 R5.1
 */
/** The tiers of 03 and 08: core on every host; the rest where the provider's members allow. 03 §Core, §Optional; DESIGN §B.9 */
export type CapabilityTier = "core" | "composition" | "voice" | "respond" | "extras";

/** The optional provider members that enable an optional capability. 06 §Optional; DESIGN §E.2 */
export type ProviderMember = "respond" | "usage" | "archive" | "markRead" | "openHost" | "providers" | "browse";

export interface CapabilitySpec<Params = unknown, Result = unknown> {
  readonly method: string;
  readonly description: string;
  readonly effect: EffectClass;
  readonly tier: CapabilityTier;
  /** Provider members that enable it; absent means always enabled. 06 §Optional; DESIGN §E.2 */
  readonly requires?: readonly ProviderMember[];
  /** Confirmed per call with a signed challenge. 03 R5.7, R5.8 */
  readonly confirmed: boolean;
  /**
   * On `session.respond` and `sessions.respond` only: the per-call
   * confirmation applies to a `decision` payload; `answers` is unconfirmed on
   * the own session and under the pair grant on another. 03 R-C7
   */
  readonly confirmedFor?: "decision";
  /** `false` means the contract exists but the host does not implement it: `unknown_method`. 03 R5.6 */
  readonly implemented: boolean;
  readonly validateParams: (value: JsonValue | undefined) => Validation<Params>;
  readonly validateResult: (value: unknown) => Validation<Result>;
  readonly doc: CapabilityDoc;
  /** Request and response bounds, serialised; built-ins use the capability payload limit unless stated. 03 §Limits, 07 R5.47 */
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  /** Set only on contributed capabilities. 07 R5.42–R5.55 */
  readonly contributor?: ContributorRef;
  /** Error reasons a contributed method declares, each with its detail validator (null: no detail). 03 R5.41b */
  readonly reasons?: ReadonlyMap<string, ((value: unknown) => Validation<JsonValue>) | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCapabilitySpec = CapabilitySpec<any, any>;

/** What `context.get` reports about one capability. 03 R5.9, R5.9a */
export interface CapabilityDescriptor {
  readonly method: string;
  readonly effect: EffectClass;
  /** `grant`: asked once per pair, then remembered. 03 R5.7c */
  readonly confirmation: "none" | "required" | "grant";
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  /** Contributed capabilities only. 03 R5.9a */
  readonly contributor?: ContributorRef;
  readonly description?: string;
  readonly reasons?: readonly string[];
}

/** The roster value a spec reports. 03 §`context.get` */
export function confirmationOf(spec: Pick<AnyCapabilitySpec, "effect" | "confirmed">): CapabilityDescriptor["confirmation"] {
  if (spec.effect === "granted-write") return "grant";
  return spec.confirmed ? "required" : "none";
}
