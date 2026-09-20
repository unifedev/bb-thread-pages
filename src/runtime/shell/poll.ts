import { EMPTY_PAGE_STATUS, type ShellConfig } from "../shared/protocol.ts";

/**
 * The revision poll: a conditional GET of the document every few seconds
 * while the tab is visible. It carries the working indicator and the
 * source state, so no second channel exists. It reads the shell's config at
 * each poll, so opening another document of the page only needs a retarget.
 * spec R2.17–R2.26
 */
export interface PollView {
  setStatus(text: string, warn: boolean): void;
  setWorking(working: boolean): void;
  showReload(visible: boolean): void;
  onStaleChanged(stale: boolean): void;
  /** Reloads the whole shell: a token about to expire. */
  reloadView(): void;
  /** Shows the document's new revision in place. spec R2.18a */
  refreshDocument(): void;
}

export interface Poller {
  start(): void;
  setDirty(dirty: boolean): void;
  /** Follows the config after the shell switched documents. */
  retarget(): void;
  /** The reader just answered from the page: poll at the working cadence for a while. spec R2.17a */
  expectChange(): void;
  isDirty(): boolean;
  /** Offers the new version instead of showing it: the reader began typing while it loaded. spec R2.21 */
  offer(): void;
  /** For tests: run one poll now. */
  pollNow(): Promise<void>;
  isStopped(): boolean;
}

const OFFER = "Page changed — reload when ready";

export function createPoller(win: Window, config: ShellConfig, view: PollView, fetchImpl: typeof fetch = win.fetch.bind(win)): Poller {
  let etag = `"${config.pageRevision}"`;
  let dirty = false;
  let stopped = false;
  let polling = false;
  let lastStale = config.stale;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = 0;
  let controller: AbortController | null = null;
  let working = config.working;
  let answeredUntil = 0;
  /** A new version is being offered to a dirty page; the offer stays up until it is taken. spec R2.21 */
  let offered = false;

  /** Two cadences on the one poll: fast while a change is likely. spec R2.17a, D28 */
  function interval(): number {
    return working || Date.now() < answeredUntil ? config.pollWorkingMs : config.pollMs;
  }

  function schedule(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (stopped || win.document.visibilityState !== "visible") return;
    dueAt = Date.now() + delay;
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
      offered = true;
      view.setStatus(OFFER, true);
      view.showReload(true);
    } else {
      view.refreshDocument();
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
    const polled = config.documentUrl;
    try {
      const response = await fetchImpl(polled, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "if-none-match": etag },
        signal: controller.signal,
      });
      // The shell opened another document while this poll was out.
      if (polled !== config.documentUrl) return;
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
      working = response.headers.get("x-thread-page-activity") === "working";
      view.setWorking(working);
      if (stale !== lastStale) {
        lastStale = stale;
        view.onStaleChanged(stale);
      }
      const empty = response.headers.get("x-thread-page-empty") === "true";
      if (offered && !stale) view.setStatus(OFFER, true);
      else view.setStatus(stale ? "Offline copy — read-only" : empty ? EMPTY_PAGE_STATUS : (config.notice ?? ""), stale);
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
      schedule(interval());
    }
  }

  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "visible") schedule(0);
    else pause();
  });

  return {
    start: () => schedule(interval()),
    setDirty: (next) => {
      dirty = next;
      // Nothing left to protect: what was only offered is shown. spec R2.21
      if (!dirty && offered && !stopped) {
        offered = false;
        view.refreshDocument();
      }
    },
    offer: () => {
      offered = true;
      view.setStatus(OFFER, true);
      view.showReload(true);
    },
    isDirty: () => dirty,
    expectChange: () => {
      answeredUntil = Date.now() + config.pollAfterAnswerMs;
      if (!polling && (timer === null || dueAt - Date.now() > config.pollWorkingMs)) schedule(config.pollWorkingMs);
    },
    retarget: () => {
      pause();
      etag = `"${config.pageRevision}"`;
      lastStale = config.stale;
      dirty = false;
      offered = false;
      stopped = false;
      polling = false;
      schedule(interval());
    },
    pollNow: () => poll(),
    isStopped: () => stopped,
  };
}
