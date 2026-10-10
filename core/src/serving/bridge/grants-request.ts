// The pair grant as `pages.answer` and `sessions.respond { answers }` ask for it: the one sentence of 03 R5.64 with both sessions' titles and ids, and the record on approval (03 R5.64, R5.65; DESIGN §E.8, §E.10).
import { quotable } from "../../domain/quotable.ts";
import type { HandlerContext } from "../context.ts";
import { senderLabel } from "./handler.ts";

/** The grant's summary, verbatim from 03 R5.64; titles quoted as R3.22a demands, ids beside them. */
export function grantSummary(context: HandlerContext, target: { id: string; title: string }): string {
  const from = quotable(senderLabel(context), 120) || "this page";
  const to = quotable(target.title, 120) || "that session";
  return `Allow the page of ${from} (${context.session.id}) to send the reader's answers into ${to} (${target.id}): form answers, replies and prompts, framed as coming from that page, and answers to questions ${to} asks — including whether to proceed — never a permission decision.`;
}

export async function recordGrant(context: HandlerContext, target: string): Promise<void> {
  await context.serving.grants.record(context.session.id, target);
  context.serving.log.info(`grant given: ${context.session.id} → ${target}`);
}
