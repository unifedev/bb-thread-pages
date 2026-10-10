// system.config / system.transcribeVoice (DESIGN §B.9, D-bb-13). bb takes no language: a hint rides at the head
// of the context. `bytes` and `attempts` are bb's (the conservative of its two services); bb bounds no recording
// length, so `seconds` is the core's own bound restated, not a host fact (BB-12).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { LIMITS } from "../../core/src/index.ts";
import { ProviderError, type ProviderHost } from "../../core/src/host/index.ts";
import { asRecord, errorText, httpStatus } from "./errors.ts";

export const VOICE_LIMITS = { bytes: 20 * 1024 * 1024, seconds: LIMITS.voiceMaxSeconds, attempts: 2 } as const;

export function createBbVoice(bb: BbPluginApi): NonNullable<ProviderHost["voice"]> {
  return {
    async status() {
      const config = asRecord(await bb.sdk.system.config().catch(() => null));
      return { configured: config?.voiceTranscriptionEnabled === true, limits: { ...VOICE_LIMITS } };
    },
    async transcribe({ bytes, mimeType, prompt, language }) {
      const type = mimeType || "audio/webm";
      const file = new File([Buffer.from(bytes)], `voice-input.${extensionOf(type)}`, { type });
      const context = [language ? `Language: ${language}.` : "", prompt ?? ""].filter(Boolean).join("\n");
      let answer: unknown;
      try {
        answer = await bb.sdk.system.transcribeVoice({ file, ...(context ? { prompt: context } : {}) });
      } catch (error) {
        throw transcriptionError(error);
      }
      const text = asRecord(answer)?.text;
      return { text: typeof text === "string" ? text : "" };
    },
  };
}

/** bb's transcription failures, named by the tests: size, not configured, timeout, else unavailable. */
export function transcriptionError(error: unknown): ProviderError {
  const text = errorText(error);
  const status = httpStatus(error);
  if (status === 413 || /\bexceeds\b.*\blimit\b/i.test(text)) return new ProviderError("too_large", "voice.transcribe: the recording is larger than bb's transcription service accepts", undefined, { cause: error });
  if (status === 501 || /not_configured|No loaded plugin registers|requires OPENAI_API_KEY/i.test(text)) return new ProviderError("unavailable", "voice.transcribe: not configured", "not_configured", { cause: error });
  if (status === 504 || /timeout|timed out/i.test(text)) return new ProviderError("unavailable", "voice.transcribe: timed out", "timeout", { cause: error });
  return new ProviderError("unavailable", "voice.transcribe: bb could not transcribe", undefined, { cause: error });
}

export function extensionOf(mimeType: string): string {
  const type = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/aac") return "m4a";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/wav" || type === "audio/x-wav") return "wav";
  return "webm";
}
