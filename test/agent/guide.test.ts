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
    expect(coreGuide).toContain("`voice.captureAndTranscribe` — device · confirmed in trusted chrome");
  });

  // Spec 1.5: the text-area controls, voice, the recorded answer and files, each with its numbers. A138, R6.24
  it("documents text areas, voice, the audio input and files with their limits, and not bb's own voice command", () => {
    const areas = section(coreGuide, "### Every text area takes voice and files", "## Files the reader sends you");
    expect(areas).toContain("**Dictate**");
    expect(areas).toContain("**Attach files**");
    expect(areas).toContain("**Attached here:**");
    expect(areas).toContain(`${LIMITS.uploadsPerForm} per\nform`);
    expect(areas).toContain("`data-thread-page-manual` on a <textarea>");
    expect(areas).toMatch(/Dictate only/);
    const uploads = section(coreGuide, "## Files the reader sends you", "## Files you show the reader");
    expect(uploads).toContain('<input type="file" accept="audio/*" capture>');
    expect(uploads).toContain("Transcript missing");
    expect(uploads).toContain(`up to ${LIMITS.voiceDefaultSeconds} s`);
    const voice = section(coreGuide, "## Voice", "## Capabilities\n");
    expect(voice).toMatch(/\*\*it is the\s+confirmation\*\*/);
    expect(voice).toContain("20 MB of audio with its default transcription");
    expect(voice).toContain("25 MB with OpenAI; each attempt 10 s,\n  2 attempts");
    expect(voice).toContain("bottom centre of the page area");
    expect(voice).toMatch(/never re-ask by yourself after `cancelled`/);
    expect(coreGuide).not.toContain("top bar's recording bar");
    expect(coreGuide).toContain("no HEIC or HEIF");
    expect(voice).toContain(`from 1 to ${LIMITS.voiceMaxSeconds}, default ${LIMITS.voiceDefaultSeconds}`);
    expect(voice).toContain(`at most\n  ${LIMITS.voicePromptChars} characters`);
    expect(voice).toContain("`cancelled`: Cancel, Escape, or Done before 1 s");
    const files = section(coreGuide, "**With files.**", "## Network");
    expect(files).toContain(`At most ${LIMITS.promptFiles} files of 24 MiB each`);
    expect(files).toContain("native attachment");
    expect(files).toContain("`unavailable` rather than starting without them");
    expect(coreGuide).not.toMatch(/bb voice transcribe|voice transcribe/);
    expect(coreGuide).not.toContain("not implemented: unknown_method");
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
    expect(coreGuide).toContain("**`window.open(url)`** from a click handler");
    expect(coreGuide).toContain("Your page is yours alone");
    expect(coreGuide).toContain("data-thread-page-manual");
    expect(coreGuide).toContain("uploads/");
    expect(coreGuide).toContain("nested paths");
    expect(coreGuide).toContain("setDirty");
    expect(coreGuide).toContain("320px");
  });

  // Spec 1.3: refresh, parts and embedded pages, each with its numbers, and
  // nothing left that became false. A105, R6.24, R6.25
  it("explains refresh, parts and embedding with their limits, and no longer says embedding is blocked", () => {
    const refresh = section(coreGuide, "## Keeping a page current", "## Showing another session's page");
    expect(refresh).toContain(`every **${LIMITS.shellPollWorkingMs / 1000} s while your session is\nworking, and for ${LIMITS.shellPollAfterAnswerMs / 1000} s after the reader answers from the page**; every ${LIMITS.shellPollMs / 1000} s`);
    expect(refresh).toContain("swapped in place");
    expect(refresh).toMatch(/There\s+is no reload call in the API/);
    expect(refresh).toContain("a page that follows a data source is a page\nsomething rewrites, and while your session works the reader sees each rewrite\nwithin seconds");

    const parts = section(coreGuide, "## A document made of parts", "## Keeping a page current");
    expect(parts).toContain('<link rel="thread-page-include" href="_cards/*.html">');
    expect(parts).toContain("name order");
    expect(parts).toContain("A part is a file with a path segment starting with `_`");
    expect(parts).toContain("never a document of the page");
    expect(parts).toMatch(/from the\s+part's own directory/);
    expect(parts).toContain(`At most ${LIMITS.includeParts} parts and ${LIMITS.includeElements} include`);
    expect(parts).toContain("`bb thread-page status` lists each one with its reason");
    expect(parts).toMatch(/symbolic links are\s+refused/);

    const embedding = section(coreGuide, "## Showing another session's page", "## window.threadPage");
    expect(embedding).toContain("window.threadPage.embed(target, { sessionId, path, onState })");
    expect(embedding).toContain('`sandbox="allow-scripts allow-forms allow-popups allow-downloads"`');
    expect(embedding).toContain('`allow="fullscreen *"`');
    expect(embedding).toMatch(new RegExp(`every ${LIMITS.embedPollWorkingMs / 1000} s while an embedded session is working`));
    expect(embedding).toMatch(/checked in one call\s+per tick/);
    expect(embedding).toContain(`At most ${LIMITS.embedsPerPage} embeds on a page`);
    expect(embedding).toContain("never to yours");
    expect(embedding).toContain("asks them once");
    expect(embedding).toContain("rejects with `unavailable`");
    expect(embedding).toContain("A form with a file attached is not sent from inside an embed");
    expect(embedding).toContain("one level deep");
    expect(embedding).toContain(`${LIMITS.embedCallsPerMinute} calls a minute`);

    expect(coreGuide).toContain("`pages.answer` — granted-write · asked once per pair in trusted chrome, then remembered");
    expect(coreGuide).toContain(`| pages.read | ${LIMITS.pagesReadEntries} documents per call, 8 MiB per response`);
    for (const stale of ["Embedding another page or site in an <iframe> is blocked", "within 10 s and reloads the page", "| Shell revision poll | every 10 s while visible |"]) {
      expect(coreGuide, stale).not.toContain(stale);
    }
  });

  // Spec 1.4 (D33–D37): links, windows, downloads, own files, full screen, other
  // sites and large media, with numbers, and nothing left that became false. R6.25
  it("explains links, windows, downloads, own files, full screen, other sites and large media, and drops what became false", () => {
    const affordances = section(coreGuide, "## Links, windows, downloads and full screen", "## Other sites in a frame");
    expect(affordances).toMatch(/\*\*asks the reader\*\* in the top bar's dialog/);
    expect(affordances).toMatch(/that window \*\*stays sandboxed\*\*/);
    expect(affordances).toMatch(/\*Open “label” \(https:\/\/site\) in\s+a new tab\?\*/);
    expect(affordances).toMatch(/refuses them[\s\S]*`invalid_params`, before any dialog/);
    expect(affordances).toContain("**`mailto:` and `tel:`**");
    expect(affordances).toContain("`URL.createObjectURL(blob)`");
    expect(affordances).toContain("`element.requestFullscreen()`");
    expect(affordances).toContain("`window.prompt`, `alert`, `confirm`");

    const sites = section(coreGuide, "## Other sites in a frame", "## One agent, one page");
    expect(sites).toContain("**no cookies and no storage**");
    expect(sites).toMatch(/OpenStreetMap/);
    expect(sites).toMatch(/Vimeo shows its poster at most, Figma is\s+blank/);
    expect(sites).toContain("`X-Frame-Options`");
    expect(sites).toContain("show it with `threadPage.embed`");

    const files = section(coreGuide, "## Files you show the reader", "## Several documents");
    expect(files).toContain(`of a\nfile up to ${LIMITS.shellFetchBytes / (1024 * 1024)} MiB (${LIMITS.shellFetchImageBytes / (1024 * 1024)} MiB for an image`);
    expect(files).toContain("`data-thread-page-src=\"clip.mp4\"`");
    expect(files).toContain("*fetched by the shell*");
    expect(files).toMatch(/\*\*an SVG, XML or any other type is downloaded instead\*\*/);
    expect(files).toContain('`<a href="clip.mp4" download="Our clip.mp4">`');
    expect(files).toMatch(/\*\*Safari does not play a video opened in its own tab\*\*[\s\S]*bb #4339/);
    expect(coreGuide).toContain(`| Large media fetched for the reader | up to ${LIMITS.shellFetchBytes / (1024 * 1024)} MiB per file`);

    for (const stale of ["frame-src 'none'", "a frame with a URL is blocked", "a page has no popups", "What the sandbox silences", "with no dialog,\n  whatever its", "popups-to-escape"]) {
      expect(coreGuide, stale).not.toContain(stale);
    }
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
