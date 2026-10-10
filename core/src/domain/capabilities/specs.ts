// One `CapabilitySpec` per built-in method of 03 (core and optional), params and result validators, guide doc paragraphs; `projectId` accepted as `workspaceId` (U34).
import { ENTRY_DOCUMENT, isDocumentPath } from "../document-path.ts";
import { externalUrlProblem } from "../external-url.ts";
import { isEntityId, isOpaqueToken, isStorageKey } from "../ids.ts";
import type { JsonValue } from "../json/strict-json.ts";
import { LIMITS, kibibytes, mebibytes } from "../limits.ts";
import { EFFECT_CLASSES, type CapabilitySpec } from "./contract.ts";
import * as s from "./schema.ts";

// --- shared pieces ---------------------------------------------------------

const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REVISION = /^[a-f0-9]{64}$/;
const entityId = (label: string) => s.string({ min: 1, max: 128, pattern: ENTITY_ID, label });
const title = (label = "Title") => s.string({ max: LIMITS.titleChars, label });
const prompt = s.string({ min: 1, max: LIMITS.promptChars, label: "Prompt" });
const safeName = (label: string, max = 160) => s.string({ min: 1, max, pattern: /^[^\u0000-\u001f\u007f]+$/, label });
const timestamp = s.integer(0, Number.MAX_SAFE_INTEGER, "Timestamp");
const revision = s.string({ min: 64, max: 64, pattern: REVISION, label: "Revision" });
const cursor = s.string({ min: 1, max: 512, label: "Cursor" });
const waitId = s.string({ min: 1, max: 256, label: "Wait id" });
const idempotencyKey = s.string({ min: 1, max: LIMITS.requestIdChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Idempotency key" });
const sendMode = s.withDefault(s.literal(["queue", "steer"], "Mode"), "queue");
const sessionTarget = s.object({ sessionId: entityId("Session id") });
const openedResult = s.object({ opened: s.boolean(), notice: s.optional(s.string({ min: 1, max: LIMITS.errorMessageChars, label: "Notice" })) });

export const SESSION_STATES = ["working", "idle", "waiting", "failed", "stopped"] as const;
export type SessionState = (typeof SESSION_STATES)[number];
const sessionState = s.literal(SESSION_STATES, "State");

export const DELIVERIES = ["started", "queued", "steered"] as const;
export type Delivery = (typeof DELIVERIES)[number];
const delivery = s.literal(DELIVERIES, "Delivery");
const deliveryResult = s.object({ delivery, duplicate: s.boolean() });

/** How long a setting a reply names holds. 03 §`session.reply`, U47 */
export const SETTING_SCOPES = ["turn", "session"] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];
export const SETTING_FIELDS = ["model", "reasoningLevel", "permissionMode"] as const;
export type SettingField = (typeof SETTING_FIELDS)[number];
const settingScope = s.literal(SETTING_SCOPES, "Scope");
/** `{ model?: Scope, reasoningLevel?: Scope, permissionMode?: Scope }` — on a provider row, what a reply may set; on a reply's result, what was applied. U47 */
const settingScopes = s.object({ model: s.optional(settingScope), reasoningLevel: s.optional(settingScope), permissionMode: s.optional(settingScope) }, "Settings");
/** `session.reply { settings }`: values from `providers.list`, applied to the next turn. U47 */
const replySettings = s.object({ model: s.optional(safeName("Model id")), reasoningLevel: s.optional(safeName("Reasoning level", 64)), permissionMode: s.optional(safeName("Permission mode", 64)) }, "Settings");
/** A session's current settings as the host knows them, on `context.get`'s `session` and on `sessions.snapshot` rows: the same ids a reply would name; a field absent where the host cannot tell. U50 */
const sessionSettings = replySettings;
const replyDeliveryResult = s.object({ delivery, duplicate: s.boolean(), settings: s.optional(settingScopes) });

export const DECISIONS = ["allow_once", "allow_for_session", "deny"] as const;
export type Decision = (typeof DECISIONS)[number];
export const APPROVAL_SUBJECTS = ["tool", "command", "file_change", "permission", "plan", "other"] as const;

/** The `waiting` object of 03 §Session state vocabulary, as a read returns it (bounded by `boundWaiting`). */
export const waitingSchema = s.object({
  id: s.nullable(waitId),
  kind: s.literal(["question", "approval", "other"], "Kind"),
  text: s.nullable(s.string({ max: LIMITS.questionChars, label: "Text" })),
  truncated: s.optional(s.literal([true])),
  questions: s.optional(
    s.array(
      s.object({
        id: s.string({ min: 1, max: 256, label: "Question id" }),
        text: s.string({ max: 4096, label: "Question" }),
        options: s.array(s.object({ id: s.string({ min: 1, max: 256, label: "Option id" }), label: s.string({ max: 1024, label: "Option" }) }), 64, "Options"),
        multiSelect: s.boolean(),
        allowFreeText: s.boolean(),
      }),
      64,
      "Questions",
    ),
  ),
  approval: s.optional(
    s.object({
      subject: s.literal(APPROVAL_SUBJECTS, "Subject"),
      summary: s.string({ max: LIMITS.decisionSummaryChars, label: "Summary" }),
      decisions: s.array(s.literal(DECISIONS, "Decision"), 3, "Decisions"),
    }),
  ),
});
export type WaitingResult = s.Infer<typeof waitingSchema>;

function spec<P, R>(definition: CapabilitySpec<P, R>): CapabilitySpec<P, R> {
  return Object.freeze(definition);
}

function params<P>(schema: s.Schema<P>) {
  return (value: JsonValue | undefined) => schema.parse(value, "$");
}

function result<R>(schema: s.Schema<R>) {
  return (value: unknown) => schema.parse(value as JsonValue, "$");
}

/** The answer to a wait: `answers` keyed by question id, or one `decision`; exactly one. 03 §Session state vocabulary */
const answersSchema = s.map(
  s.object({
    selected: s.array(s.string({ min: 1, max: 256, label: "Option id" }), 64, "Selected"),
    freeText: s.optional(s.string({ max: LIMITS.promptChars, label: "Free text" })),
  }),
  { max: 64, label: "Answers" },
);
const decisionSchema = s.literal(DECISIONS, "Decision");
const exactlyOneOf =
  (...keys: string[]) =>
  (value: Record<string, unknown>): string | null => {
    const present = keys.filter((key) => value[key] !== undefined);
    return present.length === 1 ? null : `Give exactly one of ${keys.join(", ")}`;
  };

// --- core reads --------------------------------------------------------------

const rosterEntry = s.object({
  method: s.string({ min: 3, max: LIMITS.methodNameChars, label: "Method" }),
  effect: s.literal(EFFECT_CLASSES),
  confirmation: s.literal(["none", "required", "grant"]),
  maxRequestBytes: s.integer(1, Math.max(LIMITS.contributedPayloadMaxBytes, LIMITS.storagePageBytes + 4096), "Bound"),
  maxResponseBytes: s.integer(1, Math.max(LIMITS.contributedPayloadMaxBytes, LIMITS.pagesReadBytes), "Bound"),
  contributor: s.optional(s.object({ id: s.string({ min: 1, max: 32, label: "Contributor" }), version: s.string({ min: 1, max: 64, label: "Version" }) })),
  description: s.optional(s.string({ min: 1, max: LIMITS.methodDescriptionChars, label: "Description" })),
  reasons: s.optional(s.array(s.string({ min: 1, max: 64, label: "Reason" }), 64)),
});

export const contextGet = spec({
  method: "context.get",
  tier: "core",
  description: "Read this page's identity and the capability roster.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      protocolVersion: s.literal([1]),
      session: s.nullable(s.object({ id: entityId("Session id"), title: title(), workspaceId: entityId("Workspace id"), settings: s.optional(sessionSettings) })),
      page: s.object({ revision, readOnly: s.boolean() }),
      capabilities: s.array(rosterEntry, 512),
    }),
  ),
  doc: {
    params: "None.",
    result: "`{ protocolVersion: 1, session: { id, title, workspaceId, settings? } | null, page: { revision, readOnly }, capabilities: [{ method, effect, confirmation, maxRequestBytes, maxResponseBytes, contributor?, description?, reasons? }] }`. `confirmation` is `none`, `required`, or `grant` (asked once per session pair, then remembered). `session` is `null` on the built-in home page. `session.settings` is `{ model?, reasoningLevel?, permissionMode? }` — this session's current values as the host knows them, in the ids `providers.list` uses; a field the host cannot tell is absent, never guessed. `page.readOnly` is true for an offline copy and for an archived session's page.",
    notes: "The roster lists what is actually enabled, contributed capabilities included; check it rather than assume. A composer that offers `session.reply { settings }` starts from `session.settings`, so the reader's current choice is the preselected one.",
  },
});

