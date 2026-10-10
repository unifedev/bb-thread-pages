// sessions.* except messages/activity (DESIGN §B.1). One rule per member: the SDK call, the argument mapping,
// the error mapping, and what cannot be done.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type AppliedSettings, type AttachmentRef, type ProviderHost, type ReplySettings, type SessionRecord } from "../../core/src/host/index.ts";
import { activityItemsOf } from "./activity.ts";
import { promptInput, type AttachmentStore } from "./attachments.ts";
import { asRecord, providerError, sdkCall } from "./errors.ts";
import { createMessages } from "./messages.ts";
import { effortsOf } from "./providers.ts";
import { isDeleted, sessionRecordOf, type PendingInteraction, type ThreadLike } from "./session-record.ts";

export interface StorageLocation { rootPath: string; hostId: string }

/** The per-message execution options of `threads.send`, in the SDK's own types (RS-16): the enum fields are narrowed from the strings the core validated against `providers.list`. */
type SendArgs = Parameters<BbPluginApi["sdk"]["threads"]["send"]>[0];
type SendOptions = Pick<SendArgs, "model" | "reasoningLevel" | "permissionMode" | "executionInputSources">;

/** `threads.storageLocation` memoised per session for the plugin's lifetime; evicted on `thread.deleted`. */
export interface StorageLocator {
  locate(session: string): Promise<StorageLocation>;
  evict(session: string): void;
}

export function createStorageLocator(bb: BbPluginApi): StorageLocator {
  const memo = new Map<string, Promise<StorageLocation>>();
  return {
    locate(session) {
      let pending = memo.get(session);
      if (!pending) {
        pending = sdkCall("sessions.storage", () => bb.sdk.threads.storageLocation({ threadId: session })).then((loc) => {
          const record = asRecord(loc);
          if (!record || typeof record.storageRootPath !== "string" || typeof record.hostId !== "string") throw new ProviderError("other", "sessions.storage: bb returned no location");
          return { rootPath: record.storageRootPath, hostId: record.hostId };
        });
        memo.set(session, pending);
        pending.catch(() => memo.delete(session));
      }
      return pending;
    },
    evict: (session) => void memo.delete(session),
  };
}

export const BB_PERSONAL_PROJECT_ID = "proj_personal";

/** The bb app's address for a session's conversation, origin-relative (R5.31a). */
export function bbSessionUrl(session: Pick<SessionRecord, "id" | "workspaceId">): string {
  const id = encodeURIComponent(session.id);
  return session.workspaceId && session.workspaceId !== BB_PERSONAL_PROJECT_ID ? `/projects/${encodeURIComponent(session.workspaceId)}/threads/${id}` : `/threads/${id}`;
}

export function encodeListCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}

export function decodeListCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const match = /^o:(\d{1,9})$/.exec(text);
  if (!match || encodeListCursor(Number(match[1])) !== cursor) throw new ProviderError("other", "cursor not issued by this host", "cursor");
  return Number(match[1]);
}

/** R-P1, 01 §Ownership: a visible root that is not a fork and not archived. */
export const isEligible = (s: SessionRecord): boolean => s.visible && s.parentSessionId === null && s.forkOfId === null && !s.archived;

export interface SessionsDeps { locator: StorageLocator; attachments: AttachmentStore }

