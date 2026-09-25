import { ENTRY_DOCUMENT, isDocumentPath } from "../document-path.ts";
import { isEntityId, isOpaqueToken, isStorageKey } from "../ids.ts";
import type { JsonValue } from "../json/strict-json.ts";
import { LIMITS, mebibytes } from "../limits.ts";
import { EFFECT_CLASSES, type CapabilitySpec } from "./contract.ts";
import { externalUrlProblem } from "../external-url.ts";
import * as s from "./schema.ts";

/**
 * Every capability, exactly as spec 05 defines it. One object each; the
 * server-side handler for each lives in src/serving/bridge/handlers.
 */

// --- shared pieces ---------------------------------------------------------

const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const entityId = (label: string) => s.string({ min: 1, max: 128, pattern: ENTITY_ID, label });
const title = (label = "Title") => s.string({ max: LIMITS.titleChars, label });
const prompt = s.string({ min: 1, max: LIMITS.promptChars, label: "Prompt" });
const safeName = (label: string, max = 160) => s.string({ min: 1, max, pattern: /^[^\u0000-\u001f\u007f]+$/, label });
const timestamp = s.integer(0, Number.MAX_SAFE_INTEGER, "Timestamp");

export const SESSION_STATES = ["working", "idle", "waiting", "failed", "stopped"] as const;
export type SessionState = (typeof SESSION_STATES)[number];
const sessionState = s.literal(SESSION_STATES, "State");

const deliveryResult = s.object({
  delivery: s.literal(["started", "queued", "steered"], "Delivery"),
  duplicate: s.boolean(),
});

const projectChoice = s.object({
  id: entityId("Project id"),
  name: title("Project name"),
  kind: s.literal(["standard", "personal"], "Project kind"),
});

function spec<P, R>(definition: CapabilitySpec<P, R>): CapabilitySpec<P, R> {
  return Object.freeze(definition);
}

function params<P>(schema: s.Schema<P>) {
  return (value: JsonValue | undefined) => schema.parse(value, "$");
}

function result<R>(schema: s.Schema<R>) {
  return (value: unknown) => schema.parse(value as JsonValue, "$");
}

// --- reads -----------------------------------------------------------------

export const contextGet = spec({
  method: "context.get",
  description: "Read this page's identity and the capability roster.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      protocolVersion: s.literal([1]),
      session: s.object({ id: entityId("Session id"), title: title(), projectId: s.nullable(entityId("Project id")) }),
      page: s.object({ revision: s.string({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/, label: "Revision" }), readOnly: s.boolean() }),
      capabilities: s.array(
        s.object({
          method: s.string({ min: 3, max: LIMITS.methodNameChars, label: "Method" }),
          effect: s.literal(EFFECT_CLASSES),
          confirmation: s.literal(["none", "required", "grant"]),
          maxRequestBytes: s.integer(1, LIMITS.contributedPayloadMaxBytes, "Bound"),
          maxResponseBytes: s.integer(1, Math.max(LIMITS.contributedPayloadMaxBytes, LIMITS.pagesReadBytes), "Bound"),
          contributor: s.optional(s.object({ id: s.string({ min: 1, max: 32, label: "Contributor" }), version: s.string({ min: 1, max: 64, label: "Version" }) })),
          description: s.optional(s.string({ min: 1, max: 240, label: "Description" })),
          reasons: s.optional(s.array(s.string({ min: 1, max: 64, label: "Reason" }), 64)),
        }),
        512,
      ),
    }),
  ),
  doc: {
    params: "None.",
    result: "`{ protocolVersion: 1, session: { id, title, projectId }, page: { revision, readOnly }, capabilities: [{ method, effect, confirmation, maxRequestBytes, maxResponseBytes, contributor?, description?, reasons? }] }`. `confirmation` is `none`, `required`, or `grant` (asked once, then remembered). `contributor: { id, version }`, `description` and `reasons` appear only on capabilities another plugin contributes.",
    notes: "The roster lists what is actually enabled, contributed capabilities included; check it rather than assume.",
  },
});

