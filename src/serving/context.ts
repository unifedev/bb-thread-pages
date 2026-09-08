import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import type { RateLimiter } from "../domain/rate-limit.ts";
import type { OutcomeMemory } from "../domain/submissions/idempotency.ts";
import type { LiveSettings } from "../config/settings.ts";
import type { SessionHost } from "../host/contract.ts";
import type { PageStore } from "../pages/page-store.ts";
import type { SiteStrategy } from "../pages/site.ts";
import type { SelectionStore } from "./bridge/selection-store.ts";

/** Everything a route or handler may need, assembled once by the composition root. */
export interface ServingContext {
  readonly host: SessionHost;
  readonly pages: PageStore;
  readonly settings: LiveSettings;
  readonly signingKey: Uint8Array;
  readonly site: SiteStrategy;
  readonly routeBase: string;
  readonly registry: CapabilityRegistry;
  readonly rate: RateLimiter;
  readonly submissions: OutcomeMemory<{ status: number; body: Record<string, unknown> }>;
  readonly replies: OutcomeMemory<{ delivery: "started" | "queued" | "steered" }>;
  readonly selections: SelectionStore;
  /** The host application's URL for a session's conversation, origin-relative. */
  readonly hostSessionUrl: (session: string) => string;
  readonly now: () => number;
}

export function pageUrl(routeBase: string, session: string): string {
  return `${routeBase}/page?session=${encodeURIComponent(session)}`;
}

export function homeUrl(routeBase: string): string {
  return `${routeBase}/home`;
}
