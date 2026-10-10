// Voice availability as the shell is served (`provider.voice?.status()`, `serving.surface?`) (03 R5.69, R5.74; 06 R8.37).
import { errorText } from "../domain/errors.ts";
import type { PagesRequest } from "../host/serving.ts";
import type { ServingContext } from "./context.ts";

/** What a reader is told when this host has no transcriber. 03 R5.74 */
export const NO_VOICE_HOST = "This host cannot transcribe voice.";
export const VOICE_NOT_CONFIGURED = "Voice transcription is not set up on this host.";
export const SURFACE_CANNOT_RECORD = "This surface cannot record audio.";
const STATUS_TTL_MS = 10_000;

export interface VoiceAvailability {
  available: boolean;
  reason: string | null;
}

interface VoiceStatus {
  configured: boolean;
  limits: { bytes: number; seconds: number; attempts: number };
}

const statuses = new WeakMap<object, { at: number; value: Promise<VoiceStatus | null> }>();

/** The provider's voice status, reused for a few seconds per mount so opening pages stays quick. 03 R5.69 */
export function voiceStatus(ctx: Pick<ServingContext, "provider" | "now">): Promise<VoiceStatus | null> {
  const voice = ctx.provider.voice;
  if (!voice) return Promise.resolve(null);
  const at = ctx.now();
  const cached = statuses.get(ctx);
  if (cached && at - cached.at < STATUS_TTL_MS) return cached.value;
  const value = voice.status().catch((error: unknown): VoiceStatus | null => {
    ctx.provider.log.warn(`voice: status failed: ${errorText(error)}`);
    return null;
  });
  statuses.set(ctx, { at, value });
  return value;
}

/** Whether this reader, on this surface, can record and be transcribed now. 03 R5.69; 06 R8.37 */
export async function voiceAvailability(ctx: Pick<ServingContext, "provider" | "serving" | "now">, request: PagesRequest): Promise<VoiceAvailability> {
  if (!ctx.provider.voice) return { available: false, reason: NO_VOICE_HOST };
  const current = await voiceStatus(ctx);
  if (!current?.configured) return { available: false, reason: VOICE_NOT_CONFIGURED };
  if (ctx.serving.surface) {
    const surface = await ctx.serving.surface(request).catch(() => ({ canRecord: true }));
    if (!surface.canRecord) return { available: false, reason: SURFACE_CANNOT_RECORD };
  }
  return { available: true, reason: null };
}
