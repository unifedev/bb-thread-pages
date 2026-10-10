// Load or create the key in `provider.kv` under `pages-core:signing-key` (05 R2.8, 06 R8.19).
import { errorText } from "../domain/errors.ts";
import type { ProviderHost } from "../host/provider.ts";

/** Where the key lives: the server's own namespace of the provider's `kv`. DESIGN P9 */
export const SIGNING_KEY_KV = "pages-core:signing-key";

/** 32 random bytes, generated on first use, persisted so open pages survive a restart, never logged. 05 R2.8 */
export async function loadSigningKey(provider: ProviderHost, random: (bytes: number) => Uint8Array): Promise<Uint8Array> {
  try {
    const stored = await provider.kv.get(SIGNING_KEY_KV);
    if (typeof stored === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      const decoded = Buffer.from(stored, "base64url");
      if (decoded.byteLength === 32) return new Uint8Array(decoded);
    }
  } catch (error) {
    provider.log.warn(`signing key: could not read the stored key: ${errorText(error)}`);
  }
  const generated = random(32);
  try {
    await provider.kv.set(SIGNING_KEY_KV, Buffer.from(generated).toString("base64url"));
  } catch (error) {
    provider.log.warn(`signing key: could not persist the key; open pages will need a reload after the next restart: ${errorText(error)}`);
  }
  return generated;
}
