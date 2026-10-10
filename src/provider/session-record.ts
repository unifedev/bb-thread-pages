// thread → SessionRecord; pending interactions → `waiting`; resolved execution options → `settings` (DESIGN §B.1 `sessionRecordOf`, `waitingOf`, `settingsOf`).
// A pending interaction wins over `active` (X50); `stopped` is never produced on bb (D-bb-9).
import type { SessionRecord, SessionSettings, Waiting } from "../../core/src/host/index.ts";
import { asRecord } from "./errors.ts";

export type ThreadLike = Record<string, unknown>;
export type PendingInteraction = Record<string, unknown>;
/** What `threads.defaultExecutionOptions({ threadId })` answers: the thread's resolved per-turn options, or null before bb has resolved any. */
export type ResolvedOptions = Record<string, unknown>;

const WORKING = new Set(["active", "starting", "provisioning", "stopping", "waiting-for-host", "host-reconnecting"]);

export function sessionStateOf(thread: ThreadLike, pending: readonly PendingInteraction[]): SessionRecord["state"] {
  if (pending.length > 0) return "waiting";
  const runtime = asRecord(thread.runtime);
  const display = typeof runtime?.displayStatus === "string" ? runtime.displayStatus : typeof thread.status === "string" ? thread.status : "idle";
  if (WORKING.has(display)) return "working";
  if (display === "error") return "failed";
  return "idle";
}

/** bb's own rule: unread when it asked for attention after the reader last looked (bb-host.ts:413–417 re-derived). */
export function unreadOf(thread: ThreadLike): boolean {
  const attention = numberOf(thread.latestAttentionAt);
  const read = typeof thread.lastReadAt === "number" ? thread.lastReadAt : null;
  return attention > 0 && (read === null || read < attention);
}

/**
 * The thread's current settings as `threads.defaultExecutionOptions` resolves them — `model` (a `providers.models`
 * id), `reasoningLevel` (an effort id) and `permissionMode` (a `capabilities.permissionModes` id), the same ids
 * `providers.list` reports, so a page can preselect them (U50). Only string fields are taken; `null` (bb has
 * resolved nothing for the thread yet) gives nothing: the record then carries no `settings` at all.
 */
