// Bounds a `Message` row: `messageTextChars`, `toolInputBytes`, `toolResultBytes`, sets `truncated`; fits a response under `messagesResponseBytes` by halving the largest rows, never dropping one (03 R-C1, R-C3).
import { utf8Bytes } from "../json/strict-json.ts";
import { LIMITS } from "../limits.ts";

/** The parts of a transcript row the server bounds; the rest passes through. 03 §`session.messages` */
export interface BoundableRow {
  text?: string;
  tool?: { name: string; input: unknown; result?: unknown; isError?: boolean };
  truncated?: true;
  [key: string]: unknown;
}

const MIN_CHARS = 64;

function cutText(text: string, max: number): { text: string; cut: boolean } {
  return text.length <= max ? { text, cut: false } : { text: `${text.slice(0, Math.max(0, max - 1))}…`, cut: true };
}

/** A tool payload within its byte bound: a string cut; anything else replaced by its cut JSON string. 03 R-C3 */
function cutPayload(value: unknown, maxBytes: number): { value: unknown; cut: boolean } {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "null");
  if (utf8Bytes(text) <= maxBytes) return { value, cut: false };
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && utf8Bytes(text.slice(0, end)) > maxBytes - 1) end -= Math.max(1, Math.floor(end / 16));
  return { value: `${text.slice(0, Math.max(0, end))}…`, cut: true };
}

/** One row within its per-row bounds, marked when cut. 03 R-C1, R-C3 */
export function boundRow<T extends BoundableRow>(row: T): T {
  let truncated = row.truncated === true;
  const out: BoundableRow = { ...row };
  if (typeof out.text === "string") {
    const text = cutText(out.text, LIMITS.messageTextChars);
    out.text = text.text;
    truncated = truncated || text.cut;
  }
  if (out.tool) {
    const input = cutPayload(out.tool.input, LIMITS.toolInputBytes);
    const tool = { ...out.tool, input: input.value };
    truncated = truncated || input.cut;
    if (out.tool.result !== undefined) {
      const result = cutPayload(out.tool.result, LIMITS.toolResultBytes);
      tool.result = result.value;
      truncated = truncated || result.cut;
    }
    out.tool = tool;
  }
  if (truncated) out.truncated = true;
  else delete out.truncated;
  return out as T;
}

function rowBytes(row: BoundableRow): number {
  return utf8Bytes(JSON.stringify(row));
}

function halve(text: string): string {
  const target = Math.max(MIN_CHARS, Math.floor(text.length / 2));
  return text.length <= MIN_CHARS ? text : `${text.slice(0, target - 1)}…`;
}

/**
 * Every row within its bounds, and the whole set within `messagesResponseBytes`
 * less `envelopeBytes`: while over, the largest row's `text`, `tool.input` and
 * `tool.result` are halved (each to at least 64 characters) and the row
 * marked, repeated until it fits. A row is cut and marked, never dropped.
 * 03 R-C1; DESIGN P20
 */
export function boundRows<T extends BoundableRow>(rows: readonly T[], envelopeBytes = 256): T[] {
  const out = rows.map((row) => boundRow(row));
  const budget = LIMITS.messagesResponseBytes - envelopeBytes;
  let total = utf8Bytes(JSON.stringify(out));
  while (total > budget) {
    let largest = -1;
    let largestBytes = -1;
    for (let index = 0; index < out.length; index += 1) {
      const bytes = rowBytes(out[index]!);
      if (bytes > largestBytes) {
        largest = index;
        largestBytes = bytes;
      }
    }
    if (largest < 0) break;
    const row: BoundableRow = { ...out[largest]! };
    const before = rowBytes(row);
    if (typeof row.text === "string") row.text = halve(row.text);
    if (row.tool) {
      const tool = { ...row.tool };
      if (typeof tool.input === "string") tool.input = halve(tool.input);
      else if (tool.input !== undefined) tool.input = halve(JSON.stringify(tool.input) ?? "null");
      if (typeof tool.result === "string") tool.result = halve(tool.result);
      else if (tool.result !== undefined) tool.result = halve(JSON.stringify(tool.result) ?? "null");
      row.tool = tool;
    }
    row.truncated = true;
    const after = rowBytes(row);
    out[largest] = row as T;
    if (after >= before) break;
    total = utf8Bytes(JSON.stringify(out));
  }
  return out;
}
