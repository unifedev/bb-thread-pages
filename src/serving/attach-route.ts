import type { Context } from "hono";
import { decodeBridgeRequest, resolveInvocation } from "../domain/capabilities/protocol.ts";
import type { PromptFile } from "../domain/capabilities/specs.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { challengeMatches, openChallenge } from "../domain/tokens/confirmation.ts";
import type { PromptAttachment } from "../host/types.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import { BUILTIN_HOME_PAGE, isBuiltinHome } from "./builtin-home.ts";
import type { ServingContext } from "./context.ts";
import { failureResponse, jsonResponse } from "./responses.ts";
import { eligibleSession } from "./session-access.ts";

/**
 * Files with `sessions.start` and `sessions.send`: after the reader approved
 * the call, the shell stores each file it holds as an attachment of the
 * target project, one request each, and only then sends the approved call
 * itself, which carries them beside the prompt. spec R5.75–R5.80, R3.20a, D40
 */
export const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send"]);

export interface HeldAttachment {
  readonly projectId: string;
  /** The approved file this is, as the challenge bound it. */
  readonly file: PromptFile;
  readonly attachment: PromptAttachment;
}

/**
 * Attachments stored for an approved call, held until the call arrives (or
 * its challenge could no longer be used). Keyed by page and request id.
 */
export interface HeldAttachments {
  put(key: string, index: number, held: HeldAttachment, now: number): boolean;
  /** Everything held for a call, in index order (a gap is `undefined`), removed from the store. */
  take(key: string, now: number): (HeldAttachment | undefined)[] | undefined;
}

export function createHeldAttachments(): HeldAttachments {
  const calls = new Map<string, { expiresAt: number; entries: (HeldAttachment | undefined)[] }>();
  // Uploads may take a while on a slow connection; the call itself must still arrive within its challenge's life.
  const ttl = LIMITS.confirmationMs * 2;
  function prune(now: number): void {
    for (const [key, call] of calls) if (call.expiresAt <= now) calls.delete(key);
    while (calls.size > 256) {
      const oldest = calls.keys().next().value;
      if (oldest === undefined) break;
      calls.delete(oldest);
    }
  }
  return {
    put(key, index, held, now) {
      prune(now);
      const call = calls.get(key) ?? { expiresAt: now + ttl, entries: [] };
      if (call.entries[index] !== undefined) return false;
      call.entries[index] = held;
      calls.set(key, call);
      return true;
    },
    take(key, now) {
      prune(now);
      const call = calls.get(key);
      calls.delete(key);
      return call?.entries;
    },
  };
}

