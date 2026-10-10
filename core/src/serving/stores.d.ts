// Type-only: the stores slice 2 implements and slices 4 and 5 consume (DESIGN §B.9, §H.1). `kv`-backed ones persist; the rest are in memory (P9). In-memory implementations for tests: `src/testing/memory-stores.ts`.
import type { ContributedSpec, Contributor } from "../domain/capabilities/contributed.ts";
import type { FormIdentity } from "../domain/forms/identity.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import type { IdempotencyKey, Remembered } from "../domain/submissions/idempotency.ts";
import type { AttachmentRef, Message } from "../host/provider.ts";

/** One loaded document: assembled, with its revision and what the site strategy did. 05 R2.11, R2.27–R2.30, 01 R1.19–R1.26 */
export interface LoadedPage {
  html: string;
  revision: string;
  updatedAtMs: number;
  path: string | null;
  /** Served from the offline copy. 05 R2.28 */
  stale: boolean;
  archived: boolean;
  site: { resolved: number; skipped: { path: string; reason: string }[]; deferred: { path: string; bytes: number }[] };
}

/** The page as a thing: one pipeline for every route and `pages.read`. 03 R5.56; DESIGN §F.3 */
export interface PageStore {
  /** Throws PageError: `no_page`, `not_found` (another document missing), `page_too_large`, `unavailable`. */
  load(session: string, path?: string | null): Promise<LoadedPage>;
  /** Parsed once per (session, path, revision). 02 R-K5, 05 R-S11 */
  forms(session: string, path: string | null): Promise<{ revision: string; forms: FormIdentity[] }>;
  /** The last loaded entry revision, no I/O. */
  knownRevision(session: string): string | null;
  /** The entry document exists; cached per session, invalidated by `load()` and `forget()` (DR-15). */
  available(session: string): Promise<boolean>;
  /** Drops the cache and the kv offline copies of the session. DR-8 */
  forget(session: string): Promise<void>;
}

/** `storage.*` over `kv`: `pages-core:storage:<identity>:<scope>`, `pages-core:storage-scopes:<identity>`. 03 R5.18–R5.19, R-C6; DESIGN §E.9 */
export interface StorageStore {
  get(identity: string, scope: string | null, key: string): Promise<{ found: boolean; value?: JsonValue }>;
  /** All or none; throws `invalid_params`, `request_too_large`. */
  set(identity: string, scope: string | null, entries: readonly { key: string; value: JsonValue | null }[]): Promise<{ stored: number }>;
  forget(identity: string): Promise<void>;
}

export interface GrantPair {
  from: string;
  to: string;
  grantedAtMs: number;
  lastAnsweredAtMs: number | null;
  count: number;
}

/** Durable pair grants in `kv` (`pages-core:grants`). 03 R5.64–R5.67; DESIGN §E.10 */
export interface GrantStore {
  has(from: string, to: string): Promise<boolean>;
  /** Bounds `grantsPerPage` / `grantPages`, oldest dropped and logged. */
  record(from: string, to: string): Promise<void>;
  /** On every delivery under the pair. */
  touch(from: string, to: string): Promise<void>;
  revoke(from: string, to: string): Promise<boolean>;
  revokeAll(): Promise<number>;
  listFor(from: string): Promise<GrantPair[]>;
  listAll(): Promise<GrantPair[]>;
  /** Both directions. DR-8 */
  forget(session: string): Promise<void>;
}

/** In memory; `ledgerEntries` per session, `ledgerWindowMs`. 06 R-P5; DESIGN §E.5 */
export interface LedgerStore {
  note(session: string, entry: { requestId: string; messageId?: string; text: string; label: string; sentAtMs: number }): void;
  markFrom(session: string, rows: Message[]): Message[];
  forget(session: string): void;
}

/** In memory; `idempotencyRecords`, `idempotencyMs`. 05 R2.33–R2.34; DESIGN §E.5 */
export interface IdempotencyStore {
  remember<T>(key: IdempotencyKey, fingerprint: string, run: () => Promise<T>, now: number): Remembered<T>;
}

/** `kv`: `pages-core:redeemed` → `{ [key]: expiresAtMs }`, pruned on every call. 05 R3.19a; DR-14 */
export interface RedeemedStore {
  /** False when the key was already redeemed and has not expired. */
  redeem(key: string, expiresAtMs: number): Promise<boolean>;
}

/** In memory; `declinedCooldownMs`. 03 R-C7, 02 R4.49 */
export interface Cooldowns {
  start(key: string, now: number): void;
  active(key: string, now: number): boolean;
}

/** In memory; `selectionTokens`, `selectionTokenMs`. 03 R5.36–R5.37 */
export interface SelectionStore {
  issue(session: string, selection: unknown, display: string, now: number): string;
  /** Still held for this session — not redeemed, not expired — without redeeming it; what `workspaces.create` refuses on before any dialog. 03 R5.37 */
  has(session: string, token: string, now: number): boolean;
  /** Single use; null for another session, expired, unknown. */
  redeem(session: string, token: string, now: number): { selection: unknown; display: string } | null;
  forget(session: string): void;
}

export interface BoundFile {
  name: string;
  size: number;
  type: string;
}

export interface ApprovedCall {
  session: string;
  revision: string;
  requestId: string;
  method: string;
  paramsHash: string;
}

/** In memory; `attachGrantMs`. 05 R3.20a; DESIGN §C.3 /attach */
export interface AttachGrantStore {
  open(call: ApprovedCall, index: number, file: BoundFile, attachment: AttachmentRef, now: number): void;
  held(call: ApprovedCall, now: number): { index: number; file: BoundFile; attachment: AttachmentRef }[];
  covers(call: ApprovedCall, now: number): boolean;
  forget(call: ApprovedCall): void;
}

/** `kv`: `pages-core:home`. 05 R-S12; DESIGN §F.5 */
export interface HomeDesignation {
  get(): Promise<string | null>;
  set(sessionId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ContributionSet {
  contributors: readonly Contributor[];
  get(method: string): ContributedSpec | undefined;
}

/** The contributors as the server sees them. 07 §Discovery per host; DESIGN §E.1 step 6 */
export interface Contributions {
  /** Re-read when older than `contributionsTtlMs`; never rejects. */
  current(): Promise<ContributionSet>;
  cached(): ContributionSet;
  invoke(spec: ContributedSpec, params: JsonValue, caller: { sessionId: string | null; scope: string | null }, requestId: string): Promise<JsonValue>;
  /** The server reinjects the instruction on change (DR-33). */
  onChange(listener: (set: ContributionSet) => void): () => void;
}

/** 05 R2.38, R2.38a; DESIGN §E.11 */
export interface PageBudget {
  /** null = refused, charged to neither. */
  acquire(request: { session: string; document: string; scope?: string | null }, now: number): (() => void) | null;
}
