// The composition root: settings → kv sweep → provider → serving → core → CLI (DESIGN §A). The only file that
// imports everything.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { registerCli } from "./cli.ts";
import { mountPages, type MountPages, type PagesServer } from "./core.ts";
import { sweepForeignKv } from "./migrate.ts";
import { createBbProvider, type BbProvider } from "./provider/index.ts";
import { createBbServingHost } from "./serving/index.ts";
import { defineSettings, type LiveSettings } from "./settings.ts";

/** The host's spelling of the five command roles (04 §Command roles; DESIGN §B.6, DR-23): `bb pages <role>`. */
export const COMMANDS = { init: "bb pages init", guide: "bb pages guide", status: "bb pages status", home: "bb pages home", grants: "bb pages grants" } as const;

export interface PluginOptions {
  /** The core's `mountPages` (tests inject a fake). */
  mount?: MountPages;
  now?: () => number;
}

export interface Plugin {
  server: PagesServer;
  provider: BbProvider;
  settings: LiveSettings;
}

export async function createPlugin(bb: BbPluginApi, options: PluginOptions = {}): Promise<Plugin> {
  const settings = await defineSettings(bb);
  await sweepForeignKv(bb, bb.log, options.now); // 1.9 → 1.10: the old plugin's rows go before the core opens its stores (DESIGN §E)
  const provider = createBbProvider(bb, {
    instructionEnabled: () => settings.current().agentInstructions,
    ...(options.now ? { now: options.now } : {}),
  });
  const serving = createBbServingHost(bb);
  const server = await (options.mount ?? mountPages)(serving, provider.provider, {
    settings: () => settings.pages(),
    commands: { ...COMMANDS },
    routeStrategy: "exact",
    ...(options.now ? { now: options.now } : {}),
  });
  registerCli(bb, { handlers: provider.handlers, log: bb.log });
  settings.onChange(() => {
    server.reinject().catch((error: unknown) => bb.log.warn(`instruction: reinject failed: ${error instanceof Error ? error.message : String(error)}`));
  });
  bb.events.on("thread.deleted", async ({ thread }) => {
    provider.forget(thread.id);
    await server.forgetSession(thread.id); // DR-8: storage, grants, offline copy go with the session
  });
  bb.onDispose(() => server.close());
  return { server, provider, settings };
}
