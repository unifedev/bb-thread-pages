// `localStorage` draft store: keys, retention (7 d), per-session bound (1 MiB) with oldest-first eviction, in-memory fallback; the leftovers a page could not restore, kept for the home page (02 R-K4, R-K7; 05 R3.7a, R-S12; DESIGN §D.3; U49).
import { draftIndexKeyOf, draftKeyOf, isDraftRecord, type DraftRecord, type DraftValue } from "../shared/drafts.ts";
import { isLeftoverDraft, type LeftoverDraft } from "../shared/protocol.ts";

/** The session's drafts and its leftovers together stay under `perSessionBytes`. 02 R-K7 */
export interface LeftoverBound {
  retentionMs: number;
  perSessionBytes: number;
}

export interface StoredDraft {
  key: string;
  documentPath: string;
  record: DraftRecord;
}

export interface DraftStore {
  /** Writes a record; returns the notices the kernel should show. Empty fields delete. */
  put(documentPath: string, record: DraftRecord): string[];
  delete(documentPath: string, formKey: string): void;
  /** Every live record of the session (expired ones dropped). */
  list(): StoredDraft[];
  /** The records for one document, oldest first. */
  forDocument(documentPath: string): DraftRecord[];
  clearSession(): void;
  /** True when storage threw and drafts live in memory only. */
  isFallback(): boolean;
}

export const DROPPED_NOTICE = "A draft was dropped to make room";
export const SHORTENED_NOTICE = "A draft was shortened to fit";

interface Backend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function memoryBackend(): Backend {
  const map = new Map<string, string>();
  return { get: (key) => map.get(key) ?? null, set: (key, value) => void map.set(key, value), remove: (key) => void map.delete(key) };
}

function storageBackend(storage: Storage): Backend {
  return { get: (key) => storage.getItem(key), set: (key, value) => storage.setItem(key, value), remove: (key) => storage.removeItem(key) };
}

function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface DraftStoreOptions {
  session: string;
  retentionMs: number;
  perSessionBytes: number;
  now?: () => number;
  /** Called once when storage throws. */
  onFallback?: () => void;
}

