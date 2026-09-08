import type { Context } from "hono";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { verifyActionToken, type ActionToken } from "../domain/tokens/action-token.ts";
import type { ServingContext } from "./context.ts";

/**
 * The steps every effectful route shares: a bounded JSON body, a valid action
 * token, and a slot in the page's rate budget. spec R2.6, R2.38
 */
export async function readJsonBody(context: Context, maxBytes: number): Promise<unknown> {
  const declared = Number(context.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PageError("request_too_large", "Request body is too large");
  const raw = await context.req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new PageError("request_too_large", "Request body is too large");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new PageError("invalid_json", "Request body is not valid JSON");
  }
}

export function requireActionToken(serving: ServingContext, token: unknown): ActionToken {
  const verified = typeof token === "string" ? verifyActionToken(token, serving.signingKey, serving.now()) : null;
  if (!verified) throw new PageError("confirmation_invalid", PUBLIC_MESSAGES.tokenInvalid, { status: 401 });
  return verified;
}

export function acquireRate(serving: ServingContext, session: string): () => void {
  const release = serving.rate.acquire(session, serving.now());
  if (!release) throw new PageError("rate_limited", PUBLIC_MESSAGES.rateLimited);
  return release;
}
