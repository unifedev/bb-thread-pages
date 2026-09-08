import { defaultTreeAdapter, parse as parseHtml, serialize as serializeHtml, type DefaultTreeAdapterTypes } from "parse5";
import { escapeHtml } from "./escape.ts";

/**
 * Kernel injection. spec R4.1–R4.4
 *
 * The authored document is parsed the way a browser parses it, and two
 * nodes at most are inserted at the very front of `<head>` (or the first
 * element that can hold them): an optional `<base>` for the site strategy,
 * then the kernel script with its configuration in a data attribute. Nothing
 * else changes — no reformatting, no reordering, no rewritten URLs.
 */
export interface InjectionOptions {
  /** The kernel runtime source (an IIFE). */
  readonly kernel: string;
  /** JSON-serialisable kernel configuration, carried in `data-config`. */
  readonly config: unknown;
  /** Same-origin base URL to inject, or null. */
  readonly baseHref: string | null;
}

type HtmlDocument = DefaultTreeAdapterTypes.Document;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParent = HtmlDocument | HtmlElement;

const XHTML = "http://www.w3.org/1999/xhtml";

export function injectKernel(source: string, options: InjectionOptions): string {
  const authored = parseAuthored(source);
  if (authored) {
    return injectInto(authored, options);
  }
  // Not a document at all: wrap it so the reader sees something and the
  // kernel still runs. spec R4.4
  return wrapFragment(source, options);
}

function directChild(parent: HtmlParent, tagName: string): HtmlElement | null {
  for (const child of parent.childNodes) {
    if (defaultTreeAdapter.isElementNode(child) && child.tagName === tagName && child.namespaceURI === XHTML) {
      return child;
    }
  }
  return null;
}

interface Authored {
  document: HtmlDocument;
  target: HtmlElement;
}

function parseAuthored(source: string): Authored | null {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const document = parseHtml(text, { scriptingEnabled: true, sourceCodeLocationInfo: true });
  const html = directChild(document, "html");
  if (!html) return null;
  const head = directChild(html, "head");
  const body = directChild(html, "body");
  const frameset = directChild(html, "frameset");
  const hasDoctype = document.childNodes.some(
    (child) => defaultTreeAdapter.isDocumentTypeNode(child) && child.name.toLowerCase() === "html",
  );
  const hasAuthoredShell = [html, head, body, frameset].some((element) => element?.sourceCodeLocation != null);
  if (!hasDoctype && !hasAuthoredShell) return null;
  return { document, target: head ?? body ?? frameset ?? html };
}

function kernelElement(namespace: HtmlElement["namespaceURI"], options: InjectionOptions): HtmlElement {
  const script = defaultTreeAdapter.createElement("script", namespace, [
    { name: "data-thread-page-kernel", value: "" },
    { name: "data-config", value: JSON.stringify(options.config) },
  ]);
  defaultTreeAdapter.insertText(script, options.kernel);
  return script;
}

function injectInto(authored: Authored, options: InjectionOptions): string {
  const namespace = authored.target.namespaceURI;
  const nodes: HtmlElement[] = [];
  if (options.baseHref) {
    nodes.push(defaultTreeAdapter.createElement("base", namespace, [{ name: "href", value: options.baseHref }]));
  }
  nodes.push(kernelElement(namespace, options));
  const anchor = defaultTreeAdapter.getFirstChild(authored.target);
  for (const node of nodes) {
    if (anchor) defaultTreeAdapter.insertBefore(authored.target, node, anchor);
    else defaultTreeAdapter.appendChild(authored.target, node);
  }
  return serializeHtml(authored.document);
}

function wrapFragment(source: string, options: InjectionOptions): string {
  const base = options.baseHref ? `<base href="${escapeHtml(options.baseHref)}">\n` : "";
  const config = escapeHtml(JSON.stringify(options.config));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Thread Page</title>
${base}<script data-thread-page-kernel data-config="${config}">${options.kernel}</script>
<style>body{max-width:44rem;margin:2rem auto;padding:0 1rem;font:16px/1.55 system-ui,sans-serif;color:CanvasText;background:Canvas}</style>
</head>
<body>
${source}
</body>
</html>`;
}
