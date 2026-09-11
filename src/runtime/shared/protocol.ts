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
}

export type BridgeResponseMessage =
  | { v: 1; id: string; ok: true; result: unknown }
  | { v: 1; id: string; ok: false; error: { code: BridgeErrorCode; message: string } };

export interface SubmitFile {
  field: string;
  file: File;
}

export interface SubmitAnswer {
  name: string;
  label: string;
  value: string | string[] | boolean;
}

export type KernelMessage =
  | { kind: "thread-page:dirty" }
  | { kind: "thread-page:clean" }
  | { kind: "thread-page:submit"; submissionId: string; title: string; answers: SubmitAnswer[]; files: SubmitFile[] }
  | BridgeRequestMessage;

export type ShellMessage =
  | { kind: "thread-page:source-state"; stale: boolean }
  | { kind: "thread-page:submit-progress"; submissionId: string; message: string }
  | { kind: "thread-page:submit-result"; submissionId: string; ok: boolean; message?: string; error?: string }
  | BridgeResponseMessage;

/** Carried in the kernel script's `data-config` attribute. */
export interface KernelConfig {
  pageRevision: string;
  stale: boolean;
}

/** Carried in the shell script's `data-config` attribute. */
export interface ShellConfig {
  actionToken: string;
  pageRevision: string;
  expiresAt: number;
  documentUrl: string;
  submitUrl: string;
  uploadUrl: string;
  bridgeUrl: string;
  chromeActionUrl: string;
  workingLabel: string;
  stale: boolean;
  pollMs: number;
  maxUploadBytes: number;
  maxUploads: number;
}

const ERROR_CODES: ReadonlySet<string> = new Set(BRIDGE_ERROR_CODES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const METHOD_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;

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

/** The shell checks every request before it leaves the reader's browser. */
export function isBridgeRequest(value: unknown, pageRevision: string): value is BridgeRequestMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["v", "id", "method", "params", "pageRevision"]) &&
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
  return (
    hasExactKeys(error, ["code", "message"]) &&
    typeof error.code === "string" &&
    ERROR_CODES.has(error.code) &&
    typeof error.message === "string" &&
    error.message.length > 0 &&
    error.message.length <= 512
  );
}

export function makeFailure(id: unknown, code: BridgeErrorCode, message: string): BridgeResponseMessage {
  return { v: 1, id: isValidRequestId(id) ? id : "invalid", ok: false, error: { code, message: message.slice(0, 512) || "Request failed" } };
}

export function readConfig<T>(script: Element | null): T {
  const raw = script?.getAttribute("data-config");
  if (!raw) throw new Error("Thread Page runtime: configuration is missing");
  return JSON.parse(raw) as T;
}
