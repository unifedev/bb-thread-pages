import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import { openChallenge } from "../../src/domain/tokens/confirmation.ts";
import { fileKey, seedSession, sessionRecord } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

let fixture: PluginFixture;
let counter = 0;

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", PAGE);
  fixture.state.sessions.set("thr_b", sessionRecord({ id: "thr_b", title: "Other session" }));
  seedSession(fixture.state, "thr_c", PAGE, { title: "Has page" });
});

afterEach(() => fixture.dispose());

type Transport = { response?: { ok: boolean; result?: unknown; error?: { code: string; message: string } }; navigate?: unknown; confirm?: { requestId: string; summary: string; challenge: string } };

async function call(method: string, params: unknown = null, options: { session?: string; revision?: string; confirmation?: string; id?: string } = {}): Promise<{ status: number; body: Transport; id: string }> {
  const session = options.session ?? "thr_a";
  const revision = options.revision ?? revisionOf(PAGE);
  const { token } = mintActionToken({ session, revision, now: fixture.clock.now }, fixture.serving.signingKey);
  const id = options.id ?? `tp-${++counter}`;
  const request = { v: 1, id, method, params, pageRevision: revision };
  const response = await fixture.post(`${ROUTE_BASE}/bridge`, { actionToken: token, request, ...(options.confirmation ? { confirmation: options.confirmation } : {}) });
  return { status: response.status, body: (await response.json()) as Transport, id };
}

async function confirmed(method: string, params: unknown, options: { session?: string } = {}) {
  const first = await call(method, params, options);
  expect(first.status).toBe(401);
  expect(first.body.confirm?.requestId).toBe(first.id);
  const second = await call(method, params, { ...options, confirmation: first.body.confirm!.challenge, id: first.id });
  return { first, second };
}

