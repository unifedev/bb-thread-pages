// Per-frame relay of bridge requests to `POST /bridge` with the frame's token and the kernel's `pageRevision`; confirmation and grant dialogs; `record` path; `navigate` directives; pre-show gating (reads only) (05 R3.5–R3.9, R3.17–R3.22a; DESIGN §D.1, §E.1 step 15).
import { LIMITS } from "../../domain/limits.ts";
import type { BridgeEnvelope, ChromeActionBody, DeclinedTarget } from "../shared/envelopes.ts";
import { isBridgeResponse, isRecord, makeFailure, type BridgeRequestMessage, type BridgeResponseMessage, type KernelMessage, type ShellConfig, type ShellMessage } from "../shared/protocol.ts";
import { attachFiles, describeFile, filesProblem } from "./attach.ts";
import { DECISION_WORDING, GRANT_WORDING, type Confirmer } from "./confirm.ts";
import { REFUSED_WITHOUT_ACTION, type GestureDecision } from "./gesture.ts";
import type { Navigator } from "./navigate.ts";
import { recordingExtension, type Voice, type VoiceOutcome } from "./voice.ts";

/** The frame a request came from, as the relay needs it. */
export interface FrameContext {
  token(): string;
  /** The methods a frame may call before it is shown: reads and `context.get`. DR-12 */
  readMethods(): readonly string[];
  isShown(): boolean;
  /** Queues work until the frame is shown; dropped with the frame if it never is. */
  whenShown(work: () => void): void;
  post(message: ShellMessage): void;
}

export interface RelayDeps {
  config: ShellConfig;
  confirmer: Confirmer;
  navigator: Navigator;
  voice: Voice | null;
  readerGesture(options?: { control?: boolean }): GestureDecision;
  onGranted(grant: { sessionId: string; title: string }): void;
  onAnswered(): void;
  onStatus(text: string): void;
  /** The browser refused the new tab after the reader confirmed: the page stays, the shell shows the link. 03 R5.33 */
  onBlockedOpen(url: string): void;
  fetchImpl: typeof fetch;
}

export interface Relay {
  bridge(frame: FrameContext, request: BridgeRequestMessage): void;
  record(frame: FrameContext, message: Extract<KernelMessage, { kind: "thread-page:record" }>): void;
}

const FILE_METHODS: ReadonlySet<string> = new Set(["sessions.start", "sessions.send", "session.reply"]);
const ANSWERS: ReadonlySet<string> = new Set(["session.reply", "pages.answer", "session.respond", "sessions.respond"]);
const VOICE_METHOD = "voice.captureAndTranscribe";

type Directive = { kind: "page" | "host" | "external"; url: string };

/** A page directive is `/`-relative; an external one http(s); a host one either, since a provider's canonical session address may be absolute (03 R5.31a). */
export function directiveOf(value: unknown): Directive | null {
  if (!isRecord(value)) return null;
  if ((value.kind !== "page" && value.kind !== "host" && value.kind !== "external") || typeof value.url !== "string") return null;
  const relative = value.url.startsWith("/");
  const http = /^https?:\/\//i.test(value.url);
  if (value.kind === "page" && !relative) return null;
  if (value.kind === "external" && !http) return null;
  if (value.kind === "host" && !relative && !http) return null;
  return { kind: value.kind, url: value.url };
}

export function isReadCall(method: string, readMethods: readonly string[]): boolean {
  return method === "context.get" || readMethods.includes(method);
}

