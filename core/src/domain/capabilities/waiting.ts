// `Waiting` validation and the answer-vs-wait check of 03 §Session state vocabulary (`invalid_params` / `conflict`), `boundWaiting` (questionChars, decisionSummaryChars), the decision summary wording.
import { PageError, PUBLIC_MESSAGES } from "../errors.ts";
import { LIMITS } from "../limits.ts";
import { quotable, verbatim } from "../quotable.ts";
import { APPROVAL_SUBJECTS, DECISIONS, waitingSchema, type Decision, type WaitingResult } from "./specs.ts";

/** The `waiting` object as the provider reports it (03 §Session state vocabulary), structurally. */
export interface WaitingLike {
  id: string | null;
  kind: "question" | "approval" | "other";
  text: string | null;
  questions?: { id: string; text: string; options: { id: string; label: string }[]; multiSelect: boolean; allowFreeText: boolean }[];
  approval?: { subject: (typeof APPROVAL_SUBJECTS)[number]; summary: string; decisions: Decision[] };
}

/** The floor when the host knows only that the session waits. 03 §Session state vocabulary */
export const WAITING_FLOOR: WaitingLike = Object.freeze({ id: null, kind: "other", text: null });

export function isWaiting(value: unknown): value is WaitingLike {
  return waitingSchema.parse(value as never, "$").ok;
}

function cut(text: string, max: number): { text: string; cut: boolean } {
  return text.length <= max ? { text, cut: false } : { text: `${text.slice(0, max - 1)}…`, cut: true };
}

/**
 * A `waiting` as a read returns it: `text` within `questionChars` and
 * `approval.summary` within `decisionSummaryChars`, each marked `truncated`
 * when cut; `null` when the state is not `waiting`. 03 R5.11c, §Session state vocabulary
 */
export function boundWaiting(waiting: WaitingLike | null | undefined, state: string): WaitingResult | null {
  if (state !== "waiting" || !waiting) return null;
  let truncated = false;
  const out: WaitingResult = { id: waiting.id, kind: waiting.kind, text: null };
  if (typeof waiting.text === "string") {
    const bounded = cut(waiting.text, LIMITS.questionChars);
    out.text = bounded.text;
    truncated = truncated || bounded.cut;
  }
  if (waiting.questions) out.questions = waiting.questions.map((question) => ({ ...question, options: question.options.map((option) => ({ ...option })) }));
  if (waiting.approval) {
    const summary = cut(waiting.approval.summary, LIMITS.decisionSummaryChars);
    truncated = truncated || summary.cut;
    out.approval = { subject: waiting.approval.subject, summary: summary.text, decisions: [...waiting.approval.decisions] };
  }
  if (truncated) out.truncated = true;
  return out;
}

export type RespondPayloadLike = { answers: Record<string, { selected: string[]; freeText?: string }>; decision?: undefined } | { decision: Decision; answers?: undefined };

/**
 * The answer-vs-wait check the server makes before anything reaches the
 * provider (03 §Session state vocabulary, §Binding, R-C7; DESIGN §E.7 steps
 * 3–6). Throws a `PageError`: `not_found` when the session is not waiting or
 * the id is not the current wait's; `unavailable` for `id: null`, kind
 * `other`, or a decision summary over `decisionSummaryChars` (reason
 * `summary_too_long`); `conflict` when the payload does not match the kind;
 * `invalid_params` for an answer the wait does not allow.
 */
export function checkAnswer(session: { state: string; waiting: WaitingLike | null }, waitId: string, payload: RespondPayloadLike): void {
  const waiting = session.waiting;
  if (session.state !== "waiting" || !waiting) throw new PageError("not_found", "That wait is over");
  if (waiting.id === null) throw new PageError("unavailable", "This wait cannot be answered from a page", { reason: "no_id" });
  if (waiting.id !== waitId) throw new PageError("not_found", "That wait is over or is not the current one");
  if (waiting.kind === "other") throw new PageError("unavailable", "This wait cannot be answered from a page", { reason: "other" });
  if (payload.decision !== undefined) {
    if (waiting.kind !== "approval" || !waiting.approval) throw new PageError("conflict", "This wait is a question; answer it with answers");
    if (!DECISIONS.includes(payload.decision) || !waiting.approval.decisions.includes(payload.decision)) throw new PageError("invalid_params", `Decision must be one of ${waiting.approval.decisions.join(", ")}`);
    if (waiting.approval.summary.length > LIMITS.decisionSummaryChars) throw new PageError("unavailable", PUBLIC_MESSAGES.summaryTooLong, { reason: "summary_too_long" });
    return;
  }
  if (waiting.kind !== "question") throw new PageError("conflict", "This wait is an approval; answer it with a decision");
  const questions = new Map((waiting.questions ?? []).map((question) => [question.id, question]));
  const answers = payload.answers ?? {};
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questions.get(questionId);
    if (!question) throw new PageError("invalid_params", `Unknown question ${questionId}`);
    const options = new Set(question.options.map((option) => option.id));
    for (const selected of answer.selected) {
      if (!options.has(selected)) throw new PageError("invalid_params", `Unknown option ${selected} for question ${questionId}`);
    }
    if (answer.selected.length > 1 && !question.multiSelect) throw new PageError("invalid_params", `Question ${questionId} takes one selection`);
    if (answer.freeText !== undefined && !question.allowFreeText) throw new PageError("invalid_params", `Question ${questionId} takes no free text`);
    if (answer.selected.length === 0 && answer.freeText === undefined) throw new PageError("invalid_params", `Question ${questionId} needs a selection or free text`);
  }
}

const SUBJECT_VERBS: Readonly<Record<(typeof APPROVAL_SUBJECTS)[number], string>> = Object.freeze({
  tool: "use a tool",
  command: "run a command",
  file_change: "change files",
  permission: "take a permission",
  plan: "follow a plan",
  other: "proceed",
});

const DECISION_WORDS: Readonly<Record<Decision, string>> = Object.freeze({
  allow_once: "allow once",
  allow_for_session: "allow, and every further use of this tool in this session",
  deny: "deny",
});

/**
 * The host-authored summary of a decision challenge: the session (its title
 * quoted as 05 R3.22a quotes a title), the subject, the provider's summary
 * verbatim — quotation marks and line breaks kept, never cut, only controls
 * and bidi characters removed; the host's wording sets it off with blank
 * lines and puts no quotation marks around it — and the decision,
 * `allow_for_session` spelled out. 03 R-C7; DESIGN §E.7
 */
export function decisionSummary(session: { id: string; title: string }, waiting: WaitingLike, decision: Decision): string {
  const subject = waiting.approval?.subject ?? "other";
  const summary = waiting.approval?.summary ?? "";
  return `Allow ${quotable(session.title) || "this session"} (${session.id}) to ${SUBJECT_VERBS[subject]}:\n\n${verbatim(summary)}\n\nDecision: ${DECISION_WORDS[decision]}`;
}
