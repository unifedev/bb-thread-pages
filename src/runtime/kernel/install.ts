import { HANDSHAKE_VERSION, isRecord, type KernelConfig, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import { installAnchorInterception } from "./anchors.ts";
import { installApi } from "./api.ts";
import { createBridgeClient } from "./bridge-client.ts";
import { createDirtyTracker } from "./dirty.ts";
import { buildIntent, capturedForms, isManualForm, lockForm, prepareForm, statusLine, unlockForm, type PendingForm } from "./forms.ts";
import { createReadOnlyController } from "./readonly.ts";

/**
 * Wires the kernel into a document. Exported separately from `main.ts` so
 * tests can install it into a jsdom window with a fake port.
 */
export interface KernelHandle {
  /** For tests: deliver a shell message as if it arrived on the port. */
  deliver(message: ShellMessage): void;
  /** For tests: connect a port-like object the way the handshake would. */
  connect(port: Pick<MessagePort, "postMessage"> & Partial<Pick<MessagePort, "start" | "onmessage">>): void;
}

export function installKernel(win: Window & typeof globalThis, config: KernelConfig): KernelHandle {
  const doc = win.document;
  let port: MessagePort | null = null;
  const pendingForms = new Map<string, PendingForm>();
  const pendingByForm = new WeakSet<HTMLFormElement>();

  function post(message: KernelMessage): boolean {
    if (!port) return false;
    try {
      port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  const dirty = createDirtyTracker((isDirty) => {
    post({ kind: isDirty ? "thread-page:dirty" : "thread-page:clean" });
  });
  const bridge = createBridgeClient(config.pageRevision, doc);
  const readOnly = createReadOnlyController(doc, config.stale);

  installApi(win, {
    version: 1,
    invoke: (method, params) => bridge.invoke(method, params),
    watch: (method, params, listener, options) => bridge.watch(method, params, listener, options),
    setDirty: (value) => dirty.setCustom(value !== false),
  });

  function prepare(root: ParentNode): void {
    for (const form of capturedForms(root)) prepareForm(form);
    readOnly.prepare(root);
  }

  prepare(doc);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => prepare(doc), { once: true });
  if (typeof win.MutationObserver === "function" && doc.documentElement) {
    const observer = new win.MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === 1) prepare(node as Element);
        }
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function markDirty(event: Event): void {
    const target = event.target as Element | null;
    const form = target?.closest?.("form");
    if (!form || isManualForm(form)) return;
    dirty.markForm(form);
  }
  doc.addEventListener("input", markDirty, true);
  doc.addEventListener("change", markDirty, true);

  doc.addEventListener(
    "submit",
    (event) => {
      const form = event.target as Element | null;
      if (!form || form.tagName?.toLowerCase() !== "form" || isManualForm(form)) return;
      event.preventDefault();
      if (readOnly.isReadOnly() || pendingByForm.has(form as HTMLFormElement)) return;
      const submissionId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const target = form as HTMLFormElement;
      const intent = buildIntent(target, (event as SubmitEvent).submitter ?? null, submissionId);
      const pending: PendingForm = { form: target, disabled: [], dirtyVersion: dirty.versionOf(target) };
      pendingForms.set(submissionId, pending);
      pendingByForm.add(target);
      statusLine(target).textContent = intent.files.length > 0 ? "Uploading…" : "Sending…";
      pending.disabled = lockForm(target);
      const sent = post({ kind: "thread-page:submit", submissionId, title: intent.title, answers: intent.answers, files: intent.files });
      if (!sent) {
        pendingForms.delete(submissionId);
        pendingByForm.delete(target);
        unlockForm(pending.disabled);
        statusLine(target).textContent = "Page connection is not ready; try again in a moment.";
      }
    },
    true,
  );

  installAnchorInterception(doc, (url, label) => {
    void bridge.invoke("navigation.openExternal", label ? { url, label } : { url }).catch(() => undefined);
  });

  function onShellMessage(data: unknown): void {
    if (!isRecord(data)) return;
    if (data.kind === "thread-page:source-state") {
      readOnly.apply(data.stale === true);
      return;
    }
    if (data.kind === "thread-page:submit-progress") {
      const pending = typeof data.submissionId === "string" ? pendingForms.get(data.submissionId) : undefined;
      if (pending) statusLine(pending.form).textContent = String(data.message ?? "Working…").slice(0, 160);
      return;
    }
    if (data.kind === "thread-page:submit-result") {
      const pending = typeof data.submissionId === "string" ? pendingForms.get(data.submissionId) : undefined;
      if (!pending) return;
      pendingForms.delete(data.submissionId as string);
      pendingByForm.delete(pending.form);
      const ok = data.ok === true;
      statusLine(pending.form).textContent = ok ? String(data.message ?? "Sent").slice(0, 160) : String(data.error ?? "Could not send").slice(0, 160);
      unlockForm(pending.disabled);
      if (readOnly.isReadOnly()) readOnly.apply(true);
      if (ok) dirty.clearForm(pending.form, pending.dirtyVersion);
      return;
    }
    bridge.receive(data);
  }

  function connect(next: MessagePort): void {
    port = next;
    next.onmessage = (message) => onShellMessage(message.data);
    next.start?.();
    bridge.attach((request) => {
      next.postMessage(request);
    });
    if (dirty.isDirty()) post({ kind: "thread-page:dirty" });
  }

  function acceptPort(event: MessageEvent): void {
    if (port || event.source !== win.parent) return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:connect" || data.version !== HANDSHAKE_VERSION || !event.ports || event.ports.length !== 1) return;
    event.stopImmediatePropagation();
    const next = event.ports[0];
    if (next) connect(next);
  }
  win.addEventListener("message", acceptPort, true);

  if (config.stale) readOnly.apply(true);
  win.parent.postMessage({ kind: "thread-page:ready", version: HANDSHAKE_VERSION }, "*");

  return { deliver: (message) => onShellMessage(message), connect: (fake) => connect(fake as MessagePort) };
}