export const sessionActivity = spec({
  method: "session.activity",
  description: "Read this session's state and recent activity.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ limit: s.withDefault(s.integer(1, LIMITS.activityMax, "Limit"), LIMITS.activityDefault) })),
  validateResult: result(
    s.object({
      state: sessionState,
      updatedAtMs: timestamp,
      startedAtMs: timestamp,
      turnEndedAtMs: s.nullable(timestamp),
      question: s.nullable(s.string({ min: 1, max: LIMITS.questionChars, label: "Question" })),
      items: s.array(
        s.object({
          kind: s.string({ min: 1, max: 80, label: "Kind" }),
          done: s.boolean(),
          atMs: timestamp,
          label: s.string({ min: 1, max: 80, label: "Label" }),
          text: s.string({ max: 200, label: "Text" }),
        }),
        LIMITS.activityMax,
      ),
    }),
  ),
  doc: {
    params: `\`{ limit? }\` — 1 to ${LIMITS.activityMax}, default ${LIMITS.activityDefault}. It never takes a session id: it is always this page's own session.`,
    result: `\`{ state, updatedAtMs, startedAtMs, turnEndedAtMs, question, items: [{ kind, done, atMs, label, text }] }\` where \`state\` is one of \`working\`, \`idle\`, \`waiting\`, \`failed\`, \`stopped\`. \`turnEndedAtMs\` is when the last turn ended (null while one runs); \`question\` is, while waiting, what the session waits on, at most ${LIMITS.questionChars} characters.`,
  },
});

export type SnapshotParams = s.Infer<typeof snapshotParams>;
const snapshotParams = s.object({
  projectId: s.optional(s.nullable(entityId("Project id"))),
  includeArchived: s.withDefault(s.boolean(), false),
  includeChildren: s.withDefault(s.boolean(), false),
  limit: s.withDefault(s.integer(1, LIMITS.snapshotMax, "Limit"), LIMITS.snapshotDefault),
  cursor: s.optional(s.nullable(s.string({ min: 1, max: 512, pattern: /^[A-Za-z0-9._~:-]+$/, label: "Cursor" }))),
});

export const sessionSummary = s.object({
  id: entityId("Session id"),
  title: title(),
  projectId: s.nullable(entityId("Project id")),
  parentSessionId: s.nullable(entityId("Session id")),
  status: sessionState,
  archived: s.boolean(),
  page: s.object({ available: s.boolean(), revision: s.nullable(s.string({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ })) }),
  updatedAtMs: timestamp,
  attentionAtMs: timestamp,
  unread: s.boolean(),
  startedAtMs: timestamp,
  turnEndedAtMs: s.nullable(timestamp),
  question: s.nullable(s.string({ min: 1, max: LIMITS.questionChars, label: "Question" })),
});
export type SessionSummary = s.Infer<typeof sessionSummary>;

export const sessionsSnapshot = spec({
  method: "sessions.snapshot",
  description: "Read a bounded, projected list of sessions.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(snapshotParams),
  validateResult: result(
    s.object({
      sessions: s.array(sessionSummary, LIMITS.snapshotMax),
      nextCursor: s.nullable(s.string({ min: 1, max: 512 })),
      generatedAtMs: timestamp,
    }),
  ),
  doc: {
    params: `\`{ projectId?, includeArchived?, includeChildren?, limit?, cursor? }\` — \`limit\` 1 to ${LIMITS.snapshotMax}, default ${LIMITS.snapshotDefault}; pass the previous result's \`nextCursor\` to continue. By default only root sessions are listed, the way the host's own sidebar shows them; \`includeChildren: true\` adds sub-agent sessions (with \`parentSessionId\` set).`,
    result: "`{ sessions: [{ id, title, projectId, parentSessionId, status, archived, unread, attentionAtMs, updatedAtMs, startedAtMs, turnEndedAtMs, question, page: { available, revision } }], nextCursor, generatedAtMs }` where `startedAtMs` is when the session was created, `turnEndedAtMs` when its last turn ended (null while one runs — with `status: idle` that is when it finished), and `question`, only while `waiting`, what it waits on as plain text of at most 1024 characters, or null when the host cannot tell. `status` is one of `working`, `idle`, `waiting`, `failed`, `stopped`. `unread` means the session asked for the reader's attention (a turn ended, a question) after they last looked at it — the same mark the host's sidebar shows; `attentionAtMs` is when. `page.revision` is known for pages this host has served recently and `null` otherwise.",
    notes: "No message bodies are included. The one piece of agent output is `question`; a session's prompt and the files it changed are not.",
  },
});

