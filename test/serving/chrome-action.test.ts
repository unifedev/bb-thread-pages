import { describe, expect, it } from "vitest";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { seedSession } from "../support/fake-host.ts";
import { PAGE, ROUTE_BASE, loadPlugin, type PluginFixture } from "../support/plugin.ts";

function tokenFor(fixture: PluginFixture, session: string): string {
  return mintActionToken({ session, revision: revisionOf(PAGE), now: fixture.clock.now }, fixture.serving.signingKey).token;
}

function act(fixture: PluginFixture, session: string, action: string, token?: string): Promise<Response> {
  return fixture.post(`${ROUTE_BASE}/chrome-action`, { actionToken: token ?? tokenFor(fixture, session), action });
}

describe("POST /chrome-action", () => {
  it("refuses a missing or forged token", async () => {
    const fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE);
    const missing = await fixture.post(`${ROUTE_BASE}/chrome-action`, { action: "read" });
    expect(missing.status).toBe(401);
    const forged = await fixture.post(`${ROUTE_BASE}/chrome-action`, { actionToken: "nope", action: "read" });
    expect(forged.status).toBe(401);
    await fixture.dispose();
  });

  it("rejects an unknown action", async () => {
    const fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE);
    const response = await act(fixture, "thr_a", "explode");
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_params");
    await fixture.dispose();
  });

  it("marks the shown session read and unread", async () => {
    const fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE, { unread: true });
    const read = await act(fixture, "thr_a", "read");
    expect(read.status).toBe(200);
    expect((await read.json()).state).toEqual({ pinned: false, unread: false, archived: false });
    const unread = await act(fixture, "thr_a", "unread");
    expect((await unread.json()).state.unread).toBe(true);
    expect(fixture.state.calls.filter((call) => call.method === "sessions.markRead")).toHaveLength(2);
    await fixture.dispose();
  });

  it("pins and unpins the shown session", async () => {
    const fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE);
    const pinned = await act(fixture, "thr_a", "pin");
    expect(pinned.status).toBe(200);
    expect((await pinned.json()).state.pinned).toBe(true);
    expect(fixture.state.sessions.get("thr_a")?.pinned).toBe(true);
    const unpinned = await act(fixture, "thr_a", "unpin");
    expect((await unpinned.json()).state.pinned).toBe(false);
    await fixture.dispose();
  });

  it("archives the shown session and reports it", async () => {
    const fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE, { unread: true, pinned: true });
    const response = await act(fixture, "thr_a", "archive");
    expect(response.status).toBe(200);
    expect((await response.json()).state).toEqual({ pinned: true, unread: true, archived: true });
    expect(fixture.state.calls.some((call) => call.method === "sessions.archive" && call.args[0] === "thr_a")).toBe(true);
    await fixture.dispose();
  });

  it("answers not_found for a session that does not exist", async () => {
    const fixture = await loadPlugin();
    const response = await act(fixture, "thr_missing", "read");
    expect(response.status).toBe(404);
    await fixture.dispose();
  });
});
