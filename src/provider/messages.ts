// threads.timeline → Message[]; the cursor codec (DESIGN §B.1 `messages`, D-bb-6). Every Message.cursor is
// base64url(JSON{ v: 1, id, s: sourceSeqStart, e: sourceSeqEnd }); `before` → beforeAnchorId/Seq; `after` walks
// back from the latest page with bb's olderCursor until the cursor's sequence is covered (BB-9): bb's
// `afterSequence` is not paging — it is the client's known maxSeq for the server's latest-rows cache, which
// answers `rows: []` plus a delta on a hit (bb 0.42.1 start-server.js, `timelineLatestRowsCache`). A cursor
// this host did not issue is ProviderError(reason "cursor") → invalid_params in the core.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { ProviderError, type Message } from "../../core/src/host/index.ts";
import { asRecord, sdkCall } from "./errors.ts";

export interface MessageCursor { id: string; s: number; e: number }

export function encodeMessageCursor(c: MessageCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, id: c.id, s: c.s, e: c.e }), "utf8").toString("base64url");
}

export function decodeMessageCursor(cursor: string): MessageCursor {
  try {
    const parsed = asRecord(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed && parsed.v === 1 && typeof parsed.id === "string" && Number.isInteger(parsed.s) && Number.isInteger(parsed.e) && encodeMessageCursor({ id: parsed.id, s: parsed.s as number, e: parsed.e as number }) === cursor) {
      return { id: parsed.id, s: parsed.s as number, e: parsed.e as number };
    }
  } catch {
    // falls through
  }
  throw new ProviderError("other", "cursor not issued for this session", "cursor");
}

/** `segmentLimit` is a segment count, not a row count: over-fetch and trim (O-1 adjusts the ratio). */
export function segmentsFor(limit: number): number {
  return Math.max(1, Math.min(200, limit));
}

/** How many older pages a tail read walks back to reach its cursor before it gives up and warns. */
export const TAIL_PAGES_MAX = 20;

type Row = Record<string, unknown>;
interface FlatRow { row: Row; agentId: string | undefined }

/** Every row of the page, turn rows and nesting flattened, oldest first. */
export function rowsOf(response: unknown): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (rows: unknown, agentId: string | undefined) => {
    if (!Array.isArray(rows)) return;
    for (const raw of rows) {
      const row = asRecord(raw);
      if (!row) continue;
      if (row.kind === "turn") {
        walk(row.children, agentId);
        continue;
      }
      out.push({ row, agentId });
      if (row.workKind === "delegation") walk(row.childRows, typeof asRecord(row.childRef)?.threadId === "string" ? (asRecord(row.childRef)!.threadId as string) : agentId);
      else if (Array.isArray(row.childRows)) walk(row.childRows, agentId);
    }
  };
  walk(asRecord(response)?.rows, undefined);
  return out.sort((a, b) => seq(a.row) - seq(b.row));
}

function seq(row: Row): number {
  const value = Number(row.sourceSeqStart);
  return Number.isFinite(value) ? value : 0;
}

export function cursorOfRow(row: Row): string {
  return encodeMessageCursor({ id: String(row.id), s: Number(row.sourceSeqStart) || 0, e: Number(row.sourceSeqEnd) || 0 });
}

export type TitleLookup = (threadId: string) => Promise<string | null>;

