import type { Context } from "hono";
import { PageError, PUBLIC_MESSAGES } from "../domain/errors.ts";
import { LIMITS } from "../domain/limits.ts";
import type { SessionHost } from "../host/contract.ts";
import type { VoiceStatus } from "../host/types.ts";
import { shortenTranscript } from "../domain/submissions/parse.ts";
import { UPLOAD_DIR, isSafeUploadName } from "../pages/layout.ts";
import { acquireRate, readJsonBody, requireActionToken } from "./action-request.ts";
import { isBuiltinHome } from "./builtin-home.ts";
import type { ServingContext } from "./context.ts";
import { loadUnlessUnwritten } from "./empty-page.ts";
import { failureResponse, jsonResponse } from "./responses.ts";
import { eligibleSession } from "./session-access.ts";

/**
 * Voice on the server: whether the host can transcribe, and the one route the
 * shell sends a recording to. The page never reaches either — the route takes
 * the shell's action token — so a recording goes nowhere but the host's own
 * transcriber (R3.34). spec R5.68–R5.74, R8.35, D38
 */
export const NO_VOICE_HOST = "This host cannot transcribe voice.";
const STATUS_TTL_MS = 10_000;

export interface VoiceAvailability {
  /** The host's answer, reused for a few seconds so opening pages stays quick. */
  status(): Promise<VoiceStatus>;
}

export function createVoiceAvailability(host: SessionHost, now: () => number): VoiceAvailability {
  let cached: { at: number; value: Promise<VoiceStatus> } | null = null;
  return {
    status() {
      if (!host.voice) return Promise.resolve({ available: false, reason: NO_VOICE_HOST });
      const at = now();
      if (cached && at - cached.at < STATUS_TTL_MS) return cached.value;
      const value = host.voice.status().catch((): VoiceStatus => ({ available: false, reason: "The host cannot say whether voice transcription is set up right now." }));
      cached = { at, value };
      return value;
    },
  };
}

/** What the shell is told about voice when it is served. */
export async function voiceConfig(serving: ServingContext): Promise<{ available: boolean; reason: string | null }> {
  const status = await serving.voice.status();
  return status.available ? { available: true, reason: null } : { available: false, reason: status.reason };
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const LANGUAGE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const MEDIA_TYPE = /^(?:audio|video)\/[A-Za-z0-9.+-]{1,64}(?:\s*;.{0,160})?$/;

/**
 * `POST /transcribe` — one recording, base64 in a JSON envelope (the host's
 * "local" auth refuses raw bodies), or a file this page's form just uploaded
 * (`upload`), so a recorded answer does not cross the reader's connection
 * twice. Answers `{ ok: true, text }`. The shell calls it only after the
 * reader pressed Done in its bar, or while it delivers a form whose audio the
 * reader recorded or attached (R4.24b). spec R3.34, R5.70, R5.72
 */
export function transcribeRoute(serving: ServingContext) {
  const maxBody = Math.ceil((LIMITS.transcriptionBytes * 4) / 3) + 16_384;
  return async (context: Context): Promise<Response> => {
    let release: (() => void) | null = null;
    try {
      const body = await readJsonBody(context, maxBody);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PageError("invalid_request", "Invalid transcription envelope");
      const envelope = body as Record<string, unknown>;
      const token = requireActionToken(serving, envelope.actionToken);
      const home = isBuiltinHome(token.session);
      const keys = Object.keys(envelope);
      if (keys.some((key) => !["actionToken", "content", "upload", "mimeType", "prompt", "language"].includes(key))) throw new PageError("invalid_request", "Invalid transcription envelope");
      if ((envelope.content === undefined) === (envelope.upload === undefined)) throw new PageError("invalid_request", "Send either the recording or the upload it was stored as");
      const mimeType = envelope.mimeType;
      if (typeof mimeType !== "string" || !MEDIA_TYPE.test(mimeType)) throw new PageError("invalid_params", "That is not an audio recording");
      const prompt = envelope.prompt;
      if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > LIMITS.voicePromptChars)) throw new PageError("invalid_params", `The context must be at most ${LIMITS.voicePromptChars} characters`);
      const language = envelope.language;
      if (language !== undefined && (typeof language !== "string" || language.length > 35 || !LANGUAGE.test(language))) throw new PageError("invalid_params", "Invalid language tag");

      release = acquireRate(serving, token.session);
      if (!home) {
        await eligibleSession(serving, token.session);
        // An offline copy answers nothing, as every effect of the page. The revision is not
        // checked: a transcript delivers nothing, and a reader dictating is often on a page
        // the agent has since changed. spec R2.29
        const page = token.path ? await serving.pages.load(token.session, token.path) : await loadUnlessUnwritten(serving, token.session);
        if (page?.stale) throw new PageError("unavailable", PUBLIC_MESSAGES.staleCopy);
      }
      const status = await serving.voice.status();
      if (!serving.host.voice || !status.available) throw new PageError("unavailable", status.available ? NO_VOICE_HOST : status.reason);

      let bytes: Uint8Array;
      if (typeof envelope.upload === "string") {
        const path = envelope.upload;
        const name = path.startsWith(`${UPLOAD_DIR}/`) ? path.slice(UPLOAD_DIR.length + 1) : "";
        if (home || !isSafeUploadName(name)) throw new PageError("invalid_params", "That is not an upload of this page");
        const location = await serving.host.sessions.storage(token.session);
        const file = await serving.host.files.read(location, `${UPLOAD_DIR}/${name}`);
        if (!file) throw new PageError("not_found", "That upload is not there");
        bytes = file.bytes;
      } else {
        if (typeof envelope.content !== "string" || !BASE64.test(envelope.content)) throw new PageError("invalid_request", "The recording must be base64");
        bytes = Buffer.from(envelope.content, "base64");
      }
      if (bytes.byteLength === 0) throw new PageError("invalid_request", "The recording is empty");
      if (bytes.byteLength > LIMITS.transcriptionBytes) throw new PageError("request_too_large", "The recording is larger than this host can transcribe");

      const { text } = await serving.host.voice.transcribe({
        bytes,
        mimeType,
        ...(typeof prompt === "string" && prompt.trim() ? { prompt } : {}),
        ...(typeof language === "string" ? { language } : {}),
      });
      // A recorded answer's transcript is shortened where it goes (R4.24b); text for the page is bounded like any result.
      if (typeof envelope.upload === "string") return jsonResponse({ ok: true, text: shortenTranscript(text) });
      if (text.length > LIMITS.resultTextBytes) throw new PageError("response_too_large", "The transcript is too long");
      return jsonResponse({ ok: true, text });
    } catch (error) {
      return failureResponse(error, serving.host.log, "POST /transcribe", false);
    } finally {
      release?.();
    }
  };
}
