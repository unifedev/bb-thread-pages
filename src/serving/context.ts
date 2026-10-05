import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import type { PageBudget } from "../domain/rate-limit.ts";
import type { OutcomeMemory } from "../domain/submissions/idempotency.ts";
import type { LiveSettings } from "../config/settings.ts";
import type { SessionHost } from "../host/contract.ts";
import type { SessionRecord } from "../host/types.ts";
import type { PageStore } from "../pages/page-store.ts";
import type { SiteStrategy } from "../pages/site.ts";
import type { HeldAttachments } from "./attach-route.ts";
import type { SelectionStore } from "./bridge/selection-store.ts";
import type { Contributions } from "./contributions.ts";
import type { GrantStore } from "./grants.ts";
import type { VoiceAvailability } from "./voice.ts";

/** Everything a route or handler may need, assembled once by the composition root. */
export interface ServingContext {
  readonly host: SessionHost;
  readonly pages: PageStore;
  readonly settings: LiveSettings;
  readonly signingKey: Uint8Array;
  readonly site: SiteStrategy;
  readonly routeBase: string;
  readonly registry: CapabilityRegistry;
  /** Capabilities other extensions contribute. spec 05 §Contributed capabilities */
  readonly contributions: Contributions;
  readonly rate: PageBudget;
  readonly submissions: OutcomeMemory<{ status: number; body: Record<string, unknown> }>;
  readonly replies: OutcomeMemory<{ delivery: "started" | "queued" | "steered" }>;
  readonly selections: SelectionStore;
  /** Grants to answer other sessions from an embed. spec R5.64 */
  readonly grants: GrantStore;
  /** Whether the host can transcribe voice now. spec R5.69, R8.35 */
  readonly voice: VoiceAvailability;
  /** Attachments stored for approved calls, until the call arrives. spec R3.20a, R5.76 */
  readonly attachments: HeldAttachments;
  /** The host application's canonical URL for a session's conversation, origin-relative. spec R5.31a */
  readonly hostSessionUrl: (session: Pick<SessionRecord, "id" | "projectId">) => string;
  readonly now: () => number;
}

/** A page's shell URL; `path` opens a document other than the entry document. spec R1.12d */
export function pageUrl(routeBase: string, session: string, path?: string | null): string {
  const base = `${routeBase}/page?session=${encodeURIComponent(session)}`;
  return path ? `${base}&path=${encodeURIComponent(path)}` : base;
}

export function homeUrl(routeBase: string): string {
  return `${routeBase}/home`;
}
