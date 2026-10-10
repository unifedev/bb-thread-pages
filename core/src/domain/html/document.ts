// parse5 helpers: `parseDocument`, `serialize`, `injectKernel` (two nodes at the front of `<head>`: optional `<base>`, the kernel script), `wrapFragment` for non-documents (02 R4.4).
import { defaultTreeAdapter, parse as parseHtml, serialize as serializeHtml, type DefaultTreeAdapterTypes } from "parse5";
import { escapeAttribute } from "./escape.ts";

export type HtmlDocument = DefaultTreeAdapterTypes.Document;
export type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParent = HtmlDocument | HtmlElement;

const XHTML = "http://www.w3.org/1999/xhtml";

/** The attribute that marks the kernel's script element; a page never carries it itself. 02 R4.1 */
export const KERNEL_ATTRIBUTE = "data-thread-page-kernel";

export interface InjectionOptions {
  /** The kernel runtime source (an IIFE). */
  readonly kernel: string;
  /** JSON-serialisable kernel configuration, carried in `data-config`. */
  readonly config: unknown;
  /** A base URL to inject, or null (only for carried documents and embeds; DR-13). */
  readonly baseHref: string | null;
}

/** Parses the way a browser parses, with a leading BOM dropped. */
export function parseDocument(source: string): HtmlDocument {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  return parseHtml(text, { scriptingEnabled: true, sourceCodeLocationInfo: true });
}

export function serialize(document: HtmlDocument): string {
  return serializeHtml(document);
}

export function directChild(parent: HtmlParent, tagName: string): HtmlElement | null {
  for (const child of parent.childNodes) {
    if (defaultTreeAdapter.isElementNode(child) && child.tagName === tagName && child.namespaceURI === XHTML) return child;
  }
  return null;
}

interface Authored {
  document: HtmlDocument;
  target: HtmlElement;
}

/** An authored document, or null when the source is a fragment with no doctype and no html/head/body of its own. 02 R4.4 */
function parseAuthored(source: string): Authored | null {
  const document = parseDocument(source);
  const html = directChild(document, "html");
  if (!html) return null;
  const head = directChild(html, "head");
  const body = directChild(html, "body");
  const frameset = directChild(html, "frameset");
  const hasDoctype = document.childNodes.some((child) => defaultTreeAdapter.isDocumentTypeNode(child) && child.name.toLowerCase() === "html");
  const hasAuthoredShell = [html, head, body, frameset].some((element) => element?.sourceCodeLocation != null);
  if (!hasDoctype && !hasAuthoredShell) return null;
  return { document, target: head ?? body ?? frameset ?? html };
}

function kernelElement(namespace: HtmlElement["namespaceURI"], options: InjectionOptions): HtmlElement {
  const script = defaultTreeAdapter.createElement("script", namespace, [
    { name: KERNEL_ATTRIBUTE, value: "" },
    { name: "data-config", value: JSON.stringify(options.config) },
  ]);
  defaultTreeAdapter.insertText(script, options.kernel);
  return script;
}

/**
 * Kernel injection: the authored document is parsed the way a browser parses
 * it, and at most two nodes are inserted at the very front of `<head>` (or
 * the first element that can hold them): an optional `<base>`, then the
 * kernel script with its configuration in a data attribute. Nothing else
 * changes. A source that is not a document is wrapped. 02 R4.1–R4.4
 */
export function injectKernel(source: string, options: InjectionOptions): string {
  const authored = parseAuthored(source);
  if (!authored) return wrapFragment(source, options);
  const namespace = authored.target.namespaceURI;
  const nodes: HtmlElement[] = [];
  if (options.baseHref) nodes.push(defaultTreeAdapter.createElement("base", namespace, [{ name: "href", value: options.baseHref }]));
  nodes.push(kernelElement(namespace, options));
  const anchor = defaultTreeAdapter.getFirstChild(authored.target);
  for (const node of nodes) {
    if (anchor) defaultTreeAdapter.insertBefore(authored.target, node, anchor);
    else defaultTreeAdapter.appendChild(authored.target, node);
  }
  return serializeHtml(authored.document);
}

/** A fragment made a document, so the reader sees something and the kernel still runs. 02 R4.4 */
export function wrapFragment(source: string, options: InjectionOptions): string {
  const base = options.baseHref ? `<base href="${escapeAttribute(options.baseHref)}">\n` : "";
  const config = escapeAttribute(JSON.stringify(options.config));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Thread Page</title>
${base}<script ${KERNEL_ATTRIBUTE} data-config="${config}">${options.kernel}</script>
<style>body{max-width:44rem;margin:2rem auto;padding:0 1rem;font:16px/1.55 system-ui,sans-serif;color:CanvasText;background:Canvas}</style>
</head>
<body>
${source}
</body>
</html>`;
}
