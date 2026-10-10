// The respond steps shared by `session.respond`, `sessions.respond` and `pages.answer { respond }`: the answer checked against the live wait, the decision summary and its cooldown, the provider call, the ledger entry (03 §Session state vocabulary, R-C7; DESIGN §E.7).
import { checkAnswer, decisionSummary, type RespondPayloadLike } from "../../../domain/capabilities/waiting.ts";
import { PageError, PUBLIC_MESSAGES, mapProviderError } from "../../../domain/errors.ts";
import type { RespondPayload, SessionRecord } from "../../../host/provider.ts";
import type { ServingContext } from "../../context.ts";
import { decisionCooldownKey, grantCooldownKey } from "../cooldown.ts";
import type { Sender } from "../deliver.ts";
import { type BridgeContext, type DecisionRequest, boundTitle, refuseArchived } from "../handler.ts";

export interface RespondParams {
  readonly id: string;
  readonly answers?: Record<string, { selected: string[]; freeText?: string }>;
  readonly decision?: "allow_once" | "allow_for_session" | "deny";
}

function payloadOf(params: RespondParams): RespondPayloadLike {
  return params.decision !== undefined ? { decision: params.decision } : { answers: params.answers ?? {} };
}

/**
 * Everything refused before any dialog: an archived target, a wait that is
 * over or another, `id: null`, a kind the answer does not match, an answer
 * the question does not allow, a summary too long to show, and the
 * cooldowns after a decline. DESIGN §E.7 steps 3–6, §E.1 step 11
 */
export function refuseRespond(context: BridgeContext, target: SessionRecord, params: RespondParams, grantHeld: boolean): void {
  refuseArchived(target);
  checkAnswer(target, params.id, payloadOf(params));
  const page = context.session.id;
  if (params.decision !== undefined) {
    if (context.serving.cooldowns.active(decisionCooldownKey(page, target.id, params.id), context.serving.now())) throw new PageError("cancelled", PUBLIC_MESSAGES.cancelled);
  } else if (!grantHeld && target.id !== page && context.serving.cooldowns.active(grantCooldownKey(page, target.id), context.serving.now())) {
    throw new PageError("cancelled", PUBLIC_MESSAGES.cancelled);
  }
}

/** The decision challenge's words, re-derived from the live wait every time. 03 R-C7 */
export function decisionRequest(target: SessionRecord, params: RespondParams): DecisionRequest | null {
  if (params.decision === undefined || !target.waiting) return null;
  return { summary: decisionSummary({ id: target.id, title: boundTitle(target.title) }, target.waiting, params.decision) };
}

/** The provider's `respond`, errors mapped, the free text noted in the ledger so the question row can carry `from: page`. DESIGN §E.7 step 8 */
export async function executeRespond(ctx: ServingContext, target: string, params: RespondParams, sender: Sender, requestId: string): Promise<{ answered: true }> {
  const respond = ctx.provider.sessions.respond;
  if (!respond) throw new PageError("unknown_method", "This host does not answer waits from a page");
  const payload: RespondPayload = params.decision !== undefined ? { decision: params.decision } : { answers: params.answers ?? {} };
  try {
    await respond.call(ctx.provider.sessions, target, params.id, payload);
  } catch (error) {
    throw mapProviderError(error, ctx.log, `sessions.respond ${target}`);
  }
  // The answer as text, one line per question — free text, else the selected option ids — so a provider's answer row can be matched by text where it returns no message id. 06 R-P5
  const text = params.answers
    ? Object.values(params.answers)
        .map((answer) => answer.freeText ?? answer.selected.join(", "))
        .join("\n")
    : params.decision ?? "";
  ctx.ledger.note(target, { requestId, text, label: sender.label, sentAtMs: ctx.now() });
  return { answered: true };
}