export function createRelay(deps: RelayDeps): Relay {
  const { config, confirmer, navigator } = deps;

  async function postBridge(token: string, request: BridgeRequestMessage, confirmation?: string): Promise<unknown> {
    const envelope: BridgeEnvelope = { actionToken: token, request: request as unknown as BridgeEnvelope["request"], ...(confirmation ? { confirmation } : {}) };
    const response = await deps.fetchImpl(config.routes.bridge, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
    return response.json().catch(() => null);
  }

  async function declined(frame: FrameContext, requestId: string, target: DeclinedTarget): Promise<void> {
    // The decline never reaches the server as a call; the cooldown starts from the side channel only the shell holds. DR-10
    const body: ChromeActionBody = { actionToken: frame.token(), action: "declined", requestId, target };
    try {
      await deps.fetchImpl(config.routes.chromeAction, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      // The cooldown is a courtesy to the reader; the decline itself already held.
    }
  }

  function deliver(frame: FrameContext, request: BridgeRequestMessage, body: unknown): void {
    if (!isRecord(body) || !isBridgeResponse(body.response, request.id)) {
      navigator.release();
      frame.post(makeFailure(request.id, "invalid_response", "The bridge returned an invalid response"));
      return;
    }
    const response = body.response as BridgeResponseMessage;
    const directive = body.navigate === undefined ? null : directiveOf(body.navigate);
    frame.post(response);
    if (response.ok && directive) {
      if (directive.kind === "external") {
        if (!navigator.external(directive.url)) deps.onBlockedOpen(directive.url);
      } else navigator.inPlace(directive.url);
      return;
    }
    navigator.release();
  }

  async function relayBridge(frame: FrameContext, message: BridgeRequestMessage, gesture: GestureDecision): Promise<void> {
    const files = message.files ?? [];
    let request: BridgeRequestMessage = message;
    if (message.files !== undefined) {
      if (!FILE_METHODS.has(message.method) || !isRecord(message.params) || "files" in message.params) {
        frame.post(makeFailure(message.id, "invalid_params", `${message.method} does not take files this way`));
        return;
      }
      const problem = filesProblem(files);
      if (problem) {
        frame.post(makeFailure(message.id, problem.code, problem.message));
        return;
      }
      // The host is told about files only by the shell, from the files it holds. 05 R3.20a
      request = { v: message.v, id: message.id, method: message.method, params: { ...message.params, files: files.map(describeFile) }, pageRevision: message.pageRevision, ...(message.scope !== undefined ? { scope: message.scope } : {}) };
    }
    const withAttachments = (attachmentIds: string[]): BridgeRequestMessage => {
      const { files: _described, ...rest } = request.params as Record<string, unknown>;
      return { ...request, params: { ...rest, attachments: attachmentIds } };
    };
    try {
      // An own-session reply with files: the attachments go first under the token alone. DESIGN P29
      if (files.length > 0 && request.method === "session.reply") {
        const attached = await attachFiles(deps.fetchImpl, { ...config, actionToken: frame.token() }, { requestId: request.id, method: request.method }, files, deps.onStatus);
        if (!attached.ok) {
          frame.post(makeFailure(request.id, attached.code, attached.message));
          return;
        }
        request = withAttachments(attached.attachmentIds);
      }
      const first = await postBridge(frame.token(), request);
      if (isRecord(first) && isRecord(first.record)) {
        await relayRecording(frame, request, first.record, gesture);
        return;
      }
      if (isRecord(first) && isRecord(first.confirm)) {
        const confirm = first.confirm;
        if (typeof confirm.challenge !== "string" || typeof confirm.summary !== "string" || confirm.requestId !== request.id) {
          frame.post(makeFailure(request.id, "invalid_response", "The bridge returned an invalid confirmation"));
          return;
        }
        const grant = confirm.kind === "grant" && isRecord(confirm.grant) && typeof confirm.grant.sessionId === "string" && typeof confirm.grant.title === "string" ? { sessionId: confirm.grant.sessionId, title: confirm.grant.title } : null;
        const decision = confirm.kind === "decision";
        const external = request.method === "navigation.openExternal";
        const approved = await confirmer.confirm(confirm.summary, {
          ...(grant ? { wording: GRANT_WORDING, grant } : decision ? { wording: DECISION_WORDING } : {}),
          ...(external ? { onConfirmGesture: () => navigator.reserveWindow() } : {}),
        });
        if (!approved) {
          navigator.release();
          frame.post(makeFailure(request.id, "cancelled", grant ? "You did not allow it, so the answer was not sent" : "You declined this action"));
          const params = isRecord(request.params) ? request.params : {};
          if (grant) void declined(frame, request.id, { kind: "grant", session: grant.sessionId });
          else if (decision && typeof params.id === "string") void declined(frame, request.id, { kind: "decision", session: typeof params.sessionId === "string" ? params.sessionId : config.session, waitId: params.id });
          return;
        }
        if (files.length > 0 && request.method !== "session.reply") {
          const attached = await attachFiles(deps.fetchImpl, { ...config, actionToken: frame.token() }, { requestId: request.id, method: request.method, challenge: confirm.challenge }, files, deps.onStatus);
          if (!attached.ok) {
            navigator.release();
            frame.post(makeFailure(request.id, attached.code, attached.message));
            return;
          }
          request = withAttachments(attached.attachmentIds);
        }
        const second = await postBridge(frame.token(), request, confirm.challenge);
        const refusedChallenge = isRecord(second) && isRecord(second.response) && isRecord(second.response.error) && second.response.error.code === "confirmation_invalid";
        if (grant && isRecord(second) && isRecord(second.response) && !refusedChallenge) deps.onGranted(grant);
        if (ANSWERS.has(request.method) && isRecord(second) && isRecord(second.response) && second.response.ok === true) deps.onAnswered();
        deliver(frame, request, second);
        return;
      }
      if (ANSWERS.has(request.method) && isRecord(first) && isRecord(first.response) && first.response.ok === true) deps.onAnswered();
      deliver(frame, request, first);
    } catch (error) {
      navigator.release();
      frame.post(makeFailure(request.id, "unavailable", error instanceof Error && error.message ? error.message : "The bridge is unavailable"));
    }
  }

  /** `voice.captureAndTranscribe`, validated by the host: the bar opens, its Done is the confirmation. 03 R5.68–R5.73 */
  async function relayRecording(frame: FrameContext, request: BridgeRequestMessage, record: Record<string, unknown>, gesture: GestureDecision): Promise<void> {
    const params = isRecord(record.params) ? record.params : {};
    if (record.requestId !== request.id || !deps.voice) {
      frame.post(makeFailure(request.id, deps.voice ? "invalid_response" : "unavailable", deps.voice ? "The bridge returned an invalid answer" : "This page cannot record here."));
      return;
    }
    const voice = deps.voice;
    const seconds = typeof params.maxDurationSeconds === "number" ? params.maxDurationSeconds : LIMITS.voiceDefaultSeconds;
    const prompt = typeof params.prompt === "string" ? params.prompt : undefined;
    const language = typeof params.language === "string" ? params.language : undefined;
    const outcome = await voice.capture({ maxDurationSeconds: seconds, gesture, purpose: "capability" }, async (recording) => ({ text: await voice.transcribe({ blob: recording.blob, type: recording.type, ...(prompt ? { prompt } : {}), ...(language ? { language } : {}) }), recording }));
    if (!outcome.ok) {
      frame.post(makeFailure(request.id, outcome.code, outcome.message));
      return;
    }
    const result = params.keepAudio === true ? { text: outcome.value.text, audio: outcome.value.recording.blob } : { text: outcome.value.text };
    frame.post({ v: 1, id: request.id, ok: true, result });
  }

  /** Dictate and the audio capture input: the kernel's own asks, answered on the same port. 02 R4.58, R4.24a */
  async function relayRecord(frame: FrameContext, data: Extract<KernelMessage, { kind: "thread-page:record" }>, gesture: GestureDecision): Promise<void> {
    const id = data.id;
    if (!deps.voice) {
      frame.post({ kind: "thread-page:recorded", id, ok: false, code: "unavailable", message: "This page cannot record here." });
      return;
    }
    const voice = deps.voice;
    const prompt = (data.prompt ?? "").slice(-LIMITS.voicePromptChars);
    let outcome: VoiceOutcome<{ text?: string; file?: File }>;
    if (data.purpose === "audio") {
      outcome = await voice.capture({ maxDurationSeconds: data.maxDurationSeconds ?? LIMITS.voiceDefaultSeconds, gesture, purpose: "audio" }, async (recording) => {
        const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
        return { file: new File([recording.blob], `recording-${stamp}.${recordingExtension(recording.type)}`, { type: recording.type }) };
      });
    } else {
      outcome = await voice.capture({ maxDurationSeconds: data.maxDurationSeconds ?? LIMITS.voiceDefaultSeconds, gesture, purpose: "dictate" }, async (recording) => ({ text: await voice.transcribe({ blob: recording.blob, type: recording.type, ...(prompt ? { prompt } : {}), ...(data.language ? { language: data.language } : {}) }) }));
    }
    if (!outcome.ok) {
      frame.post({ kind: "thread-page:recorded", id, ok: false, code: outcome.code, message: outcome.message });
      return;
    }
    frame.post({ kind: "thread-page:recorded", id, ok: true, ...outcome.value });
  }

  return {
    bridge(frame, request) {
      // Reads may run while the frame loads behind the shown one; effects wait for the show. 05 R2.18a; DR-12
      if (frame.isShown() || isReadCall(request.method, frame.readMethods())) {
        void relayBridge(frame, request, request.method === VOICE_METHOD ? deps.readerGesture() : REFUSED_WITHOUT_ACTION);
        return;
      }
      frame.whenShown(() => void relayBridge(frame, request, request.method === VOICE_METHOD ? deps.readerGesture() : REFUSED_WITHOUT_ACTION));
    },
    record(frame, message) {
      // Only an embedded page's Dictate rides on `capability`; the kernel's own purposes come straight from the kernel.
      if (message.purpose === "capability") {
        frame.post({ kind: "thread-page:recorded", id: message.id, ok: false, code: "unavailable", message: "Recording for a capability is confirmed by the bridge, not asked for directly." });
        return;
      }
      const run = () => void relayRecord(frame, message, deps.readerGesture({ control: message.purpose === "dictate" && message.control === true }));
      if (frame.isShown()) run();
      else frame.whenShown(run);
    },
  };
}
