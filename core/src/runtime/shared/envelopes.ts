// The shell↔server HTTP body and header types (DESIGN §C.3): JSON everywhere, file bytes as base64 (DR-1).
import type { BridgeErrorCode, PageErrorCode } from "../../domain/errors.ts";
import type { BridgeRequest, BridgeResponse, BridgeTransport, NavigationDirective } from "../../domain/capabilities/protocol.ts";
import type { Delivery, GrantSummary } from "./protocol.ts";

export type { BridgeRequest, BridgeResponse, BridgeTransport, NavigationDirective };

/** The shell's conditional poll rides the document route with this header. 05 R2.17, R2.25 */
export const POLL_HEADER = "X-Pages-Poll";
export const WORKING_HEADER = "X-Pages-Working";
export const SOURCE_HEADER = "X-Pages-Source";
export const SESSION_HEADER = "X-Pages-Session";

export type PageSource = "live" | "offline" | "archived";

/** 200 on the poll. */
export interface PollBody {
  revision: string;
  /** Renewed for the current revision. 05 R2.10 */
  actionToken: string;
  expiresAt: number;
  /** With a fresh render token; relative to base(). */
  documentUrl: string;
  working: boolean;
  source: PageSource;
  /** Not written yet. 04 R6.19 */
  empty: boolean;
  deferredFiles: string[];
  grants: GrantSummary[];
  voice: { available: boolean; reason: string | null };
  /** Every read-effect method a hidden frame may call now (DR-12). */
  readMethods: string[];
}

export interface SubmitBody {
  actionToken: string;
  submissionId: string;
  writtenAgainst: string;
  formId: string | null;
  formTitle: string | null;
  title: string;
  /** The submitter's value, its own field — never read from an answer's label. 05 R2.36 */
  action: string | null;
  answers: { name: string; label: string; value: string | string[] | boolean }[];
  /** As `/upload` returned them. */
  files: { field: string; name: string; path: string; sizeBytes: number; transcript?: string | null }[];
}

export type SubmitResponse =
  | { ok: true; delivery: Delivery; matchedRevision: string; revisionChanged: boolean; duplicate: boolean }
  | { ok: false; code: BridgeErrorCode | "forbidden"; message: string };

/** `POST /upload`: one file as base64; the envelope ≤ `uploadBodyBytes`. 02 R4.19–R4.24; DR-1 */
export interface UploadBody {
  actionToken: string;
  field: string;
  name: string;
  type: string;
  bytes: string;
}

export type UploadResponse = { ok: true; name: string; path: string; sizeBytes: number } | { ok: false; code: PageErrorCode; message: string };

/** `POST /attach`: one bound file of an approved call. 05 R3.20a; DR-1 */
export interface AttachBody {
  actionToken: string;
  requestId: string;
  method: string;
  /** Absent for `session.reply`. */
  challenge?: string;
  /** The target workspace of a `sessions.start`; the server cannot read it from the challenge, which binds a hash (slice 2, NOTES-slice2). 03 R5.76 */
  workspaceId?: string;
  /** The target session of a `sessions.send`; its workspace receives the file. 03 R5.76 */
  sessionId?: string;
  index: number;
  name: string;
  type: string;
  bytes: string;
}

export type AttachResponse = { ok: true; attachmentId: string } | { ok: false; code: PageErrorCode; message: string };

/** `POST /transcribe`: the recording as base64 with its MIME type. 03 R5.72; DR-1 */
export interface TranscribeBody {
  actionToken: string;
  type: string;
  bytes: string;
  prompt?: string;
  language?: string;
}

export type TranscribeResponse = { ok: true; text: string } | { ok: false; code: PageErrorCode; message: string };

/** `POST /bridge`. */
export interface BridgeEnvelope {
  actionToken: string;
  request: BridgeRequest;
  confirmation?: string | null;
}

/** The reader declined a challenge: what the cooldown is keyed by (DR-10). */
export type DeclinedTarget = { kind: "decision"; session: string; waitId: string } | { kind: "grant"; session: string };

/** What the shell alone may ask the server: a grant revoked (`from` only under the home's token, for any pair on the host), a declined challenge. U49: the session actions of the bar are gone with it. */
export type ChromeActionBody =
  | { actionToken: string; action: "revokeGrant"; target: string; from?: string }
  | { actionToken: string; action: "declined"; requestId: string; target: DeclinedTarget };

