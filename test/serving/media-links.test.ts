import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { PAGE_SANDBOX_FLAGS, REFUSED_SANDBOX_FLAGS } from "../../src/domain/sandbox.ts";
import { fileKey, seedSession } from "../support/fake-host.ts";
import { loadPlugin, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

// Popups, own files, full screen, other sites' frames and large media, through
// the real routes. spec R3.3, R3.27, R4.15b, R4.25a, DECISIONS D33–D37

const SOURCE = `<!doctype html><html><head><title>Media</title></head><body>
<video controls src="clip.mp4"></video><a href="clip.mp4" download="Alua.mp4">Save</a></body></html>`;

let fixture: PluginFixture;
const put = (path: string, bytes: Uint8Array) => fixture.state.files.set(fileKey("thr_a", path), Buffer.from(bytes));

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", SOURCE);
  put("clip.mp4", new Uint8Array(LIMITS.inlineFileBytes + 10));
});

afterEach(() => fixture.dispose());

function sandboxOf(csp: string): string[] {
  return (/(?:^|;\s*)sandbox ([^;]*)/.exec(csp)?.[1] ?? "").trim().split(/\s+/);
}

describe("the sandbox a page runs in", () => {
  it("grants popups that escape it and downloads, and never same-origin, top navigation or modals (D34, R3.3)", async () => {
    for (const url of [`${ROUTE_BASE}/document?session=thr_a`, `${ROUTE_BASE}/home-document`]) {
      const csp = (await fixture.get(url)).headers.get("content-security-policy") ?? "";
      expect(sandboxOf(csp), url).toEqual([...PAGE_SANDBOX_FLAGS]);
      for (const flag of REFUSED_SANDBOX_FLAGS) expect(csp, `${url} ${flag}`).not.toContain(flag);
    }
    for (const url of [`${ROUTE_BASE}/page?session=thr_a`, `${ROUTE_BASE}/home`]) {
      const html = await (await fixture.get(url)).text();
      const frame = /<iframe [^>]*>/.exec(html)?.[0] ?? "";
      expect(frame, url).toContain(`sandbox="${PAGE_SANDBOX_FLAGS.join(" ")}"`);
      expect(frame, url).toContain('allow="fullscreen *"');
      for (const flag of REFUSED_SANDBOX_FLAGS) expect(frame, `${url} ${flag}`).not.toContain(flag);
    }
  });

  it("lets a page frame any https site, and keeps this host's own documents out of any frame but the shell's (D36, R3.27)", async () => {
    const csp = (await fixture.get(`${ROUTE_BASE}/document?session=thr_a`)).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-src https: blob: data:;");
    expect(csp).toContain("child-src https: blob: data:;");
    expect(csp).toContain("frame-ancestors 'self'");
    // The shell itself cannot be framed by a page either.
    const shell = (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).headers.get("content-security-policy") ?? "";
    expect(shell).toContain("frame-ancestors 'self'");
  });
});

describe("large own media (D37)", () => {
  it("serves a large own video as a marker for the shell, logs it once, and names it in status", async () => {
    const response = await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    const html = await response.text();
    expect(html).toMatch(/<video controls="" data-thread-page-src="clip.mp4" data-thread-page-stamp="[0-9a-f]{16}">/);
    // A download link to the same file is a link, not a carried reference: it stays as written.
    expect(html).toContain('<a href="clip.mp4" download="Alua.mp4">');
    await fixture.get(`${ROUTE_BASE}/document?session=thr_a`);
    const logged = fixture.state.logs.filter((line) => line.includes("clip.mp4") && line.includes("the shell fetches it"));
    expect(logged).toHaveLength(1);
    expect(fixture.state.logs.some((line) => line.includes("clip.mp4") && line.includes("was not carried"))).toBe(false);
    const status = await fixture.cli(["status"], "thr_a");
    expect(status.stdout).toContain("fetched by the shell (large media): clip.mp4 (2 MiB)");
  });

  it("tells the shell which files the document defers, on load and on a document exchange (only those are fetched)", async () => {
    const shell = await (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).text();
    expect(shell).toContain("&quot;deferredFiles&quot;:[&quot;clip.mp4&quot;]");
    const token = /&quot;actionToken&quot;:&quot;([^&]+)&quot;/.exec(shell)![1]!;
    const exchanged = (await (await fixture.post(`${ROUTE_BASE}/document-session`, { actionToken: token, path: "index.html" })).json()) as { deferredFiles?: unknown };
    expect(exchanged.deferredFiles).toEqual(["clip.mp4"]);
  });

  it("revises the document when the large file changes, so an open reader gets the new one", async () => {
    const before = (await fixture.get(`${ROUTE_BASE}/document?session=thr_a`)).headers.get("etag");
    put("clip.mp4", new Uint8Array(LIMITS.inlineFileBytes + 11).fill(7));
    const after = (await fixture.get(`${ROUTE_BASE}/document?session=thr_a`)).headers.get("etag");
    expect(after).not.toBe(before);
  });

  it("reports a file past the host's read limit as not carried, and leaves it as written", async () => {
    put("clip.mp4", new Uint8Array(LIMITS.shellFetchBytes + 1));
    const html = await (await fixture.get(`${ROUTE_BASE}/document?session=thr_a`)).text();
    expect(html).toMatch(/<video controls(="")? src="clip.mp4">/);
    expect((await fixture.cli(["status"], "thr_a")).stdout).toContain("not carried: clip.mp4 (too-large)");
  });
});
