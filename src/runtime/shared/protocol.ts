/**
 * What crosses the one MessagePort between the kernel (inside the sandboxed
 * document) and the shell (trusted chrome), and the configuration each side
 * receives from the server. Shared so neither side can drift. spec R2.3, R3.8
 */
import { BRIDGE_ERROR_CODES, type BridgeErrorCode } from "../../domain/errors.ts";

export const HANDSHAKE_VERSION = 1 as const;
export const BRIDGE_VERSION = 1 as const;

export interface BridgeRequestMessage {
  v: 1;
  id: string;
  method: string;
  params: unknown;
  pageRevision: string;
  /**
   * The files a `sessions.start` or `sessions.send` carries, by structured
   * clone beside the JSON parameters, never inside them. spec R5.75
   */
  files?: File[];
}

export type BridgeResponseMessage =
  | { v: 1; id: string; ok: true; result: unknown }
  | { v: 1; id: string; ok: false; error: { code: BridgeErrorCode; message: string; reason?: string; detail?: unknown } };

export interface SubmitFile {
  field: string;
  file: File;
  /** A recording the shell transcribes at submit: an audio capture input's file, or audio attached to a text area. spec R4.24b */
  transcribe?: boolean;
}

/** What the kernel asks the shell's recorder for: text for a text area, or a file for an audio capture input. spec R4.58, R4.24a */
export type RecordPurpose = "dictate" | "audio";

export interface SubmitAnswer {
  name: string;
  label: string;
  value: string | string[] | boolean;
}

export type KernelMessage =
  | { kind: "thread-page:dirty" }
  | { kind: "thread-page:clean" }
  | { kind: "thread-page:submit"; submissionId: string; title: string; answers: SubmitAnswer[]; files: SubmitFile[] }
  /** A link to another document of the page: the shell opens it in place. spec R1.12a */
  | { kind: "thread-page:open-document"; path: string }
  /** Where the document is scrolled to, so a refresh can return there. spec R2.18b, R4.45 */
  | { kind: "thread-page:scroll"; x: number; y: number }
  /** Inside an embed: the reader accepted the offered new version. spec R4.46 */
  | { kind: "thread-page:apply-update" }
  /** A link to one of the page's own files that is not a document: the shell downloads it or opens it in a new tab. spec R4.15b, D33 */
  | { kind: "thread-page:open-file"; path: string; download: boolean; name: string | null }
  /** An own media file too large to carry: the shell fetches it and hands the bytes back. spec R4.25a, D37 */
  | { kind: "thread-page:file-request"; id: string; path: string }
  /** Dictate, or an audio capture input: open the shell's recording bar. spec R4.58, R4.24a, D38 */
  | { kind: "thread-page:record"; id: string; purpose: RecordPurpose; prompt?: string }
  | BridgeRequestMessage;

export type ShellMessage =
  | { kind: "thread-page:source-state"; stale: boolean }
  /** After a refresh: return to where the previous document was scrolled. spec R2.18b */
  | { kind: "thread-page:restore-scroll"; x: number; y: number }
  /** Inside an embed: a new version exists and the document is dirty. spec R4.46 */
  | { kind: "thread-page:update-available" }
  | { kind: "thread-page:submit-progress"; submissionId: string; message: string }
  | { kind: "thread-page:submit-result"; submissionId: string; ok: boolean; message?: string; error?: string }
  /** The answer to a file request: the file's bytes, or why they cannot come. D37 */
  | { kind: "thread-page:file"; id: string; ok: true; blob: Blob }
  | { kind: "thread-page:file"; id: string; ok: false; error: string }
  /** Whether the reader can record here, so Dictate is shown only where it works. spec R4.59 */
  | { kind: "thread-page:voice"; available: boolean }
  /** A recording's outcome: the transcript for Dictate, the file for an audio capture input. */
  | RecordedMessage
  | BridgeResponseMessage;

export type RecordedMessage =
  | { kind: "thread-page:recorded"; id: string; ok: true; text?: string; file?: File }
  | { kind: "thread-page:recorded"; id: string; ok: false; code: BridgeErrorCode; message: string };

/** Carried in the kernel script's `data-config` attribute. */
export interface KernelConfig {
  pageRevision: string;
  stale: boolean;
  /** The URL the page's own files sit under; links to its HTML documents below it open in place. */
  siteRoot?: string | null;
  /** The document is shown inside another page: its channel leads to that page's kernel. spec R4.48 */
  embedded?: boolean;
  /** Whether its forms can upload; false on the built-in home, which has no session storage. spec R4.60 */
  uploads?: boolean;
}