export const projectsList = spec({
  method: "projects.list",
  description: "Read project choices without paths or host details.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(s.object({ projects: s.array(projectChoice, LIMITS.projectsMax) })),
  doc: { params: "None.", result: "`{ projects: [{ id, name, kind }] }` where `kind` is `standard` or `personal`." },
});

export const providersList = spec({
  method: "providers.list",
  description: "Read the provider and model choices a page may pass to sessions.start.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      providers: s.array(
        s.object({
          id: entityId("Provider id"),
          displayName: title("Provider name"),
          available: s.boolean(),
          models: s.array(
            s.object({
              id: safeName("Model id"),
              displayName: title("Model name"),
              isDefault: s.boolean(),
              reasoningLevels: s.array(safeName("Reasoning level", 32), 16),
            }),
            LIMITS.modelsPerProvider,
          ),
        }),
        LIMITS.providersMax,
      ),
    }),
  ),
  doc: {
    params: "None.",
    result: "`{ providers: [{ id, displayName, available, models: [{ id, displayName, isDefault, reasoningLevels }] }] }`.",
    notes: "Fails with `unavailable` when the host cannot enumerate providers; it never returns an empty list to mean that.",
  },
});

const storageKey = s.string({ min: 1, max: LIMITS.storageKeyChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Storage key" });
const storageValue = s.json({ maxBytes: LIMITS.storageValueBytes, maxDepth: 12 }, "Stored value");

export const storageGet = spec({
  method: "storage.get",
  description: "Read a small JSON value stored for this page.",
  effect: "read",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ key: storageKey })),
  validateResult: result(
    s.union(
      s.object({ found: s.literal([false]) }),
      s.object({ found: s.literal([true]), value: storageValue }),
      "Storage result",
    ),
  ),
  doc: { params: "`{ key }`.", result: "`{ found: false }` or `{ found: true, value }`." },
});

// --- writes to the page's own session --------------------------------------

export const sessionReply = spec({
  method: "session.reply",
  description: "Send a structured result to this page's owning session.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  validateParams: params(
    s.object({
      title: s.optional(title()),
      mode: s.withDefault(s.literal(["queue", "steer"], "Mode"), "queue"),
      result: s.json({ maxBytes: LIMITS.resultTextBytes }, "Result"),
      idempotencyKey: s.optional(s.string({ min: 1, max: LIMITS.requestIdChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Idempotency key" })),
    }),
  ),
  validateResult: result(deliveryResult),
  doc: {
    params: "`{ result, title?, mode?, idempotencyKey? }` — `mode` is `queue` (default: waits for the current turn) or `steer` (interrupts it).",
    result: "`{ delivery: 'started' | 'queued' | 'steered', duplicate }`.",
    notes: "With an `idempotencyKey`, a repeat with the same content delivers once and reports `duplicate: true`; a repeat with different content is a `conflict`.",
  },
});

export const storageSet = spec({
  method: "storage.set",
  description: "Store a small JSON value for this page.",
  effect: "own-session-write",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ key: storageKey, value: storageValue })),
  validateResult: result(s.object({ stored: s.literal([true]) })),
  doc: { params: `\`{ key, value }\` — the value serialised must be at most ${LIMITS.storageValueBytes / 1024} KiB.`, result: "`{ stored: true }`.", notes: "Namespaced per session: no page can read another page's keys." },
});

// --- starting and steering work --------------------------------------------

const sessionTarget = s.object({ sessionId: entityId("Session id") });

/**
 * The files a `sessions.start` or `sessions.send` carries, as the shell read
 * them from the `File`s it holds: the page passes the files themselves, never
 * this list, and their bytes never ride in the JSON payload. The count and
 * size limits are checked by the handler, so a call over them is
 * `request_too_large` rather than `invalid_params`. spec R5.75, R5.77, R3.20a
 */
