// Strategy `carried`: own stylesheets, scripts, images, fonts carried as `data:`; CSS `url()` to depth 3; limits; large media marked `data-thread-page-file="<path>@<version>"` (02 R4.25a, 05 R-S7).
import { defaultTreeAdapter, parse as parseHtml, serialize as serializeHtml, type DefaultTreeAdapterTypes } from "parse5";
import { LIMITS } from "../domain/limits.ts";
import { ownFileReference, shellFetchLimit } from "../domain/own-files.ts";
import { sha256Hex } from "../domain/revision.ts";
import type { PageFileIo } from "./include.ts";

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlNode = DefaultTreeAdapterTypes.ChildNode;

/** The marker a deferred `src` carries instead of its attribute: `<path>@<version>`; the kernel fetches the file through the shell and sets a `blob:` URL. 02 R4.25a */
export const DEFERRED_FILE_ATTRIBUTE = "data-thread-page-file";
/** The same for a `<video poster>`. 02 R4.25a */
export const DEFERRED_POSTER_ATTRIBUTE = "data-thread-page-poster";

export type CarrySkipReason = "missing" | "too-large" | "budget" | "unsafe-path" | "symlink";

export interface CarriedOutcome {
  readonly html: string;
  readonly resolved: readonly { path: string; bytes: number }[];
  readonly skipped: readonly { path: string; reason: CarrySkipReason }[];
  /** Own media too large to carry, marked for the shell to fetch. 02 R4.25a */
  readonly deferred: readonly { path: string; bytes: number }[];
}

/** `Content-Type` by extension for the page's own files. 01 R1.12 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = Object.freeze({
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  heic: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  opus: "audio/opus",
  vtt: "text/vtt; charset=utf-8",
  srt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  wasm: "application/wasm",
  zip: "application/zip",
});

export function contentTypeFor(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

function mimeOnly(contentType: string): string {
  return contentType.split(";")[0]!.trim();
}

/** The file's version, so a changed file changes the document that defers it. 02 R4.25a */
export function fileVersion(stat: { size: number; mtimeMs: number }): string {
  return sha256Hex(`${stat.size}:${stat.mtimeMs}`);
}

function attributeOf(element: HtmlElement, name: string): string | null {
  return element.attrs.find((attr) => attr.name === name)?.value ?? null;
}

function setAttribute(element: HtmlElement, name: string, value: string): void {
  const existing = element.attrs.find((attr) => attr.name === name);
  if (existing) existing.value = value;
  else element.attrs.push({ name, value });
}

function removeAttribute(element: HtmlElement, name: string): void {
  element.attrs = element.attrs.filter((attr) => attr.name !== name);
}

