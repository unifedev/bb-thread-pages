import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import type { JsonValue } from "../domain/json/strict-json.ts";
import type { ContributorAnswer, ContributorHost, SessionHost } from "../host/contract.ts";
import type { ActivityItem, ProjectRecord, ProviderChoice, SessionRecord, StorageLocation } from "../host/types.ts";
import { joinPath } from "../pages/layout.ts";
import { LIMITS } from "../domain/limits.ts";
import { activityItemsOf, asRecord, questionOf, sessionStateOf } from "./activity.ts";
import { createPublicOrigin } from "./public-origin.ts";

/**
 * The bb implementation of the host contract. Everything bb-shaped stops
 * here: thread records are projected into session records, list results are
 * reduced to the fields the product needs, and errors become `PageError`s.
 * spec 08
 */
export function createBbHost(bb: BbPluginApi): SessionHost {
  const publicOrigin = createPublicOrigin(bb);

  async function pendingInteraction(threadId: string): Promise<{ pending: boolean; question: string | null }> {
    try {
      const listed = (await bb.sdk.threads.interactions.list({ threadId })) as unknown;
      const record = asRecord(listed);
      const interactions = Array.isArray(listed) ? listed : Array.isArray(record?.interactions) ? record.interactions : [];
      return { pending: interactions.length > 0, question: questionOf(interactions, LIMITS.questionChars) };
    } catch {
      return { pending: false, question: null };
    }
  }

  function projectThread(thread: Record<string, unknown>, hasPendingInteraction: boolean, question: string | null = null): SessionRecord {
    const state = sessionStateOf(thread, hasPendingInteraction);
    const attentionAtMs = typeof thread.latestAttentionAt === "number" ? Math.max(0, Math.trunc(thread.latestAttentionAt)) : 0;
    return {
      id: String(thread.id),
      title: (typeof thread.title === "string" && thread.title) || (typeof thread.titleFallback === "string" && thread.titleFallback) || "Untitled",
      projectId: typeof thread.projectId === "string" ? thread.projectId : null,
      state,
      visibility: thread.visibility === "hidden" ? "hidden" : "visible",
      parentId: typeof thread.parentThreadId === "string" ? thread.parentThreadId : null,
      forkOfId: typeof thread.sourceThreadId === "string" ? thread.sourceThreadId : null,
      archived: thread.archivedAt !== null && thread.archivedAt !== undefined,
      deleted: thread.deletedAt !== null && thread.deletedAt !== undefined,
      updatedAtMs: typeof thread.updatedAt === "number" ? Math.max(0, Math.trunc(thread.updatedAt)) : 0,
      attentionAtMs,
      startedAtMs: typeof thread.createdAt === "number" ? Math.max(0, Math.trunc(thread.createdAt)) : 0,
      // bb records no turn end of its own; a turn's end is when the thread
      // last asked for attention, which bb sets as a turn ends. spec R5.11b
      turnEndedAtMs: state === "working" || attentionAtMs === 0 ? null : attentionAtMs,
      question: state === "waiting" ? question : null,
      unread: unreadOf(thread),
      pinned: typeof thread.pinnedAt === "number",
      environmentId: typeof thread.environmentId === "string" ? thread.environmentId : null,
    };
  }

  async function getThread(id: string): Promise<Record<string, unknown> | null> {
    try {
      const thread = (await bb.sdk.threads.get({ threadId: id })) as unknown;
      return asRecord(thread);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw hostUnavailable(error);
    }
  }

  const host: SessionHost = {
    sessions: {
      async get(id) {
        const thread = await getThread(id);
        if (!thread) return null;
        const idle = sessionStateOf(thread, false) === "idle";
        const pending = idle ? await pendingInteraction(id) : { pending: false, question: null };
        return projectThread(thread, pending.pending, pending.question);
      },
      async list(query) {
        const rows = (await bb.sdk.threads.list({
          ...(query.projectId ? { projectId: query.projectId } : {}),
          // bb lists archived and live threads together unless told which; always say.
          archived: query.archived,
          ...(query.rootsOnly ? { hasParent: false } : {}),
          limit: query.limit,
          offset: query.offset,
        })) as unknown;
        if (!Array.isArray(rows)) return [];
        const records = rows.map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => row !== null);
        // Only waiting threads cost a further read, for the question they wait on. spec R5.11c
        return Promise.all(
          records.map(async (row) => {
            const waiting = row.hasPendingInteraction === true && sessionStateOf(row, true) === "waiting";
            const question = waiting ? (await pendingInteraction(String(row.id))).question : null;
            return projectThread(row, row.hasPendingInteraction === true, question);
          }),
        );
      },
      async send(id, text, mode) {
        const before = await getThread(id);
        const wasWorking = before ? sessionStateOf(before, false) === "working" : false;
        const sent = await bb.sdk.threads.send({
          threadId: id,
          mode: mode === "steer" ? "steer-if-active" : "queue-if-active",
          input: [{ type: "text", text, mentions: [] }],
        });
        if (sent.delivery === "queued") return { delivery: "queued" };
        return { delivery: mode === "steer" && wasWorking ? "steered" : "started" };
      },
      async start(args) {
        const spawned = await bb.sdk.threads.spawn({
          projectId: args.projectId,
          prompt: args.prompt,
          ...(args.title ? { title: args.title } : {}),
          ...(args.providerId ? { providerId: args.providerId } : {}),
          ...(args.model ? { model: args.model } : {}),
          ...(args.reasoningLevel ? { reasoningLevel: args.reasoningLevel as never } : {}),
          environment: args.environment.kind === "reuse" ? { type: "reuse", environmentId: args.environment.environmentId } : { type: "project-default" },
          // The reader started this work: a visible root, never a hidden helper.
          visibility: "visible",
        });
        return { id: spawned.id };
      },
      async stop(id) {
        await bb.sdk.threads.stop({ threadId: id });
      },
      async archive(id) {
        await bb.sdk.threads.archive({ threadId: id });
      },
      async markRead(id, read) {
        const after = (read ? await bb.sdk.threads.markRead({ threadId: id }) : await bb.sdk.threads.markUnread({ threadId: id })) as unknown;
        const record = asRecord(after);
        return { unread: record ? unreadOf(record) : !read };
      },
      async pin(id, pinned) {
        const after = (pinned ? await bb.sdk.threads.pin({ threadId: id }) : await bb.sdk.threads.unpin({ threadId: id })) as unknown;
        const record = asRecord(after);
        return { pinned: record ? typeof record.pinnedAt === "number" : pinned };
      },
      async activity(id, limit): Promise<ActivityItem[]> {
        const events = (await bb.sdk.threads.events.list({
          threadId: id,
          order: "desc",
          limit: "80",
          types: ["item/started", "item/completed"],
        })) as unknown;
        return activityItemsOf(Array.isArray(events) ? events : [], limit);
      },
      async storage(id): Promise<StorageLocation> {
        try {
          const location = await bb.sdk.threads.storageLocation({ threadId: id });
          return { hostId: location.hostId, rootPath: location.storageRootPath };
        } catch (error) {
          if (isNotFound(error)) throw new PageError("not_found", "That session is not available", { cause: error });
          throw hostUnavailable(error);
        }
      },
    },
    projects: {
      async list(): Promise<ProjectRecord[]> {
        const projects = (await bb.sdk.projects.list({ includePersonal: true })) as unknown;
        if (!Array.isArray(projects)) return [];
        return projects
          .map((raw) => asRecord(raw))
          .filter((project): project is Record<string, unknown> => project !== null && typeof project.id === "string")
          .map((project) => ({
            id: String(project.id),
            name: typeof project.name === "string" ? project.name : "Untitled",
            kind: project.kind === "personal" ? "personal" : "standard",
            hostId: defaultHostId(project.sources),
          }));
      },
      async browse(hostId) {
        const picked = await bb.sdk.hosts.pickFolder({ hostId, clientHostId: hostId });
        if (!picked.path) return null;
        const hostRecord = await bb.sdk.hosts.get({ hostId }).catch(() => null);
        return { path: picked.path, hostName: hostRecord?.name ?? "this device" };
      },
      async create(args) {
        const created = await bb.sdk.projects.create({ name: args.name, source: { type: "local_path", hostId: args.hostId, path: args.path } });
        return { id: created.id, name: created.name, kind: created.kind === "personal" ? "personal" : "standard", hostId: args.hostId };
      },
    },
    providers: {
      async list(): Promise<ProviderChoice[]> {
        let providers: unknown;
        try {
          providers = await bb.sdk.providers.list();
        } catch (error) {
          throw new PageError("unavailable", "Providers cannot be listed right now", { cause: error });
        }
        if (!Array.isArray(providers)) throw new PageError("unavailable", "Providers cannot be listed right now");
        const choices = await Promise.all(
          providers
            .map((raw) => asRecord(raw))
            .filter((provider): provider is Record<string, unknown> => provider !== null && typeof provider.id === "string")
            .map(async (provider) => {
              const id = String(provider.id);
              const catalog = (await bb.sdk.providers.models({ providerId: id }).catch(() => null)) as unknown;
              const models = asRecord(catalog)?.models;
              return {
                id,
                displayName: typeof provider.displayName === "string" ? provider.displayName : id,
                available: provider.available !== false,
                models: (Array.isArray(models) ? models : [])
                  .map((raw) => asRecord(raw))
                  .filter((model): model is Record<string, unknown> => model !== null && typeof model.id === "string")
                  .map((model) => ({
                    id: String(model.id),
                    displayName: typeof model.displayName === "string" ? model.displayName : String(model.id),
                    isDefault: model.isDefault === true,
                    reasoningLevels: (Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : [])
                      .map((effort) => asRecord(effort)?.reasoningEffort)
                      .filter((level): level is string => typeof level === "string"),
                  })),
              };
            }),
        );
        return choices;
      },
    },
    files: {
      async read(location, relativePath) {
        try {
          const file = await bb.sdk.files.read({ hostId: location.hostId, path: joinPath(location.rootPath, relativePath), rootPath: location.rootPath });
          const bytes = file.contentEncoding === "base64" ? Buffer.from(file.content, "base64") : Buffer.from(file.content, "utf8");
          return { bytes, sha256: file.sha256, modifiedAtMs: typeof file.modifiedAtMs === "number" ? file.modifiedAtMs : null };
        } catch (error) {
          if (isNotFound(error)) return null;
          throw hostUnavailable(error);
        }
      },
      async list(location, relativeDirectory) {
        const directory = relativeDirectory.replace(/\/+$/, "");
        try {
          // bb lists recursively and skips symbolic links; a part is a direct child.
          const listed = await bb.sdk.files.list({ hostId: location.hostId, path: directory ? joinPath(location.rootPath, directory) : location.rootPath, limit: 5_000 });
          if (listed.truncated) return null;
          return listed.files.filter((file) => !file.path.includes("/")).map((file) => file.name);
        } catch (error) {
          if (isNotFound(error)) return [];
          throw hostUnavailable(error);
        }
      },
      async write(location, relativePath, bytes, options) {
        try {
          const written = await bb.sdk.files.write({
            hostId: location.hostId,
            path: joinPath(location.rootPath, relativePath),
            rootPath: location.rootPath,
            content: Buffer.from(bytes).toString("base64"),
            contentEncoding: "base64",
            createParents: true,
            ...(options.onlyIfAbsent ? { expectedSha256: null } : {}),
            mode: 0o644,
          });
          return written.outcome === "written" ? "written" : "exists";
        } catch (error) {
          if (options.onlyIfAbsent && isConflict(error)) return "exists";
          throw hostUnavailable(error);
        }
      },
      async exist(hostId, absolutePaths) {
        if (absolutePaths.length === 0) return {};
        try {
          const result = await bb.sdk.hosts.pathsExist({ hostId, paths: [...absolutePaths] });
          return Object.fromEntries(absolutePaths.map((path) => [path, result.existence[path] === true]));
        } catch {
          return Object.fromEntries(absolutePaths.map((path) => [path, false]));
        }
      },
    },
    kv: {
      get: (key) => bb.storage.kv.get<JsonValue>(key),
      set: (key, value) => bb.storage.kv.set(key, value),
      delete: (key) => bb.storage.kv.delete(key),
    },
    origin: { public: publicOrigin },
    log: bb.log,
    contributors: createBbContributors(bb),
  };
  return host;
}

