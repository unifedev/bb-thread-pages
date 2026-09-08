import type { SessionSummary, SnapshotParams } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import type { JsonValue } from "../../../domain/json/strict-json.ts";
import { LIMITS } from "../../../domain/limits.ts";
import type { SessionRecord } from "../../../host/types.ts";
import { ENTRY_FILE, joinPath } from "../../../pages/layout.ts";
import { handler, type HandlerContext } from "../handler.ts";

/** Read capabilities. spec 05 §Reads */

export const contextGet = handler<null, unknown>({
  method: "context.get",
  async execute(_params, { serving, session, page }) {
    return {
      result: {
        protocolVersion: 1,
        session: { id: session.id, title: session.title.slice(0, LIMITS.titleChars), projectId: session.projectId },
        page: { revision: page.revision, readOnly: page.stale },
        capabilities: serving.registry.descriptors(),
      },
    };
  },
});

export const sessionActivity = handler<{ limit: number }, unknown>({
  method: "session.activity",
  async execute(params, { serving, session }) {
    const items = await serving.host.sessions.activity(session.id, params.limit);
    return { result: { state: session.state, updatedAtMs: session.updatedAtMs, items } };
  },
});

// --- sessions.snapshot -------------------------------------------------------

interface Cursor {
  readonly phase: "live" | "archived";
  readonly offset: number;
  readonly query: string;
}

function queryKey(params: SnapshotParams): string {
  return `${params.projectId ?? ""}|${params.includeArchived ? 1 : 0}|${params.includeChildren ? 1 : 0}`;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string, params: SnapshotParams): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if ((parsed.phase !== "live" && parsed.phase !== "archived") || !Number.isSafeInteger(parsed.offset) || (parsed.offset as number) < 0 || parsed.query !== queryKey(params)) {
      throw new Error("mismatch");
    }
    return { phase: parsed.phase, offset: parsed.offset as number, query: parsed.query };
  } catch {
    throw new PageError("invalid_params", "The cursor does not belong to this query");
  }
}

async function pageAvailability(context: HandlerContext, sessions: readonly SessionRecord[]): Promise<Map<string, boolean>> {
  const { serving } = context;
  const byHost = new Map<string, { session: string; path: string }[]>();
  await Promise.all(
    sessions.map(async (session) => {
      try {
        const location = await serving.host.sessions.storage(session.id);
        const entries = byHost.get(location.hostId) ?? [];
        entries.push({ session: session.id, path: joinPath(location.rootPath, ENTRY_FILE) });
        byHost.set(location.hostId, entries);
      } catch {
        // No storage yet: no page.
      }
    }),
  );
  const availability = new Map<string, boolean>();
  await Promise.all(
    [...byHost.entries()].map(async ([hostId, entries]) => {
      const existence = await serving.host.files.exist(hostId, entries.map((entry) => entry.path));
      for (const entry of entries) availability.set(entry.session, existence[entry.path] === true);
    }),
  );
  return availability;
}

export const sessionsSnapshot = handler<SnapshotParams, unknown>({
  method: "sessions.snapshot",
  async execute(params, context) {
    const { serving } = context;
    const start: Cursor = params.cursor ? decodeCursor(params.cursor, params) : { phase: "live", offset: 0, query: queryKey(params) };
    const collected: SessionRecord[] = [];
    let phase = start.phase;
    let offset = start.offset;
    let next: Cursor | null = null;
    while (collected.length < params.limit) {
      const want = params.limit - collected.length;
      const rows = await serving.host.sessions.list({
        ...(params.projectId ? { projectId: params.projectId } : {}),
        archived: phase === "archived",
        rootsOnly: !params.includeChildren,
        offset,
        limit: want + 1,
      });
      const visible = rows.filter(
        (row) => row.visibility === "visible" && !row.deleted && row.archived === (phase === "archived") && (params.includeChildren || row.parentId === null),
      );
      const more = rows.length > want;
      collected.push(...visible.slice(0, want));
      offset += Math.min(rows.length, want);
      if (more) {
        next = { phase, offset, query: start.query };
        break;
      }
      if (phase === "live" && params.includeArchived) {
        phase = "archived";
        offset = 0;
        continue;
      }
      break;
    }
    const availability = await pageAvailability(context, collected);
    const sessions: SessionSummary[] = collected.map((record) => ({
      id: record.id,
      title: record.title.slice(0, LIMITS.titleChars),
      projectId: record.projectId,
      parentSessionId: record.parentId,
      status: record.state,
      archived: record.archived,
      page: { available: availability.get(record.id) === true, revision: availability.get(record.id) ? serving.pages.knownRevision(record.id) : null },
      updatedAtMs: record.updatedAtMs,
      attentionAtMs: record.attentionAtMs,
      unread: record.unread,
    }));
    return { result: { sessions, nextCursor: next ? encodeCursor(next) : null, generatedAtMs: serving.now() } };
  },
});

export const projectsList = handler<null, unknown>({
  method: "projects.list",
  async execute(_params, { serving }) {
    const projects = await serving.host.projects.list();
    return { result: { projects: projects.slice(0, LIMITS.projectsMax).map((project) => ({ id: project.id, name: project.name.slice(0, LIMITS.titleChars), kind: project.kind })) } };
  },
});

export const providersList = handler<null, unknown>({
  method: "providers.list",
  async execute(_params, { serving }) {
    const providers = await serving.host.providers.list();
    return {
      result: {
        providers: providers.slice(0, LIMITS.providersMax).map((provider) => ({
          id: provider.id,
          displayName: provider.displayName.slice(0, LIMITS.titleChars),
          available: provider.available,
          models: provider.models.slice(0, LIMITS.modelsPerProvider).map((model) => ({
            id: model.id,
            displayName: model.displayName.slice(0, LIMITS.titleChars),
            isDefault: model.isDefault,
            reasoningLevels: model.reasoningLevels.slice(0, 16),
          })),
        })),
      },
    };
  },
});

export function storageKey(session: string, key: string): string {
  return `state:${session}:${key}`;
}

export const storageGet = handler<{ key: string }, unknown>({
  method: "storage.get",
  async execute(params, { serving, session }) {
    const stored = await serving.host.kv.get(storageKey(session.id, params.key));
    return { result: stored === undefined ? { found: false } : { found: true, value: stored } };
  },
});

export const storageSet = handler<{ key: string; value: JsonValue }, unknown>({
  method: "storage.set",
  async execute(params, { serving, session }) {
    await serving.host.kv.set(storageKey(session.id, params.key), params.value);
    return { result: { stored: true } };
  },
});
