/**
 * The platform functions the kernel talks to the shell with, taken when the
 * kernel starts — before any script of the page runs (R4.1). A page that
 * later replaces `MessagePort.prototype.postMessage`, the `onmessage` setter,
 * `MessageEvent.prototype.ports`, `EventTarget.prototype.addEventListener`,
 * `Element.prototype.attachShadow` or `Reflect.apply` does not see the port,
 * cannot post on it, and cannot reach the text-area controls' handlers.
 *
 * This is hardening, not a boundary: the kernel runs in the page's realm and
 * its controls are page territory (R3.33). What it protects is the one thing
 * the shell takes the kernel's word for — that the reader pressed the
 * kernel's own Dictate control — so a page must break the kernel itself, not
 * merely patch a prototype, to claim that.
 */
export interface KernelPrimitives {
  /** Posts on a port with the original `postMessage`. */
  post(port: Pick<MessagePort, "postMessage">, message: unknown): void;
  /** Sets a port's handler and starts it, with the original setter and `start`. */
  listen(port: Partial<Pick<MessagePort, "start" | "onmessage">>, handler: (event: MessageEvent) => void): void;
  /** A message event's `data`, `source` and `ports`, read with the original getters. */
  data(event: MessageEvent): unknown;
  source(event: MessageEvent): MessageEventSource | null;
  ports(event: MessageEvent): readonly MessagePort[];
  /** Whether an event came from the reader — a real event whose `isTrusted` is true — however it was handed over. */
  trusted(event: unknown): boolean;
  /** Adds a listener with the original `addEventListener`, so the handler is never handed to page code. */
  on(target: EventTarget, type: string, listener: (event: Event) => void): void;
  /** Stops an event reaching any other listener, with the original method: the port the shell hands over is the kernel's alone. */
  stop(event: Event): void;
  /** Attaches a shadow root with the original `attachShadow`. */
  attachShadow(element: Element, init: ShadowRootInit): ShadowRoot;
}

type Getter<T> = ((this: unknown) => T) | undefined;

function getter<T>(prototype: object | undefined, name: string): Getter<T> {
  if (!prototype) return undefined;
  return Object.getOwnPropertyDescriptor(prototype, name)?.get as Getter<T>;
}

export function capturePrimitives(win: Window & typeof globalThis): KernelPrimitives {
  const apply = Reflect.apply;
  const portProto = (win as unknown as { MessagePort?: { prototype: MessagePort } }).MessagePort?.prototype;
  const postMessage = portProto?.postMessage;
  const start = portProto?.start;
  const setOnMessage = Object.getOwnPropertyDescriptor(portProto ?? {}, "onmessage")?.set;
  const eventProto = (win as unknown as { MessageEvent?: { prototype: MessageEvent } }).MessageEvent?.prototype;
  const readData = getter<unknown>(eventProto, "data");
  const readSource = getter<MessageEventSource | null>(eventProto, "source");
  const readPorts = getter<readonly MessagePort[]>(eventProto, "ports");
  // `isTrusted` is unforgeable: every Event carries its own accessor. One of them, taken now, reads any event's.
  let readTrusted: Getter<boolean>;
  try {
    readTrusted = Object.getOwnPropertyDescriptor(new win.Event("thread-page:probe"), "isTrusted")?.get as Getter<boolean>;
  } catch {
    readTrusted = undefined;
  }
  const addEventListener = win.EventTarget?.prototype.addEventListener;
  const attach = win.Element?.prototype.attachShadow;
  const stopImmediate = win.Event?.prototype.stopImmediatePropagation;

  /** The original, applied to a real object; a stand-in in the kernel's tests takes its own method. */
  function call<T>(fn: ((...args: never[]) => T) | undefined, self: unknown, args: unknown[], fallback: () => T): T {
    if (typeof fn !== "function") return fallback();
    try {
      return apply(fn as (...args: unknown[]) => T, self, args);
    } catch (error) {
      if (error instanceof TypeError) return fallback();
      throw error;
    }
  }

  return {
    post(port, message) {
      call(postMessage as never, port, [message], () => port.postMessage(message));
    },
    listen(port, handler) {
      call(setOnMessage as never, port, [handler], () => {
        (port as { onmessage: unknown }).onmessage = handler;
      });
      call(start as never, port, [], () => port.start?.());
    },
    data: (event) => call(readData as never, event, [], () => event.data),
    source: (event) => call(readSource as never, event, [], () => event.source),
    ports: (event) => call(readPorts as never, event, [], () => event.ports) ?? [],
    trusted(event) {
      if (typeof readTrusted !== "function") return false;
      try {
        return apply(readTrusted, event, []) === true;
      } catch {
        // Not an event at all: an object dressed as one.
        return false;
      }
    },
    on(target, type, listener) {
      call(addEventListener as never, target, [type, listener], () => target.addEventListener(type, listener));
    },
    stop(event) {
      call(stopImmediate as never, event, [], () => event.stopImmediatePropagation());
    },
    attachShadow(element, init) {
      return call(attach as never, element, [init], () => element.attachShadow(init));
    },
  };
}
