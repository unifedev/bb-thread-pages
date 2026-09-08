import type { SessionState } from "../../src/domain/capabilities/specs.ts";
import { PageError } from "../../src/domain/errors.ts";
import type { JsonValue } from "../../src/domain/json/strict-json.ts";
import type { SessionHost } from "../../src/host/contract.ts";
import type { ActivityItem, ProjectRecord, ProviderChoice, SessionRecord, StartSessionArgs } from "../../src/host/types.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { joinPath } from "../../src/pages/layout.ts";

/**
 * An in-memory host for serving tests: sessions, files, projects, providers,
 * kv, plus a call log. `offline` makes every file read throw `unavailable`.
 */
export interface FakeHostState {
  sessions: Map<string, SessionRecord>;
  files: Map<string, Uint8Array>;
  kv: Map<string, JsonValue>;
  projects: ProjectRecord[];
  providers: ProviderChoice[];
  activity: ActivityItem[];
  offline: boolean;
  providersFail: boolean;
  sendDelivery: "started" | "queued" | "steered";
  calls: { method: string; args: unknown[] }[];
  logs: string[];
  publicOrigin: string | null;
  pickedFolder: string | null;
}

export const HOST_ID = "host_test";
export const ROOT = "/storage";

export function sessionRecord(overrides: Partial<SessionRecord> & { id: string }): SessionRecord {
  return {
    title: `Session ${overrides.id}`,
    projectId: "proj_a",
    state: "idle" as SessionState,
    visibility: "visible",
    parentId: null,
    forkOfId: null,
    archived: false,
    deleted: false,
    updatedAtMs: 1_700_000_000_000,
    attentionAtMs: 1_700_000_000_000,
    unread: false,
    environmentId: "env_a",
    ...overrides,
  };
}

export function fileKey(session: string, relativePath: string): string {
  return joinPath(`${ROOT}/${session}`, relativePath);
}

export function createFakeHost(): { host: SessionHost; state: FakeHostState } {
  const state: FakeHostState = {
    sessions: new Map(),
    files: new Map(),
    kv: new Map(),
    projects: [{ id: "proj_a", name: "Alpha", kind: "standard", hostId: HOST_ID }],
    providers: [{ id: "codex", displayName: "Codex", available: true, models: [{ id: "gpt", displayName: "GPT", isDefault: true, reasoningLevels: ["low", "high"] }] }],
    activity: [{ kind: "agentMessage", done: true, atMs: 1, label: "Wrote", text: "hello" }],
    offline: false,
    providersFail: false,
    sendDelivery: "queued",
    calls: [],
    logs: [],
    publicOrigin: null,
    pickedFolder: "/Users/bart/proj",
  };
  const record = (method: string, ...args: unknown[]) => state.calls.push({ method, args });
  const location = (id: string) => ({ hostId: HOST_ID, rootPath: `${ROOT}/${id}` });

  const host: SessionHost = {
    sessions: {
      async get(id) {
        record("sessions.get", id);
        return state.sessions.get(id) ?? null;
      },
      async list(query) {
        record("sessions.list", query);
        const all = [...state.sessions.values()].filter(
          // Like bb: an archived filter is honoured, but the fake also leaks archived rows into live queries for one id to prove the handler guards.
          (session) => (session.archived === query.archived || session.id === "thr_leak") && (!query.projectId || session.projectId === query.projectId) && (!query.rootsOnly || session.parentId === null),
        );
        return all.slice(query.offset, query.offset + query.limit);
      },
      async send(id, text, mode) {
        record("sessions.send", id, text, mode);
        return { delivery: state.sendDelivery };
      },
      async start(args: StartSessionArgs) {
        record("sessions.start", args);
        return { id: "thr_new" };
      },
      async stop(id) {
        record("sessions.stop", id);
      },
      async archive(id) {
        record("sessions.archive", id);
      },
      async markRead(id, read) {
        record("sessions.markRead", id, read);
        const session = state.sessions.get(id);
        if (session) state.sessions.set(id, { ...session, unread: !read });
        return { unread: !read };
      },
      async activity(id, limit) {
        record("sessions.activity", id, limit);
        return state.activity.slice(-limit);
      },
      async storage(id) {
        record("sessions.storage", id);
        if (!state.sessions.has(id)) throw new PageError("not_found", "no such session");
        return location(id);
      },
    },
    projects: {
      async list() {
        record("projects.list");
        return state.projects;
      },
      async browse(hostId) {
        record("projects.browse", hostId);
        return state.pickedFolder ? { path: state.pickedFolder, hostName: "Laptop" } : null;
      },
      async create(args) {
        record("projects.create", args);
        return { id: "proj_new", name: args.name, kind: "standard", hostId: args.hostId };
      },
    },
    providers: {
      async list() {
        record("providers.list");
        if (state.providersFail) throw new PageError("unavailable", "Providers cannot be listed right now");
        return state.providers;
      },
    },
    files: {
      async read(loc, relativePath) {
        record("files.read", loc, relativePath);
        if (state.offline) throw new PageError("unavailable", "host offline");
        const bytes = state.files.get(joinPath(loc.rootPath, relativePath));
        return bytes ? { bytes, sha256: revisionOf(bytes), modifiedAtMs: 1_700_000_000_000 } : null;
      },
      async write(loc, relativePath, bytes, options) {
        record("files.write", loc, relativePath, bytes.byteLength, options);
        if (state.offline) throw new PageError("unavailable", "host offline");
        const key = joinPath(loc.rootPath, relativePath);
        if (options.onlyIfAbsent && state.files.has(key)) return "exists";
        state.files.set(key, bytes);
        return "written";
      },
      async exist(hostId, paths) {
        record("files.exist", hostId, paths);
        return Object.fromEntries(paths.map((path) => [path, state.files.has(path)]));
      },
    },
    kv: {
      async get(key) {
        return state.kv.get(key);
      },
      async set(key, value) {
        state.kv.set(key, value);
      },
      async delete(key) {
        state.kv.delete(key);
      },
    },
    origin: { public: async () => state.publicOrigin },
    log: {
      debug: (message) => state.logs.push(`debug ${message}`),
      info: (message) => state.logs.push(`info ${message}`),
      warn: (message) => state.logs.push(`warn ${message}`),
      error: (message) => state.logs.push(`error ${message}`),
    },
  };
  return { host, state };
}

/** Seeds a visible root session with a page. */
export function seedSession(state: FakeHostState, id: string, html: string, overrides: Partial<SessionRecord> = {}): void {
  state.sessions.set(id, sessionRecord({ id, ...overrides }));
  state.files.set(fileKey(id, "index.html"), Buffer.from(html, "utf8"));
}
