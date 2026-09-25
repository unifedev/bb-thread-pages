import { isDocumentPath } from "../../domain/document-path.ts";
import { LIMITS, mebibytes } from "../../domain/limits.ts";
import { isBridgeRequest, isBridgeResponse, isFileLike, isRecord, isScrollMessage, isValidRequestId, makeFailure, sentMessage, type BridgeRequestMessage, type RecordedMessage, type ShellConfig, type ShellMessage, type SubmitFile } from "../shared/protocol.ts";
import { encodeBase64 } from "./base64.ts";
import type { Confirmer } from "./confirm.ts";
import type { Navigator } from "./navigate.ts";
import type { OwnFiles } from "./own-files.ts";
import { readerActivation, recordingExtension, type Voice, type VoiceOutcome } from "./voice.ts";

/**
 * The shell's side of the port: it validates every message from the frame,
 * carries bridge calls and submissions to the host with the action token,
 * shows host-authored confirmations, and executes host-validated navigation.
 * It reads the config at each call, so a document switch needs nothing here.
 * spec R3.5–R3.7, R3.17
 */
export interface RelayDeps {
  config: ShellConfig;
  confirmer: Confirmer;
  navigator: Navigator;
  onDirty(dirty: boolean): void;
  /** A link to another document of the page; the path is already validated. spec R1.12a */
  onOpenDocument?(path: string): void;
  /** The reader answered from the page — a form, `session.reply`, or an answer inside an embed. spec R2.17a */
  onAnswered?(): void;
  /** Where the document is scrolled to. spec R2.18b */
  onScroll?(x: number, y: number): void;
  /** The page's own files: opened, downloaded, or fetched for a large media element. spec R4.15b, R4.25a */
  ownFiles?: OwnFiles;
  /** The reader granted this page answers into another session. spec R5.64 */
  onGranted?(grant: { sessionId: string; title: string }): void;
  /** The shell's recorder and its bar. spec R3.32, D38 */
  voice?: Voice;
  /** Whether the shell's own document has the reader's activation now. spec R3.32a */
  readerActed?(): boolean;
  /** The shell's status line, for what the reader must be told. spec R2.44 */
  onStatus?(text: string, warn: boolean): void;
  fetchImpl?: typeof fetch;
}

/** The capabilities that carry files, and the one the recording bar confirms. */
const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send"]);
const VOICE_METHOD = "voice.captureAndTranscribe";

/** Capabilities whose success means the reader answered an agent. */
const ANSWERS: ReadonlySet<string> = new Set(["session.reply", "pages.answer"]);

export interface Relay {
  handle(port: MessagePort, data: unknown): void;
}

type Directive = { kind: "page" | "host" | "external"; url: string };

