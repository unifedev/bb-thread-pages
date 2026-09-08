import { makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_INSTRUCTION } from "../../src/agent/instruction.ts";
import { fileKey, seedSession, sessionRecord } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

let fixture: PluginFixture;

beforeEach(async () => {
  fixture = await loadPlugin();
  fixture.state.sessions.set("thr_a", sessionRecord({ id: "thr_a", title: "My task" }));
});

afterEach(() => fixture.dispose());

describe("bb thread-page init", () => {
  it("creates the page from the seed once and reports the existing page afterwards", async () => {
    const first = await fixture.cli(["init"], "thr_a");
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain("page: /storage/thr_a/index.html");
    expect(first.stdout).toContain(`link: [Open the Thread Page](${ROUTE_BASE}/page?session=thr_a)`);
    expect(first.stdout).toContain("state: NEW");
    const written = Buffer.from(fixture.state.files.get(fileKey("thr_a", "index.html"))!).toString("utf8");
    expect(written).toContain("<title>My task</title>");
    expect(written).toContain("<form");
    const second = await fixture.cli(["init"], "thr_a");
    expect(second.stdout).toContain("state: EXISTING");
    expect(Buffer.from(fixture.state.files.get(fileKey("thr_a", "index.html"))!).toString("utf8")).toBe(written);
    expect(fixture.state.calls.filter((call) => call.method === "files.write")).toHaveLength(2);
  });

  it("escapes the title and prints the public origin when there is one", async () => {
    fixture.state.sessions.set("thr_a", sessionRecord({ id: "thr_a", title: `<b>"x"</b>` }));
    fixture.state.publicOrigin = "https://bart.getbb.app";
    const result = await fixture.cli(["init"], "thr_a");
    expect(Buffer.from(fixture.state.files.get(fileKey("thr_a", "index.html"))!).toString("utf8")).toContain("<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>");
    expect(result.stdout).toContain("https://bart.getbb.app/api/v1/plugins/thread-pages/http/page?session=thr_a");
  });

  it("tells an ineligible or missing session to skip and creates nothing", async () => {
    fixture.state.sessions.set("thr_child", sessionRecord({ id: "thr_child", parentId: "thr_a" }));
    const child = await fixture.cli(["init"], "thr_child");
    expect(child.exitCode).toBe(0);
    expect(child.stdout).toMatch(/^state: SKIP — this session is a child of another session/);
    expect(fixture.state.files.has(fileKey("thr_child", "index.html"))).toBe(false);
    const none = await fixture.cli(["init"]);
    expect(none.stdout).toMatch(/SKIP/);
    fixture.state.sessions.set("thr_hidden", sessionRecord({ id: "thr_hidden", visibility: "hidden" }));
    expect((await fixture.cli(["init"], "thr_hidden")).stdout).toMatch(/hidden helper/);
  });

  it("mentions a legacy prototype page without serving it", async () => {
    fixture.state.files.set(fileKey("thr_a", "thread-page.html"), Buffer.from("<html></html>"));
    const result = await fixture.cli(["init"], "thr_a");
    expect(result.stdout).toContain("thread-page.html");
    expect((await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).status).toBe(200);
  });
});

describe("bb thread-page home", () => {
  it("sets a pointer, seeds a missing page, never overwrites an existing one, and warns about a previous home", async () => {
    const result = await fixture.cli(["home"], "thr_a");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("home: thr_a");
    expect(result.stdout).toContain("state: NEW");
    expect(fixture.serving.settings.current().homeSessionId).toBe("thr_a");
    seedSession(fixture.state, "thr_b", PAGE, { title: "Hub" });
    const second = await fixture.cli(["home"], "thr_b");
    expect(second.stdout).toContain("warning: home was “My task” (thr_a)");
    expect(second.stdout).toContain("state: EXISTING");
    expect(Buffer.from(fixture.state.files.get(fileKey("thr_b", "index.html"))!).toString("utf8")).toBe(PAGE);
    const cleared = await fixture.cli(["home", "--clear"]);
    expect(cleared.stdout).toContain("cleared");
    expect(fixture.serving.settings.current().homeSessionId).toBe("");
  });

  it("refuses an ineligible session", async () => {
    fixture.state.sessions.set("thr_fork", sessionRecord({ id: "thr_fork", forkOfId: "thr_a" }));
    const result = await fixture.cli(["home"], "thr_fork");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/fork/);
  });
});

