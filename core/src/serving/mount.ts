// `mountPages(serving, provider, options)`: builds `ServingContext`, the `RouteTable`, registers command roles, injects the instruction, returns `PagesServer` (05 §The serving host interface; 06 R-P14, R-P15; DESIGN §B.1, §E.2).
import { randomBytes } from "node:crypto";
import { createRegistry } from "../domain/capabilities/registry.ts";
import { ALL_CAPABILITIES } from "../domain/capabilities/specs.ts";
import type { CapabilityDescriptor } from "../domain/capabilities/contract.ts";
import { errorText } from "../domain/errors.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";
import { LIMITS, type Limits } from "../domain/limits.ts";
import { createPageBudget } from "../domain/rate-limit.ts";
import { EMPTY_REVISION } from "../domain/revision.ts";
import { createOutcomeMemory } from "../domain/submissions/idempotency.ts";
import { workspaceIdFor } from "../domain/tokens/workspace-id.ts";
import type { Placement, ProviderHost } from "../host/provider.ts";
import type { RouteTable, ServingHost } from "../host/serving.ts";
import { createPageStore } from "../pages/page-store.ts";
import { createSiteStrategy, type RouteStrategy } from "../pages/site.ts";
import { createCommands, type CommandHandler, type CommandRole } from "../agent/commands.ts";
import { createInjector, type CommandSpellings } from "../agent/instruction.ts";
import { createMemoryAttachGrants, createMemoryCooldowns, createMemoryLedger, createMemorySelections } from "../testing/memory-stores.ts";
import { createDispatcher } from "./bridge/dispatcher.ts";
import type { PagesSettings, ServingContext } from "./context.ts";
import { createContributions } from "./contributions.ts";
import { createGrantStore } from "./grants.ts";
import { createRedeemedStore } from "./redeemed-store.ts";
import { createStorageStore } from "./storage-store.ts";
import { createHomeDesignation } from "./home-designation.ts";
import { createRoutes } from "./routes.ts";
import { loadUnlessUnwritten, createSessionAccess, homePage } from "./session-access.ts";
import { loadSigningKey } from "./signing-key.ts";
import type { HomeDesignation } from "./stores.d.ts";

export type { PagesSettings };

export interface MountOptions {
  /** Live settings; read on every use, never cached. 04 R6.15 */
  settings(): PagesSettings;
  /** The host's spelling of the five command roles; `init` and `guide` fill `{init}` and `{guide}` in the instruction. 04 §Command roles, §The text */
  commands: CommandSpellings;
  /** Route strategy (05 R-S10). Default: "prefix" when `serving.files` is present, else "exact". DESIGN P2 */
  routeStrategy?: RouteStrategy;
  /** The host's product name for the shell's labels; absent → "Open in the host". DR-34 */
  /** Injectable clock, for tests. */
  now?: () => number;
  /** Random bytes, for tests. */
  random?: (bytes: number) => Uint8Array;
}

export interface PagesServer {
  readonly routes: RouteTable;
  readonly limits: Limits;
  /** The command roles, callable directly by a host that routes a CLI to them. 06 R-P15 */
  readonly commands: Record<CommandRole, CommandHandler>;
  /** The registry roster as a page would see it on a session page. 03 R5.9 */
  roster(): CapabilityDescriptor[];
  /** Re-run instruction injection after a settings change. DR-33 */
  reinject(): Promise<Placement[]>;
  /** The home designation, kept in the server's `kv`. 05 R-S12; DR-3 */
  readonly home: HomeDesignation;
  /** The host calls this when a session is deleted: every store drops that identity's share. 06 R-P11; DR-8 */
  forgetSession(sessionId: string): Promise<void>;
  /** The workspace digest of 03 R-C5 under the server's signing key. DR-16 */
  workspaceIdFor(canonicalAbsolutePath: string): string;
  /** Stop timers. Idempotent. */
  close(): Promise<void>;
}

