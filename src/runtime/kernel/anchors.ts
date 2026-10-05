import { documentFragment, isDocumentPath } from "../../domain/document-path.ts";
import { downloadName, isOwnFilePath } from "../../domain/own-files.ts";

/**
 * Authored links work. spec R4.15, R4.15a, R4.15b, DECISIONS D33, D34
 *
 * A link to another site is routed through `navigation.openExternal`: the
 * reader confirms in trusted chrome and the shell opens the site as itself.
 * The page's own popups stay sandboxed (option D), so this is how a site gets
 * its cookies — and why it asks: no-dialog links wait until the host serves
 * no file of a page unsandboxed on its origin (spec R8.33, X37).
 *
 * The page's own files: a link to another document of the page asks the shell
 * to open it in place, and a link to any other file asks the shell to download
 * it (`download`) or open it in a new tab, from its own origin with the
 * reader's credential (D33). `mailto:`/`tel:` open a popup of the reader's
 * handler, never in place of the page, and a download of a `blob:`/`data:` URL
 * the page built is the browser's own.
 */
export type AnchorDecision =
  | { kind: "default" }
  | { kind: "document"; path: string; fragment: string }
  /** A link to a place in this document: `href="#…"`. */
  | { kind: "fragment"; fragment: string }
  | { kind: "file"; path: string; download: boolean; name: string | null }
  | { kind: "external"; url: string; label: string }
  | { kind: "handler"; url: string }
  | { kind: "block" };

/** Schemes handed to the reader's own handlers: a mail client, a phone, a message app. D34 */
const HANDLER_SCHEMES: ReadonlySet<string> = new Set(["mailto:", "tel:", "sms:"]);
/** Targets that would replace this document rather than open a window. */
const IN_PLACE_TARGETS: ReadonlySet<string> = new Set(["", "_self", "_parent", "_top"]);

/**
 * `siteBase` resolves the link (the document's own directory); `siteRoot` is
 * where the page's files start, so a document path is relative to the root.
 * `embedded`: the page is shown inside another page, whose shell is not its
 * own, so its own files cannot be fetched for it (R4.50).
 */
export function decideAnchor(anchor: HTMLAnchorElement, documentUrl: string, siteBase: string | null, siteRoot: string | null = siteBase, embedded = false): AnchorDecision {
  const raw = anchor.getAttribute("href");
  if (raw === null) return { kind: "default" };
  // Resolved against the page's <base>, `#…` would leave the document for the page's folder:
  // it is this document's own fragment. spec R1.12f
  if (raw.startsWith("#")) return { kind: "fragment", fragment: raw.trim() };
  let target: URL;
  try {
    target = new URL(raw, siteBase ?? documentUrl);
  } catch {
    return { kind: "block" };
  }
  const download = anchor.hasAttribute("download");
  const inPlace = IN_PLACE_TARGETS.has((anchor.getAttribute("target") ?? "").trim().toLowerCase());
  // A file the page built: saved with `download`, or shown in a window of its own; never in place of the page.
  if (target.protocol === "blob:" || target.protocol === "data:") return download || (!inPlace && target.protocol === "blob:") ? { kind: "default" } : { kind: "block" };
  // Handed to the reader's handler as a popup, so a browser with no handler shows its error there, not in place of the page.
  if (HANDLER_SCHEMES.has(target.protocol)) return inPlace ? { kind: "handler", url: target.href } : { kind: "default" };
  if (target.protocol !== "http:" && target.protocol !== "https:") return { kind: "block" };
  // A relative reference that climbs out of the page root names no file of this page: refused (R1.4, R1.5).
  if (siteRoot && isRelativeReference(raw) && !target.href.startsWith(siteRoot)) return { kind: "block" };
  if (siteRoot && target.href.startsWith(siteRoot)) {
    const path = pathWithin(target, siteRoot);
    if (path === null || !isOwnFilePath(path)) return { kind: "block" };
    if (isDocumentPath(path) && !download) return { kind: "document", path, fragment: documentFragment(target.hash) };
    if (embedded) return { kind: "block" };
    return { kind: "file", path, download, name: download ? downloadName(anchor.getAttribute("download")) : null };
  }
  // Another site: confirmed, then opened by the shell as itself, whatever the target. The page's own popups
  // stay sandboxed, so this is the one way to the site with its cookies. R4.15, D34 (option D)
  return { kind: "external", url: target.href, label: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) };
}

function isRelativeReference(raw: string): boolean {
  const trimmed = raw.trim();
  return !trimmed.startsWith("/") && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
}

function pathWithin(target: URL, siteRoot: string): string | null {
  const rootPath = new URL(siteRoot).pathname;
  if (!target.pathname.startsWith(rootPath)) return null;
  try {
    return decodeURIComponent(target.pathname.slice(rootPath.length));
  } catch {
    return null;
  }
}

export interface AnchorHandlers {
  /** `fragment`: the link's `#fragment`, or "". */
  document(path: string, fragment: string): void;
  /** A place in this document: `#…`. */
  fragment(fragment: string): void;
  file(path: string, download: boolean, name: string | null): void;
  external(url: string, label: string): void;
  /** A `mailto:`, `tel:` or `sms:` link with no target of its own: a popup of the reader's handler. */
  handler(url: string): void;
}

export function installAnchorInterception(doc: Document, handlers: AnchorHandlers, siteRoot: string | null = null, embedded = false): void {
  doc.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const base = doc.querySelector("base")?.getAttribute("href") ?? null;
      const siteBase = base ? new URL(base, doc.baseURI).href : null;
      const root = siteRoot ? new URL(siteRoot, doc.baseURI).href : siteBase;
      const decision = decideAnchor(anchor, doc.baseURI, siteBase, root, embedded);
      if (decision.kind === "default") return;
      event.preventDefault();
      if (decision.kind === "document") handlers.document(decision.path, decision.fragment);
      else if (decision.kind === "fragment") handlers.fragment(decision.fragment);
      else if (decision.kind === "file") handlers.file(decision.path, decision.download, decision.name);
      else if (decision.kind === "external") handlers.external(decision.url, decision.label);
      else if (decision.kind === "handler") handlers.handler(decision.url);
    },
    true,
  );
}
