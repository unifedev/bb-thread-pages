// Link interception: same-document fragment, own document (open-document), own file (open-file), external (`navigation.openExternal`), `mailto:`/`tel:`, `download` of blob/data left alone (02 R4.15–R4.15d, 01 R1.12f, R1.12g).
import { directoryOf, documentFragment, isDocumentPath } from "../../domain/document-path.ts";
import { downloadName, isOwnFilePath, ownFileReference } from "../../domain/own-files.ts";

export type AnchorDecision =
  | { kind: "default" }
  | { kind: "document"; path: string; fragment: string; query: string }
  | { kind: "fragment"; fragment: string }
  | { kind: "file"; path: string; download: boolean; name: string | null }
  | { kind: "external"; url: string; label: string }
  | { kind: "handler"; url: string }
  | { kind: "block" };

export interface AnchorContext {
  documentPath: string;
  /** The page root's URL (ends with `/`), where files are served by URL; null when carried. */
  rootUrl: string | null;
  embedded: boolean;
}

/** Schemes handed to the reader's own handlers as a popup. 02 R4.15 */
const HANDLER_SCHEMES: ReadonlySet<string> = new Set(["mailto:", "tel:", "sms:"]);
const IN_PLACE_TARGETS: ReadonlySet<string> = new Set(["", "_self", "_parent", "_top"]);
const PLACEHOLDER_BASE = "https://page.invalid/";

function isRelativeReference(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed !== "" && !trimmed.startsWith("/") && !trimmed.startsWith("\\") && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith("//");
}

function ownDecision(path: string, hash: string, search: string, anchor: HTMLAnchorElement, context: AnchorContext): AnchorDecision {
  if (!isOwnFilePath(path)) return { kind: "block" };
  const download = anchor.hasAttribute("download");
  if (isDocumentPath(path) && !download) return { kind: "document", path, fragment: documentFragment(hash), query: search };
  // Inside an embed the shell is not this page's: such a link does nothing. 02 R4.50
  if (context.embedded) return { kind: "block" };
  return { kind: "file", path, download, name: download ? downloadName(anchor.getAttribute("download")) : null };
}

export function decideAnchor(anchor: HTMLAnchorElement, context: AnchorContext): AnchorDecision {
  const raw = anchor.getAttribute("href");
  if (raw === null) return { kind: "default" };
  const trimmed = raw.trim();
  // `#…` is this document's own place; `?…` this document at another query. 01 R1.12f, R1.12g
  if (trimmed.startsWith("#")) return { kind: "fragment", fragment: trimmed };
  if (trimmed.startsWith("?")) {
    const parsed = new URL(trimmed, PLACEHOLDER_BASE);
    return { kind: "document", path: context.documentPath, fragment: documentFragment(parsed.hash), query: parsed.search };
  }
  if (isRelativeReference(trimmed)) {
    const parsed = new URL(trimmed, PLACEHOLDER_BASE);
    const path = ownFileReference(trimmed, directoryOf(context.documentPath));
    // A relative link that climbs out of the root names nothing of this page. 01 R1.4, R1.5
    if (path === null) return { kind: "block" };
    return ownDecision(path, parsed.hash, parsed.search, anchor, context);
  }
  let target: URL;
  try {
    target = new URL(trimmed, anchor.ownerDocument.baseURI);
  } catch {
    return { kind: "block" };
  }
  const download = anchor.hasAttribute("download");
  const inPlace = IN_PLACE_TARGETS.has((anchor.getAttribute("target") ?? "").trim().toLowerCase());
  // A file the page built: saved with `download`, or shown in a window of its own; never in place. 02 R4.15d
  if (target.protocol === "blob:" || target.protocol === "data:") return download || (!inPlace && target.protocol === "blob:") ? { kind: "default" } : { kind: "block" };
  if (HANDLER_SCHEMES.has(target.protocol)) return inPlace ? { kind: "handler", url: target.href } : { kind: "default" };
  if (target.protocol !== "http:" && target.protocol !== "https:") return { kind: "block" };
  if (context.rootUrl && target.href.startsWith(context.rootUrl)) {
    let path: string;
    try {
      path = decodeURIComponent(target.pathname.slice(new URL(context.rootUrl).pathname.length));
    } catch {
      return { kind: "block" };
    }
    return ownDecision(path, target.hash, target.search, anchor, context);
  }
  // Another site, whatever the target: confirmed, then opened by the shell as itself. 02 R4.15
  return { kind: "external", url: target.href, label: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) };
}

export interface AnchorHandlers {
  document(path: string, fragment: string, query: string): void;
  fragment(fragment: string): void;
  file(path: string, download: boolean, name: string | null): void;
  external(url: string, label: string): void;
  handler(url: string): void;
}

export function installAnchorInterception(doc: Document, context: AnchorContext, handlers: AnchorHandlers): void {
  const decide = (event: Event): AnchorDecision | null => {
    const mouse = event as MouseEvent;
    if (mouse.defaultPrevented || mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey) return null;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    return anchor ? decideAnchor(anchor, context) : null;
  };
  doc.addEventListener(
    "click",
    (event) => {
      const decision = decide(event);
      // A `#` link is the page's own first: a menu written as `href="#"` with `return false` keeps working. 01 R1.12f
      if (!decision || decision.kind === "default" || decision.kind === "fragment") return;
      event.preventDefault();
      if (decision.kind === "document") handlers.document(decision.path, decision.fragment, decision.query);
      else if (decision.kind === "file") handlers.file(decision.path, decision.download, decision.name);
      else if (decision.kind === "external") handlers.external(decision.url, decision.label);
      else if (decision.kind === "handler") handlers.handler(decision.url);
    },
    true,
  );
  // After the page's own handlers, for a click none of them cancelled: move within the document.
  doc.defaultView?.addEventListener("click", (event) => {
    const decision = decide(event);
    if (decision?.kind !== "fragment") return;
    event.preventDefault();
    handlers.fragment(decision.fragment);
  });
}
