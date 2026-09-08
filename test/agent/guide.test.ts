import { describe, expect, it } from "vitest";
import { buildGuide } from "../../src/agent/guide.ts";
import { DEFAULT_PAGE_SEED, renderSeed } from "../../src/agent/seed/seed.ts";
import { capabilityRegistry } from "../../src/domain/capabilities/index.ts";
import { LIMITS } from "../../src/domain/limits.ts";
import { injectKernel } from "../../src/domain/html/document.ts";
import { createCoreStorageSite, createPluginPrefixSite } from "../../src/pages/site.ts";
import { KERNEL_RUNTIME } from "../../src/generated/kernel-runtime.ts";
import { SHELL_RUNTIME } from "../../src/generated/shell-runtime.ts";
import { bundleRuntime, RUNTIMES } from "../../scripts/build-runtime.mjs";

const coreGuide = buildGuide(capabilityRegistry, createCoreStorageSite("/base", () => "/files/"));
const prefixGuide = buildGuide(capabilityRegistry, createPluginPrefixSite("/base"));

describe("the authoring guide", () => {
  it("documents every capability with its parameters and whether it confirms", () => {
    for (const spec of capabilityRegistry.list()) {
      expect(coreGuide, spec.method).toContain(`\`${spec.method}\``);
      expect(coreGuide).toContain(spec.doc.params);
      if (spec.confirmed && spec.implemented) expect(coreGuide).toContain(`\`${spec.method}\` — ${spec.effect} · confirmed in trusted chrome`);
    }
    expect(coreGuide).toContain("`voice.captureAndTranscribe` — device · not implemented on this host: unknown_method");
  });

  it("states every limit as a number", () => {
    expect(coreGuide).toContain("5 MiB");
    expect(coreGuide).toContain("24 MiB");
    expect(coreGuide).toContain(`${LIMITS.uploadsPerForm} files per form`);
    expect(coreGuide).toContain(`${LIMITS.ratePerMinute} accepted requests a minute`);
    expect(coreGuide).toContain(`${LIMITS.snapshotDefault} default, ${LIMITS.snapshotMax} maximum`);
    expect(coreGuide).toContain(`${LIMITS.watchMinMs / 1000} s–${LIMITS.watchMaxMs / 60_000} min`);
    expect(coreGuide).toContain("32 KiB per key");
  });

  it("covers the mandatory sections: the dialog trap message, cancelled, start defaults, network, silenced affordances, composition", () => {
    expect(coreGuide).toContain("**Action**\n    confirm");
    expect(coreGuide).toMatch(/cancelled.*declined/s);
    expect(coreGuide).toContain("What you get when you say nothing");
    expect(coreGuide).toContain("Pages have internet access");
    expect(coreGuide).toContain("`window.prompt`, `alert`, `confirm`");
    expect(coreGuide).toContain("`window.open`");
    expect(coreGuide).toContain("Your page is yours alone");
    expect(coreGuide).toContain("data-thread-page-manual");
    expect(coreGuide).toContain("uploads/");
    expect(coreGuide).toContain("nested paths");
    expect(coreGuide).toContain("setDirty");
    expect(coreGuide).toContain("320px");
  });

  it("tells the truth about own-file fetch per site strategy", () => {
    expect(coreGuide).toContain("`fetch(\"data.json\")` of your own file from\npage script is refused");
    expect(prefixGuide).toContain("Page script may also fetch its own files as data");
    expect(prefixGuide).not.toContain("is refused (403)");
  });
});

describe("the seed", () => {
  it("is a complete document with a captured form, its own stylesheet and an escaped title", () => {
    const html = renderSeed(DEFAULT_PAGE_SEED, `Plan <b>"go"</b>`, new Date("2026-09-08T00:00:00Z"));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Plan &lt;b&gt;&quot;go&quot;&lt;/b&gt;</title>");
    expect(html).toContain("8 September 2026");
    expect(html).toContain("<form");
    expect(html).not.toContain("data-thread-page-manual>");
    expect(html).toContain("<style>");
    expect(html).not.toContain("{{");
    const injected = injectKernel(html, { kernel: "K()", config: {}, baseHref: null });
    expect(injected.indexOf("data-thread-page-kernel")).toBeLessThan(injected.indexOf("<style>"));
  });

  it("keeps its comment free of tags that would end it early", () => {
    const comment = DEFAULT_PAGE_SEED.slice(DEFAULT_PAGE_SEED.indexOf("<!--"), DEFAULT_PAGE_SEED.indexOf("-->"));
    expect(comment).not.toContain("-->");
  });
});

describe("generated runtimes", () => {
  it("are committed up to date with src/runtime", async () => {
    for (const runtime of RUNTIMES) {
      const fresh = await bundleRuntime(runtime);
      const current = runtime.name === "kernel" ? KERNEL_RUNTIME : SHELL_RUNTIME;
      expect(fresh).toContain(JSON.stringify(current));
    }
  }, 30_000);

  it("contain no script terminator and read their config from the script element", () => {
    for (const runtime of [KERNEL_RUNTIME, SHELL_RUNTIME]) {
      expect(runtime).not.toContain("</script");
      expect(runtime).toContain("data-config");
    }
  });
});
