// After an approved `sessions.start/send` (or an own `session.reply`) with files: `POST /attach` per file under the challenge, then the call (05 R3.20a; 03 R5.75–R5.79; DESIGN P29).
import { LIMITS, mebibytes } from "../../domain/limits.ts";
import type { AttachBody, AttachResponse } from "../shared/envelopes.ts";
import { isRecord, type ShellConfig } from "../shared/protocol.ts";
import { encodeBase64 } from "./base64.ts";

/** A file as the confirmation names it and the challenge binds it. 05 R3.20a */
export function describeFile(file: File): { name: string; size: number; type: string } {
  return { name: file.name || "file", size: file.size, type: file.type || "" };
}

export function filesProblem(files: readonly File[]): { code: "invalid_params" | "request_too_large"; message: string } | null {
  if (files.length > LIMITS.promptFiles) return { code: "request_too_large", message: `At most ${LIMITS.promptFiles} files per call; this one has ${files.length}` };
  const large = files.find((file) => file.size > LIMITS.promptFileBytes);
  if (large) return { code: "request_too_large", message: `“${large.name}” is larger than ${mebibytes(LIMITS.promptFileBytes)}, the most one file may be` };
  const empty = files.find((file) => file.size === 0);
  if (empty) return { code: "invalid_params", message: `“${empty.name}” is empty` };
  return null;
}

export type AttachOutcome = { ok: true; attachmentIds: string[] } | { ok: false; code: "request_too_large" | "handler_error" | "unavailable"; message: string };

/** Uploads exactly the approved files, in order; the first failure stops it, nothing is started or sent. 03 R5.79 */
export async function attachFiles(fetchImpl: typeof fetch, config: ShellConfig, call: { requestId: string; method: string; challenge?: string }, files: readonly File[], onStatus: (text: string) => void): Promise<AttachOutcome> {
  const attachmentIds: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    onStatus(`Attaching ${index + 1} of ${files.length}…`);
    let failure: { code: string; message: string } | null = null;
    try {
      const body: AttachBody = { actionToken: config.actionToken, requestId: call.requestId, method: call.method, ...(call.challenge ? { challenge: call.challenge } : {}), index, name: file.name || "file", type: file.type || "", bytes: await encodeBase64(file) };
      const response = await fetchImpl(config.routes.attach, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !isRecord(answer) || answer.ok !== true || typeof answer.attachmentId !== "string") failure = { code: isRecord(answer) && typeof answer.code === "string" ? answer.code : "", message: isRecord(answer) && typeof answer.message === "string" && answer.message ? answer.message : `Upload failed (${response.status})` };
      else attachmentIds.push((answer as unknown as Extract<AttachResponse, { ok: true }>).attachmentId);
    } catch (error) {
      failure = { code: "", message: error instanceof Error && error.message ? error.message : "Upload failed" };
    }
    if (failure) {
      onStatus("");
      const code = failure.code === "request_too_large" ? "request_too_large" : failure.code === "unavailable" ? "unavailable" : "handler_error";
      return { ok: false, code, message: `Could not attach “${file.name}”: ${failure.message.replace(/\.$/, "")}. Nothing was started or sent.` };
    }
  }
  onStatus("");
  return { ok: true, attachmentIds };
}
