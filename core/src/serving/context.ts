// The one shared server type (DESIGN §B.9, §H.1): `ServingContext`, `SessionAccess`, `PagesSettings`, the dispatcher's and handlers' contracts (§E.3). Types only; slice 2 builds the context, slice 4 the dispatcher.
import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import type { NavigationDirective } from "../domain/capabilities/protocol.ts";
import type { SiteStrategy } from "../domain/site-strategy.ts";
import type { Logger, ProviderHost, SessionRecord } from "../host/provider.ts";
import type { PagesRequest, PagesResponse, ServingHost } from "../host/serving.ts";
import type { AttachGrantStore, Contributions, Cooldowns, GrantStore, HomeDesignation, IdempotencyStore, LedgerStore, PageBudget, PageStore, RedeemedStore, SelectionStore, StorageStore } from "./stores.d.ts";

/** Live settings the host supplies; read on every use, never cached. 04 R6.15; DESIGN §B.1 */
export interface PagesSettings {
  /** 04 R6.14–R6.16: default true. */
  instructionEnabled: boolean;
  /** 04 R6.15: the standing instruction's text; null = the built-in text of 04 §The text with `{init}`/`{guide}` filled (A59). (DR-4) */
  instructionText: string | null;
  /** 05 R2.26: the working indicator's words; "" hides it. Default "Working…". */
  workingLabel: string;
  /** 04 R6.20: an operator seed, or null. `{title}` is substituted, escaped. */
  seed: string | null;
  /** 03 R5.66: when false no grant dialog is shown and granted writes are delivered. Default true. */
  embedAnswerGrants: boolean;
  /** 06 §Per host voice: the reader's preferred microphone, where the host records one; null = default. */
  audioInputDeviceId: string | null;
}

export type SessionAccess = { kind: "session"; record: SessionRecord; eligible: boolean; archived: boolean } | { kind: "home" };

/** Everything a route or handler needs, built once by `mountPages`. DESIGN §B.9 */
export interface ServingContext {
  provider: ProviderHost;
  serving: ServingHost;
  settings(): PagesSettings;
  /** The host's spelling of the five command roles. 04 §Command roles */
  commands: { init: string; guide: string; status: string; home: string; grants: string };
  strategy: SiteStrategy;
  registry: CapabilityRegistry;
  contributions: Contributions;
  pages: PageStore;
  storage: StorageStore;
  grants: GrantStore;
  budget: PageBudget;
  idempotency: IdempotencyStore;
  ledger: LedgerStore;
  redeemed: RedeemedStore;
  cooldowns: Cooldowns;
  selections: SelectionStore;
  attachGrants: AttachGrantStore;
  home: HomeDesignation;
  signingKey: Uint8Array;
  now(): number;
  random(bytes: number): Uint8Array;
  log: Logger;
  /** Throws PageError `not_found` for null / deleted. */
  sessionFor(id: string): Promise<SessionAccess>;
  /** `EMPTY_REVISION` when unwritten; the home's for HOME_IDENTITY. */
  currentRevision(session: string, path: string | null): Promise<string>;
}

/** The built-in home as a handler sees it. 05 R-S12; DESIGN §E.3 */
export interface HomeSession {
  id: string;
  title: "Home";
  archived: false;
  workspaceId: null;
}

export interface HandlerContext {
  serving: ServingContext;
  session: SessionRecord | HomeSession;
  page: { revision: string; stale: boolean; archived: boolean; path: string | null };
  requestId: string;
  /** From Host / X-Forwarded-Host / Origin, for 03 R5.32a. */
  requestOrigins: readonly string[];
  /** The server never sees an embed: the embedding kernel rewrites every embedded call. */
  scope: string | null;
}

export interface GrantRequest {
  summary: string;
  target: { sessionId: string; title: string };
  record(): Promise<void>;
}

/** ≤ `decisionSummaryChars`, never cut. 03 R-C7 */
export interface DecisionRequest {
  summary: string;
}

/** The handler contract of DESIGN §E.3; one per implemented spec. */
export interface CapabilityHandler<P = unknown, R = unknown> {
  method: string;
  confirmedBy?: "recording-bar";
  /** Throws PageError; no dialog has been shown yet. */
  refuse?(params: P, ctx: HandlerContext): Promise<void>;
  /** The confirmation's words, ≤ `summaryChars`; from validated params only. 05 R3.18 */
  summarize?(params: P, ctx: HandlerContext): Promise<string>;
  /** `pages.answer`, `sessions.respond { answers }`. */
  grant?(params: P, ctx: HandlerContext): Promise<GrantRequest | null>;
  /** `session.respond` / `sessions.respond` with a decision. 03 R-C7 */
  decision?(params: P, ctx: HandlerContext): Promise<DecisionRequest | null>;
  execute(params: P, ctx: HandlerContext): Promise<{ result: R; navigate?: NavigationDirective }>;
}

/** The body of `POST /bridge`. DESIGN §C.3 */
export interface BridgeEnvelope {
  actionToken: string;
  request: unknown;
  confirmation?: string | null;
}

export interface Dispatcher {
  /** The pipeline of DESIGN §E.1; the route only reads the body and the reader. */
  dispatch(request: PagesRequest, envelope: BridgeEnvelope): Promise<PagesResponse>;
}

/** The signature of `createDispatcher` in `src/serving/bridge/dispatcher.ts` (slice 4). DESIGN §B.9 */
export type CreateDispatcher = (ctx: ServingContext, handlers?: readonly CapabilityHandler[]) => Dispatcher;
