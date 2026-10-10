// `storage.get`, `storage.set`, `storage.setMany`: per identity (the session, or the built-in home) and per document scope, over the storage store's one document per scope (03 R5.18–R5.19, R-C6; 07 R5.84a; DESIGN §E.9).
import type { JsonValue } from "../../../domain/json/strict-json.ts";
import { handler } from "../handler.ts";

export const storageGet = handler<{ key: string }, unknown>({
  method: "storage.get",
  async execute(params, { serving, session, scope }) {
    const found = await serving.storage.get(session.id, scope, params.key);
    return { result: found.found ? { found: true, value: found.value as JsonValue } : { found: false } };
  },
});

export const storageSet = handler<{ key: string; value: JsonValue }, unknown>({
  method: "storage.set",
  async execute(params, { serving, session, scope }) {
    await serving.storage.set(session.id, scope, [{ key: params.key, value: params.value }]);
    return { result: { stored: true } };
  },
});

export const storageSetMany = handler<{ entries: { key: string; value: JsonValue }[] }, unknown>({
  method: "storage.setMany",
  async execute(params, { serving, session, scope }) {
    const stored = await serving.storage.set(session.id, scope, params.entries);
    return { result: { stored: stored.stored } };
  },
});
