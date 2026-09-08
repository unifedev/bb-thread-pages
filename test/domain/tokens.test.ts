import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { mintActionToken, verifyActionToken } from "../../src/domain/tokens/action-token.ts";
import { challengeMatches, mintChallenge, openChallenge, paramsFingerprint } from "../../src/domain/tokens/confirmation.ts";
import { openToken, signPayload } from "../../src/domain/tokens/mac.ts";

const key = randomBytes(32);
const otherKey = randomBytes(32);
const REV = "a".repeat(64);
const NOW = 1_700_000_000_000;

describe("action tokens", () => {
  it("binds scope, session, revision and a bounded lifetime", () => {
    const { token, payload } = mintActionToken({ session: "thr_a", revision: REV, now: NOW }, key);
    expect(payload.exp - payload.iat).toBe(LIMITS.actionTokenMs);
    const verified = verifyActionToken(token, key, NOW + 1000);
    expect(verified?.session).toBe("thr_a");
    expect(verified?.revision).toBe(REV);
    expect(verifyActionToken(token, key, payload.exp + 1)).toBeNull();
    expect(verifyActionToken(token, otherKey, NOW)).toBeNull();
    expect(verifyActionToken(`${token}x`, key, NOW)).toBeNull();
    expect(verifyActionToken("", key, NOW)).toBeNull();
  });

  it("rejects a re-signed payload with a widened lifetime or a foreign scope", () => {
    const wide = signPayload({ v: 3, scope: "action", session: "thr_a", revision: REV, iat: NOW, exp: NOW + LIMITS.actionTokenMs * 3 }, key);
    expect(verifyActionToken(wide, key, NOW)).toBeNull();
    const confirmScope = signPayload({ v: 3, scope: "confirm", session: "thr_a", revision: REV, iat: NOW, exp: NOW + 1000 }, key);
    expect(verifyActionToken(confirmScope, key, NOW)).toBeNull();
    const oldVersion = signPayload({ v: 2, scope: "action", session: "thr_a", revision: REV, iat: NOW, exp: NOW + 1000 }, key);
    expect(verifyActionToken(oldVersion, key, NOW)).toBeNull();
  });

  it("verifies signatures in a way that survives tampering with the payload", () => {
    const { token } = mintActionToken({ session: "thr_a", revision: REV, now: NOW }, key);
    const [payload, signature] = token.split(".") as [string, string];
    const forged = `${Buffer.from(JSON.stringify({ ...(JSON.parse(Buffer.from(payload, "base64url").toString()) as object), session: "thr_b" })).toString("base64url")}.${signature}`;
    expect(openToken(forged, key)).toBeNull();
  });
});

describe("confirmation challenges", () => {
  const binding = { session: "thr_a", revision: REV, requestId: "tp-1", method: "sessions.send", params: { sessionId: "thr_b", prompt: "hi", mode: "queue" } };

  it("carries the host's summary and expires in two minutes", () => {
    const { challenge, payload } = mintChallenge(binding, "Send to B", NOW, key);
    expect(payload.exp - payload.iat).toBe(LIMITS.confirmationMs);
    const opened = openChallenge(challenge, key, NOW + 5000);
    expect(opened?.summary).toBe("Send to B");
    expect(opened && challengeMatches(opened, binding)).toBe(true);
    expect(openChallenge(challenge, key, NOW + LIMITS.confirmationMs + 1)).toBeNull();
    expect(openChallenge(challenge, otherKey, NOW)).toBeNull();
  });

  it("cannot be reused for another request, method, session, revision or altered parameters", () => {
    const { challenge } = mintChallenge(binding, "Send to B", NOW, key);
    const opened = openChallenge(challenge, key, NOW)!;
    expect(challengeMatches(opened, { ...binding, requestId: "tp-2" })).toBe(false);
    expect(challengeMatches(opened, { ...binding, method: "sessions.stop" })).toBe(false);
    expect(challengeMatches(opened, { ...binding, session: "thr_c" })).toBe(false);
    expect(challengeMatches(opened, { ...binding, revision: "b".repeat(64) })).toBe(false);
    expect(challengeMatches(opened, { ...binding, params: { sessionId: "thr_c", prompt: "hi", mode: "queue" } })).toBe(false);
  });

  it("treats reordered parameter keys as the same parameters", () => {
    const { challenge } = mintChallenge(binding, "Send to B", NOW, key);
    const opened = openChallenge(challenge, key, NOW)!;
    expect(challengeMatches(opened, { ...binding, params: { mode: "queue", prompt: "hi", sessionId: "thr_b" } })).toBe(true);
    expect(paramsFingerprint({ b: 1, a: 2 })).toBe(paramsFingerprint({ a: 2, b: 1 }));
  });

  it("bounds the summary", () => {
    const { payload } = mintChallenge(binding, "x".repeat(2000), NOW, key);
    expect(payload.summary.length).toBe(LIMITS.summaryChars);
  });
});
