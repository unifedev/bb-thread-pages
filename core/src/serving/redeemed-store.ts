// `createRedeemedStore(kv, now)`: redeemed challenge ids under `pages-core:redeemed` with their expiry, pruned on every call and bounded, so a challenge captured before a restart cannot be redeemed after it while the signing key persists (05 R3.19a; DESIGN §E.5, DR-14).
import { LIMITS } from "../domain/limits.ts";
import type { ProviderHost } from "../host/provider.ts";
import type { RedeemedStore } from "./stores.d.ts";

export const REDEEMED_KEY = "pages-core:redeemed";

export function createRedeemedStore(kv: ProviderHost["kv"], now: () => number): RedeemedStore {
  let chain: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Record<string, number>> {
    const raw = await kv.get(REDEEMED_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
      return out;
    } catch {
      return {};
    }
  }

  return {
    redeem(key, expiresAtMs) {
      const work = async (): Promise<boolean> => {
        const at = now();
        const redeemed = await load();
        for (const [id, expiry] of Object.entries(redeemed)) if (expiry <= at) delete redeemed[id];
        if (Object.prototype.hasOwnProperty.call(redeemed, key)) return false;
        const entries = Object.entries(redeemed).sort((a, b) => a[1] - b[1]);
        while (entries.length >= LIMITS.redeemedConfirmations) {
          const soonest = entries.shift();
          if (soonest) delete redeemed[soonest[0]];
        }
        redeemed[key] = expiresAtMs;
        await kv.set(REDEEMED_KEY, JSON.stringify(redeemed));
        return true;
      };
      const next = chain.then(work, work);
      chain = next.catch(() => undefined);
      return next;
    },
  };
}
