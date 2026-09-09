import { defaultTreeAdapter, parse as parseHtml, serialize as serializeHtml, type DefaultTreeAdapterTypes } from "parse5";
import { LIMITS } from "../domain/limits.ts";
import { isSafeRelativePath } from "./layout.ts";

/**
 * Resolving a page's own files into its entry document. spec R1.2, R1.3, R4.25–R4.27
 *
 * A page frame is sandboxed, so it has an opaque origin, so every subresource
 * it requests is cross-site and carries no host credential. A bb served over
 * loopback needs none and the file arrives; a bb reached through an
 * authenticated origin refuses it. The page renders, its own stylesheet and
 * data do not, nothing errors, and the author cannot see any of this from the
 * machine that wrote the page.
 *
 * So the entry document — the one artifact whose request is issued by trusted
 * chrome and therefore always authorised — carries the page's own files with
 * it. Each relative reference is rewritten to a `data:` URL, which the
 * document's CSP already permits. Rewriting the attribute rather than moving
 * the bytes into the element keeps every other attribute meaningful (`defer`,
 * `type="module"`, `media`, `loading`) and avoids the escaping traps that
 * inlining raw text into `<script>` and `<style>` carries.
 *
 * THIS IS A WORKAROUND AND IT SHOULD BE DELETED. It exists only because the
 * host cannot authorise a sandboxed document's own subresource requests. Once
 * it can — see docs/B1-OWN-FILES.md — a page's files should be served as
 * files again, and this module and its wiring should go.
 */

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlNode = DefaultTreeAdapterTypes.ChildNode;

export interface OwnFile {
  readonly bytes: Uint8Array;
  readonly mimeType?: string | undefined;
}

export type OwnFileReader = (relativePath: string) => Promise<OwnFile | null>;

export interface ResolvedFile {
  readonly path: string;
  readonly bytes: number;
}

export interface SkippedFile {
  readonly path: string;
  readonly reason: "missing" | "too-large" | "budget" | "unsafe-path";
}

export interface ResolveOutcome {
  readonly html: string;
  readonly resolved: readonly ResolvedFile[];
  readonly skipped: readonly SkippedFile[];
}

/** Attributes that may name one of the page's own files, per element. */
const CARRIERS: ReadonlyArray<{ tag: string; attr: string; test?: (element: HtmlElement) => boolean }> = [
  { tag: "link", attr: "href", test: (element) => relOf(element).some((rel) => rel === "stylesheet" || rel === "icon" || rel === "shortcut" || rel === "apple-touch-icon" || rel === "preload") },
  { tag: "script", attr: "src" },
  { tag: "img", attr: "src" },
  { tag: "source", attr: "src" },
  { tag: "audio", attr: "src" },
  { tag: "video", attr: "src" },
  { tag: "video", attr: "poster" },
  { tag: "track", attr: "src" },
];

function relOf(element: HtmlElement): string[] {
  const rel = attributeOf(element, "rel") ?? "";
  return rel.toLowerCase().split(/\s+/).filter(Boolean);
}

function attributeOf(element: HtmlElement, name: string): string | null {
  return element.attrs.find((attr) => attr.name === name)?.value ?? null;
}

function setAttribute(element: HtmlElement, name: string, value: string): void {
  const existing = element.attrs.find((attr) => attr.name === name);
  if (existing) existing.value = value;
  else element.attrs.push({ name, value });
}

/**
 * True for a reference that names a file inside this page's own root. Anything
 * absolute, protocol-relative, already a URL, or a bare fragment belongs to
 * somebody else and is left exactly as the author wrote it.
 */
export function isOwnFileReference(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}

