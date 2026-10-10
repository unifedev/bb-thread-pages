import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createPlugin } from "./src/plugin.ts";

/** Unife Pages for bb: every session gets one page it writes itself. */
export default async function bbPagesPlugin(bb: BbPluginApi): Promise<void> {
  await createPlugin(bb);
}
