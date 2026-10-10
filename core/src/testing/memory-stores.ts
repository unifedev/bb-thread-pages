// In-memory implementations of every store of `src/serving/stores.d.ts`, for tests and the dev server (DR-2). The `kv`-backed ones of the real server persist; these keep the same contract in memory.
import { parseContributor, type ContributedSpec, type Contributor } from "../domain/capabilities/contributed.ts";
import { PageError } from "../domain/errors.ts";
import { captureForms } from "../domain/html/forms.ts";
import { utf8Bytes, type JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import { createLedger } from "../domain/messages/ledger.ts";
import { revisionOf } from "../domain/revision.ts";
import { createOutcomeMemory } from "../domain/submissions/idempotency.ts";
import { mintSelectionToken, verifySelectionToken } from "../domain/tokens/selection-token.ts";
import type { AttachmentRef } from "../host/provider.ts";
import type { ApprovedCall, AttachGrantStore, BoundFile, ContributionSet, Contributions, Cooldowns, GrantPair, GrantStore, HomeDesignation, IdempotencyStore, LedgerStore, LoadedPage, PageStore, RedeemedStore, SelectionStore, StorageStore } from "../serving/stores.d.ts";

export interface Clock {
  now(): number;
}

/** A page store over a map of documents: `put(session, path, html)` is "the agent saved the file". */
export interface MemoryPageStore extends PageStore {
  put(session: string, path: string | null, html: string, options?: { archived?: boolean; stale?: boolean }): string;
  remove(session: string, path?: string | null): void;
}

export function createMemoryPageStore(clock: Clock = { now: () => Date.now() }): MemoryPageStore {
  const documents = new Map<string, { html: string; revision: string; updatedAtMs: number; archived: boolean; stale: boolean }>();
  const known = new Map<string, string>();
  const keyOf = (session: string, path: string | null | undefined) => `${session}\u0000${path && path !== "index.html" ? path : ""}`;
  return {
    put(session, path, html, options = {}) {
      const revision = revisionOf(html);
      documents.set(keyOf(session, path), { html, revision, updatedAtMs: clock.now(), archived: options.archived ?? false, stale: options.stale ?? false });
      return revision;
    },
    remove(session, path) {
      documents.delete(keyOf(session, path));
      known.delete(session);
    },
    async load(session, path) {
      const entry = documents.get(keyOf(session, null));
      if (!entry) throw new PageError("no_page", "This session has no page yet.");
      const document = path && path !== "index.html" ? documents.get(keyOf(session, path)) : entry;
      if (!document) throw new PageError("not_found", "No such document of the page.");
      if (utf8Bytes(document.html) > LIMITS.entryDocumentBytes) throw new PageError("page_too_large", "The document is over the size limit.");
      known.set(session, entry.revision);
      const loaded: LoadedPage = { html: document.html, revision: document.revision, updatedAtMs: document.updatedAtMs, path: path && path !== "index.html" ? path : null, stale: document.stale, archived: document.archived, site: { resolved: 0, skipped: [], deferred: [] } };
      return loaded;
    },
    async forms(session, path) {
      const loaded = await this.load(session, path);
      return { revision: loaded.revision, forms: captureForms(loaded.html) };
    },
    knownRevision(session) {
      return known.get(session) ?? null;
    },
    async available(session) {
      return documents.has(keyOf(session, null));
    },
    async forget(session) {
      for (const key of [...documents.keys()]) if (key.startsWith(`${session}\u0000`)) documents.delete(key);
      known.delete(session);
    },
  };
}

/** The storage layout of DESIGN §E.9 in memory, with the same bounds. */
export function createMemoryStorageStore(options: { pageBytes?: number } = {}): StorageStore {
  const pageBytes = Math.min(LIMITS.storagePageBytes, options.pageBytes ?? LIMITS.storagePageBytes);
  const documents = new Map<string, Map<string, Record<string, JsonValue>>>();
  const scopes = (identity: string) => {
    const found = documents.get(identity) ?? new Map<string, Record<string, JsonValue>>();
    documents.set(identity, found);
    return found;
  };
  const size = (document: Record<string, JsonValue>) => utf8Bytes(JSON.stringify(document));
  return {
    async get(identity, scope, key) {
      const document = scopes(identity).get(scope ?? "");
      if (!document || !Object.prototype.hasOwnProperty.call(document, key)) return { found: false };
      return { found: true, value: document[key] as JsonValue };
    },
    async set(identity, scope, entries) {
      if (entries.length > LIMITS.storageSetManyEntries) throw new PageError("invalid_params", `At most ${LIMITS.storageSetManyEntries} entries`);
      const keys = entries.map((entry) => entry.key);
      if (new Set(keys).size !== keys.length) throw new PageError("invalid_params", "duplicate key");
      const all = scopes(identity);
      const next: Record<string, JsonValue> = { ...(all.get(scope ?? "") ?? {}) };
      for (const entry of entries) {
        if (entry.value === null) {
          delete next[entry.key];
          continue;
        }
        if (utf8Bytes(JSON.stringify(entry.value)) > LIMITS.storageValueBytes) throw new PageError("request_too_large", `A storage value is at most ${LIMITS.storageValueBytes} bytes`);
        next[entry.key] = entry.value;
      }
      let total = size(next);
      for (const [other, document] of all) if (other !== (scope ?? "")) total += size(document);
      if (total > pageBytes) throw new PageError("request_too_large", `A page's storage is at most ${pageBytes} bytes across its scopes`);
      all.set(scope ?? "", next);
      return { stored: entries.length };
    },
    async forget(identity) {
      documents.delete(identity);
    },
  };
}

export function createMemoryGrantStore(clock: Clock = { now: () => Date.now() }, log: { warn(message: string): void } = { warn: () => {} }): GrantStore {
  const pairs = new Map<string, GrantPair>();
  const keyOf = (from: string, to: string) => `${from}\u0000${to}`;
  return {
    async has(from, to) {
      return pairs.has(keyOf(from, to));
    },
    async record(from, to) {
      if (pairs.has(keyOf(from, to))) return;
      const own = [...pairs.values()].filter((pair) => pair.from === from);
      if (own.length >= LIMITS.grantsPerPage) {
        const oldest = own.sort((a, b) => a.grantedAtMs - b.grantedAtMs)[0]!;
        pairs.delete(keyOf(oldest.from, oldest.to));
        log.warn(`grants: ${from} held ${LIMITS.grantsPerPage} pairs; dropped the oldest (${oldest.to})`);
      }
      const pages = new Set([...pairs.values()].map((pair) => pair.from));
      if (!pages.has(from) && pages.size >= LIMITS.grantPages) {
        const oldest = [...pairs.values()].sort((a, b) => a.grantedAtMs - b.grantedAtMs)[0]!;
        pairs.delete(keyOf(oldest.from, oldest.to));
        log.warn(`grants: ${LIMITS.grantPages} pages hold grants; dropped the oldest pair (${oldest.from} → ${oldest.to})`);
      }
      pairs.set(keyOf(from, to), { from, to, grantedAtMs: clock.now(), lastAnsweredAtMs: null, count: 0 });
    },
    async touch(from, to) {
      const pair = pairs.get(keyOf(from, to));
      if (pair) pairs.set(keyOf(from, to), { ...pair, lastAnsweredAtMs: clock.now(), count: pair.count + 1 });
    },
    async revoke(from, to) {
      return pairs.delete(keyOf(from, to));
    },
    async revokeAll() {
      const count = pairs.size;
      pairs.clear();
      return count;
    },
    async listFor(from) {
      return [...pairs.values()].filter((pair) => pair.from === from);
    },
    async listAll() {
      return [...pairs.values()];
    },
    async forget(session) {
      for (const [key, pair] of [...pairs]) if (pair.from === session || pair.to === session) pairs.delete(key);
    },
  };
}

export function createMemoryLedger(): LedgerStore {
  return createLedger() as LedgerStore;
}

export function createMemoryIdempotency(): IdempotencyStore {
  return createOutcomeMemory();
}

export function createMemoryRedeemed(clock: Clock = { now: () => Date.now() }): RedeemedStore {
  const redeemed = new Map<string, number>();
  return {
    async redeem(key, expiresAtMs) {
      const now = clock.now();
      for (const [id, expiry] of [...redeemed]) if (expiry <= now) redeemed.delete(id);
      if (redeemed.has(key)) return false;
      while (redeemed.size >= LIMITS.redeemedConfirmations) {
        const oldest = redeemed.keys().next().value;
        if (oldest === undefined) break;
        redeemed.delete(oldest);
      }
      redeemed.set(key, expiresAtMs);
      return true;
    },
  };
}

export function createMemoryCooldowns(durationMs: number = LIMITS.declinedCooldownMs): Cooldowns & { size(): number } {
  const until = new Map<string, number>();
  return {
    start(key, now) {
      // Expired cooldowns go on every start, so a long-lived host holds at most the declines of the last 10 s.
      for (const [other, expiry] of until) if (expiry <= now) until.delete(other);
      until.set(key, now + durationMs);
    },
    active(key, now) {
      const expiry = until.get(key);
      if (expiry === undefined) return false;
      if (expiry <= now) {
        until.delete(key);
        return false;
      }
      return true;
    },
    size: () => until.size,
  };
}

export function createMemorySelections(signingKey: Uint8Array, random: (bytes: number) => Uint8Array): SelectionStore {
  const held = new Map<string, { session: string; selection: unknown; display: string; expiresAt: number }>();
  return {
    issue(session, selection, display, now) {
      for (const [id, entry] of [...held]) if (entry.expiresAt <= now) held.delete(id);
      while (held.size >= LIMITS.selectionTokens) {
        const oldest = held.keys().next().value;
        if (oldest === undefined) break;
        held.delete(oldest);
      }
      const { token, payload } = mintSelectionToken({ session, now, random }, signingKey);
      held.set(payload.id, { session, selection, display, expiresAt: payload.exp });
      return token;
    },
    has(session, token, now) {
      const payload = verifySelectionToken(token, signingKey, now, session);
      if (!payload) return false;
      const entry = held.get(payload.id);
      return entry !== undefined && entry.session === session && entry.expiresAt > now;
    },
    redeem(session, token, now) {
      const payload = verifySelectionToken(token, signingKey, now, session);
      if (!payload) return null;
      const entry = held.get(payload.id);
      if (!entry || entry.session !== session || entry.expiresAt <= now) return null;
      held.delete(payload.id);
      return { selection: entry.selection, display: entry.display };
    },
    forget(session) {
      for (const [id, entry] of [...held]) if (entry.session === session) held.delete(id);
    },
  };
}

export function createMemoryAttachGrants(): AttachGrantStore & { size(): number } {
  const grants = new Map<string, { openedAt: number; files: { index: number; file: BoundFile; attachment: AttachmentRef }[] }>();
  const keyOf = (call: ApprovedCall) => JSON.stringify([call.session, call.revision, call.requestId, call.method, call.paramsHash]);
  const live = (call: ApprovedCall, now: number) => {
    const grant = grants.get(keyOf(call));
    if (!grant) return null;
    if (now - grant.openedAt > LIMITS.attachGrantMs) {
      grants.delete(keyOf(call));
      return null;
    }
    return grant;
  };
  return {
    open(call, index, file, attachment, now) {
      // Grants nobody redeemed go on every open, so an abandoned upload holds its grant for `attachGrantMs` and no longer.
      for (const [key, grant] of grants) if (now - grant.openedAt > LIMITS.attachGrantMs) grants.delete(key);
      const grant = live(call, now) ?? { openedAt: now, files: [] };
      grant.files = grant.files.filter((entry) => entry.index !== index);
      grant.files.push({ index, file, attachment });
      grants.set(keyOf(call), grant);
    },
    held(call, now) {
      return [...(live(call, now)?.files ?? [])].sort((a, b) => a.index - b.index);
    },
    covers(call, now) {
      return live(call, now) !== null;
    },
    forget(call) {
      grants.delete(keyOf(call));
    },
    size: () => grants.size,
  };
}

export function createMemoryHome(): HomeDesignation {
  let home: string | null = null;
  return {
    async get() {
      return home;
    },
    async set(sessionId) {
      home = sessionId;
    },
    async clear() {
      home = null;
    },
  };
}

/** Contributions from a fixed list of declarations, with a scripted `invoke`. */
export function createMemoryContributions(declarations: readonly { id: string; declaration: unknown }[], invoke?: Contributions["invoke"]): Contributions & { replace(declarations: readonly { id: string; declaration: unknown }[]): void } {
  const listeners = new Set<(set: ContributionSet) => void>();
  const build = (list: readonly { id: string; declaration: unknown }[]): ContributionSet => {
    const contributors: Contributor[] = [];
    for (const { id, declaration } of list) {
      const parsed = parseContributor(id, declaration);
      if (parsed.contributor) contributors.push(parsed.contributor);
    }
    const byMethod = new Map<string, ContributedSpec>();
    for (const contributor of contributors) for (const method of contributor.methods) byMethod.set(method.method, method);
    return { contributors, get: (method) => byMethod.get(method) };
  };
  let set = build(declarations);
  return {
    async current() {
      return set;
    },
    cached() {
      return set;
    },
    async invoke(spec, params, caller, requestId) {
      if (!invoke) throw new PageError("unavailable", "No contributor answers here");
      return invoke(spec, params, caller, requestId);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replace(next) {
      set = build(next);
      for (const listener of listeners) listener(set);
    },
  };
}
