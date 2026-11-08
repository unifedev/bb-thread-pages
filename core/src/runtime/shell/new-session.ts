// A new-session page in the shell (02 R-K10, R-K11; 05 R-S13): the opening (an id made once per tab's opening of the
// address and kept in its history entry), `storage.*` answered from memory for the open page with 03's validation and
// bounds, scopes apart, and the starts this opening sent, so a retry without a gesture can only repeat one of them.
import { isOpening, isSessionId, isStorageKey } from "../../domain/ids.ts";
import { LIMITS, kibibytes } from "../../domain/limits.ts";
import { scopeWithin } from "../../domain/scope.ts";
import { HELD_SCOPES_MAX } from "../shared/envelopes.ts";
import { isRecord, makeFailure, type BridgeRequestMessage, type BridgeResponseMessage } from "../shared/protocol.ts";

/** Where the opening and the starts it sent are kept: the tab's history entry, so a reload keeps them and any other navigation to the address is fresh. 02 R-K10 */
export const HISTORY_OPENING = "pagesOpening";
export const HISTORY_STARTS = "pagesStarts";

/** One scope's held storage, as the start carries it. 03 R-C13 */
export interface HeldDocument {
  scope: string | null;
  entries: Record<string, unknown>;
}

/** What the shell sends with the start, and only with it. 05 R-S13 */
export interface StartBlock {
  opening: string;
  gesture: boolean;
  held: HeldDocument[];
}

/** The session's own token and document address, beside the start's answer. 05 R-S13; 02 R-K11 */
export interface StartedTransport {
  session: string;
  actionToken: string;
  expiresAt: number;
  documentUrl: string;
  filesUrl: string | null;
  siteRoot: string | null;
}

export function isStartedTransport(value: unknown): value is StartedTransport {
  return (
    isRecord(value) &&
    isSessionId(value.session) &&
    typeof value.actionToken === "string" &&
    value.actionToken.length > 0 &&
    typeof value.expiresAt === "number" &&
    typeof value.documentUrl === "string" &&
    value.documentUrl.startsWith("/") &&
    (value.filesUrl === null || (typeof value.filesUrl === "string" && value.filesUrl.startsWith("/"))) &&
    (value.siteRoot === null || (typeof value.siteRoot === "string" && value.siteRoot.startsWith("/")))
  );
}

export interface NewSessionPage {
  readonly opening: string;
  /** `storage.*` answered from the held store; null for any other call. 02 R-K10; 03 R-C13 */
  storage(request: BridgeRequestMessage): BridgeResponseMessage | null;
  /** The held storage, one document per scope that holds anything. */
  held(): HeldDocument[];
  /** The starts this opening sent, as `reply:<key>`. */
  starts(): string[];
  sentBefore(key: string): boolean;
  noteSent(key: string): void;
}

