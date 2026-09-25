import type { Context } from "hono";
import { decodeBridgeRequest, resolveInvocation } from "../domain/capabilities/protocol.ts";
import type { PromptFile } from "../domain/capabilities/specs.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { challengeMatches, openChallenge } from "../domain/tokens/confirmation.ts";
import { fingerprint } from "../domain/json/canonical.ts";
import type { AttachmentHost } from "../host/contract.ts";
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

/** What a reader approved: the call, bound as its challenge bound it. */
export interface ApprovedCall {
  readonly session: string;
  readonly revision: string;
  readonly requestId: string;
  readonly method: string;
  readonly paramsHash: string;
}

/**
 * The upload grant of an approved call: minted by its first upload under a
 * valid challenge, it outlives the challenge so a slow connection can finish,
 * and lets the call itself through once every approved file is held. Used
 * once: after the call takes its files, or they are discarded, it is spent.
 * spec R3.20a, R5.78, R5.79
 */
export interface HeldCall {
  readonly approved: ApprovedCall;
  readonly projectId: string;
  readonly files: readonly PromptFile[];
  readonly entries: (HeldAttachment | undefined)[];
  expiresAt: number;
}

export interface HeldAttachments {
  /** The grant for an approved call, opened by its first upload; null when that call was already used or is another. */
  open(key: string, call: { approved: ApprovedCall; projectId: string; files: readonly PromptFile[] }, now: number): HeldCall | null;
  get(key: string, now: number): HeldCall | undefined;
  isSpent(key: string, now: number): boolean;
  put(key: string, index: number, held: HeldAttachment, now: number): boolean;
  /** Removes the grant and spends it; what it held comes with it. */
  take(key: string, now: number): HeldCall | undefined;
}

/** `onExpired`: a grant that ran out still holds attachments nothing will use. */
export function createHeldAttachments(onExpired: (call: HeldCall) => void = () => undefined): HeldAttachments {
  const calls = new Map<string, HeldCall>();
  const spent = new Map<string, number>();
  function prune(now: number): void {
    for (const [key, call] of calls) {
      if (call.expiresAt > now) continue;
      calls.delete(key);
      spent.set(key, now + LIMITS.attachGrantMs);
      onExpired(call);
    }
    for (const [key, until] of spent) if (until <= now) spent.delete(key);
    while (calls.size > 256) {
      const oldest = calls.keys().next().value;
      if (oldest === undefined) break;
      const call = calls.get(oldest);
      calls.delete(oldest);
      if (call) onExpired(call);
    }
  }
  return {
    open(key, call, now) {
      prune(now);
      if (spent.has(key)) return null;
      const existing = calls.get(key);
      if (existing) return existing.approved.paramsHash === call.approved.paramsHash && existing.approved.revision === call.approved.revision ? existing : null;
      const held: HeldCall = { ...call, entries: [], expiresAt: now + LIMITS.attachGrantMs };
      calls.set(key, held);
      return held;
    },
    get(key, now) {
      prune(now);
      return calls.get(key);
    },
    isSpent(key, now) {
      prune(now);
      return spent.has(key);
    },
    put(key, index, held, now) {
      prune(now);
      const call = calls.get(key);
      if (!call || call.entries[index] !== undefined) return false;
      call.entries[index] = held;
      return true;
    },
    take(key, now) {
      prune(now);
      const call = calls.get(key);
      calls.delete(key);
      spent.set(key, now + LIMITS.attachGrantMs);
      return call;
    },
  };
}

export function heldKey(session: string, requestId: string): string {
  return `${session}:${requestId}`;
}

function sameCall(a: ApprovedCall, b: ApprovedCall): boolean {
  return a.session === b.session && a.revision === b.revision && a.requestId === b.requestId && a.method === b.method && a.paramsHash === b.paramsHash;
}

/**
 * Whether an approved call's grant covers the call itself: every approved
 * file is held for exactly this call. The call may then arrive after its
 * challenge ran out, since the uploads did not. spec R3.20a
 */
export function grantCovers(serving: ServingContext, approved: ApprovedCall): boolean {
  const call = serving.attachments.get(heldKey(approved.session, approved.requestId), serving.now());
  return call !== undefined && sameCall(call.approved, approved) && call.entries.length === call.files.length && call.files.every((_, index) => call.entries[index] !== undefined);
}

/**
 * Attachments stored for a call that will not use them: removed where the
 * host can, and otherwise logged one by one — project and path — so the
 * operator can find them. Returns how many stay. spec R5.79, R8.36
 */
export async function releaseHeld(serving: ServingContext, held: readonly (HeldAttachment | undefined)[], why: string): Promise<number> {
  let kept = 0;
  for (const entry of held) {
    if (!entry) continue;
    if (serving.host.attachments?.remove) {
      try {
        await serving.host.attachments.remove(entry.projectId, entry.attachment);
        continue;
      } catch (error) {
        serving.host.log.warn(`attach: could not remove ${entry.attachment.path} from project ${entry.projectId}: ${errorText(error)}`);
      }
    }
    kept += 1;
    serving.host.log.warn(`attach: attachment ${entry.attachment.path} stays in project ${entry.projectId}, attached to nothing (${why})`);
  }
  return kept;
}

