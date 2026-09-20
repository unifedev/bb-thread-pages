import { describe, expect, it } from "vitest";
import { isDocumentPath, isPartPath } from "../../src/domain/document-path.ts";
import { LIMITS } from "../../src/domain/limits.ts";
import { expandIncludes, rebasePart, relativeFrom, type IncludeIo } from "../../src/pages/include.ts";

function io(files: Record<string, string>, options: { noListing?: boolean } = {}): IncludeIo & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async read(path) {
      reads.push(path);
      const text = files[path];
      return text === undefined ? null : { bytes: Buffer.from(text, "utf8") };
    },
    async list(directory) {
      if (options.noListing) return null;
      return Object.keys(files)
        .filter((path) => path.startsWith(directory) && !path.slice(directory.length).includes("/"))
        .map((path) => path.slice(directory.length));
    },
  };
}

const page = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

describe("parts and documents (R1.20, R1.12e)", () => {
  it("a path with a segment starting with _ is a part, and never a document", () => {
    for (const path of ["_o/a.html", "slides/_intro.html", "_a.htm", "a/_b/c.html"]) {
      expect(isPartPath(path)).toBe(true);
      expect(isDocumentPath(path)).toBe(false);
    }
    for (const path of ["o/a.html", "index.html", "a_b/c_.html"]) {
      expect(isPartPath(path)).toBe(false);
      expect(isDocumentPath(path)).toBe(true);
    }
    for (const path of ["_o/a.css", "../_o/a.html", "/_o/a.html", "uploads/_a.html", "_o//a.html"]) expect(isPartPath(path)).toBe(false);
  });
});

