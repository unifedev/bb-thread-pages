// From a parse5 tree: captured forms with identity and field names (`FormIdentity[]`), first `h1` text — the server half of 02 R-K5.
import { defaultTreeAdapter, type DefaultTreeAdapterTypes } from "parse5";
import { normalizeTitle, type FormIdentity } from "../forms/identity.ts";
import { parseDocument, type HtmlDocument, type HtmlElement } from "./document.ts";

type Node = DefaultTreeAdapterTypes.Node;

/** The opt-out attribute: a form carrying it is left alone. 02 R4.6 */
export const MANUAL_ATTRIBUTE = "data-thread-page-manual";
/** The form's title attribute. 02 §Attributes */
export const TITLE_ATTRIBUTE = "data-title";

const CONTROL_TAGS = new Set(["input", "select", "textarea"]);
const NOT_ANSWERS = new Set(["submit", "reset", "button", "image"]);

function attribute(element: HtmlElement, name: string): string | null {
  const found = element.attrs.find((attr) => attr.name === name);
  return found ? found.value : null;
}

function* walk(node: Node): Generator<HtmlElement> {
  const children = "childNodes" in node ? node.childNodes : [];
  for (const child of children) {
    if (defaultTreeAdapter.isElementNode(child)) {
      yield child;
      if (child.tagName === "template" && "content" in child) yield* walk((child as DefaultTreeAdapterTypes.Template).content);
      yield* walk(child);
    }
  }
}

function isAnswerControl(element: HtmlElement): boolean {
  if (!CONTROL_TAGS.has(element.tagName)) return false;
  if (element.tagName === "input") {
    const type = (attribute(element, "type") ?? "text").trim().toLowerCase();
    if (NOT_ANSWERS.has(type)) return false;
  }
  return true;
}

function nearestForm(element: HtmlElement): HtmlElement | null {
  let parent = element.parentNode;
  while (parent) {
    if (defaultTreeAdapter.isElementNode(parent) && parent.tagName === "form") return parent;
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  return null;
}

/**
 * The captured forms of a document — every `<form>` without the opt-out
 * attribute — each with its identity and the names of its controls:
 * descendants plus any control anywhere with `form="<that id>"`, excluding
 * buttons and submit/reset/button/image inputs. `index` counts every form in
 * document order, opted-out ones included. 02 R4.5, R4.5a, R4.6, R-K5
 */
export function captureForms(source: string | HtmlDocument): FormIdentity[] {
  const document = typeof source === "string" ? parseDocument(source) : source;
  const forms: { element: HtmlElement; index: number; fields: Set<string> }[] = [];
  const byId = new Map<string, { element: HtmlElement; index: number; fields: Set<string> }>();
  let index = 0;
  for (const element of walk(document)) {
    if (element.tagName !== "form") continue;
    const entry = { element, index, fields: new Set<string>() };
    index += 1;
    forms.push(entry);
    const id = attribute(element, "id");
    if (id && !byId.has(id)) byId.set(id, entry);
  }
  for (const element of walk(document)) {
    if (!isAnswerControl(element)) continue;
    const name = attribute(element, "name");
    if (!name) continue;
    const owner = attribute(element, "form");
    const form = owner !== null ? (byId.get(owner) ?? null) : null;
    const target = form ?? (owner !== null ? null : (() => {
      const nearest = nearestForm(element);
      return nearest ? (forms.find((entry) => entry.element === nearest) ?? null) : null;
    })());
    if (target) target.fields.add(name);
  }
  return forms
    .filter((entry) => attribute(entry.element, MANUAL_ATTRIBUTE) === null)
    .map((entry) => ({ id: attribute(entry.element, "id") || null, title: normalizeTitle(attribute(entry.element, TITLE_ATTRIBUTE)), index: entry.index, fields: entry.fields }));
}

function textOf(node: Node): string {
  if (defaultTreeAdapter.isTextNode(node)) return node.value;
  const children = "childNodes" in node ? node.childNodes : [];
  return children.map(textOf).join("");
}

/** The document's first `<h1>` text, trimmed, or null. 02 §The answer wording (title fallback) */
export function firstHeading(source: string | HtmlDocument): string | null {
  const document = typeof source === "string" ? parseDocument(source) : source;
  for (const element of walk(document)) {
    if (element.tagName === "h1") return normalizeTitle(textOf(element).replace(/\s+/g, " "));
  }
  return null;
}