export const promptFile = s.object({
  name: s.string({ min: 1, max: 255, pattern: /^[^\u0000-\u001f\u007f]+$/, label: "File name" }),
  size: s.integer(0, Number.MAX_SAFE_INTEGER, "File size"),
  type: s.string({ max: 255, pattern: /^[^\u0000-\u001f\u007f]*$/, label: "File type" }),
});
export type PromptFile = s.Infer<typeof promptFile>;
const promptFiles = s.optional(s.array(promptFile, 256, "Files"));
const FILES_DOC = `\`files\` is a \`FileList\`, an array of \`File\`, or an \`<input type="file">\` (the files chosen in it): at most ${LIMITS.promptFiles} files of at most ${mebibytes(LIMITS.promptFileBytes)} each, else \`request_too_large\` before any dialog.`;
const FILES_NOTES = `With \`files\`, the confirmation names every file with its size, nothing is uploaded before the reader confirms, and each file becomes a native attachment of the prompt in the target project — an image the model sees as an image. If an upload fails nothing is started or sent, and the call rejects naming the file (\`request_too_large\` when the host refused it for its size, \`handler_error\` otherwise). A host that cannot attach files answers \`unavailable\`; the same call without \`files\` still works.`;

export type SessionsSendParams = s.Infer<typeof sessionsSendParams>;
const sessionsSendParams = s.object({
  sessionId: entityId("Session id"),
  prompt,
  mode: s.withDefault(s.literal(["queue", "steer"], "Mode"), "queue"),
  files: promptFiles,
});

export const sessionsSend = spec({
  method: "sessions.send",
  description: "Send a prompt to another existing session.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsSendParams),
  validateResult: result(s.object({ sessionId: entityId("Session id"), delivery: s.literal(["started", "queued", "steered"]), duplicate: s.boolean() })),
  doc: {
    params: `\`{ sessionId, prompt, mode?, files? }\` — \`mode\` \`queue\` (default) or \`steer\`. ${FILES_DOC}`,
    result: "`{ sessionId, delivery, duplicate }`.",
    notes: `Refuses this page's own session with \`invalid_params\`; use \`session.reply\` for that. The files go to the target session's project. ${FILES_NOTES}`,
  },
});

