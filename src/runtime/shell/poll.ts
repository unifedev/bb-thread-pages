import type { ShellConfig } from "../shared/protocol.ts";

/**
 * The revision poll: a conditional GET of the document every few seconds
 * while the tab is visible. It carries the working indicator and the
 * source state, so no second channel exists. spec R2.17–R2.26
 */
export interface PollView {
  setStatus(text: string, warn: boolean): void;
  setWorking(working: boolean): void;
  showReload(visible: boolean): void;
  onStaleChanged(stale: boolean): void;
  reloadView(): void;
}

export interface Poller {
  start(): void;
  setDirty(dirty: boolean): void;
  /** For tests: run one poll now. */
  pollNow(): Promise<void>;
  isStopped(): boolean;
}

export function createPoller(win: Window, config: ShellConfig, view: PollView, fetchImpl: typeof fetch = win.fetch.bind(win)): Poller {
  let etag = `"${config.pageRevision}"`;
  let dirty = false;
  let stopped = false;
  let polling = false;
  let lastStale = config.stale;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  function schedule(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (stopped || win.document.visibilityState !== "visible") return;
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, delay);
  }

  function pause(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  }

  function newVersion(): void {
    if (dirty) {
      view.setStatus("Page changed — reload when ready", true);
      view.showReload(true);
    } else {
      view.reloadView();
    }
  }

  async function poll(): Promise<void> {
    if (stopped || polling || win.document.visibilityState !== "visible") return;
    if (Date.now() >= config.expiresAt - 30_000) {
      stopped = true;
      if (dirty) {
        view.setStatus("Session expiring — reload when ready", true);
        view.showReload(true);
      } else {
        view.reloadView();
      }
      return;
    }
    polling = true;
    controller = new AbortController();
    try {
      const response = await fetchImpl(config.documentUrl, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "if-none-match": etag },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        view.setStatus("Session expired — reload this page", true);
        view.showReload(true);
        return;
      }
      if (!response.ok && response.status !== 304) {
        view.setStatus("Page unavailable", true);
        return;
      }
      const stale = response.headers.get("x-thread-page-stale") === "true";
      view.setWorking(response.headers.get("x-thread-page-activity") === "working");
      if (stale !== lastStale) {
        lastStale = stale;
        view.onStaleChanged(stale);
      }
      view.setStatus(stale ? "Offline copy — read-only" : "", stale);
      const next = response.headers.get("etag");
      if (next && next !== etag) {
        etag = next;
        newVersion();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) view.setStatus("Cannot check for updates", true);
    } finally {
      controller = null;
      polling = false;
      schedule(config.pollMs);
    }
  }

  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "visible") schedule(0);
    else pause();
  });

  return {
    start: () => schedule(config.pollMs),
    setDirty: (next) => {
      dirty = next;
    },
    pollNow: () => poll(),
    isStopped: () => stopped,
  };
}
