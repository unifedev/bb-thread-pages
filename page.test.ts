import { runInNewContext } from "node:vm";

import {
  defaultTreeAdapter,
  parse as parseHtml,
  type DefaultTreeAdapterTypes,
} from "parse5";
import { describe, expect, it } from "vitest";

import {
  VIEWER_TOKEN_TTL_MS,
  formatSubmissionMessage,
  makeSeedFragment,
  parseSubmission,
  renderDocument,
  renderOuterPage,
  sha256Text,
  signPageToken,
  verifyPageToken,
  type PageTokenPayload,
} from "./page.js";

type HtmlParent =
  | DefaultTreeAdapterTypes.Document
  | DefaultTreeAdapterTypes.DocumentFragment
  | DefaultTreeAdapterTypes.Element;
type HtmlElement = DefaultTreeAdapterTypes.Element;

function directElement(parent: HtmlParent, tagName: string): HtmlElement {
  const element = parent.childNodes.find(
    (child) =>
      defaultTreeAdapter.isElementNode(child) && child.tagName === tagName,
  );
  if (!element || !defaultTreeAdapter.isElementNode(element)) {
    throw new Error(`Expected a direct <${tagName}> child`);
  }
  return element;
}

function findElements(parent: HtmlParent, tagName: string): HtmlElement[] {
  const matches: HtmlElement[] = [];
  for (const child of parent.childNodes) {
    if (!defaultTreeAdapter.isElementNode(child)) continue;
    if (child.tagName === tagName) matches.push(child);
    matches.push(...findElements(child, tagName));
  }
  return matches;
}

