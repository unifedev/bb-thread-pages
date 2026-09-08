/** Identifier shapes accepted at every boundary. */

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const METHOD_NAME = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const REVISION = /^[a-f0-9]{64}$/;
const OPAQUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,511}$/;
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID.test(value);
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

export function isMethodName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96 && METHOD_NAME.test(value);
}

export function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_TOKEN.test(value);
}

export function isStorageKey(value: unknown): value is string {
  return typeof value === "string" && STORAGE_KEY.test(value);
}
