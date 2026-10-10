// The home pointer in `kv` (`pages-core:home`): set/clear/read, stale pointer tolerated (05 R-S12, 04 R6.8, 08 A61; DESIGN P32).
import { isSessionId } from "../domain/ids.ts";
import type { ProviderHost } from "../host/provider.ts";
import type { HomeDesignation } from "./stores.d.ts";

export const HOME_KV = "pages-core:home";

/** The one owner of the home designation; a host mirrors it read-only (DR-3). 04 R6.8 */
export function createHomeDesignation(kv: ProviderHost["kv"]): HomeDesignation {
  return {
    async get() {
      const value = await kv.get(HOME_KV);
      return isSessionId(value) ? value : null;
    },
    async set(sessionId) {
      if (!isSessionId(sessionId)) throw new TypeError("A home designation names a session id");
      await kv.set(HOME_KV, sessionId);
    },
    async clear() {
      await kv.delete(HOME_KV);
    },
  };
}
