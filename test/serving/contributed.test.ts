import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileSchema, parseContributor } from "../../src/domain/capabilities/contributed.ts";
import { LIMITS } from "../../src/domain/limits.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import type { ContributorAnswer, ContributorCall } from "../../src/host/contract.ts";
import { BUILTIN_HOME_ID, BUILTIN_HOME_PAGE } from "../../src/serving/builtin-home.ts";
import { seedSession } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

/**
 * Capabilities another plugin contributes: spec 05 §Contributed capabilities,
 * acceptance criteria A71–A81 and A85. A fake contributor, "syns", stands in
 * for the Syns bb plugin; nothing here knows what its methods mean.
 */

const DECLARATION = {
  version: "0.1.0",
  instruction: "When your folder is a Syns repository, pages can read and write it through syns.* capabilities.",
  guide: "syns.head returns the repository's head version; syns.write commits one file.",
  methods: [
    {
      name: "syns.head",
      description: "Read the repository's head version.",
      effect: "read",
      result: { type: "object", properties: { version: { type: "string" } }, required: ["version"] },
    },
    {
      name: "syns.write",
      description: "Commit one file at the head version the page read.",
      effect: "contributed-write",
      maxRequestBytes: 512 * 1024,
      params: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string", maxLength: 512 }, text: { type: "string" }, base: { type: "string" } },
        required: ["path", "text", "base"],
      },
      result: { type: "object", properties: { version: { type: "string" } }, required: ["version"] },
      reasons: {
        stale_head: { detail: { type: "object", properties: { current: { type: "string" } }, required: ["current"] } },
        no_repo: {},
      },
    },
  ],
};

let fixture: PluginFixture;
let counter = 0;
let answer: (call: ContributorCall) => Promise<ContributorAnswer>;

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", PAGE);
  answer = async (call) => (call.method === "syns.head" ? { ok: true, result: { version: "v1", extra: "dropped" } } : { ok: true, result: { version: "v2" } });
  fixture.state.contributors.push({ id: "syns", declaration: DECLARATION, answer: (call) => answer(call) });
  // The plugin read the (then empty) contributor list at start; let that expire.
  expireContributions();
});

afterEach(() => fixture.dispose());

type Failure = { code: string; message: string; reason?: string; detail?: unknown };
type Transport = { response?: { ok: boolean; result?: unknown; error?: Failure }; confirm?: unknown };

async function call(method: string, params: unknown = null, options: { session?: string; revision?: string; scope?: unknown } = {}) {
  const session = options.session ?? "thr_a";
  const revision = options.revision ?? revisionOf(PAGE);
  const { token } = mintActionToken({ session, revision, now: fixture.clock.now }, fixture.serving.signingKey);
  const request = { v: 1, id: `tp-${++counter}`, method, params, pageRevision: revision, ...("scope" in options ? { scope: options.scope } : {}) };
  const response = await fixture.post(`${ROUTE_BASE}/bridge`, { actionToken: token, request });
  return { status: response.status, body: (await response.json()) as Transport };
}

/** The contributor list is cached for a few seconds; tests move the clock past it. */
function expireContributions(): void {
  fixture.clock.now += LIMITS.contributionsTtlMs + 1;
}

describe("the roster", () => {
  it("lists contributed methods with effect, bounds, description, reasons and contributor (A71)", async () => {
    const result = (await call("context.get")).body.response!.result as { capabilities: Record<string, unknown>[] };
    const write = result.capabilities.find((entry) => entry.method === "syns.write");
    expect(write).toEqual({
      method: "syns.write",
      effect: "contributed-write",
      confirmation: "none",
      maxRequestBytes: 512 * 1024,
      maxResponseBytes: LIMITS.capabilityPayloadBytes,
      contributor: { id: "syns", version: "0.1.0" },
      description: "Commit one file at the head version the page read.",
      reasons: ["stale_head", "no_repo"],
    });
    const builtIn = result.capabilities.find((entry) => entry.method === "sessions.start");
    expect(builtIn).not.toHaveProperty("contributor");
  });

  it("drops a disabled contributor without a restart, and its methods then answer unknown_method (A71, R5.52)", async () => {
    expect((await call("syns.head")).body.response?.ok).toBe(true);
    fixture.state.contributors.length = 0;
    expireContributions();
    const roster = (await call("context.get")).body.response!.result as { capabilities: { method: string }[] };
    expect(roster.capabilities.map((entry) => entry.method)).not.toContain("syns.head");
    const { body } = await call("syns.head", {}, { revision: revisionOf(PAGE) });
    expect(body.response?.error?.code).toBe("unknown_method");
  });
});