function relOf(element: HtmlElement): string[] {
  return (attributeOf(element, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

const LINK_RELS = new Set(["stylesheet", "icon", "shortcut", "apple-touch-icon", "preload", "modulepreload", "manifest"]);

/** Which attribute of which element names an own file; `defer` marks the ones the shell may fetch when too large. 02 R4.25, R4.25a */
const CARRIERS: ReadonlyArray<{ tag: string; attr: string; defer: boolean; test?: (element: HtmlElement) => boolean }> = [
  { tag: "link", attr: "href", defer: false, test: (element) => relOf(element).some((rel) => LINK_RELS.has(rel)) },
  { tag: "script", attr: "src", defer: false },
  { tag: "img", attr: "src", defer: true },
  { tag: "source", attr: "src", defer: true },
  { tag: "audio", attr: "src", defer: true },
  { tag: "video", attr: "src", defer: true },
  { tag: "video", attr: "poster", defer: true },
  { tag: "track", attr: "src", defer: true },
];

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function dataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Carries the document's own files into it as `data:` URLs — stylesheets
 * (their `url()` references too, to `inlineCssDepth`), scripts, images,
 * fonts, `srcset` candidates — each within `inlineFileBytes`, all within
 * `inlineTotalBytes`. Media over the bound is marked for the shell to fetch
 * (02 R4.25a) when it is within the shell's own limit; anything else that
 * cannot be carried stays as written and is reported. `documentDir` is the
 * document's directory within the root ("" or ending in "/"). 05 R-S7
 */
export async function carryOwnFiles(html: string, io: PageFileIo, documentDir = ""): Promise<CarriedOutcome> {
  const document = parseHtml(html);
  const resolved: { path: string; bytes: number }[] = [];
  const skipped: { path: string; reason: CarrySkipReason }[] = [];
  const deferred: { path: string; bytes: number }[] = [];
  const deferredPaths = new Set<string>();
  const seen = new Map<string, string | null>();
  const oversize = new Map<string, { bytes: number; version: string; reason: CarrySkipReason }>();
  const undeferred = new Set<string>();
  let budget = LIMITS.inlineTotalBytes;

  async function urlFor(path: string, depth: number, deferrable: boolean): Promise<string | null> {
    let answer = seen.get(path);
    if (answer === undefined) {
      answer = await load(path, depth);
      seen.set(path, answer);
    }
    if (answer === null && !deferrable && oversize.has(path)) undeferred.add(path);
    return answer;
  }

  async function load(path: string, depth: number): Promise<string | null> {
    const stat = await io.stat(path);
    if (stat === null || stat.kind === "dir") {
      skipped.push({ path, reason: "missing" });
      return null;
    }
    if (stat.kind === "symlink") {
      skipped.push({ path, reason: "symlink" });
      return null;
    }
    const reason: CarrySkipReason | null = stat.size > LIMITS.inlineFileBytes ? "too-large" : stat.size > budget ? "budget" : null;
    if (reason) {
      if (stat.size <= shellFetchLimit(path)) oversize.set(path, { bytes: stat.size, version: fileVersion(stat), reason });
      else skipped.push({ path, reason });
      return null;
    }
    const bytes = await io.read(path);
    if (bytes === null) {
      skipped.push({ path, reason: "missing" });
      return null;
    }
    if (bytes.byteLength > LIMITS.inlineFileBytes || bytes.byteLength > budget) {
      skipped.push({ path, reason: bytes.byteLength > LIMITS.inlineFileBytes ? "too-large" : "budget" });
      return null;
    }
    budget -= bytes.byteLength;
    const contentType = mimeOnly(contentTypeFor(path));
    const carried = contentType === "text/css" && depth < LIMITS.inlineCssDepth ? Buffer.from(await resolveCss(Buffer.from(bytes).toString("utf8"), path, depth), "utf8") : bytes;
    resolved.push({ path, bytes: bytes.byteLength });
    return dataUrl(carried, contentType);
  }

  /** A stylesheet carried as a `data:` URL has no base; its own relative `url()` references are carried first. */
  async function resolveCss(css: string, from: string, depth: number): Promise<string> {
    const cssDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
    const replacements = new Map<string, string>();
    for (const match of css.matchAll(CSS_URL)) {
      const reference = match[2] ?? "";
      if (replacements.has(reference)) continue;
      const path = ownFileReference(reference, cssDir);
      if (path === null) continue;
      const url = await urlFor(path, depth + 1, false);
      if (url) replacements.set(reference, url);
    }
    if (replacements.size === 0) return css;
    return css.replace(CSS_URL, (whole, quote: string, reference: string) => {
      const url = replacements.get(reference);
      return url ? `url(${quote}${url}${quote})` : whole;
    });
  }

  const elements: HtmlElement[] = [];
  const walk = (node: { childNodes?: HtmlNode[] }): void => {
    for (const child of node.childNodes ?? []) {
      if (!defaultTreeAdapter.isElementNode(child)) continue;
      elements.push(child);
      walk(child);
      if (child.tagName === "template") walk(defaultTreeAdapter.getTemplateContent(child as DefaultTreeAdapterTypes.Template));
    }
  };
  walk(document);

  let changed = false;
  for (const element of elements) {
    for (const carrier of CARRIERS) {
      if (element.tagName !== carrier.tag || (carrier.test && !carrier.test(element))) continue;
      const reference = attributeOf(element, carrier.attr);
      if (reference === null) continue;
      const path = ownFileReference(reference, documentDir);
      if (path === null) continue;
      const url = await urlFor(path, 0, carrier.defer);
      if (url === null) {
        const large = oversize.get(path);
        if (!large || !carrier.defer) continue;
        removeAttribute(element, carrier.attr);
        setAttribute(element, carrier.attr === "poster" ? DEFERRED_POSTER_ATTRIBUTE : DEFERRED_FILE_ATTRIBUTE, `${path}@${large.version}`);
        if (!deferredPaths.has(path)) {
          deferredPaths.add(path);
          deferred.push({ path, bytes: large.bytes });
        }
        changed = true;
        continue;
      }
      setAttribute(element, carrier.attr, url);
      changed = true;
    }
    if (element.tagName === "img" || element.tagName === "source") {
      const srcset = attributeOf(element, "srcset");
      if (srcset !== null) {
        const rewritten = await resolveSrcset(srcset);
        if (rewritten !== null) {
          setAttribute(element, "srcset", rewritten);
          changed = true;
        }
      }
    }
  }

  async function resolveSrcset(srcset: string): Promise<string | null> {
    let changedSet = false;
    const out: string[] = [];
    for (const candidate of srcset.split(",").map((entry) => entry.trim()).filter(Boolean)) {
      const [reference, ...descriptor] = candidate.split(/\s+/);
      const path = reference ? ownFileReference(reference, documentDir) : null;
      const url = path ? await urlFor(path, 0, false) : null;
      if (!url) {
        out.push(candidate);
        continue;
      }
      changedSet = true;
      out.push([url, ...descriptor].join(" "));
    }
    return changedSet ? out.join(", ") : null;
  }

  // A large file referenced only where it cannot be deferred is reported as not carried. 02 R4.25a
  for (const [path, large] of oversize) {
    if (undeferred.has(path) || !deferredPaths.has(path)) skipped.push({ path, reason: large.reason });
  }
  return { html: changed ? serializeHtml(document) : html, resolved, skipped, deferred };
}