const activityItem = s.object({
  kind: s.string({ min: 1, max: 80, label: "Kind" }),
  done: s.boolean(),
  atMs: timestamp,
  label: s.string({ min: 1, max: 80, label: "Label" }),
  text: s.string({ max: 200, label: "Text" }),
});

export const sessionActivity = spec({
  method: "session.activity",
  tier: "core",
  description: "Read this session's state, what it waits on, and its recent activity.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ limit: s.limit(LIMITS.activityMax, LIMITS.activityDefault) })),
  validateResult: result(
    s.object({
      state: sessionState,
      waiting: s.nullable(waitingSchema),
      updatedAtMs: timestamp,
      startedAtMs: timestamp,
      turnEndedAtMs: s.nullable(timestamp),
      items: s.array(activityItem, LIMITS.activityMax),
    }),
  ),
  doc: {
    params: `\`{ limit? }\` — 1 to ${LIMITS.activityMax}, default ${LIMITS.activityDefault}; over the maximum is \`invalid_params\`. It never takes a session id: it is always this page's own session.`,
    result: `\`{ state, waiting, updatedAtMs, startedAtMs, turnEndedAtMs, items: [{ kind, done, atMs, label, text }] }\` where \`state\` is one of \`working\`, \`idle\`, \`waiting\`, \`failed\`, \`stopped\`; \`waiting\` is null unless the state is \`waiting\`, else \`{ id, kind, text, questions?, approval? }\` with \`text\` at most ${LIMITS.questionChars} characters (marked \`truncated\` when cut).`,
  },
});

const messageSchema = s.object({
  id: s.string({ min: 1, max: 256, label: "Message id" }),
  atMs: timestamp,
  turnId: s.optional(s.string({ min: 1, max: 256, label: "Turn id" })),
  agentId: s.optional(s.string({ min: 1, max: 256, label: "Agent id" })),
  cursor,
  kind: s.literal(["user", "assistant", "tool", "notice", "question"], "Kind"),
  text: s.optional(s.string({ max: LIMITS.messageTextChars, label: "Text" })),
  from: s.optional(s.object({ kind: s.literal(["reader", "page", "session", "plugin", "schedule"], "From"), label: s.optional(title("Label")) })),
  tool: s.optional(
    s.object({
      name: s.string({ min: 1, max: 256, label: "Tool" }),
      input: s.json({ maxBytes: LIMITS.messagesResponseBytes }, "Tool input"),
      result: s.optional(s.json({ maxBytes: LIMITS.messagesResponseBytes }, "Tool result")),
      isError: s.optional(s.boolean()),
    }),
  ),
  question: s.optional(
    s.object({
      id: s.string({ min: 1, max: 256, label: "Question id" }),
      options: s.optional(s.array(s.object({ questionId: s.string({ min: 1, max: 256 }), id: s.string({ min: 1, max: 256 }), label: s.string({ max: 1024 }) }), 256)),
      answered: s.boolean(),
    }),
  ),
  files: s.optional(s.array(s.object({ name: s.string({ min: 1, max: 1024, label: "Name" }), path: s.optional(s.string({ max: 4096, label: "Path" })), mimeType: s.string({ max: 255, label: "Type" }), sizeBytes: s.integer(0, Number.MAX_SAFE_INTEGER, "Size") }), 64)),
  done: s.boolean(),
  truncated: s.optional(s.literal([true])),
});
export type MessageResult = s.Infer<typeof messageSchema>;

