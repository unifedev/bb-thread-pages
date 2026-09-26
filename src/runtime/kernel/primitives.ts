/**
 * The platform functions the kernel talks to the shell with, and those it
 * builds its text-area layer with, taken when the kernel starts — before any
 * script of the page runs (R4.1) — and called through a `Reflect.apply` taken
 * then too.
 *
 * What this holds, once taken:
 * - A page that later replaces `MessagePort.prototype.postMessage`, the port's
 *   `onmessage` setter or `start`, `MessageEvent.prototype.data`/`source`/
 *   `ports`, `Reflect.apply` or `stopImmediatePropagation` is not handed the
 *   port: the kernel never calls a live method on it, and an error the
 *   original raises is raised, not retried through the page's version.
 * - Nodes of the layer's closed shadow root are created, changed, measured
 *   and focused through the originals, so a patched `createElement`,
 *   `setAttribute`, `hidden`, `innerHTML`, `textContent`, `style`,
 *   `getBoundingClientRect`, `focus`, `querySelector`… is not handed them;
 *   events inside the layer are read through the original getters.
 * - `isTrusted` is read with an accessor taken from a real event, so an object
 *   dressed as an event, or a script's event, is never the reader.
 *
 * What it does not hold: the kernel runs in the page's realm and its controls
 * are page territory (R3.33). A page can still cover, hide or remove the
 * layer, lure the reader into pressing a control, or break the kernel before
 * a gesture reaches it; it cannot make the shell record without the shell's
 * own bar and the reader's Done.
 *
 * Where an original is missing when the kernel starts (the kernel's jsdom
 * tests; no such browser is supported), the object's own method is used.
 */
export interface LayerDom {
  create(tag: string): HTMLElement;
  attachShadow(element: Element, init: ShadowRootInit): ShadowRoot;
  setAttribute(element: Element, name: string, value: string): void;
  removeAttribute(element: Element, name: string): void;
  getAttribute(element: Element, name: string): string | null;
  setHidden(element: HTMLElement, hidden: boolean): void;
  isHidden(element: HTMLElement): boolean;
  setText(node: Node, text: string): void;
  getText(node: Node): string;
  setHtml(element: Element, html: string): void;
  setClass(element: Element, name: string): void;
  setTitle(element: HTMLElement, title: string): void;
  setTabIndex(element: HTMLElement, index: number): void;
  setProp(element: Element, name: "type" | "multiple" | "value", value: unknown): void;
  append(parent: Element | ShadowRoot, ...children: Node[]): void;
  replaceChildren(parent: Element, ...children: Node[]): void;
  remove(node: Element): void;
  children(parent: Element): Element[];
  query<T extends Element>(parent: Element | ShadowRoot | Document, selector: string): T | null;
  queryAll<T extends Element>(parent: Element | ShadowRoot | Document, selector: string): T[];
  rect(element: Element): DOMRect;
  focus(element: HTMLElement): void;
  click(element: HTMLElement): void;
  files(input: HTMLInputElement): File[];
  /** The element's `checkVisibility(options)`, or null where the engine has none. */
  checkVisibility(element: Element, options: Record<string, boolean>): boolean | null;
  /** `document.documentElement.lastElementChild`, read with the original getter. */
  lastChild(element: Element): Element | null;
  /** Sets a CSS property on the element's inline style. */
  style(element: HTMLElement, property: string, value: string): void;
  computed(element: Element): CSSStyleDeclaration;
}

