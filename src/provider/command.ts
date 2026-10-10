// The role registry `src/cli.ts` dispatches into (DESIGN §B.6, R-P15).
import type { ProviderHost } from "../../core/src/host/index.ts";

export type CommandHandler = Parameters<ProviderHost["command"]["register"]>[1];

export interface BbCommand {
  command: ProviderHost["command"];
  handlers: ReadonlyMap<string, CommandHandler>;
}

export function createBbCommand(): BbCommand {
  const handlers = new Map<string, CommandHandler>();
  return { command: { register: (role, handler) => void handlers.set(role, handler) }, handlers };
}
