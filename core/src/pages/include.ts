// `<link rel="thread-page-include">` expansion: parts rule, patterns (≤ 4 stars, linear matcher), order by code unit, depth/count/size bounds, left-as-written + report (01 R1.19–R1.26).
import { directoryOf, isPartPath } from "../domain/document-path.ts";
import { utf8Bytes } from "../domain/json/strict-json.ts";
import { LIMITS } from "../domain/limits.ts";
import { ownFileReference } from "../domain/own-files.ts";

/** The `rel` value of an include element. 01 R1.19 */
export const INCLUDE_REL = "thread-page-include";

/** What the page root looks like to assembly: three reads, each confined to the root by the provider. 06 R-P10 */
export interface PageFileIo {
  /** The file's bytes, or null when it does not exist. Throws `PageError` `unavailable` when the host is unreachable. */
  read(path: string): Promise<Uint8Array | null>;
  stat(path: string): Promise<{ size: number; mtimeMs: number; kind: "file" | "dir" | "symlink" } | null>;
  /** Direct children of a directory ("" is the root), symlinks not followed; null when the host cannot list. 06 R8.11a */
  list(directory: string): Promise<readonly { name: string; kind: "file" | "dir" | "symlink" }[] | null>;
}

export type IncludeSkipReason = "missing" | "too-large" | "budget" | "unsafe-path" | "not-a-part" | "too-deep" | "too-many" | "no-listing" | "symlink";

export interface IncludeOutcome {
  readonly html: string;
  readonly parts: readonly { path: string; bytes: number }[];
  readonly skipped: readonly { path: string; reason: IncludeSkipReason }[];
}

interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function applySplices(text: string, splices: readonly Splice[]): string {
  let out = text;
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) out = out.slice(0, splice.start) + splice.text + out.slice(splice.end);
  return out;
}

const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTRIBUTE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

interface FoundTag {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly attributes: { name: string; value: string | null; start: number; end: number }[];
}

/** A tolerant textual scan of start tags: R1.21 makes replacement textual, and a part need not be well-formed. */
function* tags(text: string): Generator<FoundTag> {
  for (const match of text.matchAll(TAG)) {
    const name = match[1]!.toLowerCase();
    const body = match[2] ?? "";
    const bodyStart = match.index + 1 + match[1]!.length;
    const attributes: FoundTag["attributes"] = [];
    for (const attribute of body.matchAll(ATTRIBUTE)) {
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? null;
      attributes.push({ name: attribute[1]!.toLowerCase(), value, start: bodyStart + attribute.index, end: bodyStart + attribute.index + attribute[0].length });
    }
    yield { name, start: match.index, end: match.index + match[0].length, attributes };
  }
}

function attributeOf(tag: FoundTag, name: string): string | null {
  return tag.attributes.find((attribute) => attribute.name === name)?.value ?? null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** `target` (root-relative) as written from `fromDir` ("" or ending in "/"). 01 R1.22 */
export function relativeFrom(fromDir: string, target: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const to = target.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...from.slice(common).map(() => ".."), ...to.slice(common).map((segment) => encodeURIComponent(segment))].join("/");
}

const REBASED = new Set(["src", "href", "poster"]);

