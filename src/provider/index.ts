// createBbProvider(bb, deps): ProviderHost over the bb SDK (DESIGN §B), plus what the composition root needs
// beside the contract: the role registry the CLI dispatches into and the per-session memo eviction.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ProviderHost } from "../../core/src/host/index.ts";
import { createAttachmentStore, createBbAttachments } from "./attachments.ts";
import { createBbCommand, type CommandHandler } from "./command.ts";
import { createBbContributors } from "./contributors.ts";
import { createBbFiles } from "./files.ts";
import { createBbInstruction } from "./instruction.ts";
import { createBbKv } from "./kv.ts";
import { createBbProviders } from "./providers.ts";
import { createBbSessions, createStorageLocator } from "./sessions.ts";
import { createBbVoice } from "./voice.ts";
import { createBbWorkspaces } from "./workspaces.ts";

export interface BbProviderDeps {
  instructionEnabled(): boolean;
  now?: () => number;
}

export interface BbProvider {
  provider: ProviderHost;
  handlers: ReadonlyMap<string, CommandHandler>;
  /** `thread.deleted`: drop what this adapter memoised for the session. */
  forget(session: string): void;
}

export function createBbProvider(bb: BbPluginApi, deps: BbProviderDeps): BbProvider {
  const locator = createStorageLocator(bb);
  const attachments = createAttachmentStore(deps.now ? { now: deps.now } : {});
  const command = createBbCommand();
  const instruction = createBbInstruction(bb, { enabled: deps.instructionEnabled, log: bb.log });
  const provider: ProviderHost = {
    sessions: createBbSessions(bb, { locator, attachments }),
    workspaces: createBbWorkspaces(bb),
    kv: createBbKv(bb),
    files: createBbFiles(bb, locator.locate, deps.now),
    instruction: instruction.instruction,
    command: command.command,
    log: bb.log,
    providers: createBbProviders(bb),
    contributors: createBbContributors(bb, { log: bb.log }),
    voice: createBbVoice(bb),
    attachments: createBbAttachments(bb, attachments),
  };
  return { provider, handlers: command.handlers, forget: (session) => locator.evict(session) };
}