describe("declarations", () => {
  it("refuses reserved namespaces and methods outside the contributor's own (A72)", () => {
    expect(parseContributor("sessions", { version: "1", methods: [] }).contributor).toBeNull();
    const foreign = parseContributor("syns", { version: "1", methods: [{ ...DECLARATION.methods[0], name: "other.head" }] });
    expect(foreign.contributor?.methods).toHaveLength(0);
    expect(foreign.problems.join(" ")).toMatch(/syns\.<name>/);
  });

  it("refuses a confirmed effect class and an open parameter object (A73)", () => {
    const confirmed = parseContributor("syns", { version: "1", methods: [{ ...DECLARATION.methods[0], effect: "cross-session-write" }] });
    expect(confirmed.contributor?.methods).toHaveLength(0);
    expect(confirmed.problems.join(" ")).toMatch(/read.*contributed-write/);
    const open = parseContributor("syns", {
      version: "1",
      methods: [{ ...DECLARATION.methods[1], params: { type: "object", properties: { path: { type: "string" } } } }],
    });
    expect(open.problems.join(" ")).toMatch(/additionalProperties/);
  });

  it("refuses keywords outside the subset, bounds above 1 MiB and oversized instructions", () => {
    expect(compileSchema({ type: "string", format: "email" }, "result")).toMatch(/not in the supported subset/);
    const big = parseContributor("syns", { version: "1", methods: [{ ...DECLARATION.methods[0], maxResponseBytes: 2 * 1024 * 1024 }] });
    expect(big.problems.join(" ")).toMatch(/bounds/);
    expect(parseContributor("syns", { version: "1", instruction: "x".repeat(LIMITS.contributorInstructionBytes + 1) }).contributor).toBeNull();
  });

  it("logs a refused declaration once, not on every refresh", async () => {
    fixture.state.contributors.push({ id: "voice", declaration: { version: "1" }, answer });
    await call("context.get");
    expireContributions();
    await call("context.get");
    expect(fixture.state.logs.filter((line) => line.includes("reserved namespace"))).toHaveLength(1);
  });
});

