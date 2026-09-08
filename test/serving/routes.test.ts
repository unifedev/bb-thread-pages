import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import { fileKey, seedSession } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

let fixture: PluginFixture;

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", PAGE);
});

afterEach(() => fixture.dispose());

function token(session = "thr_a", revision = revisionOf(PAGE)): string {
  return mintActionToken({ session, revision, now: fixture.clock.now }, fixture.serving.signingKey).token;
}

describe("the shell", () => {
  it("serves trusted chrome with the action token inside and a sandboxed frame", async () => {
    const response = await fixture.get(`${ROUTE_BASE}/page?session=thr_a`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'nonce-/);
    expect(html).toContain('sandbox="allow-scripts allow-forms"');
    expect(html).toContain("data-config=");
    expect(html).toContain("&quot;actionToken&quot;");
    expect(html).not.toContain("← Sessions");
  });

  it("refuses unknown, ineligible and page-less sessions with a readable page", async () => {
    expect((await fixture.get(`${ROUTE_BASE}/page?session=thr_nope`)).status).toBe(404);
    fixture.state.sessions.set("thr_child", { ...fixture.state.sessions.get("thr_a")!, id: "thr_child", parentId: "thr_a" });
    const child = await fixture.get(`${ROUTE_BASE}/page?session=thr_child`);
    expect(child.status).toBe(404);
    expect(await child.text()).toMatch(/child of another session/);
    fixture.state.sessions.set("thr_empty", { ...fixture.state.sessions.get("thr_a")!, id: "thr_empty" });
    const empty = await fixture.get(`${ROUTE_BASE}/page?session=thr_empty`);
    expect(empty.status).toBe(404);
    expect(await empty.text()).toMatch(/bb thread-page init/);
    expect((await fixture.get(`${ROUTE_BASE}/page?session=..%2F..`)).status).toBe(400);
  });

  it("links to home from every page but home, and degrades on a stale pointer", async () => {
    seedSession(fixture.state, "thr_home", PAGE);
    await fixture.harness.behavior.setSettings({ homeSessionId: "thr_home" });
    expect(await (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).text()).toContain(`href="${ROUTE_BASE}/home"`);
    expect(await (await fixture.get(`${ROUTE_BASE}/page?session=thr_home`)).text()).not.toContain("← Sessions");
    const redirect = await fixture.get(`${ROUTE_BASE}/home`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(`${ROUTE_BASE}/page?session=thr_home`);
    await fixture.harness.behavior.setSettings({ homeSessionId: "thr_gone" });
    expect((await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).status).toBe(200);
    const missing = await fixture.get(`${ROUTE_BASE}/home`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toMatch(/no longer exists/);
    await fixture.harness.behavior.setSettings({ homeSessionId: null });
    const none = await fixture.get(`${ROUTE_BASE}/home`);
    expect(none.status).toBe(404);
    expect(await none.text()).toMatch(/Set up my Thread Pages home page/);
  });

  it("hides the working indicator when the label is blank", async () => {
    fixture.state.sessions.set("thr_a", { ...fixture.state.sessions.get("thr_a")!, state: "working" });
    expect(await (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).text()).toContain('data-visible="true"');
    await fixture.harness.behavior.setSettings({ workingLabel: "" });
    expect(await (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).text()).toContain('data-visible="false"');
  });
});

describe("the document", () => {
  it("injects the kernel and a same-origin base, and answers the poll with headers", async () => {
    const response = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(`"${revisionOf(PAGE)}"`);
    expect(response.headers.get("x-thread-page-activity")).toBe("idle");
    expect(response.headers.get("x-thread-page-stale")).toBe("false");
    expect(response.headers.get("content-security-policy")).toMatch(/connect-src \*/);
    expect(response.headers.get("content-security-policy")).toMatch(/frame-src 'none'/);
    const html = await response.text();
    expect(html.indexOf('<base href="/api/v1/threads/thr_a/thread-storage/files/">')).toBeLessThan(html.indexOf("data-thread-page-kernel"));
    expect(html.indexOf("data-thread-page-kernel")).toBeLessThan(html.indexOf("<title>"));
    const unchanged = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`, { "if-none-match": `"${revisionOf(PAGE)}"` });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("x-thread-page-activity")).toBe("idle");
  });

  it("reflects a saved change as a new revision and refuses an oversized page by name", async () => {
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.from(PAGE.replace("Test page", "Changed")));
    const changed = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`, { "if-none-match": `"${revisionOf(PAGE)}"` });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(`"${revisionOf(PAGE)}"`);
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.alloc(LIMITS.entryDocumentBytes + 1, 0x20));
    const huge = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    expect(huge.status).toBe(413);
    expect(await huge.text()).toMatch(/5 MiB/);
  });

  it("serves the offline copy read-only when the host is unreachable", async () => {
    await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    fixture.state.offline = true;
    const stale = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-thread-page-stale")).toBe("true");
    expect(await stale.text()).toContain("&quot;stale&quot;:true");
    const shell = await fixture.get(`${ROUTE_BASE}/page?session=thr_a`);
    expect(await shell.text()).toContain("Offline copy — read-only");
    const submit = await fixture.post(`${ROUTE_BASE}/submit`, { actionToken: token(), submissionId: "s1", pageRevision: revisionOf(PAGE), title: "T", answers: [] });
    expect(submit.status).toBe(503);
    expect(await submit.json()).toMatchObject({ ok: false, code: "unavailable" });
    expect(fixture.state.calls.filter((call) => call.method === "sessions.send")).toHaveLength(0);
  });
});

describe("submissions", () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    actionToken: token(),
    submissionId: "sub-1",
    pageRevision: revisionOf(PAGE),
    title: "Test form",
    answers: [
      { name: "action", label: "Action", value: "Go" },
      { name: "anything", label: "Anything", value: "" },
    ],
    ...overrides,
  });

  it("delivers once per submission id, replays identical repeats and refuses conflicts", async () => {
    const first = await fixture.post(`${ROUTE_BASE}/submit`, body());
    expect(await first.json()).toEqual({ ok: true, delivery: "queued" });
    const repeat = await fixture.post(`${ROUTE_BASE}/submit`, body());
    expect(repeat.status).toBe(200);
    const conflict = await fixture.post(`${ROUTE_BASE}/submit`, body({ answers: [{ name: "anything", label: "Anything", value: "different" }] }));
    expect(conflict.status).toBe(409);
    const sends = fixture.state.calls.filter((call) => call.method === "sessions.send");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.args[1]).toContain("**Action**\nGo");
    expect(sends[0]!.args[1]).toContain("**Anything**\n(left blank)");
    expect(sends[0]!.args[2]).toBe("queue");
  });

  it("refuses a bad or foreign token and a stale revision distinguishably", async () => {
    expect((await fixture.post(`${ROUTE_BASE}/submit`, body({ actionToken: "nope" }))).status).toBe(401);
    seedSession(fixture.state, "thr_b", PAGE);
    const foreign = await fixture.post(`${ROUTE_BASE}/submit`, body({ actionToken: token("thr_b") }));
    expect(foreign.status).toBe(200);
    expect(fixture.state.calls.filter((call) => call.method === "sessions.send").at(-1)?.args[0]).toBe("thr_b");
    const old = await fixture.post(`${ROUTE_BASE}/submit`, body({ submissionId: "sub-2", pageRevision: "9".repeat(64), actionToken: token("thr_a", "9".repeat(64)) }));
    expect(old.status).toBe(409);
    expect(await old.json()).toMatchObject({ code: "stale_page" });
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.from(PAGE.replace("Test page", "Newer")));
    const changed = await fixture.post(`${ROUTE_BASE}/submit`, body({ submissionId: "sub-3" }));
    expect(await changed.json()).toMatchObject({ code: "stale_page" });
  });

  it("rate limits per page with a distinguishable code", async () => {
    let refused = 0;
    for (let index = 0; index < LIMITS.ratePerMinute + 5; index += 1) {
      const response = await fixture.post(`${ROUTE_BASE}/submit`, body({ submissionId: `burst-${index}` }));
      if (response.status === 429) {
        refused += 1;
        expect(await response.json()).toMatchObject({ code: "rate_limited" });
      }
    }
    expect(refused).toBe(5);
    fixture.clock.now += 61_000;
    expect((await fixture.post(`${ROUTE_BASE}/submit`, body({ submissionId: "after" }))).status).toBe(200);
  });
});

