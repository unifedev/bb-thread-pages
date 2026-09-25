import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createBbHost } from "../../src/bb/bb-host.ts";
import { activityItemsOf, questionOf, sessionStateOf } from "../../src/bb/activity.ts";

function hostWith(sdk: NonNullable<NonNullable<Parameters<typeof createFakePluginHost>[0]>["sdk"]>) {
  const fake = createFakePluginHost({ pluginId: "thread-pages", sdk });
  return { host: createBbHost(fake.bb), fake };
}

describe("bb adapter", () => {
  it("projects a thread into a session record and asks about pending interactions only when idle", async () => {
    const { host, fake } = hostWith({
      threads: {
        get: async () => makeThreadResponse({ id: "thr_a", title: null, titleFallback: "Fallback", projectId: "proj_a", environmentId: "env_1", visibility: "visible", parentThreadId: null, sourceThreadId: null, archivedAt: null, deletedAt: null, updatedAt: 42, lastReadAt: 40, latestAttentionAt: 41 }),
        interactions: { list: async () => [{ id: "i1", payload: { kind: "user_question", questions: [{ prompt: "Which branch?" }] } }] as never },
      },
    });
    const session = await host.sessions.get("thr_a");
    expect(session).toEqual({
      id: "thr_a",
      title: "Fallback",
      projectId: "proj_a",
      state: "waiting",
      visibility: "visible",
      parentId: null,
      forkOfId: null,
      archived: false,
      deleted: false,
      updatedAtMs: 42,
      attentionAtMs: 41,
      startedAtMs: 0,
      turnEndedAtMs: 41,
      question: "Which branch?",
      unread: true,
      pinned: false,
      environmentId: "env_1",
    });
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

  // Spec 1.5: bb's transcriber and project attachments. R8.35, R8.36, D38, D40
  it("asks bb whether voice is configured, and transcribes through system.transcribeVoice with the context", async () => {
    let configured = true;
    const { host, fake } = hostWith({
      system: {
        config: async () => ({ voiceTranscriptionEnabled: configured }) as never,
        transcribeVoice: async () => ({ text: "spoken words" }),
      },
    });
    expect(await host.voice!.status()).toEqual({ available: true });
    configured = false;
    expect(await host.voice!.status()).toEqual({ available: false, reason: "Voice transcription is not set up on this bb." });
    expect(await host.voice!.transcribe({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg;codecs=opus", prompt: "the text so far", language: "fr" })).toEqual({ text: "spoken words" });
    const [args] = fake.harness.inspection.sdk.callsTo("system.transcribeVoice")[0] as [{ file: File; prompt: string }];
    expect(args.file.type).toBe("audio/ogg;codecs=opus");
    expect(args.file.name).toBe("voice-input.ogg");
    expect(args.file.size).toBe(3);
    expect(args.prompt).toBe("Language: fr.\nthe text so far");
  });

  it("turns bb's transcription failures into request_too_large or unavailable", async () => {
    const failing = (message: string, status = 400) => hostWith({ system: { transcribeVoice: async () => Promise.reject(Object.assign(new Error(message), { status })) } }).host;
    await expect(failing("Audio file exceeds the 5MB limit for plugin-served transcription").voice!.transcribe({ bytes: new Uint8Array([1]), mimeType: "audio/webm" })).rejects.toMatchObject({ code: "request_too_large" });
    await expect(failing("No loaded plugin registers AI service \"codex\" for voice transcription", 501).voice!.transcribe({ bytes: new Uint8Array([1]), mimeType: "audio/webm" })).rejects.toMatchObject({ code: "unavailable", message: "Voice transcription is not set up on this bb." });
    await expect(failing("Voice transcription timed out", 504).voice!.transcribe({ bytes: new Uint8Array([1]), mimeType: "audio/webm" })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("uploads project attachments and carries them beside the prompt as bb's composer does", async () => {
    const { host, fake } = hostWith({
      projects: {
        attachments: {
          upload: async (args: { filename?: string; mimeType?: string }) => ({ type: args.mimeType?.startsWith("image/") ? "localImage" : "localFile", path: `att/${args.filename}`, name: args.filename ?? "", mimeType: args.mimeType, sizeBytes: 4 }) as never,
        },
      } as never,
      threads: { spawn: async () => ({ id: "thr_new" }) as never, send: async () => ({ delivery: "started" }) as never, get: async () => null as never },
    });
    const image = await host.attachments!.upload("proj_a", { name: "shot.png", mimeType: "image/png", bytes: new Uint8Array(4) });
    const log = await host.attachments!.upload("proj_a", { name: "build.log", mimeType: "text/plain", bytes: new Uint8Array(4) });
    expect(image).toEqual({ kind: "image", path: "att/shot.png", name: "shot.png", mimeType: "image/png", sizeBytes: 4 });
    expect(host.attachments!.remove).toBeUndefined();
    await host.sessions.start({ projectId: "proj_a", prompt: "look", environment: { kind: "project-default" }, attachments: [image, log] });
    const spawned = fake.harness.inspection.sdk.callsTo("threads.spawn")[0]![0] as Record<string, unknown>;
    expect(spawned.prompt).toBeUndefined();
    expect(spawned.input).toEqual([
      { type: "text", text: "look", mentions: [] },
      { type: "localImage", path: "att/shot.png" },
      { type: "localFile", path: "att/build.log", name: "build.log", mimeType: "text/plain", sizeBytes: 4 },
    ]);
    await host.sessions.send("thr_b", "and this", "queue", [log]);
    expect((fake.harness.inspection.sdk.callsTo("threads.send")[0]![0] as { input: unknown[] }).input).toHaveLength(2);
  });

  it("tells what bb would not attach before anything is uploaded, and passes bb's own refusal on", async () => {
    const { host } = hostWith({ projects: { attachments: { upload: async () => Promise.reject(Object.assign(new Error("Unsupported attachment type: application/x-foo"), { status: 400 })) } } as never });
    const refusal = host.attachments!.refusal!;
    expect(refusal({ name: "IMG_1.HEIC", size: 10, type: "image/heic" })).toMatchObject({ code: "invalid_params" });
    expect(refusal({ name: "photo.heif", size: 10, type: "" })).toMatchObject({ code: "invalid_params" });
    expect(refusal({ name: "big.png", size: 10 * 1024 * 1024 + 1, type: "image/png" })).toMatchObject({ code: "request_too_large" });
    expect(refusal({ name: "big.log", size: 20 * 1024 * 1024, type: "text/plain" })).toBeNull();
    await expect(host.attachments!.upload("proj_a", { name: "x.foo", mimeType: "application/x-foo", bytes: new Uint8Array(1) })).rejects.toMatchObject({
      code: "handler_error",
      message: "bb refused it: Unsupported attachment type: application/x-foo",
    });
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

  it("pins and unpins through bb and reports the resulting mark", async () => {
    const { host, fake } = hostWith({
      threads: {
        pin: async () => makeThreadResponse({ id: "thr_a", pinnedAt: 42 }),
        unpin: async () => makeThreadResponse({ id: "thr_a", pinnedAt: null }),
      },
    });
    expect(await host.sessions.pin("thr_a", true)).toEqual({ pinned: true });
    expect(await host.sessions.pin("thr_a", false)).toEqual({ pinned: false });
    expect(fake.harness.inspection.sdk.callsTo("threads.pin")).toHaveLength(1);
    expect(fake.harness.inspection.sdk.callsTo("threads.unpin")).toHaveLength(1);
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

  it("finds contributors among enabled, running plugins over plugin RPC, and skips the rest", async () => {
    const calls: { pluginId: string; method: string; input?: unknown }[] = [];
    const { host } = hostWith({
      plugins: {
        list: async () =>
          ({
            plugins: [
              { id: "syns", enabled: true, status: "running" },
              { id: "other", enabled: true, status: "running" },
              { id: "off", enabled: false, status: "disabled" },
              { id: "thread-pages", enabled: true, status: "running" },
            ],
          }) as never,
        callRpc: (async (args: { pluginId: string; method: string; input?: unknown; outputSchema: { parse(value: unknown): unknown } }) => {
          calls.push({ pluginId: args.pluginId, method: args.method, input: args.input });
          if (args.pluginId !== "syns") throw new Error("unknown_method");
          if (args.method === "threadPagesContributions") return args.outputSchema.parse({ version: "1", methods: [] });
          return args.outputSchema.parse({ ok: false, error: { code: "conflict", reason: "stale_head", detail: { current: "v2" } } });
        }) as never,
      },
    });
    const listed = await host.contributors!.list();
    expect(listed).toEqual([{ id: "syns", declaration: { version: "1", methods: [] } }]);
    expect(calls.map((entry) => entry.pluginId).sort()).toEqual(["other", "syns"]);
    const answer = await host.contributors!.invoke("syns", { method: "syns.write", params: { path: "a" }, caller: { sessionId: "thr_a" }, requestId: "tp-1" });
    expect(answer).toEqual({ ok: false, error: { code: "conflict", reason: "stale_head", detail: { current: "v2" } } });
    expect(calls.at(-1)).toEqual({ pluginId: "syns", method: "threadPagesInvoke", input: { method: "syns.write", params: { path: "a" }, caller: { sessionId: "thr_a" }, requestId: "tp-1" } });
  });

  it("words a waiting session's question from its interactions, bounded", () => {
    expect(questionOf([{ payload: { kind: "user_question", questions: [{ prompt: "A?" }, { prompt: "B?" }] } }], 1024)).toBe("A?\nB?");
    expect(questionOf([{ payload: { kind: "approval", reason: null } }], 1024)).toBe("Approval requested");
    expect(questionOf([{ payload: { kind: "request_answer", title: "Pick a model" } }], 1024)).toBe("Pick a model");
    expect(questionOf([{ payload: { kind: "user_question", questions: [{ prompt: "x".repeat(50) }] } }], 10)).toBe(`${"x".repeat(9)}…`);
    expect(questionOf([], 1024)).toBeNull();
  });
});
