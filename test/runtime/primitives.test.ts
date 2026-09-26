import { afterEach, describe, expect, it } from "vitest";
import { capturePrimitives } from "../../src/runtime/kernel/primitives.ts";

/**
 * The kernel's port and its controls' handlers, out of reach of a page that
 * patches prototypes after the kernel started. Owner feedback on 1.7.0, spec R3.32a
 */
const original = {
  post: MessagePort.prototype.postMessage,
  apply: Reflect.apply,
  add: EventTarget.prototype.addEventListener,
};

afterEach(() => {
  MessagePort.prototype.postMessage = original.post;
  Reflect.apply = original.apply;
  EventTarget.prototype.addEventListener = original.add;
});

describe("the kernel's primitives", () => {
  it("post on the port with the original postMessage, whatever the page patched later", async () => {
    const prim = capturePrimitives(globalThis as unknown as Window & typeof globalThis);
    const stolen: unknown[] = [];
    MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown) {
      stolen.push(this);
      return original.post.call(this, message);
    };
    Reflect.apply = (() => {
      throw new Error("patched");
    }) as typeof Reflect.apply;
    const channel = new MessageChannel();
    const received = new Promise((resolve) => (channel.port2.onmessage = (event) => resolve(event.data)));
    prim.post(channel.port1, { kind: "thread-page:record", control: true });
    Reflect.apply = original.apply;
    expect(await received).toEqual({ kind: "thread-page:record", control: true });
    expect(stolen).toHaveLength(0);
    channel.port1.close();
    channel.port2.close();
  });

  it("raise what the original raises, and never retry through the page's method (the TypeError path)", () => {
    const prim = capturePrimitives(globalThis as unknown as Window & typeof globalThis);
    const handed: unknown[] = [];
    MessagePort.prototype.postMessage = function (this: MessagePort) {
      handed.push(this);
    };
    const channel = new MessageChannel();
    // A value the structured clone refuses: the original throws, as with a page's throwing getter.
    expect(() => prim.post(channel.port1, { run: () => undefined })).toThrow();
    expect(handed).toHaveLength(0);
    channel.port1.close();
    channel.port2.close();
  });

  it("read a message event's ports with the original getter, whatever the page patched", () => {
    const prim = capturePrimitives(globalThis as unknown as Window & typeof globalThis);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", { data: { kind: "x" }, ports: [channel.port2] });
    const getter = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "ports")!;
    const seen: unknown[] = [];
    Object.defineProperty(MessageEvent.prototype, "ports", { configurable: true, get() { seen.push(this); return []; } });
    try {
      expect(prim.ports(event)).toEqual([channel.port2]);
      expect(prim.data(event)).toEqual({ kind: "x" });
      expect(seen).toHaveLength(0);
    } finally {
      Object.defineProperty(MessageEvent.prototype, "ports", getter);
      channel.port1.close();
      channel.port2.close();
    }
  });

  it("add listeners with the original addEventListener, so a patched one never sees the handler", () => {
    const prim = capturePrimitives(globalThis as unknown as Window & typeof globalThis);
    const seen: unknown[] = [];
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: unknown) {
      seen.push(listener);
    } as typeof EventTarget.prototype.addEventListener;
    const target = new EventTarget();
    let heard = 0;
    prim.on(target, "click", () => (heard += 1));
    target.dispatchEvent(new Event("click"));
    expect(seen).toHaveLength(0);
    expect(heard).toBe(1);
  });

  it("take an event's isTrusted from the event itself: an object dressed as one, or a script's event, is not the reader", () => {
    const prim = capturePrimitives(globalThis as unknown as Window & typeof globalThis);
    expect(prim.trusted({ isTrusted: true })).toBe(false);
    expect(prim.trusted(new Event("click"))).toBe(false);
    // In browsers isTrusted is unforgeable ([LegacyUnforgeable]); the browser pass checks a script's click there.
  });
});
