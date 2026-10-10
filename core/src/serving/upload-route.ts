// `POST /upload`: JSON + base64 envelope, bounds, host-generated name, `provider.files.write` (02 R4.19–R4.24; DESIGN §C.3, DR-1, DR-42).
import { PageError, PUBLIC_MESSAGES, mapProviderError } from "../domain/errors.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { uploadFileName, uploadPath } from "../pages/layout.ts";
import { isUploadBody, type UploadResponse } from "../runtime/shared/envelopes.ts";
import { acquireBudget, requireActionToken, requireSessionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failure, json } from "./responses.ts";
import { isJsonRecord, readBytesField, readJsonBody, requireReader } from "./request.ts";
import { requirePageSession } from "./session-access.ts";

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "ProviderError" && (error as { code?: unknown }).code === "conflict";
}

/**
 * One attached file, base64 in a JSON envelope, stored under a host-generated
 * name in the page's `uploads/`; the reader's name only shapes the suffix.
 * Refused on the built-in home, on an archived session and on an offline copy.
 * 02 R4.19–R4.24; 05 R2.29; 02 R-K8
 */
export function uploadRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      const body = await readJsonBody(request, LIMITS.uploadBodyBytes);
      if (!isJsonRecord(body) || !isUploadBody(body, Number.MAX_SAFE_INTEGER)) throw new PageError("invalid_request", "Invalid upload envelope");
      const token = requireActionToken(ctx, body.actionToken);
      const session = requireSessionToken(token, "The built-in home page has no session to attach files to.");
      release = acquireBudget(ctx, token);
      const access = await ctx.sessionFor(session);
      requirePageSession(access);
      if (access.archived) throw new PageError("unavailable", PUBLIC_MESSAGES.archived, { reason: "archived" });
      const page = await ctx.pages.load(session, token.path);
      if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy, { reason: "offline" });
      const bytes = readBytesField(body, "bytes", LIMITS.uploadFileBytes);
      if (bytes.byteLength === 0) throw new PageError("invalid_request", "The file is empty");
      if (bytes.byteLength > LIMITS.uploadFileBytes) throw new PageError("request_too_large", `Attachments must be at most ${mebibytes(LIMITS.uploadFileBytes)}`);
      let name = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        name = uploadFileName(body.name, ctx.now(), Buffer.from(ctx.random(3)).toString("hex"));
        try {
          await ctx.provider.files.write(session, uploadPath(name), bytes, { onlyIfAbsent: true });
          break;
        } catch (error) {
          if (isConflict(error) && attempt < 2) continue;
          throw isConflict(error) ? new PageError("conflict", "The attachment could not be stored under a fresh name; try again", { cause: error }) : mapProviderError(error, ctx.log, "files.write");
        }
      }
      const answer: UploadResponse = { ok: true, name, path: uploadPath(name), sizeBytes: bytes.byteLength };
      return json(200, answer);
    } catch (error) {
      return failure(error, ctx.log, "POST /upload", false);
    } finally {
      release?.();
    }
  };
}
