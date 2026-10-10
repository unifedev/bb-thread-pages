// The port: send/receive with validation, queue before ready (02 R4.29), request ids.
import { isShellMessage, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import type { KernelPrimitives } from "./primitives.ts";

export interface Channel {
  /** Posts now, or queues until the port is connected. Returns false only when posting threw. 02 R4.29 */
  send(message: KernelMessage, transfer?: Transferable[]): boolean;
  /** True while a port is connected. */
  ready(): boolean;
  /** Every validated shell message in arrival order; an invalid one is dropped and counted. 05 R3.9 */
  onMessage(handler: (message: ShellMessage) => void): void;
  /** The shell handed over the port: send what waited. */
  connect(port: Pick<MessagePort, "postMessage"> & Partial<Pick<MessagePort, "start" | "onmessage">>): void;
  /** A fresh request id. */
  nextId(prefix?: string): string;
  /** Messages dropped as invalid since start. */
  dropped(): number;
}

export function createChannel(prim: KernelPrimitives): Channel {
  let port: (Pick<MessagePort, "postMessage"> & Partial<Pick<MessagePort, "start" | "onmessage">>) | null = null;
  const queued: { message: KernelMessage; transfer?: Transferable[] }[] = [];
  const handlers: ((message: ShellMessage) => void)[] = [];
  let sequence = 0;
  let dropped = 0;

  function postNow(message: KernelMessage, transfer?: Transferable[]): boolean {
    if (!port) return false;
    try {
      prim.post(port, message, transfer);
      return true;
    } catch {
      return false;
    }
  }

  return {
    send(message, transfer) {
      if (!port) {
        queued.push(transfer ? { message, transfer } : { message });
        return true;
      }
      return postNow(message, transfer);
    },
    ready: () => port !== null,
    onMessage(handler) {
      handlers.push(handler);
    },
    connect(next) {
      port = next;
      prim.listen(next, (event) => {
        const data = prim.data(event);
        if (!isShellMessage(data)) {
          dropped += 1;
          return;
        }
        for (const handler of handlers) handler(data);
      });
      while (queued.length > 0) {
        const entry = queued.shift()!;
        postNow(entry.message, entry.transfer);
      }
    },
    nextId(prefix = "k") {
      sequence += 1;
      const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
      return `${prefix}-${sequence}-${random}`;
    },
    dropped: () => dropped,
  };
}
