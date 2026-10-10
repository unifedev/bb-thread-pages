// Platform functions captured before any page script runs (`postMessage`, `addEventListener`, `Reflect.apply`, `attachShadow`, …), so a page that patches the platform later is never handed the port or the layer (02 R4.1; 05 R3.33).

/** The layer's DOM operations, each through the original taken at start. */
export interface LayerDom {
  create(tag: string): HTMLElement;
  attachShadow(element: Element, init: ShadowRootInit): ShadowRoot;
  setAttribute(element: Element, name: string, value: string): void;
  removeAttribute(element: Element, name: string): void;
  setHidden(element: HTMLElement, hidden: boolean): void;
  isHidden(element: HTMLElement): boolean;
  setText(node: Node, text: string): void;
  setHtml(element: Element, html: string): void;
  append(parent: Element | ShadowRoot, ...children: Node[]): void;
  replaceChildren(parent: Element, ...children: Node[]): void;
  remove(node: Element): void;
  query<T extends Element>(parent: Element | ShadowRoot | Document, selector: string): T | null;
  queryAll<T extends Element>(parent: Element | ShadowRoot | Document, selector: string): T[];
  rect(element: Element): DOMRect;
  focus(element: HTMLElement): void;
  click(element: HTMLElement): void;
  files(input: HTMLInputElement): File[];
  style(element: HTMLElement, property: string, value: string): void;
  computed(element: Element): CSSStyleDeclaration;
  lastChild(element: Element): Element | null;
}

export interface KernelPrimitives {
  /** Posts on a port with the original `postMessage`; what it throws is thrown. */
  post(port: Pick<MessagePort, "postMessage">, message: unknown, transfer?: Transferable[]): void;
  /** Sets a port's handler and starts it, with the original setter and `start`. */
  listen(port: Partial<Pick<MessagePort, "start" | "onmessage">>, handler: (event: MessageEvent) => void): void;
  data(event: MessageEvent): unknown;
  source(event: MessageEvent): MessageEventSource | null;
  ports(event: MessageEvent): readonly MessagePort[];
  /** Whether an event came from the reader: a real event whose `isTrusted` is true. */
  trusted(event: unknown): boolean;
  key(event: Event): { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean };
  prevented(event: Event): boolean;
  preventDefault(event: Event): void;
  on(target: EventTarget, type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void;
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

/** Takes the originals now; where one is missing (a test DOM) the object's own member is used. 02 R4.1 */
export function capturePrimitives(win: Window & typeof globalThis): KernelPrimitives {
  const apply = Reflect.apply;
  const proto = (name: string) => (win as unknown as Record<string, { prototype: object } | undefined>)[name]?.prototype;
  const method = (name: string, member: string) => own(proto(name), member)?.value as Fn | undefined;
  const getter = (name: string, member: string) => own(proto(name), member)?.get as Fn | undefined;
  const setter = (name: string, member: string) => own(proto(name), member)?.set as Fn | undefined;
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
    readTrusted = Object.getOwnPropertyDescriptor(new win.Event("probe"), "isTrusted")?.get as Fn | undefined;
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
  const addEventListener = method("EventTarget", "addEventListener");
  const createElement = method("Document", "createElement");
  const attach = method("Element", "attachShadow");
  const setAttribute = method("Element", "setAttribute");
  const removeAttribute = method("Element", "removeAttribute");
  const hiddenSet = setter("HTMLElement", "hidden");
  const hiddenGet = getter("HTMLElement", "hidden");
  const textSet = setter("Node", "textContent");
  const htmlSet = setter("Element", "innerHTML");
  const elementAppend = method("Element", "append");
  const fragmentAppend = method("DocumentFragment", "append");
  const replaceChildren = method("Element", "replaceChildren");
  const removeNode = method("Element", "remove");
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
  const inputFiles = getter("HTMLInputElement", "files");
  const lastElementChild = getter("Element", "lastElementChild");
  const nodeType = getter("Node", "nodeType");
  const computedStyle = win.getComputedStyle;
  const arrayFrom = Array.from;
  const doc = win.document;
  const isFragment = (node: unknown) => call(nodeType, node, [], () => (node as Node).nodeType) === 11;
  const queryFn = (parent: unknown) => (parent === doc ? documentQuery : isFragment(parent) ? fragmentQuery : elementQuery);
  const queryAllFn = (parent: unknown) => (parent === doc ? documentQueryAll : isFragment(parent) ? fragmentQueryAll : elementQueryAll);

  const dom: LayerDom = {
    create: (tag) => call(createElement, doc, [tag], () => doc.createElement(tag)),
    attachShadow: (element, init) => call(attach, element, [init], () => element.attachShadow(init)),
    setAttribute: (element, name, value) => call(setAttribute, element, [name, value], () => element.setAttribute(name, value)),
    removeAttribute: (element, name) => call(removeAttribute, element, [name], () => element.removeAttribute(name)),
    setHidden: (element, hidden) =>
      call(hiddenSet, element, [hidden], () => {
        element.hidden = hidden;
      }),
    isHidden: (element) => call(hiddenGet, element, [], () => element.hidden) === true,
    setText: (node, text) =>
      call(textSet, node, [text], () => {
        node.textContent = text;
      }),
    setHtml: (element, html) =>
      call(htmlSet, element, [html], () => {
        element.innerHTML = html;
      }),
    append: (parent, ...children) => call(isFragment(parent) ? fragmentAppend : elementAppend, parent, children, () => parent.append(...children)),
    replaceChildren: (parent, ...children) => call(replaceChildren, parent, children, () => parent.replaceChildren(...children)),
    remove: (node) => call(removeNode, node, [], () => node.remove()),
    query: <T extends Element>(parent: Element | ShadowRoot | Document, selector: string) => call(queryFn(parent), parent, [selector], () => parent.querySelector<T>(selector)) as T | null,
    queryAll: <T extends Element>(parent: Element | ShadowRoot | Document, selector: string) => arrayFrom(call(queryAllFn(parent), parent, [selector], () => parent.querySelectorAll<T>(selector)) as NodeListOf<T>),
    rect: (element) => call(rect, element, [], () => element.getBoundingClientRect()),
    focus: (element) => call(focus, element, [], () => element.focus()),
    click: (element) => call(click, element, [], () => element.click()),
    files: (input) => arrayFrom((call(inputFiles, input, [], () => input.files) as FileList | null) ?? []),
    style(element, property, value) {
      const declaration = call(styleGet, element, [], () => element.style) as CSSStyleDeclaration;
      call(setProperty, declaration, [property, value], () => declaration.setProperty(property, value));
    },
    computed: (element) => apply(computedStyle, win, [element]) as CSSStyleDeclaration,
    lastChild: (element) => call(lastElementChild, element, [], () => element.lastElementChild) as Element | null,
  };

  return {
    post: (port, message, transfer) => call(postMessage, port, transfer ? [message, transfer] : [message], () => (transfer ? port.postMessage(message, transfer) : port.postMessage(message))),
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
    dom,
  };
}
