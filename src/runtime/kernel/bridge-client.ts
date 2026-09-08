import { LIMITS } from "../../domain/limits.ts";
import { BRIDGE_VERSION, isBridgeResponse, type BridgeRequestMessage, type BridgeResponseMessage } from "../shared/protocol.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";

/**
 * `invoke` and `watch` as a page sees them. Calls made before the port is
 * ready are queued; every response is checked before it is trusted; a
 * failure rejects with an Error carrying a `code`. spec R4.28–R4.32
 */
export interface BridgeClient {
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  /** Called by the kernel once the shell hands over the port. */
  attach(post: (message: BridgeRequestMessage) => void): void;
  /** Called by the kernel for every port message; returns true when consumed. */
  receive(message: unknown): boolean;
}

export class ThreadPageError extends Error {
  readonly code: BridgeErrorCode;
  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.name = "ThreadPageError";
    this.code = code;
    Object.defineProperty(this, "code", { value: code, enumerable: true, writable: false });
  }
}

interface Pending {
  request: BridgeRequestMessage;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export function createBridgeClient(pageRevision: string, doc: Document): BridgeClient {
  const pending = new Map<string, Pending>();
  const queued: string[] = [];
  let post: ((message: BridgeRequestMessage) => void) | null = null;
  let sequence = 0;

  function nextId(): string {
    sequence += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${sequence}`;
    return `tp-${random}`;
  }

  function send(id: string): void {
    const entry = pending.get(id);
    if (!entry || !post) return;
    try {
      post(entry.request);
    } catch (error) {
      pending.delete(id);
      entry.reject(new ThreadPageError("invalid_request", error instanceof Error ? error.message : "The request could not be sent"));
    }
  }

  function invoke(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (typeof method !== "string") {
        reject(new ThreadPageError("invalid_request", "A method name is required"));
        return;
      }
      const id = nextId();
      const request: BridgeRequestMessage = { v: BRIDGE_VERSION, id, method, params: params === undefined ? null : params, pageRevision };
      pending.set(id, { request, resolve, reject });
      if (post) send(id);
      else queued.push(id);
    });
  }

  function watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void {
    if (typeof listener !== "function") throw new TypeError("Thread Page watch needs a listener");
    const requested = options?.intervalMs;
    const interval = typeof requested === "number" && Number.isFinite(requested)
      ? Math.max(LIMITS.watchMinMs, Math.min(LIMITS.watchMaxMs, Math.round(requested)))
      : LIMITS.watchDefaultMs;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule(delay: number): void {
      if (stopped) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(tick, delay);
    }
    async function tick(): Promise<void> {
      timer = null;
      if (stopped || running || doc.visibilityState === "hidden") return;
      running = true;
      try {
        const value = await invoke(method, params);
        if (!stopped) listener(value, null);
      } catch (error) {
        if (!stopped) listener(undefined, error);
      } finally {
        running = false;
        if (!stopped) schedule(interval);
      }
    }
    function onVisibility(): void {
      if (stopped) return;
      if (doc.visibilityState === "hidden") {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else {
        schedule(0);
      }
    }
    doc.addEventListener("visibilitychange", onVisibility);
    schedule(0);
    return () => {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      doc.removeEventListener("visibilitychange", onVisibility);
    };
  }

  return {
    invoke,
    watch,
    attach(poster) {
      post = poster;
      while (queued.length > 0) {
        const id = queued.shift();
        if (id) send(id);
      }
    },
    receive(message) {
      if (typeof message !== "object" || message === null) return false;
      const id = (message as { id?: unknown }).id;
      if (typeof id !== "string") return false;
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      if (!isBridgeResponse(message, id)) {
        entry.reject(new ThreadPageError("invalid_response", "The Thread Page bridge returned an invalid response"));
        return true;
      }
      const response = message as BridgeResponseMessage;
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new ThreadPageError(response.error.code, response.error.message));
      return true;
    },
  };
}
