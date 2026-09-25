import type { PromptFile, SessionsSendParams, SessionsStartParams } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import { fingerprint } from "../../../domain/json/canonical.ts";
import type { JsonValue } from "../../../domain/json/strict-json.ts";
import { formatReplyMessage } from "../../../domain/submissions/message.ts";
import type { SessionRecord, StartSessionArgs } from "../../../host/types.ts";
import { approvedAttachments, checkPromptFiles, sizeLabel, targetProject, withAttachments } from "../../attach-route.ts";
import { LIMITS } from "../../../domain/limits.ts";
import { excerpt, handler, quotable, quotableFileName, type HandlerContext } from "../handler.ts";

/** Writes to the page's own session, and the confirmed cross-session effects. spec 05 */

interface ReplyParams {
  title?: string;
  mode: "queue" | "steer";
  result: JsonValue;
  idempotencyKey?: string;
}

export const sessionReply = handler<ReplyParams, unknown>({
  method: "session.reply",
  async execute(params, { serving, session, page, requestId }) {
    const key = `${session.id}:${params.idempotencyKey ?? requestId}`;
    const print = fingerprint({ revision: page.revision, result: params.result, mode: params.mode, title: params.title ?? null });
    const remembered = serving.replies.remember(key, print, () => serving.host.sessions.send(session.id, formatReplyMessage(params.title, params.result), params.mode), serving.now());
    if (remembered.kind === "conflict") throw new PageError("conflict", "This idempotency key was already used with a different reply");
    const outcome = await remembered.outcome;
    return { result: { delivery: outcome.delivery, duplicate: remembered.kind === "replay" } };
  },
});

async function targetSession(context: HandlerContext, id: string): Promise<SessionRecord> {
  const target = await context.serving.host.sessions.get(id);
  if (!target || target.deleted) throw new PageError("not_found", "That session is not available");
  return target;
}

/**
 * The files of a call, one per line with its size, so the reader approves
 * exactly what leaves. spec R5.24, R5.27a, R5.78
 */
function filesLine(files: readonly PromptFile[] | undefined): string {
  if (!files || files.length === 0) return "";
  const count = files.length === 1 ? "1 file" : `${files.length} files`;
  return `\nWith ${count}:\n${files.map((file) => `• “${quotableFileName(file.name)}” (${sizeLabel(file.size)})`).join("\n")}`;
}

/** What the rest of a summary needs at least, beside its file list. */
const SUMMARY_HEAD_MIN = 160;

/** A file list too long to show whole in a confirmation is refused before any dialog. spec R5.78 */
function checkFilesFit(files: readonly PromptFile[] | undefined): void {
  if (filesLine(files).length + SUMMARY_HEAD_MIN > LIMITS.summaryChars) {
    throw new PageError("request_too_large", "The files cannot all be named in the confirmation; send fewer at a time");
  }
}

/**
 * A summary whose file list is always whole: the other parts — the prompt,
 * titles, names — are shortened until it fits, never the list. spec R5.78
 */
function fitSummary(head: (length: number) => string, files: readonly PromptFile[] | undefined): string {
  const list = filesLine(files);
  for (const length of [80, 48, 28, 16, 8]) {
    const summary = `${head(length)}${list}`;
    if (summary.length <= LIMITS.summaryChars) return summary;
  }
  throw new PageError("request_too_large", "The files cannot all be named in the confirmation; send fewer at a time");
}

export const sessionsSend = handler<SessionsSendParams, unknown>({
  method: "sessions.send",
  async refuse(params, context) {
    if (params.sessionId === context.session.id) throw new PageError("invalid_params", "Use session.reply to answer this page's own session");
    await targetSession(context, params.sessionId);
    checkPromptFiles(params.files, context.serving.host.attachments);
    checkFilesFit(params.files);
    if (params.files && params.files.length > 0) await targetProject(context.serving, "sessions.send", params);
  },
  async summarize(params, context) {
    const target = await targetSession(context, params.sessionId);
    const steer = params.mode === "steer" ? " (interrupting its current turn)" : "";
    return fitSummary((length) => `Send to “${quotable(target.title, Math.min(60, length))}”: “${excerpt(params.prompt, length)}”${steer}`, params.files);
  },
  async execute(params, context) {
    const { serving } = context;
    if (!params.files || params.files.length === 0) {
      const sent = await serving.host.sessions.send(params.sessionId, params.prompt, params.mode);
      return { result: { sessionId: params.sessionId, delivery: sent.delivery, duplicate: false } };
    }
    const projectId = await targetProject(serving, "sessions.send", params);
    const attachments = await approvedAttachments(serving, context.session.id, context.requestId, projectId, params.files);
    const sent = await withAttachments(serving, attachments, projectId, () => serving.host.sessions.send(params.sessionId, params.prompt, params.mode, attachments));
    return { result: { sessionId: params.sessionId, delivery: sent.delivery, duplicate: false } };
  },
});