/** 03 `Message` from one timeline row (DESIGN §B.1 row projection). */
export async function projectRow(flat: FlatRow, titleOf: TitleLookup): Promise<Message | null> {
  const { row, agentId } = flat;
  const base: Pick<Message, "id" | "atMs" | "cursor" | "done"> & Partial<Pick<Message, "turnId" | "agentId">> = {
    id: String(row.id),
    atMs: typeof row.createdAt === "number" ? Math.max(0, Math.trunc(row.createdAt)) : 0,
    cursor: cursorOfRow(row),
    done: row.status !== "pending",
    ...(typeof row.turnId === "string" ? { turnId: row.turnId } : {}),
    ...(agentId !== undefined ? { agentId } : {}),
  };
  if (row.role === "user") {
    const message: Message = { ...base, kind: "user", text: stringOf(row.text) };
    if (row.initiator === "agent" && typeof row.senderThreadId === "string") {
      const label = await titleOf(row.senderThreadId);
      message.from = label ? { kind: "session", label } : { kind: "session" };
    } else if (row.initiator === "system") {
      message.from = { kind: "plugin" };
    }
    const files = filesOf(asRecord(row.attachments));
    if (files.length > 0) message.files = files;
    return message;
  }
  if (row.role === "assistant") return { ...base, kind: "assistant", text: stringOf(row.text) };
  if (typeof row.systemKind === "string") return { ...base, kind: "notice", text: row.systemKind.replace(/[-_]/g, " ") };
  if (typeof row.workKind !== "string") return null;
  switch (row.workKind) {
    case "tool": {
      const message: Message = {
        ...base,
        kind: "tool",
        tool: { name: stringOf(row.toolName) || "tool", input: row.toolArgs ?? null, result: row.output, isError: row.status === "error" },
      };
      const total = asRecord(row.outputPreview)?.totalChars;
      if (typeof total === "number" && typeof row.output === "string" && total > row.output.length) message.truncated = true;
      return message;
    }
    case "command":
      return { ...base, kind: "tool", tool: { name: "shell", input: { command: stringOf(row.command), cwd: row.cwd ?? null }, result: row.output, isError: typeof row.exitCode === "number" && row.exitCode !== 0 } };
    case "delegation":
      return {
        ...base,
        kind: "tool",
        tool: { name: stringOf(row.toolName) || "delegation", input: { description: row.description ?? null, subagentType: row.subagentType ?? null }, result: row.output },
        ...(typeof asRecord(row.childRef)?.threadId === "string" ? { agentId: asRecord(row.childRef)!.threadId as string } : {}),
      };
    case "question": {
      const questions = (Array.isArray(row.questions) ? row.questions : []).map(asRecord).filter((q): q is Row => q !== null);
      return {
        ...base,
        kind: "question",
        text: questions.map((q) => stringOf(q.prompt)).filter(Boolean).join("\n"),
        question: {
          id: stringOf(row.interactionId),
          options: questions.flatMap((q) =>
            (Array.isArray(q.options) ? q.options : [])
              .map(asRecord)
              .filter((o): o is Row => o !== null)
              .map((o) => ({ questionId: stringOf(q.id), id: stringOf(o.value), label: stringOf(o.label) || stringOf(o.value) })),
          ),
          answered: row.lifecycle === "answered",
        },
      };
    }
    case "approval": {
      const target = asRecord(row.target);
      const what = [stringOf(row.approvalKind).replace(/-/g, " "), stringOf(target?.toolName)].filter(Boolean).join(": ");
      return { ...base, kind: "question", text: `Approval requested${what ? `: ${what}` : ""}`, question: { id: stringOf(row.interactionId), answered: row.lifecycle !== "waiting" } };
    }
    default: {
      const { id: _i, createdAt: _c, startedAt: _s, sourceSeqStart: _ss, sourceSeqEnd: _se, threadId: _t, turnId: _tu, status: _st, workKind, output, childRows: _ch, ...rest } = row;
      return { ...base, kind: "tool", tool: { name: String(workKind), input: rest, result: output, isError: row.status === "error" } };
    }
  }
}

