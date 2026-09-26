import { LIMITS } from "../../domain/limits.ts";
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { isRecord, type ShellConfig } from "../shared/protocol.ts";
import { encodeBase64 } from "./base64.ts";

/**
 * The shell's recorder and its recording bar. spec R3.30–R3.34, R5.68–R5.73,
 * R8.35, R8.37, DECISIONS D38
 *
 * Only the shell records: its own `Permissions-Policy` allows the microphone
 * to itself, the page frame is never given it. The bar is drawn in the shell's
 * chrome, where the page cannot draw, click or reword; it is the consent.
 * Nothing recorded leaves the reader's device until they press Done, and then
 * only to the host's transcriber, through this plugin's own route.
 *
 * The recorder copies bb's composer (`useVoiceInput.ts`): the first supported
 * of webm, mp4 and ogg; the type of the recorded chunk, not
 * `MediaRecorder.mimeType`, which Firefox leaves empty; 250 ms slices; bb's
 * preferred microphone; nothing under one second is sent.
 */
export interface RecorderElements {
  bar: HTMLElement;
  wave: HTMLCanvasElement;
  time: HTMLElement;
  status: HTMLElement;
  cancel: HTMLButtonElement;
  done: HTMLButtonElement;
}

export interface Recording {
  blob: Blob;
  /** The recording's type as its chunks carry it. */
  type: string;
  durationMs: number;
}

export type VoiceOutcome<T> = { ok: true; value: T } | { ok: false; code: BridgeErrorCode; message: string };

export interface CaptureOptions {
  maxDurationSeconds: number;
  /** Null when the reader had just acted in the page as the request arrived; otherwise why not. spec R3.32a */
  refusal: string | null;
  /** What the bar says it is for. */
  purpose: "capability" | "dictate" | "audio";
}

export interface Voice {
  /** Whether this reader can record here now: the host transcribes, and the surface can record. spec R4.59, R8.37 */
  usable(): Promise<boolean>;
  /** Called whenever that may have changed: a refused microphone, a permission change. */
  onChange(listener: (usable: boolean) => void): void;
  /** Whether the bar is open; it counts as a question. spec R3.32a */
  isOpen(): boolean;
  /**
   * Opens the bar, records, and on Done hands the recording to `work` while
   * the bar says so; resolves with its result, or why there is none.
   */
  capture<T>(options: CaptureOptions, work: (recording: Recording) => Promise<T>): Promise<VoiceOutcome<T>>;
  /** Cancels an open bar, as Cancel does: the page's document changed, or the reader pressed Escape in the page. */
  cancel(): void;
  /** Sends a recording, or an upload the page's form just stored, to the host's transcriber. */
  transcribe(input: { blob?: Blob; upload?: string; type: string; prompt?: string; language?: string }): Promise<string>;
}

export interface VoiceDeps {
  /** A confirmation dialog is open: the bar waits its turn. spec R3.22a */
  questionOpen(): boolean;
  /** Gives the keyboard back to the page when the bar closes. */
  restoreFocus(): void;
  /** Tells the reader, in the shell's status line, what went wrong. spec R2.44 */
  setStatus(text: string, warn: boolean): void;
  /** The bar closed; a new one waits a moment. spec R3.32a */
  onClosed?(): void;
  fetchImpl?: typeof fetch;
}

/** bb's own preference, on this same origin. */
export const PREFERRED_DEVICE_KEY = "bb.voiceInput.audioInputDeviceId";
const RECORDING_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];
const SLICE_MS = 250;
const TOO_SHORT_MS = 900;

