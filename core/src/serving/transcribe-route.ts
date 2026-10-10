// `POST /transcribe`: `provider.voice.transcribe` with the server ceiling (03 R5.72, R5.74; 05 R3.34; DESIGN §C.3, DR-1).
import { PageError, PUBLIC_MESSAGES, errorText } from "../domain/errors.ts";
import { HOME_IDENTITY } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import type { PagesRequest, PagesResponse } from "../host/serving.ts";
import { isTranscribeBody, type TranscribeResponse } from "../runtime/shared/envelopes.ts";
import { acquireBudget, requireActionToken } from "./action-request.ts";
import type { ServingContext } from "./context.ts";
import { failure, json } from "./responses.ts";
import { isJsonRecord, readBytesField, readJsonBody, requireReader } from "./request.ts";
import { loadUnlessUnwritten, requirePageSession } from "./session-access.ts";
import { NO_VOICE_HOST, VOICE_NOT_CONFIGURED, voiceStatus } from "./voice.ts";

const MEDIA_TYPE = /^(?:audio|video)\/[A-Za-z0-9.+-]{1,64}(?:\s*;.{0,160})?$/;
const LANGUAGE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

/**
 * One recording the shell made, base64 in a JSON envelope, to the host's own
 * transcriber and nowhere else; the shell calls it only after Done on its
 * bar. Refused over `transcriptionBytes` or the provider's own bound, and
 * `unavailable` where the host has no transcriber. 05 R3.34; 03 R5.70, R5.72
 */
export function transcribeRoute(ctx: ServingContext) {
  return async (request: PagesRequest): Promise<PagesResponse> => {
    let release: (() => void) | null = null;
    try {
      requireReader(request);
      const body = await readJsonBody(request, LIMITS.uploadBodyBytes);
      if (!isJsonRecord(body) || !isTranscribeBody(body, Number.MAX_SAFE_INTEGER)) throw new PageError("invalid_request", "Invalid transcription envelope");
      const token = requireActionToken(ctx, body.actionToken);
      if (!MEDIA_TYPE.test(body.type)) throw new PageError("invalid_params", "That is not an audio recording");
      if (body.prompt !== undefined && body.prompt.length > LIMITS.voicePromptChars) throw new PageError("invalid_params", `The context must be at most ${LIMITS.voicePromptChars} characters`);
      if (body.language !== undefined && !LANGUAGE.test(body.language)) throw new PageError("invalid_params", "Invalid language tag");
      release = acquireBudget(ctx, token);
      if (token.session !== HOME_IDENTITY) {
        const access = await ctx.sessionFor(token.session);
        requirePageSession(access);
        // An offline copy answers nothing; the revision is not checked, since a transcript delivers nothing. 05 R2.29
        const page = token.path ? await ctx.pages.load(token.session, token.path) : await loadUnlessUnwritten(ctx.pages, token.session);
        if (page?.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy, { reason: "offline" });
      }
      const voice = ctx.provider.voice;
      if (!voice) throw new PageError("unavailable", NO_VOICE_HOST);
      const status = await voiceStatus(ctx);
      if (!status?.configured) throw new PageError("unavailable", VOICE_NOT_CONFIGURED);
      const ceiling = Math.min(LIMITS.transcriptionBytes, status.limits.bytes);
      const bytes = readBytesField(body, "bytes", ceiling);
      if (bytes.byteLength === 0) throw new PageError("invalid_request", "The recording is empty");
      let text: string;
      try {
        ({ text } = await voice.transcribe({ bytes, mimeType: body.type, ...(body.prompt?.trim() ? { prompt: body.prompt } : {}), ...(body.language !== undefined ? { language: body.language } : {}) }));
      } catch (error) {
        ctx.log.warn(`transcribe: ${errorText(error)}`);
        throw new PageError("unavailable", "The recording could not be transcribed.", { cause: error });
      }
      if (text.length > LIMITS.resultTextBytes) throw new PageError("response_too_large", "The transcript is too long");
      const answer: TranscribeResponse = { ok: true, text };
      return json(200, answer);
    } catch (error) {
      return failure(error, ctx.log, "POST /transcribe", false);
    } finally {
      release?.();
    }
  };
}
