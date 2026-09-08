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
