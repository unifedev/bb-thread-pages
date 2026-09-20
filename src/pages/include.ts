import { defaultTreeAdapter, parse as parseHtml, parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { directoryOf, isPartPath } from "../domain/document-path.ts";
import { LIMITS } from "../domain/limits.ts";
import { isOwnFileReference, normalisePath, pathOfReference, type OwnFileReader } from "./inline.ts";
import { isSafeRelativePath } from "./layout.ts";

/**
 * Serve-time includes: a document assembled from parts. spec R1.19–R1.26, DECISIONS D32
 *
 * `<link rel="thread-page-include" href="_parts/*.html">` is replaced, in
 * place, by the text of the file it names, or of every file a pattern matches,
 * in name order. Replacement is textual — the reader's browser parses the
 * assembled document once, as if it had been written as one file — so a part
 * may hold table rows, a script, or half of a list. Only a part (a path with a
 * `_` segment) can be included, and a part is never a document of the page.
 *
 * A part's own relative references are rewritten to the including document's
 * directory before it is spliced, so the pass that carries a page's own files
 * (pages/inline.ts) then finds them under one budget.
 *
 * Anything that cannot be honoured is left exactly as written and reported.
 */
export const INCLUDE_REL = "thread-page-include";

export type IncludeSkipReason = "missing" | "too-large" | "budget" | "unsafe-path" | "not-a-part" | "too-deep" | "too-many" | "no-listing";

export interface IncludeIo {
  read: OwnFileReader;
  /** Names of the regular files directly inside a directory of the page root ("" is the root); null when the host cannot list. */
  list(directory: string): Promise<readonly string[] | null>;
}

export interface IncludeOutcome {
  readonly html: string;
  readonly parts: readonly { path: string; bytes: number }[];
  readonly skipped: readonly { path: string; reason: IncludeSkipReason }[];
}

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
type Tree = DefaultTreeAdapterTypes.Document | DefaultTreeAdapterTypes.DocumentFragment;

function elementsOf(tree: Tree): HtmlElement[] {
  const found: HtmlElement[] = [];
  const walk = (node: { childNodes?: HtmlNode[] }): void => {
    for (const child of node.childNodes ?? []) {
      if (!defaultTreeAdapter.isElementNode(child)) continue;
      found.push(child);
      walk(child);
      // A template's children live in its content fragment.
      if (child.tagName === "template") walk(defaultTreeAdapter.getTemplateContent(child as DefaultTreeAdapterTypes.Template));
    }
  };
  walk(tree);
  return found;
}

function attributeOf(element: HtmlElement, name: string): string | null {
  return element.attrs.find((attr) => attr.name === name)?.value ?? null;
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function applySplices(text: string, splices: Splice[]): string {
  let out = text;
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) out = out.slice(0, splice.start) + splice.text + out.slice(splice.end);
  return out;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** `target` (root-relative) as seen from `fromDir` ("" or ending in "/"). */
export function relativeFrom(fromDir: string, target: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const to = target.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].map((segment) => (segment === ".." ? segment : encodeURIComponent(segment))).join("/");
}

const REBASED_ATTRIBUTES = ["src", "href", "poster"] as const;

/**
 * Rewrites a part's relative references so they mean the same file from the
 * including document's directory. Only the attribute values change; every
 * other byte of the part is kept. spec R1.22
 */
export function rebasePart(html: string, partDir: string, documentDir: string): string {
  if (partDir === documentDir) return html;
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const splices: Splice[] = [];

  function rebased(reference: string): string | null {
    if (!isOwnFileReference(reference)) return null;
    const path = pathOfReference(reference);
    if (!path) return null;
    const target = normalisePath(partDir + path);
    if (!isSafeRelativePath(target)) return null;
    const trimmed = reference.trim();
    const suffixAt = trimmed.search(/[?#]/);
    return relativeFrom(documentDir, target) + (suffixAt >= 0 ? trimmed.slice(suffixAt) : "");
  }

  for (const element of elementsOf(fragment)) {
    const locations = element.sourceCodeLocation?.attrs;
    if (!locations) continue;
    for (const name of REBASED_ATTRIBUTES) {
      const value = attributeOf(element, name);
      const at = locations[name];
      if (value === null || !at) continue;
      const next = rebased(value);
      if (next !== null && next !== value.trim()) splices.push({ start: at.startOffset, end: at.endOffset, text: `${name}="${escapeAttribute(next)}"` });
    }
    const srcset = attributeOf(element, "srcset");
    const at = locations.srcset;
    if (srcset !== null && at) {
      let changed = false;
      const candidates = srcset.split(",").map((entry) => entry.trim()).filter(Boolean).map((candidate) => {
        const [reference, ...descriptor] = candidate.split(/\s+/);
        const next = reference ? rebased(reference) : null;
        if (next === null) return candidate;
        changed = true;
        return [next, ...descriptor].join(" ");
      });
      if (changed) splices.push({ start: at.startOffset, end: at.endOffset, text: `srcset="${escapeAttribute(candidates.join(", "))}"` });
    }
  }
  return splices.length === 0 ? html : applySplices(html, splices);
}

/** Stars a pattern may hold; more is refused rather than matched. */
const MAX_STARS = 4;

/**
 * `*` within the last segment; everything else is literal. Matched by
 * scanning, never by a regular expression: a pattern is page-authored, and a
 * backtracking matcher can be made to take minutes on one file name.
 */
export function globMatches(pattern: string, name: string): boolean {
  if (name.startsWith(".") || name.includes("/")) return false;
  const pieces = pattern.split("*");
  if (pieces.length === 1) return pattern === name;
  const first = pieces[0] as string;
  const last = pieces[pieces.length - 1] as string;
  if (name.length < first.length + last.length || !name.startsWith(first) || !name.endsWith(last)) return false;
  let at = first.length;
  const end = name.length - last.length;
  for (const piece of pieces.slice(1, -1)) {
    const found = name.indexOf(piece, at);
    if (found < 0 || found + piece.length > end) return false;
    at = found + piece.length;
  }
  return true;
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Expands every include in `html`. `documentDir` is the served document's
 * directory within the page root ("" or ending in "/").
 */
export async function expandIncludes(html: string, io: IncludeIo, documentDir = ""): Promise<IncludeOutcome> {
  const parts: { path: string; bytes: number }[] = [];
  const reported: { path: string; reason: IncludeSkipReason }[] = [];
  // What is reported is bounded like everything else a page can make the host do.
  const skipped = {
    push(entry: { path: string; reason: IncludeSkipReason }): void {
      if (reported.length < LIMITS.includeReports) reported.push(entry);
    },
  };
  // Cheap exit: most documents include nothing.
  if (!html.includes(INCLUDE_REL)) return { html, parts, skipped: reported };
  let budget = LIMITS.entryDocumentBytes - Buffer.byteLength(html, "utf8");
  /** Include elements honoured so far, and directories already listed, in this one assembly. */
  let elements = 0;
  let full = false;
  const listings = new Map<string, Promise<readonly string[] | null>>();
  const listed = (directory: string): Promise<readonly string[] | null> => {
    let known = listings.get(directory);
    if (!known) {
      known = io.list(directory).catch(() => null);
      listings.set(directory, known);
    }
    return known;
  };

  /** The files one `href` names, in order; null when it must be left as written. */
  async function resolveTargets(reference: string, fromDir: string): Promise<string[] | null> {
    if (!isOwnFileReference(reference)) {
      skipped.push({ path: reference.slice(0, 200), reason: "unsafe-path" });
      return null;
    }
    const raw = pathOfReference(reference);
    const path = raw ? normalisePath(fromDir + raw) : "";
    if (!isSafeRelativePath(path)) {
      skipped.push({ path: (raw ?? reference).slice(0, 200), reason: "unsafe-path" });
      return null;
    }
    if (!path.includes("*")) {
      if (isPartPath(path)) return [path];
      skipped.push({ path, reason: "not-a-part" });
      return null;
    }
    const directory = directoryOf(path);
    const pattern = path.slice(directory.length);
    if (directory.includes("*")) {
      skipped.push({ path, reason: "unsafe-path" });
      return null;
    }
    if (pattern.split("*").length - 1 > MAX_STARS) {
      skipped.push({ path, reason: "unsafe-path" });
      return null;
    }
    const names = await listed(directory);
    if (names === null) {
      skipped.push({ path, reason: "no-listing" });
      return null;
    }
    return names.filter((name) => globMatches(pattern, name) && isPartPath(directory + name)).sort(byCodeUnit).map((name) => directory + name);
  }

  async function loadPart(path: string, depth: number): Promise<string | null> {
    if (parts.length >= LIMITS.includeParts) {
      // Said once: past the cap nothing more is listed, read or reported.
      if (!full) skipped.push({ path, reason: "too-many" });
      full = true;
      return null;
    }
    const file = await io.read(path).catch(() => null);
    if (!file) {
      skipped.push({ path, reason: "missing" });
      return null;
    }
    if (file.bytes.byteLength > LIMITS.includePartBytes) {
      skipped.push({ path, reason: "too-large" });
      return null;
    }
    if (file.bytes.byteLength > budget) {
      skipped.push({ path, reason: "budget" });
      return null;
    }
    budget -= file.bytes.byteLength;
    parts.push({ path, bytes: file.bytes.byteLength });
    const text = Buffer.from(file.bytes).toString("utf8");
    return expand(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, directoryOf(path), depth, true);
  }

  async function expand(text: string, dir: string, depth: number, fragment: boolean): Promise<string> {
    if (!text.includes(INCLUDE_REL)) return text;
    const tree: Tree = fragment ? parseFragment(text, { sourceCodeLocationInfo: true }) : parseHtml(text, { sourceCodeLocationInfo: true });
    const splices: Splice[] = [];
    for (const element of elementsOf(tree)) {
      if (element.tagName !== "link") continue;
      const rel = (attributeOf(element, "rel") ?? "").toLowerCase().split(/\s+/);
      const href = attributeOf(element, "href");
      const at = element.sourceCodeLocation;
      if (!rel.includes(INCLUDE_REL) || href === null || !at) continue;
      if (full) break;
      elements += 1;
      if (elements > LIMITS.includeElements) {
        skipped.push({ path: href.slice(0, 200), reason: "too-many" });
        full = true;
        break;
      }
      if (depth >= LIMITS.includeDepth) {
        skipped.push({ path: href.slice(0, 200), reason: "too-deep" });
        continue;
      }
      const targets = await resolveTargets(href, dir);
      if (targets === null) continue;
      const pieces: string[] = [];
      let complete = true;
      for (const target of targets) {
        if (full) {
          complete = false;
          break;
        }
        const part = await loadPart(target, depth + 1);
        if (part === null) {
          complete = false;
          continue;
        }
        pieces.push(rebasePart(part, directoryOf(target), dir));
      }
      // A single named part that could not be loaded stays visible as written;
      // a pattern yields whatever could be loaded, which may be nothing.
      if (!complete && !href.includes("*")) continue;
      splices.push({ start: at.startOffset, end: at.endOffset, text: pieces.join("\n") });
    }
    return splices.length === 0 ? text : applySplices(text, splices);
  }

  const assembled = await expand(html, documentDir, 0, false);
  return { html: assembled, parts, skipped: reported };
}
