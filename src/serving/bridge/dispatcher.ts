import { completeInvocation, decodeBridgeRequest, failure, failureFromError, resolveInvocation, type BridgeTransport } from "../../domain/capabilities/protocol.ts";
import { PageError, PUBLIC_MESSAGES, errorText, isBridgeErrorCode } from "../../domain/errors.ts";
import type { JsonValue } from "../../domain/json/strict-json.ts";
import { LIMITS } from "../../domain/limits.ts";
import { challengeMatches, mintChallenge, openChallenge } from "../../domain/tokens/confirmation.ts";
import { acquireRate, requireActionToken } from "../action-request.ts";
import type { ServingContext } from "../context.ts";
import { eligibleSession } from "../session-access.ts";
import type { CapabilityHandler, HandlerContext } from "./handler.ts";

/**
 * The one path every capability call takes. spec 03 §Confirmed effects, 05
 *
 *   envelope → action token → rate budget → resolve (stale, unknown, params)
 *   → cheap refusals → confirmation (challenge out, or verify one in)
 *   → session still eligible, page still current → handler → projection
 */
export interface DispatchResult {
  readonly status: number;
  readonly body: BridgeTransport;
}

interface Envelope {
  readonly actionToken: string;
  readonly request: unknown;
  readonly confirmation: string | null;
}

export function parseEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PageError("invalid_request", "Invalid bridge envelope");
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.includes("actionToken") || !keys.includes("request") || keys.some((key) => !["actionToken", "request", "confirmation"].includes(key))) {
    throw new PageError("invalid_request", "Invalid bridge envelope");
  }
  if (typeof input.actionToken !== "string" || input.actionToken.length > LIMITS.tokenChars) throw new PageError("invalid_request", "Invalid bridge envelope");
  const confirmation = input.confirmation;
  if (confirmation !== undefined && confirmation !== null && (typeof confirmation !== "string" || confirmation.length > LIMITS.tokenChars)) {
    throw new PageError("invalid_request", "Invalid bridge envelope");
  }
  return { actionToken: input.actionToken, request: input.request, confirmation: typeof confirmation === "string" ? confirmation : null };
}

export function createDispatcher(serving: ServingContext, handlers: readonly CapabilityHandler[]) {
  const byMethod = new Map(handlers.map((entry) => [entry.method, entry]));
  for (const spec of serving.registry.list()) {
    if (spec.implemented && !byMethod.has(spec.method)) throw new Error(`No handler for capability ${spec.method}`);
  }

  return async function dispatch(body: unknown): Promise<DispatchResult> {
    let requestId: unknown;
    let release: (() => void) | null = null;
    try {
      const envelope = parseEnvelope(body);
      requestId = (envelope.request as { id?: unknown } | null)?.id;
      const token = requireActionToken(serving, envelope.actionToken);
      release = acquireRate(serving, token.session);
      const request = decodeBridgeRequest(envelope.request);
      requestId = request.id;
      const invocation = resolveInvocation(request, serving.registry, token.revision);
      const entry = byMethod.get(invocation.spec.method);
      if (!entry) throw new PageError("unknown_method", `Unknown capability: ${invocation.spec.method}`);

      const session = await eligibleSession(serving, token.session).catch((error: unknown) => {
        throw PageError.is(error) && error.code === "ineligible" ? new PageError("conflict", "This session no longer accepts page actions") : error;
      });
      const page = await serving.pages.load(token.session);
      if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      const context: HandlerContext = { serving, session, page, requestId: request.id };

      await entry.refuse?.(invocation.params, context);

      if (invocation.spec.confirmed) {
        const binding = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params as JsonValue };
        if (envelope.confirmation === null) {
          const summary = (await entry.summarize?.(invocation.params, context)) ?? invocation.spec.description;
          const { challenge, payload } = mintChallenge(binding, summary, serving.now(), serving.signingKey);
          return { status: 401, body: { confirm: { requestId: request.id, summary: payload.summary, challenge } } };
        }
        const challenge = openChallenge(envelope.confirmation, serving.signingKey, serving.now());
        if (!challenge || !challengeMatches(challenge, binding)) {
          throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");
        }
      }

      if (page.stale && invocation.spec.effect !== "read" && invocation.spec.effect !== "navigation") {
        throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      }

      let outcome;
      try {
        outcome = await entry.execute(invocation.params, context);
      } catch (error) {
        if (PageError.is(error) && isBridgeErrorCode(error.code)) throw error;
        serving.host.log.warn(`bridge ${request.method} for ${token.session}: ${errorText(error)}`);
        throw new PageError("handler_error", PUBLIC_MESSAGES.handler, { cause: error });
      }
      const response = completeInvocation(invocation, outcome.result);
      return { status: response.ok ? 200 : 500, body: outcome.navigate ? { response, navigate: outcome.navigate } : { response } };
    } catch (error) {
      if (PageError.is(error)) {
        if (error.cause !== undefined) serving.host.log.warn(`bridge: ${error.code}: ${errorText(error.cause)}`);
        const code = isBridgeErrorCode(error.code) ? error.code : error.code === "ineligible" || error.code === "no_page" ? "not_found" : "handler_error";
        return { status: error.status, body: { response: failure(requestId, code, error.message) } };
      }
      serving.host.log.warn(`bridge: ${errorText(error)}`);
      return { status: 500, body: { response: failureFromError(requestId, error) } };
    } finally {
      release?.();
    }
  };
}
