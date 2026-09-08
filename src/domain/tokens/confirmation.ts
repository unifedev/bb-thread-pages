import { isMethodName, isRequestId, isRevision, isSessionId } from "../ids.ts";
import { fingerprint } from "../json/canonical.ts";
import type { JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, signPayload } from "./mac.ts";

/**
 * A signed confirmation challenge for one confirmed capability call.
 *
 * Minted by the host with its own summary, shown by the trusted shell,
 * returned unchanged, and verified before acting. Bound to one request id,
 * method, canonical parameter fingerprint, page revision and session; short
 * lived. spec R3.17–R3.21
 */
export interface ConfirmationChallenge {
  readonly v: 3;
  readonly scope: "confirm";
  readonly session: string;
  readonly revision: string;
  readonly requestId: string;
  readonly method: string;
  readonly paramsHash: string;
  readonly summary: string;
  readonly iat: number;
  readonly exp: number;
}

export interface ConfirmationBinding {
  readonly session: string;
  readonly revision: string;
  readonly requestId: string;
  readonly method: string;
  readonly params: JsonValue;
}

export function paramsFingerprint(params: JsonValue): string {
  return fingerprint(params);
}

export function mintChallenge(binding: ConfirmationBinding, summary: string, now: number, key: Uint8Array): { challenge: string; payload: ConfirmationChallenge } {
  const bounded = summary.length <= LIMITS.summaryChars ? summary : `${summary.slice(0, LIMITS.summaryChars - 1)}…`;
  const payload: ConfirmationChallenge = {
    v: 3,
    scope: "confirm",
    session: binding.session,
    revision: binding.revision,
    requestId: binding.requestId,
    method: binding.method,
    paramsHash: paramsFingerprint(binding.params),
    summary: bounded,
    iat: now,
    exp: now + LIMITS.confirmationMs,
  };
  return { challenge: signPayload(payload, key), payload };
}

export function openChallenge(challenge: string, key: Uint8Array, now: number): ConfirmationChallenge | null {
  if (typeof challenge !== "string" || challenge.length === 0 || challenge.length > LIMITS.tokenChars) return null;
  const payload = openToken(challenge, key);
  if (!isRecord(payload)) return null;
  if (
    payload.v !== 3 ||
    payload.scope !== "confirm" ||
    !isSessionId(payload.session) ||
    !isRevision(payload.revision) ||
    !isRequestId(payload.requestId) ||
    !isMethodName(payload.method) ||
    !isRevision(payload.paramsHash) ||
    typeof payload.summary !== "string" ||
    payload.summary.length === 0 ||
    payload.summary.length > LIMITS.summaryChars ||
    !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.confirmationMs)
  ) {
    return null;
  }
  return {
    v: 3,
    scope: "confirm",
    session: payload.session,
    revision: payload.revision,
    requestId: payload.requestId,
    method: payload.method,
    paramsHash: payload.paramsHash,
    summary: payload.summary,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

/** A challenge approves exactly one invocation: every bound field must match. */
export function challengeMatches(challenge: ConfirmationChallenge, binding: ConfirmationBinding): boolean {
  return (
    challenge.session === binding.session &&
    challenge.revision === binding.revision &&
    challenge.requestId === binding.requestId &&
    challenge.method === binding.method &&
    challenge.paramsHash === paramsFingerprint(binding.params)
  );
}
