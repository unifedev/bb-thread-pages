import type { Context } from "hono";
import { failure } from "../domain/capabilities/protocol.ts";
import { PageError } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import { readJsonBody } from "./action-request.ts";
import type { createDispatcher } from "./bridge/dispatcher.ts";
import { jsonResponse } from "./responses.ts";

/** `POST /bridge` — one capability invocation. */
export function bridgeRoute(dispatch: ReturnType<typeof createDispatcher>) {
  return async (context: Context): Promise<Response> => {
    let body: unknown;
    try {
      body = await readJsonBody(context, LIMITS.capabilityPayloadBytes + 8_192);
    } catch (error) {
      const failed = PageError.is(error) ? error : new PageError("invalid_json", "Invalid bridge body");
      const code = failed.code === "request_too_large" ? "request_too_large" : "invalid_json";
      return jsonResponse({ response: failure(undefined, code, failed.message) }, failed.status);
    }
    const outcome = await dispatch(body);
    return jsonResponse(outcome.body, outcome.status);
  };
}
