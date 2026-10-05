import { completeInvocation, decodeBridgeRequest, failure, failureFromError, resolveInvocation, type BridgeTransport } from "../../domain/capabilities/protocol.ts";
import { PageError, PUBLIC_MESSAGES, errorText, isBridgeErrorCode } from "../../domain/errors.ts";
import type { JsonValue } from "../../domain/json/strict-json.ts";
import { LIMITS } from "../../domain/limits.ts";
import { challengeMatches, mintChallenge, openChallenge } from "../../domain/tokens/confirmation.ts";
import type { ContributedSpec } from "../../domain/capabilities/contributed.ts";
import { fingerprint } from "../../domain/json/canonical.ts";
import { acquireRate, requireActionToken } from "../action-request.ts";
import { FILE_METHODS, grantCovers } from "../attach-route.ts";
import { BUILTIN_HOME_PAGE, BUILTIN_HOME_REFUSAL, BUILTIN_HOME_SESSION, SESSIONLESS_CAPABILITIES, isBuiltinHome } from "../builtin-home.ts";
import type { ServingContext } from "../context.ts";
import { ContributedError, combinedLookup } from "../contributions.ts";
import { eligibleSession } from "../session-access.ts";
import type { CapabilityHandler, HandlerContext } from "./handler.ts";