function suffixOf(reference: string): string {
  const at = reference.trim().search(/[?#]/);
  return at < 0 ? "" : reference.trim().slice(at);
}

/**
 * Rewrites a part's relative `src`, `href`, `poster` and `srcset` references so
 * they name the same files from the including document's directory. Only
 * those attribute values change. 01 R1.22
 */
export function rebasePart(text: string, partDir: string, documentDir: string): string {
  if (partDir === documentDir) return text;
  const splices: Splice[] = [];
  const rebased = (reference: string): string | null => {
    const target = ownFileReference(reference, partDir);
    if (target === null) return null;
    const next = relativeFrom(documentDir, target) + suffixOf(reference);
    return next === reference.trim() ? null : next;
  };
  for (const tag of tags(text)) {
    for (const attribute of tag.attributes) {
      if (attribute.value === null) continue;
      if (REBASED.has(attribute.name)) {
        const next = rebased(attribute.value);
        if (next !== null) splices.push({ start: attribute.start, end: attribute.end, text: `${attribute.name}="${escapeAttribute(next)}"` });
      } else if (attribute.name === "srcset") {
        let changed = false;
        const candidates = attribute.value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((candidate) => {
            const [reference, ...descriptor] = candidate.split(/\s+/);
            const next = reference ? rebased(reference) : null;
            if (next === null) return candidate;
            changed = true;
            return [next, ...descriptor].join(" ");
          });
        if (changed) splices.push({ start: attribute.start, end: attribute.end, text: `srcset="${escapeAttribute(candidates.join(", "))}"` });
      }
    }
  }
  return splices.length === 0 ? text : applySplices(text, splices);
}

/**
 * `*` within one segment matches any run of characters; matched by a
 * two-pointer scan in time linear in the name, never by a backtracking
 * regular expression. Names beginning with `.` never match. 01 R1.19
 */
export function globMatches(pattern: string, name: string): boolean {
  if (name.startsWith(".") || name.includes("/")) return false;
  const pieces = pattern.split("*");
  if (pieces.length === 1) return pattern === name;
  const first = pieces[0]!;
  const last = pieces[pieces.length - 1]!;
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

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Expands every include of a document: the element is replaced by the part's
 * text (every matching part's, in name order), recursively to `includeDepth`,
 * within the count, size and total bounds. An include that cannot be honoured
 * stays as written and is reported, bounded. `documentDir` is the document's
 * directory within the root ("" or ending in "/"). 01 R1.19–R1.26
 */
export async function expandIncludes(html: string, io: PageFileIo, documentDir = ""): Promise<IncludeOutcome> {
  const parts: { path: string; bytes: number }[] = [];
  const reported: { path: string; reason: IncludeSkipReason }[] = [];
  if (!html.toLowerCase().includes(INCLUDE_REL)) return { html, parts, skipped: reported };
  const report = (path: string, reason: IncludeSkipReason): void => {
    if (reported.length < LIMITS.includeReports) reported.push({ path: path.slice(0, 200), reason });
  };
  let budget = LIMITS.entryDocumentBytes - utf8Bytes(html);
  let elements = 0;
  let full = false;
  const listings = new Map<string, Promise<readonly { name: string; kind: string }[] | null>>();
  // `directory` is the `directoryOf` form ("" or ending in "/"); the provider takes a root-relative path (06 R-P10).
  const listed = (directory: string) => {
    let known = listings.get(directory);
    if (!known) {
      known = io.list(directory.replace(/\/$/, ""));
      listings.set(directory, known);
    }
    return known;
  };

  /** The parts one `href` names, in order; null when the element stays as written. */
  async function resolveTargets(href: string, fromDir: string): Promise<string[] | null> {
    const path = ownFileReference(href, fromDir);
    if (path === null) {
      report(href, "unsafe-path");
      return null;
    }
    if (!path.includes("*")) {
      if (!isPartPath(path)) {
        report(path, "not-a-part");
        return null;
      }
      const stat = await io.stat(path);
      if (stat === null) {
        report(path, "missing");
        return null;
      }
      if (stat.kind !== "file") {
        report(path, stat.kind === "symlink" ? "symlink" : "missing");
        return null;
      }
      return [path];
    }
    const directory = directoryOf(path);
    const pattern = path.slice(directory.length);
    if (directory.includes("*") || pattern.split("*").length - 1 > LIMITS.includePatternStars) {
      report(path, "unsafe-path");
      return null;
    }
    const names = await listed(directory);
    if (names === null) {
      report(path, "no-listing");
      return null;
    }
    return names
      .filter((entry) => entry.kind === "file" && globMatches(pattern, entry.name) && isPartPath(directory + entry.name))
      .map((entry) => entry.name)
      .sort(byCodeUnit)
      .map((name) => directory + name);
  }

  async function loadPart(path: string, depth: number): Promise<string | null> {
    if (parts.length >= LIMITS.includeParts) {
      if (!full) report(path, "too-many");
      full = true;
      return null;
    }
    const stat = await io.stat(path);
    if (stat === null || stat.kind !== "file") {
      report(path, stat?.kind === "symlink" ? "symlink" : "missing");
      return null;
    }
    if (stat.size > LIMITS.includePartBytes) {
      report(path, "too-large");
      return null;
    }
    const bytes = await io.read(path);
    if (bytes === null) {
      report(path, "missing");
      return null;
    }
    if (bytes.byteLength > LIMITS.includePartBytes) {
      report(path, "too-large");
      return null;
    }
    if (bytes.byteLength > budget) {
      report(path, "budget");
      return null;
    }
    budget -= bytes.byteLength;
    parts.push({ path, bytes: bytes.byteLength });
    const text = stripBom(Buffer.from(bytes).toString("utf8"));
    return expand(text, directoryOf(path), depth);
  }

  async function expand(text: string, dir: string, depth: number): Promise<string> {
    if (!text.toLowerCase().includes(INCLUDE_REL)) return text;
    const splices: Splice[] = [];
    for (const tag of tags(text)) {
      if (tag.name !== "link") continue;
      const rel = (attributeOf(tag, "rel") ?? "").toLowerCase().split(/\s+/);
      const href = attributeOf(tag, "href");
      if (!rel.includes(INCLUDE_REL) || href === null) continue;
      if (full) break;
      elements += 1;
      if (elements > LIMITS.includeElements) {
        report(href, "too-many");
        full = true;
        break;
      }
      if (depth >= LIMITS.includeDepth) {
        report(href, "too-deep");
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
      // A named part that could not be loaded stays visible as written; a pattern yields what loaded.
      if (!complete && !href.includes("*")) continue;
      splices.push({ start: tag.start, end: tag.end, text: pieces.join("\n") });
    }
    return splices.length === 0 ? text : applySplices(text, splices);
  }

  const assembled = await expand(html, documentDir, 0);
  return { html: assembled, parts, skipped: reported };
}