/** bb marks a thread unread when it asked for attention after the reader last looked. */
function unreadOf(thread: Record<string, unknown>): boolean {
  const attention = typeof thread.latestAttentionAt === "number" ? thread.latestAttentionAt : 0;
  const read = typeof thread.lastReadAt === "number" ? thread.lastReadAt : null;
  return attention > 0 && (read === null || read < attention);
}

function defaultHostId(sources: unknown): string | null {
  if (!Array.isArray(sources)) return null;
  const records = sources.map((raw) => asRecord(raw)).filter((source): source is Record<string, unknown> => source !== null);
  const chosen = records.find((source) => source.isDefault === true) ?? records[0];
  return chosen && typeof chosen.hostId === "string" ? chosen.hostId : null;
}

function isNotFound(error: unknown): boolean {
  const record = asRecord(error);
  if (record) {
    if (record.code === "ENOENT" || record.status === 404) return true;
    const body = asRecord(record.body);
    if (body?.code === "ENOENT" || body?.code === "not_found") return true;
  }
  return /\b(enoent|not found|does not exist|no such file)\b/i.test(errorText(error));
}

function isConflict(error: unknown): boolean {
  const record = asRecord(error);
  return record?.status === 409 || /\b(conflict|already exists|exists)\b/i.test(errorText(error));
}

