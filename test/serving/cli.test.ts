import { makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_INSTRUCTION } from "../../src/agent/instruction.ts";
import { isPastDefault, PAST_DEFAULTS, sha256Hex } from "../../src/config/past-defaults.ts";
import { readSettings } from "../../src/config/settings.ts";
import { fileKey, seedSession, sessionRecord } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

let fixture: PluginFixture;

beforeEach(async () => {
  fixture = await loadPlugin();
  fixture.state.sessions.set("thr_a", sessionRecord({ id: "thr_a", title: "My task" }));
});

afterEach(() => fixture.dispose());

const writes = () => fixture.state.calls.filter((call) => call.method === "files.write");
const fileText = (session: string) => Buffer.from(fixture.state.files.get(fileKey(session, "index.html"))!).toString("utf8");

describe("bb thread-page init", () => {
  it("creates nothing by default, tells the agent to write the page, and reports it once it exists", async () => {
    const first = await fixture.cli(["init"], "thr_a");
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain("page: /storage/thr_a/index.html");
    expect(first.stdout).toContain(`link: [Open the Thread Page](${ROUTE_BASE}/page?session=thr_a)`);
    expect(first.stdout).toContain("state: NEW — no page yet. Write the whole document");
    expect(first.stdout).toContain("reply in chat with only the link");
    expect(first.stdout).toContain(`home: ${ROUTE_BASE}/home  — the built-in home page, since no page is designated.`);
    expect(fixture.state.files.has(fileKey("thr_a", "index.html"))).toBe(false);
    expect((await fixture.cli(["init"], "thr_a")).stdout).toContain("state: NEW");
    expect(writes()).toHaveLength(0);
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.from(PAGE));
    expect((await fixture.cli(["init"], "thr_a")).stdout).toContain("state: EXISTING");
    expect(fileText("thr_a")).toBe(PAGE);
  });

  it("starts a page from an operator's own seed, escaped and once, and prints the public origin", async () => {
    await fixture.harness.behavior.setSettings({ pageSeedHtml: "<!doctype html><title>{{TITLE}}</title>" });
    fixture.state.sessions.set("thr_a", sessionRecord({ id: "thr_a", title: `<b>"x"</b>` }));
    fixture.state.publicOrigin = "https://bart.getbb.app";
    const result = await fixture.cli(["init"], "thr_a");
    expect(result.stdout).toContain("state: NEW — created from the operator's starting file");
    expect(fileText("thr_a")).toBe("<!doctype html><title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>");
    expect(result.stdout).toContain("https://bart.getbb.app/api/v1/plugins/thread-pages/http/page?session=thr_a");
    expect((await fixture.cli(["init"], "thr_a")).stdout).toContain("state: EXISTING");
    expect(writes()).toHaveLength(1);
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
  it("sets a pointer, creates nothing, never overwrites an existing page, and warns about a previous home", async () => {
    const result = await fixture.cli(["home"], "thr_a");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("home: thr_a");
    expect(result.stdout).toContain("state: NO PAGE YET");
    expect(fixture.state.files.has(fileKey("thr_a", "index.html"))).toBe(false);
    expect(fixture.serving.settings.current().homeSessionId).toBe("thr_a");
    expect((await fixture.cli(["init"], "thr_a")).stdout).toContain("home: this page is the home page");
    seedSession(fixture.state, "thr_b", PAGE, { title: "Hub" });
    const second = await fixture.cli(["home"], "thr_b");
    expect(second.stdout).toContain("warning: home was “My task” (thr_a)");
    expect(second.stdout).toContain("state: EXISTING");
    expect(fileText("thr_b")).toBe(PAGE);
    const cleared = await fixture.cli(["home", "--clear"]);
    expect(cleared.stdout).toContain("cleared");
    expect(fixture.serving.settings.current().homeSessionId).toBe("");
  });

  it("creates nothing even when an operator seed is configured", async () => {
    await fixture.harness.behavior.setSettings({ pageSeedHtml: "<title>{{TITLE}}</title>" });
    await fixture.cli(["home"], "thr_a");
    expect(fixture.state.files.has(fileKey("thr_a", "index.html"))).toBe(false);
    expect(writes()).toHaveLength(0);
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
    expect(off.stdout).toContain("pageSeedHtml: (empty — init creates no file");
    expect(off.stdout).toContain("(none — agentInstructions is off)");
    expect(off.stdout).toContain("revision: This session has no page yet");
    await fixture.harness.behavior.setSettings({ agentInstructions: true });
    fixture.state.files.set(fileKey("thr_a", "index.html"), Buffer.from(PAGE));
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

  it("stays under the host's 4096-character cap, teaches one-agent-one-page, and prescribes no design", () => {
    expect(DEFAULT_AGENT_INSTRUCTION.length).toBeLessThan(4096);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/yours alone/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/start a\s+session with instructions to build it/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/forms\s+start fresh sessions/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/SKIP/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/bb thread-page guide/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/only the link/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/when the session starts/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/## Built for this task/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/## Answering where they read/);
    expect(DEFAULT_AGENT_INSTRUCTION).toMatch(/empty\s+text field for anything else/);
    expect(DEFAULT_AGENT_INSTRUCTION).not.toMatch(/already styled|<fieldset>|radios|checkboxes|## The home page/);
  });
});

describe("settings", () => {
  it("apply live and never rewrite an existing page", async () => {
    seedSession(fixture.state, "thr_b", PAGE);
    await fixture.harness.behavior.setSettings({ pageSeedHtml: "<!doctype html><html><head><title>{{TITLE}}</title></head><body></body></html>" });
    expect(fileText("thr_b")).toBe(PAGE);
    fixture.state.sessions.set("thr_new", sessionRecord({ id: "thr_new", title: "N" }));
    await fixture.cli(["init"], "thr_new");
    expect(fileText("thr_new")).toContain("<title>N</title>");
  });

  // An install upgraded from 1.2.0 stores the old seed and instruction as its
  // own values; without this, neither new default would ever reach it.
  it("read a stored value that is exactly a past default as today's default, and keep an edited one", () => {
    const known = { agentInstructionText: new Set([sha256Hex("old instruction")]), pageSeedHtml: new Set([sha256Hex("old seed")]) };
    expect(isPastDefault("pageSeedHtml", "old seed", known)).toBe(true);
    expect(isPastDefault("pageSeedHtml", "old seed ", known)).toBe(false);
    expect(isPastDefault("agentInstructionText", "old instruction", known)).toBe(true);
    expect(PAST_DEFAULTS.pageSeedHtml.has("b1da21f912d912ee3400d40fabc7a1a677679ae55d076b20b5cf0ee299c89593")).toBe(true);
    expect(PAST_DEFAULTS.agentInstructionText.has("88d9816fb6d27169b151db457df450f076de421cbf68f9b7b140a8483c0f7aef")).toBe(true);
    const kept = readSettings({ agentInstructions: true, agentInstructionText: "Mine", pageSeedHtml: "<p>mine</p>", workingLabel: " W ", homeSessionId: "" });
    expect(kept).toEqual({ agentInstructions: true, agentInstructionText: "Mine", pageSeedHtml: "<p>mine</p>", workingLabel: "W", homeSessionId: "" });
  });
});
