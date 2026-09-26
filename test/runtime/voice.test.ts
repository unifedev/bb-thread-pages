// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { createConfirmer } from "../../src/runtime/shell/confirm.ts";
import { createReaderGesture, type GestureDecision } from "../../src/runtime/shell/gesture.ts";
import { createRelay } from "../../src/runtime/shell/relay.ts";
import { createVoice, PREFERRED_DEVICE_KEY, VoiceFailure, type RecorderElements, type Voice } from "../../src/runtime/shell/voice.ts";
import type { ShellConfig } from "../../src/runtime/shared/protocol.ts";

/**
 * The shell's recorder and its bar, and what the relay does with it: the
 * voice capability, Dictate and the audio input, recorded answers, and files
 * with sessions.start and sessions.send. spec R3.32, R3.32a, R5.68–R5.79, D38–D40
 */
const REV = "1".repeat(64);
const RECORD = { mode: "record" } as const;
const config: ShellConfig = {
  actionToken: "tok",
  pageRevision: REV,
  expiresAt: Date.now() + 3_600_000,
  documentUrl: "/document?session=thr_a",
  submitUrl: "/submit",
  uploadUrl: "/upload",
  bridgeUrl: "/bridge",
  chromeActionUrl: "/chrome-action",
  workingLabel: "Working",
  stale: false,
  empty: false,
  notice: null,
  documentPath: "index.html",
  documentSessionUrl: "/document-session",
  navigable: true,
  filesUrl: "/files/",
  deferredFiles: [],
  pollMs: 10_000,
  pollWorkingMs: 2_000,
  pollAfterAnswerMs: 60_000,
  working: false,
  refreshSwapMs: 4_000,
  grants: [],
  maxUploadBytes: 1024,
  maxUploads: 8,
  voice: { available: true, reason: null },
  transcribeUrl: "/transcribe",
  attachUrl: "/attach",
};

const flush = async (times = 4) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
});

// --- the recorder ---------------------------------------------------------------

class FakeRecorder extends EventTarget {
  static created: FakeRecorder[] = [];
  static isTypeSupported(type: string) {
    // Firefox's answer: no mp4. ogg comes after webm in bb's order, so webm is chosen when supported.
    return type === "audio/ogg";
  }
  state: "inactive" | "recording" = "inactive";
  // Firefox leaves this empty; the chunk carries the type. spec R5.71
  mimeType = "";
  slice = 0;
  constructor(
    readonly stream: unknown,
    readonly options?: { mimeType?: string },
  ) {
    super();
    FakeRecorder.created.push(this);
  }
  start(slice: number) {
    this.state = "recording";
    this.slice = slice;
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob(["ogg-bytes"], { type: "audio/ogg; codecs=opus" }) }));
    this.dispatchEvent(new Event("stop"));
  }
}

function recorderFixture(options: { activation?: boolean; permission?: string; getUserMedia?: (constraints: unknown) => Promise<unknown>; available?: boolean } = {}) {
  document.body.innerHTML = `<section data-shell-recorder hidden tabindex="-1"><canvas></canvas><span data-rec-time></span><span data-rec-status></span><button data-rec="cancel">Cancel</button><button data-rec="record" hidden>Record</button><button data-rec="done">Done</button></section>`;
  const bar = document.querySelector<HTMLElement>("[data-shell-recorder]")!;
  const elements: RecorderElements = {
    bar,
    wave: bar.querySelector("canvas")!,
    time: bar.querySelector("[data-rec-time]")!,
    status: bar.querySelector("[data-rec-status]")!,
    cancel: bar.querySelector('[data-rec="cancel"]')!,
    done: bar.querySelector('[data-rec="done"]')!,
    record: bar.querySelector('[data-rec="record"]')!,
  };
  const tracks = [{ stop: vi.fn() }];
  const getUserMedia = vi.fn(options.getUserMedia ?? (async () => ({ getTracks: () => tracks })));
  const events = new EventTarget();
  const win = {
    isSecureContext: true,
    navigator: {
      mediaDevices: { getUserMedia },
      permissions: { query: async () => ({ state: options.permission ?? "prompt", onchange: null }) },
      userActivation: { isActive: options.activation ?? true },
    },
    MediaRecorder: FakeRecorder,
    localStorage: window.localStorage,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    fetch: vi.fn(),
  } as unknown as Window & typeof globalThis;
  const deps = { questionOpen: vi.fn(() => false), restoreFocus: vi.fn(), setStatus: vi.fn(), fetchImpl: vi.fn() as unknown as typeof fetch };
  const voice = createVoice(win, { ...config, voice: { available: options.available ?? true, reason: options.available === false ? "Voice transcription is not set up on this bb." : null } }, elements, deps);
  return { voice, elements, deps, getUserMedia, tracks, events };
}

