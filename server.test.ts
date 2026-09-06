import type { PluginAgentConfigurationContext } from "@get-bb/plugin-sdk";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { beforeEach, describe, expect, it } from "vitest";

import {
  AUTHORING_GUIDE,
  DEFAULT_PAGE_SEED,
  renderPageSeed,
} from "./authoring.js";
import { MAX_PAGE_BYTES, sha256Text } from "./page.js";
import plugin, { ENABLED_BRIDGE_METHODS } from "./server.js";
import { strictParityCapabilityRegistry } from "./bridge.js";

/**
 * The descriptors a page should be told about: every enabled capability, in
 * registry order. Deriving this keeps the context assertion honest without
 * making each newly enabled method a hand-edited diff.
 */
const ENABLED_CAPABILITIES = strictParityCapabilityRegistry
  .list()
  .filter((capability) => ENABLED_BRIDGE_METHODS.has(capability.method))
  .map((capability) => ({
    method: capability.method,
    effect: capability.effect,
    confirmation: capability.confirmation,
  }));

function agentContext(
  overrides: Partial<PluginAgentConfigurationContext["thread"]> = {},
): PluginAgentConfigurationContext {
  return {
    thread: {
      id: "thr_test",
      title: "Test page",
      parentThreadId: null,
      sourceThreadId: null,
      ...overrides,
    },
    project: {
      id: "proj_test",
      kind: "standard",
      name: "Test",
      gitRemoteUrl: null,
    },
    environment: {
      id: "env_test",
      name: null,
      path: "/work",
      workspaceProvisionType: "unmanaged",
      branchName: null,
    },
    host: { id: "host_test", name: "Test host" },
    provider: {
      id: "codex",
      model: "test",
      capabilities: { supportsNativeUserQuestion: false },
    },
    origin: { kind: null, pluginId: null },
  };
}

function createFixture() {
  const state = {
    content: "",
    exists: false,
    offline: false,
    sendDelivery: "queued" as "queued" | "sent" | "deferred",
    sendGate: null as Promise<void> | null,
    sendCalls: [] as unknown[],
    activityEvents: [] as unknown[],
    uploads: [] as Array<{ path: string; bytes: Buffer }>,
    assetFiles: null as { name: string; path: string }[] | null,
    // bb returns an origin-relative preview base; a CSP source list cannot use
    // one, so the server has to absolutize it.
    previewBaseUrl: "/api/v1/file-previews/abc123/",
    thread: makeThreadResponse({
      id: "thr_test",
      title: "Test page",
      titleFallback: "Test page",
    }),
    threadList: [] as unknown[],
    connectStatus: null as unknown,
    connectThrows: false,
    projects: [
      { id: "proj_test", name: "Test", kind: "standard" as const },
    ] as unknown[],
  };

  const host = createFakePluginHost({
    pluginId: "thread-pages",
    sdk: {
      plugins: {
        callRpc: async () => {
          if (state.connectThrows) throw new Error("connect is not running");
          return state.connectStatus as never;
        },
      },
      projects: {
        list: async () => state.projects as never,
      },
      threads: {
        get: async () => state.thread,
        list: async () => state.threadList as never,
        storageLocation: async () => ({
          hostId: "host_test",
          storageRootPath: "/thread-storage/thr_test",
        }),
        send: async (args) => {
          state.sendCalls.push(args);
          if (state.sendGate) await state.sendGate;
          return { ok: true, delivery: state.sendDelivery };
        },
        spawn: async () =>
          ({ id: "thr_spawned", projectId: "proj_test" }) as never,
        archive: async () => ({ ok: true }) as never,
        stop: async () => ({ ok: true }) as never,
        events: {
          list: async () => state.activityEvents as never,
        },
      },
      files: {
        list: async (args) => {
          if (state.assetFiles === null) {
            throw Object.assign(new Error("ENOENT: no such directory"), {
              code: "ENOENT",
            });
          }
          return {
            files: state.assetFiles,
            storageRootPath: args.path,
            truncated: false,
          };
        },
        createPreview: async () => ({
          baseUrl: state.previewBaseUrl,
          expiresAtMs: Date.now() + 600_000,
        }),
        write: async (args) => {
          if (args.contentEncoding === "base64") {
            state.uploads.push({
              path: args.path,
              bytes: Buffer.from(args.content, "base64"),
            });
            return {
              outcome: "written" as const,
              sha256: sha256Text(args.content),
              sizeBytes: Buffer.byteLength(args.content, "base64"),
            };
          }
          if (state.exists) {
            return {
              outcome: "conflict" as const,
              currentSha256: sha256Text(state.content),
            };
          }
          state.exists = true;
          state.content = args.content;
          return {
            outcome: "written" as const,
            sha256: sha256Text(args.content),
            sizeBytes: Buffer.byteLength(args.content),
          };
        },
        read: async (args) => {
          if (state.offline) throw new Error("host offline");
          if (!state.exists) {
            throw Object.assign(new Error("ENOENT: no such file"), {
              code: "ENOENT",
            });
          }
          return {
            path: args.path,
            content: state.content,
            contentEncoding: "utf8" as const,
            sha256: sha256Text(state.content),
            sizeBytes: Buffer.byteLength(state.content),
            modifiedAtMs: 1_800_000_000_000,
          };
        },
      },
    },
  });

  return { host, state };
}

