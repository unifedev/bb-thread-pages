// threads.events.list (`item/started`, `item/completed`) → ActivityItem[], newest last (DESIGN §B.1 `activity`).
// Re-derived from 1.9.0 `activity.ts:52–84`: the per-item `presentation.title` is preferred (S2); text is passed
// whole, the core bounds it.
import type { ActivityItem } from "../../core/src/host/index.ts";
import { asRecord } from "./errors.ts";

const FALLBACK_LABELS: Record<string, readonly [string, string]> = {
  agentMessage: ["Writing", "Wrote"],
  reasoning: ["Thinking", "Thought"],
  commandExecution: ["Running", "Ran"],
  toolCall: ["Calling", "Called"],
  fileChange: ["Editing", "Edited"],
  delegation: ["Delegating", "Delegated"],
  webSearch: ["Searching", "Searched"],
};

export function activityItemsOf(events: readonly unknown[], limit: number): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const raw of events) {
    const event = asRecord(raw);
    if (!event || (event.type !== "item/started" && event.type !== "item/completed")) continue;
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
    const detail = presentation?.title ?? item.command ?? item.text ?? item.description ?? item.name ?? "";
    const atMs = typeof event.createdAt === "number" && Number.isFinite(event.createdAt) ? Math.max(0, Math.trunc(event.createdAt)) : 0;
    out.push({
      kind: item.type.slice(0, 80),
      done,
      atMs,
      label: label.trim().slice(0, 80) || (done ? "Completed" : "Working"),
      text: String(detail).replace(/\s+/g, " ").trim(),
    });
  }
  out.reverse();
  return out.slice(-limit);
}