describe("the recording bar (R3.32, R3.32a, R5.68–R5.71, R8.37)", () => {
  it("opens only on the reader's activation, one at a time, and never while a question is open", async () => {
    const without = recorderFixture();
    const work = vi.fn();
    expect(await without.voice.capture({ maxDurationSeconds: 120, gesture: { mode: "refuse", reason: "The recording bar opens only when the reader presses something in the page." }, purpose: "capability" }, work)).toMatchObject({ ok: false, code: "unavailable", message: expect.stringMatching(/presses something/) });
    expect(without.elements.bar.hidden).toBe(true);
    expect(without.getUserMedia).not.toHaveBeenCalled();
    without.deps.questionOpen.mockReturnValue(true);
    expect(await without.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "capability" }, work)).toMatchObject({ ok: false, code: "unavailable", message: expect.stringMatching(/Another question/) });
    without.deps.questionOpen.mockReturnValue(false);
    const first = without.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "capability" }, work);
    await flush();
    expect(without.voice.isOpen()).toBe(true);
    expect(await without.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "capability" }, work)).toMatchObject({ ok: false, code: "unavailable" });
    without.elements.cancel.click();
    expect(await first).toMatchObject({ ok: false, code: "cancelled" });
    expect(work).not.toHaveBeenCalled();
  });

  it("refuses before opening when the host has no service or the microphone is blocked", async () => {
    const off = recorderFixture({ available: false });
    expect(await off.voice.usable()).toBe(false);
    expect(await off.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "dictate" }, vi.fn())).toEqual({ ok: false, code: "unavailable", message: "Voice transcription is not set up on this bb." });
    const blocked = recorderFixture({ permission: "denied" });
    expect(await blocked.voice.usable()).toBe(false);
    expect(blocked.elements.bar.hidden).toBe(true);
  });

  it("records with bb's preferred microphone and the first supported type, and sends only on Done after 1 s", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(PREFERRED_DEVICE_KEY, "mic-2");
    const { voice, elements, deps, getUserMedia, tracks } = recorderFixture();
    const work = vi.fn(async (recording: { blob: Blob; type: string }) => `got ${recording.type} ${recording.blob.size}`);
    const outcome = voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "capability" }, work);
    await vi.advanceTimersByTimeAsync(0);
    expect(elements.bar.hidden).toBe(false);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: "mic-2" } } });
    const recorder = FakeRecorder.created.at(-1)!;
    expect(recorder.options).toEqual({ mimeType: "audio/ogg" });
    expect(recorder.slice).toBe(250);
    expect(elements.status.textContent).toMatch(/Press Done/);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(elements.time.textContent).toBe("0:01");
    elements.done.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(await outcome).toEqual({ ok: true, value: "got audio/ogg; codecs=opus 9" });
    expect(tracks[0]!.stop).toHaveBeenCalled();
    expect(elements.bar.hidden).toBe(true);
    expect(deps.restoreFocus).toHaveBeenCalled();
    window.localStorage.removeItem(PREFERRED_DEVICE_KEY);
  });

  it("says Too short for a Done under 1 s, sends nothing, and is cancelled; Escape cancels too (R5.71, A122, A122a)", async () => {
    vi.useFakeTimers();
    const short = recorderFixture();
    const work = vi.fn();
    const outcome = short.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "dictate" }, work);
    await vi.advanceTimersByTimeAsync(300);
    short.elements.done.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(short.elements.status.textContent).toBe("Too short");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await outcome).toMatchObject({ ok: false, code: "cancelled" });
    expect(work).not.toHaveBeenCalled();

    const escaped = recorderFixture();
    const pending = escaped.voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "capability" }, work);
    await vi.advanceTimersByTimeAsync(2_000);
    escaped.events.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape", preventDefault() {} }));
    expect(await pending).toMatchObject({ ok: false, code: "cancelled" });
    expect(work).not.toHaveBeenCalled();
  });

  it("stops at maxDurationSeconds and still waits for Done (R5.70, A125)", async () => {
    vi.useFakeTimers();
    const { voice, elements } = recorderFixture();
    const work = vi.fn(async () => "sent");
    const outcome = voice.capture({ maxDurationSeconds: 2, gesture: RECORD, purpose: "capability" }, work);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(FakeRecorder.created.at(-1)!.state).toBe("inactive");
    expect(elements.status.textContent).toMatch(/Reached 0:02/);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(work).not.toHaveBeenCalled();
    elements.done.click();
    expect(await outcome).toEqual({ ok: true, value: "sent" });
  });

  it("treats a refused microphone as no voice until reload (R8.37)", async () => {
    const { voice, deps } = recorderFixture({ getUserMedia: async () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })) });
    const changes: boolean[] = [];
    voice.onChange((usable) => changes.push(usable));
    expect(await voice.capture({ maxDurationSeconds: 120, gesture: RECORD, purpose: "dictate" }, vi.fn())).toMatchObject({ ok: false, code: "unavailable", message: expect.stringMatching(/not allowed/) });
    await flush();
    expect(changes).toEqual([false]);
    expect(await voice.usable()).toBe(false);
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringMatching(/^Voice: The microphone was not allowed/), true);
  });

  it("sends a recording to the host's transcriber only, and passes its refusals on", async () => {
    const { voice } = recorderFixture();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return calls.length === 1 ? jsonResponse({ ok: true, text: "words" }) : jsonResponse({ ok: false, code: calls.length === 2 ? "request_too_large" : "handler_error", message: "no" }, 413);
    });
    const sending = createVoice(window, config, recorderFixture().elements, { questionOpen: () => false, restoreFocus: () => undefined, setStatus: () => undefined, fetchImpl: fetchImpl as never });
    void voice;
    expect(await sending.transcribe({ blob: new Blob(["abc"], { type: "audio/webm" }), type: "audio/webm", prompt: "x".repeat(1_200), language: "en" })).toBe("words");
    expect(calls[0]).toEqual({ url: "/transcribe", body: { actionToken: "tok", mimeType: "audio/webm", content: "YWJj", prompt: "x".repeat(LIMITS.voicePromptChars), language: "en" } });
    await expect(sending.transcribe({ upload: "uploads/a.webm", type: "audio/webm" })).rejects.toMatchObject({ code: "request_too_large" });
    expect(calls[1]!.body).toEqual({ actionToken: "tok", mimeType: "audio/webm", upload: "uploads/a.webm" });
    await expect(sending.transcribe({ upload: "uploads/a.webm", type: "audio/webm" })).rejects.toMatchObject({ code: "unavailable" });
  });
});

