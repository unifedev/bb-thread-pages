import type { JsonValue } from "../domain/json/strict-json.ts";
import type {
  ActivityItem,
  Delivery,
  FileContent,
  HostLogger,
  ProjectRecord,
  ProviderChoice,
  SendMode,
  SessionListQuery,
  SessionRecord,
  StartSessionArgs,
  StorageLocation,
  WriteOutcome,
} from "./types.ts";

/**
 * What a host must provide for Thread Pages to run on it. spec 08
 *
 * bb implements this in src/bb. Everything above the domain talks to this
 * interface and nothing else, so a second host is one new package.
 */
export interface SessionHost {
  readonly sessions: {
    /** null when the session does not exist. */
    get(id: string): Promise<SessionRecord | null>;
    list(query: SessionListQuery): Promise<SessionRecord[]>;
    send(id: string, text: string, mode: SendMode): Promise<{ delivery: Delivery }>;
    start(args: StartSessionArgs): Promise<{ id: string }>;
    stop(id: string): Promise<void>;
    archive(id: string): Promise<void>;
    /** Sets the reader's read mark; returns the mark afterwards. */
    markRead(id: string, read: boolean): Promise<{ unread: boolean }>;
    /** Sets the host's own pin mark; returns the mark afterwards. */
    pin(id: string, pinned: boolean): Promise<{ pinned: boolean }>;
    activity(id: string, limit: number): Promise<ActivityItem[]>;
    storage(id: string): Promise<StorageLocation>;
  };
  readonly projects: {
    list(): Promise<ProjectRecord[]>;
    /** Opens the host's native folder picker; null when cancelled. */
    browse(hostId: string): Promise<{ path: string; hostName: string } | null>;
    create(args: { name: string; hostId: string; path: string }): Promise<ProjectRecord>;
  };
  readonly providers: {
    /** Throws when the host cannot enumerate; never returns an empty list to mean that. spec R5.15 */
    list(): Promise<ProviderChoice[]>;
  };
  readonly files: {
    /** null when the file does not exist. Throws `unavailable` when the host cannot be reached. */
    read(location: StorageLocation, relativePath: string): Promise<FileContent | null>;
    /** `exists` when `onlyIfAbsent` is set and the file is already there. */
    write(location: StorageLocation, relativePath: string, bytes: Uint8Array, options: { onlyIfAbsent: boolean }): Promise<WriteOutcome>;
    /** Which of the given absolute paths exist on a host, in one batched call where possible. */
    exist(hostId: string, absolutePaths: readonly string[]): Promise<Record<string, boolean>>;
  };
  readonly kv: {
    get(key: string): Promise<JsonValue | undefined>;
    set(key: string, value: JsonValue): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly origin: {
    /** The externally reachable origin (scheme + authority), or null when local-only. */
    public(): Promise<string | null>;
  };
  readonly log: HostLogger;
}
