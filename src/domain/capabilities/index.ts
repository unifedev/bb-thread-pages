import { createRegistry } from "./registry.ts";
import { ALL_CAPABILITIES } from "./specs.ts";

export * from "./contract.ts";
export * from "./protocol.ts";
export * from "./registry.ts";
export * from "./specs.ts";

/** The registry the host serves: every spec, with `implemented` deciding the roster. */
export const capabilityRegistry = createRegistry(ALL_CAPABILITIES);
