// `createRegistry(specs, options)`: invariants (confirmed where the class demands), `descriptors()` = roster (03 R5.9); which specs are enabled is the host's.
import { isMethodName } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { CONFIRMED_EFFECTS, DECISION_METHODS, EFFECT_CLASSES, GRANTED_METHODS, UNCONFIRMED_EFFECTS, confirmationOf, type AnyCapabilitySpec, type CapabilityDescriptor } from "./contract.ts";

/** What `context.get` reports about one capability. 03 R5.9, R5.9a */
export function describe(spec: AnyCapabilitySpec): CapabilityDescriptor {
  return {
    method: spec.method,
    effect: spec.effect,
    confirmation: confirmationOf(spec),
    maxRequestBytes: spec.maxRequestBytes ?? LIMITS.capabilityPayloadBytes,
    maxResponseBytes: spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes,
    ...(spec.contributor ? { contributor: spec.contributor, description: spec.description, reasons: [...(spec.reasons?.keys() ?? [])] } : {}),
  };
}

/** Anything a capability can be looked up in: the built-in registry, or it and the contributed set together. */
export interface CapabilityLookup {
  get(method: string): AnyCapabilitySpec | undefined;
}

export interface CapabilityRegistry extends CapabilityLookup {
  /** The enabled spec, or undefined for an unknown or disabled method. 03 R5.6 */
  get(method: string): AnyCapabilitySpec | undefined;
  /** Every enabled spec. */
  list(): readonly AnyCapabilitySpec[];
  /** Every spec given, enabled or not: for the guide's "absent on this host" list. 04 R6.24 */
  defined(): readonly AnyCapabilitySpec[];
  /** The roster a page may discover: enabled, implemented capabilities only. 03 R5.9 */
  descriptors(): readonly CapabilityDescriptor[];
  /** Every enabled method with effect `read`, for the shell's pre-show relay (DR-12). */
  readMethods(): readonly string[];
  isEnabled(method: string): boolean;
}

/** Throws when a spec breaks an invariant no capability may break. 03 R5.1, R5.7–R5.7c */
export function checkSpec(spec: AnyCapabilitySpec): void {
  if (!isMethodName(spec.method)) throw new TypeError(`Invalid capability name: ${spec.method}`);
  if (!EFFECT_CLASSES.includes(spec.effect)) throw new TypeError(`Invalid effect for ${spec.method}`);
  if (CONFIRMED_EFFECTS.has(spec.effect) && !spec.confirmed) throw new TypeError(`${spec.method} has a ${spec.effect} effect and must be confirmed`);
  if (UNCONFIRMED_EFFECTS.has(spec.effect) && spec.confirmed) throw new TypeError(`${spec.method} is a ${spec.effect} and must not be confirmed`);
  if (spec.effect === "contributed-write" && !spec.contributor) throw new TypeError(`${spec.method}: only a contributed capability may declare contributed-write`);
  if (spec.contributor && spec.effect !== "read" && spec.effect !== "contributed-write") throw new TypeError(`${spec.method}: a contributed capability declares read or contributed-write`);
  // The grant is asked for by the dispatcher, once per pair; a dialog per call would contradict the class. 03 R5.7c
  if (spec.effect === "granted-write" && (spec.confirmed || !GRANTED_METHODS.has(spec.method))) throw new TypeError(`${spec.method}: granted-write belongs to pages.answer and sessions.respond alone, and is not confirmed per call`);
  if (spec.confirmedFor !== undefined && !DECISION_METHODS.has(spec.method)) throw new TypeError(`${spec.method}: only the respond methods confirm one form of their payload`);
  if (typeof spec.description !== "string" || spec.description.trim().length === 0 || spec.description.length > LIMITS.methodDescriptionChars) throw new TypeError(`Invalid description for ${spec.method}`);
  const request = spec.maxRequestBytes ?? LIMITS.capabilityPayloadBytes;
  const response = spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes;
  if (!Number.isSafeInteger(request) || request < 1 || !Number.isSafeInteger(response) || response < 1) throw new TypeError(`Invalid bounds for ${spec.method}`);
}

/**
 * Builds a registry: unique, well-formed names; a known effect class;
 * confirmation exactly where the effect class demands it (navigation may go
 * either way). `enabled` says which of the specs this host backs; the rest
 * are defined but answer `unknown_method` and are absent from the roster.
 * spec 03 R5.6–R5.9; DESIGN §E.2
 */
export function createRegistry(specs: readonly AnyCapabilitySpec[], enabled: (spec: AnyCapabilitySpec) => boolean = () => true): CapabilityRegistry {
  const defined = new Map<string, AnyCapabilitySpec>();
  const enabledSpecs = new Map<string, AnyCapabilitySpec>();
  for (const spec of specs) {
    checkSpec(spec);
    if (defined.has(spec.method)) throw new TypeError(`Duplicate capability: ${spec.method}`);
    const frozen = Object.freeze({ ...spec });
    defined.set(spec.method, frozen);
    if (enabled(frozen)) enabledSpecs.set(spec.method, frozen);
  }
  const list = Object.freeze([...enabledSpecs.values()]);
  const all = Object.freeze([...defined.values()]);
  const descriptors = Object.freeze(list.filter((spec) => spec.implemented).map(describe));
  const readMethods = Object.freeze(list.filter((spec) => spec.implemented && spec.effect === "read").map((spec) => spec.method));
  return Object.freeze({
    get: (method: string) => enabledSpecs.get(method),
    list: () => list,
    defined: () => all,
    descriptors: () => descriptors,
    readMethods: () => readMethods,
    isEnabled: (method: string) => enabledSpecs.has(method),
  });
}