export type SessionsStartParams = s.Infer<typeof sessionsStartParams>;
const sessionsStartParams = s.object({
  projectId: entityId("Project id"),
  prompt,
  title: s.optional(title()),
  providerId: s.optional(entityId("Provider id")),
  model: s.optional(safeName("Model id")),
  reasoningLevel: s.optional(s.literal(["none", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode"], "Reasoning level")),
  environment: s.withDefault(
    s.union(s.literal(["project-default"]), s.object({ sameAs: entityId("Session id") }), "Environment"),
    "project-default" as const,
  ),
  files: promptFiles,
});

export const sessionsStart = spec({
  method: "sessions.start",
  description: "Start a new visible root session in a project.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionsStartParams),
  validateResult: result(s.object({ sessionId: entityId("Session id") })),
  doc: {
    params: `\`{ projectId, prompt, title?, providerId?, model?, reasoningLevel?, environment?, files? }\`. ${FILES_DOC}`,
    result: "`{ sessionId }`.",
    notes: `Defaults when you say nothing: the project's default environment, the project's default provider, model and reasoning level. Say otherwise with \`providerId\`/\`model\`/\`reasoningLevel\` from \`providers.list\`, or \`environment: { sameAs: sessionId }\` to run in the same environment as another session. The started session is a visible root owned by the reader, never a child of this page's session. The files go to \`projectId\`. ${FILES_NOTES}`,
  },
});

export const sessionsStop = spec({
  method: "sessions.stop",
  description: "Stop a session's running turn.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(s.object({ stopped: s.boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ stopped }`.", notes: "Refuses this page's own session outright, before any dialog." },
});

export const sessionsMarkRead = spec({
  method: "sessions.markRead",
  description: "Mark a session read or unread for the reader.",
  effect: "reader-state",
  confirmed: false,
  implemented: true,
  validateParams: params(s.object({ sessionId: entityId("Session id"), read: s.withDefault(s.boolean(), true) })),
  validateResult: result(s.object({ sessionId: entityId("Session id"), unread: s.boolean() })),
  doc: {
    params: "`{ sessionId, read? }` — `read` defaults to true; `false` marks it unread again.",
    result: "`{ sessionId, unread }`, the mark after the change.",
    notes: "Changes only the reader's own attention mark, the one the host's sidebar shows; it never touches the session's work, so it is not confirmed.",
  },
});

export const sessionsArchive = spec({
  method: "sessions.archive",
  description: "Archive a session.",
  effect: "destructive",
  confirmed: true,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: result(s.object({ archived: s.boolean() })),
  doc: { params: "`{ sessionId }`.", result: "`{ archived }`." },
});

// --- navigation --------------------------------------------------------------

const openedResult = result(s.object({ opened: s.boolean() }));

export const pagesOpen = spec({
  method: "pages.open",
  description: "Open another session's page in place.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: openedResult,
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`, after which the reader's view navigates in place; the back button returns here." },
});

export const sessionsOpenHost = spec({
  method: "sessions.openHost",
  description: "Open a session in the host application.",
  effect: "navigation",
  confirmed: false,
  implemented: true,
  validateParams: params(sessionTarget),
  validateResult: openedResult,
  doc: { params: "`{ sessionId }`.", result: "`{ opened: true }`; navigates the reader's view in place to the session's conversation." },
});

export type OpenExternalParams = s.Infer<typeof openExternalParams>;
const openExternalParams = s.object({
  url: s.refine(s.string({ min: 1, max: 2048, pattern: /^[^\u0000-\u0020\u007f]+$/, label: "URL" }), externalUrlProblem),
  label: s.optional(s.string({ min: 1, max: 160, label: "Label" })),
});

export const navigationOpenExternal = spec({
  method: "navigation.openExternal",
  description: "Open an external http(s) URL through trusted chrome.",
  effect: "navigation",
  confirmed: true,
  implemented: true,
  validateParams: params(openExternalParams),
  validateResult: openedResult,
  doc: {
    params: "`{ url, label? }` — http or https only.",
    result: "`{ opened: true }`. The confirmation names the destination origin; the site then opens in a new tab as itself. An ordinary `<a href=\"https://…\">` in your page goes through this automatically. This host's own origin and any getbb.app address are refused with `invalid_params`: use `pages.open` or `sessions.openHost`.",
  },
});

// --- other sessions' pages ---------------------------------------------------------

const revision = s.string({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/, label: "Revision" });
const answerToken = s.string({ min: 1, max: LIMITS.tokenChars, pattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, label: "Answer token" });
/** A document of a page: `index.html` and an absent path are the entry document. */
const documentPath = s.refine(s.string({ min: 1, max: 1024, label: "Path" }), (value) => (value === ENTRY_DOCUMENT || isDocumentPath(value) ? null : "is not a document of a page"));

export type PagesReadParams = s.Infer<typeof pagesReadParams>;
const pagesReadParams = s.object({
  pages: s.refine(
    s.array(s.object({ sessionId: entityId("Session id"), path: s.optional(documentPath), ifNoneMatch: s.optional(revision) }), LIMITS.pagesReadEntries, "Pages"),
    (value) => (value.length === 0 ? "must name at least one page" : null),
  ),
});

export const PAGE_READ_REASONS = ["no_session", "no_page", "too_large", "unreachable"] as const;

export const pagesRead = spec({
  method: "pages.read",
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
          projectId: s.optional(s.nullable(entityId("Project id"))),
          working: s.optional(s.boolean()),
          readOnly: s.optional(s.boolean()),
          answerToken: s.optional(answerToken),
          error: s.optional(
            s.object({
              code: s.literal(["not_found", "unavailable", "response_too_large"]),
              reason: s.literal(PAGE_READ_REASONS),
              message: s.string({ min: 1, max: LIMITS.errorMessageChars, label: "Message" }),
            }),
          ),
        }),
        LIMITS.pagesReadEntries,
      ),
    }),
  ),
  doc: {
    params: `\`{ pages: [{ sessionId, path?, ifNoneMatch? }] }\` — 1 to ${LIMITS.pagesReadEntries} entries. \`path\` is a document of that page (default its entry document); \`ifNoneMatch\` is the revision you already hold.`,
    result: `\`{ pages: [entry] }\`, one per request entry, in order, each with \`sessionId\` and \`path\` and one of: the document \`{ revision, html, title, projectId, working, readOnly, answerToken }\`; \`{ unchanged: true, title, projectId, working, readOnly, answerToken }\` when \`ifNoneMatch\` is current; \`{ deferred: true }\` when it did not fit this response — ask again; \`{ error: { code, reason, message } }\` with reason \`no_session\`, \`no_page\`, \`too_large\` or \`unreachable\`. \`title\`, \`projectId\` and \`working\` are the owning session's; \`readOnly\` is true for an offline copy.`,
    notes: `\`threadPage.embed\` calls this for you; call it yourself only to quote or summarise another page. \`html\` is the document as the host serves it for a sandboxed \`srcdoc\` frame: its parts and own files carried in, the kernel injected in embedded mode. One response holds at most ${mebibytes(LIMITS.pagesReadBytes)}: a larger single document is refused for that entry, never truncated, and the rest are deferred. A page may read a document of its own page.`,
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
        answers: s.array(submissionAnswer, LIMITS.answersPerSubmission, "Answers"),
      }),
    ),
    reply: s.optional(
      s.object({
        title: s.optional(title()),
        mode: s.withDefault(s.literal(["queue", "steer"], "Mode"), "queue"),
        result: s.json({ maxBytes: LIMITS.resultTextBytes }, "Result"),
        idempotencyKey: s.optional(s.string({ min: 1, max: LIMITS.requestIdChars, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, label: "Idempotency key" })),
      }),
    ),
  }),
  (value) => ((value.form === undefined) === (value.reply === undefined) ? "needs exactly one of form and reply" : null),
);

