// `invoke` and `watch` over the channel; scope per call; `watch` clamp, hidden pause, error delivery (02 R4.28–R4.32, R4.63–R4.65).
import { RESERVED_NAMESPACES } from "../../domain/capabilities/contributed.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { LIMITS } from "../../domain/limits.ts";
import { checkScope } from "../../domain/scope.ts";
import { BRIDGE_VERSION, isBridgeResponse, type BridgeRequestMessage, type BridgeResponseMessage } from "../shared/protocol.ts";

export interface BridgeClient {
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  setScope(folder: unknown): string | null;
  scope(): string | null;
  /** A port message; true when it answered a pending request. */
  receive(message: unknown): boolean;
}

/** What `invoke` rejects with: a code from the fixed set, a message, and a declared reason with its detail. 02 R4.28, R4.28a */
export class ThreadPageError extends Error {
  readonly code: BridgeErrorCode;
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

/** The capabilities that take `files`. 03 R5.75 */
const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send", "session.reply"]);

/** `files` as a page may pass it: a FileList, an array of File, or a file input. Tag checks, so it works across realms. 03 R5.75 */
export function extractFiles(value: unknown): File[] | null {
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object FileList]") return Array.from(value as FileList);
  if (tag === "[object HTMLInputElement]") return (value as HTMLInputElement).type === "file" ? Array.from((value as HTMLInputElement).files ?? []) : null;
  if (Array.isArray(value)) return value.every((item) => Object.prototype.toString.call(item) === "[object File]") ? [...(value as File[])] : null;
  return null;
}

export interface BridgeClientDeps {
  pageRevision: string;
  /** Sends a request; the channel queues before ready. 02 R4.29 */
  send(request: BridgeRequestMessage): boolean;
  nextId(): string;
  document: Document;
}

export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  let scope: string | null = null;
  let roster: Promise<Map<string, string>> | null = null;
  const doc = deps.document;

  function call(method: string, params: unknown, scopeAt: string | null): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (typeof method !== "string" || method.length === 0) {
        reject(new ThreadPageError("invalid_request", "A method name is required"));
        return;
      }
      let sent = params;
      let files: File[] | undefined;
      // Files go beside the JSON by structured clone, never inside it. 03 R5.75
      if (FILE_METHODS.has(method) && typeof params === "object" && params !== null && !Array.isArray(params) && Object.prototype.hasOwnProperty.call(params, "files")) {
        const { files: given, ...rest } = params as Record<string, unknown>;
        const extracted = given === undefined || given === null ? [] : extractFiles(given);
        if (extracted === null) {
          reject(new ThreadPageError("invalid_params", 'files must be a FileList, an array of File, or an <input type="file">'));
          return;
        }
        sent = rest;
        if (extracted.length > 0) files = extracted;
      }
      const id = deps.nextId();
      const request: BridgeRequestMessage = { v: BRIDGE_VERSION, id, method, params: sent === undefined ? null : sent, pageRevision: deps.pageRevision, ...(scopeAt !== null ? { scope: scopeAt } : {}), ...(files ? { files } : {}) };
      pending.set(id, { resolve, reject });
      if (!deps.send(request)) {
        pending.delete(id);
        reject(new ThreadPageError("unavailable", "The request could not be sent"));
      }
    });
  }

  /** Effects by method, read once from `context.get` when a page first watches a contributed method. 07 R5.54 */
  function effects(): Promise<Map<string, string>> {
    roster ??= call("context.get", null, null).then(
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

  function watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void {
    if (typeof listener !== "function") throw new TypeError("threadPage.watch needs a listener");
    const requested = options?.intervalMs;
    const interval = typeof requested === "number" && Number.isFinite(requested) ? Math.max(LIMITS.watchMinMs, Math.min(LIMITS.watchMaxMs, Math.round(requested))) : LIMITS.watchDefaultMs;
    const scopeAt = scope;
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
        if (isContributedMethod(method)) {
          const effect = (await effects()).get(method);
          if (effect !== undefined && effect !== "read") {
            stop();
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
      } else schedule(0);
    }
    function stop(): void {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      doc.removeEventListener("visibilitychange", onVisibility);
    }
    doc.addEventListener("visibilitychange", onVisibility);
    schedule(0);
    return stop;
  }

  return {
    invoke: (method, params) => call(method, params, scope),
    watch,
    setScope(folder) {
      const checked = checkScope(folder);
      if (!checked.ok) throw new TypeError(`threadPage.setScope: ${checked.message}`);
      scope = checked.scope;
      return scope;
    },
    scope: () => scope,
    receive(message) {
      if (typeof message !== "object" || message === null || "kind" in message) return false;
      const id = (message as { id?: unknown }).id;
      if (typeof id !== "string") return false;
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      if (!isBridgeResponse(message, id)) {
        entry.reject(new ThreadPageError("invalid_response", "The bridge returned an invalid response"));
        return true;
      }
      const response = message as BridgeResponseMessage;
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new ThreadPageError(response.error.code, response.error.message, response.error));
      return true;
    },
  };
}
