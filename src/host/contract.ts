import type { PageError } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import type {
  ActivityItem,
  Delivery,
  FileContent,
  HostLogger,
  ProjectRecord,
  PromptAttachment,
  ProviderChoice,
  SendMode,
  SessionListQuery,
  SessionRecord,
  StartSessionArgs,
  StorageLocation,
  VoiceStatus,
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
    /** `attachments` only on a host with `attachments` (R8.36). */
    send(id: string, text: string, mode: SendMode, attachments?: readonly PromptAttachment[]): Promise<{ delivery: Delivery }>;
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
    /**
     * Names of the regular files directly inside a directory of a storage
     * location ("" is its root), symbolic links not followed; empty when the
     * directory does not exist; null when the host cannot say for sure (its
     * listing was cut short), so a pattern is left as written rather than half
     * honoured. spec R8.11a
     */
    list(location: StorageLocation, relativeDirectory: string): Promise<string[] | null>;
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
  /**
   * The most characters of agent instructions the host delivers to a session;
   * beyond it the host cuts them. Absent when the host does not cut. spec R6.31, R8.38
   */
  readonly instructionChars?: number;
  /**
   * Other installed extensions that contribute capabilities. Optional: a host
   * without an extension system conforms without it. spec R8.30–R8.32
   */
  readonly contributors?: ContributorHost;
  /**
   * Transcribe these bytes. Optional: without it voice answers `unavailable`
   * and text areas show no Dictate. spec R8.35
   */
  readonly voice?: VoiceHost;
  /**
   * Attach these files to a prompt in this project. Optional: without it a
   * `sessions.start` or `sessions.send` carrying files answers `unavailable`.
   * spec R8.36
   */
  readonly attachments?: AttachmentHost;
}

export interface VoiceHost {
  /** Whether a transcription service is configured now; asked before anything is recorded. spec R5.69 */
  status(): Promise<VoiceStatus>;
  /**
   * The host's transcript of one recording. Throws a `PageError`:
   * `request_too_large` over the host's size limit, `unavailable` otherwise.
   * spec R5.70, R5.72
   */
  transcribe(audio: { readonly bytes: Uint8Array; readonly mimeType: string; readonly prompt?: string; readonly language?: string }): Promise<{ text: string }>;
}

export interface AttachmentHost {
  /**
   * Stores one file as an attachment of the project. Throws a `PageError`:
   * `request_too_large` when the host refuses it for its size.
   */
  upload(projectId: string, file: { readonly name: string; readonly mimeType: string; readonly bytes: Uint8Array }): Promise<PromptAttachment>;
  /**
   * Why the host would refuse a file, where it can tell before anything is
   * uploaded — a type it does not take, a size over its own limit for that
   * type — as `request_too_large` or `invalid_params`; null when it would take it.
   */
  refusal?(file: { readonly name: string; readonly size: number; readonly type: string }): PageError | null;
  /** Removes an attachment it stored; absent when the host has no way to (R8.36 SHOULD). */
  remove?(projectId: string, attachment: PromptAttachment): Promise<void>;
}

/** A contributor's answer to one call, as it crosses from the contributor. spec R5.41b */
export type ContributorAnswer =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message?: string; readonly reason?: string; readonly detail?: unknown } };

export interface ContributorCall {
  readonly method: string;
  readonly params: JsonValue;
  /**
   * `sessionId` from the action token, never from the page; null for the
   * built-in home page. spec R5.49
   *
   * `scope`: the folder inside that session's folder the calling document
   * scoped its calls to, relative, `/`-separated, already refused when it is
   * absolute, holds `..` or an empty or `.` segment; null when the document
   * set none. The contributor resolves it against the session's folder and
   * answers for links that lead out of it. spec R5.81–R5.86, D41
   */
  readonly caller: { readonly sessionId: string | null; readonly scope: string | null };
  readonly requestId: string;
}

export interface ContributorHost {
  /** Every enabled extension that declares contributions, with its raw declaration. */
  list(): Promise<readonly { readonly id: string; readonly declaration: unknown }[]>;
  /**
   * Calls one contributor. Rejects when the contributor cannot be reached;
   * a contributor's own failure is an answer, not a rejection.
   */
  invoke(contributorId: string, call: ContributorCall): Promise<ContributorAnswer>;
}