const messagesResult = s.object({
  messages: s.array(messageSchema, LIMITS.messagesMax, "Messages"),
  nextCursor: s.nullable(cursor),
  prevCursor: s.nullable(cursor),
  generatedAtMs: timestamp,
});

const bothCursors = (value: { before?: string; after?: string }) => (value.before !== undefined && value.after !== undefined ? "before and after cannot be given together" : null);

export type MessagesParams = s.Infer<typeof messagesParams>;
const messagesParams = s.refine(
  s.object({ limit: s.limit(LIMITS.messagesMax, LIMITS.messagesDefault), before: s.optional(cursor), after: s.optional(cursor) }),
  bothCursors,
);

const MESSAGES_RESULT_DOC = `\`{ messages: [{ id, atMs, turnId?, agentId?, cursor, kind, text?, from?, tool?, question?, files?, done, truncated? }], nextCursor, prevCursor, generatedAtMs }\`. Rows are oldest first; every row carries its own \`cursor\`; \`nextCursor\` is the newest row's and \`prevCursor\` the oldest's (null when no row, and \`prevCursor\` null once the first row was returned). \`done\` is true once a row's content is final. \`text\` is at most ${LIMITS.messageTextChars} characters, \`tool.input\` ${kibibytes(LIMITS.toolInputBytes)} and \`tool.result\` ${kibibytes(LIMITS.toolResultBytes)}; a cut row is \`truncated\`. One response is at most ${kibibytes(LIMITS.messagesResponseBytes)}.`;
const MESSAGES_PARAMS_DOC = `\`limit\` 1 to ${LIMITS.messagesMax}, default ${LIMITS.messagesDefault}, over it \`invalid_params\`; no cursor returns the newest rows; \`before: <cursor>\` the rows older than it (history); \`after: <cursor>\` the oldest rows newer than it (tailing); both at once is \`invalid_params\`. There is no \`order\`.`;

export const sessionMessages = spec({
  method: "session.messages",
  tier: "core",
  description: "Read this session's transcript, bounded, with cursors.",
  effect: "read",
  confirmed: false,
  implemented: true,
  maxResponseBytes: LIMITS.messagesResponseBytes,
  validateParams: params(messagesParams),
  validateResult: result(messagesResult),
  doc: {
    params: `\`{ limit?, before?, after? }\` — ${MESSAGES_PARAMS_DOC} It never takes a session id.`,
    result: MESSAGES_RESULT_DOC,
    notes: `A live chat watches \`session.messages\` with \`{ limit: N }\` (interval ${LIMITS.watchMinMs / 1000} s at the fastest) and reconciles rows by \`id\`; it reads history on demand with \`before: prevCursor\`.`,
  },
});

export const sessionsMessages = spec({
  method: "sessions.messages",
  tier: "core",
  description: "Read the transcript of any session the reader can see.",
  effect: "read",
  confirmed: false,
  implemented: true,
  maxResponseBytes: LIMITS.messagesResponseBytes,
  validateParams: params(s.refine(s.object({ sessionId: entityId("Session id"), limit: s.limit(LIMITS.messagesMax, LIMITS.messagesDefault), before: s.optional(cursor), after: s.optional(cursor) }), bothCursors)),
  validateResult: result(messagesResult),
  doc: {
    params: `\`{ sessionId, limit?, before?, after? }\` — ${MESSAGES_PARAMS_DOC}`,
    result: MESSAGES_RESULT_DOC,
    notes: "No confirmation and no grant for any session the reader can see, archived ones included; a deleted session is `not_found`.",
  },
});

export const workspacesList = spec({
  method: "workspaces.list",
  tier: "core",
  description: "Read workspace choices without paths or host details.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      workspaces: s.array(
        s.refine(
          s.object({
            id: entityId("Workspace id"),
            name: title("Workspace name"),
            kind: s.string({ min: 1, max: 64, label: "Kind" }),
            environments: s.optional(s.array(s.object({ id: entityId("Environment id"), name: title("Environment name"), isDefault: s.boolean() }), LIMITS.environmentsPerWorkspace, "Environments")),
          }),
          (workspace) => (workspace.environments && workspace.environments.filter((environment) => environment.isDefault).length !== 1 ? "exactly one environment is the default" : null),
        ),
        LIMITS.workspacesMax,
      ),
    }),
  ),
  doc: {
    params: "None. (`projects.list` is an alias.)",
    result: "`{ workspaces: [{ id, name, kind, environments?: [{ id, name, isDefault }] }] }`. `id` is opaque and stable while the host's key is; `kind` is the host's word; `environments` appears only on a host that has them and is the only place an environment id comes from. No paths.",
    notes: "A stored workspace id that answers `not_found` means the host's key was regenerated: list again.",
  },
});

const sessionRow = s.object({
  id: entityId("Session id"),
  title: title(),
  workspaceId: entityId("Workspace id"),
  parentSessionId: s.nullable(entityId("Session id")),
  state: sessionState,
  status: sessionState,
  waiting: s.nullable(waitingSchema),
  archived: s.boolean(),
  page: s.object({ available: s.boolean(), revision: s.nullable(revision) }),
  updatedAtMs: timestamp,
  startedAtMs: timestamp,
  turnEndedAtMs: s.nullable(timestamp),
  unread: s.optional(s.boolean()),
  attentionAtMs: s.optional(timestamp),
  settings: s.optional(sessionSettings),
});
export type SessionRow = s.Infer<typeof sessionRow>;

export type SnapshotParams = s.Infer<typeof snapshotParams>;
const snapshotParams = s.renamingKey(
  s.object({
    workspaceId: s.optional(s.nullable(entityId("Workspace id"))),
    includeArchived: s.withDefault(s.boolean(), false),
    includeChildren: s.withDefault(s.boolean(), false),
    limit: s.limit(LIMITS.snapshotMax, LIMITS.snapshotDefault),
    cursor: s.optional(s.nullable(cursor)),
  }),
  "projectId",
  "workspaceId",
);

