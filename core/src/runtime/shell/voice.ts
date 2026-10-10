// The recording bar (waveform, Cancel, Done, armed mode, Too short), surface check (06 R8.37), `POST /transcribe` (05 R3.30–R3.34; 03 R5.68–R5.73).
import type { BridgeErrorCode } from "../../domain/errors.ts";
import { LIMITS } from "../../domain/limits.ts";
import type { TranscribeBody } from "../shared/envelopes.ts";
import { isRecord, type ShellConfig } from "../shared/protocol.ts";
import { encodeBase64 } from "./base64.ts";
import type { GestureDecision } from "./gesture.ts";

export interface RecorderElements {
  bar: HTMLElement;
  wave: HTMLCanvasElement;
  time: HTMLElement;
  status: HTMLElement;
  cancel: HTMLButtonElement;
  done: HTMLButtonElement;
  record: HTMLButtonElement;
}

export interface Recording {
  blob: Blob;
  type: string;
  durationMs: number;
}

export type VoiceOutcome<T> = { ok: true; value: T } | { ok: false; code: BridgeErrorCode; message: string };

export interface CaptureOptions {
  maxDurationSeconds: number;
  gesture: GestureDecision;
  purpose: "capability" | "dictate" | "audio";
}

export interface Voice {
  /** Whether this reader can record here now. 02 R4.59, 06 R8.37 */
  usable(): Promise<{ available: boolean; reason: string | null }>;
  onChange(listener: () => void): void;
  isOpen(): boolean;
  capture<T>(options: CaptureOptions, work: (recording: Recording) => Promise<T>): Promise<VoiceOutcome<T>>;
  cancel(): void;
  transcribe(input: { blob: Blob; type: string; prompt?: string; language?: string }): Promise<string>;
}

export interface VoiceDeps {
  questionOpen(): boolean;
  restoreFocus(): void;
  setStatus(text: string): void;
  onClosed?(): void;
  fetchImpl: typeof fetch;
}

const RECORDING_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];
const TOO_SHORT_MS = 900;
export const ANOTHER_QUESTION = "Another question is open; answer it first.";

export class VoiceFailure extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceFailure";
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

/** Builds the bar's controls inside the shell's `tp-recorder` element. DESIGN §F.2 */
export function buildRecorder(bar: HTMLElement): RecorderElements {
  const doc = bar.ownerDocument;
  const wave = doc.createElement("canvas");
  wave.width = 160;
  wave.height = 28;
  const time = doc.createElement("span");
  time.setAttribute("data-tp", "rec-time");
  const status = doc.createElement("span");
  status.setAttribute("data-tp", "rec-status");
  status.setAttribute("role", "status");
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.setAttribute("data-tp", "rec-cancel");
  const record = doc.createElement("button");
  record.type = "button";
  record.textContent = "Record";
  record.setAttribute("data-tp", "rec-record");
  const done = doc.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.setAttribute("data-tp", "rec-done");
  bar.replaceChildren(wave, time, status, cancel, record, done);
  bar.hidden = true;
  bar.tabIndex = -1;
  return { bar, wave, time, status, cancel, done, record };
}

