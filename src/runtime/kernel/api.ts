/**
 * `window.threadPage`: the complete page-facing API, frozen, non-writable and
 * non-configurable so one script cannot shim it for another. spec R4.3, R4.28–R4.33, R4.42
 */
export interface ThreadPageApi {
  readonly version: 1;
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  setDirty(dirty: boolean): void;
  /** Shows another session's page in `target`; returns a stop function. spec R4.42 */
  embed(target: unknown, options: unknown): () => void;
  /**
   * Scopes this document's later calls to a folder inside the session's
   * folder, or back to the folder itself with null. Returns the scope as it
   * will be sent. spec R4.63–R4.65
   */
  setScope(folder: unknown): string | null;
  /** The document's scope, or null. */
  readonly scope: string | null;
}

export function installApi(target: Window, api: ThreadPageApi): void {
  const surface = { version: 1 as const, invoke: api.invoke, watch: api.watch, setDirty: api.setDirty, embed: api.embed, setScope: api.setScope };
  // Read through to the kernel, so the frozen object still reports the current scope.
  Object.defineProperty(surface, "scope", { get: () => api.scope, enumerable: true, configurable: false });
  const frozen = Object.freeze(surface);
  Object.defineProperty(target, "threadPage", { value: frozen, writable: false, configurable: false, enumerable: true });
}
