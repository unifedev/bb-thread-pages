// `voice.captureAndTranscribe` on the server: every refusal that must come before the bar opens — no transcriber, none configured, a surface that cannot record — and nothing else; the recording bar is the confirmation and the shell answers the page (03 R5.68, R5.69, R5.74; DESIGN §E.1 step 14).
import type { VoiceParams } from "../../../domain/capabilities/specs.ts";
import { PageError } from "../../../domain/errors.ts";
import { handler } from "../handler.ts";

export const voiceCaptureAndTranscribe = handler<VoiceParams, unknown>({
  method: "voice.captureAndTranscribe",
  confirmedBy: "recording-bar",
  async refuse(_params, context) {
    const voice = context.serving.provider.voice;
    if (!voice) throw new PageError("unavailable", "This host has no transcription; voice cannot be served here", { reason: "no_voice" });
    let status;
    try {
      status = await voice.status();
    } catch (error) {
      throw new PageError("unavailable", "The host's transcription is not answering", { cause: error, reason: "not_configured" });
    }
    if (!status.configured) throw new PageError("unavailable", "No transcription is configured on this host", { reason: "not_configured" });
    const surface = context.serving.serving.surface;
    if (surface) {
      const checked = await surface.call(context.serving.serving, context.request).catch(() => ({ canRecord: true }));
      if (!checked.canRecord) throw new PageError("unavailable", "This surface cannot record; open the page in a browser", { reason: "cannot_record" });
    }
  },
  async execute() {
    // Never reached: the dispatcher answers a recording-bar capability with the validated parameters before it would run.
    throw new PageError("unavailable", "The recording is made in the host's recording bar");
  },
});
