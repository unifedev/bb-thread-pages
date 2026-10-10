// `ProviderHost`, `SessionRecord`, `Waiting`, `RespondPayload`, `Message`, `ActivityItem`, `AttachmentRef`, `ProviderError`, `ProviderChoice`, `Placement`, `Logger` — 06 §Required and §Optional, verbatim. Imports only the type ContributorHost from ./contributor.ts.
import type { ContributorHost } from "./contributor.ts";

/** What the server asks of the agent runtime. spec 06 §Required, §Optional */
export interface ProviderHost {
  sessions: {
    get(id: string): Promise<SessionRecord | null>;              // null for a session that does not exist or is deleted; never throws for it
    list(query: { workspaceId?: string; includeArchived?: boolean; includeChildren?: boolean; limit: number; cursor?: string }):
      Promise<{ sessions: SessionRecord[]; nextCursor: string | null }>;   // bounded paging (R8.6, 03 R5.12); nextCursor null when exhausted
    isEligible(session: SessionRecord): boolean;                 // R-P1
    send(id: string, text: string, mode: "queue" | "steer", attachments?: AttachmentRef[], settings?: ReplySettings):
      Promise<{ delivery: "started" | "queued" | "steered"; messageId?: string; settings?: AppliedSettings }>;   // R-P3, R-P4; messageId feeds `from` provenance (03); settings: the next turn's model, reasoning level, permission mode, each echoed with the scope applied (U47)
    start(args: { workspaceId: string; prompt: string; title?: string; providerId?: string; model?: string; reasoningLevel?: string;
                  permissionMode?: string; environment?: string; attachments?: AttachmentRef[] }): Promise<{ id: string }>;   // R-P7, R-P13
    stop(id: string): Promise<void>;
    activity(id: string, limit: number): Promise<ActivityItem[]>;
    messages(id: string, params: { limit?: number; before?: string; after?: string }):
      Promise<{ messages: Message[]; nextCursor: string | null; prevCursor: string | null }>;   // R-P5, R-P8 (U2); every Message carries its own cursor
    storage(id: string): Promise<{ rootPath: string; pathForAgent(relative: string): string }>;   // R-P10, R-P12
    // optional (06 §Optional)
    archive?(id: string): Promise<void>;
    markRead?(id: string, read: boolean): Promise<void>;
    pin?(id: string, pinned: boolean): Promise<void>;           // backs the shell's pin control only; no capability
    respond?(id: string, waitId: string, payload: RespondPayload): Promise<{ answered: true }>;   // U4: not_found / conflict / unavailable as 03 states
    usage?(id: string): Promise<{ context: { used: number; limit: number }; cost?: { usd: number } }>;
    openHost?(id: string): Promise<{ url: string } | { opened: true } | { opened: false; notice: string }>;   // host URL, terminal attach, deep link; `{ opened: false, notice }` when the host has nowhere to open it from here (it is open in the host's own window already, say) — the shell shows the notice beside its control, no error (fix round 2)
  };
  workspaces: {
    list(): Promise<{ id: string; name: string; kind: string; environments?: { id: string; name: string; isDefault: boolean }[] }[]>;   // folders (U7); R-P13
    browse?(): Promise<{ selection: unknown; display: string } | null>;   // the host's native folder picker; null when cancelled. `selection` is the provider's opaque record, held by the server and handed back to `create` unchanged; it never reaches a page (DR-5)
    create?(args: { selection: unknown; name?: string }): Promise<{ id: string }>;
  };
  kv: {                                                           // R-P11: per session and scope; the server namespaces
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;              // atomic per key
    delete(key: string): Promise<void>;
    valueBytes?: number;                                         // the most bytes one value may hold, where the host caps it (R8.11)
  };
  files: {                                                        // R-P10: inside a page root; paths relative to it; traversal refused (01 R1.4)
    stat(session: string, path: string): Promise<{ size: number; mtimeMs: number; kind: "file" | "dir" | "symlink" } | null>;
    read(session: string, path: string, range?: { offset: number; length: number }): Promise<Uint8Array>;
    list(session: string, dir: string): Promise<{ name: string; kind: "file" | "dir" | "symlink" }[]>;   // not following symlinks (R8.11a)
    write(session: string, path: string, bytes: Uint8Array, opts: { onlyIfAbsent: boolean }): Promise<void>;
    delete(session: string, path: string): Promise<void>;
    statIsCheap?: boolean;                                       // true where `stat` is cheaper than `read`; absent or false → the server trusts its cache for a poll cadence (DR-15)
  };
  instruction: {                                                  // R-P14 (U35, N-4)
    slots: { name: string; cap: number | null }[];               // the contributions this provider has, in order; cap in characters as the provider counts them, null where unknown
    inject(parts: { standing: string; fragments: { contributor: string; text: string }[] },
           eligible: (session: SessionRecord) => boolean):
      Promise<{ placements: Placement[] }>;
  };
  command: {                                                      // R-P15
    register(role: string, handler: (ctx: { sessionId: string | null; args: string[] }) => Promise<{ text: string; exit: 0 | 1 }>): void;
  };
  log: Logger;
  // optional members (06 §Optional)
  providers?: { list(): Promise<ProviderChoice[]> };
  contributors?: ContributorHost;                                 // 07 §Discovery per host; absent → no contributed capabilities
  voice?: { status(): Promise<{ configured: boolean; limits: { bytes: number; seconds: number; attempts: number } }>;
            transcribe(args: { bytes: Uint8Array; mimeType: string; prompt?: string; language?: string }): Promise<{ text: string }> };
  attachments?: { upload(workspaceId: string, file: Uint8Array, meta: { name: string; type: string }): Promise<{ attachmentId: string }>;
                  refusal?(meta: { name: string; type: string; size: number }): string | null; remove?(attachmentId: string): Promise<void> };
}

