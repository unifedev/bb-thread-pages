import { describe, expect, it } from "vitest";
import { ALL_CAPABILITIES, capabilityRegistry, completeInvocation, createRegistry, decodeBridgeRequest, resolveInvocation, type AnyCapabilitySpec } from "../../src/domain/capabilities/index.ts";
import { RENAMED_METHODS, unknownMethodMessage } from "../../src/domain/capabilities/renamed.ts";
import { PageError } from "../../src/domain/errors.ts";
import { LIMITS } from "../../src/domain/limits.ts";

const REV = "c".repeat(64);
const SPEC_NAMES = [
  "context.get",
  "session.activity",
  "sessions.snapshot",
  "projects.list",
  "providers.list",
  "storage.get",
  "session.reply",
  "storage.set",
  "pages.open",
  "sessions.openHost",
  "sessions.send",
  "sessions.start",
  "projects.create",
  "sessions.stop",
  "sessions.archive",
  "sessions.markRead",
  "navigation.openExternal",
  "projects.browse",
  "voice.captureAndTranscribe",
];

function spec(method: string): AnyCapabilitySpec {
  const found = capabilityRegistry.get(method);
  if (!found) throw new Error(`missing ${method}`);
  return found;
}

function request(method: string, params: unknown, id = "tp-1") {
  return { v: 1, id, method, params, pageRevision: REV };
}

describe("capability registry", () => {
  it("exposes exactly the spec 05 surface, with voice deferred", () => {
    expect(capabilityRegistry.list().map((entry) => entry.method)).toEqual(SPEC_NAMES);
    expect(capabilityRegistry.descriptors().map((entry) => entry.method)).not.toContain("voice.captureAndTranscribe");
    expect(capabilityRegistry.descriptors().find((entry) => entry.method === "sessions.start")).toEqual({ method: "sessions.start", effect: "cross-session-write", confirmation: "required" });
  });

  it("confirms every cross-session, destructive and device effect and no read", () => {
    for (const entry of capabilityRegistry.list()) {
      if (["cross-session-write", "destructive", "device"].includes(entry.effect)) expect(entry.confirmed, entry.method).toBe(true);
      if (["read", "own-session-write", "reader-state"].includes(entry.effect)) expect(entry.confirmed, entry.method).toBe(false);
    }
    expect(spec("navigation.openExternal").confirmed).toBe(true);
    expect(spec("pages.open").confirmed).toBe(false);
  });

  it("rejects duplicates, bad names and unsafe confirmation policy", () => {
    const base = spec("projects.list");
    expect(() => createRegistry([base, base])).toThrow(/Duplicate/);
    expect(() => createRegistry([{ ...base, method: "nodot" }])).toThrow(/Invalid capability name/);
    expect(() => createRegistry([{ ...spec("sessions.stop"), confirmed: false }])).toThrow(/must be confirmed/);
    expect(() => createRegistry([{ ...base, confirmed: true }])).toThrow(/must not be confirmed/);
  });
});

describe("bridge requests", () => {
  it("decodes the exact envelope and refuses everything else", () => {
    expect(decodeBridgeRequest(request("context.get", null))).toMatchObject({ method: "context.get" });
    expect(() => decodeBridgeRequest({ ...request("context.get", null), extra: 1 })).toThrow(PageError);
    expect(() => decodeBridgeRequest({ v: 2, id: "a", method: "context.get", params: null, pageRevision: REV })).toThrow(/version/i);
    expect(() => decodeBridgeRequest(request("Context.Get", null))).toThrow(/method/i);
    expect(() => decodeBridgeRequest({ ...request("context.get", null), pageRevision: "nope" })).toThrow(/revision/i);
    expect(() => decodeBridgeRequest("not json object")).toThrow(PageError);
    const huge = request("storage.set", { key: "k", value: "x".repeat(LIMITS.capabilityPayloadBytes) });
    expect(() => decodeBridgeRequest(huge)).toThrow(/too large/i);
  });

  it("refuses stale revisions before looking at the method, and unknown or deferred methods", () => {
    const stale = decodeBridgeRequest(request("context.get", null));
    expect(() => resolveInvocation(stale, capabilityRegistry, "d".repeat(64))).toThrow(expect.objectContaining({ code: "stale_page" }));
    expect(() => resolveInvocation(decodeBridgeRequest(request("fixture.nonexistentMethod", {})), capabilityRegistry, REV)).toThrow(expect.objectContaining({ code: "unknown_method" }));
    expect(() => resolveInvocation(decodeBridgeRequest(request("voice.captureAndTranscribe", {})), capabilityRegistry, REV)).toThrow(expect.objectContaining({ code: "unknown_method" }));
  });

  // 1.0.0 renamed the whole page-facing surface at once. A page written
  // against 0.3.x got back "Unknown capability: threads.spawn", which reads as
  // "this host cannot do that" rather than "this is called something else".
  it("names the replacement when a page calls a method that was renamed", () => {
    for (const [old, replacement] of Object.entries(RENAMED_METHODS)) {
      expect(() => resolveInvocation(decodeBridgeRequest(request(old, {})), capabilityRegistry, REV)).toThrow(
        expect.objectContaining({ code: "unknown_method", message: expect.stringContaining(`renamed to ${replacement}`) }),
      );
      expect(capabilityRegistry.get(old), `${old} must not be aliased`).toBeUndefined();
      expect(capabilityRegistry.get(replacement), `${replacement} must exist`).toBeDefined();
    }
  });

  it("does not invent a replacement for a method that never existed", () => {
    expect(unknownMethodMessage("fixture.nonexistentMethod")).toBe("Unknown capability: fixture.nonexistentMethod");
  });
});

