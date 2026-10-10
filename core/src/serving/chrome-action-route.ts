// `POST /chrome-action`: revokeGrant (from the home, any pair on the host), declined (the cooldown of DESIGN §E.1 step 15) — what the shell alone may ask (05 §Routes; 03 R5.65, R-C7; 02 R4.49; DR-10; U49: the bar's session actions are gone with the bar).
import { PageError } from "../domain/errors.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { isChromeActionBody, type ChromeActionResponse } from "../runtime/shared/envelopes.ts";
import { acquireBudget, requireActionToken } from "./action-request.ts";
import { cooldownKeyFor } from "./bridge/cooldown.ts";
import type { ServingContext } from "./context.ts";
import { failure, json } from "./responses.ts";
import { readJsonBody, requireReader } from "./request.ts";

/**
 * The trusted shell acting for the reader. Only the shell holds the action
 * token, so a page cannot reach this. A decline never reaches the server as
 * a call: it arrives here and starts the 10 s cooldown. A grant is revoked
 * for the token's own page; the home page, the reader's list of every
 * pair, names the granting page with `from`. 05 §Routes; 03 R5.65; DESIGN P14
 */
export function chromeActionRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      const body = await readJsonBody(request, LIMITS.capabilityPayloadBytes);
      if (!isChromeActionBody(body)) throw new PageError("invalid_request", "Invalid chrome action");
      const token = requireActionToken(ctx, body.actionToken);
      release = acquireBudget(ctx, token);
      let answer: ChromeActionResponse;
      switch (body.action) {
        case "declined":
          ctx.cooldowns.start(cooldownKeyFor(token.session, body.target), ctx.now());
          answer = { ok: true };
          break;
        case "revokeGrant": {
          if (body.from !== undefined && token.session !== HOME_IDENTITY) throw new PageError("forbidden", "Only the home page revokes another page's grants.");
          const from = body.from ?? token.session;
          await ctx.grants.revoke(from, body.target);
          ctx.log.info(`grant revoked: ${from} → ${body.target}`);
          answer = { ok: true };
          break;
        }
      }
      return json(200, answer);
    } catch (error) {
      return failure(error, ctx.log, "POST /chrome-action", false);
    } finally {
      release?.();
    }
  };
}