/** One session as the provider reports it. spec 06 R-P2 */
export interface SessionRecord {
  id: string; title: string; workspaceId: string;
  parentSessionId: string | null; forkOfId: string | null;
  state: "working" | "idle" | "waiting" | "failed" | "stopped";
  waiting: Waiting | null;                                        // 03 §Session state vocabulary
  visible: boolean; archived: boolean;                            // a deleted session is `null` from `get` and absent from `list` (N-12)
  startedAtMs: number; turnEndedAtMs: number | null; updatedAtMs: number;
  unread?: boolean; attentionAtMs?: number;
  clearedFromId?: string | null;                                  // the session this one continues after a host-side clear, whose page `init` names (R-P1; DR-7)
  providerId?: string;                                            // the AI provider running this session, one of `providers.list`'s ids; absent where the host has one provider or cannot tell (U47)
}

/** What a waiting session waits on. spec 03 §Session state vocabulary (canonical), 06 R8.7a */
export type Waiting = {
  id: string | null;                                              // the wait's id, what `respond` answers; null where the host has none
  kind: "question" | "approval" | "other";
  text: string | null;                                            // the host's one-line summary, bounded by the server (R5.11c); null where the host cannot tell
  questions?: { id: string; text: string; options: { id: string; label: string }[]; multiSelect: boolean; allowFreeText: boolean }[];
  approval?: { subject: "tool" | "command" | "file_change" | "permission" | "plan" | "other"; summary: string;
               decisions: ("allow_once" | "allow_for_session" | "deny")[] };
};

/** The answer to a wait, as `respond` passes it on. spec 03 §Session state vocabulary, 06 §Optional */
export type RespondPayload =
  | { answers: { [questionId: string]: { selected: string[]; freeText?: string } }; decision?: undefined }
  | { decision: "allow_once" | "allow_for_session" | "deny"; answers?: undefined };

/** One transcript row. spec 03 §`session.messages`, 06 R-P5, R-P8 */
export interface Message {
  id: string; atMs: number; turnId?: string; agentId?: string;
  cursor: string;                                                 // this row's own opaque cursor (03 R-C1)
  kind: "user" | "assistant" | "tool" | "notice" | "question";
  text?: string;
  from?: { kind: "reader" | "page" | "session" | "plugin" | "schedule"; label?: string };   // the provider supplies reader/session/plugin/schedule; `page` is the server's (R-P5)
  tool?: { name: string; input: unknown; result?: unknown; isError?: boolean };
  question?: { id: string; options?: { questionId: string; id: string; label: string }[]; answered: boolean };
  files?: { name: string; path?: string; mimeType: string; sizeBytes: number }[];
  done: boolean;                                                  // true once the row's content is final (R-P8)
  truncated?: true;                                               // set by the server, never by the provider
}

/** One item of a session's recent activity. spec 06 R8.7 */
export interface ActivityItem { kind: string; done: boolean; atMs: number; label: string; text: string }

/** A file the provider stored as a prompt's attachment. spec 06 §Voice and attachments, 03 R5.76 */
export interface AttachmentRef { attachmentId: string; name: string; type: string; sizeBytes: number }

/** How long a setting a reply names holds: this one turn, or the session from now on. spec 03 §`session.reply`, U47 */
export type SettingScope = "turn" | "session";

/** What `session.reply { settings }` asks for the next turn: values from `providers.list`. spec 03 §`session.reply`, U47 */
export interface ReplySettings { model?: string; reasoningLevel?: string; permissionMode?: string }

/** What was applied, each with its scope; a field absent was not asked for. spec 03 §`session.reply`, 06 R-P3a, U47 */
export interface AppliedSettings { model?: SettingScope; reasoningLevel?: SettingScope; permissionMode?: SettingScope }

/** One AI provider with its models and modes. spec 03 §`providers.list`, 06 §Optional */
export interface ProviderChoice {
  id: string; displayName: string; available: boolean; default: boolean;
  models: { id: string; displayName: string; default: boolean; reasoningLevels?: { id: string; displayName: string }[] }[];   // per-model levels where the host knows them; the flat list below is their union
  reasoningLevels?: { id: string; displayName: string }[];
  permissionModes?: { id: string; displayName: string; default: boolean }[];
  /** What a running session of this provider accepts through `session.reply.settings`, and with which scope; a field absent cannot be changed mid-session on this host. U47 */
  settings: { model?: SettingScope; reasoningLevel?: SettingScope; permissionMode?: SettingScope };
}

/** Where one part of the instruction landed. spec 06 R-P14 */
export interface Placement { slot: string; cap: number | null; chars: number; cutAt: number | null }   // slot: the name of one of the provider's declared `instruction.slots`

/** A member rejects with this; the server maps it (R-P9). Anything else thrown → handler_error, logged. spec 06 R-P9 */
export class ProviderError extends Error {
  readonly code: "not_found" | "unavailable" | "too_large" | "conflict" | "unsupported" | "other";   // `unsupported`: a reply's settings this provider cannot apply → the page's `settings_unsupported` with `detail.unsupported` (U47)
  readonly reason?: string;                                       // e.g. "archived"
  readonly detail?: { unsupported: string[] };                    // with `unsupported`: the fields it refused
  constructor(code: ProviderError["code"], message: string, reason?: string, options?: { cause?: unknown; detail?: { unsupported: string[] } }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.code = code;
    if (reason !== undefined) this.reason = reason;
    if (options?.detail !== undefined) this.detail = options.detail;
  }
}

/** Where the server writes what an operator reads. spec 05 R2.43 */
export interface Logger { info(message: string): void; warn(message: string): void; error(message: string): void }
