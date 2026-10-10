// `createDispatcher(ctx, handlers?)`: the one path every `POST /bridge` call takes, in the order of DESIGN §E.1 — reader, envelope, token, request, budget, lookup, stale, params, home, eligibility, the replay of an approved retry, cheap refusals, archived, offline, recording bar, confirm/grant/decision, execute, project, answer (05 §Confirmed effects, R3.19a; 03 §Rules for every capability, 07 §The call).
import { canonicalMethod, unknownMethodMessage } from "../../domain/capabilities/aliases.ts";
import type { AnyCapabilitySpec } from "../../domain/capabilities/contract.ts";
import type { ContributedSpec } from "../../domain/capabilities/contributed.ts";
import { completeInvocation, decodeBridgeRequest, failure, resolveInvocation, type BridgeRequest, type BridgeTransport, type ResolvedInvocation } from "../../domain/capabilities/protocol.ts";
import type { CapabilityLookup } from "../../domain/capabilities/registry.ts";
import { SESSIONLESS_CAPABILITIES } from "../../domain/capabilities/specs.ts";
import { ENTRY_DOCUMENT } from "../../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, STATUS_BY_CODE, errorText, isBridgeErrorCode, mapProviderError, type PageErrorCode } from "../../domain/errors.ts";
import { HOME_IDENTITY, isMethodName, isRequestId, isRevision, isSessionIdentity } from "../../domain/ids.ts";
import { boundIssue, isJsonObject, parseStrictJson, type JsonValue, type Validation } from "../../domain/json/strict-json.ts";
import { LIMITS } from "../../domain/limits.ts";
import { EMPTY_REVISION } from "../../domain/revision.ts";
import { verifyActionToken } from "../../domain/tokens/action-token.ts";
import { challengeId, challengeMatches, mintChallenge, openChallenge, paramsFingerprint, type ChallengeKind, type ConfirmationBinding } from "../../domain/tokens/confirmation.ts";
import { isRecord, openToken } from "../../domain/tokens/mac.ts";
import type { AttachmentRef, SessionRecord } from "../../host/provider.ts";
import type { PagesRequest, PagesResponse } from "../../host/serving.ts";
import type { BridgeEnvelope, CapabilityHandler, Dispatcher, ServingContext } from "../context.ts";
import { combinedLookup } from "../contributions.ts";
import { requestOrigins } from "../request.ts";
import type { ApprovedCall } from "../stores.d.ts";
import { FILE_METHODS } from "./handlers/files.ts";
import { ALL_HANDLERS } from "./handlers/index.ts";
import { HOME_SESSION, type BridgeContext } from "./handler.ts";

export type { BridgeEnvelope, Dispatcher };

interface PageState {
  revision: string;
  stale: boolean;
  archived: boolean;
  path: string | null;
}

interface CheckedEnvelope {
  actionToken: string;
  request: unknown;
  confirmation: string | null;
}

/** The params the dispatcher reads for files: the shell's list, or the attachment ids after upload. 05 R3.20a */
interface FileParams {
  files?: { name: string; size: number; type: string }[];
  attachments?: string[];
}

/** Steps 6–8 through the domain; a parameter that breaks a byte, depth or node bound is `request_too_large` naming it, not `invalid_params`. 07 R-X3, R-X4 */
function resolveParams(request: BridgeRequest, lookup: CapabilityLookup, revision: string): ResolvedInvocation {
  try {
    return resolveInvocation(request, lookup, revision);
  } catch (error) {
    if (!PageError.is(error) || error.code !== "invalid_params") throw error;
    const spec = lookup.get(canonicalMethod(request.method));
    const checked = spec?.validateParams(request.params);
    const issue = checked && !checked.ok ? checked.issues[0] : undefined;
    // Only the byte, depth and node bounds of strict JSON (07 R-X2); a list over its length or a string over its characters is R5.2's `invalid_params`.
    if (issue && boundIssue(checked as Validation<unknown>) && /^(Serialised )?JSON exceeds /.test(issue.message)) throw new PageError("request_too_large", `Request for ${spec!.method} breaks a bound at ${issue.path}: ${issue.message}`, { cause: error });
    throw error;
  }
}

