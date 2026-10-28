// An `html` frame's document: the page's text with this kernel and the page's contributors' page scripts put at the front of its `<head>`, as the host puts them in front of a page, parsed the way the browser parses (02 R4.42a; 07 R5.92).
import { CONTRIBUTOR_SCRIPT_ATTRIBUTE, KERNEL_ATTRIBUTE } from "../../domain/html/markers.ts";
import type { KernelConfig } from "../shared/protocol.ts";

/** The host's own scripts in this document, as it served them: the kernel's source and each contributor's page script. */
export interface HostScripts {
  kernel: string;
  contributors: { contributor: string; script: string }[];
}

/** The kernel's own source, read when the kernel installs, before any script of the page has run. */
export function kernelSource(doc: Document): string | null {
  return doc.querySelector(`script[${KERNEL_ATTRIBUTE}]`)?.textContent || null;
}

/** The contributors' page scripts, read from this document's elements once it has parsed them (they follow the kernel). 07 R5.92 */
export function contributorScripts(doc: Document): HostScripts["contributors"] {
  return Array.from(doc.querySelectorAll(`script[${CONTRIBUTOR_SCRIPT_ATTRIBUTE}]`)).map((script) => ({ contributor: script.getAttribute(CONTRIBUTOR_SCRIPT_ATTRIBUTE) ?? "", script: script.textContent ?? "" }));
}

export function frameDocument(win: Window & typeof globalThis, html: string, scripts: HostScripts, config: KernelConfig): string {
  const parsed = new win.DOMParser().parseFromString(html, "text/html");
  const head = parsed.head;
  const nodes: Element[] = [];
  // The page's files' address, unless the document names its own base; where files are carried there is none. 02 R4.42a
  if (config.siteRoot && !parsed.querySelector("base[href]")) {
    const base = parsed.createElement("base");
    base.setAttribute("href", config.siteRoot);
    nodes.push(base);
  }
  const kernel = parsed.createElement("script");
  kernel.setAttribute(KERNEL_ATTRIBUTE, "");
  kernel.setAttribute("data-config", JSON.stringify(config));
  kernel.textContent = scripts.kernel;
  nodes.push(kernel);
  for (const entry of scripts.contributors) {
    const script = parsed.createElement("script");
    script.setAttribute(CONTRIBUTOR_SCRIPT_ATTRIBUTE, entry.contributor);
    script.textContent = entry.script;
    nodes.push(script);
  }
  const anchor = head.firstChild;
  for (const node of nodes) head.insertBefore(node, anchor);
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}
