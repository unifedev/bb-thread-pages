// `requireActionToken`, `acquireBudget` (document+scope and session) — the steps every effectful route shares (05 R2.6–R2.10, R2.38–R2.39).
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";
import { verifyActionToken, type ActionToken } from "../domain/tokens/action-token.ts";
import type { ServingContext } from "./context.ts";

/** The action token in a POST body: signed by this server, within its lifetime, naming a session and a revision — else `403 forbidden`. 05 R2.6, R2.7 */
export function requireActionToken(ctx: ServingContext, token: unknown): ActionToken {
  const verified = verifyActionToken(token, ctx.signingKey, ctx.now());
  if (!verified) throw new PageError("forbidden", PUBLIC_MESSAGES.tokenInvalid);
  return verified;
}

/** The built-in home acts as no session: a route that writes into one refuses it. 05 R-S12 */
export function requireSessionToken(token: ActionToken, message: string): string {
  if (token.session === HOME_IDENTITY) throw new PageError("forbidden", message);
  return token.session;
}

/** A slot in the budget of the token's document (and scope) and of its session; refused → `429`, charged to neither. 05 R2.38a, R2.39 */
export function acquireBudget(ctx: ServingContext, token: Pick<ActionToken, "session" | "path">, scope: string | null = null): () => void {
  const release = ctx.budget.acquire({ session: token.session, document: token.path ?? ENTRY_DOCUMENT, scope }, ctx.now());
  if (!release) throw new PageError("rate_limited", PUBLIC_MESSAGES.rateLimited);
  return release;
}
