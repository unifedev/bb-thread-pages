import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capabilityRegistry } from "../../src/domain/capabilities/index.ts";
import { BUILTIN_HOME_HTML } from "../../src/generated/builtin-home.ts";
import { BUILTIN_HOME_PAGE, SESSIONLESS_CAPABILITIES } from "../../src/serving/builtin-home.ts";
import { STATIC_PAGES, staticModule } from "../../scripts/build-runtime.mjs";
import { loadPlugin, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

// The one designed page the product ships. spec R7.9, DECISIONS D14
describe("the built-in home page, as shipped", () => {
  it("is generated up to date from src/home", async () => {
    for (const page of STATIC_PAGES) expect(await staticModule(page)).toContain(JSON.stringify(BUILTIN_HOME_HTML));
  });

  it("carries nothing specific to one reader and no remote fonts", () => {
    for (const personal of ["syns", "thr_", "proj_", "PRIO", "Destinations", "data-console", "fonts.googleapis", "priority"]) {
      expect(BUILTIN_HOME_HTML.toLowerCase(), personal).not.toContain(personal.toLowerCase());
    }
  });

  it("answers no session and uses only capabilities it may use", () => {
    expect(BUILTIN_HOME_HTML).not.toMatch(/<form[\s>]/);
    const used = [...BUILTIN_HOME_HTML.matchAll(/invoke\("([a-zA-Z.]+)"/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(5);
    for (const method of used) {
      expect(capabilityRegistry.get(method)?.implemented, method).toBe(true);
      expect(SESSIONLESS_CAPABILITIES.has(method), method).toBe(false);
    }
    expect(BUILTIN_HOME_HTML).not.toMatch(/window\.(open|prompt|alert|confirm)/);
  });
});

describe("the built-in home page, served", () => {
  let fixture: PluginFixture;

  beforeEach(async () => {
    fixture = await loadPlugin();
  });

  afterEach(() => fixture.dispose());

  it("serves its document in the page sandbox with the kernel, and answers the poll", async () => {
    const response = await fixture.get(`${ROUTE_BASE}/home-document`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toMatch(/sandbox allow-scripts allow-forms/);
    expect(response.headers.get("etag")).toBe(`"${BUILTIN_HOME_PAGE.revision}"`);
    const html = await response.text();
    expect(html).toContain("data-thread-page-kernel");
    expect(html).toContain("<title>Sessions</title>");
    expect((await fixture.get(`${ROUTE_BASE}/home-document`, { "if-none-match": `"${BUILTIN_HOME_PAGE.revision}"` })).status).toBe(304);
  });

  it("frames it in a shell with no session actions and no link to itself", async () => {
    const shell = await fixture.get(`${ROUTE_BASE}/home`);
    expect(shell.status).toBe(200);
    const html = await shell.text();
    expect(html).toContain('sandbox="allow-scripts allow-forms"');
    expect(html).toContain("&quot;navigable&quot;:false");
    // The shell's runtime names the selector too, so look for the element itself.
    expect(html).not.toContain('class="acts" data-shell-acts');
    expect(html).not.toContain("← Sessions");
  });
});