describe("calls", () => {
  it("rejects parameters outside the schema, and oversized ones, before the contributor sees them (A74)", async () => {
    const unknownKey = await call("syns.write", { path: "a.md", text: "x", base: "v1", repo: "someone/else" });
    expect(unknownKey.body.response?.error?.code).toBe("invalid_params");
    const tooBig = await call("syns.write", { path: "a.md", text: "x".repeat(512 * 1024), base: "v1" });
    expect(tooBig.body.response?.error?.code).toBe("request_too_large");
    expect(fixture.state.contributorCalls).toHaveLength(0);
    // Above the built-in 64 KiB, within the method's declared bound: accepted.
    const large = await call("syns.write", { path: "a.md", text: "x".repeat(100 * 1024), base: "v1" });
    expect(large.body.response?.ok).toBe(true);
  });

  it("projects results, refuses a result that fails its schema, and never truncates (A75)", async () => {
    const head = await call("syns.head");
    expect(head.body.response?.result).toEqual({ version: "v1" });
    answer = async () => ({ ok: true, result: { version: 7 } });
    expect((await call("syns.head")).body.response?.error?.code).toBe("invalid_result");
    answer = async () => ({ ok: true, result: { version: "x".repeat(LIMITS.capabilityPayloadBytes) } });
    expect((await call("syns.head")).body.response?.error?.code).toBe("response_too_large");
  });

  it("passes the caller's session from the token, never from parameters, and none for the built-in home (A76)", async () => {
    await call("syns.write", { path: "a.md", text: "x", base: "v1" });
    expect(fixture.state.contributorCalls[0]!.call.caller).toEqual({ sessionId: "thr_a", scope: null });
    await call("syns.head", {}, { session: BUILTIN_HOME_ID, revision: BUILTIN_HOME_PAGE.revision });
    expect(fixture.state.contributorCalls[1]!.call.caller).toEqual({ sessionId: null, scope: null });
  });

  // A document scopes its calls to a folder inside the session's folder. R5.81–R5.86, D41
  it("passes the document's scope beside the session, and refuses one that could leave the session's folder", async () => {
    const { status } = await call("syns.write", { path: "board.json", text: "x", base: "v1" }, { scope: "clients/vela/q3-board" });
    expect(status).toBe(200);
    expect(fixture.state.contributorCalls.at(-1)!.call.caller).toEqual({ sessionId: "thr_a", scope: "clients/vela/q3-board" });
    const before = fixture.state.contributorCalls.length;
    for (const scope of ["/etc", "../x", "a/../../b", "a//b", "./a", "a/./b", "C:/x", "c:x", "~/x", "a\\b", "a\u0000b", "", "a/", 42, null, "x".repeat(LIMITS.scopeChars + 1), Array(LIMITS.scopeSegments + 1).fill("a").join("/")]) {
      const refused = await call("syns.head", {}, { scope });
      expect(refused.body.response?.error?.code, JSON.stringify(scope)).toBe("invalid_params");
    }
    // Nothing refused reached the contributor.
    expect(fixture.state.contributorCalls.length).toBe(before);
    // Built-in capabilities take no folder: they answer as without one.
    expect((await call("context.get", null, { scope: "clients/vela" })).status).toBe(200);
    // The built-in home has no session, so no folder.
    const home = await call("syns.head", {}, { session: BUILTIN_HOME_ID, revision: BUILTIN_HOME_PAGE.revision, scope: "a" });
    expect(home.body.response?.error?.code).toBe("invalid_params");
    expect(fixture.state.contributorCalls.length).toBe(before);
  });

  it("writes with no dialog, and logs the write for the operator (A77, R5.55)", async () => {
    const { status, body } = await call("syns.write", { path: "a.md", text: "x", base: "v1" });
    expect(status).toBe(200);
    expect(body.confirm).toBeUndefined();
    expect(body.response).toMatchObject({ ok: true, result: { version: "v2" } });
    expect(fixture.state.logs.some((line) => line.includes("contributed write syns.write for thr_a: ok"))).toBe(true);
  });

  it("counts against the page's rate budget (A78)", async () => {
    let limited = 0;
    for (let index = 0; index < LIMITS.ratePerMinute + 5; index += 1) {
      const { body } = await call("syns.head");
      if (body.response?.error?.code === "rate_limited") limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("answers unavailable when the contributor cannot be reached (A78, R5.52)", async () => {
    answer = async () => {
      throw new Error("connection refused");
    };
    expect((await call("syns.head")).body.response?.error?.code).toBe("unavailable");
  });

  it("carries a declared reason and its projected detail; drops what is undeclared (A79)", async () => {
    answer = async () => ({ ok: false, error: { code: "conflict", message: "The repository moved", reason: "stale_head", detail: { current: "v9", secret: "x" } } });
    expect((await call("syns.write", { path: "a.md", text: "x", base: "v1" })).body.response?.error).toEqual({
      code: "conflict",
      message: "The repository moved",
      reason: "stale_head",
      detail: { current: "v9" },
    });
    answer = async () => ({ ok: false, error: { code: "unavailable", message: "No repository here", reason: "no_repo" } });
    expect((await call("syns.write", { path: "a.md", text: "x", base: "v1" })).body.response?.error).toEqual({ code: "unavailable", message: "No repository here", reason: "no_repo" });
    answer = async () => ({ ok: false, error: { code: "conflict", message: "moved", reason: "made_up" } });
    expect((await call("syns.write", { path: "a.md", text: "x", base: "v1" })).body.response?.error).toEqual({ code: "conflict", message: "moved" });
    answer = async () => ({ ok: false, error: { code: "no_repo", message: "bad code" } });
    expect((await call("syns.write", { path: "a.md", text: "x", base: "v1" })).body.response?.error?.code).toBe("handler_error");
    answer = async () => ({ ok: false, error: { code: "cancelled", message: "pretend the reader declined" } });
    expect((await call("syns.write", { path: "a.md", text: "x", base: "v1" })).body.response?.error?.code).toBe("handler_error");
  });

  it("refuses a call from a stale page like a built-in one (A81)", async () => {
    const { body } = await call("syns.head", null, { revision: "e".repeat(64) });
    expect(body.response?.error?.code).toBe("stale_page");
    expect(fixture.state.contributorCalls).toHaveLength(0);
  });

  it("never lets a contributor shadow a built-in capability", async () => {
    fixture.state.contributors.push({ id: "sessions", declaration: { version: "1", methods: [{ ...DECLARATION.methods[0], name: "sessions.start" }] }, answer });
    expireContributions();
    const roster = (await call("context.get")).body.response!.result as { capabilities: { method: string; contributor?: unknown }[] };
    expect(roster.capabilities.filter((entry) => entry.method === "sessions.start")).toEqual([expect.not.objectContaining({ contributor: expect.anything() })]);
  });
});

describe("instructions and the guide", () => {
  it("appends each contributor's fragment to the standing instruction, and nothing when instructions are off (A85)", async () => {
    await fixture.serving.contributions.current();
    const status = await fixture.cli(["status"]);
    expect(status.stdout).toContain("## From syns");
    expect(status.stdout).toContain(DECLARATION.instruction);
    expect(status.stdout).toContain("contributed capabilities: syns 0.1.0: syns.head (read), syns.write (contributed-write)");
    await fixture.serving.settings.set({ agentInstructions: false });
    expect((await fixture.cli(["status"])).stdout).not.toContain("## From syns");
  });

  // The host cuts the joined instruction; status says what each fragment keeps, and the operator is warned once. R6.31, D42
  it("shows the instruction's real budget and warns once when a fragment would be cut (A146, A147)", async () => {
    const capped = await loadPlugin({}, { instructionChars: 4096 });
    capped.state.contributors.push({ id: "syns", declaration: DECLARATION, answer: async () => ({ ok: true, result: {} }) });
    capped.clock.now += LIMITS.contributionsTtlMs + 1;
    await capped.serving.contributions.current();
    const standing = capped.serving.settings.current().agentInstructionText.length;
    let out = (await capped.cli(["status"])).stdout;
    const total = standing + "\n\n## From syns\n\n".length + DECLARATION.instruction.length;
    expect(out).toContain(`length: ${total.toLocaleString("en-US")} of 4,096 characters, the host's cap; the standing instruction takes ${standing.toLocaleString("en-US")}, leaving ${(4096 - standing).toLocaleString("en-US")} for every contributor's fragment together, headings and separators included`);
    expect(out).toContain(`fragment syns 0.1.0: ${DECLARATION.instruction.length} characters, arrives whole`);
    expect(capped.state.logs.some((line) => line.includes("instructions:"))).toBe(false);

    // A second contributor whose fragment cannot fit whole.
    const long = `${"Keep this. ".repeat(140)}The warning at the end.`;
    capped.state.contributors.push({ id: "wiki", declaration: { version: "2.0.0", instruction: long, methods: [] }, answer: async () => ({ ok: true, result: {} }) });
    capped.clock.now += LIMITS.contributionsTtlMs + 1;
    await capped.serving.contributions.current();
    out = (await capped.cli(["status"])).stdout;
    expect(out).toContain("— CUT;");
    expect(out).toMatch(/WARNING fragment wiki 2\.0\.0: 1,563 characters, cut after [\d,]+; sessions read up to "…/);
    // The operator's log says it once, however many sessions start.
    await capped.cli(["status"]);
    const warnings = capped.state.logs.filter((line) => line.includes("instructions: the instruction fragment of wiki 2.0.0 is cut after"));
    expect(warnings).toHaveLength(1);
  });

  it("lists the registered methods and the contributor's guide text in the guide (A84)", async () => {
    const guide = (await fixture.cli(["guide"])).stdout;
    expect(guide).toContain("## Capabilities from other plugins");
    expect(guide).toContain("### syns 0.1.0");
    expect(guide).toContain("`syns.write` — contributed-write");
    expect(guide).toContain("Reasons: stale_head, no_repo.");
    expect(guide).toContain(DECLARATION.guide);
    expect(guide).toMatch(/7\.5 calls a\s+minute/);
  });
});
