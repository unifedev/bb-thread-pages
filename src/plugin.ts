import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { registerCli } from "./agent/cli.ts";
import { buildGuide } from "./agent/guide.ts";
import { createBbHost } from "./bb/bb-host.ts";
import { defineSettings } from "./config/settings.ts";
import { capabilityRegistry } from "./domain/capabilities/index.ts";
import { createRateLimiter } from "./domain/rate-limit.ts";
import { createOutcomeMemory } from "./domain/submissions/idempotency.ts";
import type { SessionHost } from "./host/contract.ts";
import { createPageStore } from "./pages/page-store.ts";
import { createCoreStorageSite, type SiteStrategy } from "./pages/site.ts";
import { createSelectionStore } from "./serving/bridge/selection-store.ts";
import type { ServingContext } from "./serving/context.ts";
import { registerRoutes } from "./serving/routes.ts";
import { loadSigningKey } from "./serving/signing-key.ts";

/**
 * The composition root: the only file that knows every package. Builds the
 * host adapter, the stores and the serving context, then registers routes,
 * the CLI and the agent-instruction hook.
 */
export interface PluginOptions {
  /** Override the host (tests). */
  host?: SessionHost;
  /** Override the site strategy (tests, or a host with prefix routes). */
  site?: (routeBase: string) => SiteStrategy;
  now?: () => number;
}

export async function createPlugin(bb: BbPluginApi, options: PluginOptions = {}): Promise<ServingContext> {
  const settings = await defineSettings(bb);
  const host = options.host ?? createBbHost(bb);
  const signingKey = await loadSigningKey(host);
  const routeBase = `/api/v1/plugins/${bb.pluginId}/http`;
  const site = options.site
    ? options.site(routeBase)
    : createCoreStorageSite(routeBase, (session) => `/api/v1/threads/${encodeURIComponent(session)}/thread-storage/files/`);

  const serving: ServingContext = {
    host,
    pages: createPageStore(host),
    settings,
    signingKey,
    site,
    routeBase,
    registry: capabilityRegistry,
    rate: createRateLimiter(),
    submissions: createOutcomeMemory(),
    replies: createOutcomeMemory(),
    selections: createSelectionStore(),
    hostSessionUrl: (session) => `/threads/${encodeURIComponent(session)}`,
    now: options.now ?? (() => Date.now()),
  };

  const effectiveInstruction = (): string | null => {
    const current = settings.current();
    return current.agentInstructions && current.agentInstructionText.trim() ? current.agentInstructionText : null;
  };

  // The standing instruction: only eligible sessions, only when enabled.
  // Visibility is not known here, so `init` rechecks eligibility at call time. spec R6.14
  bb.agents.configure((context) => {
    const instruction = effectiveInstruction();
    const root = context.thread.parentThreadId === null && context.thread.sourceThreadId === null && context.origin.kind === null;
    return instruction && root ? { tools: [], skills: [], instructions: instruction } : { tools: [], skills: [] };
  });

  registerRoutes(bb, serving);
  registerCli(bb, { serving, guide: buildGuide(capabilityRegistry, site), effectiveInstruction });
  return serving;
}
