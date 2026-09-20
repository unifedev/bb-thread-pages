import { errorText } from "../domain/errors.ts";
import { isSessionId } from "../domain/ids.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import type { SessionHost } from "../host/contract.ts";

/**
 * The grants pages hold to answer other sessions from an embed: one per
 * (embedding page session → embedded session), asked for once in trusted
 * chrome, remembered durably, revocable. Kept as one record in the host's
 * key-value store — the host contract offers no key listing, and the set is
 * small and bounded. spec R5.64–R5.67, DECISIONS D31
 */
export interface Grant {
  readonly from: string;
  readonly to: string;
  readonly grantedAtMs: number;
}

export interface GrantStore {
  has(from: string, to: string): Promise<boolean>;
  add(from: string, to: string, now: number): Promise<void>;
  /** Removes one pair, every grant a page holds (`to` omitted), or all of them (both omitted). Returns how many went. */
  revoke(from?: string, to?: string): Promise<number>;
  list(from?: string): Promise<Grant[]>;
}

const KV_KEY = "grants:v1";

type Stored = Record<string, Record<string, number>>;

/** Prototype-free, so a session id can never collide with `constructor` or `__proto__`. */
function bare<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function readStored(value: JsonValue | undefined): Stored {
  const out: Stored = bare();
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [from, targets] of Object.entries(value)) {
    if (!targets || typeof targets !== "object" || Array.isArray(targets)) continue;
    if (!isSessionId(from)) continue;
    const kept: Record<string, number> = bare();
    for (const [to, at] of Object.entries(targets)) {
      if (isSessionId(to) && typeof at === "number" && Number.isFinite(at)) kept[to] = at;
    }
    if (Object.keys(kept).length > 0) out[from] = kept;
  }
  return out;
}

export function createGrantStore(host: SessionHost): GrantStore {
  // One writer at a time, so two approvals cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  }

  async function load(): Promise<Stored> {
    return readStored(await host.kv.get(KV_KEY));
  }

  return {
    async has(from, to) {
      try {
        return (await load())[from]?.[to] !== undefined;
      } catch (error) {
        // An unreadable store asks again rather than letting an answer through.
        host.log.warn(`grants: could not read: ${errorText(error)}`);
        return false;
      }
    },
    add(from, to, now) {
      return serial(async () => {
        const stored = await load();
        const targets = { ...(stored[from] ?? {}), [to]: now };
        // Bounded: a page's oldest grants go first, then the pages whose newest grant is oldest.
        stored[from] = Object.fromEntries(Object.entries(targets).sort((a, b) => b[1] - a[1]).slice(0, LIMITS.grantsPerPage));
        const newest = (page: string) => Math.max(...Object.values(stored[page] ?? {}));
        const pages = Object.keys(stored).sort((a, b) => newest(b) - newest(a));
        for (const page of pages.slice(LIMITS.grantPages)) delete stored[page];
        await host.kv.set(KV_KEY, { ...stored });
      });
    },
    revoke(from, to) {
      return serial(async () => {
        const stored = await load();
        let removed = 0;
        for (const page of Object.keys(stored)) {
          if (from !== undefined && page !== from) continue;
          for (const target of Object.keys(stored[page] ?? {})) {
            if (to !== undefined && target !== to) continue;
            delete stored[page]![target];
            removed += 1;
          }
          if (Object.keys(stored[page] ?? {}).length === 0) delete stored[page];
        }
        if (removed > 0) await host.kv.set(KV_KEY, { ...stored });
        return removed;
      });
    },
    async list(from) {
      const stored = await load();
      const grants: Grant[] = [];
      for (const [page, targets] of Object.entries(stored)) {
        if (from !== undefined && page !== from) continue;
        for (const [to, grantedAtMs] of Object.entries(targets)) grants.push({ from: page, to, grantedAtMs });
      }
      return grants.sort((a, b) => b.grantedAtMs - a.grantedAtMs);
    },
  };
}

/** A page's grants with the titles the shell's list shows; sessions that are gone are dropped. spec R5.65, R5.67 */
export async function describeGrants(host: SessionHost, grants: GrantStore, from: string): Promise<{ sessionId: string; title: string }[]> {
  const out: { sessionId: string; title: string }[] = [];
  for (const grant of await grants.list(from).catch(() => [])) {
    let session;
    try {
      session = await host.sessions.get(grant.to);
    } catch {
      // The host could not say; the grant stays, it is only not listed this time.
      continue;
    }
    // A session that is gone for good takes its grants with it. spec R5.67
    if (!session || session.deleted) {
      await grants.revoke(from, grant.to).catch(() => 0);
      continue;
    }
    out.push({ sessionId: session.id, title: session.title.slice(0, LIMITS.titleChars) });
  }
  return out;
}
