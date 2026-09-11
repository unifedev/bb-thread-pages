import type { Context } from "hono";
import { PageError } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failureResponse, jsonResponse } from "./responses.ts";

/**
 * `POST /chrome-action` — the trusted shell bar acting on the session it is
 * showing. Only the shell holds the action token, so a sandboxed page cannot
 * reach this route; the reader's click is the gesture, and the destructive
 * one (archive) confirms in the shell's own dialog before it calls.
 */
const ACTIONS = new Set(["pin", "unpin", "read", "unread", "archive"]);

export function chromeActionRoute(serving: ServingContext) {
  return async (context: Context): Promise<Response> => {
    try {
      const body = await readJsonBody(context, LIMITS.capabilityPayloadBytes);
      const record = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      const token = requireActionToken(serving, record.actionToken);
      const action = typeof record.action === "string" ? record.action : "";
      if (!ACTIONS.has(action)) throw new PageError("invalid_params", "Unknown chrome action");

      const session = await serving.host.sessions.get(token.session);
      if (!session || session.deleted) throw new PageError("not_found", "That session is not available");

      const release = acquireRate(serving, token.session);
      try {
        if (action === "pin") await serving.host.sessions.pin(session.id, true);
        else if (action === "unpin") await serving.host.sessions.pin(session.id, false);
        else if (action === "read") await serving.host.sessions.markRead(session.id, true);
        else if (action === "unread") await serving.host.sessions.markRead(session.id, false);
        else await serving.host.sessions.archive(session.id);
      } finally {
        release();
      }

      const after = await serving.host.sessions.get(session.id);
      return jsonResponse({
        ok: true,
        state: {
          pinned: after?.pinned ?? session.pinned,
          unread: after?.unread ?? session.unread,
          archived: after ? after.archived : true,
        },
      });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /chrome-action", false);
    }
  };
}
