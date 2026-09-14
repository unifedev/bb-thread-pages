import { describe, expect, it } from "vitest";
import { buildGuide } from "../../src/agent/guide.ts";
import { hasSeed, renderSeed } from "../../src/agent/seed/seed.ts";
import { capabilityRegistry } from "../../src/domain/capabilities/index.ts";
import { LIMITS } from "../../src/domain/limits.ts";
import { createCoreStorageSite, createPluginPrefixSite } from "../../src/pages/site.ts";
import { KERNEL_RUNTIME } from "../../src/generated/kernel-runtime.ts";
import { SHELL_RUNTIME } from "../../src/generated/shell-runtime.ts";
import { bundleRuntime, RUNTIMES } from "../../scripts/build-runtime.mjs";

const coreGuide = buildGuide(capabilityRegistry, createCoreStorageSite("/base", () => "/files/"));
const prefixGuide = buildGuide(capabilityRegistry, createPluginPrefixSite("/base"));

function section(guide: string, from: string, to: string): string {
  return guide.slice(guide.indexOf(from), guide.indexOf(to));
}

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

  // The product ships nothing for a page to fill in, and the guide may not
  // smuggle a starting point back in as prose. spec R6.27, DECISIONS D11
  it("carries no starting design, template, starter page or page shapes", () => {
    for (const leftover of ["data-theme", "var(--", "starter hub", "What plain HTML already gives you", "@scope", "div.card", "needs-you", "smallest shape"]) {
      expect(coreGuide, leftover).not.toContain(leftover);
    }
    expect(coreGuide).toContain("`init` does not create it, you do");
    expect(coreGuide).toContain("Nothing is provided to fill in");
  });

  it("documents controls anywhere on the page, and the open field for anything else", () => {
    const forms = section(coreGuide, "## Forms", "## Files the reader sends you");
    expect(forms).toContain('form="that-id"');
    expect(forms).toContain("marks the page\ndirty");
    expect(forms).toContain("Always include one empty text field for anything else");
  });

  it("says what a page is to other services and which servers it can reach", () => {
    const network = section(coreGuide, "## Network, other services and servers", "## What the sandbox silences");
    expect(network).toContain("`Origin: null`");
    expect(network).toContain("`localStorage`");
    expect(network).toContain("`storage.set`");
    expect(network).toContain("sign-in");
    expect(network).toContain("`http://127.0.0.1:8000`");
    expect(network).toContain("a port it shares for you");
    expect(network).toContain("preflights");
  });

  it("tells the truth about own-file fetch per site strategy", () => {
    expect(coreGuide).toContain("`fetch(\"data.json\")` of your own file\nfrom page script is refused");
    expect(prefixGuide).toContain("Page script may also fetch its own files as data");
    expect(prefixGuide).not.toContain("is refused (403)");
  });

  // A page written against 1.0.x carries its own copy of the stylesheet and of
  // the old seed comment, so two of the fixes cannot reach it. The guide has to
  // carry the edits themselves, not only a pointer to a file.
  it("tells an author with an older page exactly what to change", () => {
    const upgrading = section(coreGuide, "## If your page predates 1.1", "## Limits");
    expect(upgrading).toContain("[hidden] { display: none !important; }");
    expect(upgrading).toContain("Delete the seed's old authoring comment");
    expect(upgrading).toContain("Move inlined data back out");
    expect(upgrading).toContain("docs/FOR-PAGE-AUTHORS-1.1.md");
    expect(upgrading).toContain("https://syns.dev/bartsoj/bb-thread-pages");
  });

  // The one sentence that caused the worst field bug said subresources "load
  // normally". They do not, on the origin a reader actually uses, and the
  // guide must not imply that a file beside the page is served as a file.
  it("says how a page's own files actually reach the reader, and what it costs", () => {
    const files = section(coreGuide, "## Files you show the reader", "## Keeping a page's data current");
    expect(files).toContain("carries no credential");
    expect(files).toContain("`data:` URL");
    expect(files).toContain("count against the");
    expect(files).toContain("left as you wrote");
    expect(files).not.toContain("load normally");
    expect(files).toContain("so an open page");
  });

  it("describes home as a pointer that never creates content, and the built-in home it replaces", () => {
    const home = section(coreGuide, "## The home page", "## Before you save");
    expect(home).toContain("never creates");
    expect(home).toContain("built-in");
    expect(home).not.toContain("invoke(");
  });

  it("explains several documents in one page: how a link opens one and what does not carry over", () => {
    const documents = section(coreGuide, "## Several documents in one page", "## The home page");
    expect(documents).toContain('<a href="details.html">');
    expect(documents).toContain("inside the page");
    expect(documents).toContain("back and forward");
    expect(documents).toContain("script state");
  });

  it("keeps every document of a page styled with one stylesheet in the page root", () => {
    const documents = section(coreGuide, "## Several documents in one page", "## The home page");
    expect(documents).toContain('<link rel="stylesheet" href="page.css">');
    expect(documents).toContain("../page.css");
    expect(documents).toContain("unstyled");
  });
});

describe("an operator's own seed", () => {
  it("is optional, and substitutes an escaped title and date", () => {
    expect(hasSeed("")).toBe(false);
    expect(hasSeed(" \n ")).toBe(false);
    expect(hasSeed("<!doctype html>")).toBe(true);
    const html = renderSeed("<title>{{TITLE}}</title><p>{{DATE}}</p>", `Plan <b>"go"</b>`, new Date("2026-09-08T00:00:00Z"));
    expect(html).toBe("<title>Plan &lt;b&gt;&quot;go&quot;&lt;/b&gt;</title><p>8 September 2026</p>");
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
