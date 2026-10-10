// `window.threadPage` frozen object: `invoke`, `watch`, `setDirty`, `embed?`, `setScope`, `scope`, `version: 1` (02 R4.3, R4.28–R4.33, R4.63–R4.65, R-K2).

export interface ThreadPageApi {
  readonly version: 1;
  invoke(method: string, params?: unknown): Promise<unknown>;
  watch(method: string, params: unknown, listener: (value: unknown, error: unknown) => void, options?: { intervalMs?: number }): () => void;
  setDirty(dirty: boolean): void;
  /** Absent on a host without the composition tier. 02 R-K2 */
  embed?(target: unknown, options: unknown): () => void;
  setScope(folder: unknown): string | null;
  readonly scope: string | null;
}

/** Defines the frozen, non-writable, non-configurable API object. 02 R4.3, R4.65 */
export function installApi(target: Window, api: ThreadPageApi): void {
  const surface: Record<string, unknown> = { version: 1, invoke: api.invoke, watch: api.watch, setDirty: api.setDirty, setScope: api.setScope };
  if (typeof api.embed === "function") surface.embed = api.embed;
  Object.defineProperty(surface, "scope", { get: () => api.scope, enumerable: true, configurable: false });
  Object.defineProperty(target, "threadPage", { value: Object.freeze(surface), writable: false, configurable: false, enumerable: true });
}
