// One-time kv sweep on the first start of 1.10 (DESIGN §E). The plugin keeps the id `thread-pages`, so its kv
// namespace still holds what 1.9 wrote there (`cache:*` offline copies, `state:*` and `state@…` storage pages,
// `grants:v1`, `signing-key:v3`, …). None of it is readable by the core, whose rows all live under `pages-core:`.
// Every key outside that namespace is deleted once; the marker, itself under `pages-core:`, keeps it to once.
// A failed sweep leaves no marker, so the next start tries again; the plugin loads either way.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export const CORE_PREFIX = "pages-core:";
export const MIGRATION_MARKER = "pages-core:migrated-from:thread-pages-1";

export interface MigrationMarker { at: number; deleted: number }

export async function sweepForeignKv(bb: Pick<BbPluginApi, "storage">, log: { info(message: string): void; warn(message: string): void }, now: () => number = Date.now): Promise<number | null> {
  try {
    if ((await bb.storage.kv.get<MigrationMarker>(MIGRATION_MARKER)) !== undefined) return null;
    const foreign = (await bb.storage.kv.list()).filter((key) => !key.startsWith(CORE_PREFIX));
    for (const key of foreign) await bb.storage.kv.delete(key);
    await bb.storage.kv.set(MIGRATION_MARKER, { at: now(), deleted: foreign.length } satisfies MigrationMarker);
    log.info(`migration: first start of 1.10 — removed ${foreign.length} kv ${foreign.length === 1 ? "row" : "rows"} left by thread-pages 1.x; ${CORE_PREFIX}* untouched`);
    return foreign.length;
  } catch (error) {
    log.warn(`migration: kv sweep failed, will retry on the next start: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