function attr(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function parseShell(source: string): {
  document: DefaultTreeAdapterTypes.Document;
  html: HtmlElement;
  head: HtmlElement;
  body: HtmlElement;
} {
  const document = parseHtml(source);
  const html = directElement(document, "html");
  return {
    document,
    html,
    head: directElement(html, "head"),
    body: directElement(html, "body"),
  };
}

function expectKernelFirst(source: string): ReturnType<typeof parseShell> {
  const shell = parseShell(source);
  // The plugin may also inject a confined <base> before the kernel. That
  // element runs no code, so the invariant is that the kernel precedes every
  // other head child that can execute or load anything.
  const elements = shell.head.childNodes.filter((node) =>
    defaultTreeAdapter.isElementNode(node),
  );
  const kernelIndex = elements.findIndex(
    (element) => attr(element, "data-thread-page-kernel") !== undefined,
  );
  expect(kernelIndex).toBeGreaterThanOrEqual(0);
  for (const before of elements.slice(0, kernelIndex)) {
    expect(before.tagName).toBe("base");
  }
  const first = elements[kernelIndex]!;
  expect(first.tagName).toBe("script");
  expect(attr(first, "data-thread-page-kernel")).toBe("");
  expect(attr(first, "nonce")).toBe("nonce_test");
  return shell;
}

interface PostedMessage {
  kind: string;
  submissionId?: string;
  [key: string]: unknown;
}

interface ThreadPageApi {
  readonly version: 1;
  invoke(method: string, params?: unknown): Promise<unknown>;
  setDirty(next?: boolean): void;
  assetUrl(name: string): string;
}

type RuntimeListener = (event: any) => void;

class FakeStatus {
  textContent = "";

  setAttribute(_name: string, _value: string): void {}
}

class FakeControl {
  disabled = false;
  id = "";
  required = true;
  textContent = "";
  ownerForm: FakeHTMLFormElement | null = null;

  constructor(
    readonly name: string,
    readonly type: string,
    readonly value: string,
  ) {}

  getAttribute(_name: string): string | null {
    return null;
  }

  closest(selector: string): FakeHTMLFormElement | null {
    return selector === "form" ? this.ownerForm : null;
  }
}

class FakeButton extends FakeControl {
  override textContent = "Send";

  constructor(readonly action: string) {
    super("action", "submit", action);
  }
}

class FakeHTMLFormElement {
  readonly button: FakeButton;
  readonly authoredDisabledButton: FakeButton;
  readonly dataset: { title: string };
  readonly elements: FakeControl[];
  noValidate = false;
  private status: FakeStatus | null = null;

  constructor(
    title: string,
    readonly manual = false,
  ) {
    this.button = new FakeButton(title);
    this.authoredDisabledButton = new FakeButton("Authored disabled");
    this.authoredDisabledButton.disabled = true;
    this.dataset = { title };
    this.elements = [
      new FakeControl("answer", "text", title),
      this.button,
      this.authoredDisabledButton,
    ];
    for (const control of this.elements) control.ownerForm = this;
  }

  hasAttribute(name: string): boolean {
    return name === "data-thread-page-manual" && this.manual;
  }

  querySelector(selector: string): FakeStatus | null {
    return selector === "[data-thread-page-status]" ? this.status : null;
  }

  querySelectorAll(selector: string): FakeButton[] {
    return selector === "button"
      ? [this.button, this.authoredDisabledButton]
      : [];
  }

  appendChild(status: FakeStatus): FakeStatus {
    this.status = status;
    return status;
  }

  statusText(): string {
    return this.status?.textContent ?? "";
  }
}

class FakeMessagePort {
  onmessage: RuntimeListener | null = null;
  readonly posted: unknown[] = [];
  closed = false;

  postMessage(value: unknown): void {
    if (this.closed) throw new Error("Port is closed");
    this.posted.push(value);
  }

  start(): void {}

  close(): void {
    this.closed = true;
  }

  deliver(value: unknown): void {
    this.onmessage?.({ data: value });
  }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, RuntimeListener[]>();

  addEventListener(
    type: string,
    listener: RuntimeListener,
    _capture?: boolean,
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDocument extends FakeEventTarget {
  constructor(readonly forms: FakeHTMLFormElement[]) {
    super();
  }

  querySelector(selector: string): { textContent: string } | null {
    return selector === "h1" ? { textContent: "Runtime test" } : null;
  }

  querySelectorAll(selector: string): unknown[] {
    if (selector === "form") return this.forms;
    if (selector === "form input,form textarea,form select,form button") {
      return this.forms.flatMap((form) => form.elements);
    }
    return [];
  }

  createElement(_tagName: string): FakeStatus {
    return new FakeStatus();
  }
}

function createDocumentRuntimeHarness(options?: {
  connect?: boolean;
  manualSecond?: boolean;
  assetBase?: string | null;
}) {
  const forms = [
    new FakeHTMLFormElement("First form"),
    new FakeHTMLFormElement("Second form", options?.manualSecond),
  ];
  const document = new FakeDocument(forms);
  const window = new FakeEventTarget();
  const parentPosted: PostedMessage[] = [];
  const port = new FakeMessagePort();
  const parent = {
    postMessage(message: PostedMessage, _targetOrigin: string): void {
      parentPosted.push(message);
    },
  };
  const ids = ["submission-one", "submission-two", "submission-three"];
  const html = renderDocument({
    fragment: "<h1>Runtime test</h1><form></form><form></form>",
    nonce: "nonce_test",
    pageHash: "a".repeat(64),
    stale: false,
    assetBase: options?.assetBase,
  });
  const script = html.match(
    /<script data-thread-page-kernel nonce="nonce_test">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!script) throw new Error("Rendered document runtime was not found");

  runInNewContext(script, {
    crypto: {
      randomUUID: () => ids.shift() ?? "submission-fallback",
    },
    document,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLSelectElement: class {},
    parent,
    window,
  });

  function connect(): void {
    window.dispatch("message", {
      source: parent,
      data: { kind: "thread-page:connect", version: 1 },
      ports: [port],
      stopImmediatePropagation() {},
    });
  }
  if (options?.connect !== false) connect();

  return {
    forms,
    parentPosted,
    port,
    posted: port.posted as PostedMessage[],
    threadPage: (window as unknown as { threadPage: ThreadPageApi }).threadPage,
    connect,
    input(form: FakeHTMLFormElement): void {
      document.dispatch("input", { target: form.elements[0] });
    },
    submit(form: FakeHTMLFormElement): boolean {
      let prevented = false;
      document.dispatch("submit", {
        preventDefault() {
          prevented = true;
        },
        submitter: form.button,
        target: form,
      });
      return prevented;
    },
    respond(submissionId: string, result: Record<string, unknown>): void {
      port.deliver({
        kind: "thread-page:submit-result",
        submissionId,
        ...result,
      });
    },
  };
}

describe("page authority tokens", () => {
  it("binds scope, thread, revision, and short expiry", () => {
    const now = 1_800_000_000_000;
    const key = Buffer.alloc(32, 7);
    const payload: PageTokenPayload = {
      v: 2,
      scope: "render",
      threadId: "thr_test",
      pageHash: "a".repeat(64),
      iat: now,
      exp: now + VIEWER_TOKEN_TTL_MS,
    };
    const token = signPageToken(payload, key);

    expect(verifyPageToken(token, key, "render", now)).toEqual(payload);
    expect(verifyPageToken(token, key, "action", now)).toBeNull();
    expect(verifyPageToken(`${token}x`, key, "render", now)).toBeNull();
    expect(
      verifyPageToken(token, Buffer.alloc(32, 8), "render", now),
    ).toBeNull();
    expect(verifyPageToken(token, key, "render", payload.exp)).toBeNull();
  });
});

describe("page documents", () => {
  it("keeps bare fragments short and wraps them at delivery time", () => {
    const seed = makeSeedFragment('A <thread> & "title"');
    expect(seed).toContain("<main>");
    expect(seed).toContain("A &lt;thread&gt; &amp; &quot;title&quot;");
    expect(Buffer.byteLength(seed)).toBeLessThan(1_024);

    const html = renderDocument({
      fragment: `${seed}<script>agentScript()</script><style>body{display:none}</style>`,
      nonce: "nonce_test",
      pageHash: sha256Text(seed),
      stale: false,
    });
    expect(html).toContain(seed);
    expect(html).toContain('<div class="thread-page">');
    expect(html).toContain("<style nonce=\"nonce_test\">");
    expect(html).toContain(
      '<script data-thread-page-kernel nonce="nonce_test">',
    );
    expect(html).toContain("<script>agentScript()</script>");
    expect(html.indexOf("data-thread-page-kernel")).toBeLessThan(
      html.indexOf("<script>agentScript()</script>"),
    );
  });

  it("normalizes a complete custom mini-app and starts the form kernel first", () => {
    const source = `<!doctype html>
<html lang="en" data-shell="custom">
<head>
  <meta name="theme-color" content="#123456">
  <title>Diagram workspace</title>
  <style>body { display: grid } custom-card { color: rebeccapurple }</style>
  <script>window.executionOrder = ["page-head"]</script>
</head>
<body class="app" onload="window.loaded = true">
  <nav><a href="#review">Review</a></nav>
  <main id="workspace">
    <svg viewBox="0 0 10 10" onclick="this.dataset.selected = 'yes'"><circle cx="5" cy="5" r="4"></circle></svg>
    <canvas id="plot"></canvas>
    <custom-card></custom-card>
    <form><input name="diagram" type="hidden"><button>Finish</button></form>
  </main>
  <script>customElements.define("custom-card", class extends HTMLElement {}); location.hash ||= "start"</script>
</body>
</html>`;

    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    expect(html.match(/<!doctype html>/gi)).toHaveLength(1);
    expect(html.match(/<html\b/gi)).toHaveLength(1);
    expect(html.match(/<head\b/gi)).toHaveLength(1);
    expect(html.match(/<body\b/gi)).toHaveLength(1);
    expect(html).toContain('<html lang="en" data-shell="custom">');
    expect(html).toContain("<title>Diagram workspace</title>");
    expect(html).toContain(
      "<style>body { display: grid } custom-card { color: rebeccapurple }</style>",
    );
    expect(html).toContain('<body class="app" onload="window.loaded = true">');
    expect(html).toContain('<svg viewBox="0 0 10 10" onclick=');
    expect(html).toContain('<canvas id="plot"></canvas>');
    expect(html).toContain("customElements.define");
    expect(html).not.toContain('<div class="thread-page">');

    const kernelIndex = html.indexOf("data-thread-page-kernel");
    const headScriptIndex = html.indexOf(
      '<script>window.executionOrder = ["page-head"]</script>',
    );
    expect(kernelIndex).toBeGreaterThan(-1);
    expect(kernelIndex).toBeLessThan(headScriptIndex);
    expectKernelFirst(html);
  });

  it("finds the real head across comment decoys and quoted angle brackets", () => {
    const source = `<!-- <head>comment decoy</head> -->
<!doctype html>
<html>
<head data-description=">"><title>Exact shell</title><script>pageBoot()</script></head>
<body><html-shell>Fragment-like custom element</html-shell></body>
</html>`;
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    expect(html.indexOf("data-thread-page-kernel")).toBeGreaterThan(
      html.indexOf('<head data-description=">">') +
        '<head data-description=">">'.length,
    );
    expect(html.indexOf("data-thread-page-kernel")).toBeLessThan(
      html.indexOf("<script>pageBoot()</script>"),
    );
    expectKernelFirst(html);
    expect(html).toContain("<!-- <head>comment decoy</head> -->");
  });

  it("injects into the document head instead of template or foreign trees", () => {
    const source = `<!doctype html><html><body>
<template id="decoy"><head><script id="template-script">templateBoot()</script></head></template>
<svg viewBox="0 0 10 10"><script id="svg-script">svgBoot()</script></svg>
<math><annotation-xml encoding="application/xml"><script id="math-script">mathBoot()</script></annotation-xml></math>
<script id="body-script">bodyBoot()</script>
</body></html>`;
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    const shell = expectKernelFirst(html);
    const template = findElements(shell.body, "template")[0] as
      | DefaultTreeAdapterTypes.Template
      | undefined;
    expect(template).toBeDefined();
    expect(
      template
        ? findElements(template.content, "script").map((script) =>
            attr(script, "id"),
          )
        : [],
    ).toEqual(["template-script"]);
    expect(
      findElements(shell.document, "script").map(
        (script) => attr(script, "data-thread-page-kernel") !== undefined,
      ),
    ).toEqual([true, false, false, false]);
    expect(attr(findElements(shell.body, "script")[0]!, "id")).toBe(
      "svg-script",
    );
  });

  it.each(["xmp", "iframe", "noembed", "noscript", "style", "textarea"])(
    "does not inject into <%s> raw-text decoys",
    (tagName) => {
      const source = `<!doctype html><html><body><${tagName}><head><script id=decoy>bad()</script></head></${tagName}><script id="authored">pageBoot()</script></body></html>`;
      const html = renderDocument({
        fragment: source,
        nonce: "nonce_test",
        pageHash: sha256Text(source),
        stale: false,
      });

      const shell = expectKernelFirst(html);
      expect(
        findElements(shell.document, "script")
          .map((script) => attr(script, "id"))
          .filter(Boolean),
      ).toEqual(["authored"]);
      const rawElement = findElements(shell.body, tagName)[0];
      expect(
        rawElement?.childNodes
          .filter(defaultTreeAdapter.isTextNode)
          .map((node) => node.value)
          .join(""),
      ).toBe("<head><script id=decoy>bad()</script></head>");
    },
  );

  it.each([
    {
      name: "an authored head without html or body",
      source: '<head><title>Head only</title><script id="head">headBoot()</script>',
    },
    {
      name: "an implicit head before an authored body",
      source:
        '<!doctype html><html><body><script id="body">bodyBoot()</script></body></html>',
    },
    {
      name: "a head token misplaced after body content",
      source:
        '<!doctype html><html><body><script id="body">bodyBoot()</script><head><script id="late">lateBoot()</script>',
    },
  ])("normalizes $name", ({ source }) => {
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    expectKernelFirst(html);
    expect(html).not.toContain('<div class="thread-page">');
    expect(html.match(/<head>/g)).toHaveLength(1);
    expect(html.match(/<body>/g)).toHaveLength(1);
  });

  it("accepts a leading BOM, processing instruction, and comment", () => {
    const source =
      '\ufeff<?xml version="1.0"?><!-- leading comment --><!doctype html><html><head><script id="authored">pageBoot()</script></head><body></body></html>';
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    expectKernelFirst(html);
    expect(html.charCodeAt(0)).not.toBe(0xfeff);
    expect(html).toContain('<!--?xml version="1.0"?-->');
    expect(html).toContain("<!-- leading comment -->");
    expect(html).not.toContain('<div class="thread-page">');
  });

  it.each([
    '<!doctype html><!-- lead --><html><head data-open><script id="unclosed">pageBoot()',
    '<!doctype html><html><body><p><table><b><script id="misnested">pageBoot()</script>',
    '<!doctype html><html><body><xmp><head><script id=decoy>bad()</script>',
  ])("normalizes malformed or unclosed document content", (source) => {
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    expectKernelFirst(html);
    expect(html).not.toContain('<div class="thread-page">');
  });

  it("places the kernel before every authored executable script", () => {
    const source = `<!doctype html><script id="early">earlyBoot()</script>
<html><head><script id="head">headBoot()</script></head><body>
<template><script id="inert">inertBoot()</script></template>
<svg><script id="svg">svgBoot()</script></svg>
<script id="body">bodyBoot()</script></body></html>`;
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
    });

    const shell = expectKernelFirst(html);
    const executionOrder = findElements(shell.document, "script").map(
      (script) =>
        attr(script, "data-thread-page-kernel") !== undefined
          ? "kernel"
          : attr(script, "id"),
    );
    expect(executionOrder).toEqual(["kernel", "early", "head", "svg", "body"]);
  });

  it("puts the confined asset base ahead of the kernel and any authored base", () => {
    const source = `<!doctype html><html><head><base href="https://evil.invalid/"><script id="head">boot()</script></head><body><img src="chart.png"></body></html>`;
    const assetBase = "/api/v1/file-previews/abc123/";
    const html = renderDocument({
      fragment: source,
      nonce: "nonce_test",
      pageHash: sha256Text(source),
      stale: false,
      assetBase,
    });

    // The first base wins in HTML, so ours must precede the authored one.
    const ours = html.indexOf(`<base href="${assetBase}">`);
    const theirs = html.indexOf('<base href="https://evil.invalid/">');
    expect(ours).toBeGreaterThan(-1);
    expect(theirs).toBeGreaterThan(ours);
    // The kernel still runs before any authored script.
    const shell = expectKernelFirst(html);
    expect(
      findElements(shell.document, "script").map((script) =>
        attr(script, "data-thread-page-kernel") !== undefined
          ? "kernel"
          : attr(script, "id"),
      ),
    ).toEqual(["kernel", "head"]);

    // Without an asset directory no base is injected at all.
    expect(
      renderDocument({
        fragment: source,
        nonce: "nonce_test",
        pageHash: sha256Text(source),
        stale: false,
        assetBase: null,
      }),
    ).not.toContain("file-previews");
  });

  it("does not mistake custom-element fragments for document shells", () => {
    const fragment =
      "<html-shell><head-widget>Custom elements</head-widget></html-shell>";
    const html = renderDocument({
      fragment,
      nonce: "nonce_test",
      pageHash: sha256Text(fragment),
      stale: false,
    });

    expect(html).toContain('<div class="thread-page">');
    expect(html).toContain(fragment);
  });

  it("allows form activation in the opaque iframe without relaxing its origin", () => {
    const html = renderOuterPage({
      nonce: "nonce_test",
      title: "Test page",
      actionToken: "action_test",
      pageHash: "a".repeat(64),
      expiresAt: 1_800_000_000_000,
      documentUrl: "/document?render=render_test",
      submitUrl: "/submit",
      uploadUrl: "/upload",
      bridgeUrl: "/bridge",
      pageUrlTemplate: "/page?threadId=__THREAD__",
      bbThreadUrlTemplate: "/threads/__THREAD__",
      homeUrl: "/home",
      working: true,
      workingLabel: "Working — this is the last saved version",
      stale: false,
    });

    // The Sessions link is chrome, so a page never has to write one itself.
    expect(html).toContain('<a class="home" href="/home"');
    // So is the working strip; it costs a page and an agent nothing.
    expect(html).toContain('<span class="work" role="status" data-visible="true"');
    expect(html).toContain("Working — this is the last saved version");
    expect(html).toContain('sandbox="allow-scripts allow-forms"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("allow-top-navigation");
  });

  it("installs a frozen capability API and correlates queued port requests", async () => {
    const harness = createDocumentRuntimeHarness({ connect: false });
    expect(Object.isFrozen(harness.threadPage)).toBe(true);
    expect(Object.keys(harness.threadPage).sort()).toEqual([
      "assetUrl",
      "invoke",
      "setDirty",
      "version",
      "watch",
    ]);
    expect(harness.threadPage.version).toBe(1);

    const contextPromise = harness.threadPage.invoke("context.get", null);
    const replyPromise = harness.threadPage.invoke("thread.reply", {
      result: { selected: ["alpha", "beta"] },
    });
    expect(harness.posted).toHaveLength(0);

    harness.connect();
    const [contextRequest, replyRequest] = harness.posted as unknown as Array<{
      v: number;
      id: string;
      method: string;
      params: unknown;
      pageRevision: string;
    }>;
    expect(contextRequest).toMatchObject({
      v: 1,
      method: "context.get",
      params: null,
      pageRevision: "a".repeat(64),
    });
    expect(replyRequest).toMatchObject({
      v: 1,
      method: "thread.reply",
      pageRevision: "a".repeat(64),
    });
    expect(Object.keys(contextRequest!).sort()).toEqual([
      "id",
      "method",
      "pageRevision",
      "params",
      "v",
    ]);

    harness.port.deliver({
      v: 1,
      id: replyRequest!.id,
      ok: false,
      error: { code: "conflict", message: "Reply conflict" },
    });
    harness.port.deliver({
      v: 1,
      id: contextRequest!.id,
      ok: true,
      result: { thread: "safe" },
    });
    await expect(contextPromise).resolves.toEqual({ thread: "safe" });
    await expect(replyPromise).rejects.toMatchObject({
      code: "conflict",
      message: "Reply conflict",
    });

    const malformedPromise = harness.threadPage.invoke("context.get", null);
    const malformedRequest = harness.posted.at(-1) as unknown as { id: string };
    harness.port.deliver({
      v: 1,
      id: malformedRequest.id,
      ok: true,
      result: null,
      extra: true,
    });
    await expect(malformedPromise).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("resolves confined asset names and refuses to escape the asset directory", () => {
    const without = createDocumentRuntimeHarness({ connect: false });
    expect(() => without.threadPage.assetUrl("chart.css")).toThrow(
      /assets are unavailable/i,
    );

    const harness = createDocumentRuntimeHarness({
      connect: false,
      assetBase: "https://preview.invalid/tp-preview/abc/",
    });
    expect(harness.threadPage.assetUrl("chart.css")).toBe(
      "https://preview.invalid/tp-preview/abc/chart.css",
    );
    expect(harness.threadPage.assetUrl("./chart.css")).toBe(
      "https://preview.invalid/tp-preview/abc/chart.css",
    );

    for (const bad of [
      "../secret",
      "nested/chart.css",
      "chart.css?x=1",
      "chart.css#frag",
      "a".repeat(200),
      "",
    ]) {
      expect(() => harness.threadPage.assetUrl(bad), bad).toThrow();
    }
  });

  it("keeps authority and transport internals off the document API", () => {
    const secret = "action-secret-that-must-not-reach-the-document";
    const html = renderDocument({
      fragment: "<main><script>pageBoot()</script></main>",
      nonce: "nonce_test",
      pageHash: "c".repeat(64),
      stale: false,
    });
    expect(html).not.toContain(secret);
    expect(html).not.toContain("actionToken");
    expect(html).not.toContain("renderToken");
    expect(html).not.toContain("channel");
    expect(html.indexOf("Object.defineProperty(window,\"threadPage\"")).toBeLessThan(
      html.indexOf("<script>pageBoot()</script>"),
    );
  });

  it("disables authored constraint validation for every form", () => {
    const { forms } = createDocumentRuntimeHarness();

    expect(forms.every((form) => form.elements[0]?.required)).toBe(true);
    expect(forms.map((form) => form.noValidate)).toEqual([true, true]);
  });

  it("leaves manual forms entirely page-authored", () => {
    const harness = createDocumentRuntimeHarness({ manualSecond: true });
    const [automatic, manual] = harness.forms;
    expect(automatic?.noValidate).toBe(true);
    expect(manual?.noValidate).toBe(false);
    expect(harness.submit(manual!)).toBe(false);
    expect(
      harness.posted.filter(
        (message) => message.kind === "thread-page:submit",
      ),
    ).toHaveLength(0);
  });

  it("tracks each form and custom interaction dirty state independently", () => {
    const harness = createDocumentRuntimeHarness();
    const [first, second] = harness.forms;
    if (!first || !second) throw new Error("Expected two forms");

    harness.input(first);
    harness.input(second);
    expect(harness.posted).toContainEqual({ kind: "thread-page:dirty" });
    expect(
      harness.posted.filter((message) => message.kind === "thread-page:dirty"),
    ).toHaveLength(1);

    harness.submit(first);
    const firstSubmission = harness.posted.find(
      (message) =>
        message.kind === "thread-page:submit" && message.title === "First form",
    );
    harness.respond(firstSubmission!.submissionId!, { ok: true });
    expect(
      harness.posted.filter((message) => message.kind === "thread-page:clean"),
    ).toHaveLength(0);

    harness.threadPage.setDirty(true);
    harness.submit(second);
    const secondSubmission = harness.posted.find(
      (message) =>
        message.kind === "thread-page:submit" && message.title === "Second form",
    );
    harness.respond(secondSubmission!.submissionId!, { ok: true });
    expect(
      harness.posted.filter((message) => message.kind === "thread-page:clean"),
    ).toHaveLength(0);

    harness.threadPage.setDirty(false);
    expect(harness.posted.at(-1)).toEqual({ kind: "thread-page:clean" });
  });

  it("routes concurrent form results back to their own form", () => {
    const harness = createDocumentRuntimeHarness();
    const [first, second] = harness.forms;
    if (!first || !second) throw new Error("Expected two forms");

    harness.submit(first);
    harness.submit(first);
    harness.submit(second);

    const submissions = harness.posted.filter(
      (message) => message.kind === "thread-page:submit",
    );
    expect(submissions).toHaveLength(2);
    expect(first.statusText()).toBe("Sending…");
    expect(second.statusText()).toBe("Sending…");
    expect(first.button.disabled).toBe(true);
    expect(second.button.disabled).toBe(true);

    harness.respond(submissions[1]!.submissionId!, {
      ok: true,
      message: "Second sent",
    });
    expect(second.statusText()).toBe("Second sent");
    expect(second.button.disabled).toBe(false);
    expect(first.statusText()).toBe("Sending…");
    expect(first.button.disabled).toBe(true);

    harness.respond(submissions[0]!.submissionId!, {
      ok: false,
      error: "First failed",
    });
    expect(first.statusText()).toBe("First failed");
    expect(first.button.disabled).toBe(false);
    expect(first.authoredDisabledButton.disabled).toBe(true);
    expect(second.statusText()).toBe("Second sent");
    expect(second.authoredDisabledButton.disabled).toBe(true);
  });
});

/**
 * A minimal element good enough for the kernel's label derivation, which only
 * clones, removes matched descendants, and reads textContent.
 */
class FakeLabelNode {
  parent: FakeLabelNode | null = null;

  constructor(
    readonly tag: string,
    readonly text: string,
    readonly children: FakeLabelNode[] = [],
  ) {
    // Parent links must be set here, so a clone is linked too. Setting them
    // only in the factory left clones orphaned and remove() a silent no-op.
    for (const child of children) child.parent = this;
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  cloneNode(): FakeLabelNode {
    return new FakeLabelNode(
      this.tag,
      this.text,
      this.children.map((child) => child.cloneNode()),
    );
  }

  querySelectorAll(selector: string): FakeLabelNode[] {
    const wanted = selector.split(",").map((part) => part.trim());
    const out: FakeLabelNode[] = [];
    for (const child of this.children) {
      if (wanted.includes(child.tag)) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }

  remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
  }
}

function labelNode(
  tag: string,
  text: string,
  children: FakeLabelNode[] = [],
): FakeLabelNode {
  return new FakeLabelNode(tag, text, children);
}

/** Pull one named function out of the shipped document kernel and run it. */
function kernelFunction(name: string): (...args: unknown[]) => unknown {
  const html = renderDocument({
    fragment: "<h1>x</h1>",
    nonce: "nonce_test",
    pageHash: "a".repeat(64),
    stale: false,
  });
  const runtime = html.match(
    /<script data-thread-page-kernel nonce="nonce_test">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!runtime) throw new Error("kernel not found");
  const source = runtime.match(
    new RegExp(`^function ${name}\\(.*$`, "m"),
  )?.[0];
  if (!source) throw new Error(`${name} not found in kernel`);
  const context: Record<string, unknown> = {};
  runInNewContext(source, context);
  return context[name] as (...args: unknown[]) => unknown;
}

describe("answer labels", () => {
  it("strips controls, options, and hints out of a derived question", () => {
    const labelText = kernelFunction("labelText") as (
      node: unknown,
    ) => string;

    // A label that wraps its own control reads as just the question.
    expect(
      labelText(
        labelNode("label", "How deep? ", [labelNode("input", "")]),
      ),
    ).toBe("How deep?");

    // A <select>'s options must not become part of its name. This shipped
    // broken: "A choice (no preference)Alpha".
    expect(
      labelText(
        labelNode("label", "A choice ", [
          labelNode("select", "", [
            labelNode("option", "(no preference)"),
            labelNode("option", "Alpha"),
          ]),
        ]),
      ),
    ).toBe("A choice");

    // A <small> hint belongs under the option, not in its name.
    expect(
      labelText(
        labelNode("label", "Slow ", [
          labelNode("input", ""),
          labelNode("small", "a hint under the option"),
        ]),
      ),
    ).toBe("Slow");

    // Injected range output and status line are stripped too.
    expect(
      labelText(
        labelNode("label", "Scale ", [
          labelNode("input", ""),
          labelNode("output", "7"),
        ]),
      ),
    ).toBe("Scale");

    expect(labelText(null)).toBe("");
  });
});

describe("form submissions", () => {
  it("accepts blank, boolean, and list answers and formats them readably", () => {
    const parsed = parseSubmission({
      actionToken: "token",
      submissionId: "submission-1",
      pageHash: "b".repeat(64),
      title: "Direction",
      answers: [
        { name: "action", label: "Action", value: "Approve" },
        { name: "notes", label: "Notes", value: "" },
        { name: "enabled", label: "Enabled", value: false },
        { name: "scope", label: "Scope", value: ["Mobile", "Chrome"] },
      ],
    });

    expect(parsed).not.toBeNull();
    const message = formatSubmissionMessage(parsed!);
    expect(message).toContain("**Notes**\n(left blank)");
    expect(message).toContain("**Enabled**\nNo");
    expect(message).toContain("**Scope**\nMobile, Chrome");
  });

  it("rejects oversized or structurally invalid values", () => {
    expect(
      parseSubmission({
        actionToken: "token",
        submissionId: "submission-1",
        pageHash: "not-a-hash",
        title: "x",
        answers: [],
      }),
    ).toBeNull();
  });

  it("reports confined attachments and rejects forged upload paths", () => {
    const base = {
      actionToken: "token",
      submissionId: "submission-1",
      pageHash: "b".repeat(64),
      title: "Attachment",
      answers: [],
    };

    const parsed = parseSubmission({
      ...base,
      files: [
        {
          field: "data",
          name: "20260906-160000-a1b2c3-report.csv",
          path: "thread-page-uploads/20260906-160000-a1b2c3-report.csv",
          sizeBytes: 2048,
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(formatSubmissionMessage(parsed!)).toContain(
      "`$BB_THREAD_STORAGE/thread-page-uploads/20260906-160000-a1b2c3-report.csv`",
    );

    // A page with no attachments says nothing about files.
    expect(formatSubmissionMessage(parseSubmission(base)!)).not.toContain(
      "Attached files",
    );

    for (const bad of [
      { field: "d", name: "x", path: "../../.ssh/id_rsa", sizeBytes: 1 },
      { field: "d", name: "x", path: "thread-page-assets/x", sizeBytes: 1 },
      {
        field: "d",
        name: "x",
        path: "thread-page-uploads/../../x",
        sizeBytes: 1,
      },
      { field: "d", name: "a/b", path: "thread-page-uploads/x", sizeBytes: 1 },
      {
        field: "d",
        name: "x",
        path: "thread-page-uploads/x",
        sizeBytes: 25 * 1024 * 1024,
      },
    ]) {
      expect(parseSubmission({ ...base, files: [bad] }), bad.path).toBeNull();
    }
  });
});