describe("reads", () => {
  it("context.get reports identity, revision and the honest roster", async () => {
    const { body } = await call("context.get");
    expect(body.response?.ok).toBe(true);
    const result = body.response!.result as { session: { id: string; title: string }; page: { revision: string; readOnly: boolean }; capabilities: { method: string }[] };
    expect(result.session).toEqual({ id: "thr_a", title: "Session thr_a", projectId: "proj_a" });
    expect(result.page).toEqual({ revision: revisionOf(PAGE), readOnly: false });
    expect(result.capabilities.map((entry) => entry.method)).toContain("sessions.start");
    expect(result.capabilities.map((entry) => entry.method)).not.toContain("voice.captureAndTranscribe");
  });

  it("session.activity refuses a session id and answers for the owner only", async () => {
    const refused = await call("session.activity", { limit: 1, sessionId: "thr_b" });
    expect(refused.body.response?.error?.code).toBe("invalid_params");
    const { body } = await call("session.activity", { limit: 1 });
    expect(body.response?.result).toEqual({ state: "idle", updatedAtMs: 1_700_000_000_000, items: fixture.state.activity });
    expect(fixture.state.calls.find((entry) => entry.method === "sessions.activity")?.args[0]).toBe("thr_a");
  });

  it("sessions.snapshot projects, reports page availability, honours the cap and pages with a real cursor", async () => {
    for (let index = 0; index < 5; index += 1) fixture.state.sessions.set(`thr_x${index}`, sessionRecord({ id: `thr_x${index}`, archived: index === 4 }));
    fixture.state.sessions.set("thr_hidden", sessionRecord({ id: "thr_hidden", visibility: "hidden" }));
    const page1 = (await call("sessions.snapshot", { limit: 3 })).body.response!.result as { sessions: { id: string; page: { available: boolean } }[]; nextCursor: string | null };
    expect(page1.sessions).toHaveLength(3);
    expect(page1.nextCursor).not.toBeNull();
    expect(Object.keys(page1.sessions[0]!).sort()).toEqual(["archived", "id", "page", "parentSessionId", "projectId", "status", "title", "updatedAtMs"]);
    expect(page1.sessions.find((entry) => entry.id === "thr_a")?.page.available).toBe(true);
    expect(page1.sessions.find((entry) => entry.id === "thr_b")?.page.available).toBe(false);
    const page2 = (await call("sessions.snapshot", { limit: 3, cursor: page1.nextCursor })).body.response!.result as { sessions: { id: string }[]; nextCursor: string | null };
    const all = [...page1.sessions, ...page2.sessions].map((entry) => entry.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("thr_hidden");
    expect(all).not.toContain("thr_x4");
    const withArchived = (await call("sessions.snapshot", { limit: 50, includeArchived: true })).body.response!.result as { sessions: { id: string; archived: boolean }[] };
    expect(withArchived.sessions.find((entry) => entry.id === "thr_x4")?.archived).toBe(true);
    const wrongCursor = await call("sessions.snapshot", { limit: 3, cursor: page1.nextCursor, includeArchived: true });
    expect(wrongCursor.body.response?.error?.code).toBe("invalid_params");
  });

  it("providers.list works or fails clearly, and projects.list carries no paths", async () => {
    const providers = (await call("providers.list")).body.response!.result as { providers: unknown[] };
    expect(providers.providers).toEqual(fixture.state.providers);
    fixture.state.providersFail = true;
    expect((await call("providers.list")).body.response?.error?.code).toBe("unavailable");
    const projects = (await call("projects.list")).body.response!.result as { projects: Record<string, unknown>[] };
    expect(projects.projects).toEqual([{ id: "proj_a", name: "Alpha", kind: "standard" }]);
  });

  it("storage round-trips and is namespaced per session", async () => {
    expect((await call("storage.set", { key: "k", value: { a: 1 } })).body.response?.result).toEqual({ stored: true });
    expect((await call("storage.get", { key: "k" })).body.response?.result).toEqual({ found: true, value: { a: 1 } });
    expect((await call("storage.get", { key: "k" }, { session: "thr_c" })).body.response?.result).toEqual({ found: false });
  });
});

describe("protocol errors", () => {
  it("reports unknown_method, stale_page, invalid envelopes and bad tokens with codes", async () => {
    expect((await call("fixture.nonexistentMethod", {})).body.response?.error?.code).toBe("unknown_method");
    expect((await call("voice.captureAndTranscribe", {})).body.response?.error?.code).toBe("unknown_method");
    const stale = await call("context.get", null, { revision: "8".repeat(64) });
    expect(stale.body.response?.error?.code).toBe("stale_page");
    const badToken = await fixture.post(`${ROUTE_BASE}/bridge`, { actionToken: "nope", request: { v: 1, id: "tp-x", method: "context.get", params: null, pageRevision: revisionOf(PAGE) } });
    expect(badToken.status).toBe(401);
    expect(((await badToken.json()) as Transport).response?.error?.code).toBe("confirmation_invalid");
    const garbage = await fixture.post(`${ROUTE_BASE}/bridge`, { nope: true });
    expect(((await garbage.json()) as Transport).response?.error?.code).toBe("invalid_request");
  });

  it("refuses a token minted for another session's page revision", async () => {
    seedSession(fixture.state, "thr_d", PAGE.replace("Test page", "D"));
    const { body } = await call("context.get", null, { session: "thr_d", revision: revisionOf(PAGE) });
    expect(body.response?.error?.code).toBe("stale_page");
  });
});

describe("confirmed effects", () => {
  it("challenges with a host-authored summary, then acts only with the matching challenge", async () => {
    const { first, second } = await confirmed("sessions.send", { sessionId: "thr_b", prompt: "Please continue." });
    expect(first.body.confirm?.summary).toBe("Send to “Other session”: “Please continue.”");
    expect(second.body.response?.result).toEqual({ sessionId: "thr_b", delivery: "queued", duplicate: false });
    const opened = openChallenge(first.body.confirm!.challenge, fixture.serving.signingKey, fixture.clock.now);
    expect(opened?.summary).toBe(first.body.confirm?.summary);
  });

  it("rejects a forged, replayed, reordered-and-altered, or wrong-request challenge", async () => {
    const first = await call("sessions.send", { sessionId: "thr_b", prompt: "one" });
    const challenge = first.body.confirm!.challenge;
    const altered = await call("sessions.send", { prompt: "one", sessionId: "thr_c" }, { confirmation: challenge, id: first.id });
    expect(altered.body.response?.error?.code).toBe("confirmation_invalid");
    const otherRequest = await call("sessions.send", { sessionId: "thr_b", prompt: "one" }, { confirmation: challenge, id: "tp-different" });
    expect(otherRequest.body.response?.error?.code).toBe("confirmation_invalid");
    const reordered = await call("sessions.send", { prompt: "one", sessionId: "thr_b" }, { confirmation: challenge, id: first.id });
    expect(reordered.body.response?.result).toMatchObject({ sessionId: "thr_b" });
    const [payload] = challenge.split(".");
    const forged = `${payload}.${"A".repeat(43)}`;
    expect((await call("sessions.send", { sessionId: "thr_b", prompt: "one" }, { confirmation: forged, id: first.id })).body.response?.error?.code).toBe("confirmation_invalid");
    fixture.clock.now += LIMITS.confirmationMs + 1000;
    const late = await call("sessions.send", { sessionId: "thr_b", prompt: "one" }, { confirmation: challenge, id: first.id });
    expect(late.body.response?.error?.code).toBe("confirmation_invalid");
  });

  it("refuses the page's own session for send and stop before any dialog", async () => {
    const send = await call("sessions.send", { sessionId: "thr_a", prompt: "x" });
    expect(send.status).toBe(400);
    expect(send.body.response?.error?.code).toBe("invalid_params");
    const stop = await call("sessions.stop", { sessionId: "thr_a" });
    expect(stop.body.response?.error?.code).toBe("invalid_params");
    expect(stop.body.confirm).toBeUndefined();
    const missing = await call("sessions.stop", { sessionId: "thr_missing" });
    expect(missing.body.response?.error?.code).toBe("not_found");
  });

  it("starts a session with only a project and a prompt, always supplying an environment", async () => {
    const { first, second } = await confirmed("sessions.start", { projectId: "proj_a", prompt: "Run the tests and report." });
    expect(first.body.confirm?.summary).toMatch(/^Start a session in Alpha: “Run the tests and report\.” — using the project's default provider and model, in the project's default environment$/);
    expect(second.body.response?.result).toEqual({ sessionId: "thr_new" });
    const start = fixture.state.calls.find((entry) => entry.method === "sessions.start")!.args[0];
    expect(start).toEqual({ projectId: "proj_a", prompt: "Run the tests and report.", environment: { kind: "project-default" } });
    const unknownProject = await call("sessions.start", { projectId: "proj_zzz", prompt: "x" });
    expect(unknownProject.body.response?.error?.code).toBe("not_found");
    const reuse = await confirmed("sessions.start", { projectId: "proj_a", prompt: "x", environment: { sameAs: "thr_b" }, providerId: "codex", model: "gpt" });
    expect(reuse.first.body.confirm?.summary).toMatch(/using codex · gpt, in the environment of “Other session”/);
    expect(fixture.state.calls.filter((entry) => entry.method === "sessions.start").at(-1)!.args[0]).toMatchObject({ environment: { kind: "reuse", environmentId: "env_a" }, providerId: "codex", model: "gpt" });
  });

  it("stops and archives after confirmation", async () => {
    expect((await confirmed("sessions.stop", { sessionId: "thr_b" })).second.body.response?.result).toEqual({ stopped: true });
    expect((await confirmed("sessions.archive", { sessionId: "thr_b" })).second.body.response?.result).toEqual({ archived: true });
    expect(fixture.state.calls.map((entry) => entry.method)).toEqual(expect.arrayContaining(["sessions.stop", "sessions.archive"]));
  });

  it("browses for a folder and returns an opaque single-use token bound to the page", async () => {
    const { second } = await confirmed("projects.browse", null);
    const selection = (second.body.response?.result as { selection: { token: string; displayPath: string; hostName: string } }).selection;
    expect(selection.displayPath).toBe("~/proj");
    expect(selection.token).toMatch(/^sel\./);
    expect(JSON.stringify(second.body)).not.toContain("/Users/bart");
    const foreign = await call("projects.create", { selectionToken: selection.token }, { session: "thr_c" });
    expect(foreign.body.response?.error?.code).toBe("not_found");
    const created = await confirmed("projects.create", { selectionToken: selection.token, name: "Proj" });
    expect(created.first.body.confirm?.summary).toBe("Create project “Proj” from ~/proj");
    expect(created.second.body.response?.result).toEqual({ project: { id: "proj_new", name: "Proj", kind: "standard" } });
    expect((await call("projects.create", { selectionToken: selection.token })).body.response?.error?.code).toBe("not_found");
  });
});

describe("navigation", () => {
  it("opens pages and host sessions in place through host-built URLs", async () => {
    const page = await call("pages.open", { sessionId: "thr_c" });
    expect(page.body.response?.result).toEqual({ opened: true });
    expect(page.body.navigate).toEqual({ kind: "page", url: `${ROUTE_BASE}/page?session=thr_c` });
    expect((await call("pages.open", { sessionId: "thr_missing" })).body.response?.error?.code).toBe("not_found");
    const host = await call("sessions.openHost", { sessionId: "thr_b" });
    expect(host.body.navigate).toEqual({ kind: "host", url: "/threads/thr_b" });
  });

  it("confirms external navigation naming the origin", async () => {
    const { first, second } = await confirmed("navigation.openExternal", { url: "https://example.com/path?q=1", label: "Docs" });
    expect(first.body.confirm?.summary).toBe("Leave this page and open “Docs” at https://example.com");
    expect(second.body.navigate).toEqual({ kind: "external", url: "https://example.com/path?q=1" });
  });
});

describe("own-session reply", () => {
  it("delivers a structured result, honours steer, and dedupes on an idempotency key", async () => {
    const first = await call("session.reply", { title: "Diagram", result: { nodes: ["a"] }, idempotencyKey: "k1" });
    expect(first.body.response?.result).toEqual({ delivery: "queued", duplicate: false });
    const repeat = await call("session.reply", { title: "Diagram", result: { nodes: ["a"] }, idempotencyKey: "k1" });
    expect(repeat.body.response?.result).toEqual({ delivery: "queued", duplicate: true });
    const conflict = await call("session.reply", { title: "Diagram", result: { nodes: ["b"] }, idempotencyKey: "k1" });
    expect(conflict.body.response?.error?.code).toBe("conflict");
    fixture.state.sendDelivery = "steered";
    await call("session.reply", { result: 1, mode: "steer" });
    const sends = fixture.state.calls.filter((entry) => entry.method === "sessions.send");
    expect(sends).toHaveLength(2);
    expect(sends[0]!.args[1]).toContain("```json");
    expect(sends[1]!.args[2]).toBe("steer");
  });

  it("refuses effects on an offline copy but still answers reads", async () => {
    await call("context.get");
    fixture.state.offline = true;
    const read = await call("context.get");
    expect((read.body.response?.result as { page: { readOnly: boolean } }).page.readOnly).toBe(true);
    const write = await call("session.reply", { result: 1 });
    expect(write.body.response?.error?.code).toBe("unavailable");
  });

  it("does not leak host fields even when the page file changes between token and call", async () => {
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.from(PAGE.replace("Test page", "Newer")));
    const { body } = await call("context.get");
    expect(body.response?.error?.code).toBe("stale_page");
  });
});