describe("bb thread-page guide and status", () => {
  it("prints the guide and nothing else", async () => {
    const result = await fixture.cli(["guide"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("# Thread Pages — authoring guide")).toBe(true);
    expect(result.stderr).toBe("");
  });

  it("shows settings, the effective instruction, and this session's page", async () => {
    const off = await fixture.cli(["status"], "thr_a");
    expect(off.stdout).toContain("agentInstructions: off");
    expect(off.stdout).toContain("(none — agentInstructions is off)");
    expect(off.stdout).toContain("revision: This session has no page yet");
    await fixture.harness.behavior.setSettings({ agentInstructions: true });
    await fixture.cli(["init"], "thr_a");
    const on = await fixture.cli(["status"], "thr_a");
    expect(on.stdout).toContain("# The page is the conversation");
    expect(on.stdout).toContain("page: /storage/thr_a/index.html");
    expect(on.stdout).toMatch(/revision: [a-f0-9]{64}/);
  });

  it("rejects unknown arguments with usage", async () => {
    expect((await fixture.cli(["nope"])).exitCode).toBe(2);
    expect((await fixture.cli(["init", "--force"])).exitCode).toBe(2);
  });
});

describe("the standing instruction", () => {
  it("is injected only into root, non-fork sessions and only when enabled", async () => {
    const root = makePluginAgentConfigurationContext({ thread: { id: "thr_a", parentThreadId: null, sourceThreadId: null } });
    expect((await fixture.harness.behavior.resolveAgentConfiguration(root)).instructions).toBeNull();
    await fixture.harness.behavior.setSettings({ agentInstructions: true });
    expect((await fixture.harness.behavior.resolveAgentConfiguration(root)).instructions).toBe(DEFAULT_AGENT_INSTRUCTION);
    const child = makePluginAgentConfigurationContext({ thread: { id: "thr_c", parentThreadId: "thr_a", sourceThreadId: null } });
    expect((await fixture.harness.behavior.resolveAgentConfiguration(child)).instructions).toBeNull();
    const fork = makePluginAgentConfigurationContext({ origin: { kind: "fork", pluginId: "side-chat" } });
    expect((await fixture.harness.behavior.resolveAgentConfiguration(fork)).instructions).toBeNull();
    await fixture.harness.behavior.setSettings({ agentInstructionText: "Custom text" });
    expect((await fixture.harness.behavior.resolveAgentConfiguration(root)).instructions).toBe("Custom text");
  });

  it("stays under the host's 4096-character cap and teaches one-agent-one-page", () => {
    expect(DEFAULT_AGENT_INSTRUCTION.length).toBeLessThan(4096);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/yours alone/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/start a\s+session with instructions to build it/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/forms\s+start fresh sessions/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/SKIP/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/bb thread-page guide/);
  });
});

describe("settings", () => {
  it("apply live and never rewrite an existing page", async () => {
    await fixture.cli(["init"], "thr_a");
    const before = Buffer.from(fixture.state.files.get(fileKey("thr_a", "index.html"))!).toString("utf8");
    await fixture.harness.behavior.setSettings({ pageSeedHtml: "<!doctype html><html><head><title>{{TITLE}}</title></head><body><form></form></body></html>" });
    expect(Buffer.from(fixture.state.files.get(fileKey("thr_a", "index.html"))!).toString("utf8")).toBe(before);
    fixture.state.sessions.set("thr_new", sessionRecord({ id: "thr_new", title: "N" }));
    await fixture.cli(["init"], "thr_new");
    expect(Buffer.from(fixture.state.files.get(fileKey("thr_new", "index.html"))!).toString("utf8")).toContain("<title>N</title>");
  });
});