// --- the relay ------------------------------------------------------------------

function stubVoice(overrides: Partial<Voice> = {}) {
  const recording = { blob: new Blob(["rec"], { type: "audio/webm;codecs=opus" }), type: "audio/webm;codecs=opus", durationMs: 2_000 };
  const voice = {
    cancel: vi.fn(),
    usable: vi.fn(async () => true),
    onChange: vi.fn(),
    isOpen: vi.fn(() => false),
    capture: vi.fn(async (_options: unknown, work: (value: typeof recording) => Promise<unknown>) => {
      try {
        return { ok: true as const, value: await work(recording) };
      } catch (error) {
        return { ok: false as const, code: (error as VoiceFailure).code ?? "unavailable", message: (error as Error).message };
      }
    }),
    transcribe: vi.fn(async () => "the reader said this"),
    ...overrides,
  };
  return { voice: voice as unknown as Voice & typeof voice, recording };
}

function relayFixture(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, voice?: Voice, gesture: GestureDecision = RECORD) {
  document.body.innerHTML = `<dialog><form method="dialog"><p></p><button type="button" value="cancel">Cancel</button><button type="button" value="confirm">Confirm</button></form></dialog>`;
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  const navigator = { inPlace: vi.fn(), reserveWindow: vi.fn(), external: vi.fn(), release: vi.fn() };
  const fetchMock = vi.fn(fetchImpl);
  const relay = createRelay({ config, confirmer: createConfirmer(dialog), navigator, onDirty: vi.fn(), fetchImpl: fetchMock as never, ...(voice ? { voice } : {}), readerGesture: () => gesture, onStatus: vi.fn() });
  const sent: unknown[] = [];
  const port = { postMessage: (message: unknown) => sent.push(message) } as unknown as MessagePort;
  return { relay, dialog, fetchMock, sent, port };
}