function tokensFromOuterPage(html: string): {
  renderToken: string;
  actionToken: string;
} {
  const render = html.match(/\/document\?render=([A-Za-z0-9._-]+)/);
  const action = html.match(/"actionToken":"([A-Za-z0-9._-]+)"/);
  if (!render?.[1]) throw new Error("render token missing from outer page");
  if (!action?.[1]) throw new Error("action token missing from outer page");
  return { renderToken: render[1], actionToken: action[1] };
}

describe("Thread Pages plugin", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(async () => {
    fixture = createFixture();
    await plugin(fixture.host.bb);
  });

  it("initializes only the current eligible root thread with host-routed I/O", async () => {
    const { harness } = fixture.host;
    const skipped = await harness.behavior.runCli(["init"]);
    expect(skipped.exitCode).toBe(0);
    expect(skipped.stdout).toContain("state: SKIP");

    const initialized = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(initialized.exitCode).toBe(0);
    expect(initialized.stdout).toContain(
      "page: /thread-storage/thr_test/thread-page.html",
    );
    expect(initialized.stdout).toContain(
      "link: [Open the Thread Page](/api/v1/plugins/thread-pages/http/page?threadId=thr_test)",
    );
    expect(initialized.stdout).toContain("state: NEW");
    expect(initialized.stdout).toContain("bb thread-page guide");
    expect(fixture.state.content).toBe(
      renderPageSeed(DEFAULT_PAGE_SEED, "Test page"),
    );

    const guide = await harness.behavior.runCli(["guide"]);
    expect(guide.exitCode).toBe(0);
    expect(guide.stdout).toContain(AUTHORING_GUIDE);

    const write = harness.inspection.sdk.callsTo("files.write")[0]?.[0] as {
      hostId: string;
      path: string;
      rootPath: string;
      expectedSha256: null;
    };
    expect(write).toMatchObject({
      hostId: "host_test",
      path: "/thread-storage/thr_test/thread-page.html",
      rootPath: "/thread-storage/thr_test",
      expectedSha256: null,
    });

    const second = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(second.stdout).toContain("state: EXISTING");

    fixture.state.thread = makeThreadResponse({
      id: "thr_test",
      parentThreadId: "thr_parent",
    });
    const child = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(child.exitCode).toBe(0);
    expect(child.stdout).toContain("state: SKIP");
  });

  it("keeps the optional agent hint off by default and root-only when enabled", async () => {
    const { harness } = fixture.host;
    const configure = harness.inspection.registrations.agentConfigurationProvider;
    expect(configure).not.toBeNull();
    expect(configure!(agentContext()).instructions).toBeUndefined();

    await harness.behavior.setSettings({ agentInstructions: true });
    expect(configure!(agentContext()).instructions).toContain(
      "bb thread-page init",
    );
    await harness.behavior.setSettings({
      agentInstructionText: "Custom Thread Page contract.",
    });
    expect(configure!(agentContext()).instructions).toBe(
      "Custom Thread Page contract.",
    );
    expect(
      configure!(agentContext({ parentThreadId: "thr_parent" })).instructions,
    ).toBeUndefined();
    expect(harness.inspection.registrations.agentTools).toHaveLength(0);
  });

  it("serves a sandboxed document and delivers a revision-bound queued reply once", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });

    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(outer.status).toBe(200);
    expect(outer.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );
    const outerHtml = await outer.text();
    expect(outerHtml).toContain('sandbox="allow-scripts allow-forms"');
    expect(outerHtml).not.toContain("allow-same-origin");
    expect(outerHtml).not.toContain("allow-popups");
    expect(outerHtml).not.toContain("allow-top-navigation");
    expect(outerHtml).not.toContain("allow-downloads");
    const { renderToken, actionToken } = tokensFromOuterPage(outerHtml);
    const pageHash = sha256Text(fixture.state.content);

    const document = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(document.status).toBe(200);
    expect(document.headers.get("content-security-policy")).toContain(
      "sandbox allow-scripts allow-forms",
    );
    expect(document.headers.get("content-security-policy")).toContain(
      "form-action 'none'",
    );
    expect(document.headers.get("content-security-policy")).toContain(
      "script-src 'unsafe-inline'",
    );
    expect(document.headers.get("content-security-policy")).toContain(
      "style-src 'unsafe-inline'",
    );
    expect(document.headers.get("content-security-policy")).not.toContain(
      "allow-same-origin",
    );
    expect(document.headers.get("etag")).toBe(`"${pageHash}"`);
    expect(await document.text()).toContain(
      "For charts, multi-screen flows, files,",
    );

    const unchanged = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
      { headers: { "if-none-match": `"${pageHash}"` } },
    );
    expect(unchanged.status).toBe(304);

    fixture.state.content += "\n<p>Changed</p>\n";
    const changedProbe = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
      { headers: { "if-none-match": `"${pageHash}"` } },
    );
    expect(changedProbe.status).toBe(200);
    expect(changedProbe.headers.get("etag")).toBe(
      `"${sha256Text(fixture.state.content)}"`,
    );
    expect(await changedProbe.text()).toBe("");
    const staleNavigation = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(staleNavigation.status).toBe(409);

    fixture.state.content = renderPageSeed(DEFAULT_PAGE_SEED, "Test page");

    const submission = {
      actionToken,
      submissionId: "submission-1",
      pageHash,
      title: "Approval",
      answers: [
        { name: "action", label: "Action", value: "Approve" },
        { name: "notify", label: "Notify", value: false },
        { name: "devices", label: "Devices", value: ["Phone", "Desktop"] },
      ],
    };
    const submit = () =>
      harness.behavior.fetchHttp("POST", "/submit", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission),
      });

    const first = await submit();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, delivery: "queued" });
    const repeat = await submit();
    expect(repeat.status).toBe(200);
    expect(fixture.state.sendCalls).toHaveLength(1);
    expect(fixture.state.sendCalls[0]).toMatchObject({
      threadId: "thr_test",
      mode: "queue-if-active",
      input: [{ type: "text", mentions: [] }],
    });

    const collision = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...submission,
        answers: [{ name: "action", label: "Action", value: "Reject" }],
      }),
    });
    expect(collision.status).toBe(409);
    expect(fixture.state.sendCalls).toHaveLength(1);
  });

  it("separates read-only render authority from action authority", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { renderToken, actionToken } = tokensFromOuterPage(await outer.text());
    const pageHash = sha256Text(fixture.state.content);

    expect(
      (
        await harness.behavior.fetchHttp(
          "GET",
          `/document?render=${actionToken}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await harness.behavior.fetchHttp(
          "POST",
          "/submit",
          {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              actionToken: renderToken,
              submissionId: "wrong-scope",
              pageHash,
              title: "Wrong scope",
              answers: [],
            }),
          },
        )
      ).status,
    ).toBe(401);
    const wrongBridgeScope = await harness.behavior.fetchHttp(
      "POST",
      "/bridge",
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken: renderToken,
          request: {
            v: 1,
            id: "wrong-scope",
            method: "context.get",
            params: null,
            pageRevision: pageHash,
          },
        }),
      },
    );
    expect(wrongBridgeScope.status).toBe(401);
    expect(await wrongBridgeScope.json()).toMatchObject({
      v: 1,
      id: "wrong-scope",
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  it("projects safe context and delivers arbitrary JSON replies with queue, steer, dedupe, and revision binding", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);
    const callBridge = (request: Record<string, unknown>) =>
      harness.behavior.fetchHttp("POST", "/bridge", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionToken, request }),
      });

    const contextResponse = await callBridge({
      v: 1,
      id: "context-1",
      method: "context.get",
      params: null,
      pageRevision,
    });
    expect(contextResponse.status).toBe(200);
    const contextBody = await contextResponse.json();
    expect(contextBody).toEqual({
      v: 1,
      id: "context-1",
      ok: true,
      result: {
        protocolVersion: 1,
        thread: {
          id: "thr_test",
          title: "Test page",
          projectId: fixture.state.thread.projectId,
        },
        page: { revision: pageRevision, readOnly: false },
        // Derived, not hardcoded: this asserts the page is told exactly what
        // is enabled, without turning every new capability into a diff here.
        capabilities: ENABLED_CAPABILITIES,
      },
    });
    expect(JSON.stringify(contextBody)).not.toContain("host_test");
    expect(JSON.stringify(contextBody)).not.toContain("/thread-storage");

    fixture.state.thread = makeThreadResponse({
      id: "thr_test",
      title: "Test page",
      titleFallback: "Test page",
      status: "active",
      updatedAt: 1_800_000_000_000,
      runtime: { displayStatus: "active", hostReconnectGraceExpiresAt: null },
    });
    fixture.state.activityEvents = [
      {
        type: "item/completed",
        createdAt: 1_800_000_000_020,
        data: {
          item: {
            type: "command",
            command: "npm test",
            presentation: {
              label: { pending: "Running tests", completed: "Ran tests" },
            },
          },
        },
      },
      {
        type: "item/started",
        createdAt: 1_800_000_000_010,
        data: {
          item: {
            type: "reasoning",
            text: "Checking the implementation",
          },
        },
      },
    ];
    const activity = await callBridge({
      v: 1,
      id: "activity-1",
      method: "thread.activity",
      params: { limit: 8 },
      pageRevision,
    });
    expect(activity.status).toBe(200);
    expect(await activity.json()).toEqual({
      v: 1,
      id: "activity-1",
      ok: true,
      result: {
        state: "working",
        updatedAtMs: 1_800_000_000_000,
        items: [
          {
            kind: "reasoning",
            done: false,
            atMs: 1_800_000_000_010,
            label: "Thinking",
            text: "Checking the implementation",
          },
          {
            kind: "command",
            done: true,
            atMs: 1_800_000_000_020,
            label: "Ran tests",
            text: "npm test",
          },
        ],
      },
    });

    const params = {
      result: {
        selection: ["node-a", "node-b"],
        weights: { primary: 0.75, fallback: null },
        accepted: true,
      },
      mode: "queue",
      title: "Diagram decision",
      idempotencyKey: "diagram-42",
    };
    const first = await callBridge({
      v: 1,
      id: "reply-1",
      method: "thread.reply",
      params,
      pageRevision,
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      v: 1,
      id: "reply-1",
      ok: true,
      result: { delivery: "queued", duplicate: false },
    });
    const repeated = await callBridge({
      v: 1,
      id: "reply-2",
      method: "thread.reply",
      params: {
        ...params,
        result: {
          accepted: true,
          weights: { fallback: null, primary: 0.75 },
          selection: ["node-a", "node-b"],
        },
      },
      pageRevision,
    });
    expect(await repeated.json()).toEqual({
      v: 1,
      id: "reply-2",
      ok: true,
      result: { delivery: "queued", duplicate: true },
    });
    expect(fixture.state.sendCalls).toHaveLength(1);
    expect(fixture.state.sendCalls[0]).toMatchObject({
      threadId: "thr_test",
      mode: "queue-if-active",
    });
    const queuedText = (
      fixture.state.sendCalls[0] as {
        input: Array<{ text: string }>;
      }
    ).input[0]!.text;
    expect(queuedText).toContain("Diagram decision");
    expect(queuedText).toContain('"selection": [');
    expect(queuedText).toContain('"accepted": true');

    const collision = await callBridge({
      v: 1,
      id: "reply-3",
      method: "thread.reply",
      params: { ...params, result: { accepted: false } },
      pageRevision,
    });
    expect(collision.status).toBe(409);
    expect(await collision.json()).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });

    fixture.state.thread = makeThreadResponse({
      id: "thr_test",
      title: "Test page",
      titleFallback: "Test page",
      status: "active",
    });
    fixture.state.sendDelivery = "sent";
    const steered = await callBridge({
      v: 1,
      id: "reply-steer",
      method: "thread.reply",
      params: {
        result: { correction: "use node-c" },
        mode: "steer",
        idempotencyKey: "steer-1",
      },
      pageRevision,
    });
    expect(await steered.json()).toMatchObject({
      ok: true,
      result: { delivery: "steered", duplicate: false },
    });
    expect(fixture.state.sendCalls[1]).toMatchObject({
      mode: "steer-if-active",
    });

    fixture.state.content += "\n<p>New revision</p>";
    const stale = await callBridge({
      v: 1,
      id: "reply-stale",
      method: "thread.reply",
      params: { result: "old", mode: "queue" },
      pageRevision,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      ok: false,
      error: { code: "stale_page" },
    });

    // A method with a contract but no handler must be refused, not attempted.
    const notEnabled = await callBridge({
      v: 1,
      id: "not-enabled",
      method: "voice.captureAndTranscribe",
      params: { language: "en-US" },
      pageRevision,
    });
    expect(notEnabled.status).toBe(404);
    expect(await notEnabled.json()).toMatchObject({
      ok: false,
      error: { code: "unknown_method" },
    });
  });

  it("serves complete inline mini-apps while denying document network escapes", async () => {
    const { harness } = fixture.host;
    fixture.state.exists = true;
    fixture.state.content = `<!doctype html>
<html lang="en">
<head>
  <title>Custom workspace</title>
  <style>main { min-height: 100dvh }</style>
  <script>window.booted = "head"</script>
</head>
<body onload="window.ready = true">
  <main><svg onclick="this.dataset.active = 'yes'"></svg><canvas></canvas><task-board></task-board></main>
  <script>customElements.define("task-board", class extends HTMLElement {}); location.hash = "board"</script>
</body>
</html>`;

    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(outer.status).toBe(200);
    const { renderToken, actionToken } = tokensFromOuterPage(await outer.text());
    const document = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(document.status).toBe(200);

    const policy = document.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("script-src-attr 'unsafe-inline'");
    expect(policy).toContain("style-src 'unsafe-inline'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).toContain("sandbox allow-scripts allow-forms");
    expect(policy).not.toContain("allow-same-origin");
    expect(document.headers.get("permissions-policy")).toContain("camera=()");
    expect(document.headers.get("permissions-policy")).toContain(
      "microphone=()",
    );

    const html = await document.text();
    expect(html).toContain("<title>Custom workspace</title>");
    expect(html).toContain("<style>main { min-height: 100dvh }</style>");
    expect(html).toContain('<body onload="window.ready = true">');
    expect(html).toContain("customElements.define");
    expect(html.indexOf("data-thread-page-kernel")).toBeLessThan(
      html.indexOf('<script>window.booted = "head"</script>'),
    );
    expect(html).not.toContain(renderToken);
    expect(html).not.toContain(actionToken);
  });

  it("serves multi-megabyte pages without putting them in the durable KV cache", async () => {
    const { harness } = fixture.host;
    fixture.state.exists = true;
    fixture.state.content = `<!doctype html><html><head><title>Large workbench</title></head><body>${"x".repeat(1_300_000)}</body></html>`;

    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(outer.status).toBe(200);
    const { renderToken } = tokensFromOuterPage(await outer.text());
    const document = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(document.status).toBe(200);
    expect((await document.text()).length).toBeGreaterThan(1_300_000);
    expect(harness.inspection.logEntries).toContainEqual({
      level: "debug",
      message: "Thread Page thr_test is too large for the durable offline cache",
    });

    fixture.state.content = "x".repeat(MAX_PAGE_BYTES + 1);
    const oversized = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(oversized.status).toBe(413);
  });

  it("falls back to the durable read-only cache while the source host is offline", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { renderToken, actionToken } = tokensFromOuterPage(await outer.text());
    const pageHash = sha256Text(fixture.state.content);

    fixture.state.offline = true;
    const cached = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(cached.status).toBe(200);
    expect(cached.headers.get("x-thread-page-stale")).toBe("true");
    const cachedHtml = await cached.text();
    expect(cachedHtml).toContain('"stale":true');
    expect(cachedHtml).toContain("Offline copy — responses are disabled");

    const submit = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        submissionId: "offline-1",
        pageHash,
        title: "Offline",
        answers: [],
      }),
    });
    expect(submit.status).toBe(503);
    expect(fixture.state.sendCalls).toHaveLength(0);
  });

  it("shares a bounded viewer rate budget across forms and bridge calls", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);

    for (let index = 0; index < 29; index += 1) {
      const response = await harness.behavior.fetchHttp("POST", "/bridge", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken,
          request: {
            v: 1,
            id: `context-${index}`,
            method: "context.get",
            params: null,
            pageRevision,
          },
        }),
      });
      expect(response.status).toBe(200);
    }

    const thirtieth = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        submissionId: "rate-form",
        pageHash: pageRevision,
        title: "Rate budget",
        answers: [],
      }),
    });
    expect(thirtieth.status).toBe(200);

    const limitedBridge = await harness.behavior.fetchHttp("POST", "/bridge", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        request: {
          v: 1,
          id: "context-limited",
          method: "context.get",
          params: null,
          pageRevision,
        },
      }),
    });
    expect(limitedBridge.status).toBe(429);
    expect(await limitedBridge.json()).toMatchObject({
      v: 1,
      id: "context-limited",
      ok: false,
      error: { code: "rate_limited" },
    });

    const limitedForm = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        submissionId: "rate-form-limited",
        pageHash: pageRevision,
        title: "Rate budget",
        answers: [],
      }),
    });
    expect(limitedForm.status).toBe(429);
  });

  it("caps one viewer at four concurrent action requests", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);
    let releaseSend!: () => void;
    fixture.state.sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    const pending = Array.from({ length: 5 }, (_, index) =>
      harness.behavior.fetchHttp("POST", "/bridge", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken,
          request: {
            v: 1,
            id: `reply-concurrent-${index}`,
            method: "thread.reply",
            params: {
              result: { index },
              idempotencyKey: `concurrent-${index}`,
            },
            pageRevision,
          },
        }),
      }),
    );
    for (let attempt = 0; attempt < 20 && fixture.state.sendCalls.length < 4; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(fixture.state.sendCalls).toHaveLength(4);
    releaseSend();
    const responses = await Promise.all(pending);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      200,
      200,
      200,
      429,
    ]);
  });

  it("hands back a remotely openable link when this bb is reachable", async () => {
    const { harness } = fixture.host;

    // Local-only: no Connect, so the relative route is all we can honestly give.
    fixture.state.connectStatus = null;
    const local = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(local.stdout).toContain(
      "link: [Open the Thread Page](/api/v1/plugins/thread-pages/http/page?threadId=thr_test)",
    );

    // Connected: prefer the public origin, because a relative or loopback link
    // is useless on the phone the user is most likely holding.
    fixture.state.connectStatus = {
      state: "connected",
      url: "https://bart.getbb.app",
    };
    const remote = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(remote.stdout).toContain(
      "link: [Open the Thread Page](https://bart.getbb.app/api/v1/plugins/thread-pages/http/page?threadId=thr_test)",
    );

    // A known-good origin is cached briefly, so a momentary reconnect does not
    // downgrade the link the user is already holding.
    fixture.state.connectStatus = {
      state: "reconnecting",
      url: "https://bart.getbb.app",
    };
    const reconnecting = await harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(reconnecting.stdout).toContain(
      "link: [Open the Thread Page](https://bart.getbb.app/api/",
    );

    // Connect throwing (absent or disabled) must never break init. A fresh
    // plugin instance proves the local-only path without the warm cache.
    const fresh = createFixture();
    fresh.state.connectThrows = true;
    await plugin(fresh.host.bb);
    const broken = await fresh.host.harness.behavior.runCli(["init"], {
      threadId: "thr_test",
    });
    expect(broken.exitCode).toBe(0);
    expect(broken.stdout).toContain(
      "link: [Open the Thread Page](/api/v1/plugins/thread-pages/http/page?threadId=thr_test)",
    );
  });

  it("drives spawn, archive, and stop, and refuses to stop its own thread", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);

    const call = async (
      id: string,
      method: string,
      params: unknown,
      confirmation?: string,
    ) =>
      harness.behavior.fetchHttp("POST", "/bridge", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken,
          request: { v: 1, id, method, params, pageRevision },
          ...(confirmation === undefined ? {} : { confirmation }),
        }),
      });
    const approve = async (id: string, method: string, params: unknown) => {
      const offered = await call(id, method, params);
      expect(offered.status).toBe(401);
      const body = (await offered.json()) as {
        confirm: { challenge: string; summary: string };
      };
      return { ...body.confirm, run: () => call(id, method, params, body.confirm.challenge) };
    };

    // A page cannot stop the thread that is about to read its answer.
    const selfStop = await call("self", "threads.stop", {
      threadId: "thr_test",
    });
    expect(selfStop.status).toBe(401);
    const selfChallenge = (await selfStop.json()) as {
      confirm: { challenge: string };
    };
    const selfStopped = await call(
      "self",
      "threads.stop",
      { threadId: "thr_test" },
      selfChallenge.confirm.challenge,
    );
    expect(selfStopped.status).toBe(400);
    expect((await selfStopped.json()).error.code).toBe("invalid_params");
    expect(harness.inspection.sdk.callsTo("threads.stop")).toHaveLength(0);

    fixture.state.thread = makeThreadResponse({
      id: "thr_other",
      title: "Other",
      titleFallback: "Other",
    });

    const spawn = await approve("spawn-1", "threads.spawn", {
      projectId: "proj_test",
      prompt: "Start the implementation.",
    });
    expect(spawn.summary).toBe(
      "Start a thread in proj_test: Start the implementation.",
    );
    expect((await spawn.run()).status).toBe(200);
    const spawned = harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0] as {
      visibility: string;
      projectId: string;
    };
    // A thread the user asked a page to start is theirs, not a hidden helper.
    expect(spawned.visibility).toBe("visible");
    expect(spawned.projectId).toBe("proj_test");

    const archive = await approve("arch-1", "threads.archive", {
      threadId: "thr_other",
    });
    expect(archive.summary).toBe("Archive thread thr_other");
    expect((await archive.run()).status).toBe(200);
    expect(harness.inspection.sdk.callsTo("threads.archive")).toHaveLength(1);

    const stop = await approve("stop-1", "threads.stop", {
      threadId: "thr_other",
    });
    expect((await stop.run()).status).toBe(200);
    expect(harness.inspection.sdk.callsTo("threads.stop")).toHaveLength(1);
  });

  it("reports the working state on the poll the shell already makes", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });

    const idlePage = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const idleHtml = await idlePage.text();
    expect(idleHtml).toContain('class="work" role="status" data-visible="false"');
    const { renderToken } = tokensFromOuterPage(idleHtml);
    const idleDoc = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${renderToken}`,
    );
    expect(idleDoc.headers.get("x-thread-page-activity")).toBe("idle");

    // Mid-turn: the strip shows without any extra request, because the state
    // rides on the revision poll the shell was making anyway.
    fixture.state.thread = makeThreadResponse({
      id: "thr_test",
      title: "Test page",
      titleFallback: "Test page",
      status: "active",
      runtime: { displayStatus: "active", hostReconnectGraceExpiresAt: null },
    });
    const busyPage = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const busyHtml = await busyPage.text();
    expect(busyHtml).toContain('class="work" role="status" data-visible="true"');
    expect(busyHtml).toContain("Working — this is the last saved version");
    const busyDoc = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${tokensFromOuterPage(busyHtml).renderToken}`,
    );
    expect(busyDoc.headers.get("x-thread-page-activity")).toBe("working");

    // Blank wording is how a user turns the indicator off.
    await harness.behavior.setSettings({ workingLabel: "" });
    const hidden = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(await hidden.text()).toContain(
      'class="work" role="status" data-visible="false"',
    );
  });

  it("designates a home page, links every other page to it, and never to itself", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });

    // With no home set, there is no Sessions link and /home says so.
    const before = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(await before.text()).not.toContain('class="home"');
    const noHome = await harness.behavior.fetchHttp("GET", "/home");
    expect(noHome.status).toBe(404);

    // Any thread's page can be made home; it is not a special page.
    // Designating a thread that already has a page must not overwrite it.
    const set = await harness.behavior.runCli(["home"], {
      threadId: "thr_home",
    });
    expect(set.exitCode).toBe(0);
    expect(set.stdout).toContain("home: thr_home");
    expect(set.stdout).toContain("state: EXISTING");

    // On a thread with no page, a real hub is written. A weak default would
    // push every user into rebuilding it, so this asserts the substance.
    const fresh = createFixture();
    await plugin(fresh.host.bb);
    const seeded = await fresh.host.harness.behavior.runCli(["home"], {
      threadId: "thr_home",
    });
    expect(seeded.stdout).toContain("state: NEW");
    expect(fresh.state.content).toContain("threads.snapshot");
    expect(fresh.state.content).toContain("data-groups");
    // Groups carry their own world, which is what gives a project its own look.
    expect(fresh.state.content).toContain("box.dataset.world");
    // And grouping is stored, so it is not hard-wired to projects.
    expect(fresh.state.content).toContain("home.groups");
    // It must still be a valid page: one main, and no tags inside comments.
    expect(fresh.state.content.split("<main>").length).toBe(2);
    for (const match of fresh.state.content.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(match[1]).not.toMatch(/<\/?[a-zA-Z]/);
    }

    const redirect = await harness.behavior.fetchHttp("GET", "/home");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(
      "/api/v1/plugins/thread-pages/http/page?threadId=thr_home",
    );

    // Other pages get the link as chrome, without authoring one.
    const other = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(await other.text()).toContain(
      '<a class="home" href="/api/v1/plugins/thread-pages/http/home"',
    );

    // Home does not link to itself.
    fixture.state.thread = makeThreadResponse({
      id: "thr_home",
      title: "Sessions",
      titleFallback: "Sessions",
    });
    const home = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_home",
    );
    expect(await home.text()).not.toContain('class="home"');

    const cleared = await harness.behavior.runCli(["home", "--clear"], {
      threadId: "thr_home",
    });
    expect(cleared.exitCode).toBe(0);
    expect((await harness.behavior.fetchHttp("GET", "/home")).status).toBe(404);
  });

  it("keeps every HTML tag out of the seed's comment", () => {
    // An agent editing the page by pattern-matching on a tag name will hit the
    // copy inside the guidance comment first. Replacing it there leaves the
    // comment unterminated, and the rest of the document is swallowed and
    // renders blank. This happened. Names, not tags, in the comment.
    const seed = renderPageSeed(DEFAULT_PAGE_SEED, "Test page");
    for (const match of seed.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(match[1]).not.toMatch(/<\/?[a-zA-Z]/);
    }
    // And the seed itself must have balanced comments.
    expect(seed.split("<!--").length).toBe(seed.split("-->").length);
  });

  it("will not act on a confirmed method until trusted chrome returns the server's own challenge", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);

    const call = async (body: Record<string, unknown>) =>
      harness.behavior.fetchHttp("POST", "/bridge", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const request = {
      v: 1,
      id: "continue-1",
      method: "threads.continue",
      params: { threadId: "thr_other", prompt: "Please continue." },
      pageRevision,
    };

    // First call performs nothing; it returns a challenge to show the user.
    const challenged = await call({ actionToken, request });
    expect(challenged.status).toBe(401);
    const offer = (await challenged.json()) as {
      confirm: { requestId: string; summary: string; challenge: string };
    };
    expect(offer.confirm.requestId).toBe("continue-1");
    // The summary is the server's, derived from validated params.
    expect(offer.confirm.summary).toBe(
      "Continue thread thr_other: Please continue.",
    );
    expect(fixture.state.sendCalls).toHaveLength(0);

    // A page cannot forge one, nor replay another request's.
    for (const forged of ["", "not.atoken", `${offer.confirm.challenge}x`]) {
      const bad = await call({ actionToken, request, confirmation: forged });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error.code).toBe("confirmation_invalid");
    }
    expect(fixture.state.sendCalls).toHaveLength(0);

    // A challenge is bound to its exact parameters, so it cannot be reused to
    // approve a different prompt or a different target thread.
    const swapped = await call({
      actionToken,
      request: {
        ...request,
        params: { threadId: "thr_elsewhere", prompt: "Please continue." },
      },
      confirmation: offer.confirm.challenge,
    });
    expect(swapped.status).toBe(400);
    expect((await swapped.json()).error.code).toBe("confirmation_invalid");
    expect(fixture.state.sendCalls).toHaveLength(0);

    // With the real challenge it goes through, to the other thread.
    fixture.state.thread = makeThreadResponse({
      id: "thr_other",
      title: "Other",
      titleFallback: "Other",
      status: "idle",
    });
    const approved = await call({
      actionToken,
      request,
      confirmation: offer.confirm.challenge,
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toEqual({
      v: 1,
      id: "continue-1",
      ok: true,
      result: {
        threadId: "thr_other",
        delivery: "queued",
        duplicate: false,
      },
    });
    expect(fixture.state.sendCalls).toHaveLength(1);
    expect(
      (fixture.state.sendCalls[0] as { threadId: string }).threadId,
    ).toBe("thr_other");
  });

  it("projects other threads without leaking prompts, paths, or provider ids", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageRevision = sha256Text(fixture.state.content);

    fixture.state.threadList = [
      makeThreadResponse({
        id: "thr_other",
        title: "Other work",
        titleFallback: "Other work",
        projectId: "proj_test",
        status: "active",
        updatedAt: 1_800_000_000_000,
        runtime: {
          displayStatus: "active",
          hostReconnectGraceExpiresAt: null,
        },
      }),
    ];

    const snapshot = await harness.behavior.fetchHttp("POST", "/bridge", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        request: {
          v: 1,
          id: "snap-1",
          method: "threads.snapshot",
          params: {},
          pageRevision,
        },
      }),
    });
    expect(snapshot.status).toBe(200);
    const body = (await snapshot.json()) as {
      result: { threads: Array<Record<string, unknown>> };
    };
    expect(body.result.threads).toHaveLength(1);
    expect(body.result.threads[0]).toMatchObject({
      id: "thr_other",
      title: "Other work",
      status: "active",
      archived: false,
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-provider");
    expect(serialized).not.toContain("/thread-storage");
    expect(serialized).not.toContain("host_test");
  });

  it("stores page attachments under a generated confined name and tells the thread where they are", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });
    const outer = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const { actionToken } = tokensFromOuterPage(await outer.text());
    const pageHash = sha256Text(fixture.state.content);

    const rejected = await harness.behavior.fetchHttp("POST", "/upload", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken: "not-a-token",
        name: "x.csv",
        content: Buffer.from("data").toString("base64"),
      }),
    });
    expect(rejected.status).toBe(401);
    expect(fixture.state.uploads).toHaveLength(0);

    const notBase64 = await harness.behavior.fetchHttp("POST", "/upload", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        name: "x.csv",
        content: "not base64!!",
      }),
    });
    expect(notBase64.status).toBe(400);
    expect(fixture.state.uploads).toHaveLength(0);

    const uploaded = await harness.behavior.fetchHttp("POST", "/upload", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        // A traversal attempt and an unsafe name are both neutralized.
        name: "../../etc/pa ss;wd.csv",
        content: Buffer.from("a,b\n1,2\n").toString("base64"),
      }),
    });
    expect(uploaded.status).toBe(200);
    const uploadBody = (await uploaded.json()) as {
      ok: boolean;
      name: string;
      path: string;
      sizeBytes: number;
    };
    expect(uploadBody.ok).toBe(true);
    expect(uploadBody.name).toMatch(/^\d{8}-\d{6}-[a-f0-9]{6}-pa_ss_wd\.csv$/);
    expect(uploadBody.path).toBe(`thread-page-uploads/${uploadBody.name}`);
    expect(uploadBody.sizeBytes).toBe(8);
    expect(fixture.state.uploads).toHaveLength(1);
    expect(fixture.state.uploads[0]!.path).toBe(
      `/thread-storage/thr_test/thread-page-uploads/${uploadBody.name}`,
    );
    expect(fixture.state.uploads[0]!.bytes.toString("utf8")).toBe("a,b\n1,2\n");

    const submit = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        submissionId: "upload-1",
        pageHash,
        title: "Attachment",
        answers: [{ name: "note", label: "Note", value: "see file" }],
        files: [
          {
            field: "data",
            name: uploadBody.name,
            path: uploadBody.path,
            sizeBytes: uploadBody.sizeBytes,
          },
        ],
      }),
    });
    expect(submit.status).toBe(200);
    const delivered = fixture.state.sendCalls[0] as {
      input: [{ text: string }];
    };
    expect(delivered.input[0].text).toContain(
      `\`$BB_THREAD_STORAGE/${uploadBody.path}\``,
    );

    // A forged path outside the confined upload directory is never accepted.
    const forged = await harness.behavior.fetchHttp("POST", "/submit", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionToken,
        submissionId: "upload-2",
        pageHash,
        title: "Attachment",
        answers: [],
        files: [
          {
            field: "data",
            name: "id_rsa",
            path: "../../.ssh/id_rsa",
            sizeBytes: 1,
          },
        ],
      }),
    });
    expect(forged.status).toBe(400);
    expect(fixture.state.sendCalls).toHaveLength(1);
  });

  it("supplies a confined asset base only when the page has an asset directory", async () => {
    const { harness } = fixture.host;
    await harness.behavior.runCli(["init"], { threadId: "thr_test" });

    const withoutAssets = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const plain = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${tokensFromOuterPage(await withoutAssets.text()).renderToken}`,
    );
    expect(plain.status).toBe(200);
    expect(await plain.text()).toContain('"assetBase":null');
    expect(plain.headers.get("content-security-policy")).toContain(
      "img-src data: blob:",
    );
    expect(plain.headers.get("content-security-policy")).toContain(
      "base-uri 'none'",
    );
    expect(plain.headers.get("content-security-policy")).not.toContain(
      "preview.invalid",
    );

    fixture.state.assetFiles = [
      {
        name: "chart.css",
        path: "/thread-storage/thr_test/thread-page-assets/chart.css",
      },
    ];
    const withAssets = await harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    const enriched = await harness.behavior.fetchHttp(
      "GET",
      `/document?render=${tokensFromOuterPage(await withAssets.text()).renderToken}`,
    );
    expect(enriched.status).toBe(200);
    const enrichedHtml = await enriched.text();
    // The document keeps the relative base so it resolves on whichever origin
    // the viewer used (loopback, Connect, or Tailscale).
    expect(enrichedHtml).toContain('"assetBase":"/api/v1/file-previews/abc123/"');
    expect(enrichedHtml).toContain('<base href="/api/v1/file-previews/abc123/">');

    // The CSP must be absolute, because a bare path is not a valid source
    // expression and browsers drop it, silently blocking every asset.
    const csp = enriched.headers.get("content-security-policy") ?? "";
    const absolute = "http://localhost/api/v1/file-previews/abc123/";
    expect(csp).toContain(`img-src data: blob: ${absolute}`);
    expect(csp).toContain(`style-src 'unsafe-inline' ${absolute}`);
    // The injected <base> is allowed, but only for the confined preview.
    expect(csp).toContain(`base-uri ${absolute}`);
    expect(csp).not.toContain("base-uri /api");
    // The confined preview never relaxes the sandbox or opens general networking.
    expect(csp).toContain("sandbox allow-scripts allow-forms");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
  });

  it("removes an obsolete durable cache when a page outgrows KV", async () => {
    const { harness } = fixture.host;
    fixture.state.exists = true;
    fixture.state.content = "<main>small cached page</main>";
    expect(
      (
        await harness.behavior.fetchHttp(
          "GET",
          "/page?threadId=thr_test",
        )
      ).status,
    ).toBe(200);

    fixture.state.content = `<main>${"x".repeat(300_000)}</main>`;
    expect(
      (
        await harness.behavior.fetchHttp(
          "GET",
          "/page?threadId=thr_test",
        )
      ).status,
    ).toBe(200);

    const reloaded = await harness.lifecycle.reload(plugin);
    fixture.state.offline = true;
    const unavailable = await reloaded.harness.behavior.fetchHttp(
      "GET",
      "/page?threadId=thr_test",
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("small cached page");
  });
});