export function createRelay(deps: RelayDeps): Relay {
  const { config, confirmer, navigator } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readerActed = deps.readerActed ?? (() => readerActivation(globalThis as unknown as Window));

  function reply(port: MessagePort, message: ShellMessage): void {
    port.postMessage(message);
  }

  async function postBridge(body: unknown): Promise<unknown> {
    const response = await fetchImpl(config.bridgeUrl, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json().catch(() => null);
  }

  function directiveOf(value: unknown): Directive | null {
    if (!isRecord(value)) return null;
    if ((value.kind !== "page" && value.kind !== "host" && value.kind !== "external") || typeof value.url !== "string") return null;
    if (value.kind === "external" && !/^https?:\/\//i.test(value.url)) return null;
    if (value.kind !== "external" && !value.url.startsWith("/")) return null;
    return { kind: value.kind, url: value.url };
  }

  function deliver(port: MessagePort, request: BridgeRequestMessage, body: unknown): void {
    if (!isRecord(body) || !isBridgeResponse(body.response, request.id)) {
      reply(port, makeFailure(request.id, "invalid_response", "The Thread Page bridge returned an invalid response"));
      return;
    }
    const directive = body.navigate === undefined ? null : directiveOf(body.navigate);
    if (body.response.ok && directive) {
      reply(port, body.response);
      if (directive.kind === "external") navigator.external(directive.url);
      else navigator.inPlace(directive.url);
      return;
    }
    navigator.release();
    reply(port, body.response);
  }

  async function relayBridge(port: MessagePort, message: BridgeRequestMessage, activated: boolean): Promise<void> {
    const files = message.files ?? [];
    let request: BridgeRequestMessage = message;
    if (message.files !== undefined) {
      // The files ride beside the JSON; the host is told what they are, as the shell reads them. spec R5.75, R3.20a
      const problem = filesProblem(message);
      if (problem) {
        reply(port, makeFailure(message.id, problem.code, problem.message));
        return;
      }
      request = { v: message.v, id: message.id, method: message.method, params: { ...(message.params as Record<string, unknown>), files: files.map(describeFile) }, pageRevision: message.pageRevision };
    }
    try {
      const first = await postBridge({ actionToken: config.actionToken, request });
      if (isRecord(first) && isRecord(first.record)) {
        await relayRecording(port, request, first.record, activated);
        return;
      }
      if (isRecord(first) && isRecord(first.confirm)) {
        const confirm = first.confirm;
        if (typeof confirm.challenge !== "string" || typeof confirm.summary !== "string" || confirm.requestId !== request.id) {
          reply(port, makeFailure(request.id, "invalid_response", "The Thread Page bridge returned an invalid confirmation"));
          return;
        }
        const external = request.method === "navigation.openExternal";
        // A grant is asked for once per pair, in the same chrome, under its own heading. spec R5.64
        const grant = confirm.kind === "grant" && isRecord(confirm.grant) && typeof confirm.grant.sessionId === "string" && typeof confirm.grant.title === "string"
          ? { sessionId: confirm.grant.sessionId, title: confirm.grant.title }
          : null;
        const approved = await confirmer.confirm(
          confirm.summary,
          external ? () => navigator.reserveWindow() : undefined,
          grant ? { heading: "Allow answers from this page?", confirmLabel: "Allow", cancelLabel: "Don’t allow" } : undefined,
        );
        if (!approved) {
          reply(port, makeFailure(request.id, "cancelled", grant ? "You did not allow it, so the answer was not sent" : "You declined this action"));
          return;
        }
        // Nothing uploads before the reader confirms; then exactly the approved files. spec R5.78, R3.20a
        if (files.length > 0 && !(await attachFiles(port, request, files, confirm.challenge))) return;
        const second = await postBridge({ actionToken: config.actionToken, request, confirmation: confirm.challenge });
        // The host records the grant when it accepts the challenge, whatever the answer itself then does.
        const refusedChallenge = isRecord(second) && isRecord(second.response) && isRecord(second.response.error) && second.response.error.code === "confirmation_invalid";
        if (grant && isRecord(second) && isRecord(second.response) && !refusedChallenge) deps.onGranted?.(grant);
        if (ANSWERS.has(request.method) && isRecord(second) && isRecord(second.response) && second.response.ok === true) deps.onAnswered?.();
        deliver(port, request, second);
        return;
      }
      if (ANSWERS.has(request.method) && isRecord(first) && isRecord(first.response) && first.response.ok === true) deps.onAnswered?.();
      deliver(port, request, first);
    } catch (error) {
      navigator.release();
      reply(port, makeFailure(request.id, "unavailable", error instanceof Error ? error.message : "The Thread Page bridge is unavailable"));
    }
  }

  function filesProblem(message: BridgeRequestMessage): { code: "invalid_request" | "invalid_params" | "request_too_large"; message: string } | null {
    const files = message.files ?? [];
    if (!FILE_METHODS.has(message.method)) return { code: "invalid_request", message: `${message.method} does not take files` };
    if (!isRecord(message.params) || "files" in message.params) return { code: "invalid_params", message: "files must be a FileList, an array of File, or an <input type=file>" };
    if (!files.every(isFileLike)) return { code: "invalid_params", message: "files must be a FileList, an array of File, or an <input type=file>" };
    if (files.length > LIMITS.promptFiles) return { code: "request_too_large", message: `At most ${LIMITS.promptFiles} files per call; this one has ${files.length}` };
    const large = files.find((file) => file.size > LIMITS.promptFileBytes);
    if (large) return { code: "request_too_large", message: `“${large.name}” is larger than ${mebibytes(LIMITS.promptFileBytes)}, the most one file may be` };
    const empty = files.find((file) => file.size === 0);
    if (empty) return { code: "invalid_params", message: `“${empty.name}” is empty` };
    return null;
  }

  /**
   * Stores each approved file as an attachment, in order. When one fails, what
   * was stored for the call is removed where the host can, nothing is started
   * or sent, and the page is told which file. spec R5.79
   */
  async function attachFiles(port: MessagePort, request: BridgeRequestMessage, files: File[], challenge: string): Promise<boolean> {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index] as File;
      deps.onStatus?.(`Attaching ${index + 1} of ${files.length}…`, false);
      let failure: { code: string; message: string } | null = null;
      try {
        const response = await fetchImpl(config.attachUrl, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionToken: config.actionToken, request, confirmation: challenge, index, content: await encodeBase64(file) }),
        });
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!response.ok || !body || body.ok !== true) {
          failure = { code: typeof body?.code === "string" ? body.code : "", message: typeof body?.message === "string" && body.message ? body.message : `Upload failed (${response.status})` };
        }
      } catch (error) {
        failure = { code: "", message: error instanceof Error && error.message ? error.message : "Upload failed" };
      }
      if (failure) {
        deps.onStatus?.("", false);
        await fetchImpl(config.attachUrl, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionToken: config.actionToken, request, confirmation: challenge, discard: true }),
        }).catch(() => undefined);
        const code = failure.code === "request_too_large" ? "request_too_large" : "handler_error";
        reply(port, makeFailure(request.id, code, `Could not attach “${file.name}”: ${failure.message}. Nothing was started or sent.`));
        return false;
      }
    }
    deps.onStatus?.("", false);
    return true;
  }

  /**
   * `voice.captureAndTranscribe`, once the host has validated it: the bar
   * opens, and its Done is the confirmation. The audio goes to the host's
   * transcriber; the page gets the text, and the recording itself only when it
   * asked. spec R5.68–R5.73
   */
  async function relayRecording(port: MessagePort, request: BridgeRequestMessage, record: Record<string, unknown>, activated: boolean): Promise<void> {
    const params = isRecord(record.params) ? record.params : {};
    if (record.requestId !== request.id || !deps.voice) {
      reply(port, makeFailure(request.id, deps.voice ? "invalid_response" : "unavailable", deps.voice ? "The Thread Page bridge returned an invalid answer" : "This page cannot record here."));
      return;
    }
    const seconds = typeof params.maxDurationSeconds === "number" ? params.maxDurationSeconds : LIMITS.voiceDefaultSeconds;
    const prompt = typeof params.prompt === "string" ? params.prompt : undefined;
    const language = typeof params.language === "string" ? params.language : undefined;
    const outcome = await deps.voice.capture({ maxDurationSeconds: seconds, activated, purpose: "capability" }, async (recording) => {
      const text = await deps.voice!.transcribe({ blob: recording.blob, type: recording.type, ...(prompt ? { prompt } : {}), ...(language ? { language } : {}) });
      return { text, recording };
    });
    if (!outcome.ok) {
      reply(port, makeFailure(request.id, outcome.code, outcome.message));
      return;
    }
    // The Blob crosses by structured clone, beside the JSON result. spec R5.73
    const result = params.keepAudio === true ? { text: outcome.value.text, audio: outcome.value.recording.blob } : { text: outcome.value.text };
    reply(port, { v: 1, id: request.id, ok: true, result });
  }

  /** Dictate and the audio capture input: the kernel's own asks, answered on the same port. spec R4.58, R4.24a */
  async function relayRecord(port: MessagePort, data: Record<string, unknown>, activated: boolean): Promise<void> {
    const id = data.id as string;
    const answer = (message: RecordedMessage) => reply(port, message);
    if (!deps.voice) {
      answer({ kind: "thread-page:recorded", id, ok: false, code: "unavailable", message: "This page cannot record here." });
      return;
    }
    const voice = deps.voice;
    const prompt = typeof data.prompt === "string" ? data.prompt.slice(-LIMITS.voicePromptChars) : "";
    let outcome: VoiceOutcome<{ text?: string; file?: File }>;
    if (data.purpose === "audio") {
      outcome = await voice.capture({ maxDurationSeconds: LIMITS.voiceDefaultSeconds, activated, purpose: "audio" }, async (recording) => {
        const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
        return { file: new File([recording.blob], `recording-${stamp}.${recordingExtension(recording.type)}`, { type: recording.type }) };
      });
    } else {
      outcome = await voice.capture({ maxDurationSeconds: LIMITS.voiceDefaultSeconds, activated, purpose: "dictate" }, async (recording) => ({
        text: await voice.transcribe({ blob: recording.blob, type: recording.type, ...(prompt ? { prompt } : {}) }),
      }));
    }
    if (!outcome.ok) {
      answer({ kind: "thread-page:recorded", id, ok: false, code: outcome.code, message: outcome.message });
      return;
    }
    answer({ kind: "thread-page:recorded", id, ok: true, ...outcome.value });
  }

  async function uploadOne(entry: SubmitFile): Promise<{ field: string; name: string; path: string; sizeBytes: number }> {
    const file = entry.file;
    if (!file || typeof file.size !== "number") throw new Error("Attachment is not a file");
    const label = file.name || "file";
    if (file.size <= 0) throw new Error(`Attachment ${label} is empty`);
    if (file.size > config.maxUploadBytes) throw new Error(`Attachment ${label} is larger than ${Math.round(config.maxUploadBytes / (1024 * 1024))} MiB`);
    const content = await encodeBase64(file);
    const response = await fetchImpl(config.uploadUrl, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionToken: config.actionToken, pageRevision: config.pageRevision, name: label, content }),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !body || body.ok !== true || typeof body.name !== "string" || typeof body.path !== "string" || typeof body.sizeBytes !== "number") {
      throw new Error((body && typeof body.message === "string" && body.message) || `Upload failed (${response.status})`);
    }
    return { field: String(entry.field || "file").slice(0, 128), name: body.name, path: body.path, sizeBytes: body.sizeBytes };
  }

  async function relaySubmit(port: MessagePort, data: Record<string, unknown>): Promise<void> {
    const submissionId = typeof data.submissionId === "string" ? data.submissionId : "";
    try {
      const entries = (Array.isArray(data.files) ? data.files : []) as SubmitFile[];
      // Refused visibly, never cut short. spec R4.23, R4.62
      if (entries.length > config.maxUploads) throw new Error(`This form has ${entries.length} files; at most ${config.maxUploads} can be sent at once`);
      const files: { field: string; name: string; path: string; sizeBytes: number; transcript?: string | null }[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        reply(port, { kind: "thread-page:submit-progress", submissionId, message: `Uploading ${index + 1} of ${entries.length}…` });
        files.push(await uploadOne(entries[index] as SubmitFile));
      }
      // A recording's transcript goes beside its path; one that cannot be made is said to be missing. spec R4.24b
      const recordings = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.transcribe === true);
      for (let turn = 0; turn < recordings.length; turn += 1) {
        const { entry, index } = recordings[turn] as { entry: SubmitFile; index: number };
        const stored = files[index] as (typeof files)[number];
        reply(port, { kind: "thread-page:submit-progress", submissionId, message: `Transcribing ${turn + 1} of ${recordings.length}…` });
        stored.transcript = deps.voice && config.voice.available ? await deps.voice.transcribe({ upload: stored.path, type: entry.file.type || "audio/webm" }).catch(() => null) : null;
      }
      if (files.length > 0) reply(port, { kind: "thread-page:submit-progress", submissionId, message: "Sending…" });
      const response = await fetchImpl(config.submitUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionToken: config.actionToken,
          submissionId,
          pageRevision: config.pageRevision,
          title: data.title,
          answers: data.answers,
          files,
        }),
      });
      const body = (await response.json().catch(() => ({ ok: false, message: "Invalid server response" }))) as Record<string, unknown>;
      const ok = response.ok && body.ok === true;
      if (ok) deps.onAnswered?.();
      reply(port, {
        kind: "thread-page:submit-result",
        submissionId,
        ok,
        message: sentMessage(body.delivery),
        error: typeof body.message === "string" ? body.message : `Request failed (${response.status})`,
      });
    } catch (error) {
      reply(port, { kind: "thread-page:submit-result", submissionId, ok: false, error: error instanceof Error ? error.message : "Request failed" });
    }
  }

  return {
    handle(port, data) {
      if (!isRecord(data)) return;
      if (data.kind === "thread-page:dirty") {
        deps.onDirty(true);
        return;
      }
      if (data.kind === "thread-page:clean") {
        deps.onDirty(false);
        return;
      }
      if (data.kind === "thread-page:submit") {
        void relaySubmit(port, data);
        return;
      }
      if (data.kind === "thread-page:scroll") {
        if (isScrollMessage(data)) deps.onScroll?.(data.x, data.y);
        return;
      }
      if (data.kind === "thread-page:apply-update") return;
      if (data.kind === "thread-page:open-file") {
        deps.ownFiles?.open(data.path, data.download, data.name);
        return;
      }
      if (data.kind === "thread-page:file-request") {
        if (deps.ownFiles) void deps.ownFiles.fetchFor(port, data.id, data.path);
        return;
      }
      if (data.kind === "thread-page:open-document") {
        if (isDocumentPath(data.path)) deps.onOpenDocument?.(data.path);
        return;
      }
      if (data.kind === "thread-page:record") {
        if (!isValidRequestId(data.id) || (data.purpose !== "dictate" && data.purpose !== "audio")) return;
        // The reader's gesture, as the shell's own document sees it, when the ask arrives. spec R3.32a
        void relayRecord(port, data, readerActed());
        return;
      }
      if (!isBridgeRequest(data, config.pageRevision)) {
        reply(port, makeFailure(data.id, "invalid_request", "Invalid Thread Page bridge request"));
        return;
      }
      void relayBridge(port, data, data.method === VOICE_METHOD ? readerActed() : false);
    },
  };
}

/** A file as the confirmation names it and the challenge binds it: name, size and type as the shell reads them. spec R3.20a */
export function describeFile(file: File): { name: string; size: number; type: string } {
  return { name: file.name || "file", size: file.size, type: file.type || "" };
}
