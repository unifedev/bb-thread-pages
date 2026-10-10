// `record` requests and `recorded` answers for Dictate, audio capture inputs and `voice.captureAndTranscribe` (02 R4.58, R4.24a, R4.51a; 05 R3.32).
import type { BridgeErrorCode } from "../../domain/errors.ts";
import type { KernelMessage, RecordPurpose, ShellMessage } from "../shared/protocol.ts";

export type RecordAnswer = { ok: true; text?: string; file?: File; audio?: Blob } | { ok: false; code: BridgeErrorCode; message: string };

export interface RecordClient {
  /** `fromControl`: the reader pressed the kernel's own Dictate control (a trusted event). 05 R3.32b */
  request(purpose: RecordPurpose, options?: { prompt?: string; fromControl?: boolean }): Promise<RecordAnswer>;
  /** A shell message; true when it answered a recording. */
  receive(message: ShellMessage): boolean;
}

export function createRecordClient(send: (message: KernelMessage) => void, nextId: () => string): RecordClient {
  const pending = new Map<string, (answer: RecordAnswer) => void>();
  return {
    request(purpose, options = {}) {
      return new Promise<RecordAnswer>((resolve) => {
        const id = nextId();
        pending.set(id, resolve);
        send({ kind: "thread-page:record", id, purpose, ...(options.prompt ? { prompt: options.prompt } : {}), ...(options.fromControl === true && purpose === "dictate" ? { control: true as const } : {}) });
      });
    },
    receive(message) {
      if (!("kind" in message) || message.kind !== "thread-page:recorded") return false;
      const settle = pending.get(message.id);
      if (!settle) return true;
      pending.delete(message.id);
      if (message.ok) settle({ ok: true, ...(message.text !== undefined ? { text: message.text } : {}), ...(message.file ? { file: message.file } : {}), ...(message.audio ? { audio: message.audio } : {}) });
      else settle({ ok: false, code: message.code, message: message.message });
      return true;
    },
  };
}