describe("the relay and voice (R5.68, R5.73, R4.58, R4.24a)", () => {
  it("records for voice.captureAndTranscribe once the host validated it, and gives the audio only when asked", async () => {
    const { voice } = stubVoice();
    const fixture = relayFixture(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { request: { id: string; params: Record<string, unknown> } };
      return jsonResponse({ record: { requestId: body.request.id, params: { maxDurationSeconds: 30, keepAudio: body.request.params.keepAudio === true, prompt: "ctx", language: "en" } } }, 401);
    }, voice);
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "voice.captureAndTranscribe", params: { prompt: "ctx" }, pageRevision: REV });
    await flush();
    expect(voice.capture).toHaveBeenCalledWith({ maxDurationSeconds: 30, gesture: RECORD, purpose: "capability" }, expect.any(Function));
    expect(voice.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: "audio/webm;codecs=opus", prompt: "ctx", language: "en" }));
    expect(fixture.sent[0]).toEqual({ v: 1, id: "tp-1", ok: true, result: { text: "the reader said this" } });
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-2", method: "voice.captureAndTranscribe", params: { keepAudio: true }, pageRevision: REV });
    await flush();
    const kept = fixture.sent[1] as { result: { text: string; audio: Blob } };
    expect(kept.result.text).toBe("the reader said this");
    expect(kept.result.audio.type).toBe("audio/webm;codecs=opus");
    // One call, one host request: the bar, not a second round trip, is the confirmation.
    expect(fixture.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes the bar's refusals on as the page's error, and the activation the shell saw", async () => {
    const { voice } = stubVoice({ capture: vi.fn(async () => ({ ok: false as const, code: "cancelled" as const, message: "The reader cancelled the recording; nothing was sent." })) });
    const fixture = relayFixture(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { request: { id: string } };
      return jsonResponse({ record: { requestId: body.request.id, params: { maxDurationSeconds: 120, keepAudio: false } } }, 401);
    }, voice, { mode: "arm", reason: "The top bar was used" });
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "voice.captureAndTranscribe", params: null, pageRevision: REV });
    await flush();
    expect(voice.capture).toHaveBeenCalledWith(expect.objectContaining({ gesture: { mode: "arm", reason: "The top bar was used" } }), expect.any(Function));
    expect(fixture.sent[0]).toMatchObject({ id: "tp-1", ok: false, error: { code: "cancelled" } });
  });

  it("answers Dictate with the transcript and the audio input with a named file", async () => {
    const { voice } = stubVoice();
    const fixture = relayFixture(async () => jsonResponse({}), voice);
    fixture.relay.handle(fixture.port, { kind: "thread-page:record", id: "tp-record-1", purpose: "dictate", prompt: "text before the caret" });
    await flush();
    expect(voice.transcribe).toHaveBeenCalledWith(expect.objectContaining({ prompt: "text before the caret" }));
    expect(fixture.sent[0]).toEqual({ kind: "thread-page:recorded", id: "tp-record-1", ok: true, text: "the reader said this" });
    fixture.relay.handle(fixture.port, { kind: "thread-page:record", id: "tp-record-2", purpose: "audio" });
    await flush();
    const answer = fixture.sent[1] as { ok: boolean; file: File };
    expect(answer.ok).toBe(true);
    expect(answer.file.name).toMatch(/^recording-\d{8}-\d{6}\.webm$/);
    expect(answer.file.type).toBe("audio/webm;codecs=opus");
    expect(voice.transcribe).toHaveBeenCalledTimes(1);
    expect(fixture.fetchMock).not.toHaveBeenCalled();
  });

  it("transcribes recorded answers at submit from the stored upload, and says when it cannot (R4.24b)", async () => {
    const { voice } = stubVoice({ transcribe: vi.fn(async (input: { upload?: string }) => (input.upload === "uploads/b" ? Promise.reject(new VoiceFailure("unavailable", "down")) : "spoken")) });
    const submitted: Record<string, unknown>[] = [];
    let uploads = 0;
    const fixture = relayFixture(async (url, init) => {
      if (url === "/upload") {
        uploads += 1;
        const name = uploads === 1 ? "a" : uploads === 2 ? "b" : "c";
        return jsonResponse({ ok: true, name, path: `uploads/${name}`, sizeBytes: 3 });
      }
      submitted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse({ ok: true, delivery: "queued" });
    }, voice);
    const audio = (name: string) => new File(["abc"], name, { type: "audio/webm" });
    fixture.relay.handle(fixture.port, {
      kind: "thread-page:submit",
      submissionId: "s1",
      title: "T",
      answers: [],
      files: [
        { field: "voice", file: audio("a.webm"), transcribe: true },
        { field: "notes", file: audio("b.webm"), transcribe: true },
        { field: "plain", file: audio("c.webm") },
      ],
    });
    await flush(12);
    expect(voice.transcribe).toHaveBeenCalledTimes(2);
    expect(fixture.sent).toContainEqual({ kind: "thread-page:submit-progress", submissionId: "s1", message: "Transcribing 1 of 2…" });
    expect(submitted[0]!.files).toEqual([
      { field: "voice", name: "a", path: "uploads/a", sizeBytes: 3, transcript: "spoken" },
      { field: "notes", name: "b", path: "uploads/b", sizeBytes: 3, transcript: null },
      { field: "plain", name: "c", path: "uploads/c", sizeBytes: 3 },
    ]);
  });

  it("refuses a form over the file count visibly instead of dropping files (R4.62)", async () => {
    const fixture = relayFixture(async () => jsonResponse({ ok: true }));
    const files = Array.from({ length: 9 }, (_, index) => ({ field: "f", file: new File(["x"], `f${index}.txt`) }));
    fixture.relay.handle(fixture.port, { kind: "thread-page:submit", submissionId: "s9", title: "T", answers: [], files });
    await flush();
    expect(fixture.sent.at(-1)).toMatchObject({ kind: "thread-page:submit-result", ok: false, error: expect.stringMatching(/9 files; at most 8/) });
    expect(fixture.fetchMock).not.toHaveBeenCalled();
  });
});

