import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { revisionOf } from "../../src/domain/revision.ts";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import { fileKey, seedSession } from "../support/fake-host.ts";
import { loadPlugin, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

/** Serve-time includes through the real routes. spec R1.19–R1.26, A90–A92 */
const SOURCE = `<!doctype html><html><head><title>Parts</title></head><body><h1>Parts</h1><main><link rel="thread-page-include" href="_o/*.html"></main></body></html>`;

let fixture: PluginFixture;
const put = (path: string, text: string) => fixture.state.files.set(fileKey("thr_a", path), Buffer.from(text, "utf8"));

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", SOURCE);
  put("_o/02.html", "<section>two</section>");
  put("_o/01.html", '<section>one <img src="dot.png"></section>');
  put("_o/dot.png", "PNG");
});

afterEach(() => fixture.dispose());

describe("a document assembled from parts", () => {
  it("serves the parts in name order, carries a part's own file from the part's directory, and revises when a part is added (A90, A93)", async () => {
    const first = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    const html = await first.text();
    expect(html).toMatch(/<main><section>one <img src="data:image\/png;base64,[^"]+"><\/section>\n<section>two<\/section><\/main>/);
    expect(html).not.toContain("thread-page-include");
    const etag = first.headers.get("etag")!;
    expect((await fixture.get(`${ROUTE_BASE}/document?session=thr_a`, { "if-none-match": etag })).status).toBe(304);

    put("_o/03.html", "<section>three</section>");
    const second = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`, { "if-none-match": etag });
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).not.toBe(etag);
    expect(await second.text()).toContain("<section>three</section>");

    fixture.state.files.delete(fileKey("thr_a", "_o/03.html"));
    expect((await fixture.get(`${ROUTE_BASE}/document?session=thr_a`)).headers.get("etag")).toBe(etag);
  });

  it("leaves an include it cannot honour as written, logs it, and tells the agent in status (A91, R1.25)", async () => {
    seedSession(fixture.state, "thr_a", SOURCE.replace("_o/*.html", "../thr_b/_o/x.html"));
    const response = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('href="../thr_b/_o/x.html"');
    expect(fixture.state.logs.some((line) => line.includes("unsafe-path"))).toBe(true);
    const status = await fixture.cli(["status"], "thr_a");
    expect(status.stdout).toMatch(/not carried: .*\(unsafe-path\)/);
  });

  it("never opens a part as a document: by address, by shell, or by token exchange (A92)", async () => {
    expect((await fixture.get(`${ROUTE_BASE}/document?session=thr_a&path=_o/01.html`)).status).toBe(400);
    expect((await fixture.get(`${ROUTE_BASE}/page?session=thr_a&path=_o/01.html`)).status).toBe(400);
    const page = await fixture.serving.pages.load("thr_a");
    const token = mintActionToken({ session: "thr_a", revision: page.revision, now: fixture.clock.now }, fixture.serving.signingKey).token;
    const exchange = await fixture.post(`${ROUTE_BASE}/document-session`, { actionToken: token, path: "_o/01.html" });
    expect(exchange.status).toBe(400);
    expect(revisionOf(page.html)).toBe(page.revision);
  });
});