describe("parameter validation", () => {
  const ok = (method: string, params: unknown) => resolveInvocation(decodeBridgeRequest(request(method, params)), capabilityRegistry, REV).params;
  const bad = (method: string, params: unknown) =>
    expect(() => resolveInvocation(decodeBridgeRequest(request(method, params)), capabilityRegistry, REV)).toThrow(expect.objectContaining({ code: "invalid_params" }));

  it("applies documented defaults", () => {
    expect(ok("session.activity", {})).toEqual({ limit: LIMITS.activityDefault });
    expect(ok("sessions.snapshot", {})).toEqual({ includeArchived: false, includeChildren: false, limit: LIMITS.snapshotDefault });
    expect(ok("session.reply", { result: { a: 1 } })).toEqual({ result: { a: 1 }, mode: "queue" });
    expect(ok("sessions.start", { projectId: "proj_a", prompt: "go" })).toEqual({ projectId: "proj_a", prompt: "go", environment: "project-default" });
    expect(ok("sessions.start", { projectId: "proj_a", prompt: "go", environment: { sameAs: "thr_x" } })).toMatchObject({ environment: { sameAs: "thr_x" } });
    expect(ok("context.get", {})).toBeNull();
    expect(ok("context.get", null)).toBeNull();
  });

  it("refuses unknown keys, session ids on own-session reads, ranges and escapes", () => {
    bad("session.activity", { limit: 1, sessionId: "thr_x" });
    bad("session.activity", { limit: 1, threadId: "thr_x" });
    bad("sessions.snapshot", { limit: 999_999 });
    bad("sessions.snapshot", { limit: 1, fixtureUnknownKey: "x" });
    bad("context.get", { anything: 1 });
    bad("sessions.start", { projectId: "proj_a", prompt: "go", environment: { environmentId: "env_x" } });
    bad("sessions.start", { projectId: "../etc", prompt: "go" });
    bad("sessions.send", { sessionId: "thr_b", prompt: "" });
    bad("storage.set", { key: "k", value: "x".repeat(LIMITS.storageValueBytes + 1) });
    bad("storage.get", { key: "../k" });
    bad("navigation.openExternal", { url: "javascript:alert(1)" });
    bad("navigation.openExternal", { url: "https://user:pw@example.com/" });
    bad("navigation.openExternal", { url: "ftp://example.com/" });
    bad("navigation.openExternal", { url: "/relative" });
    bad("projects.create", { selectionToken: "sel.x", path: "/etc" });
  });

  it("accepts the normal shapes", () => {
    expect(ok("navigation.openExternal", { url: "https://example.com/a?b=c", label: "Docs" })).toEqual({ url: "https://example.com/a?b=c", label: "Docs" });
    expect(ok("sessions.send", { sessionId: "thr_b", prompt: "hi", mode: "steer" })).toEqual({ sessionId: "thr_b", prompt: "hi", mode: "steer" });
    expect(ok("storage.set", { key: "wizard.step", value: { step: 3 } })).toEqual({ key: "wizard.step", value: { step: 3 } });
  });
});

describe("result projection", () => {
  const invocation = resolveInvocation(decodeBridgeRequest(request("projects.list", null)), capabilityRegistry, REV);

  it("returns only declared fields and refuses leaks with invalid_result", () => {
    const good = completeInvocation(invocation, { projects: [{ id: "p", name: "N", kind: "standard" }] });
    expect(good.ok).toBe(true);
    const leaky = completeInvocation(invocation, { projects: [{ id: "p", name: "N", kind: "standard", storageRootPath: "/x" }] });
    expect(leaky.ok).toBe(false);
    if (!leaky.ok) expect(leaky.error.code).toBe("invalid_result");
    const wrong = completeInvocation(invocation, { projects: "nope" });
    expect(wrong.ok).toBe(false);
  });

  it("bounds the response size", () => {
    const setInvocation = resolveInvocation(decodeBridgeRequest(request("storage.get", { key: "k" })), capabilityRegistry, REV);
    const big = completeInvocation(setInvocation, { found: true, value: "x".repeat(LIMITS.storageValueBytes - 10) });
    expect(big.ok).toBe(true);
    const tooBig = completeInvocation(setInvocation, { found: true, value: "x".repeat(LIMITS.storageValueBytes + 10) });
    expect(tooBig.ok).toBe(false);
  });

  it("documents every capability", () => {
    for (const entry of ALL_CAPABILITIES) {
      expect(entry.doc.params.length, entry.method).toBeGreaterThan(0);
      expect(entry.doc.result.length, entry.method).toBeGreaterThan(0);
    }
  });
});
