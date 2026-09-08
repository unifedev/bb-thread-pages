import type { NavigationDirective } from "../../domain/capabilities/protocol.ts";
import type { SessionRecord } from "../../host/types.ts";
import type { LoadedPage } from "../../pages/page-store.ts";
import type { ServingContext } from "../context.ts";

/**
 * A capability's server-side half. `refuse` runs before any confirmation so
 * cheap refusals (own session, not found) never show a dialog; `summarize`
 * words the confirmation from validated parameters; `execute` acts.
 */
export interface HandlerContext {
  readonly serving: ServingContext;
  readonly session: SessionRecord;
  readonly page: LoadedPage;
  readonly requestId: string;
}

export interface HandlerOutcome<R> {
  readonly result: R;
  readonly navigate?: NavigationDirective;
}

export interface CapabilityHandler<P = unknown, R = unknown> {
  readonly method: string;
  refuse?(params: P, context: HandlerContext): Promise<void>;
  summarize?(params: P, context: HandlerContext): Promise<string>;
  execute(params: P, context: HandlerContext): Promise<HandlerOutcome<R>>;
}

export function handler<P, R>(definition: CapabilityHandler<P, R>): CapabilityHandler<P, R> {
  return definition;
}

export function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