export function heldKey(session: string, requestId: string): string {
  return `${session}:${requestId}`;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A size in the words the confirmation and the refusals use. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KiB`;
  return mebibytes(bytes);
}

/** The count and size limits of a call's files, checked before any dialog. spec R5.77 */
export function checkPromptFiles(files: readonly PromptFile[] | undefined, attachable: boolean): void {
  if (!files || files.length === 0) return;
  if (files.length > LIMITS.promptFiles) throw new PageError("request_too_large", `At most ${LIMITS.promptFiles} files per call; this one has ${files.length}`);
  for (const file of files) {
    if (file.size > LIMITS.promptFileBytes) throw new PageError("request_too_large", `“${file.name}” is ${sizeLabel(file.size)}; each file may be at most ${mebibytes(LIMITS.promptFileBytes)}`);
    if (file.size === 0) throw new PageError("invalid_params", `“${file.name}” is empty`);
  }
  // A host that cannot attach must not start or send without the files. spec R5.80
  if (!attachable) throw new PageError("unavailable", "This host cannot attach files to a prompt; nothing was started or sent");
}

/** Where a call's files go: the start's project, or the project of the session a send goes to. spec R5.76 */
export async function targetProject(serving: ServingContext, method: string, params: { projectId?: string; sessionId?: string }): Promise<string> {
  if (method === "sessions.start" && typeof params.projectId === "string") return params.projectId;
  const target = typeof params.sessionId === "string" ? await serving.host.sessions.get(params.sessionId) : null;
  if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
  if (!target.projectId) throw new PageError("unavailable", "That session has no project to attach files to");
  return target.projectId;
}

/**
 * The attachments the shell stored for an approved call, checked against the
 * files the challenge bound — count, name, size as stored, type, in order —
 * before anything is started or sent. spec R3.20a
 */
export function approvedAttachments(serving: ServingContext, session: string, requestId: string, projectId: string, files: readonly PromptFile[] | undefined): PromptAttachment[] {
  if (!files || files.length === 0) return [];
  const held = serving.attachments.take(heldKey(session, requestId), serving.now());
  const mismatch = (): PageError => {
    const stored = (held ?? []).filter((entry): entry is HeldAttachment => entry !== undefined);
    if (stored.length > 0) serving.host.log.warn(`attach: ${stored.length} attachment(s) stored for ${requestId} did not match the approved files and were not used`);
    return new PageError("confirmation_invalid", "The files sent are not the ones the reader approved; nothing was started or sent");
  };
  if (!held || held.length !== files.length) throw mismatch();
  return files.map((file, index) => {
    const entry = held[index];
    if (!entry || entry.projectId !== projectId || entry.file.name !== file.name || entry.file.type !== file.type || entry.attachment.sizeBytes !== file.size) throw mismatch();
    return entry.attachment;
  });
}

/**
 * `POST /attach` — one file of an approved `sessions.start`/`sessions.send`,
 * base64 in a JSON envelope, stored as an attachment of the target project;
 * or, with `discard`, the end of a call whose upload failed part-way: what was
 * stored for it is removed where the host can, and logged where it cannot.
 * The request carries the call and its challenge, so only an approved call's
 * own files, each exactly as approved, are stored. spec R3.20a, R5.78, R5.79
 */
export function attachRoute(serving: ServingContext) {
  const maxBody = Math.ceil((LIMITS.promptFileBytes * 4) / 3) + LIMITS.capabilityPayloadBytes + 2 * LIMITS.tokenChars + 8_192;
  return async (context: Context): Promise<Response> => {
    let release: (() => void) | null = null;
    try {
      const body = await readJsonBody(context, maxBody);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PageError("invalid_request", "Invalid attachment envelope");
      const envelope = body as Record<string, unknown>;
      if (Object.keys(envelope).some((key) => !["actionToken", "request", "confirmation", "index", "content", "discard"].includes(key))) {
        throw new PageError("invalid_request", "Invalid attachment envelope");
      }
      const token = requireActionToken(serving, envelope.actionToken);
      release = acquireRate(serving, token.session);
      const request = decodeBridgeRequest(envelope.request);
      if (!FILE_METHODS.has(request.method)) throw new PageError("invalid_request", "Only sessions.start and sessions.send carry files");
      const invocation = resolveInvocation(request, serving.registry, token.revision);
      const params = invocation.params as { projectId?: string; sessionId?: string; files?: PromptFile[] };
      const files = params.files ?? [];
      if (files.length === 0) throw new PageError("invalid_request", "This call carries no files");
      const challenge = typeof envelope.confirmation === "string" ? openChallenge(envelope.confirmation, serving.signingKey, serving.now()) : null;
      const binding = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params as JsonValue };
      if (!challenge || !challengeMatches(challenge, binding)) throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");
      const key = heldKey(token.session, request.id);

      if (envelope.discard === true) {
        const held = (serving.attachments.take(key, serving.now()) ?? []).filter((entry): entry is HeldAttachment => entry !== undefined);
        let removed = 0;
        for (const entry of held) {
          if (!serving.host.attachments?.remove) continue;
          try {
            await serving.host.attachments.remove(entry.projectId, entry.attachment);
            removed += 1;
          } catch (error) {
            serving.host.log.warn(`attach: could not remove ${entry.attachment.path} from project ${entry.projectId}: ${errorText(error)}`);
          }
        }
        if (held.length > removed) {
          // Stored, attached to nothing, and left where the host keeps attachments. spec R5.79, R8.36
          serving.host.log.warn(`attach: ${held.length - removed} attachment(s) of a failed ${request.method} stay in project ${held[0]?.projectId ?? "?"}: ${held.map((entry) => entry.attachment.path).join(", ")}`);
        }
        return jsonResponse({ ok: true, removed, kept: held.length - removed });
      }

      const index = envelope.index;
      if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= files.length) throw new PageError("invalid_request", "No such file in this call");
      const file = files[index] as PromptFile;
      checkPromptFiles([file], serving.host.attachments !== undefined);
      if (!isBuiltinHome(token.session)) {
        await eligibleSession(serving, token.session);
        const page = await serving.pages.load(token.session, token.path);
        if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
        if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      } else if (BUILTIN_HOME_PAGE.revision !== token.revision) {
        throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      }
      if (typeof envelope.content !== "string" || !BASE64.test(envelope.content)) throw new PageError("invalid_request", "The file must be base64");
      const bytes = Buffer.from(envelope.content, "base64");
      // Exactly the approved file: its size as the shell read it. spec R3.20a
      if (bytes.byteLength !== file.size) throw new PageError("confirmation_invalid", `“${file.name}” is not the file the reader approved`);
      const projectId = await targetProject(serving, request.method, params);
      const attachment = await serving.host.attachments!.upload(projectId, { name: file.name, mimeType: file.type || "application/octet-stream", bytes });
      if (!serving.attachments.put(key, index, { projectId, file, attachment }, serving.now())) {
        serving.host.log.warn(`attach: ${attachment.path} was stored twice for one file of ${request.id}; the second is not used`);
        throw new PageError("conflict", `“${file.name}” was already attached to this call`);
      }
      return jsonResponse({ ok: true, index, kind: attachment.kind });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /attach", false);
    } finally {
      release?.();
    }
  };
}
