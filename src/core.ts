// The one indirection onto `@unifedev/pages-core`'s server API (bb-pages DESIGN §A "What the core is assumed
// to export"): everything the composition root takes from the core comes through here, so the tests can
// inject a stand-in through `createPlugin(bb, { mount })` and nothing else in this package names the core's
// mount. The types are the core's own (`src/serving/mount.ts`, `src/agent/commands.ts`).
export { mountPages } from "../core/src/index.ts";
export type { CommandHandler, CommandRole, MountOptions, PagesServer, PagesSettings } from "../core/src/index.ts";
import type { mountPages as corePages } from "../core/src/index.ts";

export type MountPages = typeof corePages;