async function resolveStart(params: SessionsStartParams, context: HandlerContext): Promise<{ args: StartSessionArgs; projectName: string; environmentLabel: string }> {
  const projects = await context.serving.host.projects.list();
  const project = projects.find((candidate) => candidate.id === params.projectId);
  if (!project) throw new PageError("not_found", "That project is not available");
  let environment: StartSessionArgs["environment"] = { kind: "project-default" };
  let environmentLabel = "the project's default environment";
  if (typeof params.environment === "object") {
    const other = await targetSession(context, params.environment.sameAs);
    if (!other.environmentId) throw new PageError("invalid_params", "That session has no environment to share");
    environment = { kind: "reuse", environmentId: other.environmentId };
    environmentLabel = `the environment of “${excerpt(other.title, 40)}”`;
  }
  return {
    args: {
      projectId: params.projectId,
      prompt: params.prompt,
      ...(params.title ? { title: params.title } : {}),
      ...(params.providerId ? { providerId: params.providerId } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.reasoningLevel ? { reasoningLevel: params.reasoningLevel } : {}),
      environment,
    },
    projectName: project.name,
    environmentLabel,
  };
}

export const sessionsStart = handler<SessionsStartParams, unknown>({
  method: "sessions.start",
  async refuse(params, context) {
    checkPromptFiles(params.files, context.serving.host.attachments);
    checkFilesFit(params.files);
    await resolveStart(params, context);
  },
  async summarize(params, context) {
    const { projectName, environmentLabel } = await resolveStart(params, context);
    const runtime = [params.providerId, params.model, params.reasoningLevel].filter(Boolean).join(" · ") || "the project's default provider and model";
    // Several buttons often share a prompt's opening, so a title leads when there is one.
    return fitSummary((length) => {
      const project = excerpt(projectName, Math.max(24, length));
      const what = params.title ? `Start “${quotable(params.title, Math.min(60, length))}” in ${project}` : `Start a session in ${project}`;
      return `${what}: “${excerpt(params.prompt, length)}” — using ${excerpt(runtime, Math.max(24, length))}, in ${excerpt(environmentLabel, Math.max(32, length))}`;
    }, params.files);
  },
  async execute(params, context) {
    const { args } = await resolveStart(params, context);
    const attachments = await approvedAttachments(context.serving, context.session.id, context.requestId, params.projectId, params.files);
    const started = await withAttachments(context.serving, attachments, params.projectId, () => context.serving.host.sessions.start(attachments.length > 0 ? { ...args, attachments } : args));
    return { result: { sessionId: started.id } };
  },
});

export const sessionsStop = handler<{ sessionId: string }, unknown>({
  method: "sessions.stop",
  async refuse(params, context) {
    if (params.sessionId === context.session.id) throw new PageError("invalid_params", "A page cannot stop its own session");
    await targetSession(context, params.sessionId);
  },
  async summarize(params, context) {
    const target = await targetSession(context, params.sessionId);
    return `Stop “${excerpt(target.title, 60)}”`;
  },
  async execute(params, { serving }) {
    await serving.host.sessions.stop(params.sessionId);
    return { result: { stopped: true } };
  },
});

export const sessionsArchive = handler<{ sessionId: string }, unknown>({
  method: "sessions.archive",
  async refuse(params, context) {
    await targetSession(context, params.sessionId);
  },
  async summarize(params, context) {
    const target = await targetSession(context, params.sessionId);
    return `Archive “${excerpt(target.title, 60)}”${params.sessionId === context.session.id ? " (this page's own session; its page will stop being served)" : ""}`;
  },
  async execute(params, { serving }) {
    await serving.host.sessions.archive(params.sessionId);
    return { result: { archived: true } };
  },
});

export const sessionsMarkRead = handler<{ sessionId: string; read: boolean }, unknown>({
  method: "sessions.markRead",
  async refuse(params, context) {
    await targetSession(context, params.sessionId);
  },
  async execute(params, { serving }) {
    const after = await serving.host.sessions.markRead(params.sessionId, params.read);
    return { result: { sessionId: params.sessionId, unread: after.unread } };
  },
});

export const projectsBrowse = handler<null, unknown>({
  method: "projects.browse",
  async summarize() {
    return "Choose a project folder on this device";
  },
  async execute(_params, { serving, session }) {
    const location = await serving.host.sessions.storage(session.id);
    const picked = await serving.host.projects.browse(location.hostId);
    if (!picked) return { result: { selection: null } };
    const token = serving.selections.issue({ session: session.id, hostId: location.hostId, path: picked.path }, serving.now());
    return { result: { selection: { token, displayPath: displayPath(picked.path), hostName: picked.hostName } } };
  },
});

function displayPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

export const projectsCreate = handler<{ selectionToken: string; name?: string }, unknown>({
  method: "projects.create",
  async refuse(params, { serving, session }) {
    if (!serving.selections.peek(params.selectionToken, session.id, serving.now())) {
      throw new PageError("not_found", "That folder selection has expired; choose the folder again");
    }
  },
  async summarize(params, { serving, session }) {
    const selection = serving.selections.peek(params.selectionToken, session.id, serving.now());
    const name = params.name ?? selection?.path.split(/[\\/]/).pop() ?? "the selected folder";
    return `Create project “${excerpt(name, 60)}” from ${selection ? displayPath(selection.path) : "the selected folder"}`;
  },
  async execute(params, { serving, session }) {
    const selection = serving.selections.redeem(params.selectionToken, session.id, serving.now());
    if (!selection) throw new PageError("not_found", "That folder selection has expired; choose the folder again");
    const name = params.name ?? selection.path.split(/[\\/]/).pop() ?? "New project";
    const created = await serving.host.projects.create({ name, hostId: selection.hostId, path: selection.path });
    return { result: { project: { id: created.id, name: created.name, kind: created.kind } } };
  },
});
