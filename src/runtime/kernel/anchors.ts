/**
 * Authored links work. spec R4.15
 *
 * The sandbox has no top-level navigation, so an `<a href>` to another site
 * would silently do nothing (or replace the page inside the frame). The
 * kernel routes http(s) destinations through `navigation.openExternal`,
 * leaves same-document fragments and the page's own files to the browser,
 * and swallows schemes the sandbox cannot honour.
 */
export type AnchorDecision = { kind: "default" } | { kind: "external"; url: string; label: string } | { kind: "block" };

export function decideAnchor(anchor: HTMLAnchorElement, documentUrl: string, siteBase: string | null): AnchorDecision {
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
  if (siteBase && target.href.startsWith(siteBase)) return { kind: "default" };
  if (anchor.hasAttribute("download")) return { kind: "default" };
  return { kind: "external", url: target.href, label: (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) };
}

export function installAnchorInterception(doc: Document, open: (url: string, label: string) => void): void {
  doc.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const base = doc.querySelector("base")?.getAttribute("href") ?? null;
      const siteBase = base ? new URL(base, doc.baseURI).href : null;
      const decision = decideAnchor(anchor, doc.baseURI, siteBase);
      if (decision.kind === "default") return;
      event.preventDefault();
      if (decision.kind === "external") open(decision.url, decision.label);
    },
    true,
  );
}
