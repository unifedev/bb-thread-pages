import { LIMITS } from "../../domain/limits.ts";
import { BRIDGE_VERSION, isBridgeResponse, type BridgeRequestMessage, type BridgeResponseMessage } from "../shared/protocol.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { RESERVED_NAMESPACES } from "../../domain/capabilities/contributed.ts";
import { checkScope } from "../../domain/scope.ts";

/**
 * `invoke` and `watch` as a page sees them. Calls made before the port is
 * ready are queued; every response is checked before it is trusted; a
 * failure rejects with an Error carrying a `code`. spec R4.28–R4.32
 *
 * The document's scope rides on every request from the moment it is set: an
 * `invoke` carries the scope current when it is called, a `watch` the one
 * current when it starts, so a later change never moves a call already made.
 * spec R4.63–R4.65
 */
export interface BridgeClient {
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  /** Sets the document's scope; returns it as sent, or null for none. Throws a TypeError for one the host would refuse. */
  setScope(folder: unknown): string | null;
  scope(): string | null;
  /** Called by the kernel once the shell hands over the port. */
  attach(post: (message: BridgeRequestMessage) => void): void;
  /** Called by the kernel for every port message; returns true when consumed. */
  receive(message: unknown): boolean;
}

export class ThreadPageError extends Error {
  readonly code: BridgeErrorCode;
  /** A contributed capability's declared reason and its detail. spec R4.28a */
  readonly reason?: string;
  readonly detail?: unknown;
  constructor(code: BridgeErrorCode, message: string, extra?: { reason?: string; detail?: unknown }) {
    super(message);
    this.name = "ThreadPageError";
    this.code = code;
    Object.defineProperty(this, "code", { value: code, enumerable: true, writable: false });
    if (extra?.reason !== undefined) {
      Object.defineProperty(this, "reason", { value: extra.reason, enumerable: true, writable: false });
      if (extra.detail !== undefined) Object.defineProperty(this, "detail", { value: extra.detail, enumerable: true, writable: false });
    }
  }
}

function isContributedMethod(method: string): boolean {
  const dot = method.indexOf(".");
  return dot > 0 && !RESERVED_NAMESPACES.has(method.slice(0, dot));
}

/** The capabilities that take `files`. spec R5.75 */
const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send"]);

/**
 * `files` as a page may pass it — a FileList, an array of File, or an
 * `<input type="file">` — as the Files themselves, or null when it is none of
 * those. Tag checks, not `instanceof`, so it works across realms. spec R5.75
 */
export function extractFiles(value: unknown): File[] | null {
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object FileList]") return Array.from(value as FileList);
  if (tag === "[object HTMLInputElement]") return (value as HTMLInputElement).type === "file" ? Array.from((value as HTMLInputElement).files ?? []) : null;
  if (Array.isArray(value)) return value.every((item) => Object.prototype.toString.call(item) === "[object File]") ? [...(value as File[])] : null;
  return null;
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
  let roster: Promise<Map<string, string>> | null = null;
  let scope: string | null = null;

  /** Effects by method, read once from `context.get` when a page first watches a contributed method. */
  function effects(): Promise<Map<string, string>> {
    roster ??= invoke("context.get").then(
      (value) => {
        const list = (value as { capabilities?: { method?: unknown; effect?: unknown }[] } | null)?.capabilities ?? [];
        return new Map(list.map((entry) => [String(entry.method), String(entry.effect)]));
      },
      (error: unknown) => {
        roster = null;
        throw error;
      },
    );
    return roster;
  }

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
    return call(method, params, scope);
  }

  function call(method: string, params: unknown, scopeAt: string | null): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (typeof method !== "string") {
        reject(new ThreadPageError("invalid_request", "A method name is required"));
        return;
      }
      const id = nextId();
      let sent = params;
      let files: File[] | undefined;
      // The files go to the shell by structured clone, beside the JSON parameters, never in them. spec R5.75
      if (FILE_METHODS.has(method) && typeof params === "object" && params !== null && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, "files")) {
        const { files: given, ...rest } = params as Record<string, unknown>;
        // `files: undefined` is no files, like an empty list.
        const extracted = given === undefined ? [] : extractFiles(given);
        if (extracted === null) {
          reject(new ThreadPageError("invalid_params", "files must be a FileList, an array of File, or an <input type=\"file\">"));
          return;
        }
        sent = rest;
        if (extracted.length > 0) files = extracted;
      }
      const request: BridgeRequestMessage = { v: BRIDGE_VERSION, id, method, params: sent === undefined ? null : sent, pageRevision, ...(scopeAt !== null ? { scope: scopeAt } : {}), ...(files ? { files } : {}) };
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
    const scopeAt = scope;

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
        // A contributed method is polled only when it reads. spec R5.54
        if (isContributedMethod(method)) {
          const effect = (await effects()).get(method);
          if (effect !== undefined && effect !== "read") {
            stopped = true;
            doc.removeEventListener("visibilitychange", onVisibility);
            listener(undefined, new ThreadPageError("invalid_params", `watch polls read capabilities only; ${method} is ${effect}`));
            return;
          }
        }
        const value = await call(method, params, scopeAt);
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
    setScope(folder) {
      const checked = checkScope(folder);
      if (!checked.ok) throw new TypeError(`Thread Page scope: ${checked.message}`);
      scope = checked.scope;
      return scope;
    },
    scope: () => scope,
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
      else entry.reject(new ThreadPageError(response.error.code, response.error.message, response.error));
      return true;
    },
  };
}