/** Step 2: exact keys, a token string, an optional confirmation string, each within `tokenChars`. DESIGN §E.1 */
function checkEnvelope(value: unknown): CheckedEnvelope {
  if (!isJsonObject(value)) throw new PageError("invalid_request", "The bridge envelope must be an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "actionToken,request" && keys !== "actionToken,confirmation,request") throw new PageError("invalid_request", "The bridge envelope has the wrong shape");
  if (typeof value.actionToken !== "string" || value.actionToken.length === 0 || value.actionToken.length > LIMITS.tokenChars) throw new PageError("invalid_request", "The bridge envelope has no usable action token");
  const confirmation = value.confirmation;
  if (confirmation !== undefined && confirmation !== null && (typeof confirmation !== "string" || confirmation.length === 0 || confirmation.length > LIMITS.tokenChars)) throw new PageError("invalid_request", "The bridge envelope's confirmation is not a challenge");
  return { actionToken: value.actionToken, request: value.request, confirmation: typeof confirmation === "string" ? confirmation : null };
}

/** The document's current state: the loaded page, or an unwritten one at `EMPTY_REVISION`; the built-in home's fixed revision. DESIGN §E.1 step 7 */
async function loadPageState(ctx: ServingContext, session: string, path: string | null): Promise<PageState> {
  if (session === HOME_IDENTITY) return { revision: await ctx.currentRevision(HOME_IDENTITY, null), stale: false, archived: false, path: null };
  try {
    const loaded = await ctx.pages.load(session, path);
    return { revision: loaded.revision, stale: loaded.stale, archived: loaded.archived, path };
  } catch (error) {
    if (PageError.is(error) && error.code === "no_page") return { revision: EMPTY_REVISION, stale: false, archived: false, path };
    throw error;
  }
}

/** Step 10: a deleted session is `not_found`; one the reader cannot see (hidden, a fork, a child) too; an archived one proceeds read-only. DESIGN §E.1 step 10, U21 */
async function eligibleRecord(ctx: ServingContext, session: string): Promise<SessionRecord> {
  const access = await ctx.sessionFor(session);
  if (access.kind !== "session") throw new PageError("not_found", PUBLIC_MESSAGES.deleted);
  const { record } = access;
  if (!record.visible || record.forkOfId !== null || record.parentSessionId !== null) throw new PageError("not_found", PUBLIC_MESSAGES.ineligible);
  return record;
}

/** Step 12: what writes into the page's own session. 02 R-K8; DESIGN §E.1 step 12 (DR-9) */
function writesIntoOwnSession(spec: AnyCapabilitySpec): boolean {
  return spec.effect === "own-session-write" || spec.effect === "contributed-write" || spec.method === "session.respond";
}

/** A challenge's signed fields without its lifetime, for the upload-grant path that outlives the challenge. 05 R3.20a */
function openSignedChallenge(challenge: string, key: Uint8Array): ApprovedCall | null {
  const payload = openToken(challenge, key);
  if (!isRecord(payload) || payload.scope !== "confirm" || payload.kind !== "confirm") return null;
  if (!isSessionIdentity(payload.session) || !isRevision(payload.revision) || !isRequestId(payload.requestId) || !isMethodName(payload.method) || !isRevision(payload.paramsHash)) return null;
  return { session: payload.session, revision: payload.revision, requestId: payload.requestId, method: payload.method, paramsHash: payload.paramsHash };
}

/** The attachments `/attach` holds for an approved call, in the order the shell bound them, checked against the call's list. 05 R3.20a */
function heldAttachments(ctx: ServingContext, approved: ApprovedCall, ids: readonly string[]): { attachments: AttachmentRef[]; files: { name: string; size: number; type: string }[] } | null {
  const held = ctx.attachGrants.held(approved, ctx.now());
  if (held.length === 0 || held.length !== ids.length) return null;
  for (let index = 0; index < held.length; index += 1) {
    const entry = held[index]!;
    if (entry.index !== index || entry.attachment.attachmentId !== ids[index]) return null;
  }
  return { attachments: held.map((entry) => entry.attachment), files: held.map((entry) => ({ name: entry.file.name, size: entry.file.size, type: entry.file.type })) };
}

type Approval = { kind: "challenge"; body: BridgeTransport } | { kind: "approved"; attachments: AttachmentRef[] | null; approved: ApprovedCall | null };

/** What one dispatch redeemed, so its answer can be kept for a retry. 05 R3.19a */
interface ApprovalTrace {
  /** The redeemed key, the challenge's signature and the fingerprint of the parameters as the approved call presented them (after an upload, `attachments` in place of `files`). */
  redeemed: { key: string; challenge: string; params: string } | null;
}

/** The answer of a confirmed call, kept under its redeemed key for `idempotencyMs`. 05 R3.19a */
interface ConfirmedOutcome {
  at: number;
  challenge: string;
  params: string;
  response: PagesResponse;
}

/** The redeemed-once key of a confirmed call: the session, the request id and the method. 05 R3.19a; DR-14 */
function redeemedKey(binding: Pick<ConfirmationBinding, "session" | "requestId" | "method">): string {
  return `${binding.session}:${binding.requestId}:${binding.method}`;
}

function jsonResponse(status: number, body: unknown): PagesResponse {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  return { status, headers, body: new TextEncoder().encode(JSON.stringify(body)) };
}

/** The page's view of an error: a bridge code as it is; a route code on its status, the shell handles it before the page sees it. 03 R5.38; DESIGN §E.1 */
function errorResponse(requestId: unknown, error: PageError): PagesResponse {
  const code: PageErrorCode = error.code === "ineligible" || error.code === "no_page" ? "not_found" : error.code === "page_too_large" ? "unavailable" : error.code;
  const base = failure(requestId, isBridgeErrorCode(code) ? code : "handler_error", error.message, { reason: error.reason, detail: error.detail as JsonValue | undefined });
  const response = isBridgeErrorCode(code) ? base : { ...base, error: { ...base.error, code } };
  return jsonResponse(error.status, { response });
}

export function createDispatcher(ctx: ServingContext, handlers: readonly CapabilityHandler[] = ALL_HANDLERS): Dispatcher {
  const byMethod = new Map(handlers.map((entry) => [entry.method, entry]));
  // Every implemented, enabled spec has a handler, or the server does not start. 03 R5.6; DESIGN §H slice 4
  for (const spec of ctx.registry.list()) {
    if (spec.implemented && !byMethod.has(spec.method)) throw new Error(`No handler for capability ${spec.method}`);
  }

  // A retry of a confirmed call whose answer was lost returns the original answer rather than `confirmation_invalid`: the challenge redeemed once, its outcome kept for `idempotencyMs`, bounded. 05 R3.19a; R2.33–R2.34
  const outcomes = new Map<string, ConfirmedOutcome>();
  function keepOutcome(trace: ApprovalTrace, response: PagesResponse): void {
    if (!trace.redeemed) return;
    const now = ctx.now();
    for (const [key, kept] of outcomes) if (now - kept.at >= LIMITS.idempotencyMs) outcomes.delete(key);
    while (outcomes.size >= LIMITS.idempotencyRecords) {
      const oldest = outcomes.keys().next().value;
      if (oldest === undefined) break;
      outcomes.delete(oldest);
    }
    outcomes.set(trace.redeemed.key, { at: now, challenge: trace.redeemed.challenge, params: trace.redeemed.params, response });
  }
  /** The original answer when this very challenge, already redeemed, is presented again with the same parameters for the same request; null otherwise. 05 R3.19a */
  function replayOf(confirmation: string | null, binding: ConfirmationBinding): PagesResponse | null {
    if (confirmation === null) return null;
    const kept = outcomes.get(redeemedKey(binding));
    if (!kept || kept.challenge !== challengeId(confirmation) || kept.params !== paramsFingerprint(binding.params) || ctx.now() - kept.at >= LIMITS.idempotencyMs) return null;
    return { status: kept.response.status, headers: new Headers(kept.response.headers), body: kept.response.body };
  }

  async function approve(envelope: CheckedEnvelope, binding: ConfirmationBinding, kind: ChallengeKind, summary: string, trace: ApprovalTrace, extra: { grant?: { sessionId: string; title: string } } = {}): Promise<Approval> {
    const now = ctx.now();
    if (envelope.confirmation === null) {
      const minted = mintChallenge(binding, summary, now, ctx.signingKey, kind);
      const confirm = { requestId: binding.requestId, summary: kind === "decision" ? summary : (minted.payload.summary as string), challenge: minted.challenge, ...(kind !== "confirm" ? { kind } : {}), ...(extra.grant ? { grant: extra.grant } : {}) };
      return { kind: "challenge", body: { confirm } };
    }
    const opened = openChallenge(envelope.confirmation, ctx.signingKey, now);
    let attachments: AttachmentRef[] | null = null;
    let approved: ApprovedCall | null = null;
    let matches = opened !== null && opened.kind === kind && challengeMatches(opened, binding);
    const fileParams = binding.params as FileParams | null;
    if (!matches && kind === "confirm" && FILE_METHODS.has(binding.method) && isJsonObject(binding.params) && Array.isArray(fileParams?.attachments)) {
      // After the approved files were uploaded the call names their attachments in place of `files`; the upload grant, opened under the challenge, says the reader approved exactly this call. 05 R3.20a
      const signed = openSignedChallenge(envelope.confirmation, ctx.signingKey);
      if (signed && signed.session === binding.session && signed.revision === binding.revision && signed.requestId === binding.requestId && signed.method === binding.method && ctx.attachGrants.covers(signed, now)) {
        const held = heldAttachments(ctx, signed, fileParams!.attachments!);
        if (held) {
          const { attachments: _ids, ...rest } = binding.params as Record<string, JsonValue>;
          const original = { ...rest, files: held.files };
          if (paramsFingerprint(original) === signed.paramsHash) {
            matches = true;
            attachments = held.attachments;
            approved = signed;
          }
        }
      }
    }
    if (!matches) throw new PageError("confirmation_invalid", PUBLIC_MESSAGES.confirmationInvalid);
    // A confirmed call that named files must bring their attachments; checked before the challenge is spent. 05 R3.20a, 03 R5.80
    if (kind === "confirm" && FILE_METHODS.has(binding.method) && Array.isArray(fileParams?.files) && fileParams.files.length > 0 && attachments === null) {
      throw new PageError("confirmation_invalid", "The approved files were not uploaded; upload them under this confirmation first");
    }
    // A challenge is redeemed at most once, for as long as any approval of it can still be presented; a retry of the same request was answered above. 05 R3.19a; DR-14
    const key = redeemedKey(binding);
    const redeemed = await ctx.redeemed.redeem(key, now + Math.max(LIMITS.confirmationMs, LIMITS.attachGrantMs));
    if (!redeemed) throw new PageError("confirmation_invalid", "This confirmation was already used; nothing was done again");
    trace.redeemed = { key, challenge: challengeId(envelope.confirmation), params: paramsFingerprint(binding.params) };
    return { kind: "approved", attachments, approved };
  }

  async function dispatch(request: PagesRequest, envelope: BridgeEnvelope): Promise<PagesResponse> {
    const trace: ApprovalTrace = { redeemed: null };
    const response = await run(request, envelope, trace);
    keepOutcome(trace, response);
    return response;
  }

  async function run(request: PagesRequest, envelope: BridgeEnvelope, trace: ApprovalTrace): Promise<PagesResponse> {
    let requestId: unknown;
    let release: (() => void) | null = null;
    let contributedWrite: ContributedSpec | null = null;
    let session = "?";
    try {
      // 1. The reader. 05 R-S8
      if (request.reader === null) throw new PageError("unauthenticated", PUBLIC_MESSAGES.unauthenticated);
      // 2. The envelope.
      const checked = checkEnvelope(envelope);
      requestId = isJsonObject(checked.request) ? checked.request.id : undefined;
      // 3. The token. 05 R2.7
      const token = verifyActionToken(checked.actionToken, ctx.signingKey, ctx.now());
      if (!token) throw new PageError("forbidden", PUBLIC_MESSAGES.tokenInvalid);
      session = token.session;
      // 4. The request. 05 R3.9
      const bridgeRequest = decodeBridgeRequest(checked.request);
      requestId = bridgeRequest.id;
      const scope = bridgeRequest.scope ?? null;
      // 5. The budget: charged from here on; a call refused by the budget charges nothing. 05 R2.38a; DR-30
      release = ctx.budget.acquire({ session: token.session, document: token.path ?? ENTRY_DOCUMENT, scope }, ctx.now());
      if (!release) throw new PageError("rate_limited", PUBLIC_MESSAGES.rateLimited);
      const home = token.session === HOME_IDENTITY;
      // 6–8. Lookup (aliases, the registry, then the contributions), the stale check, the bound and the parameters. 03 R5.2, R5.6; 05 R2.13
      const lookup = ctx.registry.get(canonicalMethod(bridgeRequest.method)) ? ctx.registry : combinedLookup(ctx.registry, await ctx.contributions.current());
      const page = await loadPageState(ctx, token.session, token.path);
      const invocation = resolveParams(bridgeRequest, lookup, page.revision);
      const spec = invocation.spec;
      const contributed = spec.contributor ? (spec as ContributedSpec) : null;
      const entry = contributed ? null : byMethod.get(spec.method);
      if (!contributed && !entry) throw new PageError("unknown_method", unknownMethodMessage(bridgeRequest.method));
      const params = invocation.params as JsonValue;
      // 9. The built-in home has no session. 05 R-S12; 07 R5.85
      if (home && SESSIONLESS_CAPABILITIES.has(spec.method)) throw new PageError("unknown_method", PUBLIC_MESSAGES.homeNoSession);
      if (home && contributed && scope !== null) throw new PageError("invalid_params", "The built-in home page has no session folder to scope to");
      // 10. Eligibility; an archived session proceeds read-only. U21
      const record = home ? null : await eligibleRecord(ctx, token.session);
      if (record?.archived) page.archived = true;
      const context: BridgeContext = { serving: ctx, session: record ?? HOME_SESSION, page, requestId: bridgeRequest.id, requestOrigins: requestOrigins(request.headers), scope, request, attachments: null };
      const binding: ConfirmationBinding = { session: token.session, revision: page.revision, requestId: bridgeRequest.id, method: spec.method, params };
      // 10a. A retry of a call this challenge already approved: the original answer, nothing done again. 05 R3.19a
      const replay = replayOf(checked.confirmation, binding);
      if (replay) return replay;
      // 11. Cheap refusals: nothing here shows a dialog.
      await entry?.refuse?.(params, context);
      // 12. Archived read-only: only what writes into that session. 02 R-K8; DR-9
      if (page.archived && writesIntoOwnSession(spec)) throw new PageError("unavailable", PUBLIC_MESSAGES.archived, { reason: "archived" });
      // 13. An offline copy takes no effect. 05 R2.29
      if (page.stale && spec.effect !== "read" && spec.effect !== "navigation") throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy, { reason: "offline" });
      // 14. Confirmed by the recording bar: the shell gets the validated parameters; no challenge is ever minted or accepted. 03 R5.68
      if (entry?.confirmedBy === "recording-bar") {
        if (checked.confirmation !== null) throw new PageError("confirmation_invalid", "This capability is confirmed in the recording bar, not by a challenge");
        return jsonResponse(401, { record: { requestId: bridgeRequest.id, params: params as { language?: string; prompt?: string; maxDurationSeconds: number; keepAudio: boolean } } } satisfies BridgeTransport);
      }
      // 15. Confirm per call, once per pair, or per decision. 05 R3.17–R3.22a; 03 R5.64, R-C7
      let attachments: AttachmentRef[] | null = null;
      let approvedCall: ApprovedCall | null = null;
      if (entry && spec.confirmed && spec.confirmedFor === undefined) {
        const summary = (await entry.summarize?.(params, context)) ?? spec.description;
        const approval = await approve(checked, binding, "confirm", summary, trace);
        if (approval.kind === "challenge") return jsonResponse(401, approval.body);
        attachments = approval.attachments;
        approvedCall = approval.approved;
      } else if (entry?.grant) {
        const grant = await entry.grant(params, context);
        if (grant) {
          const approval = await approve(checked, binding, "grant", grant.summary, trace, { grant: grant.target });
          if (approval.kind === "challenge") return jsonResponse(401, approval.body);
          await grant.record();
        }
      }
      if (entry?.decision) {
        const decision = await entry.decision(params, context);
        if (decision) {
          const approval = await approve(checked, { ...binding, summary: decision.summary }, "decision", decision.summary, trace);
          if (approval.kind === "challenge") return jsonResponse(401, approval.body);
        }
      }
      // A confirmed call that named files must bring their attachments; an own-session reply's ride on /attach under the token alone. 05 R3.20a; DESIGN P29
      if (entry && FILE_METHODS.has(spec.method) && isJsonObject(params)) {
        const fileParams = params as FileParams;
        if (spec.method === "session.reply" && Array.isArray(fileParams.attachments)) {
          const approved: ApprovedCall = { session: token.session, revision: page.revision, requestId: bridgeRequest.id, method: spec.method, paramsHash: EMPTY_REVISION };
          const held = heldAttachments(ctx, approved, fileParams.attachments);
          if (!held) throw new PageError("confirmation_invalid", "The attachments named are not the files uploaded for this request");
          attachments = held.attachments;
          approvedCall = approved;
        } else if (Array.isArray(fileParams.attachments) && attachments === null) {
          throw new PageError("confirmation_invalid", "The attachments named were not uploaded under this confirmation");
        }
      }
      const executeContext: BridgeContext = attachments ? { ...context, attachments } : context;
      // 16. Execute.
      let outcome: { result: unknown; navigate?: { kind: "page" | "host" | "external"; url: string } };
      try {
        if (contributed) {
          contributedWrite = contributed.effect === "contributed-write" ? contributed : null;
          const caller = { sessionId: home ? null : token.session, scope };
          const result = await ctx.contributions.invoke(contributed, params, caller, bridgeRequest.id);
          // Nothing else records a write no dialog saw. 07 R5.55
          if (contributedWrite) ctx.log.info(`contributed write ${contributed.method} for ${token.session}: ok`);
          outcome = { result };
        } else {
          outcome = await entry!.execute(params, executeContext);
        }
      } catch (error) {
        if (contributedWrite) ctx.log.info(`contributed write ${contributedWrite.method} for ${token.session}: ${PageError.is(error) ? error.code : "failed"}`);
        if (PageError.is(error)) throw error;
        throw mapProviderError(error, ctx.log, `bridge ${spec.method}`);
      }
      if (approvedCall) ctx.attachGrants.forget(approvedCall);
      // 17. Project and bound. 03 R5.3; 07 R5.47
      const response = completeInvocation(invocation, outcome.result);
      if (!response.ok && response.error.code === "invalid_result") ctx.log.error(`bridge ${spec.method}: ${response.error.message}`);
      const status = response.ok ? 200 : STATUS_BY_CODE[response.error.code];
      // 18. Answer.
      return jsonResponse(status, outcome.navigate && response.ok ? { response, navigate: outcome.navigate } : { response });
    } catch (error) {
      if (PageError.is(error)) {
        if (error.cause !== undefined) ctx.log.warn(`bridge ${session}: ${error.code}: ${errorText(error.cause)}`);
        const code = isBridgeErrorCode(error.code) ? error : error.code === "forbidden" || error.code === "unauthenticated" ? error : new PageError(error.code === "page_too_large" ? "unavailable" : "not_found", error.message, { status: error.status, cause: error.cause, ...(error.reason !== undefined ? { reason: error.reason } : {}) });
        return errorResponse(requestId, code);
      }
      ctx.log.warn(`bridge ${session}: ${errorText(error)}`);
      return errorResponse(requestId, new PageError("handler_error", PUBLIC_MESSAGES.handler, { cause: error }));
    } finally {
      release?.();
    }
  }

  return { dispatch };
}

/** Parses a `POST /bridge` body as the route hands it over: strict JSON within the envelope bound. DESIGN §E.1 step 2 */
export function parseBridgeBody(bytes: Uint8Array): BridgeEnvelope {
  const text = new TextDecoder().decode(bytes);
  const parsed = parseStrictJson(text, { maxBytes: LIMITS.contributedPayloadMaxBytes + 1024 });
  if (!parsed.ok) {
    const issue = parsed.issues[0];
    if (issue?.code === "too_large" || issue?.code === "too_deep" || issue?.code === "too_many_nodes") throw new PageError("request_too_large", issue.message);
    throw new PageError("invalid_json", PUBLIC_MESSAGES.invalidJson);
  }
  return checkEnvelope(parsed.value);
}
