import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createBbHost } from "../../src/bb/bb-host.ts";
import { activityItemsOf, sessionStateOf } from "../../src/bb/activity.ts";

function hostWith(sdk: NonNullable<NonNullable<Parameters<typeof createFakePluginHost>[0]>["sdk"]>) {
  const fake = createFakePluginHost({ pluginId: "thread-pages", sdk });
  return { host: createBbHost(fake.bb), fake };
}

describe("bb adapter", () => {
  it("projects a thread into a session record and asks about pending interactions only when idle", async () => {
    const { host, fake } = hostWith({
      threads: {
        get: async () => makeThreadResponse({ id: "thr_a", title: null, titleFallback: "Fallback", projectId: "proj_a", environmentId: "env_1", visibility: "visible", parentThreadId: null, sourceThreadId: null, archivedAt: null, deletedAt: null, updatedAt: 42, lastReadAt: 40, latestAttentionAt: 41 }),
        interactions: { list: async () => [{ id: "i1" }] as never },
      },
    });
    const session = await host.sessions.get("thr_a");
    expect(session).toEqual({ id: "thr_a", title: "Fallback", projectId: "proj_a", state: "waiting", visibility: "visible", parentId: null, forkOfId: null, archived: false, deleted: false, updatedAtMs: 42, attentionAtMs: 41, unread: true, environmentId: "env_1" });
    expect(fake.harness.inspection.sdk.callsTo("threads.interactions.list")).toHaveLength(1);
  });

  it("returns null for a missing thread and unavailable for other failures", async () => {
    const { host } = hostWith({ threads: { get: async () => Promise.reject(Object.assign(new Error("not found"), { status: 404 })) } });
    expect(await host.sessions.get("thr_x")).toBeNull();
    const { host: broken } = hostWith({ threads: { get: async () => Promise.reject(new Error("socket hang up")) } });
    await expect(broken.sessions.get("thr_x")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("always sends an environment when starting a session, and marks it visible", async () => {
    const { host, fake } = hostWith({ threads: { spawn: async () => ({ id: "thr_new" }) as never } });
    await host.sessions.start({ projectId: "proj_a", prompt: "go", environment: { kind: "project-default" } });
    await host.sessions.start({ projectId: "proj_a", prompt: "go", title: "T", providerId: "codex", environment: { kind: "reuse", environmentId: "env_9" } });
    const calls = fake.harness.inspection.sdk.callsTo("threads.spawn");
    expect(calls[0]![0]).toMatchObject({ projectId: "proj_a", prompt: "go", environment: { type: "project-default" }, visibility: "visible" });
    expect(calls[1]![0]).toMatchObject({ environment: { type: "reuse", environmentId: "env_9" }, providerId: "codex", title: "T" });
  });

  it("marks read and unread through bb and reports the resulting mark", async () => {
    const { host, fake } = hostWith({
      threads: {
        markRead: async () => makeThreadResponse({ id: "thr_a", lastReadAt: 50, latestAttentionAt: 41 }),
        markUnread: async () => makeThreadResponse({ id: "thr_a", lastReadAt: null, latestAttentionAt: 41 }),
      },
    });
    expect(await host.sessions.markRead("thr_a", true)).toEqual({ unread: false });
    expect(await host.sessions.markRead("thr_a", false)).toEqual({ unread: true });
    expect(fake.harness.inspection.sdk.callsTo("threads.markRead")).toHaveLength(1);
    expect(fake.harness.inspection.sdk.callsTo("threads.markUnread")).toHaveLength(1);
  });

  it("reads models from the catalog object per provider and drops what it cannot use", async () => {
    const { host } = hostWith({
      providers: {
        list: async () => [{ id: "codex", displayName: "Codex", available: true }, { id: "broken", displayName: "Broken", available: false }] as never,
        models: async (args?: { providerId?: string }) =>
          args?.providerId === "codex"
            ? ({ models: [{ id: "m1", displayName: "One", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] }, { nope: true }], providers: [] } as never)
            : Promise.reject(new Error("no models")),
      },
    });
    expect(await host.providers.list()).toEqual([
      { id: "codex", displayName: "Codex", available: true, models: [{ id: "m1", displayName: "One", isDefault: true, reasoningLevels: ["low", "high"] }] },
      { id: "broken", displayName: "Broken", available: false, models: [] },
    ]);
    const { host: failing } = hostWith({ providers: { list: async () => Promise.reject(new Error("down")) } });
    await expect(failing.providers.list()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("projects projects without paths and picks the default source's host", async () => {
    const { host } = hostWith({
      projects: { list: async () => [{ id: "p", name: "P", kind: "standard", sources: [{ hostId: "h2", path: "/x", isDefault: false }, { hostId: "h1", path: "/y", isDefault: true }] }] as never },
    });
    expect(await host.projects.list()).toEqual([{ id: "p", name: "P", kind: "standard", hostId: "h1" }]);
  });

  it("reads and writes files through the host's daemon with the storage root as the boundary", async () => {
    const { host, fake } = hostWith({
      files: {
        read: async () => ({ content: Buffer.from("hi").toString("base64"), contentEncoding: "base64", sha256: "x", sizeBytes: 2, modifiedAtMs: 5, path: "/s/index.html" }) as never,
        write: async () => ({ outcome: "conflict", currentSha256: "abc" }) as never,
      },
    });
    const content = await host.files.read({ hostId: "h", rootPath: "/s/" }, "index.html");
    expect(Buffer.from(content!.bytes).toString()).toBe("hi");
    expect(fake.harness.inspection.sdk.callsTo("files.read")[0]![0]).toMatchObject({ hostId: "h", path: "/s/index.html", rootPath: "/s/" });
    expect(await host.files.write({ hostId: "h", rootPath: "/s" }, "index.html", Buffer.from("x"), { onlyIfAbsent: true })).toBe("exists");
    expect(fake.harness.inspection.sdk.callsTo("files.write")[0]![0]).toMatchObject({ expectedSha256: null, contentEncoding: "base64", createParents: true });
  });

  it("lists archived threads as a separate query and reports pending interactions from rows", async () => {
    const { host, fake } = hostWith({
      threads: { list: async () => [{ ...makeThreadResponse({ id: "thr_1" }), hasPendingInteraction: true }] as never },
    });
    const rows = await host.sessions.list({ archived: true, rootsOnly: true, offset: 5, limit: 10 });
    expect(rows[0]?.state).toBe("waiting");
    expect(fake.harness.inspection.sdk.callsTo("threads.list")[0]![0]).toEqual({ archived: true, hasParent: false, limit: 10, offset: 5 });
    await host.sessions.list({ archived: false, rootsOnly: false, offset: 0, limit: 10 });
    expect(fake.harness.inspection.sdk.callsTo("threads.list")[1]![0]).toEqual({ archived: false, limit: 10, offset: 0 });
  });
});

describe("activity mapping", () => {
  it("maps bb statuses to the session vocabulary", () => {
    expect(sessionStateOf({ runtime: { displayStatus: "active" } }, false)).toBe("working");
    expect(sessionStateOf({ runtime: { displayStatus: "provisioning" } }, false)).toBe("working");
    expect(sessionStateOf({ status: "error" }, false)).toBe("failed");
    expect(sessionStateOf({ status: "idle" }, true)).toBe("waiting");
    expect(sessionStateOf({ status: "pending" }, false)).toBe("idle");
  });

  it("turns item events into bounded, newest-last activity", () => {
    const events = [
      { type: "item/completed", createdAt: 3, data: { item: { type: "commandExecution", command: "npm test", presentation: { label: { completed: "Ran" } } } } },
      { type: "item/started", createdAt: 2, data: { item: { type: "reasoning", text: "thinking hard ".repeat(30) } } },
      { type: "turn/started", createdAt: 1 },
      { type: "item/started", createdAt: 0, data: { item: { type: "unknownKind" } } },
    ];
    const items = activityItemsOf(events, 5);
    expect(items).toEqual([
      { kind: "reasoning", done: false, atMs: 2, label: "Thinking", text: expect.stringMatching(/^thinking hard/) },
      { kind: "commandExecution", done: true, atMs: 3, label: "Ran", text: "npm test" },
    ]);
    expect(items[0]!.text.length).toBeLessThanOrEqual(200);
    expect(activityItemsOf(events, 1)).toHaveLength(1);
  });
});
