// `ConfirmationChallenge` mint/open/`challengeMatches`; a plain summary bound at `summaryChars`, a decision's bound by hash (03 R-C7); the redeemed set.
import { isMethodName, isRequestId, isRevision, isSessionIdentity } from "../ids.ts";
import { fingerprint } from "../json/canonical.ts";
import type { JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import { isRecord, lifetimeValid, openToken, sha256Hex, signPayload } from "./mac.ts";

export type ChallengeKind = "confirm" | "grant" | "decision";

/**
 * A signed confirmation challenge for one confirmed capability call. Minted
 * by the server with its own summary, shown by the trusted shell, returned
 * unchanged, verified before acting. Bound to one request id, method,
 * canonical parameter fingerprint, page revision and session; short-lived.
 * A decision's summary (up to `decisionSummaryChars`) is bound by its hash
 * and re-derived at redeem; every other summary rides in the challenge.
 * spec 05 R3.17–R3.21, 03 R-C7; DESIGN P15
 */
export interface ConfirmationChallenge {
  readonly v: 1;
  readonly scope: "confirm";
  readonly kind: ChallengeKind;
  readonly session: string;
  readonly revision: string;
  readonly requestId: string;
  readonly method: string;
  readonly paramsHash: string;
  /** The summary as shown, for `confirm` and `grant`. */
  readonly summary: string | null;
  /** The SHA-256 of the summary, for `decision`. */
  readonly summaryHash: string | null;
  readonly iat: number;
  readonly exp: number;
}

export interface ConfirmationBinding {
  readonly session: string;
  readonly revision: string;
  readonly requestId: string;
  readonly method: string;
  readonly params: JsonValue;
  /** For a decision: the summary re-derived from the live wait at redeem. */
  readonly summary?: string;
}

export function paramsFingerprint(params: JsonValue): string {
  return fingerprint(params);
}

/** A summary within `summaryChars`, cut with an ellipsis; decisions are never cut (R-C7). */
function boundSummary(summary: string): string {
  return summary.length <= LIMITS.summaryChars ? summary : `${summary.slice(0, LIMITS.summaryChars - 1)}…`;
}

/**
 * A decision's summary is bound by its hash and never rides in the token, so
 * its length is not bounded here: `checkAnswer` bounds the provider's part at
 * `decisionSummaryChars` before any challenge is minted, and the host's own
 * wording around it is fixed. 03 R-C7
 */
export function mintChallenge(binding: ConfirmationBinding, summary: string, now: number, key: Uint8Array, kind: ChallengeKind = "confirm"): { challenge: string; payload: ConfirmationChallenge } {
  const common = { v: 1 as const, scope: "confirm" as const, kind, session: binding.session, revision: binding.revision, requestId: binding.requestId, method: binding.method, paramsHash: paramsFingerprint(binding.params), iat: now, exp: now + LIMITS.confirmationMs };
  const signed = kind === "decision" ? { ...common, summaryHash: sha256Hex(summary) } : { ...common, summary: boundSummary(summary) };
  const payload: ConfirmationChallenge = { ...common, summary: kind === "decision" ? null : boundSummary(summary), summaryHash: kind === "decision" ? sha256Hex(summary) : null };
  return { challenge: signPayload(signed, key), payload };
}

export function openChallenge(challenge: unknown, key: Uint8Array, now: number): ConfirmationChallenge | null {
  if (typeof challenge !== "string" || challenge.length === 0 || challenge.length > LIMITS.tokenChars) return null;
  const payload = openToken(challenge, key);
  if (!isRecord(payload)) return null;
  const kind = payload.kind;
  if (kind !== "confirm" && kind !== "grant" && kind !== "decision") return null;
  if (
    payload.v !== 1 ||
    payload.scope !== "confirm" ||
    !isSessionIdentity(payload.session) ||
    !isRevision(payload.revision) ||
    !isRequestId(payload.requestId) ||
    !isMethodName(payload.method) ||
    !isRevision(payload.paramsHash) ||
    !lifetimeValid({ iat: payload.iat, exp: payload.exp }, now, LIMITS.confirmationMs)
  ) {
    return null;
  }
  const allowed = new Set(["v", "scope", "kind", "session", "revision", "requestId", "method", "paramsHash", "summary", "summaryHash", "iat", "exp"]);
  if (Object.keys(payload).some((field) => !allowed.has(field))) return null;
  if (kind === "decision") {
    if (!isRevision(payload.summaryHash) || payload.summary !== undefined) return null;
  } else if (typeof payload.summary !== "string" || payload.summary.length === 0 || payload.summary.length > LIMITS.summaryChars || payload.summaryHash !== undefined) {
    return null;
  }
  return {
    v: 1,
    scope: "confirm",
    kind,
    session: payload.session,
    revision: payload.revision,
    requestId: payload.requestId,
    method: payload.method,
    paramsHash: payload.paramsHash,
    summary: kind === "decision" ? null : (payload.summary as string),
    summaryHash: kind === "decision" ? (payload.summaryHash as string) : null,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

/** A challenge approves exactly one invocation: every bound field must match, and for a decision the re-derived summary too. 05 R3.19, R3.20 */
export function challengeMatches(challenge: ConfirmationChallenge, binding: ConfirmationBinding): boolean {
  if (challenge.session !== binding.session || challenge.revision !== binding.revision || challenge.requestId !== binding.requestId || challenge.method !== binding.method || challenge.paramsHash !== paramsFingerprint(binding.params)) return false;
  if (challenge.kind === "decision") return typeof binding.summary === "string" && challenge.summaryHash === sha256Hex(binding.summary);
  return true;
}

/** What identifies one challenge in the redeemed set: its signature. 05 R3.19a */
export function challengeId(challenge: string): string {
  const dot = challenge.lastIndexOf(".");
  return dot < 0 ? challenge : challenge.slice(dot + 1);
}
