// `POST /bridge`: reader, body bound, `requestOrigins`, then `dispatcher.dispatch` (05 §Routes; DESIGN §C.3, §E.1 steps 1–2).
import { failure as bridgeFailure } from "../domain/capabilities/protocol.ts";
import { PageError } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import type { BridgeEnvelope, Dispatcher } from "./context.ts";
import { parseBridgeBody } from "./bridge/dispatcher.ts";
import { failure, json, unauthenticated } from "./responses.ts";

/** One capability call: the route reads the reader and the body, bounds it, and hands the envelope to the dispatcher. 05 R2.4; DESIGN §E.1 */
export function bridgeRoute(ctx: { log: { warn(message: string): void; error(message: string): void } }, dispatcher: Dispatcher) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    if (request.reader === null) return unauthenticated(false);
    try {
      const maxBytes = LIMITS.contributedPayloadMaxBytes + 1024;
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > maxBytes) throw new PageError("request_too_large", `The request body is larger than ${maxBytes} bytes`);
      const bytes = await request.body();
      if (bytes.byteLength > maxBytes) throw new PageError("request_too_large", `The request body is larger than ${maxBytes} bytes`);
      const envelope: BridgeEnvelope = parseBridgeBody(bytes);
      return await dispatcher.dispatch(request, envelope);
    } catch (error) {
      if (PageError.is(error) && (error.code === "request_too_large" || error.code === "invalid_json" || error.code === "invalid_request")) {
        return json(error.status, { response: bridgeFailure("invalid", error.code, error.message) });
      }
      return failure(error, ctx.log as never, "POST /bridge", false);
    }
  };
}