export const sessionsSnapshot = spec({
  method: "sessions.snapshot",
  tier: "core",
  description: "Read a bounded, projected list of sessions.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(snapshotParams),
  validateResult: result(s.object({ sessions: s.array(sessionRow, LIMITS.snapshotMax), nextCursor: s.nullable(cursor), generatedAtMs: timestamp })),
  doc: {
    params: `\`{ workspaceId?, includeArchived?, includeChildren?, limit?, cursor? }\` — \`limit\` 1 to ${LIMITS.snapshotMax}, default ${LIMITS.snapshotDefault}, over it \`invalid_params\`; pass the previous result's \`nextCursor\` to continue. By default only root sessions are listed; \`includeChildren: true\` adds sub-agent sessions. \`projectId\` is accepted for \`workspaceId\`.`,
    result: "`{ sessions: [{ id, title, workspaceId, parentSessionId, state, status, waiting, archived, page: { available, revision }, updatedAtMs, startedAtMs, turnEndedAtMs, unread?, attentionAtMs?, settings? }], nextCursor, generatedAtMs }`. `status` repeats `state` for 0.x readers. `waiting` is as `session.activity` reports it. `page.revision` is known for pages this host served recently and null otherwise. `settings` is `{ model?, reasoningLevel?, permissionMode? }`, the session's current values where this host knows them (ids as `providers.list`); absent otherwise.",
    notes: "No message bodies are included; the one piece of agent output is `waiting`. The transcript is `sessions.messages`.",
  },
});

export const providersList = spec({
  method: "providers.list",
  tier: "extras",
  requires: ["providers"],
  description: "Read the AI provider, model and permission-mode choices a page may pass to sessions.start, and what a running session may change through session.reply.settings.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      providers: s.refine(
        s.array(
          s.refine(
            s.object({
              id: entityId("Provider id"),
              displayName: title("Provider name"),
              available: s.boolean(),
              default: s.boolean(),
              models: s.array(s.object({ id: safeName("Model id"), displayName: title("Model name"), default: s.boolean(), reasoningLevels: s.optional(s.array(s.object({ id: safeName("Reasoning level", 64), displayName: title("Reasoning level") }), 32)) }), LIMITS.modelsPerProvider),
              reasoningLevels: s.optional(s.array(s.object({ id: safeName("Reasoning level", 64), displayName: title("Reasoning level") }), 32)),
              permissionModes: s.optional(s.array(s.object({ id: safeName("Permission mode", 64), displayName: title("Permission mode"), default: s.boolean() }), 32)),
              settings: settingScopes,
            }),
            (provider) =>
              (provider.models.length > 0 && provider.models.filter((model) => model.default).length !== 1) || (provider.permissionModes && provider.permissionModes.length > 0 && provider.permissionModes.filter((mode) => mode.default).length !== 1)
                ? "exactly one default per list"
                : null,
          ),
          LIMITS.providersMax,
        ),
        (providers) => (providers.length > 0 && providers.filter((provider) => provider.default).length !== 1 ? "exactly one default provider" : null),
      ),
    }),
  ),
  doc: {
    params: "None.",
    result: "`{ providers: [{ id, displayName, available, default, models: [{ id, displayName, default, reasoningLevels? }], reasoningLevels?: [{ id, displayName }], permissionModes?: [{ id, displayName, default }], settings: { model?, reasoningLevel?, permissionMode? } }] }`; exactly one `default: true` per list. `settings` says which of the three a running session of that provider accepts through `session.reply.settings`, each with its scope — `turn` (one answer) or `session` (from now on); a field absent cannot be changed mid-session on this host. A model's own `reasoningLevels`, where present, is the list that counts for that model; the provider's flat list is their union.",
    notes: "Fails with `unavailable` when the host cannot enumerate providers; it never returns an empty list to mean that.",
  },
});