/** How an error names attachments that could not be removed. */
export function keptNote(kept: number): string {
  if (kept === 0) return "";
  return ` ${kept === 1 ? "One file already attached stays" : `${kept} files already attached stay`} in the project's attachments, attached to nothing: this host cannot remove them.`;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A size in the words the confirmation and the refusals use. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KiB`;
  return mebibytes(bytes);
}

/** The count and size limits of a call's files, checked before any dialog. spec R5.77 */
export function checkPromptFiles(files: readonly PromptFile[] | undefined, host: AttachmentHost | undefined): void {
  if (!files || files.length === 0) return;
  if (files.length > LIMITS.promptFiles) throw new PageError("request_too_large", `At most ${LIMITS.promptFiles} files per call; this one has ${files.length}`);
  for (const file of files) {
    if (file.size > LIMITS.promptFileBytes) throw new PageError("request_too_large", `“${file.name}” is ${sizeLabel(file.size)}; each file may be at most ${mebibytes(LIMITS.promptFileBytes)}`);
    if (file.size === 0) throw new PageError("invalid_params", `“${file.name}” is empty`);
  }
  // A host that cannot attach must not start or send without the files. spec R5.80
  if (!host) throw new PageError("unavailable", "This host cannot attach files to a prompt; nothing was started or sent");
  // What the host itself would refuse is refused now, before the reader is asked.
  for (const file of files) {
    const refusal = host.refusal?.(file);
    if (refusal) throw refusal;
  }
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
 * before anything is started or sent. The grant is spent either way; what
 * does not match is released. spec R3.20a
 */
export async function approvedAttachments(serving: ServingContext, session: string, requestId: string, projectId: string, files: readonly PromptFile[] | undefined): Promise<PromptAttachment[]> {
  if (!files || files.length === 0) return [];
  const call = serving.attachments.take(heldKey(session, requestId), serving.now());
  const held = call?.entries ?? [];
  const matches =
    call !== undefined &&
    held.length === files.length &&
    files.every((file, index) => {
      const entry = held[index];
      return entry !== undefined && entry.projectId === projectId && entry.file.name === file.name && entry.file.type === file.type && entry.attachment.sizeBytes === file.size;
    });
  if (!matches) {
    const kept = await releaseHeld(serving, held, "they did not match the approved files");
    throw new PageError("confirmation_invalid", `The files sent are not the ones the reader approved; nothing was started or sent.${keptNote(kept)}`);
  }
  return held.map((entry) => (entry as HeldAttachment).attachment);
}

/** Runs the approved call; if the host then fails, what it would have carried is released. spec R5.79 */
export async function withAttachments<T>(serving: ServingContext, attachments: readonly PromptAttachment[], projectId: string, act: () => Promise<T>): Promise<T> {
  try {
    return await act();
  } catch (error) {
    await releaseHeld(serving, attachments.map((attachment) => ({ projectId, attachment, file: { name: attachment.name, size: attachment.sizeBytes, type: attachment.mimeType } })), "the call failed on the host");
    throw error;
  }
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
      const key = heldKey(token.session, request.id);

      // The end of a call that will not go on: whatever its page's token holds for it is released,
      // with or without a challenge still valid. spec R5.79
      if (envelope.discard === true) {
        const call = serving.attachments.take(key, serving.now());
        const held = call?.entries ?? [];
        const stored = held.filter((entry) => entry !== undefined).length;
        const kept = await releaseHeld(serving, held, `a failed ${request.method}`);
        return jsonResponse({ ok: true, removed: stored - kept, kept });
      }

      const invocation = resolveInvocation(request, serving.registry, token.revision);
      const params = invocation.params as { projectId?: string; sessionId?: string; files?: PromptFile[] };
      const files = params.files ?? [];
      if (files.length === 0) throw new PageError("invalid_request", "This call carries no files");
      const approved: ApprovedCall = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, paramsHash: fingerprint(invocation.params as JsonValue) };
      if (serving.attachments.isSpent(key, serving.now())) throw new PageError("confirmation_invalid", "This approved call was already used");
      // The challenge proves the reader approved exactly this call; once a first file is held, the
      // call's upload grant lets the rest through after the challenge ran out.
      const challenge = typeof envelope.confirmation === "string" ? openChallenge(envelope.confirmation, serving.signingKey, serving.now()) : null;
      const challenged = challenge !== null && challengeMatches(challenge, { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params as JsonValue });
      const granted = serving.attachments.get(key, serving.now());
      if (!challenged && !(granted && sameCall(granted.approved, approved))) throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");

      const index = envelope.index;
      if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= files.length) throw new PageError("invalid_request", "No such file in this call");
      const file = files[index] as PromptFile;
      checkPromptFiles([file], serving.host.attachments);
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
      const call = serving.attachments.open(key, { approved, projectId, files }, serving.now());
      if (!call || call.projectId !== projectId) throw new PageError("confirmation_invalid", "This approved call was already used");
      if (call.entries[index] !== undefined) throw new PageError("conflict", `“${file.name}” was already attached to this call`);
      const attachment = await serving.host.attachments!.upload(projectId, { name: file.name, mimeType: file.type || "application/octet-stream", bytes });
      if (!serving.attachments.put(key, index, { projectId, file, attachment }, serving.now())) {
        // Two uploads of one file raced: the second is not used, and is released like any other.
        const kept = await releaseHeld(serving, [{ projectId, file, attachment }], "it was stored twice for one file");
        throw new PageError("conflict", `“${file.name}” was already attached to this call.${keptNote(kept)}`);
      }
      return jsonResponse({ ok: true, index, kind: attachment.kind });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /attach", false);
    } finally {
      release?.();
    }
  };
}