export class VoiceFailure extends Error {
  readonly code: BridgeErrorCode;
  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function recordingType(win: Window & typeof globalThis): string | undefined {
  const recorder = (win as unknown as { MediaRecorder?: { isTypeSupported?(type: string): boolean } }).MediaRecorder;
  return RECORDING_TYPES.find((type) => {
    try {
      return recorder?.isTypeSupported?.(type) === true;
    } catch {
      return false;
    }
  });
}

/** The extension a recorded file is named with. */
export function recordingExtension(type: string): string {
  const base = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function createVoice(win: Window & typeof globalThis, config: ShellConfig, elements: RecorderElements, deps: VoiceDeps): Voice {
  const request = deps.fetchImpl ?? win.fetch.bind(win);
  const listeners: ((usable: boolean) => void)[] = [];
  /** The device was refused when the bar asked: no voice until the page is reloaded. spec R8.37 */
  let refused = false;
  let open = false;
  let watching = false;
  /** Cancels the open bar, when one is open and not already sending. */
  let cancelOpen: (() => void) | null = null;

  async function notify(): Promise<void> {
    const value = await usable();
    for (const listener of listeners) {
      try {
        listener(value);
      } catch {
        // One listener cannot stop the others.
      }
    }
  }

  /** Why the reader cannot record here, or null when they can. spec R8.37 */
  async function surfaceProblem(): Promise<string | null> {
    if (!config.voice.available) return config.voice.reason ?? "This host cannot transcribe voice.";
    if (refused) return "The microphone was not allowed. Reload the page to try again.";
    if (!win.isSecureContext) return "Recording needs a secure connection to this host.";
    const media = win.navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== "function" || typeof (win as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "function") {
      return "This browser cannot record here.";
    }
    try {
      const permission = await win.navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (permission && !watching) {
        watching = true;
        permission.onchange = () => void notify();
      }
      if (permission?.state === "denied") return "The microphone is blocked for this page.";
    } catch {
      // An engine that cannot answer the query does not count against recording.
    }
    return null;
  }

  async function usable(): Promise<boolean> {
    return (await surfaceProblem()) === null;
  }

  async function transcribe(input: { blob?: Blob; upload?: string; type: string; prompt?: string; language?: string }): Promise<string> {
    let response: Response;
    try {
      response = await request(config.transcribeUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken: config.actionToken,
          mimeType: input.type || "audio/webm",
          ...(input.blob ? { content: await encodeBase64(input.blob) } : { upload: input.upload }),
          ...(input.prompt ? { prompt: input.prompt.slice(-LIMITS.voicePromptChars) } : {}),
          ...(input.language ? { language: input.language } : {}),
        }),
      });
    } catch {
      throw new VoiceFailure("unavailable", "The host could not be reached to transcribe the recording");
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (response.ok && isRecord(body) && body.ok === true && typeof body.text === "string") return body.text;
    const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
    const message = isRecord(body) && typeof body.message === "string" && body.message ? body.message : `Transcription failed (${response.status})`;
    // Over the host's size limit is its own answer; every other failure is `unavailable`. spec R5.72
    throw new VoiceFailure(code === "request_too_large" ? "request_too_large" : code === "rate_limited" ? "rate_limited" : "unavailable", message);
  }

  async function openStream(): Promise<MediaStream> {
    const media = win.navigator.mediaDevices;
    let preferred: string | null = null;
    try {
      preferred = win.localStorage.getItem(PREFERRED_DEVICE_KEY);
    } catch {
      // No storage: the default microphone.
    }
    if (preferred) {
      try {
        return await media.getUserMedia({ audio: { deviceId: { exact: preferred } } });
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw error;
        // The preferred microphone is gone: the default one, as bb does.
      }
    }
    return media.getUserMedia({ audio: true });
  }

  const { bar, wave, time, status, cancel, done } = elements;

  function say(text: string): void {
    status.textContent = text;
  }

  function show(purpose: CaptureOptions["purpose"]): void {
    bar.hidden = false;
    bar.dataset.state = "starting";
    bar.dataset.purpose = purpose;
    time.textContent = "0:00";
    done.disabled = true;
    cancel.disabled = false;
    say("Starting the microphone…");
    // The bar takes the keyboard, so Escape reaches it wherever the reader was typing.
    try {
      bar.focus({ preventScroll: true });
    } catch {
      // Focus is a courtesy.
    }
  }

  function hide(): void {
    bar.hidden = true;
    bar.dataset.state = "";
    say("");
    const context = wave.getContext("2d");
    context?.clearRect(0, 0, wave.width, wave.height);
    deps.restoreFocus();
  }

  function capture<T>(options: CaptureOptions, work: (recording: Recording) => Promise<T>): Promise<VoiceOutcome<T>> {
    // One question at a time, only on the reader's action. spec R3.32a
    if (open || deps.questionOpen()) return Promise.resolve({ ok: false, code: "unavailable", message: "Another question is open in the top bar; answer it first." });
    if (options.refusal !== null) return Promise.resolve({ ok: false, code: "unavailable", message: options.refusal });
    open = true;
    return surfaceProblem().then((problem) => {
      if (problem) {
        open = false;
        return { ok: false, code: "unavailable", message: problem } as VoiceOutcome<T>;
      }
      if (deps.questionOpen()) {
        open = false;
        return { ok: false, code: "unavailable", message: "Another question is open in the top bar; answer it first." } as VoiceOutcome<T>;
      }
      return record(options, work);
    });
  }

