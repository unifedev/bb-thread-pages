import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createPlugin } from "./src/plugin.ts";

/** Thread Pages: every session gets one page it writes itself. */
export default async function threadPagesPlugin(bb: BbPluginApi): Promise<void> {
  await createPlugin(bb);
}
