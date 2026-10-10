// Every kernel↔shell message type and validator (DESIGN §C), `KernelConfig`, `ShellConfig`, `HANDSHAKE_VERSION = 2`, `BRIDGE_VERSION = 1`, status wordings (`sentMessage`, `EMPTY_PAGE_STATUS`, `UPDATE_DEFERRED_STATUS`). Browser and server; imports domain only.
import { BRIDGE_ERROR_CODES, type BridgeErrorCode } from "../../domain/errors.ts";
import { isDocumentPath } from "../../domain/document-path.ts";
import { isSessionId, isSessionIdentity } from "../../domain/ids.ts";
import { LIMITS } from "../../domain/limits.ts";
import { isOwnFilePath } from "../../domain/own-files.ts";
import { isCanonicalScope } from "../../domain/scope.ts";
import { isDraftFields, isDraftFormRef, isDraftRecord, type DraftFormRef, type DraftRecord, type DraftValue } from "./drafts.ts";
import { isScrollState, type ScrollState } from "./scroll-state.ts";

/**
 * 2: the kernel makes the channel and hands its port to the shell inside its
 * `ready`; nothing ever posts a port into a frame. 05 R2.3a
 */
export const HANDSHAKE_VERSION = 2 as const;
export const BRIDGE_VERSION = 1 as const;

// --- the handshake -------------------------------------------------------------

/** The only message ever sent by `postMessage`; everything after rides the port. 05 R2.3a; DESIGN §C.1 */
export interface ReadyMessage {
  kind: "thread-page:ready";
  v: typeof HANDSHAKE_VERSION;
  pageRevision: string;
  documentPath: string;
  embedded: boolean;
}

// --- kernel → shell --------------------------------------------------------------

export interface SubmitAnswer {
  name: string;
  label: string;
  value: string | string[] | boolean;
}

/** A file by structured clone, never bytes in JSON. 02 R4.20, R4.24b */
export interface SubmitFile {
  field: string;
  file: File;
  /** A recording the shell transcribes at submit. 02 R4.24b */
  transcribe?: boolean;
}

export type RecordPurpose = "dictate" | "audio" | "capability";

export interface BridgeRequestMessage {
  v: typeof BRIDGE_VERSION;
  id: string;
  method: string;
  params: unknown;
  /** The kernel's configured revision; the shell never rewrites it. 02 R-K1 */
  pageRevision: string;
  /** Canonical (07 R5.82) or absent. */
  scope?: string;
  /** Structured clone beside the JSON. 03 R5.75 */
  files?: File[];
}

export type KernelMessage =
  /** The page became dirty; `custom` = the page called `setDirty(true)` (held until `setDirty(false)`), else reader input. 02 R-K9; U49 */
  | { kind: "thread-page:dirty"; custom: boolean }
  | { kind: "thread-page:clean" }
  /** A text control is focused and the last `input` was less than `swapIdleMs` ago; a swap waits while true. 05 R2.21 (U49) */
  | { kind: "thread-page:typing"; active: boolean }
  | { kind: "thread-page:submit"; submissionId: string; title: string; writtenAgainst: string; formId: string | null; formTitle: string | null; action: string | null; answers: SubmitAnswer[]; files: SubmitFile[] }
  | { kind: "thread-page:open-document"; path: string; fragment?: string; query?: string }
  | { kind: "thread-page:open-file"; path: string; download: boolean; name: string | null }
  | { kind: "thread-page:file-request"; id: string; path: string; purpose: "media" | "fetch"; init?: { method: "GET" | "HEAD" } }
  | { kind: "thread-page:fragment"; fragment: string; step?: true }
  | { kind: "thread-page:scroll"; state: ScrollState }
  | { kind: "thread-page:draft"; form: DraftFormRef; fields: Record<string, DraftValue>; focus: { name: string; selectionStart: number; selectionEnd: number } | null; cleared: string[]; embed?: { sessionId: string; documentPath: string } }
  | { kind: "thread-page:flushed"; nonce: number }
  | { kind: "thread-page:restored"; nonce: number; firstPaintToRestoreMs: number | null }
  | { kind: "thread-page:pong"; nonce: number }
  /** The home page discards a leftover draft the reader chose (05 R-S12; 02 R-K7). Honoured by the home's shell only. */
  | { kind: "thread-page:draft-discard"; session: string; documentPath: string; key: string; field: string }
  /** The home page revokes a grant pair (03 R5.65). Honoured by the home's shell only. */
  | { kind: "thread-page:grant-revoke"; from: string; to: string }
  | { kind: "thread-page:record"; id: string; purpose: RecordPurpose; prompt?: string; language?: string; maxDurationSeconds?: number; keepAudio?: boolean; control?: true }
  | { kind: "thread-page:escape" }
  | { kind: "thread-page:embed-dirty"; dirty: boolean }
  /** Embedded kernel → embedding kernel only: a trusted click or keydown, opening the embed's navigation window. DR-32; DESIGN §C.2 */
  | { kind: "thread-page:gesture"; atMs: number }
  | BridgeRequestMessage;