function hostUnavailable(error: unknown): PageError {
  return PageError.is(error) ? error : new PageError("unavailable", PUBLIC_MESSAGES.unavailable, { cause: error });
}

/**
 * On bb a contributor is a plugin that answers two plugin RPC methods:
 *
 *   threadPagesContributions → its declaration: { version, methods, instruction?, guide? }
 *   threadPagesInvoke        ← { method, params, caller: { sessionId }, requestId }
 *                            → { ok: true, result } | { ok: false, error: { code, message?, reason?, detail? } }
 *
 * Every enabled, running plugin is asked for a declaration; one that has no
 * such method is not a contributor. The namespace is the plugin's id, so bb's
 * own uniqueness of plugin ids keeps one contributor per namespace.
 * spec R5.42, R5.43, R8.30–R8.32, DECISIONS D20
 */
export const CONTRIBUTIONS_RPC = "threadPagesContributions";
export const INVOKE_RPC = "threadPagesInvoke";
const DECLARATION_TIMEOUT_MS = 5_000;

// callRpc only calls `parse` on the schema; the declaration is checked by the domain.
const passThrough = { parse: (value: unknown) => value } as never;

export function createBbContributors(bb: BbPluginApi): ContributorHost {
  return {
    async list() {
      const listed = (await bb.sdk.plugins.list()) as unknown as { plugins?: { id?: unknown; enabled?: unknown; status?: unknown }[] };
      const candidates = (listed.plugins ?? []).filter(
        (plugin): plugin is { id: string; enabled: true; status: string } =>
          typeof plugin.id === "string" && plugin.id !== bb.pluginId && plugin.enabled === true && plugin.status === "running",
      );
      const answers = await Promise.all(
        candidates.map(async (plugin) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const declaration = await Promise.race([
              bb.sdk.plugins.callRpc({ pluginId: plugin.id, method: CONTRIBUTIONS_RPC, outputSchema: passThrough }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("timed out")), DECLARATION_TIMEOUT_MS);
              }),
            ]);
            return { id: plugin.id, declaration: declaration as unknown };
          } catch (error) {
            // No such method: not a contributor. Anything else shows as absence, never as a fault in pages.
            const message = error instanceof Error ? error.message : String(error);
            // A 404 is a plugin that contributes nothing, the common case; anything else is worth the operator's eye.
            if (!/\b404\b/.test(message)) bb.log.warn(`contributors: ${plugin.id} did not declare: ${message}`);
            return null;
          } finally {
            if (timer !== undefined) clearTimeout(timer);
          }
        }),
      );
      return answers.filter((entry): entry is { id: string; declaration: unknown } => entry !== null);
    },
    async invoke(contributorId, call) {
      const answer = (await bb.sdk.plugins.callRpc({
        pluginId: contributorId,
        method: INVOKE_RPC,
        input: { method: call.method, params: call.params, caller: { sessionId: call.caller.sessionId }, requestId: call.requestId },
        outputSchema: passThrough,
      })) as unknown;
      return answerOf(answer);
    },
  };
}

function answerOf(value: unknown): ContributorAnswer {
  const record = asRecord(value);
  if (record?.ok === true && "result" in record) return { ok: true, result: record.result };
  const error = asRecord(record?.error);
  if (record?.ok === false && error && typeof error.code === "string") {
    return {
      ok: false,
      error: {
        code: error.code,
        ...(typeof error.message === "string" ? { message: error.message } : {}),
        ...(typeof error.reason === "string" ? { reason: error.reason } : {}),
        ...("detail" in error ? { detail: error.detail } : {}),
      },
    };
  }
  return { ok: false, error: { code: "handler_error", message: "The contributor's answer has the wrong shape" } };
}
