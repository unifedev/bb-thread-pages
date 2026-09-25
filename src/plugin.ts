import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { registerCli } from "./agent/cli.ts";
import { buildGuide } from "./agent/guide.ts";
import { createBbHost } from "./bb/bb-host.ts";
import { bbSessionUrl } from "./bb/host-urls.ts";
import { defineSettings } from "./config/settings.ts";
import { capabilityRegistry } from "./domain/capabilities/index.ts";
import { createRateLimiter } from "./domain/rate-limit.ts";
import { createOutcomeMemory } from "./domain/submissions/idempotency.ts";
import type { SessionHost } from "./host/contract.ts";
import { createAssembler } from "./pages/assemble.ts";
import { createPageStore } from "./pages/page-store.ts";
import { createCoreStorageSite, type SiteStrategy } from "./pages/site.ts";
import { createHeldAttachments } from "./serving/attach-route.ts";
import { createSelectionStore } from "./serving/bridge/selection-store.ts";
import { createContributions, instructionFragments } from "./serving/contributions.ts";
import { createGrantStore } from "./serving/grants.ts";
import type { ServingContext } from "./serving/context.ts";
import { registerRoutes } from "./serving/routes.ts";
import { loadSigningKey } from "./serving/signing-key.ts";
import { createVoiceAvailability } from "./serving/voice.ts";

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

  const now = options.now ?? (() => Date.now());
  const contributions = createContributions(host.contributors, host.log, now);
  const serving: ServingContext = {
    host,
    contributions,
    // Every document goes through one pipeline: parts in, then own files carried. spec R5.56
    pages: createPageStore(host, createAssembler(host)),
    settings,
    signingKey,
    site,
    routeBase,
    registry: capabilityRegistry,
    rate: createRateLimiter(),
    submissions: createOutcomeMemory(),
    replies: createOutcomeMemory(),
    selections: createSelectionStore(),
    grants: createGrantStore(host),
    voice: createVoiceAvailability(host, now),
    attachments: createHeldAttachments(),
    hostSessionUrl: bbSessionUrl,
    now,
  };

  // The standing instruction, followed by each contributor's fragment so the
  // agent reads one instruction. Fragments ride only with the instruction;
  // bb builds instructions synchronously, so they come from the last set read.
  // spec R6.29, D27
  const effectiveInstruction = (): string | null => {
    const current = settings.current();
    if (!current.agentInstructions || !current.agentInstructionText.trim()) return null;
    const fragments = instructionFragments(contributions.cached());
    return fragments ? `${current.agentInstructionText}\n\n${fragments}` : current.agentInstructionText;
  };
  // Read the contributors once at start, so the first session gets their fragments.
  void contributions.current();

  // The standing instruction: only eligible sessions, only when enabled.
  // Visibility is not known here, so `init` rechecks eligibility at call time. spec R6.14
  bb.agents.configure((context) => {
    const instruction = effectiveInstruction();
    const root = context.thread.parentThreadId === null && context.thread.sourceThreadId === null && context.origin.kind === null;
    return instruction && root ? { tools: [], skills: [], instructions: instruction } : { tools: [], skills: [] };
  });

  registerRoutes(bb, serving);
  registerCli(bb, {
    serving,
    guide: async () => buildGuide(capabilityRegistry, site, (await contributions.current()).contributors),
    effectiveInstruction,
  });
  return serving;
}
