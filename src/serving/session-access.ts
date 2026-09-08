import type { Context } from "hono";
import { describeIneligible, ineligibleReason } from "../domain/eligibility.ts";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { isSessionId } from "../domain/ids.ts";
import type { SessionRecord } from "../host/types.ts";
import type { ServingContext } from "./context.ts";

/** Shared first steps of every route: which session, does it exist, may it have a page. */
export function sessionIdFrom(context: Context): string {
  const url = new URL(context.req.url);
  const candidate = url.searchParams.get("session") ?? url.searchParams.get("threadId");
  if (!isSessionId(candidate)) throw new PageError("invalid_session", PUBLIC_MESSAGES.invalidSession);
  return candidate;
}

export async function eligibleSession(serving: ServingContext, id: string): Promise<SessionRecord> {
  const session = await serving.host.sessions.get(id);
  if (!session) throw new PageError("not_found", "That session does not exist.");
  const reason = ineligibleReason(session);
  if (reason) throw new PageError("ineligible", `${PUBLIC_MESSAGES.ineligible} (${describeIneligible(reason)}.)`);
  return session;
}
