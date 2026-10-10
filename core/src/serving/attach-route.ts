// `POST /attach`: challenge-bound file uploads to `provider.attachments` (05 R3.20a; 03 R5.75–R5.80; DESIGN §C.3, P29).
import { PageError, PUBLIC_MESSAGES, mapProviderError } from "../domain/errors.ts";
import { HOME_IDENTITY, isRequestId, isSessionId } from "../domain/ids.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { EMPTY_REVISION } from "../domain/revision.ts";
import { openChallenge } from "../domain/tokens/confirmation.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { isAttachBody, type AttachResponse } from "../runtime/shared/envelopes.ts";
import { acquireBudget, requireActionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failure, json } from "./responses.ts";
import { isJsonRecord, readBytesField, readJsonBody, requireReader } from "./request.ts";
import { requirePageSession } from "./session-access.ts";
import type { ApprovedCall } from "./stores.d.ts";

/** The methods whose files reach `/attach`. 03 R5.75; DESIGN P29 */
export const ATTACH_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send", "session.reply"]);

/** `session.reply` is never confirmed, so its approved call binds no parameter hash; the dispatcher looks its uploads up under `EMPTY_REVISION`. DESIGN P29 */
export const UNBOUND_PARAMS_HASH = EMPTY_REVISION;

/**
 * One file of an approved call, base64 in a JSON envelope. For
 * `sessions.start`/`sessions.send` the challenge must open and name this
 * session, request and method at the current revision; the upload is
 * recorded under that call (index, name, size, type) so the dispatcher can
 * check the call's bound file list — count, name, size, type, order — before
 * starting or sending. For `session.reply` the action token alone
 * authorises and the own session's workspace receives the file.
 * 05 R3.20a; 03 R5.76–R5.80
 */
export function attachRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      const body = await readJsonBody(request, LIMITS.uploadBodyBytes);
      if (!isJsonRecord(body) || !isAttachBody(body, Number.MAX_SAFE_INTEGER)) throw new PageError("invalid_request", "Invalid attachment envelope");
      const token = requireActionToken(ctx, body.actionToken);
      release = acquireBudget(ctx, token);
      if (!ATTACH_METHODS.has(body.method)) throw new PageError("invalid_request", "Only sessions.start, sessions.send and session.reply carry files");
      if (!isRequestId(body.requestId)) throw new PageError("invalid_request", "Invalid request id");
      const attachments = ctx.provider.attachments;
      if (!attachments) throw new PageError("unavailable", "This host cannot attach files to a prompt; nothing was started or sent");
      const bytes = readBytesField(body, "bytes", LIMITS.promptFileBytes);
      if (bytes.byteLength === 0) throw new PageError("invalid_params", `"${body.name}" is empty`);
      if (bytes.byteLength > LIMITS.promptFileBytes) throw new PageError("request_too_large", `"${body.name}" is ${mebibytes(bytes.byteLength)}; each file may be at most ${mebibytes(LIMITS.promptFileBytes)}`);
      const type = body.type || "application/octet-stream";
      const refusal = attachments.refusal?.({ name: body.name, type, size: bytes.byteLength });
      if (refusal) throw new PageError("request_too_large", refusal);

      const revision = await ctx.currentRevision(token.session, token.path);
      let call: ApprovedCall;
      let workspaceId: string;
      if (body.method === "session.reply") {
        if (token.session === HOME_IDENTITY) throw new PageError("forbidden", PUBLIC_MESSAGES.homeNoSession);
        const access = await ctx.sessionFor(token.session);
        requirePageSession(access);
        if (access.archived) throw new PageError("unavailable", PUBLIC_MESSAGES.archived, { reason: "archived" });
        workspaceId = access.record.workspaceId;
        call = { session: token.session, revision, requestId: body.requestId, method: body.method, paramsHash: UNBOUND_PARAMS_HASH };
      } else {
        const challenge = openChallenge(body.challenge, ctx.signingKey, ctx.now());
        if (!challenge || challenge.kind !== "confirm" || challenge.session !== token.session || challenge.requestId !== body.requestId || challenge.method !== body.method) {
          throw new PageError("confirmation_invalid", PUBLIC_MESSAGES.confirmationInvalid);
        }
        if (challenge.revision !== revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
        workspaceId = await targetWorkspace(ctx, body.method, body.workspaceId, body.sessionId);
        call = { session: token.session, revision, requestId: body.requestId, method: body.method, paramsHash: challenge.paramsHash };
      }
      let uploaded;
      try {
        uploaded = await attachments.upload(workspaceId, bytes, { name: body.name, type });
      } catch (error) {
        throw mapProviderError(error, ctx.log, "attachments.upload");
      }
      ctx.attachGrants.open(call, body.index, { name: body.name, size: bytes.byteLength, type }, { attachmentId: uploaded.attachmentId, name: body.name, type, sizeBytes: bytes.byteLength }, ctx.now());
      const answer: AttachResponse = { ok: true, attachmentId: uploaded.attachmentId };
      return json(200, answer);
    } catch (error) {
      return failure(error, ctx.log, "POST /attach", false);
    } finally {
      release?.();
    }
  };
}

/** Where a call's files go: the start's workspace, or the workspace of the session a send goes to. 03 R5.76 */
async function targetWorkspace(ctx: ServingContext, method: string, workspaceId: string | undefined, sessionId: string | undefined): Promise<string> {
  if (method === "sessions.start") {
    if (typeof workspaceId !== "string" || workspaceId.length === 0) throw new PageError("invalid_params", "A sessions.start upload names its target workspaceId");
    return workspaceId;
  }
  if (!isSessionId(sessionId)) throw new PageError("invalid_params", "A sessions.send upload names its target sessionId");
  const target = await ctx.provider.sessions.get(sessionId);
  if (!target) throw new PageError("not_found", PUBLIC_MESSAGES.deleted);
  return target.workspaceId;
}
