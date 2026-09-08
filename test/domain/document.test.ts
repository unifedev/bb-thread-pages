import { describe, expect, it } from "vitest";
import { injectKernel } from "../../src/domain/html/document.ts";

const options = { kernel: "KERNEL();", config: { pageRevision: "r", stale: false }, baseHref: "/api/v1/threads/thr_a/thread-storage/files/" };

function scriptIndex(html: string): number {
  return html.indexOf("data-thread-page-kernel");
}

describe("kernel injection", () => {
  it("puts base then kernel first in head and changes nothing else", () => {
    const source = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>T</title>\n<script>authored()</script>\n</head>\n<body><h1>Hi</h1><img src="chart.png"></body>\n</html>`;
    const out = injectKernel(source, options);
    const head = out.indexOf("<head>");
    const base = out.indexOf("<base href=");
    const kernel = scriptIndex(out);
    const authored = out.indexOf("authored()");
    expect(head).toBeLessThan(base);
    expect(base).toBeLessThan(kernel);
    expect(kernel).toBeLessThan(authored);
    expect(out).toContain('<img src="chart.png">');
    expect(out).toContain('data-config="{&quot;pageRevision&quot;:&quot;r&quot;,&quot;stale&quot;:false}"');
    expect(out.match(/<base /g)?.length).toBe(1);
  });

  it("omits the base when the strategy gives none, and keeps an authored base after ours otherwise", () => {
    const source = `<!doctype html><html><head><base href="https://evil.example/"><title>T</title></head><body></body></html>`;
    const without = injectKernel(source, { ...options, baseHref: null });
    expect(without).not.toContain("/thread-storage/files/");
    const withBase = injectKernel(source, options);
    expect(withBase.indexOf("/thread-storage/files/")).toBeLessThan(withBase.indexOf("evil.example"));
  });

  it("handles documents without a head, with a leading BOM or comment, and a frameset", () => {
    for (const source of ["﻿<!doctype html><html><body><p>x</p></body></html>", "<!-- c --><!doctype html><html><body><p>x</p></body></html>", "<html><head></head><body>y</body></html>", "<!doctype html><html><frameset></frameset></html>"]) {
      const out = injectKernel(source, options);
      expect(scriptIndex(out), source).toBeGreaterThan(-1);
      expect(out.indexOf("<base"), source).toBeLessThan(scriptIndex(out));
    }
  });

  it("wraps a bare fragment so the kernel still runs", () => {
    const out = injectKernel("<p>just a fragment</p>", options);
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<p>just a fragment</p>");
    expect(scriptIndex(out)).toBeLessThan(out.indexOf("just a fragment"));
  });

  it("is not fooled by comment decoys or quoted angle brackets", () => {
    const source = `<!doctype html><html><head><!-- <script>decoy</script> --><title>a "<b>" title</title></head><body><script>authored()</script></body></html>`;
    const out = injectKernel(source, options);
    expect(scriptIndex(out)).toBeLessThan(out.indexOf("decoy"));
    expect(scriptIndex(out)).toBeLessThan(out.indexOf("authored()"));
  });
});