const STORAGE_METHODS: ReadonlySet<string> = new Set(["storage.get", "storage.set", "storage.setMany"]);

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function randomOpening(win: Window): string {
  const bytes = new Uint8Array(18);
  win.crypto.getRandomValues(bytes);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return win.btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Whether this document was reached by a reload or by Back and Forward: only then is it the same opening. A navigation
 * to the address — `pages.open { workspaceId, newSession: true }`, a link, the address typed — is a fresh one, even
 * where the browser keeps the history entry's state because the address is the one already shown. Where the browser
 * does not say, it is a fresh opening. 02 R-K10; 05 R-S13; 03 R5.29c
 */
function sameOpening(win: Window): boolean {
  try {
    const entry = win.performance.getEntriesByType("navigation")[0] as { type?: unknown } | undefined;
    return entry?.type === "reload" || entry?.type === "back_forward";
  } catch {
    return false;
  }
}

/** The opening and starts this tab's history entry holds when the document was reloaded or reached by Back and Forward, else a fresh opening. 02 R-K10 */
export function createNewSessionPage(win: Window): NewSessionPage {
  const entry = sameOpening(win) && isRecord(win.history.state) ? win.history.state : {};
  const opening = isOpening(entry[HISTORY_OPENING]) ? (entry[HISTORY_OPENING] as string) : randomOpening(win);
  const sent = new Set(Array.isArray(entry[HISTORY_STARTS]) ? (entry[HISTORY_STARTS] as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 64) : []);
  /** By scope ("" for none); held for this open page only, and nowhere else. 02 R-K10 */
  const documents = new Map<string, Record<string, unknown>>();

  function total(except: string, next: Record<string, unknown>): number {
    let bytes = Object.keys(next).length > 0 ? bytesOf(next) : 0;
    for (const [scope, document] of documents) if (scope !== except && Object.keys(document).length > 0) bytes += bytesOf(document);
    return bytes;
  }

  /** All or none, as the host's storage writes: each value within its bound, the page within its own. 03 R5.18–R5.19, R-C6 */
  function write(id: string, scope: string, entries: readonly { key: string; value: unknown }[], answer: unknown): BridgeResponseMessage {
    const next = { ...(documents.get(scope) ?? {}) };
    for (const item of entries) {
      if (item.value === null) {
        delete next[item.key];
        continue;
      }
      if (bytesOf(item.value) > LIMITS.storageValueBytes) return makeFailure(id, "request_too_large", `A storage value is at most ${kibibytes(LIMITS.storageValueBytes)} serialised; "${item.key}" is larger`);
      next[item.key] = item.value;
    }
    // A scope the start could not carry is refused as a write, never at the start. 03 R-C13
    const holding = [...documents].filter(([other, document]) => other !== scope && Object.keys(document).length > 0).length;
    if (Object.keys(next).length > 0 && holding >= HELD_SCOPES_MAX) return makeFailure(id, "request_too_large", `At most ${HELD_SCOPES_MAX} scopes hold storage before the agent starts`);
    const bytes = total(scope, next);
    if (bytes > LIMITS.storagePageBytes) return makeFailure(id, "request_too_large", `A page's storage is at most ${kibibytes(LIMITS.storagePageBytes)} across its scopes; this write would make it ${kibibytes(bytes)}`);
    documents.set(scope, next);
    return { v: 1, id, ok: true, result: answer };
  }

  function entryOf(value: unknown): { key: string; value: unknown } | null {
    if (!isRecord(value) || Object.keys(value).sort().join(",") !== "key,value" || !isStorageKey(value.key)) return null;
    return { key: value.key, value: value.value };
  }

  return {
    opening,
    storage(request) {
      if (!STORAGE_METHODS.has(request.method)) return null;
      const { id } = request;
      const scope = request.scope ?? null;
      // An `html` frame's calls stay in the folder its page bound it to. 07 R5.83a
      if (request.frame && !scopeWithin(scope, request.frame.scope)) return makeFailure(id, "invalid_params", `This frame is bound to ${request.frame.scope}: its calls stay in that folder or below`);
      const key = scope ?? "";
      const params = request.params;
      if (request.method === "storage.get") {
        if (!isRecord(params) || Object.keys(params).join(",") !== "key" || !isStorageKey(params.key)) return makeFailure(id, "invalid_params", "Invalid parameters for storage.get: give { key }, a storage key");
        const document = documents.get(key);
        return { v: 1, id, ok: true, result: document && Object.prototype.hasOwnProperty.call(document, params.key) ? { found: true, value: document[params.key] } : { found: false } };
      }
      if (request.method === "storage.set") {
        const entry = entryOf(params);
        if (!entry) return makeFailure(id, "invalid_params", "Invalid parameters for storage.set: give { key, value }, key a storage key");
        return write(id, key, [entry], { stored: true });
      }
      if (!isRecord(params) || Object.keys(params).join(",") !== "entries" || !Array.isArray(params.entries)) return makeFailure(id, "invalid_params", "Invalid parameters for storage.setMany: give { entries: [{ key, value }] }");
      if (params.entries.length > LIMITS.storageSetManyEntries) return makeFailure(id, "invalid_params", `At most ${LIMITS.storageSetManyEntries} entries in one call`);
      const entries = params.entries.map(entryOf);
      if (entries.some((entry) => entry === null)) return makeFailure(id, "invalid_params", "Invalid parameters for storage.setMany: each entry is { key, value }, key a storage key");
      const keys = entries.map((entry) => entry!.key);
      if (new Set(keys).size !== keys.length) return makeFailure(id, "invalid_params", "A key appears twice in one call");
      return write(id, key, entries as { key: string; value: unknown }[], { stored: entries.length });
    },
    held() {
      const held: HeldDocument[] = [];
      for (const [scope, entries] of documents) if (Object.keys(entries).length > 0) held.push({ scope: scope === "" ? null : scope, entries: { ...entries } });
      return held;
    },
    starts: () => [...sent],
    sentBefore: (key) => sent.has(key),
    noteSent(key) {
      sent.add(key);
    },
  };
}