export function settingsOf(options: ResolvedOptions | null | undefined): SessionSettings | undefined {
  if (!options) return undefined;
  const out: SessionSettings = {};
  if (typeof options.model === "string" && options.model) out.model = options.model;
  if (typeof options.reasoningLevel === "string" && options.reasoningLevel) out.reasoningLevel = options.reasoningLevel;
  if (typeof options.permissionMode === "string" && options.permissionMode) out.permissionMode = options.permissionMode;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sessionRecordOf(thread: ThreadLike, pending: readonly PendingInteraction[], options?: ResolvedOptions | null): SessionRecord {
  const state = sessionStateOf(thread, pending);
  const attentionAtMs = numberOf(thread.latestAttentionAt);
  const record: SessionRecord = {
    id: String(thread.id),
    title: (typeof thread.title === "string" && thread.title) || (typeof thread.titleFallback === "string" && thread.titleFallback) || "",
    workspaceId: typeof thread.projectId === "string" ? thread.projectId : "",
    parentSessionId: typeof thread.parentThreadId === "string" ? thread.parentThreadId : null,
    forkOfId: thread.originKind === "fork" && typeof thread.sourceThreadId === "string" ? thread.sourceThreadId : null,
    state,
    waiting: state === "waiting" ? waitingOf(pending) : null,
    visible: thread.visibility !== "hidden",
    archived: thread.archivedAt !== null && thread.archivedAt !== undefined,
    startedAtMs: numberOf(thread.createdAt),
    turnEndedAtMs: state === "working" || attentionAtMs === 0 ? null : attentionAtMs,
    updatedAtMs: numberOf(thread.updatedAt),
    unread: unreadOf(thread),
    attentionAtMs,
  };
  if (typeof thread.providerId === "string" && thread.providerId) record.providerId = thread.providerId;   // the row of `providers.list` a reply's settings are checked against (U47)
  const settings = settingsOf(options);
  if (settings) record.settings = settings;   // the thread's current model, effort and mode, where bb has resolved them (U50)
  return record;
}

export function isDeleted(thread: ThreadLike): boolean {
  return thread.deletedAt !== null && thread.deletedAt !== undefined;
}

const SUBJECTS: Record<string, NonNullable<Waiting["approval"]>["subject"]> = {
  command: "command",
  file_change: "file_change",
  permission_grant: "permission",
  plan: "plan",
  tool_use: "tool",
};

const DECISIONS = new Set(["allow_once", "allow_for_session", "deny"]);

/** The first pending interaction (bb shows one at a time). Ids are bb's own: `i.id`, `question.id`, `option.value`. */
export function waitingOf(pending: readonly PendingInteraction[]): Waiting | null {
  const interaction = pending[0];
  if (!interaction) return null;
  const id = typeof interaction.id === "string" ? interaction.id : null;
  const payload = asRecord(interaction.payload) ?? {};
  if (payload.kind === "user_question") {
    const questions = (Array.isArray(payload.questions) ? payload.questions : []).map(asRecord).filter((q): q is Record<string, unknown> => q !== null);
    return {
      id,
      kind: "question",
      text: questions.map((q) => stringOf(q.prompt)).filter(Boolean).join("\n") || null,
      questions: questions.map((q) => ({
        id: stringOf(q.id),
        text: stringOf(q.prompt),
        multiSelect: q.multiSelect === true,
        allowFreeText: q.allowFreeText === true,
        options: (Array.isArray(q.options) ? q.options : [])
          .map(asRecord)
          .filter((o): o is Record<string, unknown> => o !== null)
          .map((o) => ({ id: stringOf(o.value), label: stringOf(o.label) || stringOf(o.value) })),
      })),
    };
  }
  if (payload.kind === "approval") {
    const subject = asRecord(payload.subject);
    const subjectKind = typeof subject?.kind === "string" ? subject.kind : "";
    return {
      id,
      kind: "approval",
      text: approvalLine(payload),
      approval: {
        subject: SUBJECTS[subjectKind] ?? "other",
        summary: approvalSummary(payload),
        decisions: (Array.isArray(payload.availableDecisions) ? payload.availableDecisions : []).filter((d): d is "allow_once" | "allow_for_session" | "deny" => typeof d === "string" && DECISIONS.has(d)),
      },
    };
  }
  return { id, kind: "other", text: typeof payload.title === "string" ? payload.title : null };
}

export function approvalLine(payload: Record<string, unknown>): string {
  const subject = asRecord(payload.subject);
  const reason = stringOf(payload.reason).trim();
  const kind = typeof subject?.kind === "string" ? subject.kind : "";
  const what =
    kind === "command" ? stringOf(subject?.command)
    : kind === "tool_use" ? stringOf(asRecord(subject?.presentation)?.title) || stringOf(asRecord(subject?.tool)?.name)
    : kind === "permission_grant" ? stringOf(subject?.toolName)
    : kind === "plan" ? "a plan"
    : kind === "file_change" ? "a file change"
    : "";
  const head = `Approval requested${kind ? ` (${kind.replace(/_/g, " ")})` : ""}`;
  return [head, what, reason].filter(Boolean).join(": ");
}

/** The provider's own text, whole (03 R-C7): the reason and the subject's detail, joined by newlines. */
export function approvalSummary(payload: Record<string, unknown>): string {
  const subject = asRecord(payload.subject);
  const lines: string[] = [];
  const reason = stringOf(payload.reason);
  if (reason) lines.push(reason);
  switch (subject?.kind) {
    case "command":
      lines.push(stringOf(subject.command));
      if (stringOf(subject.cwd)) lines.push(`cwd: ${stringOf(subject.cwd)}`);
      break;
    case "tool_use": {
      const presentation = asRecord(subject.presentation);
      for (const part of [stringOf(presentation?.title), stringOf(presentation?.detail)]) if (part) lines.push(part);
      break;
    }
    case "plan":
      lines.push(stringOf(subject.plan));
      break;
    case "file_change":
      lines.push(`file change ${stringOf(subject.itemId)}`.trim());
      break;
    case "permission_grant":
      lines.push(stringOf(subject.toolName));
      if (subject.permissions !== undefined) lines.push(JSON.stringify(subject.permissions));
      break;
  }
  return lines.filter(Boolean).join("\n");
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