export type ChromeActionResponse = { ok: true } | { ok: false; code: PageErrorCode; message: string };

export interface DocumentSessionBody {
  actionToken: string;
  /** A document path or "index.html". */
  path: string;
  /** "" or "?…". 01 R1.12g */
  query: string;
}

export type DocumentSessionResponse =
  | { ok: true; actionToken: string; pageRevision: string; expiresAt: number; documentUrl: string; path: string; query: string; source: PageSource; empty: boolean; deferredFiles: string[] }
  | { ok: false; code: PageErrorCode; message: string };

/** Every failure a route answers with. 05 R2.41 */
export interface RouteFailure {
  ok: false;
  code: PageErrorCode;
  message: string;
  reason?: string;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$|^[A-Za-z0-9_-]*$/;

/** Whether a string is base64 (standard or URL-safe) and its decoded size is within `maxBytes`, checked before decoding. DESIGN §A `readBytesField` */
export function base64Within(value: unknown, maxBytes: number): value is string {
  if (typeof value !== "string" || !BASE64.test(value)) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decoded = Math.floor((value.length * 3) / 4) - padding;
  return decoded <= maxBytes;
}

export function isUploadBody(value: unknown, maxBytes: number): value is UploadBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  return keys.length === 5 && typeof body.actionToken === "string" && typeof body.field === "string" && body.field.length <= 128 && typeof body.name === "string" && body.name.length >= 1 && body.name.length <= 255 && typeof body.type === "string" && body.type.length <= 255 && base64Within(body.bytes, maxBytes);
}

export function isAttachBody(value: unknown, maxBytes: number): value is AttachBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  const allowed = ["actionToken", "requestId", "method", "challenge", "workspaceId", "sessionId", "index", "name", "type", "bytes"];
  if (!keys.every((key) => allowed.includes(key))) return false;
  return typeof body.actionToken === "string" && typeof body.requestId === "string" && typeof body.method === "string" && (body.challenge === undefined || typeof body.challenge === "string") && (body.workspaceId === undefined || typeof body.workspaceId === "string") && (body.sessionId === undefined || typeof body.sessionId === "string") && typeof body.index === "number" && Number.isSafeInteger(body.index) && body.index >= 0 && typeof body.name === "string" && body.name.length >= 1 && body.name.length <= 255 && typeof body.type === "string" && body.type.length <= 255 && base64Within(body.bytes, maxBytes);
}

export function isTranscribeBody(value: unknown, maxBytes: number): value is TranscribeBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  const allowed = ["actionToken", "type", "bytes", "prompt", "language"];
  if (!Object.keys(body).every((key) => allowed.includes(key))) return false;
  return typeof body.actionToken === "string" && typeof body.type === "string" && body.type.length <= 255 && base64Within(body.bytes, maxBytes) && (body.prompt === undefined || (typeof body.prompt === "string" && body.prompt.length <= 1000)) && (body.language === undefined || (typeof body.language === "string" && body.language.length <= 35));
}

export function isChromeActionBody(value: unknown): value is ChromeActionBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.actionToken !== "string") return false;
  const keys = Object.keys(body).sort().join(",");
  switch (body.action) {
    case "revokeGrant":
      return (keys === "action,actionToken,target" || (keys === "action,actionToken,from,target" && typeof body.from === "string" && body.from.length > 0 && body.from.length <= 128)) && typeof body.target === "string" && body.target.length > 0 && body.target.length <= 128;
    case "declined": {
      if (keys !== "action,actionToken,requestId,target" || typeof body.requestId !== "string") return false;
      const target = body.target as Record<string, unknown> | null;
      if (typeof target !== "object" || target === null || typeof target.session !== "string") return false;
      if (target.kind === "grant") return Object.keys(target).length === 2;
      return target.kind === "decision" && Object.keys(target).length === 3 && typeof target.waitId === "string";
    }
    default:
      return false;
  }
}

export function isDocumentSessionBody(value: unknown): value is DocumentSessionBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 3 && typeof body.actionToken === "string" && typeof body.path === "string" && typeof body.query === "string";
}
