import { isMethodName } from "../ids.ts";
import { CONFIRMED_EFFECTS, EFFECT_CLASSES, type AnyCapabilitySpec, type CapabilityDescriptor } from "./contract.ts";

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
    if ((spec.effect === "read" || spec.effect === "own-session-write") && spec.confirmed) {
      throw new TypeError(`${spec.method} is a ${spec.effect} and must not be confirmed`);
    }
    if (typeof spec.description !== "string" || spec.description.trim().length === 0 || spec.description.length > 240) {
      throw new TypeError(`Invalid description for ${spec.method}`);
    }
    byMethod.set(spec.method, Object.freeze({ ...spec }));
  }
  const list = Object.freeze([...byMethod.values()]);
  const descriptors = Object.freeze(
    list
      .filter((spec) => spec.implemented)
      .map((spec): CapabilityDescriptor => ({
        method: spec.method,
        effect: spec.effect,
        confirmation: spec.confirmed ? "required" : "none",
      })),
  );
  return Object.freeze({
    get: (method: string) => byMethod.get(method),
    list: () => list,
    descriptors: () => descriptors,
  });
}
