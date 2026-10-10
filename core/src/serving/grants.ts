// `createGrantStore(kv, now, log)`: the durable pair grants of `pages.answer` and `sessions.respond { answers }` under `pages-core:grants`, bounded per page and in pages, touched on every delivery, revocable, dropped with a session (03 R5.64–R5.67; DESIGN §E.10).
import { LIMITS } from "../domain/limits.ts";
import type { Logger, ProviderHost } from "../host/provider.ts";
import type { GrantPair, GrantStore } from "./stores.d.ts";

export const GRANTS_KEY = "pages-core:grants";

interface StoredPair {
  grantedAtMs: number;
  lastAnsweredAtMs: number | null;
  count: number;
}

type Pairs = Record<string, StoredPair>;

const SEPARATOR = "\u0000";

function pairKey(from: string, to: string): string {
  return `${from}${SEPARATOR}${to}`;
}

function split(key: string): { from: string; to: string } | null {
  const at = key.indexOf(SEPARATOR);
  if (at < 0) return null;
  return { from: key.slice(0, at), to: key.slice(at + 1) };
}

export function createGrantStore(kv: ProviderHost["kv"], now: () => number, log: Logger, options: { sessionExists?: (id: string) => Promise<boolean> } = {}): GrantStore {
  // Reads and writes are serialised: one document, one process. P9
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  }

  async function load(): Promise<Pairs> {
    const raw = await kv.get(GRANTS_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw) as { pairs?: unknown };
      const pairs = parsed && typeof parsed === "object" && parsed.pairs && typeof parsed.pairs === "object" ? (parsed.pairs as Pairs) : {};
      return { ...pairs };
    } catch {
      log.warn("grants: the grants document is not JSON; starting empty");
      return {};
    }
  }

  async function save(pairs: Pairs): Promise<void> {
    if (Object.keys(pairs).length === 0) await kv.delete(GRANTS_KEY);
    else await kv.set(GRANTS_KEY, JSON.stringify({ pairs }));
  }

  function toPairs(pairs: Pairs): GrantPair[] {
    const out: GrantPair[] = [];
    for (const [key, stored] of Object.entries(pairs)) {
      const ids = split(key);
      if (ids) out.push({ from: ids.from, to: ids.to, grantedAtMs: stored.grantedAtMs, lastAnsweredAtMs: stored.lastAnsweredAtMs, count: stored.count });
    }
    return out;
  }

  function oldest(entries: [string, StoredPair][]): string | null {
    let found: [string, StoredPair] | null = null;
    for (const entry of entries) if (!found || entry[1].grantedAtMs < found[1].grantedAtMs) found = entry;
    return found ? found[0] : null;
  }

  return {
    has(from, to) {
      return serial(async () => Object.prototype.hasOwnProperty.call(await load(), pairKey(from, to)));
    },
    record(from, to) {
      return serial(async () => {
        const pairs = await load();
        const key = pairKey(from, to);
        if (pairs[key]) return;
        const own = Object.entries(pairs).filter(([candidate]) => split(candidate)?.from === from);
        if (own.length >= LIMITS.grantsPerPage) {
          const drop = oldest(own);
          if (drop) {
            delete pairs[drop];
            log.warn(`grants: ${from} held ${LIMITS.grantsPerPage} pairs; dropped the oldest (${split(drop)?.to ?? "?"})`);
          }
        }
        const pages = new Set(Object.keys(pairs).map((candidate) => split(candidate)?.from));
        if (!pages.has(from) && pages.size >= LIMITS.grantPages) {
          // The page whose grants are the least recent goes whole, so the count of pages holding any is bounded.
          const drop = oldest(Object.entries(pairs));
          const page = drop ? split(drop)?.from : undefined;
          if (page !== undefined) {
            for (const candidate of Object.keys(pairs)) if (split(candidate)?.from === page) delete pairs[candidate];
            log.warn(`grants: ${LIMITS.grantPages} pages hold grants; dropped every pair of the least recently granted page (${page})`);
          }
        }
        pairs[key] = { grantedAtMs: now(), lastAnsweredAtMs: null, count: 0 };
        await save(pairs);
      });
    },
    touch(from, to) {
      return serial(async () => {
        const pairs = await load();
        const pair = pairs[pairKey(from, to)];
        if (!pair) return;
        pairs[pairKey(from, to)] = { ...pair, lastAnsweredAtMs: now(), count: pair.count + 1 };
        await save(pairs);
      });
    },
    revoke(from, to) {
      return serial(async () => {
        const pairs = await load();
        if (!pairs[pairKey(from, to)]) return false;
        delete pairs[pairKey(from, to)];
        await save(pairs);
        return true;
      });
    },
    revokeAll() {
      return serial(async () => {
        const count = Object.keys(await load()).length;
        await save({});
        return count;
      });
    },
    listFor(from) {
      return serial(async () => toPairs(await load()).filter((pair) => pair.from === from));
    },
    listAll() {
      return serial(async () => {
        const pairs = await load();
        // Pairs whose session is gone are dropped lazily here, as a fallback to forget(). DR-8
        if (options.sessionExists) {
          let changed = false;
          for (const key of Object.keys(pairs)) {
            const ids = split(key);
            if (!ids) continue;
            const alive = await Promise.all([ids.from, ids.to].map((id) => (id.startsWith("~") ? Promise.resolve(true) : options.sessionExists!(id))));
            if (alive.every(Boolean)) continue;
            delete pairs[key];
            changed = true;
          }
          if (changed) await save(pairs);
        }
        return toPairs(pairs);
      });
    },
    forget(session) {
      return serial(async () => {
        const pairs = await load();
        let changed = false;
        for (const key of Object.keys(pairs)) {
          const ids = split(key);
          if (ids && (ids.from === session || ids.to === session)) {
            delete pairs[key];
            changed = true;
          }
        }
        if (changed) await save(pairs);
      });
    },
  };
}