  function record<T>(options: CaptureOptions, work: (recording: Recording) => Promise<T>): Promise<VoiceOutcome<T>> {
    return new Promise<VoiceOutcome<T>>((resolve) => {
      let stream: MediaStream | null = null;
      let recorder: MediaRecorder | null = null;
      let audio: AudioContext | null = null;
      let frame = 0;
      let ticker: ReturnType<typeof setInterval> | null = null;
      let cap: ReturnType<typeof setTimeout> | null = null;
      let wakeLock: { release(): Promise<void> } | null = null;
      const chunks: Blob[] = [];
      let chunkType = "";
      let startedAt = 0;
      let stoppedAt = 0;
      let stopped: Promise<void> | null = null;
      let finished = false;
      let busy = false;

      function release(): void {
        if (ticker !== null) clearInterval(ticker);
        if (cap !== null) clearTimeout(cap);
        ticker = null;
        cap = null;
        if (frame) win.cancelAnimationFrame?.(frame);
        frame = 0;
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch {
          // Already stopped.
        }
        for (const track of stream?.getTracks() ?? []) track.stop();
        stream = null;
        void audio?.close().catch(() => undefined);
        audio = null;
        void wakeLock?.release().catch(() => undefined);
        wakeLock = null;
      }

      function finish(outcome: VoiceOutcome<T>): void {
        if (finished) return;
        finished = true;
        release();
        win.removeEventListener("keydown", onKey, true);
        win.removeEventListener("pagehide", onCancel);
        cancel.removeEventListener("click", onCancel);
        done.removeEventListener("click", onDoneClick);
        open = false;
        cancelOpen = null;
        hide();
        deps.onClosed?.();
        if (!outcome.ok && outcome.code !== "cancelled") deps.setStatus(`Voice: ${outcome.message}`, true);
        resolve(outcome);
      }

      function onCancel(): void {
        if (busy) return;
        finish({ ok: false, code: "cancelled", message: "The reader cancelled the recording; nothing was sent." });
      }

      function onKey(event: KeyboardEvent): void {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel();
      }

      function draw(analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>): void {
        const context = wave.getContext("2d");
        if (!context) return;
        const width = wave.width;
        const height = wave.height;
        analyser.getByteTimeDomainData(samples);
        context.clearRect(0, 0, width, height);
        context.fillStyle = getComputedStyle(wave).color || "#315fc5";
        const bars = Math.max(8, Math.floor(width / 5));
        const step = Math.floor(samples.length / bars) || 1;
        for (let index = 0; index < bars; index += 1) {
          let peak = 0;
          for (let offset = 0; offset < step; offset += 1) peak = Math.max(peak, Math.abs((samples[index * step + offset] ?? 128) - 128));
          const level = Math.max(2, Math.min(height, (peak / 128) * height * 1.8));
          context.fillRect(index * 5, (height - level) / 2, 3, level);
        }
      }

      function animate(analyser: AnalyserNode): void {
        const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const loop = () => {
          if (finished || stoppedAt) return;
          draw(analyser, samples);
          frame = win.requestAnimationFrame(loop);
        };
        frame = win.requestAnimationFrame(loop);
      }

      /** Stops the recorder and waits for its last chunk. */
      function stop(): Promise<void> {
        if (stopped) return stopped;
        stoppedAt = stoppedAt || Date.now();
        if (ticker !== null) clearInterval(ticker);
        ticker = null;
        if (cap !== null) clearTimeout(cap);
        cap = null;
        stopped = new Promise<void>((settle) => {
          if (!recorder || recorder.state === "inactive") {
            settle();
            return;
          }
          recorder.addEventListener("stop", () => settle(), { once: true });
          try {
            recorder.stop();
          } catch {
            settle();
          }
        });
        for (const track of stream?.getTracks() ?? []) track.stop();
        return stopped;
      }

      async function onDone(): Promise<void> {
        if (busy || !startedAt) return;
        const elapsed = (stoppedAt || Date.now()) - startedAt;
        if (elapsed < LIMITS.voiceMinMs) {
          // Too short to send: the bar says so, and nothing leaves. spec R5.71
          busy = true;
          done.disabled = true;
          cancel.disabled = true;
          bar.dataset.state = "short";
          say("Too short");
          release();
          setTimeout(() => {
            busy = false;
            finish({ ok: false, code: "cancelled", message: `The recording was shorter than ${LIMITS.voiceMinMs / 1000} s, so nothing was sent.` });
          }, TOO_SHORT_MS);
          return;
        }
        busy = true;
        done.disabled = true;
        cancel.disabled = true;
        await stop();
        const type = chunkType || recorder?.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) {
          busy = false;
          finish({ ok: false, code: "unavailable", message: "Nothing was recorded. Check the microphone and try again." });
          return;
        }
        bar.dataset.state = "working";
        say(options.purpose === "audio" ? "Saving the recording…" : "Transcribing…");
        try {
          const value = await work({ blob, type, durationMs: elapsed });
          busy = false;
          finish({ ok: true, value });
        } catch (error) {
          busy = false;
          const code = error instanceof VoiceFailure ? error.code : "unavailable";
          finish({ ok: false, code, message: error instanceof Error && error.message ? error.message : "The recording could not be transcribed." });
        }
      }

      function onDoneClick(): void {
        void onDone();
      }

      cancelOpen = onCancel;
      show(options.purpose);
      win.addEventListener("keydown", onKey, true);
      win.addEventListener("pagehide", onCancel);
      cancel.addEventListener("click", onCancel);
      done.addEventListener("click", onDoneClick);

      openStream().then(
        (media) => {
          if (finished) {
            for (const track of media.getTracks()) track.stop();
            return;
          }
          stream = media;
          const type = recordingType(win);
          try {
            recorder = type ? new win.MediaRecorder(media, { mimeType: type }) : new win.MediaRecorder(media);
          } catch {
            finish({ ok: false, code: "unavailable", message: "This browser cannot record here." });
            return;
          }
          recorder.addEventListener("dataavailable", (event: BlobEvent) => {
            if (event.data && event.data.size > 0) {
              chunks.push(event.data);
              // Firefox leaves the recorder's own type empty; the chunk has it. spec R5.71
              if (!chunkType && event.data.type) chunkType = event.data.type;
            }
          });
          recorder.addEventListener("error", () => finish({ ok: false, code: "unavailable", message: "The recording failed." }));
          try {
            recorder.start(SLICE_MS);
          } catch {
            finish({ ok: false, code: "unavailable", message: "The recording could not start." });
            return;
          }
          startedAt = Date.now();
          bar.dataset.state = "recording";
          done.disabled = false;
          say("Recording. Press Done to send it, Cancel or Escape to discard it.");
          const limitMs = options.maxDurationSeconds * 1000;
          ticker = setInterval(() => {
            time.textContent = clock(Date.now() - startedAt);
          }, SLICE_MS);
          // At the cap the recorder stops; nothing leaves until Done. spec R5.70
          cap = setTimeout(() => {
            void stop().then(() => {
              if (finished) return;
              time.textContent = clock(limitMs);
              bar.dataset.state = "limit";
              say(`Reached ${clock(limitMs)}, the most for this recording. Done sends it; Cancel discards it.`);
            });
          }, limitMs);
          try {
            const Context = (win as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
              (win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Context) {
              audio = new Context();
              // An engine may create it suspended; the waveform needs it running.
              void audio.resume?.().catch(() => undefined);
              const analyser = audio.createAnalyser();
              analyser.fftSize = 512;
              audio.createMediaStreamSource(media).connect(analyser);
              animate(analyser);
            }
          } catch {
            // The waveform is a courtesy; the recording goes on without it.
          }
          const lock = (win.navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
          lock?.request("screen").then(
            (held) => {
              if (finished) void held.release().catch(() => undefined);
              else wakeLock = held;
            },
            () => undefined,
          );
        },
        (error: unknown) => {
          const name = (error as { name?: string }).name;
          if (name === "NotAllowedError" || name === "SecurityError") {
            // Refused where it looked possible: no voice here until the reader reloads. spec R8.37
            refused = true;
            void notify();
            finish({ ok: false, code: "unavailable", message: "The microphone was not allowed. Reload the page to try again." });
            return;
          }
          finish({ ok: false, code: "unavailable", message: name === "NotFoundError" ? "No microphone was found." : "The microphone could not be started." });
        },
      );
    });
  }

  return {
    usable,
    onChange(listener) {
      listeners.push(listener);
    },
    isOpen: () => open,
    capture,
    transcribe,
    cancel() {
      cancelOpen?.();
    },
  };
}
