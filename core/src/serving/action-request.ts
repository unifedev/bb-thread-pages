// `requireActionToken`, `acquireBudget` (document+scope and session), `boundHostWork` (the bridge and file timeouts) — the steps every effectful route shares (05 R2.6–R2.10, R2.38–R2.39, R2.38b).
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
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

/** What a bounded request's work does with its bound: lift it, for a call that waits on the reader or runs under a bound of its own; check it before each step that starts an effect or more host work. 05 R2.38b */
export interface HostBound {
  lift(): void;
  /** Throws the request's `timeout` once it has been answered, so work that resumes late does nothing more. */
  check(): void;
}

/** What `check()` throws after the answer: the late work stops there, and the log says so. */
const STOPPED = Symbol("stopped after the host timeout");

/** The bound a request's host work runs under: its limit and the name its log lines give it. 05 R2.38b; 08 §Limits */
export interface HostTimeout {
  ms: number;
  name: string;
}

/** Requests that hold a budget slot: the bridge, a submission, a document exchange, a shell action. */
export const BRIDGE_TIMEOUT: HostTimeout = { ms: LIMITS.bridgeCallMs, name: "bridge timeout" };
/** The file routes, `/upload` and `/attach`, whose host time grows with the file. B-0238 */
export const FILE_TIMEOUT: HostTimeout = { ms: LIMITS.fileCallMs, name: "file timeout" };

/**
 * The host's part of a request that holds a budget slot, bounded by `limit` (`bridgeCallMs`, or `fileCallMs` for the
 * file routes) from the slot: past it the request
 * is answered `unavailable` with reason `timeout`, so the route's `finally` frees the slot at once. The host call in
 * flight is not aborted (the provider need not support it, 06 R-P4), but the work stops at its next `check()`, so
 * nothing more is done; the outcome is logged and handed to `late`, else dropped. 05 R2.38b
 */
export function boundHostWork<T>(ctx: ServingContext, label: () => string, work: (bound: HostBound) => Promise<T>, late?: (outcome: PromiseSettledResult<T>) => void, limit: HostTimeout = BRIDGE_TIMEOUT): Promise<T> {
  const seconds = Math.round(limit.ms / 1000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ctx.log.warn(`${label()}: the host did not answer within ${seconds} s; answered unavailable (timeout)`);
      reject(new PageError("unavailable", `The host did not answer within ${seconds} seconds`, { reason: "timeout" }));
    }, limit.ms);
  });
  const timedOutError = () => Object.assign(new PageError("unavailable", `The host did not answer within ${seconds} seconds`, { reason: "timeout" }), { [STOPPED]: true });
  const running = work({
    lift: () => clearTimeout(timer),
    check: () => {
      if (timedOut) throw timedOutError();
    },
  });
  running.then(
    (value) => {
      if (!timedOut) return;
      ctx.log.warn(`${label()}: the host answered after the ${limit.name}; the answer was dropped`);
      late?.({ status: "fulfilled", value });
    },
    (reason: unknown) => {
      if (!timedOut) return;
      if (typeof reason === "object" && reason !== null && STOPPED in reason) ctx.log.warn(`${label()}: the host answered after the ${limit.name}; stopped there, nothing more was done`);
      else ctx.log.warn(`${label()}: the host failed after the ${limit.name}; the answer was dropped: ${errorText(reason)}`);
      late?.({ status: "rejected", reason });
    },
  );
  return Promise.race([running, timeout]).finally(() => clearTimeout(timer));
}