function filesOf(attachments: Row | null): NonNullable<Message["files"]> {
  if (!attachments) return [];
  const paths = (list: unknown, image: boolean) =>
    (Array.isArray(list) ? list : [])
      .filter((p): p is string => typeof p === "string")
      .map((path) => ({ name: path.split("/").pop() ?? path, path, mimeType: mimeOf(path, image), sizeBytes: 0 }));
  return [...paths(attachments.localImagePaths, true), ...paths(attachments.localFilePaths, false)];
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", txt: "text/plain", md: "text/markdown", json: "application/json", html: "text/html", csv: "text/csv" };

function mimeOf(path: string, image: boolean): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return MIME[ext] ?? (image ? "image/*" : "application/octet-stream");
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface MessagesDeps { titleOf: TitleLookup; log?: { warn(message: string): void } }

export function createMessages(bb: BbPluginApi, deps: MessagesDeps) {
  const tailWarned = new Set<string>();
  async function page(threadId: string, query: Record<string, string>): Promise<{ rows: FlatRow[]; hasOlder: boolean; older: { anchorId: string; anchorSeq: string } | null }> {
    const response = await sdkCall("sessions.messages", () => bb.sdk.threads.timeline({ threadId, includeNestedRows: "true", ...query }));
    const timelinePage = asRecord(asRecord(response)?.timelinePage);
    const olderCursor = asRecord(timelinePage?.olderCursor);
    return {
      rows: rowsOf(response),
      hasOlder: timelinePage?.hasOlderRows === true,
      older: olderCursor && typeof olderCursor.anchorId === "string" ? { anchorId: olderCursor.anchorId, anchorSeq: String(olderCursor.anchorSeq) } : null,
    };
  }

  async function project(rows: FlatRow[], prevNull: boolean): Promise<{ messages: Message[]; nextCursor: string | null; prevCursor: string | null }> {
    const messages = (await Promise.all(rows.map((r) => projectRow(r, deps.titleOf)))).filter((m): m is Message => m !== null);
    const first = messages[0];
    const last = messages[messages.length - 1];
    return { messages, nextCursor: last ? last.cursor : null, prevCursor: first && !prevNull ? first.cursor : null };
  }

  return async function messages(id: string, params: { limit?: number; before?: string; after?: string }) {
    const limit = Math.max(1, params.limit ?? 50);
    const segmentLimit = String(segmentsFor(limit));
    if (params.after !== undefined) {
      const cursor = decodeMessageCursor(params.after);
      // Newest page first, then older pages until a fetched row is at or before the cursor (or history ends).
      let result = await page(id, { segmentLimit });
      let pages = 1;
      while (result.rows.length > 0 && seq(result.rows[0]!.row) > cursor.e && result.hasOlder && result.older && pages < TAIL_PAGES_MAX) {
        const more = await page(id, { segmentLimit, beforeAnchorId: result.older.anchorId, beforeAnchorSeq: result.older.anchorSeq });
        result = { rows: [...more.rows, ...result.rows], hasOlder: more.hasOlder, older: more.older };
        pages += 1;
      }
      if (result.rows.length > 0 && seq(result.rows[0]!.row) > cursor.e && result.hasOlder) {
        // The cursor lies beyond the bound: refuse it as unknown (invalid_params in the core) rather than skip rows
        // silently; the page then reads without a cursor and continues from the newest rows (BB-9b).
        if (!tailWarned.has(id)) {
          tailWarned.add(id);
          deps.log?.warn(`sessions.messages: a cursor of ${id} lies more than ${TAIL_PAGES_MAX} pages behind the head; refused as unknown`);
        }
        throw new ProviderError("other", "cursor too far behind the head for this session", "cursor");
      }
      // The oldest `limit` rows newer than the cursor's row.
      const rows = result.rows.filter((r) => seq(r.row) > cursor.e || (seq(r.row) === cursor.e && String(r.row.id) !== cursor.id)).slice(0, limit);
      return project(rows, false);
    }
    const anchor = params.before !== undefined ? decodeMessageCursor(params.before) : null;
    let result = await page(id, { segmentLimit, ...(anchor ? { beforeAnchorId: anchor.id, beforeAnchorSeq: String(anchor.s) } : {}) });
    if (result.rows.length < limit && result.hasOlder && result.older) {
      const more = await page(id, { segmentLimit, beforeAnchorId: result.older.anchorId, beforeAnchorSeq: result.older.anchorSeq });
      result = { rows: [...more.rows, ...result.rows], hasOlder: more.hasOlder, older: more.older };
    }
    const rows = result.rows.slice(-limit);
    const exhausted = !result.hasOlder && rows.length === result.rows.length;
    return project(rows, exhausted);
  };
}
