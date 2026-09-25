import { describe, expect, it } from "vitest";
import { isOwnFileReference, resolveOwnFiles, type OwnFileReader } from "../../src/pages/inline.ts";
import { LIMITS } from "../../src/domain/limits.ts";

const utf8 = (text: string) => new TextEncoder().encode(text);

function reader(files: Record<string, Uint8Array | string>): OwnFileReader {
  return async (path) => {
    const entry = files[path];
    if (entry === undefined) return null;
    return { bytes: typeof entry === "string" ? utf8(entry) : entry };
  };
}

const decode = (url: string) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("utf8");
const urlIn = (html: string, attr: string) => html.match(new RegExp(`${attr}="(data:[^"]*)"`))?.[1] ?? null;

describe("resolving a page's own files", () => {
  it("carries a stylesheet, a script and an image into the document", async () => {
    const html = `<!doctype html><html><head><link rel="stylesheet" href="page.css"></head><body><script src="app.js"></script><img src="figures/chart.png" alt="x"></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "page.css": "main{color:red}", "app.js": "console.log(1)", "figures/chart.png": new Uint8Array([1, 2, 3]) }));

    expect(outcome.skipped).toEqual([]);
    expect(outcome.resolved.map((file) => file.path).sort()).toEqual(["app.js", "figures/chart.png", "page.css"]);
    expect(decode(urlIn(outcome.html, "href") ?? "")).toBe("main{color:red}");
    expect(decode(urlIn(outcome.html, "src") ?? "")).toBe("console.log(1)");
    expect(outcome.html).toContain("data:image/png;base64,AQID");
    expect(outcome.html).toContain('alt="x"');
  });

  it("keeps every other attribute, which is why the url is rewritten and not the element", async () => {
    const html = `<html><head></head><body><script type="module" defer src="app.js"></script></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "app.js": "export{}" }));
    expect(outcome.html).toContain('type="module"');
    expect(outcome.html).toContain("defer");
  });

  it("cannot be broken out of by a file that contains a closing tag", async () => {
    const html = `<html><head></head><body><script src="app.js"></script></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "app.js": 'const s = "</script><img onerror=alert(1)>"' }));
    expect(outcome.html).not.toContain("onerror");
    expect(outcome.html.match(/<script/g)).toHaveLength(1);
  });

  it("leaves alone anything that is not the page's own file", async () => {
    const html = `<html><head><link rel="stylesheet" href="https://cdn.example/a.css"><link rel="stylesheet" href="//cdn.example/b.css"><link rel="stylesheet" href="/absolute.css"></head><body><a href="#top">t</a><img src="data:image/gif;base64,AA"></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({}));
    expect(outcome.resolved).toEqual([]);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.html).toBe(html);
  });

  it("refuses to climb out of the page root", async () => {
    const html = `<html><head><link rel="stylesheet" href="../../etc/passwd"></head><body></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({}));
    expect(outcome.resolved).toEqual([]);
    expect(outcome.skipped).toEqual([{ path: "../../etc/passwd", reason: "unsafe-path" }]);
    expect(outcome.html).toBe(html);
  });

  it("reports a reference to a file that is not there, and leaves the page renderable", async () => {
    const html = `<html><head><link rel="stylesheet" href="page.css"></head><body></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({}));
    expect(outcome.skipped).toEqual([{ path: "page.css", reason: "missing" }]);
    expect(outcome.html).toBe(html);
  });

  it("follows url() inside a stylesheet it is carrying, so backgrounds and fonts survive", async () => {
    const html = `<html><head><link rel="stylesheet" href="assets/page.css"></head><body></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "assets/page.css": "body{background:url('bg.png')}@font-face{src:url(f.woff2)}", "assets/bg.png": new Uint8Array([9]), "assets/f.woff2": new Uint8Array([8]) }));
    const css = decode(urlIn(outcome.html, "href") ?? "");
    expect(css).toContain("data:image/png;base64,CQ==");
    expect(css).toContain("data:font/woff2;base64,CA==");
    expect(outcome.resolved.map((file) => file.path).sort()).toEqual(["assets/bg.png", "assets/f.woff2", "assets/page.css"]);
  });

  it("reads each file once however many times the page references it", async () => {
    let reads = 0;
    const html = `<html><head></head><body><img src="a.png"><img src="a.png"><img src="./a.png"></body></html>`;
    const outcome = await resolveOwnFiles(html, async (path) => {
      reads += 1;
      return path === "a.png" ? { bytes: new Uint8Array([1]) } : null;
    });
    expect(reads).toBe(1);
    expect(outcome.resolved).toHaveLength(1);
    expect(outcome.html.match(/data:image\/png/g)).toHaveLength(3);
  });

  it("refuses a file over the per-file cap and a set over the total, and says which", async () => {
    // A script cannot be deferred to the shell (D37), so a large one is left as written and reported.
    const big = new Uint8Array(LIMITS.inlineFileBytes + 1);
    const outcome = await resolveOwnFiles(`<html><head></head><body><script src="big.js"></script></body></html>`, reader({ "big.js": big }));
    expect(outcome.skipped).toEqual([{ path: "big.js", reason: "too-large" }]);
    expect(outcome.html).toContain('src="big.js"');

    const chunk = new Uint8Array(LIMITS.inlineFileBytes);
    const many = Array.from({ length: 4 }, (_, index) => `<img src="f${index}.png">`).join("");
    const files = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`f${index}.png`, chunk]));
    const scripts = Array.from({ length: 4 }, (_, index) => `<script src="f${index}.js"></script>`).join("");
    const second = await resolveOwnFiles(`<html><head></head><body>${scripts}</body></html>`, reader(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name.replace(".png", ".js"), bytes]))));
    expect(second.skipped.some((file) => file.reason === "budget")).toBe(true);
    expect(second.resolved.length).toBeGreaterThan(0);
    // Images over the budget go to the shell instead (D37).
    const images = await resolveOwnFiles(`<html><head></head><body>${many}</body></html>`, reader(files));
    expect(images.skipped).toEqual([]);
    expect(images.deferred?.length).toBeGreaterThan(0);
  });

  // D37: own media too large to carry is marked for the shell to fetch, not left bare.
  it("defers large own media, images, posters and tracks to the shell, and names them", async () => {
    const large = new Uint8Array(LIMITS.inlineFileBytes + 1);
    const html = `<html><head></head><body>
<video controls src="media/clip.mp4" poster="poster.jpg"><track src="subs.vtt" kind="subtitles"></video>
<video><source src="media/clip.mp4" type="video/mp4"></video>
<audio src="song.mp3"></audio><img src="photo.png" alt="p"></body></html>`;
    const read: OwnFileReader = async (path) => (["media/clip.mp4", "poster.jpg", "subs.vtt", "song.mp3", "photo.png"].includes(path) ? { bytes: large, sha256: `${path.length}`.padEnd(64, "0") } : null);
    const outcome = await resolveOwnFiles(html, read);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.deferred?.map((file) => file.path).sort()).toEqual(["media/clip.mp4", "photo.png", "poster.jpg", "song.mp3", "subs.vtt"]);
    expect(outcome.deferred?.every((file) => file.bytes === large.byteLength)).toBe(true);
    // The attribute becomes a marker: no bare request the reader's origin would refuse.
    expect(outcome.html).toContain('data-thread-page-src="media/clip.mp4"');
    expect(outcome.html).toContain('data-thread-page-poster="poster.jpg"');
    expect(outcome.html).toMatch(/<track kind="subtitles" data-thread-page-src="subs.vtt"/);
    expect(outcome.html).toContain('<img alt="p" data-thread-page-src="photo.png"');
    expect(outcome.html).not.toMatch(/\ssrc="media\/clip\.mp4"/);
    expect(outcome.html).not.toMatch(/\sposter=/);
    // Its version is in the document, so a changed file refreshes an open page.
    expect(outcome.html).toContain('data-thread-page-stamp="1400000000000000"');
  });

  it("resolves a deferred path from the document's directory, and defers a file over the page budget", async () => {
    const chunk = new Uint8Array(LIMITS.inlineFileBytes);
    const html = `<html><head></head><body><img src="a.png"><img src="b.png"><video src="../media/c.mp4"></video></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "guides/a.png": chunk, "guides/b.png": chunk, "media/c.mp4": new Uint8Array(1) }), "guides/");
    expect(outcome.resolved.map((file) => file.path).sort()).toEqual(["guides/a.png", "media/c.mp4"]);
    expect(outcome.deferred).toEqual([{ path: "guides/b.png", bytes: chunk.byteLength }]);
    expect(outcome.html).toContain('data-thread-page-src="guides/b.png"');
  });

  it("leaves as written, and reports, a large file past the host's read limit or where it cannot be deferred", async () => {
    const overImage = new Uint8Array(LIMITS.shellFetchImageBytes + 1);
    const large = new Uint8Array(LIMITS.inlineFileBytes + 1);
    const tooLarge = Object.assign(new Error("413"), {});
    const read: OwnFileReader = async (path) => {
      if (path === "huge.mp4") {
        const { PageError } = await import("../../src/domain/errors.ts");
        throw new PageError("page_too_large", "too large", { cause: tooLarge });
      }
      return path === "huge.png" ? { bytes: overImage } : path === "bg.jpg" ? { bytes: large } : null;
    };
    const html = `<html><head><style></style><link rel="stylesheet" href="x.css"></head><body><video src="huge.mp4"></video><img src="huge.png"><img srcset="bg.jpg 2x"><img src="bg.jpg"></body></html>`;
    const outcome = await resolveOwnFiles(html, read);
    expect(outcome.skipped).toEqual(
      expect.arrayContaining([
        { path: "huge.mp4", reason: "too-large" },
        { path: "huge.png", reason: "too-large" },
        { path: "bg.jpg", reason: "too-large" },
      ]),
    );
    expect(outcome.html).toContain('<video src="huge.mp4">');
    expect(outcome.html).toContain('srcset="bg.jpg 2x"');
    // The same file is still deferred where it can be.
    expect(outcome.deferred).toEqual([{ path: "bg.jpg", bytes: large.byteLength }]);
  });

  it("rewrites srcset candidates and keeps their descriptors", async () => {
    const html = `<html><head></head><body><img srcset="a.png 1x, https://cdn.example/b.png 2x"></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "a.png": new Uint8Array([1]) }));
    expect(outcome.html).toContain("data:image/png;base64,AQ== 1x");
    expect(outcome.html).toContain("https://cdn.example/b.png 2x");
  });

  it("does not touch a document that references nothing of its own", async () => {
    const html = `<!doctype html><html><head><title>t</title></head><body><p>hello</p></body></html>`;
    const outcome = await resolveOwnFiles(html, reader({ "unused.css": "a{}" }));
    expect(outcome.html).toBe(html);
    expect(outcome.resolved).toEqual([]);
  });
});

describe("what counts as the page's own file", () => {
  it.each([
    ["page.css", true],
    ["figures/a b (v2).png", true],
    ["./a.js", true],
    ["../a.js", true],
    ["https://example.com/a.css", false],
    ["//example.com/a.css", false],
    ["/api/v1/x", false],
    ["data:text/css,a{}", false],
    ["#section", false],
    ["mailto:a@b.c", false],
    ["", false],
  ])("%s -> %s", (reference, expected) => {
    expect(isOwnFileReference(reference)).toBe(expected);
  });
});