const storageKey = s.string({ min: 1, max: LIMITS.storageKeyChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Storage key" });
const storageValue = s.json({ maxBytes: LIMITS.storageValueBytes }, "Stored value");

export const storageGet = spec({
  method: "storage.get",
  tier: "core",
  description: "Read a JSON value stored for this page.",
  effect: "read",
  confirmed: false,
  implemented: true,
  maxResponseBytes: LIMITS.storageValueBytes + 4096,
  validateParams: params(s.object({ key: storageKey })),
  validateResult: result(s.union(s.object({ found: s.literal([false]) }), s.object({ found: s.literal([true]), value: storageValue }), "Storage result")),
  doc: { params: "`{ key }`.", result: "`{ found: false }` or `{ found: true, value }`.", notes: "Namespaced per session and per document scope; the built-in home has a namespace of its own." },
});

export const storageSet = spec({
  method: "storage.set",
  tier: "core",
  description: "Store a JSON value for this page; null removes the key.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  maxRequestBytes: LIMITS.storageValueBytes + 4096,
  validateParams: params(s.object({ key: storageKey, value: storageValue })),
  validateResult: result(s.object({ stored: s.literal([true]) })),
  doc: {
    params: `\`{ key, value }\` — the value serialised is at most ${kibibytes(LIMITS.storageValueBytes)}; \`null\` removes the key.`,
    result: "`{ stored: true }`.",
    notes: `All of a page's values together, across scopes, are at most ${mebibytes(LIMITS.storagePageBytes)} (or the host's lower cap); over either bound the call is \`request_too_large\` naming the limit and nothing is written.`,
  },
});

export const storageSetMany = spec({
  method: "storage.setMany",
  tier: "core",
  description: "Store several JSON values for this page in one request, all or none.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  maxRequestBytes: LIMITS.storagePageBytes + 4096,
  validateParams: params(
    s.refine(s.object({ entries: s.array(s.object({ key: storageKey, value: storageValue }), LIMITS.storageSetManyEntries, "Entries") }), (value) => {
      const keys = value.entries.map((entry) => entry.key);
      return new Set(keys).size === keys.length ? null : "duplicate key";
    }),
  ),
  validateResult: result(s.object({ stored: s.integer(0, LIMITS.storageSetManyEntries, "Stored") })),
  doc: {
    params: `\`{ entries: [{ key, value }] }\` — at most ${LIMITS.storageSetManyEntries} entries, no key twice; a \`null\` value removes its key.`,
    result: "`{ stored: n }`.",
    notes: "One request against the budget; applied atomically — an over-bound entry fails the whole call before anything is written.",
  },
});

// --- own-session writes -------------------------------------------------------

/**
 * The files a call carries, as the shell read them from the `File`s it
 * holds: the page passes the files themselves, never this list, and their
 * bytes never ride in the JSON payload. Count and size are the handler's
 * (`request_too_large`). 03 R5.75, R5.77, 05 R3.20a
 */
export const promptFile = s.object({
  name: s.string({ min: 1, max: 255, pattern: /^[^\u0000-\u001f\u007f]+$/, label: "File name" }),
  size: s.integer(0, Number.MAX_SAFE_INTEGER, "File size"),
  type: s.string({ max: 255, pattern: /^[^\u0000-\u001f\u007f]*$/, label: "File type" }),
});
export type PromptFile = s.Infer<typeof promptFile>;
const promptFiles = s.optional(s.array(promptFile, 256, "Files"));
const attachmentIds = s.optional(s.array(s.string({ min: 1, max: 512, label: "Attachment id" }), 256, "Attachments"));
const FILES_DOC = `\`files\` is a \`FileList\`, an array of \`File\`, or an \`<input type="file">\` (the files chosen in it): at most ${LIMITS.promptFiles} files of at most ${mebibytes(LIMITS.promptFileBytes)} each, else \`request_too_large\` before any dialog; \`unavailable\` on a host that cannot attach files.`;

const replyShape = {
  kind: s.withDefault(s.literal(["result", "prompt"], "Kind"), "result"),
  title: s.optional(title()),
  mode: sendMode,
  result: s.optional(s.json({ maxBytes: LIMITS.resultTextBytes }, "Result")),
  text: s.optional(s.string({ min: 1, max: LIMITS.promptChars, label: "Text" })),
  idempotencyKey: s.optional(idempotencyKey),
};
const replyRule = (value: { kind: "result" | "prompt"; result?: JsonValue; text?: string }): string | null => {
  if (value.result !== undefined && value.text !== undefined) return "Give result or text, not both";
  if (value.kind === "result" && value.result === undefined) return "kind result needs result";
  if (value.kind === "prompt" && value.text === undefined) return "kind prompt needs text";
  return null;
};

export type SessionReplyParams = s.Infer<typeof sessionReplyParams>;
const sessionReplyParams = s.refine(s.object({ ...replyShape, settings: s.optional(replySettings), files: promptFiles, attachments: attachmentIds }), replyRule);

export const sessionReply = spec({
  method: "session.reply",
  tier: "core",
  description: "Send the reader's next message to this page's owning session: a structured result or a prompt as typed.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionReplyParams),
  validateResult: result(replyDeliveryResult),
  doc: {
    params: `\`{ kind?, title?, mode?, result?, text?, settings?, files?, idempotencyKey? }\` — \`kind\` is \`result\` (default: a JSON \`result\`, worded as an interactive response) or \`prompt\` (\`text\`, delivered as typed, as a chat composer sends it); exactly one of \`result\` and \`text\`, matching \`kind\`; \`mode\` is \`queue\` (default: waits for the current turn) or \`steer\` (interrupts it). \`settings\` is \`{ model?, reasoningLevel?, permissionMode? }\` for the **next turn** — the one this message starts, or the queued one it becomes, never the running one — each a value this session's provider lists in \`providers.list\`, and only a field that provider's \`settings\` names. ${FILES_DOC}`,
    result: "`{ delivery: 'started' | 'queued' | 'steered', duplicate, settings? }` — `settings` echoes what was applied, each field with its scope: `turn` (this one answer) or `session` (from now on, until changed again).",
    notes: "With an `idempotencyKey`, a repeat with the same content delivers once and reports `duplicate: true`; a repeat with different content is a `conflict`. A `settings` field the provider does not list for running sessions, or a value it does not list, fails the whole call before anything is delivered with `settings_unsupported` (`detail.unsupported` names the fields); resend without them. `settings.permissionMode` is confirmed in host chrome every time, like a permission decision, naming the mode and how long it holds; `model` and `reasoningLevel` are not confirmed. Word the control by the scope `providers.list` reports: “for this answer” when it is `turn`, “from now on” when it is `session`. `unavailable` with reason `archived` on an archived session's page; `stale_page` from an offline copy.",
  },
});

// --- starting and steering work ---------------------------------------------------

export type SessionsSendParams = s.Infer<typeof sessionsSendParams>;
const sessionsSendParams = s.object({ sessionId: entityId("Session id"), prompt, mode: sendMode, files: promptFiles, attachments: attachmentIds });

export const sessionsSend = spec({
  method: "sessions.send",
  tier: "core",
  description: "Send a prompt to another existing session, as the reader's words.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsSendParams),
  validateResult: result(s.object({ sessionId: entityId("Session id"), delivery, duplicate: s.boolean() })),
  doc: {
    params: `\`{ sessionId, prompt, mode?, files? }\` — \`mode\` \`queue\` (default) or \`steer\`; \`prompt\` at most ${kibibytes(LIMITS.promptChars)}. ${FILES_DOC}`,
    result: "`{ sessionId, delivery, duplicate }`.",
    notes: "Confirmed in host chrome: the summary names the session and the prompt, and every file with its size. Refuses this page's own session with `invalid_params`; use `session.reply` for that. An archived target is `unavailable` with reason `archived`.",
  },
});

export type SessionsStartParams = s.Infer<typeof sessionsStartParams>;
const sessionsStartParams = s.renamingKey(
  s.object({
    workspaceId: entityId("Workspace id"),
    prompt,
    title: s.optional(title()),
    providerId: s.optional(entityId("Provider id")),
    model: s.optional(safeName("Model id")),
    reasoningLevel: s.optional(safeName("Reasoning level", 64)),
    permissionMode: s.optional(safeName("Permission mode", 64)),
    environment: s.optional(entityId("Environment id")),
    files: promptFiles,
    attachments: attachmentIds,
  }),
  "projectId",
  "workspaceId",
);

export const sessionsStart = spec({
  method: "sessions.start",
  tier: "core",
  description: "Start a new visible root session in a workspace.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsStartParams),
  validateResult: result(s.object({ sessionId: entityId("Session id") })),
  doc: {
    params: `\`{ workspaceId, prompt, title?, providerId?, model?, reasoningLevel?, permissionMode?, environment?, files? }\` — only \`workspaceId\` and \`prompt\` are needed; \`providerId\`, \`model\`, \`reasoningLevel\` and \`permissionMode\` come from \`providers.list\`; \`environment\` is one of the workspace's \`environments[].id\` from \`workspaces.list\` (absent: the workspace's default; a value on a host without environments is \`invalid_params\`). \`projectId\` is accepted for \`workspaceId\`. ${FILES_DOC}`,
    result: "`{ sessionId }`.",
    notes: "Confirmed in host chrome: the summary names the workspace, the prompt, the resolved provider, model and environment, and every file with its size. The started session is a visible root owned by the reader, never a child of this page's session.",
  },
});

export const sessionsStop = spec({
  method: "sessions.stop",
  tier: "core",
  description: "Stop a session's running turn.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(s.object({ stopped: s.boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ stopped }`.", notes: "Confirmed. Refuses this page's own session outright, before any dialog." },
});

export const pagesOpen = spec({
  method: "pages.open",
  tier: "core",
  description: "Open another session's page in place.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(openedResult),
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`, after which the reader's view navigates in place; the back button returns here. A deleted session is `not_found`." },
});

export type OpenExternalParams = s.Infer<typeof openExternalParams>;
const openExternalParams = s.object({
  url: s.refine(s.string({ min: 1, max: 2048, pattern: /^[^\u0000- \u007f]+$/, label: "URL" }), (value) => externalUrlProblem(value)),
  label: s.optional(s.string({ min: 1, max: 160, label: "Label" })),
});

export const navigationOpenExternal = spec({
  method: "navigation.openExternal",
  tier: "core",
  description: "Open an external http(s) URL in a new tab through trusted chrome.",
  effect: "navigation",
  confirmed: true,
  implemented: true,
  validateParams: params(openExternalParams),
  validateResult: result(openedResult),
  doc: {
    params: "`{ url, label? }` — http or https only.",
    result: "`{ opened: true }`. The confirmation names the destination origin and says it opens in a new tab; the page stays. An ordinary `<a href=\"https://…\">` in your page goes through this automatically. The host's own origins are refused with `invalid_params` before any dialog: use `pages.open` or `sessions.openHost`.",
  },
});