describe("expandIncludes (R1.19–R1.25)", () => {
  it("replaces a pattern with every matching part in name order, in place", async () => {
    const files = { "_o/10-c.html": "<p>c</p>", "_o/02-b.html": "<p>b</p>", "_o/01-a.html": "<p>a</p>", "_o/.hidden.html": "<p>h</p>", "_o/note.txt": "x", "_o/deep/_x.html": "<p>deep</p>" };
    const out = await expandIncludes(page('<main><link rel="thread-page-include" href="_o/*.html"></main>'), io(files));
    expect(out.html).toBe(page("<main><p>a</p>\n<p>b</p>\n<p>c</p></main>"));
    expect(out.parts.map((part) => part.path)).toEqual(["_o/01-a.html", "_o/02-b.html", "_o/10-c.html"]);
    expect(out.skipped).toEqual([]);
  });

  it("replaces a named part, and leaves a document with no include byte for byte alone", async () => {
    const out = await expandIncludes(page('<link rel="thread-page-include" href="_head.html"><p>x</p>'), io({ "_head.html": "<h1>Hi</h1>" }));
    expect(out.html).toBe(page("<h1>Hi</h1><p>x</p>"));
    const plain = page("<p>nothing to include</p>");
    expect((await expandIncludes(plain, io({}))).html).toBe(plain);
  });

  it("is textual: a part may hold table rows, a script, or half a list", async () => {
    const files = { "_rows.html": "<tr><td>1</td></tr>", "_split.html": "</ul><ul class=b>", "_s.html": "<script>if (1 < 2) document.title = '</' + 'p>';</script>" };
    const source = page('<table><link rel="thread-page-include" href="_rows.html"></table><ul><li>a<link rel="thread-page-include" href="_split.html"><li>b</ul><link rel="thread-page-include" href="_s.html">');
    const out = await expandIncludes(source, io(files));
    expect(out.html).toBe(page(`<table>${files["_rows.html"]}</table><ul><li>a${files["_split.html"]}<li>b</ul>${files["_s.html"]}`));
  });

  it("an empty pattern yields nothing; a missing named part stays as written and is reported", async () => {
    const source = page('<link rel="thread-page-include" href="_none/*.html"><link rel="thread-page-include" href="_gone.html">');
    const out = await expandIncludes(source, io({}));
    expect(out.html).toBe(page('<link rel="thread-page-include" href="_gone.html">'));
    expect(out.skipped).toEqual([{ path: "_gone.html", reason: "missing" }]);
  });

  it("refuses traversal, absolute and remote references, and files that are not parts (R1.24, A91)", async () => {
    const files = { "o/a.html": "<p>document</p>", "secret.html": "<p>s</p>" };
    const hrefs = ["../x/_a.html", "/etc/_passwd.html", "https://example.com/_a.html", "_o/../../_a.html", "o/a.html", "secret.html"];
    const source = page(hrefs.map((href) => `<link rel="thread-page-include" href="${href}">`).join(""));
    const reader = io(files);
    const out = await expandIncludes(source, reader);
    expect(out.html).toBe(source);
    expect(reader.reads).toEqual([]);
    expect(out.skipped.map((entry) => entry.reason)).toEqual(["unsafe-path", "unsafe-path", "unsafe-path", "unsafe-path", "not-a-part", "not-a-part"]);
  });

  it("a pattern only ever matches parts", async () => {
    const out = await expandIncludes(page('<link rel="thread-page-include" href="docs/*.html">'), io({ "docs/page.html": "<p>doc</p>", "docs/_part.html": "<p>part</p>" }));
    expect(out.html).toBe(page("<p>part</p>"));
  });

  it("resolves a part's relative references from the part's directory (R1.22, A93)", async () => {
    const files = { "_o/a.html": '<img src="pic.png" alt="&amp;"><a href="../other.html#x">o</a><a href="#top">t</a><img src="https://e.com/x.png"><img srcset="s.png 1x, big/l.png 2x">' };
    const out = await expandIncludes(page('<link rel="thread-page-include" href="_o/a.html">'), io(files));
    expect(out.html).toBe(page('<img src="_o/pic.png" alt="&amp;"><a href="other.html#x">o</a><a href="#top">t</a><img src="https://e.com/x.png"><img srcset="_o/s.png 1x, _o/big/l.png 2x">'));
  });

  it("rebases toward a document in a subdirectory", () => {
    expect(relativeFrom("docs/", "_o/pic.png")).toBe("../_o/pic.png");
    expect(relativeFrom("a/b/", "a/c/d.png")).toBe("../c/d.png");
    expect(relativeFrom("", "x y.png")).toBe("x%20y.png");
    expect(rebasePart('<img src="p.png">', "docs/_parts/", "docs/")).toBe('<img src="_parts/p.png">');
    expect(rebasePart('<img src="p.png">', "_o/", "_o/")).toBe('<img src="p.png">');
  });

  it("a part may include parts, from its own directory, to a bounded depth (R1.23)", async () => {
    const files = { "_a/1.html": '<div><link rel="thread-page-include" href="_b/2.html"></div>', "_a/_b/2.html": '<img src="i.png">' };
    const out = await expandIncludes(page('<link rel="thread-page-include" href="_a/1.html">'), io(files));
    expect(out.html).toBe(page('<div><img src="_a/_b/i.png"></div>'));
    const loop = { "_l.html": 'x<link rel="thread-page-include" href="_l.html">' };
    const looped = await expandIncludes(page('<link rel="thread-page-include" href="_l.html">'), io(loop));
    expect(looped.parts.length).toBe(LIMITS.includeDepth);
    expect(looped.skipped.at(-1)?.reason).toBe("too-deep");
  });

  it("bounds the size of a part, the number of parts and the assembled document", async () => {
    const big = "x".repeat(LIMITS.includePartBytes + 1);
    const tooLarge = await expandIncludes(page('<link rel="thread-page-include" href="_big.html">'), io({ "_big.html": big }));
    expect(tooLarge.skipped).toEqual([{ path: "_big.html", reason: "too-large" }]);
    const many: Record<string, string> = {};
    for (let index = 0; index < LIMITS.includeParts + 5; index += 1) many[`_m/${String(index).padStart(4, "0")}.html`] = "<i></i>";
    const capped = await expandIncludes(page('<link rel="thread-page-include" href="_m/*.html">'), io(many));
    expect(capped.parts.length).toBe(LIMITS.includeParts);
    expect(capped.skipped.every((entry) => entry.reason === "too-many")).toBe(true);
    const heavy: Record<string, string> = {};
    for (let index = 0; index < 4; index += 1) heavy[`_h/${index}.html`] = "y".repeat(LIMITS.includePartBytes - 10);
    const budgeted = await expandIncludes(page('<link rel="thread-page-include" href="_h/*.html">'), io(heavy));
    expect(budgeted.skipped.some((entry) => entry.reason === "budget")).toBe(true);
    expect(Buffer.byteLength(budgeted.html)).toBeLessThanOrEqual(LIMITS.entryDocumentBytes);
  });

  it("a host that cannot list leaves a pattern as written, and still honours a named part (R8.11a)", async () => {
    const source = page('<link rel="thread-page-include" href="_o/*.html"><link rel="thread-page-include" href="_o/a.html">');
    const out = await expandIncludes(source, io({ "_o/a.html": "<p>a</p>" }, { noListing: true }));
    expect(out.html).toBe(page('<link rel="thread-page-include" href="_o/*.html"><p>a</p>'));
    expect(out.skipped).toEqual([{ path: "_o/*.html", reason: "no-listing" }]);
  });

  it("finds an include inside a template, and ignores one inside a comment or a script", async () => {
    const source = page('<template><link rel="thread-page-include" href="_t.html"></template><!-- <link rel="thread-page-include" href="_t.html"> --><script>const s = \'<link rel="thread-page-include" href="_t.html">\';</script>');
    const out = await expandIncludes(source, io({ "_t.html": "<b>t</b>" }));
    expect(out.html).toBe(source.replace('<template><link rel="thread-page-include" href="_t.html"></template>', "<template><b>t</b></template>"));
  });
});