/** Carried in the shell script's `data-config` attribute. The document fields change when another document of the page opens. */
export interface ShellConfig {
  actionToken: string;
  pageRevision: string;
  expiresAt: number;
  documentUrl: string;
  /** The open document within the page root; the entry document is `index.html`. */
  documentPath: string;
  submitUrl: string;
  uploadUrl: string;
  bridgeUrl: string;
  chromeActionUrl: string;
  /** Where the shell exchanges its token for one bound to another document. */
  documentSessionUrl: string;
  /** Whether links to the page's other documents open in place (not for the built-in home). */
  navigable: boolean;
  /**
   * Where the page's own files are served on this host, for the shell to open,
   * download and fetch them with the reader's credential; null for the
   * built-in home, which has none. spec R4.15b, R4.25a
   */
  filesUrl: string | null;
  /**
   * The own media files the open document defers to the shell (D37). The
   * shell fetches these and nothing else. Follows the document on a switch or
   * a refresh. spec R4.25a
   */
  deferredFiles: string[];
  workingLabel: string;
  stale: boolean;
  /** The agent has not written the page yet; the frame holds host text. spec R6.19 */
  empty: boolean;
  /** A standing line for the status area, such as a home pointer that no longer resolves. spec R7.4 */
  notice: string | null;
  pollMs: number;
  /** The poll while the session is mid-turn, and for a window after the reader answers. spec R2.17a */
  pollWorkingMs: number;
  pollAfterAnswerMs: number;
  /** Whether the session was mid-turn when the shell was served. */
  working: boolean;
  /** How long a refreshed document may load behind the shown one before it is shown anyway. spec R2.18a */
  refreshSwapMs: number;
  /** Pages this page may answer from an embed, for the bar's list. spec R5.65 */
  grants: { sessionId: string; title: string }[];
  maxUploadBytes: number;
  maxUploads: number;
  /**
   * Voice on this host, as it stood when the shell was served: whether a
   * transcription service is configured, and why not. The shell adds what
   * only the reader's browser can tell (R8.37). spec R5.69, R8.35
   */
  voice: { available: boolean; reason: string | null };
  /** Where the shell sends a recording to be transcribed. spec R3.34 */
  transcribeUrl: string;
  /** Where the shell stores the approved files of a `sessions.start` or `sessions.send`. spec R5.76 */
  attachUrl: string;
}

/** What the shell's status says while a page does not exist yet, in chrome the page cannot touch. spec R6.19 */
export const EMPTY_PAGE_STATUS = "Not written yet — the page appears here as soon as the agent saves it";

const ERROR_CODES: ReadonlySet<string> = new Set(BRIDGE_ERROR_CODES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const METHOD_PATTERN = /^[a-z][a-zA-Z0-9-]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** A structured-clone `File`, however many realms away. */
export function isFileLike(value: unknown): value is File {
  return typeof value === "object" && value !== null && typeof (value as File).size === "number" && typeof (value as File).name === "string" && typeof (value as File).arrayBuffer === "function";
}

/** The shell checks every request before it leaves the reader's browser. */
export function isBridgeRequest(value: unknown, pageRevision: string): value is BridgeRequestMessage {
  return (
    isRecord(value) &&
    (hasExactKeys(value, ["v", "id", "method", "params", "pageRevision"]) ||
      (hasExactKeys(value, ["v", "id", "method", "params", "pageRevision", "files"]) && Array.isArray(value.files) && value.files.every(isFileLike))) &&
    value.v === BRIDGE_VERSION &&
    isValidRequestId(value.id) &&
    typeof value.method === "string" &&
    value.method.length >= 3 &&
    value.method.length <= 96 &&
    METHOD_PATTERN.test(value.method) &&
    value.pageRevision === pageRevision
  );
}

/** Both sides check every response; an unexpected shape is `invalid_response`. spec R4.32 */
export function isBridgeResponse(value: unknown, expectedId?: string): value is BridgeResponseMessage {
  if (!isRecord(value) || value.v !== BRIDGE_VERSION || typeof value.id !== "string" || typeof value.ok !== "boolean") return false;
  if (expectedId !== undefined && value.id !== expectedId) return false;
  if (value.ok === true) return hasExactKeys(value, ["v", "id", "ok", "result"]);
  if (!hasExactKeys(value, ["v", "id", "ok", "error"]) || !isRecord(value.error)) return false;
  const error = value.error;
  // A contributed capability's failure may add a declared reason and its detail. spec R4.28a, R5.41b
  const keys = Object.keys(error);
  if (!keys.every((key) => key === "code" || key === "message" || key === "reason" || key === "detail")) return false;
  if ("reason" in error && (typeof error.reason !== "string" || !REASON_PATTERN.test(error.reason))) return false;
  if ("detail" in error && !("reason" in error)) return false;
  return (
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    ERROR_CODES.has(error.code) &&
    typeof error.message === "string" &&
    error.message.length > 0 &&
    error.message.length <= 512
  );
}

/**
 * What a form's status line says once a submission settles. One wording for the
 * shell and for the kernel that relays an embed's answers. spec R4.8, R4.48
 */
export function sentMessage(delivery: unknown): string {
  return typeof delivery === "string" ? `Sent (${delivery})` : "Sent";
}

export function isScrollMessage(value: Record<string, unknown>): value is { kind: "thread-page:scroll"; x: number; y: number } {
  return value.kind === "thread-page:scroll" && typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.y >= 0;
}

export function makeFailure(id: unknown, code: BridgeErrorCode, message: string): BridgeResponseMessage {
  return { v: 1, id: isValidRequestId(id) ? id : "invalid", ok: false, error: { code, message: message.slice(0, 512) || "Request failed" } };
}

export function readConfig<T>(script: Element | null): T {
  const raw = script?.getAttribute("data-config");
  if (!raw) throw new Error("Thread Page runtime: configuration is missing");
  return JSON.parse(raw) as T;
}