describe("the relay and files with sessions.start and sessions.send (R3.20a, R5.75–R5.79)", () => {
  const files = () => [new File(["PNG!!"], "screenshot.png", { type: "image/png" }), new File(["log"], "build.log", { type: "text/plain" })];

  function host(failAt: number | null = null, failCode = "handler_error") {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    return {
      calls,
      fetch: async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ url, body });
        const request = body.request as { id: string };
        if (url === "/attach") {
          if (body.discard === true) return jsonResponse({ ok: true, removed: 1, kept: 0 });
          return body.index === failAt ? jsonResponse({ ok: false, code: failCode, message: "the host refused it" }, 500) : jsonResponse({ ok: true, index: body.index });
        }
        if (!body.confirmation) return jsonResponse({ confirm: { requestId: request.id, summary: "Start a session in Alpha\nWith 2 files:\n• “screenshot.png” (5 bytes)\n• “build.log” (3 bytes)", challenge: "chal.sig" } }, 401);
        return jsonResponse({ response: { v: 1, id: request.id, ok: true, result: { sessionId: "thr_new" } } });
      },
    };
  }

  it("describes the files to the host, uploads nothing before Confirm, then each one, then the call", async () => {
    const h = host();
    const fixture = relayFixture(h.fetch);
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.start", params: { projectId: "proj_a", prompt: "Look" }, pageRevision: REV, files: files() });
    await flush();
    expect(h.calls).toHaveLength(1);
    expect((h.calls[0]!.body.request as { params: unknown }).params).toEqual({
      projectId: "proj_a",
      prompt: "Look",
      files: [
        { name: "screenshot.png", size: 5, type: "image/png" },
        { name: "build.log", size: 3, type: "text/plain" },
      ],
    });
    expect(fixture.dialog.querySelector("p")!.textContent).toContain("“build.log” (3 bytes)");
    fixture.dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    await flush(12);
    expect(h.calls.map((call) => [call.url, call.body.index ?? null])).toEqual([
      ["/bridge", null],
      ["/attach", 0],
      ["/attach", 1],
      ["/bridge", null],
    ]);
    expect(h.calls[1]!.body).toMatchObject({ actionToken: "tok", confirmation: "chal.sig", content: Buffer.from("PNG!!").toString("base64") });
    expect(h.calls[1]!.body.request).toEqual(h.calls[0]!.body.request);
    expect(fixture.sent[0]).toEqual({ v: 1, id: "tp-1", ok: true, result: { sessionId: "thr_new" } });
  });

  it("uploads nothing when the reader declines", async () => {
    const h = host();
    const fixture = relayFixture(h.fetch);
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.send", params: { sessionId: "thr_b", prompt: "x" }, pageRevision: REV, files: files() });
    await flush();
    fixture.dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!.click();
    await flush();
    expect(h.calls.map((call) => call.url)).toEqual(["/bridge"]);
    expect(fixture.sent[0]).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("on a failed upload discards what was stored, sends nothing, and names the file", async () => {
    for (const [failCode, expected] of [["handler_error", "handler_error"], ["request_too_large", "request_too_large"]] as const) {
      const h = host(1, failCode);
      const fixture = relayFixture(h.fetch);
      fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.start", params: { projectId: "proj_a", prompt: "x" }, pageRevision: REV, files: files() });
      await flush();
      fixture.dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
      await flush(12);
      expect(h.calls.map((call) => [call.url, call.body.index ?? call.body.discard ?? null])).toEqual([
        ["/bridge", null],
        ["/attach", 0],
        ["/attach", 1],
        ["/attach", true],
      ]);
      expect(fixture.sent[0]).toMatchObject({ ok: false, error: { code: expected, message: expect.stringContaining("Could not attach “build.log”") } });
    }
  });

  it("refuses over the limits, and files given as JSON, before asking anyone", async () => {
    const h = host();
    const fixture = relayFixture(h.fetch);
    const nine = Array.from({ length: 9 }, (_, index) => new File(["x"], `f${index}.txt`));
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.start", params: { projectId: "p", prompt: "x" }, pageRevision: REV, files: nine });
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-2", method: "sessions.start", params: { projectId: "p", prompt: "x", files: [{ name: "a", size: 1, type: "" }] }, pageRevision: REV, files: [new File(["x"], "a")] });
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-3", method: "storage.set", params: { key: "k", value: 1 }, pageRevision: REV, files: [new File(["x"], "a")] });
    await flush();
    expect(fixture.sent).toEqual([
      expect.objectContaining({ id: "tp-1", error: expect.objectContaining({ code: "request_too_large" }) }),
      expect.objectContaining({ id: "tp-2", error: expect.objectContaining({ code: "invalid_params" }) }),
      expect.objectContaining({ id: "tp-3", error: expect.objectContaining({ code: "invalid_request" }) }),
    ]);
    expect(h.calls).toHaveLength(0);
  });
});