// --- optional ---------------------------------------------------------------------

const respondShape = { id: waitId, answers: s.optional(answersSchema), decision: s.optional(decisionSchema) };
const respondRule = exactlyOneOf("answers", "decision");
const answeredResult = s.object({ answered: s.literal([true]) });

export type SessionRespondParams = s.Infer<typeof sessionRespondParams>;
const sessionRespondParams = s.refine(s.object(respondShape), respondRule);

export const sessionRespond = spec({
  method: "session.respond",
  tier: "respond",
  requires: ["respond"],
  description: "Answer what this page's own session waits on: a question's answers, or a decision on a permission (confirmed per call).",
  effect: "device",
  confirmed: true,
  confirmedFor: "decision",
  implemented: true,
  validateParams: params(sessionRespondParams),
  validateResult: result(answeredResult),
  doc: {
    params: "`{ id, answers }` or `{ id, decision }` — `id` is the current `waiting.id`; `answers` is `{ [questionId]: { selected: [optionId], freeText? } }` for a `question`; `decision` is one of the approval's `decisions` for an `approval`.",
    result: "`{ answered: true }`.",
    notes: "`answers` needs no dialog. `decision` is confirmed per call in host chrome, naming the subject, the provider's whole summary and the decision; a declined one is `cancelled`, and further `decision` calls for that wait are `cancelled` without a dialog for 10 s. `not_found` once the wait is over or `id` is not the current wait's; `conflict` when the answer does not match the wait's kind; `unavailable` for a wait with `id: null`, an archived session, or a summary too long to show (reason `summary_too_long`).",
  },
});

export type SessionsRespondParams = s.Infer<typeof sessionsRespondParams>;
const sessionsRespondParams = s.refine(s.object({ sessionId: entityId("Session id"), ...respondShape }), respondRule);

export const sessionsRespond = spec({
  method: "sessions.respond",
  tier: "respond",
  requires: ["respond"],
  description: "Answer what another session waits on: a question's answers under the pair grant, or a decision (confirmed per call).",
  effect: "granted-write",
  confirmed: false,
  confirmedFor: "decision",
  implemented: true,
  validateParams: params(sessionsRespondParams),
  validateResult: result(answeredResult),
  doc: {
    params: "`{ sessionId, id, answers }` or `{ sessionId, id, decision }` — as `session.respond`, naming the session.",
    result: "`{ answered: true }`.",
    notes: "`answers` is covered by the same pair grant as `pages.answer`, asked once in host chrome; `decision` is confirmed every time and never granted. Refuses this page's own session with `invalid_params`; use `session.respond`.",
  },
});

export const sessionUsage = spec({
  method: "session.usage",
  tier: "extras",
  requires: ["usage"],
  description: "Read this session's context use and cost.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      context: s.object({ tokens: s.integer(0, Number.MAX_SAFE_INTEGER, "Tokens"), window: s.integer(0, Number.MAX_SAFE_INTEGER, "Window"), percent: s.number(0, 100, "Percent") }),
      cost: s.optional(s.object({ usd: s.number(0, Number.MAX_SAFE_INTEGER, "Cost") })),
    }),
  ),
  doc: { params: "None.", result: "`{ context: { tokens, window, percent }, cost?: { usd } }`." },
});

export const sessionsArchive = spec({
  method: "sessions.archive",
  tier: "extras",
  requires: ["archive"],
  description: "Archive a session.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(s.object({ archived: s.boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ archived }`.", notes: "Confirmed. Refuses this page's own session; the shell's own control archives the shown session." },
});