// --- shell → kernel --------------------------------------------------------------

export type BridgeResponseMessage =
  | { v: typeof BRIDGE_VERSION; id: string; ok: true; result: unknown }
  | { v: typeof BRIDGE_VERSION; id: string; ok: false; error: { code: BridgeErrorCode; message: string; reason?: string; detail?: unknown } };

export type Delivery = "started" | "queued" | "steered";

export type RecordedMessage =
  | { kind: "thread-page:recorded"; id: string; ok: true; text?: string; file?: File; audio?: Blob }
  | { kind: "thread-page:recorded"; id: string; ok: false; code: BridgeErrorCode; message: string };

export type FileMessage =
  | { kind: "thread-page:file"; id: string; ok: true; status: number; contentType: string; blob: Blob }
  | { kind: "thread-page:file"; id: string; ok: false; status: number; error: string };

export type ShellMessage =
  | { kind: "thread-page:ping"; nonce: number }
  | { kind: "thread-page:source-state"; stale: boolean; archived: boolean; reason: string | null }
  /** The owning session's state and the host's working label; the kernel keeps `data-thread-page-session` and each form's standing status. 05 R2.24–R2.26 (U49) */
  | { kind: "thread-page:session-state"; working: boolean; label: string }
  | { kind: "thread-page:restore"; nonce: number; scroll: ScrollState | null; drafts: DraftRecord[]; clearedNotice: { form: DraftFormRef; fields: string[] }[]; leftovers?: LeftoverDraft[] }
  | { kind: "thread-page:restore-now"; nonce: number }
  | { kind: "thread-page:flush"; nonce: number }
  | { kind: "thread-page:shown" }
  /** A newer version waits for the reader to pause (`available: true`), or no longer does. 05 R2.21 (U49) */
  | { kind: "thread-page:update"; available: boolean }
  /** The home shell's list of drafts no page could restore, after a discard or a change in another tab. 05 R-S12 */
  | { kind: "thread-page:drafts"; leftovers: LeftoverDraft[] }
  /** The home shell's list of every grant pair on this host. 03 R5.65 */
  | { kind: "thread-page:grants"; grants: GrantSummary[] }
  | { kind: "thread-page:submit-progress"; submissionId: string; message: string }
  | { kind: "thread-page:submit-result"; submissionId: string; ok: boolean; delivery?: Delivery; matchedRevision?: string; revisionChanged?: boolean; error?: BridgeErrorCode; message?: string }
  | FileMessage
  | { kind: "thread-page:voice"; available: boolean; reason: string | null }
  | RecordedMessage
  | { kind: "thread-page:draft-notice"; text: string }
  | BridgeResponseMessage;

/** A draft a page's shell could not restore, kept for the reader on the home page. 02 R-K7; DESIGN §D.3 */
export interface LeftoverDraft {
  session: string;
  documentPath: string;
  /** The form's key. */
  key: string;
  /** The form's title or key, for the reader. */
  label: string;
  field: string;
  value: string;
  /** Not on the current version of its document, or the page filled the field itself. */
  reason: "not-on-this-version" | "field-filled";
  atMs: number;
}

// --- configuration ---------------------------------------------------------------

