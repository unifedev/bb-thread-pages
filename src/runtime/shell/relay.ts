import { isBridgeRequest, isBridgeResponse, isRecord, makeFailure, type BridgeRequestMessage, type ShellConfig, type ShellMessage, type SubmitFile } from "../shared/protocol.ts";
import type { Confirmer } from "./confirm.ts";
import type { Navigator } from "./navigate.ts";

/**
 * The shell's side of the port: it validates every message from the frame,
 * carries bridge calls and submissions to the host with the action token,
 * shows host-authored confirmations, and executes host-validated navigation.
 * spec R3.5–R3.7, R3.17
 */
export interface RelayDeps {
  config: ShellConfig;
  confirmer: Confirmer;
  navigator: Navigator;
  onDirty(dirty: boolean): void;
  fetchImpl?: typeof fetch;
}

export interface Relay {
  handle(port: MessagePort, data: unknown): void;
}

type Directive = { kind: "page" | "host" | "external"; url: string };

export function createRelay(deps: RelayDeps): Relay {
  const { config, confirmer, navigator } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

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

  async function relayBridge(port: MessagePort, request: BridgeRequestMessage): Promise<void> {
    try {
      const first = await postBridge({ actionToken: config.actionToken, request });
      if (isRecord(first) && isRecord(first.confirm)) {
        const confirm = first.confirm;
        if (typeof confirm.challenge !== "string" || typeof confirm.summary !== "string" || confirm.requestId !== request.id) {
          reply(port, makeFailure(request.id, "invalid_response", "The Thread Page bridge returned an invalid confirmation"));
          return;
        }
        const external = request.method === "navigation.openExternal";
        const approved = await confirmer.confirm(confirm.summary, external ? () => navigator.reserveWindow() : undefined);
        if (!approved) {
          reply(port, makeFailure(request.id, "cancelled", "You declined this action"));
          return;
        }
        const second = await postBridge({ actionToken: config.actionToken, request, confirmation: confirm.challenge });
        deliver(port, request, second);
        return;
      }
      deliver(port, request, first);
    } catch (error) {
      navigator.release();
      reply(port, makeFailure(request.id, "unavailable", error instanceof Error ? error.message : "The Thread Page bridge is unavailable"));
    }
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
      const entries = (Array.isArray(data.files) ? data.files : []).slice(0, config.maxUploads) as SubmitFile[];
      const files = [];
      for (let index = 0; index < entries.length; index += 1) {
        reply(port, { kind: "thread-page:submit-progress", submissionId, message: `Uploading ${index + 1} of ${entries.length}…` });
        files.push(await uploadOne(entries[index] as SubmitFile));
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
      reply(port, {
        kind: "thread-page:submit-result",
        submissionId,
        ok,
        message: typeof body.delivery === "string" ? `Sent (${body.delivery})` : "Sent",
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
      if (!isBridgeRequest(data, config.pageRevision)) {
        reply(port, makeFailure(data.id, "invalid_request", "Invalid Thread Page bridge request"));
        return;
      }
      void relayBridge(port, data);
    },
  };
}

async function encodeBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + chunk)));
  }
  return btoa(binary);
}