export const sessionsMarkRead = spec({
  method: "sessions.markRead",
  tier: "extras",
  requires: ["markRead"],
  description: "Mark a session read or unread for the reader.",
  effect: "reader-state",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ sessionId: entityId("Session id"), read: s.withDefault(s.boolean(), true) })),
  validateResult: result(s.object({ sessionId: entityId("Session id"), unread: s.boolean() })),
  doc: {
    params: "`{ sessionId, read? }` — `read` defaults to true; `false` marks it unread again.",
    result: "`{ sessionId, unread }`, the mark after the change.",
    notes: "Changes only the reader's own attention mark, the one the host's session list shows; it never touches the session's work, so it is not confirmed.",
  },
});

export const sessionsOpenHost = spec({
  method: "sessions.openHost",
  tier: "extras",
  requires: ["openHost"],
  description: "Open a session in the host application.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(openedResult),
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`; the reader's view goes to the session's canonical address in the host. `{ opened: false, notice }` when the host has nowhere to open it from here (it is open in the host's own window already, say): `notice` is the host's one line for the reader; not an error." },
});

const selectionToken = s.string({ min: 1, max: LIMITS.tokenChars, pattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, label: "Selection token" });

export const workspacesBrowse = spec({
  method: "workspaces.browse",
  tier: "extras",
  requires: ["browse"],
  description: "Open the host's folder picker and return an opaque selection token.",
  effect: "device",
  confirmed: true,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(s.object({ selection: s.nullable(s.object({ token: selectionToken, display: s.string({ min: 1, max: 1024, label: "Display" }) })) })),
  doc: {
    params: "None. (`projects.browse` is an alias.)",
    result: `\`{ selection: null }\` when the reader cancels the picker, else \`{ selection: { token, display } }\`. The token is single use, valid for ${LIMITS.selectionTokenMs / 60_000} minutes and only for this page; the page never sees a filesystem path.`,
  },
});

export const workspacesCreate = spec({
  method: "workspaces.create",
  tier: "extras",
  requires: ["browse"],
  description: "Create a workspace from a folder-picker selection.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(s.object({ selectionToken, name: s.optional(title("Name")) })),
  validateResult: result(s.object({ workspaceId: entityId("Workspace id") })),
  doc: { params: "`{ selectionToken, name? }`. (`projects.create` is an alias.)", result: "`{ workspaceId }`.", notes: "An expired, reused or foreign token is `invalid_params`." },
});

const answerToken = s.string({ min: 1, max: LIMITS.tokenChars, pattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, label: "Answer token" });
/** A document of a page: `index.html` and an absent path are the entry document. */
const documentPath = s.refine(s.string({ min: 1, max: 1024, label: "Path" }), (value) => (value === ENTRY_DOCUMENT || isDocumentPath(value) ? null : "is not a document of a page"));

export type PagesReadParams = s.Infer<typeof pagesReadParams>;
const pagesReadParams = s.object({
  pages: s.array(s.object({ sessionId: entityId("Session id"), path: s.optional(documentPath), ifNoneMatch: s.optional(revision) }), LIMITS.pagesReadEntries, "Pages", 1),
});

export const PAGE_READ_REASONS = ["no_session", "no_page", "too_large", "unreachable"] as const;

export const pagesRead = spec({
  method: "pages.read",
  tier: "composition",
  description: "Read other sessions' page documents as the host serves them, conditionally and in one call.",
  effect: "read",
  confirmed: false,
  implemented: true,
  maxResponseBytes: LIMITS.pagesReadBytes,
  validateParams: params(pagesReadParams),
  validateResult: result(
    s.object({
      pages: s.array(
        s.object({
          sessionId: entityId("Session id"),
          path: s.string({ min: 1, max: 1024, label: "Path" }),
          revision: s.optional(revision),
          html: s.optional(s.string({ max: LIMITS.pagesReadBytes, label: "Document" })),
          unchanged: s.optional(s.literal([true])),
          deferred: s.optional(s.literal([true])),
          title: s.optional(title()),
          workspaceId: s.optional(entityId("Workspace id")),
          working: s.optional(s.boolean()),
          readOnly: s.optional(s.boolean()),
          answerToken: s.optional(answerToken),
          error: s.optional(s.object({ code: s.literal(["not_found", "unavailable", "response_too_large"]), reason: s.literal(PAGE_READ_REASONS), message: s.string({ min: 1, max: LIMITS.errorMessageChars, label: "Message" }) })),
        }),
        LIMITS.pagesReadEntries,
      ),
    }),
  ),
  doc: {
    params: `\`{ pages: [{ sessionId, path?, ifNoneMatch? }] }\` — 1 to ${LIMITS.pagesReadEntries} entries. \`path\` is a document of that page (default its entry document); \`ifNoneMatch\` is the revision you already hold.`,
    result: `\`{ pages: [entry] }\`, one per request entry, in order, each with \`sessionId\` and \`path\` and one of: the document \`{ revision, html, title, workspaceId, working, readOnly, answerToken }\`; \`{ unchanged: true, title, workspaceId, working, readOnly, answerToken }\` when \`ifNoneMatch\` is current; \`{ deferred: true }\` when it did not fit this response — ask again; \`{ error: { code, reason, message } }\` with reason \`no_session\`, \`no_page\`, \`too_large\` or \`unreachable\`. \`readOnly\` is true for an offline copy and for an archived session.`,
    notes: `\`threadPage.embed\` calls this for you; call it yourself only to quote or summarise another page. \`html\` is the document as the host serves it for a sandboxed \`srcdoc\` frame, with the kernel in embedded mode. One response holds at most ${mebibytes(LIMITS.pagesReadBytes)}: a larger single document is refused for that entry, never truncated, and the rest are deferred; the first entry is never deferred.`,
  },
});

const submissionAnswer = s.object({
  name: s.string({ max: 128, label: "Name" }),
  label: s.string({ max: 300, label: "Label" }),
  value: s.union(s.union(s.boolean(), s.string({ max: LIMITS.answerValueChars, label: "Answer" })), s.array(s.string({ max: 2_000, label: "Answer" }), LIMITS.answerListItems)),
});

