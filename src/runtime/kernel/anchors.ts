import { isDocumentPath } from "../../domain/document-path.ts";

/**
 * Authored links work. spec R4.15, R4.15a
 *
 * The sandbox has no top-level navigation, so an `<a href>` to another site
 * would silently do nothing (or replace the page inside the frame). The
 * kernel routes http(s) destinations through `navigation.openExternal`, asks
 * the shell to open another HTML document of the page in place, leaves
 * same-document fragments and the page's other files to the browser, and
 * swallows schemes the sandbox cannot honour.
 */
export type AnchorDecision =
  | { kind: "default" }
  | { kind: "document"; path: string }
  | { kind: "external"; url: string; label: string }
  | { kind: "block" };

/**
 * `siteBase` resolves the link (the document's own directory); `siteRoot` is
 * where the page's files start, so a document path is relative to the root.
 */
export function decideAnchor(anchor: HTMLAnchorElement, documentUrl: string, siteBase: string | null, siteRoot: string | null = siteBase): AnchorDecision {
  const raw = anchor.getAttribute("href");
  if (raw === null) return { kind: "default" };
  if (raw.startsWith("#")) return { kind: "default" };
  let target: URL;
  try {
    target = new URL(raw, siteBase ?? documentUrl);
  } catch {
    return { kind: "block" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return { kind: "block" };
  if (siteRoot && target.href.startsWith(siteRoot)) {
    if (anchor.hasAttribute("download")) return { kind: "default" };
    const path = pathWithin(target, siteRoot);
    return path !== null && isDocumentPath(path) ? { kind: "document", path } : { kind: "default" };
  }
  if (anchor.hasAttribute("download")) return { kind: "default" };
  return { kind: "external", url: target.href, label: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) };
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
  external(url: string, label: string): void;
  document(path: string): void;
}

export function installAnchorInterception(doc: Document, handlers: AnchorHandlers, siteRoot: string | null = null): void {
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
      const decision = decideAnchor(anchor, doc.baseURI, siteBase, root);
      if (decision.kind === "default") return;
      event.preventDefault();
      if (decision.kind === "external") handlers.external(decision.url, decision.label);
      else if (decision.kind === "document") handlers.document(decision.path);
    },
    true,
  );
}
