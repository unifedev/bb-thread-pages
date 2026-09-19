import type { SessionState } from "../domain/capabilities/specs.ts";
import type { ActivityItem } from "../host/types.ts";

/**
 * bb's thread vocabulary → the product's session state. RW-6
 *
 *   active, starting, provisioning, stopping → working
 *   error                                    → failed
 *   a pending interaction                    → waiting
 *   everything else                          → idle
 */
/**
 * The question a waiting thread waits on, from its pending interactions:
 * a question's prompts, or the title of a request or approval. Plain text,
 * bounded, marked when cut; null when there is nothing to show. spec R5.11c
 */
export function questionOf(interactions: readonly unknown[], maxChars: number): string | null {
  const parts: string[] = [];
  for (const raw of interactions) {
    const payload = asRecord(asRecord(raw)?.payload);
    if (!payload) continue;
    if (payload.kind === "user_question" && Array.isArray(payload.questions)) {
      for (const question of payload.questions) {
        const prompt = asRecord(question)?.prompt;
        if (typeof prompt === "string" && prompt.trim()) parts.push(prompt.trim());
      }
    } else if (typeof payload.title === "string" && payload.title.trim()) {
      parts.push(payload.title.trim());
    } else if (payload.kind === "approval") {
      parts.push(typeof payload.reason === "string" && payload.reason.trim() ? `Approval requested: ${payload.reason.trim()}` : "Approval requested");
    }
  }
  const text = parts.join("\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  if (!text) return null;
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function sessionStateOf(thread: { status?: unknown; runtime?: unknown }, hasPendingInteraction: boolean): SessionState {
  const runtime = asRecord(thread.runtime);
  const display = typeof runtime?.displayStatus === "string" ? runtime.displayStatus : typeof thread.status === "string" ? thread.status : "idle";
  if (["active", "starting", "provisioning", "stopping"].includes(display)) return "working";
  if (display === "error") return "failed";
  if (hasPendingInteraction) return "waiting";
  return "idle";
}

const FALLBACK_LABELS: Record<string, readonly [string, string]> = {
  agentMessage: ["Writing", "Wrote"],
  reasoning: ["Thinking", "Thought"],
};

/** Thread events (`item/started`, `item/completed`) → presented activity, newest last. */
export function activityItemsOf(events: readonly unknown[], limit: number): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const raw of events) {
    const event = asRecord(raw);
    if (!event) continue;
    if (event.type !== "item/started" && event.type !== "item/completed") continue;
    const done = event.type === "item/completed";
    const data = asRecord(event.data);
    const item = asRecord(data?.item) ?? data;
    if (!item || typeof item.type !== "string") continue;
    const presentation = asRecord(item.presentation);
    const labels = asRecord(presentation?.label);
    const presented = labels?.[done ? "completed" : "pending"];
    const fallback = FALLBACK_LABELS[item.type];
    const label = typeof presented === "string" ? presented : fallback ? fallback[done ? 1 : 0] : null;
    if (!label) continue;
    const detail = presentation?.title ?? item.command ?? item.text ?? item.name ?? "";
    const atMs = typeof event.createdAt === "number" && Number.isFinite(event.createdAt) ? Math.max(0, Math.trunc(event.createdAt)) : 0;
    out.push({
      kind: item.type.slice(0, 80),
      done,
      atMs,
      label: label.trim().slice(0, 80) || (done ? "Completed" : "Working"),
      text: String(detail).replace(/\s+/g, " ").trim().slice(0, 200),
    });
  }
  out.reverse();
  return out.slice(-limit);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