export type PagesAnswerParams = s.Infer<typeof pagesAnswerParams>;
const pagesAnswerParams = s.refine(
  s.object({
    answerToken,
    form: s.optional(
      s.object({
        submissionId: s.string({ min: 1, max: 128, pattern: /^[A-Za-z0-9._-]+$/, label: "Submission id" }),
        title: s.string({ max: 300, label: "Title" }),
        writtenAgainst: revision,
        formId: s.optional(s.nullable(s.string({ max: 300, label: "Form id" }))),
        formTitle: s.optional(s.nullable(s.string({ max: 300, label: "Form title" }))),
        action: s.optional(s.nullable(s.string({ max: LIMITS.answerValueChars, label: "Action" }))),
        answers: s.array(submissionAnswer, LIMITS.answersPerSubmission, "Answers"),
      }),
    ),
    reply: s.optional(s.refine(s.object(replyShape), replyRule)),
    respond: s.optional(s.object({ id: waitId, answers: answersSchema })),
  }),
  exactlyOneOf("form", "reply", "respond"),
);

export const pagesAnswer = spec({
  method: "pages.answer",
  tier: "composition",
  description: "Deliver an answer given inside an embedded page to the session that owns that page.",
  effect: "granted-write",
  confirmed: false,
  implemented: true,
  maxRequestBytes: LIMITS.pagesAnswerBytes,
  validateParams: params(pagesAnswerParams),
  validateResult: result(s.object({ delivery, duplicate: s.boolean(), matchedRevision: s.optional(revision) })),
  doc: {
    params: "`{ answerToken, form }`, `{ answerToken, reply }` or `{ answerToken, respond }` — exactly one: `form: { submissionId, title, writtenAgainst, formId?, formTitle?, action?, answers: [{ name, label, value }] }` (`action` is the submit button's value, if one was used), `reply: { kind?, title?, mode?, result?, text?, idempotencyKey? }`, `respond: { id, answers }` (never a decision). The token comes with a `pages.read` of exactly that document.",
    result: "`{ delivery, duplicate, matchedRevision? }`.",
    notes: "You do not call this: the kernel does, for forms, `session.reply` and `session.respond { answers }` inside an embed, worded by the host exactly as from that page's own URL plus one line naming this page's session. The first answer from this page into another session asks the reader once, in host chrome, naming both; the grant is remembered until revoked, and a declined one is `cancelled`. A form is matched by its identity in the target's current revision; `stale_page` only when no form matches.",
  },
});

export type VoiceParams = s.Infer<typeof voiceParams>;
const voiceParams = s.object({
  language: s.optional(s.string({ min: 2, max: 35, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" })),
  prompt: s.optional(s.string({ max: LIMITS.voicePromptChars, label: "Prompt" })),
  maxDurationSeconds: s.withDefault(s.integer(1, LIMITS.voiceMaxSeconds, "Duration"), LIMITS.voiceDefaultSeconds),
  keepAudio: s.withDefault(s.boolean(), false),
});

export const voiceCaptureAndTranscribe = spec({
  method: "voice.captureAndTranscribe",
  tier: "voice",
  description: "Record the reader in the host's recording bar and return the host's transcript.",
  effect: "device",
  confirmed: true,
  implemented: true,
  validateParams: params(voiceParams),
  validateResult: result(s.object({ text: s.string({ max: LIMITS.resultTextBytes, label: "Transcript" }) })),
  doc: {
    params: `\`{ language?, prompt?, maxDurationSeconds?, keepAudio? }\` — \`language\` a language tag such as \`en\` or \`pt-BR\`, a hint; \`prompt\` at most ${LIMITS.voicePromptChars} characters of context; \`maxDurationSeconds\` 1 to ${LIMITS.voiceMaxSeconds}, default ${LIMITS.voiceDefaultSeconds}; \`keepAudio\` default false.`,
    result: "`{ text }`, the host's transcript; with `keepAudio: true` also `audio`, a `Blob` of the recording with the recording's type, beside the JSON result.",
    notes: `No dialog: the host's recording bar, which your page cannot draw over, is the confirmation; nothing leaves the reader's device until Done. It opens only from the reader's click or key press in your page, one at a time. Cancel, Escape and a Done before ${LIMITS.voiceMinMs / 1000} s reject with \`cancelled\`; \`unavailable\` with the reason when the host has no transcription, the reader's surface cannot record, the call came without the reader's action or while another question is open, or inside an embedded page; \`request_too_large\` when the recording is over the transcriber's limit. Listed in \`context.get\` even where it cannot work for this reader.`,
  },
});

/** Every built-in capability, defined; which are enabled is the registry's. 03 §Core, §Optional */
export const ALL_CAPABILITIES = Object.freeze([
  contextGet,
  sessionActivity,
  sessionMessages,
  sessionReply,
  storageGet,
  storageSet,
  storageSetMany,
  workspacesList,
  sessionsSnapshot,
  sessionsMessages,
  sessionsStart,
  sessionsSend,
  sessionsStop,
  pagesOpen,
  navigationOpenExternal,
  sessionRespond,
  sessionsRespond,
  sessionUsage,
  sessionsArchive,
  sessionsMarkRead,
  sessionsOpenHost,
  providersList,
  workspacesBrowse,
  workspacesCreate,
  pagesRead,
  pagesAnswer,
  voiceCaptureAndTranscribe,
]);

/** The core tier: every host implements these. 03 §Core */
export const CORE_METHODS: ReadonlySet<string> = new Set([
  "context.get",
  "session.activity",
  "session.messages",
  "session.reply",
  "storage.get",
  "storage.set",
  "storage.setMany",
  "workspaces.list",
  "sessions.snapshot",
  "sessions.messages",
  "sessions.start",
  "sessions.send",
  "sessions.stop",
  "pages.open",
  "navigation.openExternal",
]);

/** Methods the built-in home page cannot call: it has no session. 05 R-S12; DESIGN §E.1 step 9 */
export const SESSIONLESS_CAPABILITIES: ReadonlySet<string> = new Set(["session.activity", "session.messages", "session.reply", "session.respond", "session.usage"]);

export { isEntityId, isOpaqueToken, isStorageKey };
