// Validators: session id, request id, revision (sha256 hex), method name, storage key, opaque token; the built-in home's reserved identity.

/**
 * The built-in home page's identity: outside the session id grammar, so no
 * session can collide with it. Used for its tokens, storage and grants.
 * spec 05 R-S12; DESIGN P5
 */
export const HOME_IDENTITY = "~home";

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
// A contributed method's namespace is its contributor's id, which may carry hyphens. 07 R5.43
const METHOD_NAME = /^[a-z][a-zA-Z0-9-]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const REVISION = /^[a-f0-9]{64}$/;
const OPAQUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,511}$/;
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SUBMISSION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** A session id as the provider issues it: URL-safe, 1–128 characters. 06 R-P2 */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

/** A session id or the built-in home's identity: what a token may name. 05 R-S12 */
export function isSessionIdentity(value: unknown): value is string {
  return value === HOME_IDENTITY || isSessionId(value);
}

/** A workspace, provider or model id as a page passes it. 03 R-C5 */
export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID.test(value);
}

/** A bridge request id. 05 R3.9 */
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

/** A method name on the bridge, built-in or contributed. 03 R5.1, 07 R5.43 */
export function isMethodName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96 && METHOD_NAME.test(value);
}

/** A page revision: the SHA-256 of the assembled document, as hex. 05 R2.11 */
export function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION.test(value);
}

/** An opaque token a page carries back unchanged (cursors, selection tokens). 03 R5.12, R5.36 */
export function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_TOKEN.test(value);
}

/** A `storage` key. 03 R5.18 */
export function isStorageKey(value: unknown): value is string {
  return typeof value === "string" && STORAGE_KEY.test(value);
}

/** A client-generated submission id. 05 R2.32 */
export function isSubmissionId(value: unknown): value is string {
  return typeof value === "string" && SUBMISSION_ID.test(value);
}
