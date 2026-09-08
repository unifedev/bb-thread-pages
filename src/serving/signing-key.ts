import { randomBytes } from "node:crypto";
import { errorText } from "../domain/errors.ts";
import type { SessionHost } from "../host/contract.ts";

const KEY = "signing-key:v3";

/** The token signing key: 32 random bytes, generated on first use, persisted, never logged. spec R2.8 */
export async function loadSigningKey(host: SessionHost): Promise<Uint8Array> {
  try {
    const stored = await host.kv.get(KEY);
    if (typeof stored === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      const decoded = Buffer.from(stored, "base64url");
      if (decoded.byteLength === 32) return decoded;
    }
  } catch (error) {
    host.log.warn(`signing key: could not read the stored key: ${errorText(error)}`);
  }
  const generated = randomBytes(32);
  try {
    await host.kv.set(KEY, generated.toString("base64url"));
  } catch (error) {
    host.log.warn(`signing key: could not persist; open pages will need a reload after the next plugin reload: ${errorText(error)}`);
  }
  return generated;
}