function checkBase(base: string): void {
  if (base === "") return;
  if (!base.startsWith("/") || base.endsWith("/") || /[\s?#]/.test(base)) throw new TypeError(`ServingHost.base() must be "" or start with "/" and not end with "/": got ${JSON.stringify(base)}`);
}

/**
 * Mounts the reference server on a serving host over a provider: the signing
 * key, the registry from the provider's members (§E.2), the stores, the
 * route table for the strategy, the command roles and the standing
 * instruction. Never throws for an absent provider member; throws for a
 * `base()` that breaks R-S9. 05 §The serving host interface; DESIGN §B.1
 */
export async function mountPages(serving: ServingHost, provider: ProviderHost, options: MountOptions): Promise<PagesServer> {
  const base = serving.base();
  checkBase(base);
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? ((bytes: number) => new Uint8Array(randomBytes(bytes)));
  const routeStrategy: RouteStrategy = options.routeStrategy ?? (serving.files ? "prefix" : "exact");
  const strategy = createSiteStrategy(base, serving.files, routeStrategy);
  const signingKey = await loadSigningKey(provider, random);
  const sessions = provider.sessions;
  const members = {
    respond: sessions.respond !== undefined,
    usage: sessions.usage !== undefined,
    archive: sessions.archive !== undefined,
    markRead: sessions.markRead !== undefined,
    openHost: sessions.openHost !== undefined,
    providers: provider.providers !== undefined,
    browse: provider.workspaces.browse !== undefined && provider.workspaces.create !== undefined,
  };
  const registry = createRegistry(ALL_CAPABILITIES, (spec) => (spec.requires ?? []).every((member) => members[member]));
  const pages = createPageStore(provider, { strategy: strategy.kind, now, log: provider.log });
  const home = createHomeDesignation(provider.kv);
  // The four durable stores live in the provider's `kv` (DESIGN §E.9, §E.10, §E.1 step 6, DR-14); the rest is per process.
  const storage = createStorageStore(provider.kv, { log: provider.log, now });
  const grants = createGrantStore(provider.kv, now, provider.log, { sessionExists: async (id) => (await provider.sessions.get(id)) !== null });
  const contributions = createContributions(provider.contributors, { log: provider.log, now });
  const ledger = createMemoryLedger();
  const selections = createMemorySelections(signingKey, random);
  const sessionFor = createSessionAccess(provider);

  const ctx: ServingContext = {
    provider,
    serving,
    settings: options.settings,
    commands: options.commands,
    strategy,
    registry,
    contributions,
    pages,
    storage,
    grants,
    budget: createPageBudget(),
    idempotency: createOutcomeMemory(),
    ledger,
    redeemed: createRedeemedStore(provider.kv, now),
    cooldowns: createMemoryCooldowns(),
    selections,
    attachGrants: createMemoryAttachGrants(),
    home,
    signingKey,
    now,
    random,
    log: provider.log,
    sessionFor,
    async currentRevision(session, path) {
      if (session === HOME_IDENTITY) return homePage().revision;
      if (path === null) return (await loadUnlessUnwritten(pages, session))?.revision ?? EMPTY_REVISION;
      return (await pages.load(session, path)).revision;
    },
  };

  const dispatcher = createDispatcher(ctx);
  const routes = createRoutes(ctx, dispatcher);
  serving.mount(routes);

  // One injector owns the standing instruction: at mount, on a contributor change, on `reinject()`, and `status` prints its report. 04 R6.14–R6.15, R6.31; 06 R-P14
  const injector = createInjector(ctx);
  const commands = createCommands(ctx, { injector });
  for (const [role, handler] of Object.entries(commands) as [CommandRole, CommandHandler][]) provider.command.register(role, handler);

  async function reinject(): Promise<Placement[]> {
    try {
      return [...(await injector.inject()).placements];
    } catch (error) {
      provider.log.warn(`instruction: could not inject: ${errorText(error)}`);
      return [];
    }
  }
  await reinject();
  const stopWatching = contributions.onChange(() => {
    void reinject();
  });

  return {
    routes,
    limits: LIMITS,
    commands,
    roster: () => [...registry.descriptors()],
    reinject,
    home,
    async forgetSession(sessionId) {
      await pages.forget(sessionId);
      await storage.forget(sessionId);
      await grants.forget(sessionId);
      ledger.forget(sessionId);
      selections.forget(sessionId);
    },
    workspaceIdFor: (path) => workspaceIdFor(path, signingKey),
    async close() {
      stopWatching();
    },
  };
}
