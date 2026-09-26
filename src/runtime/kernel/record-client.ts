import type { BridgeErrorCode } from "../../domain/errors.ts";
import { isFileLike, isRecord, type RecordPurpose } from "../shared/protocol.ts";

/**
 * The kernel's side of the recorder: Dictate and the audio capture input ask
 * the shell — or, inside an embed, the page around it, which asks its own
 * shell — to open the recording bar, and hear back the transcript or the
 * file. The page never holds the microphone. spec R4.58, R4.24a, R4.51a, D38
 */
export type RecordAnswer =
  | { ok: true; text?: string; file?: File }
  | { ok: false; code: BridgeErrorCode | "cancelled"; message: string };

export interface RecordClient {
  /** `fromControl`: the reader pressed the kernel's own Dictate control (a trusted event). */
  request(purpose: RecordPurpose, prompt?: string, fromControl?: boolean): Promise<RecordAnswer>;
  /** A shell message; true when it was a recording's answer. */
  receive(data: Record<string, unknown>): boolean;
}

export function createRecordClient(post: (message: { kind: "thread-page:record"; id: string; purpose: RecordPurpose; prompt?: string; control?: true }) => boolean): RecordClient {
  const pending = new Map<string, (answer: RecordAnswer) => void>();
  let counter = 0;
  return {
    request(purpose, prompt, fromControl) {
      return new Promise<RecordAnswer>((resolve) => {
        counter += 1;
        const id = `tp-record-${counter}-${Math.random().toString(36).slice(2, 8)}`;
        pending.set(id, resolve);
        if (!post({ kind: "thread-page:record", id, purpose, ...(prompt ? { prompt } : {}), ...(fromControl === true && purpose === "dictate" ? { control: true as const } : {}) })) {
          pending.delete(id);
          resolve({ ok: false, code: "unavailable", message: "The page is not connected yet; try again in a moment." });
        }
      });
    },
    receive(data) {
      if (data.kind !== "thread-page:recorded" || typeof data.id !== "string") return false;
      const settle = pending.get(data.id);
      if (!settle) return true;
      pending.delete(data.id);
      if (data.ok === true) {
        settle({
          ok: true,
          ...(typeof data.text === "string" ? { text: data.text } : {}),
          ...(isFileLike(data.file) ? { file: data.file } : {}),
        });
      } else {
        settle({
          ok: false,
          code: (typeof data.code === "string" ? data.code : "unavailable") as BridgeErrorCode,
          message: typeof data.message === "string" ? data.message : "The recording failed",
        });
      }
      return true;
    },
  };
}

export function isRecordAsk(data: unknown): data is { kind: "thread-page:record"; id: string; purpose: RecordPurpose; prompt?: string } {
  return isRecord(data) && data.kind === "thread-page:record" && typeof data.id === "string" && (data.purpose === "dictate" || data.purpose === "audio");
}
