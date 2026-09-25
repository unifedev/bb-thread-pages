import { isDocumentPath } from "../../domain/document-path.ts";
import { downloadName, isOwnFilePath } from "../../domain/own-files.ts";

/**
 * Authored links work. spec R4.15, R4.15a, R4.15b, DECISIONS D33, D34
 *
 * The page frame may open popups that escape the sandbox, so a link to
 * another site needs no help: it opens in a new tab on the reader's click,
 * natively, with no confirmation. The kernel only makes sure it is a new tab —
 * a link with no target (or `_self`, `_parent`, `_top`) would otherwise
 * replace the page inside the frame. `mailto:` and `tel:` open the same way,
 * as a popup of the reader's handler (a browser with no handler would put its
 * error page in place of the page), and a download of a `blob:`/`data:` URL
 * the page built is the browser's own.
 *
 * What the browser cannot do from an opaque origin is the page's own files:
 * a request from the frame carries no credential, and `download` is ignored
 * across origins. So a link to another document of the page asks the shell to
 * open it in place, and a link to any other file of the page asks the shell
 * to download it (`download`) or open it in a new tab — the shell does both
 * from its own origin, which carries the reader's credential.
 */
export type AnchorDecision =
  | { kind: "default" }
  | { kind: "document"; path: string }
  | { kind: "file"; path: string; download: boolean; name: string | null }
  | { kind: "new-tab"; url: string }
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
  if (raw.startsWith("#")) return { kind: "default" };
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
  if (HANDLER_SCHEMES.has(target.protocol)) return inPlace ? { kind: "new-tab", url: target.href } : { kind: "default" };
  if (target.protocol !== "http:" && target.protocol !== "https:") return { kind: "block" };
  // A relative reference that climbs out of the page root names no file of this page: refused (R1.4, R1.5).
  if (siteRoot && isRelativeReference(raw) && !target.href.startsWith(siteRoot)) return { kind: "block" };
  if (siteRoot && target.href.startsWith(siteRoot)) {
    const path = pathWithin(target, siteRoot);
    if (path === null || !isOwnFilePath(path)) return { kind: "block" };
    if (isDocumentPath(path) && !download) return { kind: "document", path };
    if (embedded) return { kind: "block" };
    return { kind: "file", path, download, name: download ? downloadName(anchor.getAttribute("download")) : null };
  }
  return inPlace ? { kind: "new-tab", url: target.href } : { kind: "default" };
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
  document(path: string): void;
  file(path: string, download: boolean, name: string | null): void;
  newTab(url: string): void;
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
      // A modified click on a link to another site keeps the browser's meaning (a background tab, a window).
      if (decision.kind === "new-tab" && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      if (decision.kind === "document") handlers.document(decision.path);
      else if (decision.kind === "file") handlers.file(decision.path, decision.download, decision.name);
      else if (decision.kind === "new-tab") handlers.newTab(decision.url);
    },
    true,
  );
}
