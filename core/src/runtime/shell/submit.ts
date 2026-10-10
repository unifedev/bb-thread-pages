// `submit` → uploads (`POST /upload`) → transcripts (`POST /transcribe`) → `POST /submit` with `writtenAgainst`, `formId`, `formTitle`; progress and result messages; draft cleared on `ok` (02 R4.20–R4.24b, R-K6; DESIGN §C.3).
import { shortenTranscript } from "../../domain/submissions/parse.ts";
import type { SubmitBody, UploadBody } from "../shared/envelopes.ts";
import { isBridgeErrorCode } from "../../domain/errors.ts";
import { isRecord, type KernelMessage, type ShellConfig, type ShellMessage, type SubmitFile } from "../shared/protocol.ts";
import { encodeBase64 } from "./base64.ts";
import type { Voice } from "./voice.ts";

export type SubmitMessage = Extract<KernelMessage, { kind: "thread-page:submit" }>;

export interface SubmitDeps {
  config: ShellConfig;
  /** The token of the frame the submission came from. */
  token(): string;
  fetchImpl: typeof fetch;
  voice: Voice | null;
  /** The answer went: the poll quickens. 05 R2.17a */
  onAnswered(): void;
}

interface StoredFile {
  field: string;
  name: string;
  path: string;
  sizeBytes: number;
  transcript?: string | null;
}

async function uploadOne(deps: SubmitDeps, entry: SubmitFile): Promise<StoredFile> {
  const file = entry.file;
  const label = file.name || "file";
  if (file.size <= 0) throw new Error(`“${label}” is empty`);
  if (file.size > deps.config.maxUploadBytes) throw new Error(`“${label}” is larger than ${Math.round(deps.config.maxUploadBytes / (1024 * 1024))} MiB`);
  const body: UploadBody = { actionToken: deps.token(), field: String(entry.field || "file").slice(0, 128), name: label.slice(0, 255), type: file.type || "application/octet-stream", bytes: await encodeBase64(file) };
  const response = await deps.fetchImpl(deps.config.routes.upload, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !isRecord(answer) || answer.ok !== true || typeof answer.name !== "string" || typeof answer.path !== "string" || typeof answer.sizeBytes !== "number") {
    throw new Error((isRecord(answer) && typeof answer.message === "string" && answer.message) || `Upload failed (${response.status})`);
  }
  return { field: body.field, name: answer.name, path: answer.path, sizeBytes: answer.sizeBytes };
}

/** Uploads first, transcripts next, then the submission referencing them; a partial failure fails visibly. 02 R4.20, R4.24b */
export async function relaySubmit(deps: SubmitDeps, post: (message: ShellMessage) => void, message: SubmitMessage): Promise<void> {
  const { submissionId } = message;
  try {
    const entries = message.files;
    if (entries.length > deps.config.maxUploads) throw new Error(`This form has ${entries.length} files; at most ${deps.config.maxUploads} can be sent at once`);
    const files: StoredFile[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      post({ kind: "thread-page:submit-progress", submissionId, message: `Uploading ${index + 1} of ${entries.length}…` });
      files.push(await uploadOne(deps, entries[index]!));
    }
    // Only audio the kernel marked goes to the transcriber; a missing transcript never fails the answer. 02 R4.24b; 05 R3.34
    const recordings = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.transcribe === true && /^audio\//i.test(entry.file.type ?? ""));
    for (let turn = 0; turn < recordings.length; turn += 1) {
      const { entry, index } = recordings[turn]!;
      post({ kind: "thread-page:submit-progress", submissionId, message: `Transcribing ${turn + 1} of ${recordings.length}…` });
      const text = deps.voice && deps.config.voice.available ? await deps.voice.transcribe({ blob: entry.file, type: entry.file.type }).catch(() => null) : null;
      files[index]!.transcript = text === null ? null : shortenTranscript(text);
    }
    if (files.length > 0) post({ kind: "thread-page:submit-progress", submissionId, message: "Sending…" });
    const body: SubmitBody = { actionToken: deps.token(), submissionId, writtenAgainst: message.writtenAgainst, formId: message.formId, formTitle: message.formTitle, title: message.title, action: message.action, answers: message.answers, files };
    const response = await deps.fetchImpl(deps.config.routes.submit, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && isRecord(answer) && answer.ok === true) {
      deps.onAnswered();
      const delivery = answer.delivery === "queued" || answer.delivery === "steered" ? answer.delivery : "started";
      post({ kind: "thread-page:submit-result", submissionId, ok: true, delivery, ...(typeof answer.matchedRevision === "string" ? { matchedRevision: answer.matchedRevision } : {}), revisionChanged: answer.revisionChanged === true });
      return;
    }
    const code = isRecord(answer) && isBridgeErrorCode(answer.code) ? answer.code : "unavailable";
    post({ kind: "thread-page:submit-result", submissionId, ok: false, error: code, message: ((isRecord(answer) && typeof answer.message === "string" && answer.message) || `Request failed (${response.status})`).slice(0, 512) });
  } catch (error) {
    post({ kind: "thread-page:submit-result", submissionId, ok: false, error: "unavailable", message: (error instanceof Error && error.message ? error.message : "Request failed").slice(0, 512) });
  }
}
