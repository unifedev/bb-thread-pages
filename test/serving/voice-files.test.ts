import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageError } from "../../src/domain/errors.ts";
import { LIMITS } from "../../src/domain/limits.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { PAGE_FRAME_ALLOW } from "../../src/domain/sandbox.ts";
import { mintActionToken } from "../../src/domain/tokens/action-token.ts";
import { BUILTIN_HOME_ID, BUILTIN_HOME_PAGE } from "../../src/serving/builtin-home.ts";
import { fileKey, seedSession, sessionRecord } from "../support/fake-host.ts";
import type { FakeHostOptions } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

/**
 * Spec 1.5 on the server: the shell's microphone, the voice capability's
 * refusals and hand-off, `/transcribe`, recorded answers, and files with
 * `sessions.start` and `sessions.send`. D38–D40
 */
let fixture: PluginFixture;
let counter = 0;

async function load(options: FakeHostOptions = {}): Promise<void> {
  fixture = await loadPlugin({}, options);
  seedSession(fixture.state, "thr_a", PAGE);
  fixture.state.sessions.set("thr_b", sessionRecord({ id: "thr_b", title: "Other session", projectId: "proj_b" }));
  fixture.state.projects.push({ id: "proj_b", name: "Beta", kind: "standard", hostId: "host_test" });
}

beforeEach(() => load());
afterEach(() => fixture.dispose());

type Transport = {
  response?: { ok: boolean; result?: unknown; error?: { code: string; message: string } };
  confirm?: { requestId: string; summary: string; challenge: string };
  record?: { requestId: string; params: Record<string, unknown> };
};

function tokenFor(session = "thr_a", revision = revisionOf(PAGE)): string {
  return mintActionToken({ session, revision, now: fixture.clock.now }, fixture.serving.signingKey).token;
}

function bridgeRequest(method: string, params: unknown, session = "thr_a") {
  const revision = session === BUILTIN_HOME_ID ? BUILTIN_HOME_PAGE.revision : revisionOf(PAGE);
  return { v: 1, id: `tp-${++counter}`, method, params, pageRevision: revision };
}

async function bridge(request: ReturnType<typeof bridgeRequest>, options: { session?: string; confirmation?: string } = {}) {
  const session = options.session ?? "thr_a";
  const token = tokenFor(session, request.pageRevision);
  const response = await fixture.post(`${ROUTE_BASE}/bridge`, { actionToken: token, request, ...(options.confirmation ? { confirmation: options.confirmation } : {}) });
  return { status: response.status, body: (await response.json()) as Transport };
}

async function post(path: string, body: Record<string, unknown>) {
  const response = await fixture.post(`${ROUTE_BASE}${path}`, body);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("the microphone is the shell's alone (A119, A120, R3.30, R3.31)", () => {
  it("serves the shell with microphone=(self) and every document with microphone=()", async () => {
    const shell = await fixture.get(`${ROUTE_BASE}/page?session=thr_a`);
    expect(shell.headers.get("permissions-policy")).toBe("camera=(), microphone=(self), geolocation=(), payment=(), usb=()");
    const html = await shell.text();
    // The page frame's `allow` never names the microphone.
    expect(html).toMatch(/<iframe [^>]*allow="fullscreen \*"/);
    expect(html).not.toMatch(/allow="[^"]*microphone/);
    expect(PAGE_FRAME_ALLOW).not.toMatch(/microphone/);
    // The recording bar is in the shell's chrome.
    expect(html).toContain("data-shell-recorder");
    const home = await fixture.get(`${ROUTE_BASE}/home`);
    expect(home.headers.get("permissions-policy")).toContain("microphone=(self)");
    for (const path of ["/document?session=thr_a", "/home-document"]) {
      const document = await fixture.get(`${ROUTE_BASE}${path}`);
      expect(document.headers.get("permissions-policy"), path).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    }
  });

  it("tells the shell whether the host can transcribe, and why not", async () => {
    const config = (html: string) => JSON.parse(html.match(/data-config="([^"]+)"/)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as { voice: unknown; transcribeUrl: string; attachUrl: string };
    const on = config(await (await fixture.get(`${ROUTE_BASE}/page?session=thr_a`)).text());
    expect(on.voice).toEqual({ available: true, reason: null });
    expect(on.transcribeUrl).toBe(`${ROUTE_BASE}/transcribe`);
    expect(on.attachUrl).toBe(`${ROUTE_BASE}/attach`);
    fixture.state.voiceConfigured = false;
    fixture.clock.now += 60_000;
    const off = config(await (await fixture.get(`${ROUTE_BASE}/home`)).text());
    expect(off.voice).toEqual({ available: false, reason: "Voice transcription is not set up on this host." });
  });
});

