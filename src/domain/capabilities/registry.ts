import { isMethodName } from "../ids.ts";
import { LIMITS } from "../limits.ts";
import { CONFIRMED_EFFECTS, EFFECT_CLASSES, type AnyCapabilitySpec, type CapabilityDescriptor } from "./contract.ts";

/** What `context.get` reports about one capability. spec R5.9, R5.9a */
export function describe(spec: AnyCapabilitySpec): CapabilityDescriptor {
  return {
    method: spec.method,
    effect: spec.effect,
    confirmation: spec.effect === "granted-write" ? "grant" : spec.confirmed ? "required" : "none",
    maxRequestBytes: spec.maxRequestBytes ?? LIMITS.capabilityPayloadBytes,
    maxResponseBytes: spec.maxResponseBytes ?? LIMITS.capabilityPayloadBytes,
    ...(spec.contributor
      ? { contributor: spec.contributor, description: spec.description, reasons: [...(spec.reasons?.keys() ?? [])] }
      : {}),
  };
}

/** Anything a capability can be looked up in: the built-in registry, or it and the contributed set together. */
export interface CapabilityLookup {
  get(method: string): AnyCapabilitySpec | undefined;
}

export interface CapabilityRegistry {
  get(method: string): AnyCapabilitySpec | undefined;
  list(): readonly AnyCapabilitySpec[];
  /** The roster a page may discover: implemented capabilities only. spec R5.9 */
  descriptors(): readonly CapabilityDescriptor[];
}

/**
 * Builds a registry and enforces the invariants no capability may break:
 * unique, well-formed names; a known effect class; confirmation exactly where
 * the effect class demands it (navigation may go either way). spec R5.7, R5.8
 */
export function createRegistry(specs: readonly AnyCapabilitySpec[]): CapabilityRegistry {
  const byMethod = new Map<string, AnyCapabilitySpec>();
  for (const spec of specs) {
    if (!isMethodName(spec.method)) throw new TypeError(`Invalid capability name: ${spec.method}`);
    if (byMethod.has(spec.method)) throw new TypeError(`Duplicate capability: ${spec.method}`);
    if (!EFFECT_CLASSES.includes(spec.effect)) throw new TypeError(`Invalid effect for ${spec.method}`);
    if (CONFIRMED_EFFECTS.has(spec.effect) && !spec.confirmed) {
      throw new TypeError(`${spec.method} has a ${spec.effect} effect and must be confirmed`);
    }
    if (spec.effect === "contributed-write" && !spec.contributor) {
      throw new TypeError(`${spec.method}: only a contributed capability may declare contributed-write`);
    }
    // The grant is asked for by the dispatcher, once per pair; a dialog per call would contradict the class. spec R5.7c
    if (spec.effect === "granted-write" && (spec.confirmed || spec.method !== "pages.answer")) {
      throw new TypeError(`${spec.method}: granted-write is pages.answer's alone, and is not confirmed per call`);
    }
    if ((spec.effect === "read" || spec.effect === "own-session-write" || spec.effect === "reader-state" || spec.effect === "contributed-write") && spec.confirmed) {
      throw new TypeError(`${spec.method} is a ${spec.effect} and must not be confirmed`);
    }
    if (typeof spec.description !== "string" || spec.description.trim().length === 0 || spec.description.length > 240) {
      throw new TypeError(`Invalid description for ${spec.method}`);
    }
    byMethod.set(spec.method, Object.freeze({ ...spec }));
  }
  const list = Object.freeze([...byMethod.values()]);
  const descriptors = Object.freeze(
    list.filter((spec) => spec.implemented).map(describe),
  );
  return Object.freeze({
    get: (method: string) => byMethod.get(method),
    list: () => list,
    descriptors: () => descriptors,
  });
}
