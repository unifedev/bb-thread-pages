// The `./runtime` export: the shared kernel↔shell protocol, the HTTP envelopes, the draft and scroll types (slice 1), and the two bundle constants a host that reimplements serving embeds (slice 3; DESIGN §A).
export * from "./shared/protocol.ts";
export * from "./shared/envelopes.ts";
export * from "./shared/drafts.ts";
export * from "./shared/scroll-state.ts";
export { KERNEL_RUNTIME, SHELL_RUNTIME, BUILTIN_HOME_HTML } from "../generated/index.ts";