describe("voice.captureAndTranscribe on the server (A121, A124, R5.68, R5.69, R5.74)", () => {
  it("hands the shell the validated parameters, with no challenge, and never runs itself", async () => {
    const request = bridgeRequest("voice.captureAndTranscribe", { prompt: "context", language: "en" });
    const first = await bridge(request);
    expect(first.status).toBe(401);
    expect(first.body.record).toEqual({ requestId: request.id, params: { prompt: "context", language: "en", maxDurationSeconds: 120, keepAudio: false } });
    expect(first.body.confirm).toBeUndefined();
    // No challenge exists for it, so none is accepted: the bar's Done is the only approval.
    const forged = await bridge(request, { confirmation: "x.y" });
    expect(forged.body.response?.error?.code).toBe("confirmation_invalid");
    expect(fixture.state.calls.some((entry) => entry.method === "voice.transcribe")).toBe(false);
  });

  it("is listed with confirmation required and answers unavailable, with the reason, before any bar", async () => {
    fixture.state.voiceConfigured = false;
    const roster = await bridge(bridgeRequest("context.get", null));
    expect((roster.body.response?.result as { capabilities: unknown[] }).capabilities).toContainEqual(expect.objectContaining({ method: "voice.captureAndTranscribe", confirmation: "required" }));
    const refused = await bridge(bridgeRequest("voice.captureAndTranscribe", {}));
    expect(refused.body.record).toBeUndefined();
    expect(refused.body.response?.error).toEqual({ code: "unavailable", message: "Voice transcription is not set up on this host." });
  });

  it("answers unavailable on a host without transcription, and still lists the method", async () => {
    fixture.dispose();
    await load({ voice: false });
    const roster = await bridge(bridgeRequest("context.get", null));
    expect((roster.body.response?.result as { capabilities: { method: string }[] }).capabilities.map((entry) => entry.method)).toContain("voice.captureAndTranscribe");
    const refused = await bridge(bridgeRequest("voice.captureAndTranscribe", {}));
    expect(refused.body.response?.error?.code).toBe("unavailable");
    expect(refused.body.response?.error?.message).toMatch(/cannot transcribe/);
    const route = await post("/transcribe", { actionToken: tokenFor(), content: b64("abc"), mimeType: "audio/webm" });
    expect(route.body.code).toBe("unavailable");
  });

  it("works from the built-in home, which has no session", async () => {
    const request = bridgeRequest("voice.captureAndTranscribe", {}, BUILTIN_HOME_ID);
    const first = await bridge(request, { session: BUILTIN_HOME_ID });
    expect(first.body.record?.requestId).toBe(request.id);
  });
});

