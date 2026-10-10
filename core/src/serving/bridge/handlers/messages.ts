// The transcript read shared by `session.messages` and `sessions.messages`: session-bound cursors decoded before the provider is called, `from` marked from the ledger, rows bounded and marked, cursors re-wrapped (03 R-C1–R-C4; DESIGN §E.6).
import type { MessagesParams } from "../../../domain/capabilities/specs.ts";
import { PageError, mapProviderError } from "../../../domain/errors.ts";
import { boundRows, type BoundableRow } from "../../../domain/messages/bound.ts";
import { decodeCursor, encodeCursor } from "../../../domain/messages/cursor.ts";
import type { Message } from "../../../host/provider.ts";
import type { ServingContext } from "../../context.ts";

export interface TranscriptPage {
  messages: Message[];
  nextCursor: string | null;
  prevCursor: string | null;
  generatedAtMs: number;
}

/** A page's cursor, or `invalid_params` with reason `cursor` for one the session did not issue. 03 R-C1; DR-6 */
export function providerCursor(ctx: ServingContext, session: string, cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  const decoded = decodeCursor(session, cursor, ctx.signingKey);
  if (decoded === null) throw new PageError("invalid_params", "Unknown cursor: the session did not issue it", { reason: "cursor" });
  return decoded;
}

function projectRow(row: Message): Message {
  const out: Message = { id: row.id, atMs: row.atMs, cursor: row.cursor, kind: row.kind, done: row.done };
  if (row.turnId !== undefined) out.turnId = row.turnId;
  if (row.agentId !== undefined) out.agentId = row.agentId;
  if (row.text !== undefined) out.text = row.text;
  if (row.from !== undefined) out.from = row.from.label !== undefined ? { kind: row.from.kind, label: row.from.label } : { kind: row.from.kind };
  if (row.tool !== undefined) {
    out.tool = { name: row.tool.name, input: row.tool.input };
    if (row.tool.result !== undefined) out.tool.result = row.tool.result;
    if (row.tool.isError !== undefined) out.tool.isError = row.tool.isError;
  }
  if (row.question !== undefined) {
    out.question = { id: row.question.id, answered: row.question.answered };
    if (row.question.options !== undefined) out.question.options = row.question.options.map((option) => ({ questionId: option.questionId, id: option.id, label: option.label }));
  }
  if (row.files !== undefined) out.files = row.files.map((file) => ({ name: file.name, ...(file.path !== undefined ? { path: file.path } : {}), mimeType: file.mimeType, sizeBytes: file.sizeBytes }));
  if (row.truncated === true) out.truncated = true;
  return out;
}

/** One transcript read of `session`, as 03 R-C1 defines the result. */
export async function readTranscript(ctx: ServingContext, session: string, params: MessagesParams): Promise<TranscriptPage> {
  const before = providerCursor(ctx, session, params.before);
  const after = providerCursor(ctx, session, params.after);
  let page: { messages: Message[]; nextCursor: string | null; prevCursor: string | null };
  try {
    page = await ctx.provider.sessions.messages(session, { limit: params.limit, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
  } catch (error) {
    throw mapProviderError(error, ctx.log, `sessions.messages ${session}`);
  }
  const marked = ctx.ledger.markFrom(session, page.messages.map(projectRow));
  const rows = (boundRows(marked as unknown as BoundableRow[]) as unknown as Message[]).map((row) => ({ ...row, cursor: encodeCursor(session, row.cursor, ctx.signingKey) }));
  const any = page.messages.length > 0;
  return {
    messages: rows,
    nextCursor: any && page.nextCursor !== null ? encodeCursor(session, page.nextCursor, ctx.signingKey) : null,
    prevCursor: any && page.prevCursor !== null ? encodeCursor(session, page.prevCursor, ctx.signingKey) : null,
    generatedAtMs: ctx.now(),
  };
}