export function createVoice(win: Window & typeof globalThis, config: ShellConfig, elements: RecorderElements, deps: VoiceDeps): Voice {
  const listeners: (() => void)[] = [];
  let refused = false;
  let open = false;
  let watching = false;
  let cancelOpen: (() => void) | null = null;
  const { bar, wave, time, status, cancel, done, record: recordButton } = elements;

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One listener cannot stop the others.
      }
    }
  }

  /** Why the reader cannot record here, or null. 06 R8.37 */
  async function surfaceProblem(): Promise<string | null> {
    if (!config.voice.available) return config.voice.reason ?? "This host cannot transcribe voice.";
    if (refused) return "The microphone was not allowed. Reload the page to try again.";
    if (!win.isSecureContext) return "Recording needs a secure connection to this host.";
    const media = win.navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== "function" || typeof (win as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "function") return "This browser cannot record here.";
    try {
      const permission = await win.navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (permission && !watching) {
        watching = true;
        permission.onchange = () => notify();
      }
      if (permission?.state === "denied") return "The microphone is blocked for this page.";
    } catch {
      // An engine that cannot answer the query does not count against recording.
    }
    return null;
  }

  async function transcribe(input: { blob: Blob; type: string; prompt?: string; language?: string }): Promise<string> {
    let response: Response;
    try {
      const body: TranscribeBody = { actionToken: config.actionToken, type: input.type || "audio/webm", bytes: await encodeBase64(input.blob), ...(input.prompt ? { prompt: input.prompt.slice(-LIMITS.voicePromptChars) } : {}), ...(input.language ? { language: input.language } : {}) };
      response = await deps.fetchImpl(config.routes.transcribe, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      throw new VoiceFailure("unavailable", "The host could not be reached to transcribe the recording");
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (response.ok && isRecord(body) && body.ok === true && typeof body.text === "string") return body.text;
    const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
    const message = isRecord(body) && typeof body.message === "string" && body.message ? body.message : `Transcription failed (${response.status})`;
    throw new VoiceFailure(code === "request_too_large" ? "request_too_large" : code === "rate_limited" ? "rate_limited" : "unavailable", message);
  }

  async function openStream(): Promise<MediaStream> {
    const media = win.navigator.mediaDevices;
    if (config.voice.deviceId) {
      try {
        return await media.getUserMedia({ audio: { deviceId: { exact: config.voice.deviceId } } });
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw error;
      }
    }
    return media.getUserMedia({ audio: true });
  }

  function say(text: string): void {
    status.textContent = text;
  }

  function show(purpose: CaptureOptions["purpose"]): void {
    bar.hidden = false;
    bar.dataset.state = "starting";
    bar.dataset.purpose = purpose;
    time.textContent = "0:00";
    done.disabled = true;
    done.hidden = false;
    recordButton.hidden = true;
    cancel.disabled = false;
    say("Starting the microphone…");
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
    wave.getContext?.("2d")?.clearRect(0, 0, wave.width, wave.height);
    deps.restoreFocus();
  }

  function capture<T>(options: CaptureOptions, work: (recording: Recording) => Promise<T>): Promise<VoiceOutcome<T>> {
    // One question at a time, only on the reader's action. 05 R3.32a
    if (open || deps.questionOpen()) return Promise.resolve({ ok: false, code: "unavailable", message: ANOTHER_QUESTION });
    if (options.gesture.mode === "refuse") return Promise.resolve({ ok: false, code: "unavailable", message: options.gesture.reason });
    open = true;
    return surfaceProblem().then((problem) => {
      if (problem || deps.questionOpen()) {
        open = false;
        return { ok: false, code: "unavailable", message: problem ?? ANOTHER_QUESTION } as VoiceOutcome<T>;
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
      const chunks: Blob[] = [];
      let chunkType = "";
      let startedAt = 0;
      let stoppedAt = 0;
      let stopped: Promise<void> | null = null;
      let finished = false;
      let busy = false;
      let disarm: (() => void) | null = null;

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
      }

      function finish(outcome: VoiceOutcome<T>): void {
        if (finished) return;
        finished = true;
        release();
        win.removeEventListener("keydown", onKey, true);
        win.removeEventListener("pagehide", onCancel);
        cancel.removeEventListener("click", onCancel);
        done.removeEventListener("click", onDoneClick);
        disarm?.();
        recordButton.hidden = true;
        done.hidden = false;
        open = false;
        cancelOpen = null;
        hide();
        deps.onClosed?.();
        if (!outcome.ok && outcome.code !== "cancelled") deps.setStatus(`Voice: ${outcome.message}`);
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

      function animate(analyser: AnalyserNode): void {
        const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const context = wave.getContext?.("2d");
        const loop = () => {
          if (finished || stoppedAt || !context) return;
          analyser.getByteTimeDomainData(samples);
          const { width, height } = wave;
          context.clearRect(0, 0, width, height);
          context.fillStyle = "currentColor";
          const bars = Math.max(8, Math.floor(width / 5));
          const step = Math.floor(samples.length / bars) || 1;
          for (let index = 0; index < bars; index += 1) {
            let peak = 0;
            for (let offset = 0; offset < step; offset += 1) peak = Math.max(peak, Math.abs((samples[index * step + offset] ?? 128) - 128));
            const level = Math.max(2, Math.min(height, (peak / 128) * height * 1.8));
            context.fillRect(index * 5, (height - level) / 2, 3, level);
          }
          frame = win.requestAnimationFrame(loop);
        };
        frame = win.requestAnimationFrame(loop);
      }

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
          // Too short to send: the bar says so, and nothing leaves. 03 R5.71
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
          finish({ ok: false, code: error instanceof VoiceFailure ? error.code : "unavailable", message: error instanceof Error && error.message ? error.message : "The recording could not be transcribed." });
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

      function begin(): void {
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
                if (!chunkType && event.data.type) chunkType = event.data.type;
              }
            });
            recorder.addEventListener("error", () => finish({ ok: false, code: "unavailable", message: "The recording failed." }));
            try {
              recorder.start(LIMITS.recorderSliceMs);
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
            }, LIMITS.recorderSliceMs);
            cap = setTimeout(() => {
              void stop().then(() => {
                if (finished) return;
                time.textContent = clock(limitMs);
                bar.dataset.state = "limit";
                say(`Reached ${clock(limitMs)}, the most for this recording. Done sends it; Cancel discards it.`);
              });
            }, limitMs);
            try {
              const Context = (win as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (Context) {
                audio = new Context();
                void audio.resume?.().catch(() => undefined);
                const analyser = audio.createAnalyser();
                analyser.fftSize = 512;
                audio.createMediaStreamSource(media).connect(analyser);
                animate(analyser);
              }
            } catch {
              // The waveform is a courtesy.
            }
          },
          (error: unknown) => {
            const name = (error as { name?: string }).name;
            if (name === "NotAllowedError" || name === "SecurityError") {
              refused = true;
              notify();
              finish({ ok: false, code: "unavailable", message: "The microphone was not allowed. Reload the page to try again." });
              return;
            }
            finish({ ok: false, code: "unavailable", message: name === "NotFoundError" ? "No microphone was found." : "The microphone could not be started." });
          },
        );
      }

      if (options.gesture.mode === "arm") {
        // The microphone stays off until the reader presses Record in the shell's own chrome. 05 R3.32b
        const armedAt = Date.now();
        bar.dataset.state = "armed";
        done.hidden = true;
        recordButton.hidden = false;
        say("Press Record to start recording, or Cancel.");
        const onRecord = (event: Event) => {
          if (!event.isTrusted || finished || Date.now() - armedAt < LIMITS.confirmArmMs) return;
          recordButton.removeEventListener("click", onRecord);
          recordButton.hidden = true;
          done.hidden = false;
          bar.dataset.state = "starting";
          say("Starting the microphone…");
          begin();
        };
        recordButton.addEventListener("click", onRecord);
        disarm = () => recordButton.removeEventListener("click", onRecord);
      } else begin();
    });
  }

  return {
    async usable() {
      const problem = await surfaceProblem();
      return { available: problem === null, reason: problem };
    },
    onChange(listener) {
      listeners.push(listener);
    },
    isOpen: () => open,
    capture,
    cancel() {
      cancelOpen?.();
    },
    transcribe,
  };
}