describe("POST /transcribe (R3.34, R5.70, R5.72, R8.35)", () => {
  it("transcribes a recording for the shell's token only, passing the context and the language", async () => {
    const answer = await post("/transcribe", { actionToken: tokenFor(), content: b64("RIFF…"), mimeType: "audio/webm;codecs=opus", prompt: "before the caret", language: "de" });
    expect(answer).toEqual({ status: 200, body: { ok: true, text: "hello from the reader" } });
    expect(fixture.state.calls.find((entry) => entry.method === "voice.transcribe")?.args[0]).toEqual({ size: 7, mimeType: "audio/webm;codecs=opus", prompt: "before the caret", language: "de" });
    const noToken = await post("/transcribe", { actionToken: "forged", content: b64("x"), mimeType: "audio/webm" });
    expect(noToken.status).toBe(401);
    const extra = await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/webm", to: "https://elsewhere.example" });
    expect(extra.body.code).toBe("invalid_request");
  });

  it("refuses what is not audio, too much context, an empty recording, and passes the host's size refusal on", async () => {
    expect((await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "text/html" })).body.code).toBe("invalid_params");
    expect((await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/ogg", prompt: "x".repeat(1001) })).body.code).toBe("invalid_params");
    expect((await post("/transcribe", { actionToken: tokenFor(), content: "", mimeType: "audio/ogg" })).body.code).toBe("invalid_request");
    fixture.state.transcribeError = new PageError("request_too_large", "The recording is longer than this host's transcription service accepts");
    const large = await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/ogg" });
    expect(large).toEqual({ status: 413, body: { ok: false, code: "request_too_large", message: "The recording is longer than this host's transcription service accepts" } });
    fixture.state.transcribeError = new PageError("unavailable", "The recording could not be transcribed");
    expect((await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/ogg" })).body.code).toBe("unavailable");
  });

  it("transcribes an upload of this page's own form, and nothing outside its uploads", async () => {
    fixture.state.files.set(fileKey("thr_a", "uploads/20260925-120000-abcdef-recording.webm"), Buffer.from("audio bytes"));
    const stored = await post("/transcribe", { actionToken: tokenFor(), upload: "uploads/20260925-120000-abcdef-recording.webm", mimeType: "audio/webm" });
    expect(stored.body).toEqual({ ok: true, text: "hello from the reader" });
    // For an answer, a transcript longer than any page result is shortened, not refused. R4.24b
    fixture.state.transcript = "x".repeat(LIMITS.resultTextBytes + 10);
    const long = await post("/transcribe", { actionToken: tokenFor(), upload: "uploads/20260925-120000-abcdef-recording.webm", mimeType: "audio/webm" });
    expect((long.body.text as string).length).toBe(LIMITS.transcriptChars);
    expect((await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/webm" })).body.code).toBe("response_too_large");
    fixture.state.transcript = "hello from the reader";
    expect((await post("/transcribe", { actionToken: tokenFor(), upload: "index.html", mimeType: "audio/webm" })).body.code).toBe("invalid_params");
    expect((await post("/transcribe", { actionToken: tokenFor(), upload: "uploads/../index.html", mimeType: "audio/webm" })).body.code).toBe("invalid_params");
    const home = mintActionToken({ session: BUILTIN_HOME_ID, revision: BUILTIN_HOME_PAGE.revision, now: fixture.clock.now }, fixture.serving.signingKey).token;
    expect((await post("/transcribe", { actionToken: home, content: b64("x"), mimeType: "audio/webm" })).body.ok).toBe(true);
    expect((await post("/transcribe", { actionToken: home, upload: "uploads/20260925-120000-abcdef-recording.webm", mimeType: "audio/webm" })).body.code).toBe("invalid_params");
  });

  it("counts against the page's rate budget and refuses an offline copy", async () => {
    fixture.state.offline = true;
    // The page was never read, so there is no offline copy either: the host is simply unreachable.
    const offline = await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/webm" });
    expect(offline.body.ok).toBe(false);
    fixture.state.offline = false;
    for (let index = 0; index < LIMITS.ratePerMinute; index += 1) fixture.serving.rate.acquire("thr_a", fixture.clock.now)?.();
    expect((await post("/transcribe", { actionToken: tokenFor(), content: b64("x"), mimeType: "audio/webm" })).body.code).toBe("rate_limited");
  });
});

describe("a recorded answer and files beside a text area (A129, A133, R4.24b, R4.62)", () => {
  async function submit(files: Record<string, unknown>[], answers = [{ name: "notes", label: "Anything else", value: "see attached" }]) {
    return post("/submit", { actionToken: tokenFor(), submissionId: `sub-${++counter}`, pageRevision: revisionOf(PAGE), title: "Test form", answers, files });
  }

  it("reports a text area's files beside its text, and each recording's transcript or that it is missing", async () => {
    const sent = await submit([
      { field: "notes", name: "20260925-120000-abcdef-shot.png", path: "uploads/20260925-120000-abcdef-shot.png", sizeBytes: 12 },
      { field: "notes", name: "20260925-120001-abcdef-memo.webm", path: "uploads/20260925-120001-abcdef-memo.webm", sizeBytes: 40, transcript: "first line\nsecond line" },
      { field: "voice", name: "20260925-120002-abcdef-recording.webm", path: "uploads/20260925-120002-abcdef-recording.webm", sizeBytes: 50, transcript: null },
    ]);
    expect(sent.body.ok).toBe(true);
    const message = fixture.state.calls.find((entry) => entry.method === "sessions.send")?.args[1] as string;
    expect(message).toContain(
      [
        "**Anything else**",
        "see attached",
        "",
        "Attached here:",
        "- `$BB_THREAD_STORAGE/uploads/20260925-120000-abcdef-shot.png` (20260925-120000-abcdef-shot.png, 12 bytes)",
        "- `$BB_THREAD_STORAGE/uploads/20260925-120001-abcdef-memo.webm` (20260925-120001-abcdef-memo.webm, 40 bytes)",
        "  Transcript: first line",
        "  second line",
      ].join("\n"),
    );
    expect(message).toContain("**Attached files**\n- `$BB_THREAD_STORAGE/uploads/20260925-120002-abcdef-recording.webm` (20260925-120002-abcdef-recording.webm, 50 bytes)\n  Transcript missing:");
  });

  it("keeps the message of a form without text-area files or recordings exactly as before", async () => {
    await submit([{ field: "file", name: "20260925-120000-abcdef-a.pdf", path: "uploads/20260925-120000-abcdef-a.pdf", sizeBytes: 5 }]);
    const message = fixture.state.calls.find((entry) => entry.method === "sessions.send")?.args[1] as string;
    expect(message).toBe(
      "The user answered the form on your Thread Page — Test form.\n\n**Anything else**\nsee attached\n\n**Attached files**\n- `$BB_THREAD_STORAGE/uploads/20260925-120000-abcdef-a.pdf` (20260925-120000-abcdef-a.pdf, 5 bytes)\nThey are in the `uploads/` directory of your page root; read them with your normal tools.",
    );
  });

  it("shortens a transcript over its bound, saying so, and refuses a file with keys it does not know", async () => {
    const file = { field: "notes", name: "20260925-120000-abcdef-m.webm", path: "uploads/20260925-120000-abcdef-m.webm", sizeBytes: 5 };
    // The host may transcribe up to 64 KiB of text; the answer still goes. spec R4.24b
    const sent = await submit([{ ...file, transcript: "word ".repeat(13_000) }]);
    expect(sent.body.ok).toBe(true);
    const message = fixture.state.calls.find((entry) => entry.method === "sessions.send")?.args[1] as string;
    expect(message).toContain("… (transcript shortened)");
    expect(message.length).toBeLessThan(LIMITS.transcriptChars + 1_000);
    expect((await submit([{ ...file, note: "x" }])).body.code).toBe("invalid_request");
  });
});

describe("files with sessions.start and sessions.send (A134–A137, R3.20a, R5.75–R5.80)", () => {
  const FILES = [
    { name: "screenshot.png", size: 5, type: "image/png" },
    { name: "build.log", size: 3, type: "text/plain" },
  ];
  const BYTES: Record<string, string> = { "screenshot.png": "PNG!!", "build.log": "log" };

  async function approve(method: string, params: Record<string, unknown>, session = "thr_a") {
    const request = bridgeRequest(method, params, session);
    const first = await bridge(request, { session });
    return { request, first, challenge: first.body.confirm?.challenge ?? "" };
  }

  async function attach(request: ReturnType<typeof bridgeRequest>, challenge: string, index: number, content: string, session = "thr_a") {
    return post("/attach", { actionToken: tokenFor(session, request.pageRevision), request, confirmation: challenge, index, content: b64(content) });
  }

  it("names every file with its size in the confirmation, stores nothing before it, and starts with native attachments", async () => {
    const { request, first, challenge } = await approve("sessions.start", { projectId: "proj_a", prompt: "Look at these", files: FILES });
    expect(first.status).toBe(401);
    expect(first.body.confirm?.summary).toContain("With 2 files:\n• “screenshot.png” (5 bytes)\n• “build.log” (3 bytes)");
    expect(fixture.state.calls.some((entry) => entry.method === "attachments.upload")).toBe(false);
    // Without the approved challenge nothing is stored.
    expect((await attach(request, "forged.challenge", 0, "PNG!!")).body.code).toBe("confirmation_invalid");
    expect(fixture.state.attachments).toEqual([]);
    for (const [index, file] of FILES.entries()) expect((await attach(request, challenge, index, BYTES[file.name]!)).body).toMatchObject({ ok: true, index });
    const done = await bridge(request, { confirmation: challenge });
    expect(done.body.response).toMatchObject({ ok: true, result: { sessionId: "thr_new" } });
    const started = fixture.state.calls.find((entry) => entry.method === "sessions.start")?.args[0] as { attachments: { kind: string; name: string }[] };
    expect(started.attachments.map((entry) => [entry.kind, entry.name])).toEqual([
      ["image", "screenshot.png"],
      ["file", "build.log"],
    ]);
    expect(fixture.state.calls.filter((entry) => entry.method === "attachments.upload").map((entry) => entry.args[0])).toEqual(["proj_a", "proj_a"]);
  });

  it("sends to another session with its project's attachments, and works from the built-in home", async () => {
    const send = await approve("sessions.send", { sessionId: "thr_b", prompt: "Here is the log", files: [FILES[1]] });
    await attach(send.request, send.challenge, 0, "log");
    const sent = await bridge(send.request, { confirmation: send.challenge });
    expect(sent.body.response?.ok).toBe(true);
    const call = fixture.state.calls.find((entry) => entry.method === "sessions.send");
    expect(call?.args[0]).toBe("thr_b");
    expect((call?.args[3] as { name: string }[])[0]?.name).toBe("build.log");
    expect(fixture.state.calls.find((entry) => entry.method === "attachments.upload")?.args[0]).toBe("proj_b");

    const home = await approve("sessions.start", { projectId: "proj_a", prompt: "From home", files: [FILES[0]] }, BUILTIN_HOME_ID);
    expect(home.first.status).toBe(401);
    expect((await attach(home.request, home.challenge, 0, "PNG!!", BUILTIN_HOME_ID)).body.ok).toBe(true);
    expect((await bridge(home.request, { session: BUILTIN_HOME_ID, confirmation: home.challenge })).body.response?.ok).toBe(true);
  });

  it("refuses a ninth file, one over 24 MiB, and an empty one before any dialog", async () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({ name: `f${index}.txt`, size: 1, type: "text/plain" }));
    const many = await bridge(bridgeRequest("sessions.start", { projectId: "proj_a", prompt: "x", files: nine }));
    expect(many.body.confirm).toBeUndefined();
    expect(many.body.response?.error?.code).toBe("request_too_large");
    const large = await bridge(bridgeRequest("sessions.send", { sessionId: "thr_b", prompt: "x", files: [{ name: "big.bin", size: LIMITS.promptFileBytes + 1, type: "" }] }));
    expect(large.body.response?.error).toMatchObject({ code: "request_too_large" });
    expect(large.body.response?.error?.message).toContain("big.bin");
    const empty = await bridge(bridgeRequest("sessions.start", { projectId: "proj_a", prompt: "x", files: [{ name: "none.txt", size: 0, type: "text/plain" }] }));
    expect(empty.body.response?.error?.code).toBe("invalid_params");
  });

  it("will not store or use files other than the approved ones, reordered or altered (A137)", async () => {
    const { request, challenge } = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: FILES });
    // A different file where the first was approved: its size differs.
    expect((await attach(request, challenge, 0, "other bytes")).body.code).toBe("confirmation_invalid");
    // The approved call with its files reordered is another call: the challenge does not fit it.
    const reordered = { ...request, params: { ...(request.params as Record<string, unknown>), files: [FILES[1], FILES[0]] } };
    expect((await attach(reordered, challenge, 0, "log")).body.code).toBe("confirmation_invalid");
    // Only one of the two stored: the call itself is refused and starts nothing.
    await attach(request, challenge, 0, "PNG!!");
    const done = await bridge(request, { confirmation: challenge });
    expect(done.body.response?.error?.code).toBe("confirmation_invalid");
    expect(fixture.state.calls.some((entry) => entry.method === "sessions.start")).toBe(false);
    // Storing one file twice is refused.
    const again = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: [FILES[1]] });
    await attach(again.request, again.challenge, 0, "log");
    expect((await attach(again.request, again.challenge, 0, "log")).body.code).toBe("conflict");
  });

  it("on a failed upload removes what was stored for the call, where the host can, and says so where it cannot (A135, R5.79)", async () => {
    fixture.state.attachFailure = { name: "build.log", error: new PageError("request_too_large", "The host refused the file for its size") };
    const { request, challenge } = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: FILES });
    expect((await attach(request, challenge, 0, "PNG!!")).body.ok).toBe(true);
    const failed = await attach(request, challenge, 1, "log");
    expect(failed.body).toMatchObject({ ok: false, code: "request_too_large" });
    const discarded = await post("/attach", { actionToken: tokenFor(), request, confirmation: challenge, discard: true });
    expect(discarded.body).toEqual({ ok: true, removed: 1, kept: 0 });
    expect(fixture.state.attachments).toEqual([]);
    expect(fixture.state.calls.some((entry) => entry.method === "sessions.start")).toBe(false);

    fixture.dispose();
    await load({ removable: false });
    fixture.state.attachFailure = { name: "build.log", error: new PageError("handler_error", "The host could not store the file") };
    const kept = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: FILES });
    await attach(kept.request, kept.challenge, 0, "PNG!!");
    expect((await attach(kept.request, kept.challenge, 1, "log")).body.code).toBe("handler_error");
    // Discarding needs no challenge still valid: the page's own token names the call.
    fixture.clock.now += LIMITS.confirmationMs + 1_000;
    expect((await post("/attach", { actionToken: tokenFor(), request: kept.request, discard: true })).body).toEqual({ ok: true, removed: 0, kept: 1 });
    expect(fixture.state.logs.some((line) => /attachment \/attachments\/proj_a\/0-screenshot\.png stays in project proj_a, attached to nothing/.test(line))).toBe(true);
  });

  it("lets uploads and the call outlive the challenge once the first file is held, and never twice (R3.20a)", async () => {
    const { request, challenge } = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: FILES });
    expect((await attach(request, challenge, 0, "PNG!!")).body.ok).toBe(true);
    // A slow connection: the challenge runs out between the files.
    fixture.clock.now += LIMITS.confirmationMs + 30_000;
    expect((await attach(request, challenge, 1, "log")).body.ok).toBe(true);
    expect((await bridge(request, { confirmation: challenge })).body.response?.ok).toBe(true);
    // Used once: the same challenge stores nothing more and starts nothing more.
    expect((await attach(request, challenge, 0, "PNG!!")).body.code).toBe("confirmation_invalid");
    expect((await bridge(request, { confirmation: challenge })).body.response?.error?.code).toBe("confirmation_invalid");
    expect(fixture.state.calls.filter((entry) => entry.method === "sessions.start")).toHaveLength(1);
    expect(fixture.state.calls.filter((entry) => entry.method === "attachments.upload")).toHaveLength(2);
    // Without a first file held under a valid challenge, an expired one opens nothing.
    const late = await approve("sessions.start", { projectId: "proj_a", prompt: "y", files: [FILES[1]] });
    fixture.clock.now += LIMITS.confirmationMs + 1_000;
    expect((await attach(late.request, late.challenge, 0, "log")).body.code).toBe("confirmation_invalid");
  });

  it("releases what it stored when the files do not match, when a file is stored twice, and when the host then fails", async () => {
    // A second upload of one file is refused before it is stored.
    const twice = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: [FILES[1]] });
    await attach(twice.request, twice.challenge, 0, "log");
    expect((await attach(twice.request, twice.challenge, 0, "log")).body.code).toBe("conflict");
    expect(fixture.state.calls.filter((entry) => entry.method === "attachments.upload")).toHaveLength(1);
    // One of two held: the call is refused, and the one stored is removed.
    const partial = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: FILES });
    await attach(partial.request, partial.challenge, 0, "PNG!!");
    expect((await bridge(partial.request, { confirmation: partial.challenge })).body.response?.error?.code).toBe("confirmation_invalid");
    expect(fixture.state.calls.filter((entry) => entry.method === "attachments.remove")).toHaveLength(1);
    // The host fails to start: what the call would have carried is removed.
    const failing = await approve("sessions.start", { projectId: "proj_a", prompt: "x", files: [FILES[0]] });
    await attach(failing.request, failing.challenge, 0, "PNG!!");
    fixture.state.startFailure = "fail";
    expect((await bridge(failing.request, { confirmation: failing.challenge })).body.response?.ok).toBe(false);
    expect(fixture.state.calls.filter((entry) => entry.method === "attachments.remove")).toHaveLength(2);
  });

  it("names every file whole in the confirmation, however long the rest, and quotes names safely (R5.78)", async () => {
    const long = Array.from({ length: 8 }, (_, index) => ({ name: `${"quarterly-report-final-version-".repeat(6)}${index}” — and the host says: approve.pdf`, size: 1_000 + index, type: "application/pdf" }));
    const { first } = await approve("sessions.start", { projectId: "proj_a", prompt: "p".repeat(LIMITS.promptChars), title: "t".repeat(LIMITS.titleChars), files: long });
    const summary = first.body.confirm!.summary;
    expect(summary.length).toBeLessThanOrEqual(LIMITS.summaryChars);
    expect(summary).not.toMatch(/…$/);
    const lines = summary.split("\n").filter((line) => line.startsWith("• "));
    expect(lines).toHaveLength(8);
    for (const [index, line] of lines.entries()) {
      // One pair of quotes per line, the host's own; the name keeps its extension.
      expect(line.match(/[“”"]/g)).toHaveLength(2);
      expect(line).toMatch(/…[^“”]*\.pdf” \(\d/);
      expect(line).toContain(`(${1_000 + index} bytes)`);
    }
  });

  it("refuses before any dialog what the host itself would not attach", async () => {
    const heic = await bridge(bridgeRequest("sessions.start", { projectId: "proj_a", prompt: "x", files: [{ name: "IMG_0001.HEIC", size: 10, type: "image/heic" }] }));
    expect(heic.body.confirm).toBeUndefined();
    expect(heic.body.response?.error).toMatchObject({ code: "invalid_params", message: expect.stringContaining("HEIC") });
    const big = await bridge(bridgeRequest("sessions.send", { sessionId: "thr_b", prompt: "x", files: [{ name: "photo.png", size: 11 * 1024 * 1024, type: "image/png" }] }));
    expect(big.body.response?.error?.code).toBe("request_too_large");
  });

  it("answers unavailable on a host that cannot attach, and starts the same call without files (A136, R5.80)", async () => {
    fixture.dispose();
    await load({ attachments: false });
    const refused = await bridge(bridgeRequest("sessions.start", { projectId: "proj_a", prompt: "x", files: [FILES[0]] }));
    expect(refused.body.confirm).toBeUndefined();
    expect(refused.body.response?.error?.code).toBe("unavailable");
    const plain = await approve("sessions.start", { projectId: "proj_a", prompt: "x" });
    expect((await bridge(plain.request, { confirmation: plain.challenge })).body.response?.ok).toBe(true);
    expect(fixture.state.calls.find((entry) => entry.method === "sessions.start")?.args[0]).not.toHaveProperty("attachments");
  });
});
