// The keys of the declined-challenge cooldowns the shell starts through `chrome-action { declined }` and the dispatcher honours for 10 s (03 R-C7, 02 R4.49; DR-10).
import type { DeclinedTarget } from "../../runtime/shared/envelopes.ts";

/** `decision:<page session>:<target session>:<waitId>` — a further `decision` for that wait is `cancelled` without a dialog. 03 R-C7 */
export function decisionCooldownKey(pageSession: string, targetSession: string, waitId: string): string {
  return `decision:${pageSession}:${targetSession}:${waitId}`;
}

/** `grant:<page session>:<target session>` — `pages.answer` and `sessions.respond { answers }` into that target are `cancelled` without a dialog. 02 R4.49 */
export function grantCooldownKey(pageSession: string, targetSession: string): string {
  return `grant:${pageSession}:${targetSession}`;
}

/** The key for a declined target as the shell reports it. DESIGN §E.1 step 15 */
export function cooldownKeyFor(pageSession: string, target: DeclinedTarget): string {
  return target.kind === "decision" ? decisionCooldownKey(pageSession, target.session, target.waitId) : grantCooldownKey(pageSession, target.session);
}
