import { isEntityId, isOpaqueToken, isStorageKey } from "../ids.ts";
import type { JsonValue } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";
import type { CapabilitySpec } from "./contract.ts";
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
          effect: s.literal(["read", "own-session-write", "cross-session-write", "destructive", "navigation", "device"]),
          confirmation: s.literal(["none", "required"]),
        }),
        64,
      ),
    }),
  ),
  doc: {
    params: "None.",
    result: "`{ protocolVersion: 1, session: { id, title, projectId }, page: { revision, readOnly }, capabilities: [{ method, effect, confirmation }] }`.",
    notes: "The roster lists what is actually enabled; check it rather than assume.",
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
    result: "`{ state, updatedAtMs, items: [{ kind, done, atMs, label, text }] }` where `state` is one of `working`, `idle`, `waiting`, `failed`, `stopped`.",
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
    result: "`{ sessions: [{ id, title, projectId, parentSessionId, status, archived, unread, attentionAtMs, updatedAtMs, page: { available, revision } }], nextCursor, generatedAtMs }`. `unread` means the session asked for the reader's attention (a turn ended, a question) after they last looked at it — the same mark the host's sidebar shows; `attentionAtMs` is when. `page.revision` is known for pages this host has served recently and `null` otherwise.",
    notes: "No message bodies or agent output are included.",
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

export type SessionsSendParams = s.Infer<typeof sessionsSendParams>;
const sessionsSendParams = s.object({
  sessionId: entityId("Session id"),
  prompt,
  mode: s.withDefault(s.literal(["queue", "steer"], "Mode"), "queue"),
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
    params: "`{ sessionId, prompt, mode? }` — `mode` `queue` (default) or `steer`.",
    result: "`{ sessionId, delivery, duplicate }`.",
    notes: "Refuses this page's own session with `invalid_params`; use `session.reply` for that.",
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
    params: "`{ projectId, prompt, title?, providerId?, model?, reasoningLevel?, environment? }`.",
    result: "`{ sessionId }`.",
    notes:
      "Defaults when you say nothing: the project's default environment, the project's default provider, model and reasoning level. Say otherwise with `providerId`/`model`/`reasoningLevel` from `providers.list`, or `environment: { sameAs: sessionId }` to run in the same environment as another session. The started session is a visible root owned by the reader, never a child of this page's session.",
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
  url: s.refine(s.string({ min: 1, max: 2048, pattern: /^[^\u0000-\u0020\u007f]+$/, label: "URL" }), (value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return "Expected an absolute http or https URL";
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
      return "Expected an absolute http or https URL without credentials";
    }
    return null;
  }),
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
    result: "`{ opened: true }`. The confirmation names the destination origin. An ordinary `<a href=\"https://…\">` in your page goes through this automatically.",
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

export const voiceCaptureAndTranscribe = spec({
  method: "voice.captureAndTranscribe",
  description: "Record and transcribe the reader's voice through trusted chrome.",
  effect: "device",
  confirmed: true,
  implemented: false,
  validateParams: params(
    s.object({
      language: s.optional(s.string({ min: 2, max: 64, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" })),
      prompt: s.optional(s.string({ max: 1000, label: "Prompt" })),
      maxDurationSeconds: s.withDefault(s.integer(1, 120, "Duration"), 120),
    }),
  ),
  validateResult: result(s.object({ text: s.string({ max: LIMITS.resultTextBytes, label: "Transcript" }) })),
  doc: { params: "`{ language?, prompt?, maxDurationSeconds? }`.", result: "`{ text }`.", notes: "Deferred: the contract exists, the host reports `unknown_method`." },
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
  sessionsOpenHost,
  sessionsSend,
  sessionsStart,
  projectsCreate,
  sessionsStop,
  sessionsArchive,
  navigationOpenExternal,
  projectsBrowse,
  voiceCaptureAndTranscribe,
]);

export { isEntityId, isOpaqueToken, isStorageKey };
