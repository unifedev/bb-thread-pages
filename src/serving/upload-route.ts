import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { UPLOAD_DIR, uploadFileName } from "../pages/layout.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failureResponse, jsonResponse } from "./responses.ts";
import { eligibleSession } from "./session-access.ts";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * `POST /upload` — one attached file, base64 in a JSON envelope (the host's
 * "local" auth refuses raw bodies), stored under a host-generated name in the
 * page's uploads directory. spec R4.19–R4.24
 */
export function uploadRoute(serving: ServingContext) {
  const maxBody = Math.ceil((LIMITS.uploadFileBytes * 4) / 3) + 8_192;
  return async (context: Context): Promise<Response> => {
    let release: (() => void) | null = null;
    try {
      const body = await readJsonBody(context, maxBody);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PageError("invalid_request", "Invalid upload envelope");
      const envelope = body as Record<string, unknown>;
      const token = requireActionToken(serving, envelope.actionToken);
      if (typeof envelope.content !== "string" || !BASE64.test(envelope.content)) throw new PageError("invalid_request", "Attachment content must be base64");
      release = acquireRate(serving, token.session);
      await eligibleSession(serving, token.session);
      const page = await serving.pages.load(token.session);
      if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      const bytes = Buffer.from(envelope.content, "base64");
      if (bytes.byteLength === 0) throw new PageError("invalid_request", "The file is empty");
      if (bytes.byteLength > LIMITS.uploadFileBytes) throw new PageError("request_too_large", `Attachments must be at most ${mebibytes(LIMITS.uploadFileBytes)}`);
      const name = uploadFileName(typeof envelope.name === "string" ? envelope.name : "upload", serving.now(), randomBytes(3).toString("hex"));
      const location = await serving.host.sessions.storage(token.session);
      const outcome = await serving.host.files.write(location, `${UPLOAD_DIR}/${name}`, bytes, { onlyIfAbsent: true });
      if (outcome !== "written") throw new PageError("conflict", "The attachment could not be stored under a fresh name; try again");
      return jsonResponse({ ok: true, name, path: `${UPLOAD_DIR}/${name}`, sizeBytes: bytes.byteLength });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /upload", false);
    } finally {
      release?.();
    }
  };
}