export interface KernelPrimitives {
  /** Posts on a port with the original `postMessage`; what it throws is thrown. */
  post(port: Pick<MessagePort, "postMessage">, message: unknown): void;
  /** Sets a port's handler and starts it, with the original setter and `start`. */
  listen(port: Partial<Pick<MessagePort, "start" | "onmessage">>, handler: (event: MessageEvent) => void): void;
  /** A message event's `data`, `source` and `ports`, read with the original getters. */
  data(event: MessageEvent): unknown;
  source(event: MessageEvent): MessageEventSource | null;
  ports(event: MessageEvent): readonly MessagePort[];
  /** Whether an event came from the reader — a real event whose `isTrusted` is true — however it was handed over. */
  trusted(event: unknown): boolean;
  /** A keyboard event's key and modifiers, and `defaultPrevented`, read with the original getters. */
  key(event: Event): { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean };
  prevented(event: Event): boolean;
  preventDefault(event: Event): void;
  /** Adds a listener with the original `addEventListener`, so the handler is never handed to page code. */
  on(target: EventTarget, type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void;
  /** Stops an event reaching any other listener, with the original method. */
  stop(event: Event): void;
  /** The layer's DOM operations, through the originals. */
  dom: LayerDom;
}

type Fn = (...args: never[]) => unknown;

function own(prototype: object | undefined, name: string): PropertyDescriptor | undefined {
  for (let proto = prototype; proto; proto = Object.getPrototypeOf(proto) as object | undefined) {
    const found = Object.getOwnPropertyDescriptor(proto, name);
    if (found) return found;
  }
  return undefined;
}

export function capturePrimitives(win: Window & typeof globalThis): KernelPrimitives {
  const apply = Reflect.apply;
  const proto = (name: string) => (win as unknown as Record<string, { prototype: object } | undefined>)[name]?.prototype;
  const method = (name: string, member: string) => own(proto(name), member)?.value as Fn | undefined;
  const getter = (name: string, member: string) => own(proto(name), member)?.get as Fn | undefined;
  const setter = (name: string, member: string) => own(proto(name), member)?.set as Fn | undefined;

  /** The original applied — its errors are the caller's — or, only where there was none to take, the object's own. */
  function call<T>(fn: Fn | undefined, self: unknown, args: unknown[], missing: () => T): T {
    return typeof fn === "function" ? (apply(fn, self, args) as T) : missing();
  }

  const postMessage = method("MessagePort", "postMessage");
  const start = method("MessagePort", "start");
  const setOnMessage = setter("MessagePort", "onmessage");
  const readData = getter("MessageEvent", "data");
  const readSource = getter("MessageEvent", "source");
  const readPorts = getter("MessageEvent", "ports");
  let readTrusted: Fn | undefined;
  try {
    // `isTrusted` is unforgeable: every Event carries its own accessor. One of them, taken now, reads any event's.
    readTrusted = Object.getOwnPropertyDescriptor(new win.Event("thread-page:probe"), "isTrusted")?.get as Fn | undefined;
  } catch {
    readTrusted = undefined;
  }
  const readKey = getter("KeyboardEvent", "key");
  const readShift = getter("KeyboardEvent", "shiftKey");
  const readAlt = getter("KeyboardEvent", "altKey");
  const readCtrl = getter("KeyboardEvent", "ctrlKey");
  const readMeta = getter("KeyboardEvent", "metaKey");
  const readPrevented = getter("Event", "defaultPrevented");
  const preventDefault = method("Event", "preventDefault");
  const stopImmediate = method("Event", "stopImmediatePropagation");
  const addEventListener = method("EventTarget", "addEventListener");

  const createElement = method("Document", "createElement");
  const attach = method("Element", "attachShadow");
  const setAttribute = method("Element", "setAttribute");
  const removeAttribute = method("Element", "removeAttribute");
  const getAttribute = method("Element", "getAttribute");
  const hiddenSet = setter("HTMLElement", "hidden");
  const hiddenGet = getter("HTMLElement", "hidden");
  const textSet = setter("Node", "textContent");
  const textGet = getter("Node", "textContent");
  const htmlSet = setter("Element", "innerHTML");
  const classSet = setter("Element", "className");
  const titleSet = setter("HTMLElement", "title");
  const tabSet = setter("HTMLElement", "tabIndex");
  const buttonType = setter("HTMLButtonElement", "type");
  const inputType = setter("HTMLInputElement", "type");
  const inputMultiple = setter("HTMLInputElement", "multiple");
  const inputValue = setter("HTMLInputElement", "value");
  const inputFiles = getter("HTMLInputElement", "files");
  const elementAppend = method("Element", "append");
  const fragmentAppend = method("DocumentFragment", "append");
  const replaceChildren = method("Element", "replaceChildren");
  const removeNode = method("Element", "remove");
  const childrenGet = getter("Element", "children");
  const elementQuery = method("Element", "querySelector");
  const elementQueryAll = method("Element", "querySelectorAll");
  const fragmentQuery = method("DocumentFragment", "querySelector");
  const fragmentQueryAll = method("DocumentFragment", "querySelectorAll");
  const documentQuery = method("Document", "querySelector");
  const documentQueryAll = method("Document", "querySelectorAll");
  const rect = method("Element", "getBoundingClientRect");
  const focus = method("HTMLElement", "focus");
  const click = method("HTMLElement", "click");
  const styleGet = getter("HTMLElement", "style");
  const setProperty = method("CSSStyleDeclaration", "setProperty");
  const computedStyle = win.getComputedStyle;
  const checkVisibility = method("Element", "checkVisibility");
  const lastElementChild = getter("Element", "lastElementChild");
  const arrayFrom = Array.from;
  const doc = win.document;

  const isDocument = (node: unknown) => node === doc;
  const nodeType = getter("Node", "nodeType");
  // A shadow root is a document fragment (11), read without touching any accessor of its own.
  const isFragment = (node: unknown) => call(nodeType, node, [], () => (node as Node).nodeType) === 11;
  const queryFn = (parent: unknown) => (isDocument(parent) ? documentQuery : isFragment(parent) ? fragmentQuery : elementQuery);
  const queryAllFn = (parent: unknown) => (isDocument(parent) ? documentQueryAll : isFragment(parent) ? fragmentQueryAll : elementQueryAll);

  const dom: LayerDom = {
    create: (tag) => call(createElement, doc, [tag], () => doc.createElement(tag)),
    attachShadow: (element, init) => call(attach, element, [init], () => element.attachShadow(init)),
    setAttribute: (element, name, value) => call(setAttribute, element, [name, value], () => element.setAttribute(name, value)),
    removeAttribute: (element, name) => call(removeAttribute, element, [name], () => element.removeAttribute(name)),
    getAttribute: (element, name) => call(getAttribute, element, [name], () => element.getAttribute(name)),
    setHidden: (element, hidden) =>
      call(hiddenSet, element, [hidden], () => {
        element.hidden = hidden;
      }),
    isHidden: (element) => call(hiddenGet, element, [], () => element.hidden) === true,
    setText: (node, text) =>
      call(textSet, node, [text], () => {
        node.textContent = text;
      }),
    getText: (node) => String(call(textGet, node, [], () => node.textContent) ?? ""),
    setHtml: (element, html) =>
      call(htmlSet, element, [html], () => {
        element.innerHTML = html;
      }),
    setClass: (element, name) =>
      call(classSet, element, [name], () => {
        element.className = name;
      }),
    setTitle: (element, title) =>
      call(titleSet, element, [title], () => {
        element.title = title;
      }),
    setTabIndex: (element, index) =>
      call(tabSet, element, [index], () => {
        element.tabIndex = index;
      }),
    setProp(element, name, value) {
      const tag = element.tagName;
      const fn = name === "type" ? (tag === "BUTTON" ? buttonType : inputType) : name === "multiple" ? inputMultiple : inputValue;
      call(fn, element, [value], () => {
        (element as unknown as Record<string, unknown>)[name] = value;
      });
    },
    append: (parent, ...children) => call(isFragment(parent) ? fragmentAppend : elementAppend, parent, children, () => parent.append(...children)),
    replaceChildren: (parent, ...children) => call(replaceChildren, parent, children, () => parent.replaceChildren(...children)),
    remove: (node) => call(removeNode, node, [], () => node.remove()),
    children: (parent) => arrayFrom(call(childrenGet, parent, [], () => parent.children) as HTMLCollection),
    query: <T extends Element>(parent: Element | ShadowRoot | Document, selector: string) => call(queryFn(parent), parent, [selector], () => parent.querySelector<T>(selector)) as T | null,
    queryAll: <T extends Element>(parent: Element | ShadowRoot | Document, selector: string) =>
      arrayFrom(call(queryAllFn(parent), parent, [selector], () => parent.querySelectorAll<T>(selector)) as NodeListOf<T>),
    rect: (element) => call(rect, element, [], () => element.getBoundingClientRect()),
    focus: (element) => call(focus, element, [], () => element.focus()),
    click: (element) => call(click, element, [], () => element.click()),
    files: (input) => arrayFrom((call(inputFiles, input, [], () => input.files) as FileList | null) ?? []),
    style(element, property, value) {
      const declaration = call(styleGet, element, [], () => element.style) as CSSStyleDeclaration;
      call(setProperty, declaration, [property, value], () => declaration.setProperty(property, value));
    },
    computed: (element) => apply(computedStyle, win, [element]) as CSSStyleDeclaration,
    checkVisibility: (element, options) => (typeof checkVisibility === "function" ? apply(checkVisibility, element, [options]) === true : null),
    lastChild: (element) => call(lastElementChild, element, [], () => element.lastElementChild) as Element | null,
  };

  return {
    post: (port, message) => call(postMessage, port, [message], () => port.postMessage(message)),
    listen(port, handler) {
      call(setOnMessage, port, [handler], () => {
        (port as { onmessage: unknown }).onmessage = handler;
      });
      call(start, port, [], () => port.start?.());
    },
    data: (event) => call(readData, event, [], () => event.data),
    source: (event) => call(readSource, event, [], () => event.source) as MessageEventSource | null,
    ports: (event) => (call(readPorts, event, [], () => event.ports) as readonly MessagePort[] | null) ?? [],
    trusted(event) {
      if (typeof readTrusted !== "function") return false;
      try {
        return apply(readTrusted, event, []) === true;
      } catch {
        // Not an event at all: an object dressed as one.
        return false;
      }
    },
    key: (event) => {
      const keyboard = event as KeyboardEvent;
      return {
        key: String(call(readKey, event, [], () => keyboard.key) ?? ""),
        shift: call(readShift, event, [], () => keyboard.shiftKey) === true,
        alt: call(readAlt, event, [], () => keyboard.altKey) === true,
        ctrl: call(readCtrl, event, [], () => keyboard.ctrlKey) === true,
        meta: call(readMeta, event, [], () => keyboard.metaKey) === true,
      };
    },
    prevented: (event) => call(readPrevented, event, [], () => event.defaultPrevented) === true,
    preventDefault: (event) => call(preventDefault, event, [], () => event.preventDefault()),
    on: (target, type, listener, options) => call(addEventListener, target, [type, listener, options], () => target.addEventListener(type, listener, options)),
    stop: (event) => call(stopImmediate, event, [], () => event.stopImmediatePropagation()),
    dom,
  };
}
