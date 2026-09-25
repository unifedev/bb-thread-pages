import type { VoiceParams } from "../../../domain/capabilities/specs.ts";
import { PageError, PUBLIC_MESSAGES } from "../../../domain/errors.ts";
import { handler } from "../handler.ts";

/**
 * `voice.captureAndTranscribe` on the server: every refusal that must come
 * before the bar opens — an offline copy, a host that cannot transcribe, no
 * service configured — and nothing else. The recording bar is the
 * confirmation, so the dispatcher hands the validated parameters to the
 * shell, which records, sends the audio to `/transcribe` and answers the page.
 * spec R5.68, R5.69, R5.74, D38
 */
export const voiceCaptureAndTranscribe = handler<VoiceParams, unknown>({
  method: "voice.captureAndTranscribe",
  confirmedBy: "recording-bar",
  async refuse(_params, { serving, page }) {
    if (page.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
    const status = await serving.voice.status();
    if (!status.available) throw new PageError("unavailable", status.reason);
  },
  async execute() {
    // Never reached: the dispatcher answers a recording-bar capability before it would run.
    throw new PageError("unavailable", "The recording is made in the page's top bar.");
  },
});