/** Carried in the kernel script's `data-config` attribute. DESIGN §C.4 */
export interface KernelConfig {
  pageRevision: string;
  /** Offline copy. 05 R2.28 */
  stale: boolean;
  /** 02 R-K8 */
  archived: boolean;
  /** Strategy by-url: the document's directory URL; null when carried or home. */
  siteRoot: string | null;
  embedded: boolean;
  /** False on the built-in home. 02 R4.60 */
  uploads: boolean;
  documentPath: string;
  /** True only where the file route accepts `Origin: null`; false → the own-fetch patch is on. 05 R-S7a */
  ownFilesByFrame: boolean;
  /** Composition tier present → `threadPage.embed` defined. 02 R-K2 */
  embedAvailable: boolean;
  /** Large media the shell fetches. 02 R4.25a */
  deferredFiles: string[];
  /** How long after the last keystroke a focused text control stops deferring a swap. 05 R2.21 (U49) */
  swapIdleMs: number;
}

export interface GrantSummary {
  sessionId: string;
  title: string;
  grantedAtMs: number;
  lastAnsweredAtMs: number | null;
  count: number;
  /** The granting page's identity and title: present in the home's list, which covers every pair on the host. 03 R5.65 */
  from?: string;
  fromTitle?: string;
}

/** Carried in the shell script's `data-config` attribute. DESIGN §C.4 */
export interface ShellConfig {
  /** A session id, or the home's identity. */
  session: string;
  actionToken: string;
  pageRevision: string;
  expiresAt: number;
  documentUrl: string;
  documentPath: string;
  documentQuery: string;
  /** Relative to base(). */
  routes: { submit: string; upload: string; bridge: string; chromeAction: string; documentSession: string; transcribe: string; attach: string; home: string; page: string };
  /** Strategy by-url: base()+"/page/<id>/"; null otherwise. */
  filesUrl: string | null;
  /** False for the built-in home. */
  navigable: boolean;
  title: string;
  /** The host's own built-in home document (never a designated agent page): the one shell that hands the kernel every grant pair and the leftovers and honours discard and revoke. 05 R-S12, R3.7a */
  builtinHome: boolean;
  workingLabel: string;
  working: boolean;
  source: "live" | "offline" | "archived";
  empty: boolean;
  pollMs: number;
  pollWorkingMs: number;
  pollAfterAnswerMs: number;
  refreshSwapMs: number;
  reload: { loopCount: number; clearMs: number; pingMs: number; waitMs: number };
  /** This page's grant pairs; on the home, every pair on the host. 03 R5.65 */
  grants: GrantSummary[];
  maxUploadBytes: number;
  maxUploads: number;
  voice: { available: boolean; reason: string | null; deviceId: string | null };
  drafts: { retentionMs: number; perSessionBytes: number; flushMs: number };
  deferredFiles: string[];
  /** Every read-effect method a hidden frame may call now (DR-12). */
  readMethods: string[];
}

// --- wordings -------------------------------------------------------------------

/** What a form's status line says once a submission settles. 02 R4.8, 03 R-C8 */
export function sentMessage(delivery: unknown): string {
  switch (delivery) {
    case "queued":
      return "Queued";
    case "steered":
      return "Steered";
    default:
      return "Sent";
  }
}

/** What the not-yet-written document says. 04 R6.19 */
export const EMPTY_PAGE_STATUS = "Not written yet — the page appears here as soon as the agent saves it";

/** Written into every dirty form's status line while a newer version waits for the reader to pause typing. 05 R2.21 (U49) */
export const UPDATE_DEFERRED_STATUS = "This page has a newer version — it appears when you pause typing; your text is kept.";

/** The status of a form whose identity is gone from the current revision. 02 R-K6; DESIGN §D.4 */
export const FORM_GONE_STATUS = "This page changed and this form is no longer on it; your text is kept — copy it, or discard it from the home page.";

// --- validation ------------------------------------------------------------------