export function createBbSessions(bb: BbPluginApi, deps: SessionsDeps): ProviderHost["sessions"] {
  const titles = new Map<string, Promise<string | null>>();

  async function pendingInteractions(threadId: string): Promise<PendingInteraction[]> {
    const listed = await sdkCall("sessions.get", () => bb.sdk.threads.interactions.list({ threadId }));
    const rows = Array.isArray(listed) ? listed : Array.isArray(asRecord(listed)?.interactions) ? (asRecord(listed)!.interactions as unknown[]) : [];
    return rows.map(asRecord).filter((i): i is PendingInteraction => i !== null && i.status === "pending");
  }

  async function threadOf(id: string, context: string): Promise<ThreadLike | null> {
    try {
      const thread = asRecord(await bb.sdk.threads.get({ threadId: id }));
      return thread && !isDeleted(thread) ? thread : null;
    } catch (error) {
      const mapped = providerError(error, context);
      if (mapped.code === "not_found") return null;
      throw mapped;
    }
  }

  function titleOf(threadId: string): Promise<string | null> {
    let pending = titles.get(threadId);
    if (!pending) {
      pending = threadOf(threadId, "sessions.messages")
        .then((t) => (t ? (typeof t.title === "string" && t.title) || (typeof t.titleFallback === "string" && t.titleFallback) || null : null))
        .catch(() => null);
      titles.set(threadId, pending);
    }
    return pending;
  }

  const messages = createMessages(bb, { titleOf, log: bb.log });

  /**
   * A reply's settings as `threads.send` takes them: `model`, `reasoningLevel`, `permissionMode` per message, each
   * marked `explicit` in `executionInputSources` so bb applies the value rather than the client preference; every
   * field is a `turn` setting (U47). The core checked each value against `providers.list` already; what only bb can
   * tell is whether a `reasoningLevel` named without a `model` fits the thread's **current** model: the provider
   * from the thread record (`threads.get` → `providerId`; `threads.defaultExecutionOptions` carries none, RS-1), the
   * model from the resolved options, its efforts from `providers.models` — refused as `unsupported` when that model
   * does not list it, passed through (logged `warn`) when bb reports no resolved options for the thread yet (RS-8).
   */
  async function executionOptions(threadId: string, settings: ReplySettings): Promise<{ request: SendOptions; applied: AppliedSettings }> {
    const request: SendOptions = {};
    const sources: NonNullable<SendOptions["executionInputSources"]> = {};
    const applied: AppliedSettings = {};
    if (settings.model !== undefined) { request.model = settings.model; sources.model = "explicit"; applied.model = "turn"; }
    if (settings.reasoningLevel !== undefined) { request.reasoningLevel = settings.reasoningLevel as SendOptions["reasoningLevel"]; sources.reasoningLevel = "explicit"; applied.reasoningLevel = "turn"; }
    if (settings.permissionMode !== undefined) { request.permissionMode = settings.permissionMode as SendOptions["permissionMode"]; sources.permissionMode = "explicit"; applied.permissionMode = "turn"; }
    if (settings.reasoningLevel !== undefined && settings.model === undefined) {
      const current = asRecord(await bb.sdk.threads.defaultExecutionOptions({ threadId }).catch(() => null));
      const thread = await threadOf(threadId, "sessions.send").catch(() => null);
      const providerId = typeof thread?.providerId === "string" ? thread.providerId : null;
      if (current && typeof current.model === "string" && providerId) {
        const catalog = asRecord(await bb.sdk.providers.models({ providerId }).catch(() => null));
        const model = (Array.isArray(catalog?.models) ? catalog.models : []).map(asRecord).find((m) => m !== null && m.id === current.model);
        if (model && !effortsOf(model).includes(settings.reasoningLevel)) {
          throw new ProviderError("unsupported", `sessions.send: the thread's current model does not take reasoning level ${settings.reasoningLevel}`, "settings", { detail: { unsupported: ["reasoningLevel"] } });
        }
      } else {
        bb.log.warn(`sessions.send ${threadId}: reasoningLevel ${settings.reasoningLevel} passed through unverified; bb reported ${current ? "no provider on the thread record" : "no resolved execution options for the thread"}`);
      }
    }
    if (Object.keys(sources).length > 0) request.executionInputSources = sources;
    return { request, applied };
  }

  const sessions: ProviderHost["sessions"] = {
    async get(id) {
      const thread = await threadOf(id, "sessions.get");
      if (!thread) return null;
      return sessionRecordOf(thread, await pendingInteractions(id)); // always, not only when idle (X50)
    },

    async list(q) {
      const offset = decodeListCursor(q.cursor);
      const rows = await sdkCall("sessions.list", () =>
        bb.sdk.threads.list({
          ...(q.workspaceId ? { projectId: q.workspaceId } : {}),
          ...(q.includeArchived ? {} : { archived: false }),
          ...(q.includeChildren ? {} : { hasParent: false }),
          includeHidden: false,
          limit: q.limit + 1,
          offset,
        }),
      );
      const all = (Array.isArray(rows) ? rows : []).map(asRecord).filter((r): r is ThreadLike => r !== null);
      const page = all.slice(0, q.limit);
      const records = await Promise.all(page.filter((row) => !isDeleted(row)).map(async (row) => sessionRecordOf(row, row.hasPendingInteraction === true ? await pendingInteractions(String(row.id)) : [])));
      return { sessions: records, nextCursor: all.length > q.limit ? encodeListCursor(offset + q.limit) : null };
    },

    isEligible,

    async send(id, text, mode, attachments: AttachmentRef[] = [], settings?: ReplySettings) {
      const options = settings ? await executionOptions(id, settings) : null;
      let sent: unknown;
      try {
        sent = await bb.sdk.threads.send({ threadId: id, mode: mode === "steer" ? "steer-if-active" : "queue-if-active", input: promptInput(text, attachments, deps.attachments), ...(options ? options.request : {}) });
      } catch (error) {
        const thread = await threadOf(id, "sessions.send").catch(() => null);
        if (thread && thread.archivedAt !== null && thread.archivedAt !== undefined) throw new ProviderError("unavailable", "sessions.send: archived", "archived", { cause: error });
        throw providerError(error, "sessions.send");
      }
      const applied = options ? { settings: options.applied } : {};
      if (asRecord(sent)?.delivery !== "queued") return { delivery: "started", ...applied }; // never "steered": X51
      // bb queues rather than refuses a send to an archived thread (isQueuedMessageAutoSendCandidate): one read tells (BB-10).
      const thread = await threadOf(id, "sessions.send").catch(() => null);
      if (thread && thread.archivedAt !== null && thread.archivedAt !== undefined) throw new ProviderError("unavailable", "sessions.send: archived", "archived");
      return { delivery: "queued", ...applied };   // the queued row keeps the per-message options (bb's queued-message schema carries them)
    },

    async start(a) {
      // bb's SDK lists no environments per project (O-2), so none can be named; a value is refused, never dropped (BB-6).
      if (a.environment !== undefined) throw new ProviderError("unavailable", "sessions.start: environments are not known on bb", "environment");
      const spawned = await sdkCall("sessions.start", () =>
        bb.sdk.threads.spawn({
          projectId: a.workspaceId,
          ...(a.attachments?.length ? { input: promptInput(a.prompt, a.attachments, deps.attachments) } : { prompt: a.prompt }),
          ...(a.title ? { title: a.title } : {}),
          ...(a.providerId ? { providerId: a.providerId } : {}),
          ...(a.model ? { model: a.model } : {}),
          ...(a.reasoningLevel ? { reasoningLevel: a.reasoningLevel as never } : {}),
          ...(a.permissionMode ? { permissionMode: a.permissionMode as never } : {}),
          environment: { type: "project-default" },
          visibility: "visible",
        } as never),
      );
      const id = asRecord(spawned)?.id;
      if (typeof id !== "string") throw new ProviderError("other", "sessions.start: bb returned no thread id");
      return { id };
    },

    async stop(id) {
      await sdkCall("sessions.stop", () => bb.sdk.threads.stop({ threadId: id }));
    },

    async archive(id) {
      await sdkCall("sessions.archive", () => bb.sdk.threads.archive({ threadId: id }));
    },

    async markRead(id, read) {
      await sdkCall("sessions.markRead", () => (read ? bb.sdk.threads.markRead({ threadId: id }) : bb.sdk.threads.markUnread({ threadId: id })));
    },

    async pin(id, pinned) {
      await sdkCall("sessions.pin", () => (pinned ? bb.sdk.threads.pin({ threadId: id }) : bb.sdk.threads.unpin({ threadId: id })));
    },

    async respond(id, waitId, payload) {
      const current = (await pendingInteractions(id)).find((i) => i.id === waitId);
      if (!current) throw new ProviderError("not_found", "that wait is over or is not the current one");
      const kind = asRecord(current.payload)?.kind;
      if (payload.answers) {
        if (kind !== "user_question") throw new ProviderError("conflict", "answers for a wait that is not a question");
        await sdkCall("sessions.respond", () => bb.sdk.threads.interactions.resolve({ threadId: id, interactionId: waitId, resolution: { kind: "user_answer", answers: payload.answers } as never }));
      } else if (payload.decision) {
        if (kind !== "approval") throw new ProviderError("conflict", "a decision for a wait that is not an approval");
        const resolution = payload.decision === "deny" ? { decision: "deny" } : { decision: payload.decision, grantedPermissions: null };
        await sdkCall("sessions.respond", () => bb.sdk.threads.interactions.resolve({ threadId: id, interactionId: waitId, resolution: resolution as never }));
      } else {
        throw new ProviderError("conflict", "neither answers nor decision");
      }
      return { answered: true };
    },

    async usage(id) {
      const timeline = await sdkCall("sessions.usage", () => bb.sdk.threads.timeline({ threadId: id, summaryOnly: "true", segmentLimit: "1" }));
      const usage = asRecord(asRecord(timeline)?.contextWindowUsage);
      if (!usage || typeof usage.usedTokens !== "number" || typeof usage.modelContextWindow !== "number") throw new ProviderError("unavailable", "bb has not reported context usage for this session yet");
      return { context: { used: usage.usedTokens, limit: usage.modelContextWindow } }; // no `cost`: X55
    },

    async openHost(id) {
      const session = await sessions.get(id);
      if (!session) throw new ProviderError("not_found", "no such session");
      return { url: bbSessionUrl(session) };
    },

    async activity(id, limit) {
      const events = await sdkCall("sessions.activity", () =>
        bb.sdk.threads.events.list({ threadId: id, order: "desc", limit: String(Math.min(80, Math.max(1, limit) * 4)), types: ["item/started", "item/completed"] }),
      );
      return activityItemsOf(Array.isArray(events) ? events : [], limit);
    },

    messages,

    async storage(id) {
      const location = await deps.locator.locate(id);
      return { rootPath: location.rootPath, pathForAgent: (relative: string) => `$BB_THREAD_STORAGE/${relative}` };
    },
  };
  return sessions;
}
