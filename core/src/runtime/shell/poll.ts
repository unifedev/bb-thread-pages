// The conditional revision poll with cadences, pause when hidden, token renewal from the poll body, working indicator, source state (05 R2.17–R2.26, R2.20; DESIGN §C.3 `PollBody`).
import { POLL_HEADER, SESSION_HEADER, SOURCE_HEADER, WORKING_HEADER, type PageSource, type PollBody } from "../shared/envelopes.ts";
import { isRecord, type ShellConfig } from "../shared/protocol.ts";

export interface PollEvents {
  /** The body of a 200: a new revision or a renewed token. The caller swaps `config` fields as it sees fit. */
  onBody(body: PollBody): void;
  onWorking(working: boolean): void;
  onSource(source: PageSource): void;
  /** `404 not_found`: the session was deleted. */
  onDeleted(): void;
  /** `401`/`403`: the reader's session with the host is gone. */
  onUnauthorized(): void;
  onUnreachable(): void;
  onReachable(): void;
  /** The token is close to expiry and nothing renewed it. 05 R2.20 */
  onExpiring(): void;
}

export interface Poller {
  start(): void;
  stop(): void;
  /** Follows the config after the shell switched documents. */
  retarget(): void;
  /** The reader just answered: poll at the working cadence for a while. 05 R2.17a */
  expectChange(): void;
  pollNow(): Promise<void>;
  isStopped(): boolean;
}

/** How close to expiry the poll stops trusting the token it holds. 05 R2.20 */
export const EXPIRY_MARGIN_MS = 30_000;
/** While the tab is hidden the poll pauses; one presence poll every 30 s keeps the token renewed and a deletion noticed. */
export const HIDDEN_PRESENCE_MS = 30_000;

/** The document route without the render token: the token rides on the one document load and on nothing else; the poll is reader-authenticated. 05 §Routes, §Tokens */
export function pollUrl(documentUrl: string): string {
  const at = documentUrl.indexOf("?");
  if (at < 0) return documentUrl;
  const params = new URLSearchParams(documentUrl.slice(at + 1));
  params.delete("render");
  const query = params.toString();
  return query ? `${documentUrl.slice(0, at)}?${query}` : documentUrl.slice(0, at);
}

export function createPoller(win: Window, config: ShellConfig, events: PollEvents, fetchImpl: typeof fetch): Poller {
  let etag = `"${config.pageRevision}"`;
  let stopped = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = 0;
  let controller: AbortController | null = null;
  let working = config.working;
  let answeredUntil = 0;
  let unreachable = false;
  let lastSource: PageSource = config.source;

  const hidden = () => win.document.visibilityState === "hidden";

  /** Two cadences on the one poll; a slow presence cadence while hidden. 05 R2.17a */
  function interval(): number {
    if (hidden()) return HIDDEN_PRESENCE_MS;
    return working || Date.now() < answeredUntil ? config.pollWorkingMs : config.pollMs;
  }

  function schedule(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    dueAt = Date.now() + delay;
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, delay);
  }

  async function poll(): Promise<void> {
    if (stopped || polling) return;
    if (Date.now() >= config.expiresAt - EXPIRY_MARGIN_MS) {
      // The poll renews the token; a token nobody renewed is said, never silently dropped. 05 R2.20
      events.onExpiring();
    }
    polling = true;
    controller = new AbortController();
    const source = config.documentUrl;
    try {
      const response = await fetchImpl(pollUrl(source), { method: "GET", credentials: "same-origin", cache: "no-store", headers: { "if-none-match": etag, [POLL_HEADER]: "1" }, signal: controller.signal });
      if (source !== config.documentUrl) return;
      if (unreachable) {
        unreachable = false;
        events.onReachable();
      }
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        events.onUnauthorized();
        return;
      }
      if (response.status === 404) {
        stopped = true;
        events.onDeleted();
        return;
      }
      if (!response.ok && response.status !== 304) {
        events.onUnreachable();
        unreachable = true;
        return;
      }
      if (response.headers.get(SESSION_HEADER) === "deleted") {
        stopped = true;
        events.onDeleted();
        return;
      }
      if (response.status === 304) {
        // Nothing changed: the headers alone carry the indicator and the source. 05 R2.25
        working = response.headers.get(WORKING_HEADER) === "1";
        events.onWorking(working);
        const source = response.headers.get(SOURCE_HEADER);
        if ((source === "live" || source === "offline" || source === "archived") && source !== lastSource) {
          lastSource = source;
          events.onSource(source);
        }
        return;
      }
      const body = (await response.json().catch(() => null)) as unknown;
      if (!isPollBody(body)) return;
      etag = `"${body.revision}"`;
      working = body.working;
      events.onWorking(working);
      if (body.source !== lastSource) {
        lastSource = body.source;
        events.onSource(body.source);
      }
      events.onBody(body);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        unreachable = true;
        events.onUnreachable();
      }
    } finally {
      controller = null;
      polling = false;
      schedule(interval());
    }
  }

  win.document.addEventListener("visibilitychange", () => {
    if (stopped) return;
    if (hidden()) schedule(HIDDEN_PRESENCE_MS);
    else schedule(0);
  });

  return {
    start: () => schedule(interval()),
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      controller?.abort();
    },
    expectChange() {
      answeredUntil = Date.now() + config.pollAfterAnswerMs;
      if (!polling && !hidden() && (timer === null || dueAt - Date.now() > config.pollWorkingMs)) schedule(config.pollWorkingMs);
    },
    retarget() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
      etag = `"${config.pageRevision}"`;
      lastSource = config.source;
      working = config.working;
      stopped = false;
      polling = false;
      schedule(interval());
    },
    pollNow: () => poll(),
    isStopped: () => stopped,
  };
}

export function isPollBody(value: unknown): value is PollBody {
  if (!isRecord(value)) return false;
  return (
    typeof value.revision === "string" &&
    /^[a-f0-9]{64}$/.test(value.revision) &&
    typeof value.actionToken === "string" &&
    typeof value.expiresAt === "number" &&
    typeof value.documentUrl === "string" &&
    typeof value.working === "boolean" &&
    (value.source === "live" || value.source === "offline" || value.source === "archived") &&
    typeof value.empty === "boolean" &&
    Array.isArray(value.deferredFiles) &&
    Array.isArray(value.grants) &&
    isRecord(value.voice) &&
    typeof value.voice.available === "boolean" &&
    Array.isArray(value.readMethods)
  );
}