export const pagesAnswer = spec({
  method: "pages.answer",
  description: "Deliver an answer given inside an embedded page to the session that owns that page.",
  effect: "granted-write",
  confirmed: false,
  implemented: true,
  maxRequestBytes: LIMITS.pagesAnswerBytes,
  validateParams: params(pagesAnswerParams),
  validateResult: result(deliveryResult),
  doc: {
    params: "`{ answerToken, form }` or `{ answerToken, reply }` — `form: { submissionId, title, answers: [{ name, label, value }] }`, `reply: { title?, mode?, result, idempotencyKey? }`. The token comes with a `pages.read` of exactly that document.",
    result: "`{ delivery: \"started\" | \"queued\" | \"steered\", duplicate }`.",
    notes:
      "You do not call this: the kernel does, for forms and `session.reply` inside an embed, and the message is worded by the host exactly as from that page's own URL. It takes no session id and no prompt: what arrives is always that page's form or reply, in the host's words. The first answer from this page into another session asks the reader once, in host chrome, naming both pages; the grant is remembered until the reader revokes it, and a declined one is `cancelled`. `stale_page` means the embedded page changed — the embed refreshes; `not_found` that its session is gone.",
  },
});

// --- device --------------------------------------------------------------------

export const projectsBrowse = spec({
  method: "projects.browse",
  description: "Open the host's folder picker and return an opaque selection token.",
  effect: "device",
  confirmed: true,
  implemented: true,
  validateParams: params(s.noParams()),
  validateResult: result(
    s.object({
      selection: s.nullable(
        s.object({
          token: s.string({ min: 1, max: 512, pattern: /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/, label: "Selection token" }),
          displayPath: s.string({ min: 1, max: 1024, label: "Display path" }),
          hostName: title("Host name"),
        }),
      ),
    }),
  ),
  doc: {
    params: "None.",
    result: `\`{ selection: null }\` when the reader cancels, else \`{ selection: { token, displayPath, hostName } }\`. The token is single use, valid for ${LIMITS.selectionTokenMs / 60_000} minutes and only for this page; the page never sees a filesystem path.`,
  },
});

