import type { Context } from "hono";
import { failure } from "../domain/capabilities/protocol.ts";
import { PageError } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import { readJsonBody } from "./action-request.ts";
import type { createDispatcher } from "./bridge/dispatcher.ts";
import { jsonResponse } from "./responses.ts";

/** Where the reader reached this host: the request's own URL and the `Origin` the shell's same-origin POST carries. */
function requestOrigins(context: Context): string[] {
  const origins = new Set<string>();
  try {
    origins.add(new URL(context.req.url).origin);
  } catch {
    // A request URL is always absolute here; nothing to add otherwise.
  }
  const header = context.req.header("origin");
  if (header && header !== "null") origins.add(header);
  return [...origins];
}

/** `POST /bridge` — one capability invocation. */
export function bridgeRoute(dispatch: ReturnType<typeof createDispatcher>) {
  return async (context: Context): Promise<Response> => {
    let body: unknown;
    try {
      // Contributed capabilities may declare up to 1 MiB; each method's own bound is checked in the dispatcher. spec R5.47
      body = await readJsonBody(context, LIMITS.contributedPayloadMaxBytes + 16_384);
    } catch (error) {
      const failed = PageError.is(error) ? error : new PageError("invalid_json", "Invalid bridge body");
      const code = failed.code === "request_too_large" ? "request_too_large" : "invalid_json";
      return jsonResponse({ response: failure(undefined, code, failed.message) }, failed.status);
    }
    const outcome = await dispatch(body, requestOrigins(context));
    return jsonResponse(outcome.body, outcome.status);
  };
}