// --- review fixes ----------------------------------------------------------------

describe("the reader's gesture, told apart from the shell's own chrome (R3.32a)", () => {
  function gestureFixture(activation: { isActive: boolean } | undefined) {
    const listeners = new Map<string, ((event: { isTrusted: boolean }) => void)[]>();
    const win = {
      navigator: activation ? { userActivation: activation } : {},
      addEventListener: (type: string, listener: (event: { isTrusted: boolean }) => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    } as unknown as Window & typeof globalThis;
    const gesture = createReaderGesture(win, { cooldownMs: 2_000, pollMs: 100 });
    const fire = (type: string, isTrusted = true) => (listeners.get(type) ?? []).forEach((listener) => listener({ isTrusted }));
    return { gesture, fire };
  }

  it("arms the bar while an activation the chrome caused is live, and records at once once it lapsed and the page acts", async () => {
    vi.useFakeTimers();
    const activation = { isActive: true };
    const { gesture, fire } = gestureFixture(activation);
    // Activation with no gesture in the chrome: it came from the page.
    expect(gesture.decide()).toEqual({ mode: "record" });
    // The reader clicks Cancel in the bar: the page re-asking now gets an armed bar, the microphone off.
    fire("pointerdown");
    fire("click");
    expect(gesture.decide()).toMatchObject({ mode: "arm" });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(gesture.decide()).toMatchObject({ mode: "arm" });
    // The chrome's activation lapses; with none at all, nothing opens.
    activation.isActive = false;
    await vi.advanceTimersByTimeAsync(150);
    expect(gesture.decide()).toMatchObject({ mode: "refuse", reason: expect.stringMatching(/presses something in the page/) });
    // A later activation can only be the page's.
    activation.isActive = true;
    expect(gesture.decide()).toEqual({ mode: "record" });
    // A script's synthetic event is no gesture of the reader's.
    fire("pointerdown", false);
    expect(gesture.decide()).toEqual({ mode: "record" });
  });

  it("arms the bar a moment after a bar or question closes, and whenever the engine cannot tell", async () => {
    vi.useFakeTimers();
    const { gesture } = gestureFixture({ isActive: true });
    gesture.closed();
    expect(gesture.decide()).toMatchObject({ mode: "arm" });
    await vi.advanceTimersByTimeAsync(2_100);
    expect(gesture.decide()).toEqual({ mode: "record" });
    expect(gestureFixture(undefined).gesture.decide()).toMatchObject({ mode: "arm" });
  });

  it("an armed bar starts the microphone only on the reader's Record, and Cancel there is cancelled", async () => {
    vi.useFakeTimers();
    const armed = recorderFixture();
    const work = vi.fn(async () => "sent");
    // jsdom can make no trusted click; the reader's is stood in for by calling the listener with one.
    const onRecord: ((event: { isTrusted: boolean }) => void)[] = [];
    const add = armed.elements.record.addEventListener.bind(armed.elements.record);
    vi.spyOn(armed.elements.record, "addEventListener").mockImplementation(((type: string, listener: (event: { isTrusted: boolean }) => void) => {
      onRecord.push(listener);
      add(type, listener as never);
    }) as never);
    const outcome = armed.voice.capture({ maxDurationSeconds: 120, gesture: { mode: "arm", reason: "chrome" }, purpose: "dictate" }, work);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(armed.elements.bar.hidden).toBe(false);
    expect(armed.elements.bar.dataset.state).toBe("armed");
    expect(armed.elements.record.hidden).toBe(false);
    expect(armed.elements.done.hidden).toBe(true);
    expect(armed.getUserMedia).not.toHaveBeenCalled();
    // A script's click is not the reader's.
    armed.elements.record.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(armed.getUserMedia).not.toHaveBeenCalled();
    onRecord.forEach((listener) => listener({ isTrusted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(armed.getUserMedia).toHaveBeenCalledTimes(1);
    expect(armed.elements.done.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    armed.elements.done.click();
    expect(await outcome).toEqual({ ok: true, value: "sent" });

    const cancelled = recorderFixture();
    const pending = cancelled.voice.capture({ maxDurationSeconds: 120, gesture: { mode: "arm", reason: "chrome" }, purpose: "capability" }, work);
    await vi.advanceTimersByTimeAsync(500);
    cancelled.elements.cancel.click();
    expect(await pending).toMatchObject({ ok: false, code: "cancelled" });
    expect(cancelled.getUserMedia).not.toHaveBeenCalled();
  });

  it("a relay without the shell's gesture tracking treats nothing as the reader's action", async () => {
    const { voice } = stubVoice();
    document.body.innerHTML = `<dialog><p></p></dialog>`;
    const relay = createRelay({ config, confirmer: createConfirmer(document.querySelector("dialog")!), navigator: { inPlace: vi.fn(), reserveWindow: vi.fn(), external: vi.fn(), release: vi.fn() } as never, onDirty: vi.fn(), voice, fetchImpl: vi.fn() as never });
    const sent: unknown[] = [];
    relay.handle({ postMessage: (message: unknown) => sent.push(message) } as unknown as MessagePort, { kind: "thread-page:record", id: "tp-record-1", purpose: "dictate" });
    await flush();
    expect(voice.capture).toHaveBeenCalledWith(expect.objectContaining({ gesture: { mode: "refuse", reason: expect.stringMatching(/presses something/) } }), expect.any(Function));
  });
});

describe("the relay after review", () => {
  it("cancels an open bar on Escape from the page", () => {
    const { voice } = stubVoice();
    const fixture = relayFixture(async () => jsonResponse({}), voice);
    fixture.relay.handle(fixture.port, { kind: "thread-page:escape" });
    expect(voice.cancel).toHaveBeenCalledTimes(1);
  });

  it("refuses file metadata in the parameters without real files", async () => {
    const fixture = relayFixture(async () => jsonResponse({}));
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.start", params: { projectId: "p", prompt: "x", files: [{ name: "a.png", size: 3, type: "image/png" }] }, pageRevision: REV });
    await flush();
    expect(fixture.sent[0]).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(fixture.fetchMock).not.toHaveBeenCalled();
  });

  it("transcribes only audio, and shortens a long transcript instead of failing the answer (R4.24b)", async () => {
    const { voice } = stubVoice({ transcribe: vi.fn(async () => "long ".repeat(10_000)) });
    const submitted: Record<string, unknown>[] = [];
    const fixture = relayFixture(async (url, init) => {
      if (url === "/upload") return jsonResponse({ ok: true, name: "n", path: "uploads/n", sizeBytes: 3 });
      submitted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse({ ok: true, delivery: "queued" });
    }, voice);
    fixture.relay.handle(fixture.port, {
      kind: "thread-page:submit",
      submissionId: "s1",
      title: "T",
      answers: [],
      files: [
        { field: "a", file: new File(["x"], "page.html", { type: "text/html" }), transcribe: true },
        { field: "b", file: new File(["x"], "memo.ogg", { type: "audio/ogg" }), transcribe: true },
      ],
    });
    await flush(12);
    expect(voice.transcribe).toHaveBeenCalledTimes(1);
    const files = submitted[0]!.files as { transcript?: string }[];
    expect(files[0]).not.toHaveProperty("transcript");
    expect(files[1]!.transcript!.length).toBe(LIMITS.transcriptChars);
    expect(files[1]!.transcript).toMatch(/\(transcript shortened\)$/);
  });

  it("discards what was stored when the approved call itself fails, and says what stays", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fixture = relayFixture(async (url, init) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body });
      const request = body.request as { id: string };
      if (url === "/attach") return body.discard === true ? jsonResponse({ ok: true, removed: 0, kept: 1 }) : jsonResponse({ ok: true, index: body.index });
      if (!body.confirmation) return jsonResponse({ confirm: { requestId: request.id, summary: "Start", challenge: "chal.sig" } }, 401);
      return jsonResponse({ response: { v: 1, id: request.id, ok: false, error: { code: "unavailable", message: "The host could not start it" } } }, 503);
    });
    fixture.relay.handle(fixture.port, { v: 1, id: "tp-1", method: "sessions.start", params: { projectId: "p", prompt: "x" }, pageRevision: REV, files: [new File(["abc"], "a.txt")] });
    await flush();
    fixture.dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    await flush(12);
    expect(calls.map((call) => [call.url, call.body.discard === true])).toEqual([
      ["/bridge", false],
      ["/attach", false],
      ["/bridge", false],
      ["/attach", true],
    ]);
    expect(fixture.sent[0]).toMatchObject({ ok: false, error: { code: "unavailable", message: expect.stringContaining("One file already attached stays") } });
  });
});