describe("uploads", () => {
  it("stores bytes under a host-generated name in uploads/ and reports the path", async () => {
    const response = await fixture.post(`${ROUTE_BASE}/upload`, { actionToken: token(), name: "../../report (final).pdf", content: Buffer.from("hello").toString("base64") });
    expect(response.status).toBe(200);
    const stored = (await response.json()) as { ok: boolean; name: string; path: string; sizeBytes: number };
    expect(stored.name).toMatch(/^\d{8}-\d{6}-[a-f0-9]{6}-report__final_\.pdf$/);
    expect(stored.path).toBe(`uploads/${stored.name}`);
    expect(stored.sizeBytes).toBe(5);
    expect(fixture.state.files.get(fileKey("thr_a", stored.path))).toEqual(Buffer.from("hello"));
    const submit = await fixture.post(`${ROUTE_BASE}/submit`, { actionToken: token(), submissionId: "with-file", pageRevision: revisionOf(PAGE), title: "T", answers: [], files: [{ field: "f", name: stored.name, path: stored.path, sizeBytes: 5 }] });
    expect(submit.status).toBe(200);
    expect(fixture.state.calls.filter((call) => call.method === "sessions.send").at(-1)?.args[1]).toContain(`$BB_THREAD_STORAGE/${stored.path}`);
  });

  it("refuses empty, non-base64 and forged-path files", async () => {
    expect((await fixture.post(`${ROUTE_BASE}/upload`, { actionToken: token(), name: "a", content: "" })).status).toBe(400);
    expect((await fixture.post(`${ROUTE_BASE}/upload`, { actionToken: token(), name: "a", content: "not base64!" })).status).toBe(400);
    const forged = await fixture.post(`${ROUTE_BASE}/submit`, { actionToken: token(), submissionId: "forged", pageRevision: revisionOf(PAGE), title: "T", answers: [], files: [{ field: "f", name: "x", path: "../../etc/passwd", sizeBytes: 1 }] });
    expect(forged.status).toBe(400);
  });
});