/** The reference's path, with any query or fragment removed and percent-escapes resolved. */
function pathOf(reference: string): string | null {
  const withoutHash = reference.trim().split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  if (withoutQuery.length === 0) return null;
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function mimeFor(path: string, declared: string | undefined): string {
  if (declared && declared.length > 0) return declared;
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

const EXTENSION_TYPES: Readonly<Record<string, string>> = Object.freeze({
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  vtt: "text/vtt",
});

function dataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** `url(...)` references inside an inlined stylesheet, which would otherwise resolve nowhere. */
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Rewrites every reference to one of the page's own files into a `data:` URL,
 * one level deep inside stylesheets as well. Anything that cannot be resolved
 * is left untouched and reported, so the page degrades to exactly the
 * behaviour it has without this pass rather than to a broken document.
 */
export async function resolveOwnFiles(html: string, read: OwnFileReader): Promise<ResolveOutcome> {
  const document = parseHtml(html);
  const resolved: ResolvedFile[] = [];
  const skipped: SkippedFile[] = [];
  const seen = new Map<string, string | null>();
  let budget = LIMITS.inlineTotalBytes;

  async function urlFor(path: string, depth: number): Promise<string | null> {
    const memo = seen.get(path);
    if (memo !== undefined) return memo;
    const answer = await load(path, depth);
    seen.set(path, answer);
    return answer;
  }

  async function load(path: string, depth: number): Promise<string | null> {
    if (!isSafeRelativePath(path)) {
      skipped.push({ path, reason: "unsafe-path" });
      return null;
    }
    const file = await read(path).catch(() => null);
    if (!file) {
      skipped.push({ path, reason: "missing" });
      return null;
    }
    if (file.bytes.byteLength > LIMITS.inlineFileBytes) {
      skipped.push({ path, reason: "too-large" });
      return null;
    }
    if (file.bytes.byteLength > budget) {
      skipped.push({ path, reason: "budget" });
      return null;
    }
    budget -= file.bytes.byteLength;
    const mimeType = mimeFor(path, file.mimeType);
    const bytes = mimeType === "text/css" && depth < LIMITS.inlineCssDepth ? Buffer.from(await resolveCss(Buffer.from(file.bytes).toString("utf8"), path, depth), "utf8") : file.bytes;
    resolved.push({ path, bytes: file.bytes.byteLength });
    return dataUrl(bytes, mimeType);
  }

  /** A stylesheet becomes a `data:` URL, so its own relative `url()`s must be resolved first. */
  async function resolveCss(css: string, from: string, depth: number): Promise<string> {
    const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
    const replacements = new Map<string, string>();
    for (const match of css.matchAll(CSS_URL)) {
      const reference = match[2] ?? "";
      if (!isOwnFileReference(reference) || replacements.has(reference)) continue;
      const path = pathOf(reference);
      if (!path) continue;
      const url = await urlFor(normalise(base + path), depth + 1);
      if (url) replacements.set(reference, url);
    }
    if (replacements.size === 0) return css;
    return css.replace(CSS_URL, (whole, quote: string, reference: string) => {
      const url = replacements.get(reference);
      return url ? `url(${quote}${url}${quote})` : whole;
    });
  }

  const elements: HtmlElement[] = [];
  const walk = (node: HtmlNode | DefaultTreeAdapterTypes.Document): void => {
    if (defaultTreeAdapter.isElementNode(node as HtmlNode)) elements.push(node as HtmlElement);
    for (const child of (node as { childNodes?: HtmlNode[] }).childNodes ?? []) walk(child);
  };
  walk(document);

  let changed = false;
  for (const element of elements) {
    for (const carrier of CARRIERS) {
      if (element.tagName !== carrier.tag) continue;
      if (carrier.test && !carrier.test(element)) continue;
      const reference = attributeOf(element, carrier.attr);
      if (reference === null || !isOwnFileReference(reference)) continue;
      const path = pathOf(reference);
      if (!path) continue;
      const url = await urlFor(normalise(path), 0);
      if (!url) continue;
      setAttribute(element, carrier.attr, url);
      changed = true;
    }
    // srcset carries several candidates; all or nothing keeps the parsing simple.
    if (element.tagName === "img" || element.tagName === "source") {
      const srcset = attributeOf(element, "srcset");
      if (srcset !== null) {
        const rewritten = await resolveSrcset(srcset, urlFor);
        if (rewritten !== null) {
          setAttribute(element, "srcset", rewritten);
          changed = true;
        }
      }
    }
  }

  return { html: changed ? serializeHtml(document) : html, resolved, skipped };
}

async function resolveSrcset(srcset: string, urlFor: (path: string, depth: number) => Promise<string | null>): Promise<string | null> {
  const candidates = srcset.split(",").map((entry) => entry.trim()).filter(Boolean);
  const rewritten: string[] = [];
  let changed = false;
  for (const candidate of candidates) {
    const [reference, ...descriptor] = candidate.split(/\s+/);
    if (!reference || !isOwnFileReference(reference)) {
      rewritten.push(candidate);
      continue;
    }
    const path = pathOf(reference);
    const url = path ? await urlFor(normalise(path), 0) : null;
    if (!url) {
      rewritten.push(candidate);
      continue;
    }
    changed = true;
    rewritten.push([url, ...descriptor].join(" "));
  }
  return changed ? rewritten.join(", ") : null;
}

/** Collapses `a/./b` and `a/b/../c`; a path that climbs out fails `isSafeRelativePath` later. */
function normalise(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}