export const projectsCreate = spec({
  method: "projects.create",
  description: "Create a project from a folder-picker selection.",
  effect: "cross-session-write",
  confirmed: true,
  implemented: true,
  validateParams: params(s.object({ selectionToken: s.string({ min: 1, max: 512, pattern: /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/, label: "Selection token" }), name: s.optional(title("Name")) })),
  validateResult: result(s.object({ project: projectChoice })),
  doc: { params: "`{ selectionToken, name? }`.", result: "`{ project: { id, name, kind } }`.", notes: "An expired, reused or foreign token fails with `not_found`." },
});

export type VoiceParams = s.Infer<typeof voiceParams>;
const voiceParams = s.object({
  language: s.optional(s.string({ min: 2, max: 35, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" })),
  prompt: s.optional(s.string({ max: LIMITS.voicePromptChars, label: "Prompt" })),
  maxDurationSeconds: s.withDefault(s.integer(1, LIMITS.voiceMaxSeconds, "Duration"), LIMITS.voiceDefaultSeconds),
  keepAudio: s.withDefault(s.boolean(), false),
});

/**
 * Confirmed by the shell's recording bar, not a dialog: the bar's Done is the
 * reader's approval. `audio` is added by the shell, as a Blob beside the JSON
 * result, only when `keepAudio` asks for it. spec R5.68–R5.74, D38
 */
export const voiceCaptureAndTranscribe = spec({
  method: "voice.captureAndTranscribe",
  description: "Record the reader in the host's recording bar and return the host's transcript.",
  effect: "device",
  confirmed: true,
  implemented: true,
  validateParams: params(voiceParams),
  validateResult: result(s.object({ text: s.string({ max: LIMITS.resultTextBytes, label: "Transcript" }) })),
  doc: {
    params: `\`{ language?, prompt?, maxDurationSeconds?, keepAudio? }\` — \`language\` a language tag such as \`en\` or \`pt-BR\`, a hint; \`prompt\` at most ${LIMITS.voicePromptChars} characters of context (names, terms, what came before); \`maxDurationSeconds\` 1 to ${LIMITS.voiceMaxSeconds}, default ${LIMITS.voiceDefaultSeconds}; \`keepAudio\` default false.`,
    result: "`{ text }`, the host's transcript; with `keepAudio: true` also `audio`, a `Blob` of the recording whose `type` is the recording's (such as `audio/webm;codecs=opus`). The Blob is not JSON and does not count against the payload limit.",
    notes: `No dialog: the host's recording bar — its own chrome, floating at the bottom centre of the page area, which your page cannot draw over — is the confirmation: a live waveform, Cancel and Done, and nothing leaves the reader's device until they press Done. It opens only while the reader has just pressed something in your page — not in the host's chrome — so call this from a click or key handler, and one at a time; right after the reader used the host's chrome (the bar's own buttons included) it waits a few seconds. At \`maxDurationSeconds\` recording stops and the bar waits for Done or Cancel. Cancel, Escape, and a Done before ${LIMITS.voiceMinMs / 1000} s (the bar says *Too short*) reject with \`cancelled\`. \`unavailable\`, with the reason, when the host has no transcription configured, when the reader's browser or app cannot record (the bb desktop app's in-app browser tab cannot), when the microphone was refused, when the call came without the reader's action or while another question is open, or when transcription failed; \`request_too_large\` when the recording is over the host's limit (on bb 20 MB with its default transcription service — 5 MB on bb before a67f21bab — and 25 MB with OpenAI; each attempt 10 s, 2 attempts). Listed in \`context.get\` wherever the host implements it, even when voice cannot work for this reader; not available inside an embed.`,
  },
});

export const ALL_CAPABILITIES = Object.freeze([
  contextGet,
  sessionActivity,
  sessionsSnapshot,
  projectsList,
  providersList,
  storageGet,
  sessionReply,
  storageSet,
  pagesOpen,
  pagesRead,
  pagesAnswer,
  sessionsOpenHost,
  sessionsSend,
  sessionsStart,
  projectsCreate,
  sessionsStop,
  sessionsArchive,
  sessionsMarkRead,
  navigationOpenExternal,
  projectsBrowse,
  voiceCaptureAndTranscribe,
]);

export { isEntityId, isOpaqueToken, isStorageKey };
