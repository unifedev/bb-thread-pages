import type { NavigationDirective } from "../../domain/capabilities/protocol.ts";
import type { SessionRecord } from "../../host/types.ts";
import type { LoadedPage } from "../../pages/page-store.ts";
import type { ServingContext } from "../context.ts";

/**
 * A capability's server-side half. `refuse` runs before any confirmation so
 * cheap refusals (own session, not found) never show a dialog; `summarize`
 * words the confirmation from validated parameters; `grant` asks once per
 * pair instead of per call; `execute` acts.
 */
export interface HandlerContext {
  readonly serving: ServingContext;
  readonly session: SessionRecord;
  readonly page: LoadedPage;
  readonly requestId: string;
  /** The origins the reader reached this host at, as the request shows them (its URL and `Origin`). */
  readonly requestOrigins?: readonly string[];
}

export interface HandlerOutcome<R> {
  readonly result: R;
  readonly navigate?: NavigationDirective;
}

/** A grant the reader has not given yet: what to ask, whom it names, and how to remember the answer. spec R5.64 */
export interface GrantRequest {
  readonly summary: string;
  readonly target: { readonly sessionId: string; readonly title: string };
  record(): Promise<void>;
}

export interface CapabilityHandler<P = unknown, R = unknown> {
  readonly method: string;
  refuse?(params: P, context: HandlerContext): Promise<void>;
  summarize?(params: P, context: HandlerContext): Promise<string>;
  /**
   * For a capability confirmed once per pair rather than per call: the grant
   * still needed, or null when it is held or not required. spec R5.64
   */
  grant?(params: P, context: HandlerContext): Promise<GrantRequest | null>;
  execute(params: P, context: HandlerContext): Promise<HandlerOutcome<R>>;
}

export function handler<P, R>(definition: CapabilityHandler<P, R>): CapabilityHandler<P, R> {
  return definition;
}

export function excerpt(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
