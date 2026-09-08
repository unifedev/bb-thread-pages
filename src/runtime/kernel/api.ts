/**
 * `window.threadPage`: the complete page-facing API, frozen, non-writable and
 * non-configurable so one script cannot shim it for another. spec R4.3, R4.28–R4.33
 */
export interface ThreadPageApi {
  readonly version: 1;
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  setDirty(dirty: boolean): void;
}

export function installApi(target: Window, api: ThreadPageApi): void {
  const frozen = Object.freeze({ version: 1 as const, invoke: api.invoke, watch: api.watch, setDirty: api.setDirty });
  Object.defineProperty(target, "threadPage", { value: frozen, writable: false, configurable: false, enumerable: true });
}