export function createDraftStore(win: Window, options: DraftStoreOptions): DraftStore {
  const now = options.now ?? (() => Date.now());
  const indexKey = draftIndexKeyOf(options.session);
  let backend: Backend;
  let fallback = false;
  try {
    const storage = win.localStorage;
    storage.getItem(indexKey);
    backend = storageBackend(storage);
  } catch {
    backend = memoryBackend();
    fallback = true;
    options.onFallback?.();
  }

  function guard<T>(work: () => T, otherwise: T): T {
    try {
      return work();
    } catch {
      if (!fallback) {
        // Storage refused mid-way (quota, a private mode): the rest of this shell's life is in memory.
        const memory = memoryBackend();
        for (const key of readIndex().keys) {
          const value = backend.get(key);
          if (value !== null) memory.set(key, value);
        }
        memory.set(indexKey, backend.get(indexKey) ?? "");
        backend = memory;
        fallback = true;
        options.onFallback?.();
        try {
          return work();
        } catch {
          return otherwise;
        }
      }
      return otherwise;
    }
  }

  function readIndex(): { keys: string[] } {
    try {
      const raw = backend.get(indexKey);
      const parsed = raw ? (JSON.parse(raw) as { keys?: unknown }) : null;
      return { keys: Array.isArray(parsed?.keys) ? parsed.keys.filter((key): key is string => typeof key === "string") : [] };
    } catch {
      return { keys: [] };
    }
  }

  function writeIndex(keys: string[]): void {
    let bytes = 0;
    for (const key of keys) bytes += bytesOf(backend.get(key) ?? "");
    backend.set(indexKey, JSON.stringify({ keys, bytes }));
  }

  function readRecord(key: string): DraftRecord | null {
    try {
      const raw = backend.get(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return isDraftRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function pathOf(key: string): string {
    const prefix = draftKeyOf(options.session, "", "");
    const rest = key.slice(prefix.length - 1);
    return rest.slice(0, rest.indexOf(":"));
  }

  /** Drops expired records; returns the live keys oldest first. 02 R-K7 */
  function sweep(): string[] {
    const keys = readIndex().keys;
    const live: string[] = [];
    let changed = false;
    for (const key of keys) {
      const record = readRecord(key);
      if (!record || now() - record.savedAtMs > options.retentionMs) {
        backend.remove(key);
        changed = true;
        continue;
      }
      live.push(key);
    }
    if (changed) writeIndex(live);
    return live;
  }

  function shorten(record: DraftRecord, bound: number): DraftRecord | null {
    const fields: Record<string, DraftValue> = { ...record.fields };
    let size = bytesOf(JSON.stringify({ ...record, fields }));
    for (const [name, value] of Object.entries(fields)) {
      if (size <= bound) break;
      if (typeof value !== "string") continue;
      const room = Math.max(0, value.length - (size - bound));
      fields[name] = value.slice(0, room);
      size = bytesOf(JSON.stringify({ ...record, fields }));
    }
    return size <= bound ? { ...record, fields } : null;
  }

  return {
    put(documentPath, record) {
      return guard(() => {
        const notices: string[] = [];
        const key = draftKeyOf(options.session, documentPath, record.form.key);
        const keys = sweep().filter((entry) => entry !== key);
        if (Object.keys(record.fields).length === 0) {
          backend.remove(key);
          writeIndex(keys);
          return notices;
        }
        let stored: DraftRecord | null = record;
        let own = bytesOf(JSON.stringify(stored));
        if (own > options.perSessionBytes) {
          stored = shorten(record, options.perSessionBytes);
          if (!stored) return notices;
          own = bytesOf(JSON.stringify(stored));
          notices.push(SHORTENED_NOTICE);
        }
        let total = own;
        for (const entry of keys) total += bytesOf(backend.get(entry) ?? "");
        // Oldest first, never the one being written. 02 R-K7
        while (total > options.perSessionBytes && keys.length > 0) {
          const oldest = keys.shift()!;
          total -= bytesOf(backend.get(oldest) ?? "");
          backend.remove(oldest);
          notices.push(DROPPED_NOTICE);
        }
        backend.set(key, JSON.stringify(stored));
        writeIndex([...keys, key]);
        return notices;
      }, []);
    },
    delete(documentPath, formKey) {
      guard(() => {
        const key = draftKeyOf(options.session, documentPath, formKey);
        backend.remove(key);
        writeIndex(readIndex().keys.filter((entry) => entry !== key));
        return undefined;
      }, undefined);
    },
    list() {
      return guard(() => sweep().map((key) => ({ key, documentPath: pathOf(key), record: readRecord(key)! })).filter((entry) => entry.record !== null), []);
    },
    forDocument(documentPath) {
      return guard(
        () =>
          sweep()
            .filter((key) => key.startsWith(draftKeyOf(options.session, documentPath, "")))
            .map((key) => readRecord(key))
            .filter((record): record is DraftRecord => record !== null),
        [],
      );
    },
    clearSession() {
      guard(() => {
        for (const key of readIndex().keys) backend.remove(key);
        backend.remove(indexKey);
        backend.remove(leftoversKeyOf(options.session));
        return undefined;
      }, undefined);
    },
    isFallback: () => fallback,
  };
}

// --- leftovers: what a page could not restore, for the home page ------------------
// Storage is the single source: one entry per field with a stable id, read-modify-write on every change, so tabs
// do not overwrite each other and a discard holds (review NS-3). DESIGN §D.3

export const LEFTOVERS_PREFIX = "up:leftovers:";
export const LEFTOVER_STORAGE_NOTICE = "A draft could not be kept for the home page: the browser refused to store it.";

export function leftoversKeyOf(session: string): string {
  return `${LEFTOVERS_PREFIX}${session}`;
}

/** One entry per field of one form of one document of one session. */
export function leftoverId(entry: Pick<LeftoverDraft, "session" | "documentPath" | "key" | "field">): string {
  return [entry.session, entry.documentPath, entry.key, entry.field].join("|");
}

/** The form's title or key, as the reader sees it. */
export function leftoverLabel(formKey: string): string {
  if (formKey.startsWith("id:")) return `#${formKey.slice(3)}`;
  if (formKey.startsWith("title:")) return formKey.slice(6);
  if (formKey.startsWith("ctl:name:")) return formKey.slice(9);
  if (formKey.startsWith("ctl:")) return `#${formKey.slice(4)}`;
  return "a form";
}

function storageOf(win: Window): Storage | null {
  try {
    const storage = win.localStorage;
    storage.getItem(LEFTOVERS_PREFIX);
    return storage;
  } catch {
    return null;
  }
}

function readSessionLeftovers(storage: Storage, session: string): LeftoverDraft[] {
  try {
    const parsed = JSON.parse(storage.getItem(leftoversKeyOf(session)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLeftoverDraft) : [];
  } catch {
    return [];
  }
}

let refusedOnce = false;

/** Under the bound (the stored drafts' bytes count), oldest first out with a notice; a refused write keeps the previous list, warned once, and the page is told (review NS-7). */
function writeSessionLeftovers(storage: Storage, session: string, entries: LeftoverDraft[], bound: LeftoverBound): string[] {
  const notices: string[] = [];
  const kept = [...entries].sort((a, b) => a.atMs - b.atMs);
  let drafts = 0;
  try {
    const index = JSON.parse(storage.getItem(draftIndexKeyOf(session)) ?? "{}") as { bytes?: unknown };
    drafts = typeof index.bytes === "number" ? index.bytes : 0;
  } catch {
    drafts = 0;
  }
  while (kept.length > 0 && drafts + bytesOf(JSON.stringify(kept)) > bound.perSessionBytes) {
    kept.shift();
    notices.push(DROPPED_NOTICE);
  }
  try {
    if (kept.length === 0) storage.removeItem(leftoversKeyOf(session));
    else storage.setItem(leftoversKeyOf(session), JSON.stringify(kept));
  } catch (error) {
    if (!refusedOnce) {
      refusedOnce = true;
      console.warn("the browser refused to store a draft for the home page", error);
    }
    notices.push(LEFTOVER_STORAGE_NOTICE);
  }
  return notices;
}

/** The page filled a field over the reader's text: kept by id until the reader discards it. */
export function addLeftover(win: Window, entry: LeftoverDraft, bound: LeftoverBound): string[] {
  const storage = storageOf(win);
  if (!storage) return [];
  const current = readSessionLeftovers(storage, entry.session).filter((item) => leftoverId(item) !== leftoverId(entry));
  return writeSessionLeftovers(storage, entry.session, [...current, entry], bound);
}

/** Replaces one document's `not-on-this-version` entries with what this frame could not restore; every other entry stays. */
export function setDocumentLeftovers(win: Window, session: string, documentPath: string, entries: readonly LeftoverDraft[], bound: LeftoverBound): string[] {
  const storage = storageOf(win);
  if (!storage) return [];
  const current = readSessionLeftovers(storage, session).filter((item) => !(item.documentPath === documentPath && item.reason === "not-on-this-version"));
  const ids = new Set(current.map(leftoverId));
  return writeSessionLeftovers(storage, session, [...current, ...entries.filter((entry) => !ids.has(leftoverId(entry)))], bound);
}

/**
 * Prune only: drops this document's `not-on-this-version` entries whose field
 * is gone from the stored record (the reader discarded it elsewhere), never
 * adds or replaces, and writes only when something went — so two tabs of one
 * page converge instead of undoing each other through `storage` events
 * (review NS-14).
 */
export function pruneDocumentLeftovers(win: Window, session: string, documentPath: string, bound: LeftoverBound): void {
  const storage = storageOf(win);
  if (!storage) return;
  const current = readSessionLeftovers(storage, session);
  const store = createDraftStore(win, { session, retentionMs: bound.retentionMs, perSessionBytes: bound.perSessionBytes });
  const records = new Map(store.forDocument(documentPath).map((record) => [record.form.key, record]));
  const kept = current.filter((entry) => {
    if (entry.documentPath !== documentPath || entry.reason !== "not-on-this-version") return true;
    const value = records.get(entry.key)?.fields[entry.field];
    return typeof value === "string" && value !== "";
  });
  if (kept.length !== current.length) writeSessionLeftovers(storage, session, kept, bound);
}

/** Every session's leftovers on this origin, oldest first, expired ones dropped. 02 R-K7 */
export function readAllLeftovers(win: Window, retentionMs: number, now: number = Date.now()): LeftoverDraft[] {
  const storage = storageOf(win);
  if (!storage) return [];
  const out: LeftoverDraft[] = [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(LEFTOVERS_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "[]") as unknown;
      if (!Array.isArray(parsed)) continue;
      const live = parsed.filter(isLeftoverDraft).filter((entry) => now - entry.atMs <= retentionMs);
      if (live.length !== parsed.length) {
        if (live.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(live));
      }
      out.push(...live);
    } catch {
      // A key that is not a list is not ours.
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** The reader's Discard on the home page: the entry goes, and the field goes from the stored draft record too, so no page lists it again. 02 R-K7 */
export function discardLeftover(win: Window, entry: Pick<LeftoverDraft, "session" | "documentPath" | "key" | "field">, bound: LeftoverBound): void {
  const storage = storageOf(win);
  if (!storage) return;
  const id = leftoverId(entry);
  writeSessionLeftovers(storage, entry.session, readSessionLeftovers(storage, entry.session).filter((item) => leftoverId(item) !== id), bound);
  const store = createDraftStore(win, { session: entry.session, retentionMs: bound.retentionMs, perSessionBytes: bound.perSessionBytes });
  const record = store.forDocument(entry.documentPath).find((candidate) => candidate.form.key === entry.key);
  if (!record || !(entry.field in record.fields)) return;
  const fields = { ...record.fields };
  delete fields[entry.field];
  const empty = Object.values(fields).every((value) => value === "" || value === false || (Array.isArray(value) && value.length === 0));
  if (empty) store.delete(entry.documentPath, entry.key);
  else store.put(entry.documentPath, { ...record, fields, focus: record.focus && record.focus.name === entry.field ? null : record.focus });
}