/**
 * The one path every capability call takes. spec 03 §Confirmed effects, 05
 *
 *   envelope → action token → rate budget → resolve (stale, unknown, params)
 *   → cheap refusals → confirmation (challenge out, or verify one in)
 *   → session still eligible, document still current → handler → projection
 *
 * The built-in home page takes the same path under its reserved identity; the
 * capabilities that need a session of its own are refused for it. spec R7.9a
 *
 * A contributed capability takes the same path too, and differs in three
 * places only: it is looked up among the contributions when no built-in has
 * its name, it is never confirmed, and its execution is a call to its
 * contributor carrying the caller's session from the token. spec R5.48–R5.53
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
  /**
   * Approvals already used. A challenge approves one invocation (R3.19): once
   * redeemed, the same approval — replayed within its life, or with an upload
   * grant that outlives it — is refused, and nothing happens twice. Confirmed
   * calls carry no idempotency key of their own (R2.33 is the forms'), so a
   * repeat is refused rather than answered from the first outcome; a page
   * that retries asks again, and the reader confirms again. spec R3.17–R3.21
   */
  const redeemed = new Map<string, number>();
  function redeem(session: string, requestId: string, method: string): void {
    const now = serving.now();
    for (const [key, until] of redeemed) if (until <= now) redeemed.delete(key);
    const key = `${session}:${requestId}:${method}`;
    if (redeemed.has(key)) throw new PageError("confirmation_invalid", "This confirmation was already used; nothing was done again");
    while (redeemed.size >= LIMITS.redeemedConfirmations) {
      const oldest = redeemed.keys().next().value;
      if (oldest === undefined) break;
      redeemed.delete(oldest);
    }
    // As long as any approval of it can still be presented: the challenge's life, or an upload grant's.
    redeemed.set(key, now + Math.max(LIMITS.confirmationMs, LIMITS.attachGrantMs));
  }
  for (const spec of serving.registry.list()) {
    if (spec.implemented && !byMethod.has(spec.method)) throw new Error(`No handler for capability ${spec.method}`);
  }

  return async function dispatch(body: unknown, requestOrigins: readonly string[] = []): Promise<DispatchResult> {
    let requestId: unknown;
    let release: (() => void) | null = null;
    try {
      const envelope = parseEnvelope(body);
      requestId = (envelope.request as { id?: unknown } | null)?.id;
      const token = requireActionToken(serving, envelope.actionToken);
      release = acquireRate(serving, token.session);
      const request = decodeBridgeRequest(envelope.request);
      requestId = request.id;
      const lookup = serving.registry.get(request.method) ? serving.registry : combinedLookup(serving.registry, await serving.contributions.current());
      const invocation = resolveInvocation(request, lookup, token.revision);
      const contributed = invocation.spec.contributor ? (invocation.spec as ContributedSpec) : null;
      const entry = contributed ? null : byMethod.get(invocation.spec.method);
      if (!contributed && !entry) throw new PageError("unknown_method", `Unknown capability: ${invocation.spec.method}`);

      const home = isBuiltinHome(token.session);
      if (home && !contributed && SESSIONLESS_CAPABILITIES.has(invocation.spec.method)) throw new PageError("unknown_method", BUILTIN_HOME_REFUSAL);
      // The built-in home has no session, so no folder to scope into. spec R5.85
      if (home && contributed && request.scope !== undefined) throw new PageError("invalid_params", "The built-in home page has no session folder to scope to");
      const session = home
        ? BUILTIN_HOME_SESSION
        : await eligibleSession(serving, token.session).catch((error: unknown) => {
            throw PageError.is(error) && error.code === "ineligible" ? new PageError("conflict", "This session no longer accepts page actions") : error;
          });
      const page = home ? BUILTIN_HOME_PAGE : await serving.pages.load(token.session, token.path);
      if (page.revision !== token.revision) throw new PageError("stale_page", PUBLIC_MESSAGES.stalePage);
      const context: HandlerContext = { serving, session, page, requestId: request.id, requestOrigins, scope: request.scope ?? null };

      await entry?.refuse?.(invocation.params, context);

      // Voice is confirmed by the reader's Done in the shell's own recording bar, not by a dialog:
      // the shell gets the validated parameters, records and transcribes. No challenge is issued,
      // so none is ever accepted for it. spec R3.32, R5.68
      if (entry?.confirmedBy === "recording-bar") {
        if (envelope.confirmation !== null) throw new PageError("confirmation_invalid", "This capability is confirmed in the recording bar, not by a challenge");
        return { status: 401, body: { record: { requestId: request.id, params: invocation.params as JsonValue } } };
      }

      // Contributed capabilities are never confirmed; their specs say so. spec R5.50
      if (invocation.spec.confirmed && entry) {
        const binding = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params as JsonValue };
        if (envelope.confirmation === null) {
          const summary = (await entry.summarize?.(invocation.params, context)) ?? invocation.spec.description;
          const { challenge, payload } = mintChallenge(binding, summary, serving.now(), serving.signingKey);
          return { status: 401, body: { confirm: { requestId: request.id, summary: payload.summary, challenge } } };
        }
        const challenge = openChallenge(envelope.confirmation, serving.signingKey, serving.now());
        // A call whose approved files are all held may outlive its challenge: its upload grant, opened
        // under that challenge, says the reader approved exactly this call. spec R3.20a
        const covered = FILE_METHODS.has(request.method) && grantCovers(serving, { session: token.session, revision: token.revision, requestId: request.id, method: request.method, paramsHash: fingerprint(invocation.params as JsonValue) });
        if (!covered && (!challenge || !challengeMatches(challenge, binding))) {
          throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");
        }
        redeem(token.session, request.id, request.method);
      }

      // Confirmed once per pair: the same signed challenge, remembered on approval. spec R5.64
      const grant = entry?.grant ? await entry.grant(invocation.params, context) : null;
      if (grant) {
        const binding = { session: token.session, revision: token.revision, requestId: request.id, method: request.method, params: invocation.params as JsonValue };
        if (envelope.confirmation === null) {
          const { challenge, payload } = mintChallenge(binding, grant.summary, serving.now(), serving.signingKey);
          return { status: 401, body: { confirm: { requestId: request.id, summary: payload.summary, challenge, kind: "grant", grant: grant.target } } };
        }
        const challenge = openChallenge(envelope.confirmation, serving.signingKey, serving.now());
        if (!challenge || !challengeMatches(challenge, binding)) {
          throw new PageError("confirmation_invalid", "The confirmation is expired or does not match this request");
        }
        redeem(token.session, request.id, request.method);
        await grant.record();
        serving.host.log.info(`grant given: ${token.session} → ${grant.target.sessionId}`);
      }

      if (page.stale && invocation.spec.effect !== "read" && invocation.spec.effect !== "navigation") {
        throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      }

      let outcome;
      try {
        if (contributed) {
          // The caller is the token's session, never anything the page sent; the scope is the
          // document's, checked when the request was decoded. spec R5.49, R5.84
          const caller = { sessionId: home ? null : token.session, scope: request.scope ?? null };
          const result = await serving.contributions.invoke(contributed, invocation.params as JsonValue, caller, request.id);
          if (contributed.effect === "contributed-write") {
            // Nothing else records a write no dialog saw. spec R5.55
            serving.host.log.info(`contributed write ${contributed.method} for ${token.session}: ok`);
          }
          outcome = { result };
        } else {
          outcome = await entry!.execute(invocation.params, context);
        }
      } catch (error) {
        if (contributed?.effect === "contributed-write") {
          serving.host.log.info(`contributed write ${contributed.method} for ${token.session}: ${PageError.is(error) ? error.code : "failed"}`);
        }
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
        const extra = error instanceof ContributedError && error.reason ? { reason: error.reason, ...(error.detail !== undefined ? { detail: error.detail } : {}) } : undefined;
        return { status: error.status, body: { response: failure(requestId, code, error.message, extra) } };
      }
      serving.host.log.warn(`bridge: ${errorText(error)}`);
      return { status: 500, body: { response: failureFromError(requestId, error) } };
    } finally {
      release?.();
    }
  };
}