const ERROR_CODES: ReadonlySet<string> = new Set(BRIDGE_ERROR_CODES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const METHOD_PATTERN = /^[a-z][a-zA-Z0-9-]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const REVISION_PATTERN = /^[a-f0-9]{64}$/;
const SUBMISSION_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/** Exactly the required keys plus any subset of the optional ones. */
export function hasKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const own = Object.keys(value);
  return required.every((key) => own.includes(key)) && own.every((key) => required.includes(key) || optional.includes(key));
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

const isNonce = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isOptional = (value: unknown, check: (item: unknown) => boolean): boolean => value === undefined || check(value);

/** A structured-clone `File`, however many realms away. */
export function isFileLike(value: unknown): value is File {
  return typeof value === "object" && value !== null && typeof (value as File).size === "number" && typeof (value as File).name === "string" && typeof (value as File).arrayBuffer === "function";
}

export function isBlobLike(value: unknown): value is Blob {
  return typeof value === "object" && value !== null && typeof (value as Blob).size === "number" && typeof (value as Blob).type === "string" && typeof (value as Blob).arrayBuffer === "function";
}

export function isLeftoverDraft(value: unknown): value is LeftoverDraft {
  return isRecord(value) && hasExactKeys(value, ["session", "documentPath", "key", "label", "field", "value", "reason", "atMs"]) && isSessionIdentity(value.session) && isDocumentPath(value.documentPath) && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 1024 && isText(value.label, 512) && isText(value.field, 512) && typeof value.value === "string" && (value.reason === "not-on-this-version" || value.reason === "field-filled") && isNonce(value.atMs);
}

export function isGrantSummary(value: unknown): value is GrantSummary {
  return isRecord(value) && hasKeys(value, ["sessionId", "title", "grantedAtMs", "lastAnsweredAtMs", "count"], ["from", "fromTitle"]) && isSessionIdentity(value.sessionId) && isText(value.title, 512) && isNonce(value.grantedAtMs) && (value.lastAnsweredAtMs === null || isNonce(value.lastAnsweredAtMs)) && isNonce(value.count) && isOptional(value.from, isSessionIdentity) && isOptional(value.fromTitle, (item) => isText(item, 512));
}

export function isReadyMessage(value: unknown): value is ReadyMessage {
  return isRecord(value) && hasExactKeys(value, ["kind", "v", "pageRevision", "documentPath", "embedded"]) && value.kind === "thread-page:ready" && value.v === HANDSHAKE_VERSION && typeof value.pageRevision === "string" && REVISION_PATTERN.test(value.pageRevision) && isDocumentPath(value.documentPath) && typeof value.embedded === "boolean";
}

export function isSubmitAnswer(value: unknown): value is SubmitAnswer {
  return isRecord(value) && hasExactKeys(value, ["name", "label", "value"]) && isText(value.name, 128) && isText(value.label, 300) && (typeof value.value === "boolean" || isText(value.value, LIMITS.answerValueChars) || (Array.isArray(value.value) && value.value.length <= LIMITS.answerListItems && value.value.every((item) => isText(item, 2000))));
}

export function isSubmitFile(value: unknown): value is SubmitFile {
  return isRecord(value) && hasKeys(value, ["field", "file"], ["transcribe"]) && isText(value.field, 128) && isFileLike(value.file) && isOptional(value.transcribe, (item) => typeof item === "boolean");
}

/** The shell checks every bridge request before it leaves the reader's browser. 05 R3.7, R3.9 */
export function isBridgeRequest(value: unknown, pageRevision?: string): value is BridgeRequestMessage {
  if (!isRecord(value)) return false;
  if (!hasKeys(value, ["v", "id", "method", "params", "pageRevision"], ["scope", "files"])) return false;
  if ("scope" in value && !isCanonicalScope(value.scope)) return false;
  if ("files" in value && !(Array.isArray(value.files) && value.files.every(isFileLike))) return false;
  return value.v === BRIDGE_VERSION && isValidRequestId(value.id) && typeof value.method === "string" && value.method.length >= 3 && value.method.length <= LIMITS.methodNameChars && METHOD_PATTERN.test(value.method) && typeof value.pageRevision === "string" && REVISION_PATTERN.test(value.pageRevision) && (pageRevision === undefined || value.pageRevision === pageRevision);
}

/** Both sides check every response; an unexpected shape is `invalid_response`. 02 R4.32 */
export function isBridgeResponse(value: unknown, expectedId?: string): value is BridgeResponseMessage {
  if (!isRecord(value) || value.v !== BRIDGE_VERSION || typeof value.id !== "string" || typeof value.ok !== "boolean") return false;
  if (expectedId !== undefined && value.id !== expectedId) return false;
  if (value.ok === true) return hasExactKeys(value, ["v", "id", "ok", "result"]);
  if (!hasExactKeys(value, ["v", "id", "ok", "error"]) || !isRecord(value.error)) return false;
  const error = value.error;
  if (!hasKeys(error, ["code", "message"], ["reason", "detail"])) return false;
  if ("reason" in error && (typeof error.reason !== "string" || !REASON_PATTERN.test(error.reason))) return false;
  if ("detail" in error && !("reason" in error)) return false;
  return typeof error.code === "string" && ERROR_CODES.has(error.code) && typeof error.message === "string" && error.message.length > 0 && error.message.length <= LIMITS.errorMessageChars;
}

/** Every message the shell (or an embedding kernel) accepts from a kernel; anything else is dropped. 05 R3.9 */
export function isKernelMessage(value: unknown): value is KernelMessage {
  if (!isRecord(value)) return false;
  if (!("kind" in value)) return isBridgeRequest(value);
  switch (value.kind) {
    case "thread-page:dirty":
      return hasExactKeys(value, ["kind", "custom"]) && typeof value.custom === "boolean";
    case "thread-page:typing":
      return hasExactKeys(value, ["kind", "active"]) && typeof value.active === "boolean";
    case "thread-page:clean":
    case "thread-page:escape":
      return hasExactKeys(value, ["kind"]);
    case "thread-page:draft-discard":
      return hasExactKeys(value, ["kind", "session", "documentPath", "key", "field"]) && isSessionIdentity(value.session) && isDocumentPath(value.documentPath) && isText(value.key, 1024) && typeof value.key === "string" && value.key.length > 0 && isText(value.field, 512);
    case "thread-page:grant-revoke":
      return hasExactKeys(value, ["kind", "from", "to"]) && isSessionIdentity(value.from) && isSessionIdentity(value.to);
    case "thread-page:submit":
      return (
        hasExactKeys(value, ["kind", "submissionId", "title", "writtenAgainst", "formId", "formTitle", "action", "answers", "files"]) &&
        (value.action === null || isText(value.action, LIMITS.answerValueChars)) &&
        typeof value.submissionId === "string" &&
        SUBMISSION_ID.test(value.submissionId) &&
        isText(value.title, 300) &&
        typeof value.writtenAgainst === "string" &&
        REVISION_PATTERN.test(value.writtenAgainst) &&
        (value.formId === null || isText(value.formId, 300)) &&
        (value.formTitle === null || isText(value.formTitle, 300)) &&
        Array.isArray(value.answers) &&
        value.answers.length <= LIMITS.answersPerSubmission &&
        value.answers.every(isSubmitAnswer) &&
        Array.isArray(value.files) &&
        value.files.length <= LIMITS.uploadsPerForm &&
        value.files.every(isSubmitFile)
      );
    case "thread-page:open-document":
      return hasKeys(value, ["kind", "path"], ["fragment", "query"]) && isDocumentPath(value.path) && isOptional(value.fragment, (item) => isText(item, LIMITS.fragmentChars)) && isOptional(value.query, (item) => isText(item, LIMITS.documentQueryChars));
    case "thread-page:open-file":
      return hasExactKeys(value, ["kind", "path", "download", "name"]) && isOwnFilePath(value.path) && typeof value.download === "boolean" && (value.name === null || isText(value.name, 255));
    case "thread-page:file-request":
      return hasKeys(value, ["kind", "id", "path", "purpose"], ["init"]) && isValidRequestId(value.id) && isOwnFilePath(value.path) && (value.purpose === "media" || value.purpose === "fetch") && isOptional(value.init, (item) => isRecord(item) && hasExactKeys(item, ["method"]) && (item.method === "GET" || item.method === "HEAD"));
    case "thread-page:fragment":
      return hasKeys(value, ["kind", "fragment"], ["step"]) && isText(value.fragment, LIMITS.fragmentChars) && isOptional(value.step, (item) => item === true);
    case "thread-page:scroll":
      return hasExactKeys(value, ["kind", "state"]) && isScrollState(value.state);
    case "thread-page:draft":
      return (
        hasKeys(value, ["kind", "form", "fields", "focus", "cleared"], ["embed"]) &&
        isDraftFormRef(value.form) &&
        isDraftFields(value.fields) &&
        (value.focus === null || (isRecord(value.focus) && hasExactKeys(value.focus, ["name", "selectionStart", "selectionEnd"]) && isText(value.focus.name, 512) && isNonce(value.focus.selectionStart) && isNonce(value.focus.selectionEnd))) &&
        Array.isArray(value.cleared) &&
        value.cleared.every((item) => isText(item, 512)) &&
        isOptional(value.embed, (item) => isRecord(item) && hasExactKeys(item, ["sessionId", "documentPath"]) && isSessionId(item.sessionId) && isDocumentPath(item.documentPath))
      );
    case "thread-page:flushed":
    case "thread-page:pong":
      return hasExactKeys(value, ["kind", "nonce"]) && isNonce(value.nonce);
    case "thread-page:restored":
      return hasExactKeys(value, ["kind", "nonce", "firstPaintToRestoreMs"]) && isNonce(value.nonce) && (value.firstPaintToRestoreMs === null || (typeof value.firstPaintToRestoreMs === "number" && Number.isFinite(value.firstPaintToRestoreMs)));
    case "thread-page:record":
      return (
        hasKeys(value, ["kind", "id", "purpose"], ["prompt", "language", "maxDurationSeconds", "keepAudio", "control"]) &&
        isValidRequestId(value.id) &&
        (value.purpose === "dictate" || value.purpose === "audio" || value.purpose === "capability") &&
        isOptional(value.prompt, (item) => isText(item, LIMITS.voicePromptChars)) &&
        isOptional(value.language, (item) => isText(item, 35)) &&
        isOptional(value.maxDurationSeconds, (item) => isNonce(item) && item >= 1 && item <= LIMITS.voiceMaxSeconds) &&
        isOptional(value.keepAudio, (item) => typeof item === "boolean") &&
        isOptional(value.control, (item) => item === true)
      );
    case "thread-page:embed-dirty":
      return hasExactKeys(value, ["kind", "dirty"]) && typeof value.dirty === "boolean";
    case "thread-page:gesture":
      return hasExactKeys(value, ["kind", "atMs"]) && typeof value.atMs === "number" && Number.isFinite(value.atMs);
    default:
      return false;
  }
}

/** Every message a kernel accepts from the shell (or the embedding kernel); anything else is dropped. 05 R3.9 */
export function isShellMessage(value: unknown): value is ShellMessage {
  if (!isRecord(value)) return false;
  if (!("kind" in value)) return isBridgeResponse(value);
  switch (value.kind) {
    case "thread-page:ping":
    case "thread-page:restore-now":
    case "thread-page:flush":
      return hasExactKeys(value, ["kind", "nonce"]) && isNonce(value.nonce);
    case "thread-page:shown":
      return hasExactKeys(value, ["kind"]);
    case "thread-page:update":
      return hasExactKeys(value, ["kind", "available"]) && typeof value.available === "boolean";
    case "thread-page:source-state":
      return hasExactKeys(value, ["kind", "stale", "archived", "reason"]) && typeof value.stale === "boolean" && typeof value.archived === "boolean" && (value.reason === null || isText(value.reason, LIMITS.errorMessageChars));
    case "thread-page:session-state":
      return hasExactKeys(value, ["kind", "working", "label"]) && typeof value.working === "boolean" && isText(value.label, LIMITS.errorMessageChars);
    case "thread-page:drafts":
      return hasExactKeys(value, ["kind", "leftovers"]) && Array.isArray(value.leftovers) && value.leftovers.every(isLeftoverDraft);
    case "thread-page:grants":
      return hasExactKeys(value, ["kind", "grants"]) && Array.isArray(value.grants) && value.grants.every(isGrantSummary);
    case "thread-page:restore":
      return (
        hasKeys(value, ["kind", "nonce", "scroll", "drafts", "clearedNotice"], ["leftovers"]) &&
        isNonce(value.nonce) &&
        (value.scroll === null || isScrollState(value.scroll)) &&
        Array.isArray(value.drafts) &&
        value.drafts.every(isDraftRecord) &&
        Array.isArray(value.clearedNotice) &&
        value.clearedNotice.every((item) => isRecord(item) && hasExactKeys(item, ["form", "fields"]) && isDraftFormRef(item.form) && Array.isArray(item.fields) && item.fields.every((field) => isText(field, 512))) &&
        isOptional(value.leftovers, (item) => Array.isArray(item) && item.every(isLeftoverDraft))
      );
    case "thread-page:submit-progress":
      return hasExactKeys(value, ["kind", "submissionId", "message"]) && typeof value.submissionId === "string" && SUBMISSION_ID.test(value.submissionId) && isText(value.message, LIMITS.errorMessageChars);
    case "thread-page:submit-result":
      return (
        hasKeys(value, ["kind", "submissionId", "ok"], ["delivery", "matchedRevision", "revisionChanged", "error", "message"]) &&
        typeof value.submissionId === "string" &&
        SUBMISSION_ID.test(value.submissionId) &&
        typeof value.ok === "boolean" &&
        isOptional(value.delivery, (item) => item === "started" || item === "queued" || item === "steered") &&
        isOptional(value.matchedRevision, (item) => typeof item === "string" && REVISION_PATTERN.test(item)) &&
        isOptional(value.revisionChanged, (item) => typeof item === "boolean") &&
        isOptional(value.error, (item) => typeof item === "string" && ERROR_CODES.has(item)) &&
        isOptional(value.message, (item) => isText(item, LIMITS.errorMessageChars))
      );
    case "thread-page:file":
      if (!isValidRequestId(value.id) || typeof value.status !== "number" || !Number.isSafeInteger(value.status)) return false;
      if (value.ok === true) return hasExactKeys(value, ["kind", "id", "ok", "status", "contentType", "blob"]) && isText(value.contentType, 255) && isBlobLike(value.blob);
      return value.ok === false && hasExactKeys(value, ["kind", "id", "ok", "status", "error"]) && isText(value.error, LIMITS.errorMessageChars);
    case "thread-page:voice":
      return hasExactKeys(value, ["kind", "available", "reason"]) && typeof value.available === "boolean" && (value.reason === null || isText(value.reason, LIMITS.errorMessageChars));
    case "thread-page:recorded":
      if (!isValidRequestId(value.id)) return false;
      if (value.ok === true) return hasKeys(value, ["kind", "id", "ok"], ["text", "file", "audio"]) && isOptional(value.text, (item) => typeof item === "string") && isOptional(value.file, isFileLike) && isOptional(value.audio, isBlobLike);
      return value.ok === false && hasExactKeys(value, ["kind", "id", "ok", "code", "message"]) && typeof value.code === "string" && ERROR_CODES.has(value.code) && isText(value.message, LIMITS.errorMessageChars);
    case "thread-page:draft-notice":
      return hasExactKeys(value, ["kind", "text"]) && isText(value.text, LIMITS.errorMessageChars);
    default:
      return false;
  }
}

export function makeFailure(id: unknown, code: BridgeErrorCode, message: string, reason?: string, detail?: unknown): BridgeResponseMessage {
  // `detail` rides only under a `reason`, as the server's envelope has it (03 R5.41b). RS-5
  const error = { code, message: message.slice(0, LIMITS.errorMessageChars) || "Request failed", ...(reason ? { reason, ...(detail !== undefined ? { detail } : {}) } : {}) };
  return { v: BRIDGE_VERSION, id: isValidRequestId(id) ? id : "invalid", ok: false, error };
}

/** The configuration a runtime reads from its script element's `data-config`. */
export function readConfig<T>(script: { getAttribute(name: string): string | null } | null): T {
  const raw = script?.getAttribute("data-config");
  if (!raw) throw new Error("The page runtime's configuration is missing");
  return JSON.parse(raw) as T;
}
