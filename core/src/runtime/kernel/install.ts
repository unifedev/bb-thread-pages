// Wires everything: forms, dirty, typing, drafts, scroll, anchors, text areas, embeds, read-only, session state, the waiting-update mark, pong, fragment, restore handling; the home page's drafts and grants events (02 §The kernel; 05 R2.3a, R2.18d, R2.21, R2.24, R-S12; U49).
import { directoryOf, RESERVED_QUERY_NAMES } from "../../domain/document-path.ts";
import { FORM_GONE_STATUS, HANDSHAKE_VERSION, isRecord, sentMessage, UPDATE_DEFERRED_STATUS, type KernelConfig, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import { installAnchorInterception } from "./anchors.ts";
import { installApi } from "./api.ts";
import { installAudioInputs } from "./audio-input.ts";
import { createBridgeClient } from "./bridge-client.ts";
import { createChannel } from "./channel.ts";
import { createDirtyTracker } from "./dirty.ts";
import { createDrafts } from "./drafts.ts";
import { createEmbedManager, EMBEDDED_FILES_REFUSAL } from "./embed.ts";
import { buildIntent, capturedForms, clearStatusOverride, fileLimitProblem, formsReachedFrom, isManualForm, lockForm, newSubmissionId, ownerForm, prepareForm, setDeliveryStatus, setStatus, setUpdateStatus, tagOf, unlockForm, type FormControl } from "./forms.ts";
import { createLargeMedia } from "./large-media.ts";
import { installOwnFetch } from "./own-fetch.ts";
import { capturePrimitives, type KernelPrimitives } from "./primitives.ts";
import { createReadOnlyController, type ReadOnlyCause } from "./readonly.ts";
import { createRecordClient } from "./record-client.ts";
import { createRestorer } from "./restore.ts";
import { installScroll } from "./scroll.ts";
import { createSessionState } from "./session-state.ts";
import { createTextAreaControls } from "./textareas.ts";
import { createTypingTracker } from "./typing.ts";

/** Set on `<html>` while a newer version waits for the reader to pause typing; the DOM event of the same name fires on the document. 05 R2.21; U49 */
export const UPDATE_ATTRIBUTE = "data-thread-page-update";
export const UPDATE_EVENT = "thread-page:update";
/** The home page's events: the lists it is handed, and the reader's acts it forwards. 05 R-S12 */
export const DRAFTS_EVENT = "thread-page:drafts";
export const DRAFT_DISCARD_EVENT = "thread-page:draft-discard";
export const GRANTS_EVENT = "thread-page:grants";
export const GRANT_REVOKE_EVENT = "thread-page:grant-revoke";

export interface KernelHandle {
  /** For tests: deliver a shell message as if it arrived on the port. */
  deliver(message: ShellMessage): void;
  /** For tests: connect a port-like object the way the handshake would. */
  connect(port: Pick<MessagePort, "postMessage"> & Partial<Pick<MessagePort, "start" | "onmessage">>): void;
}

interface PendingForm {
  form: HTMLFormElement;
  disabled: FormControl[];
  dirtyVersion: number | undefined;
}

/** The page root's URL from the configured document directory URL. DESIGN §C.4 `siteRoot` */
export function rootUrlOf(siteRoot: string | null, documentPath: string): string | null {
  if (!siteRoot) return null;
  const base = siteRoot.endsWith("/") ? siteRoot : `${siteRoot}/`;
  const directory = directoryOf(documentPath);
  return directory && base.endsWith(directory) ? base.slice(0, base.length - directory.length) : base;
}

export function installKernel(win: Window & typeof globalThis, config: KernelConfig, options: { primitives?: KernelPrimitives } = {}): KernelHandle {
  const prim = options.primitives ?? capturePrimitives(win);
  const doc = win.document;
  const embedded = config.embedded === true;
  const channel = createChannel(prim);
  const send = (message: KernelMessage, transfer?: Transferable[]) => channel.send(message, transfer);
  const pendingForms = new Map<string, PendingForm>();
  const pendingByForm = new WeakSet<HTMLFormElement>();
  const fileRequests = new Map<string, (answer: Extract<ShellMessage, { kind: "thread-page:file" }>) => void>();
  const rootUrl = rootUrlOf(config.siteRoot, config.documentPath);
  let voiceAvailable = false;
  let shown = false;
  let embedDirty = false;
  let updateAvailable = false;

  const dirty = createDirtyTracker(doc, prim, (isDirty, custom) => send(isDirty ? { kind: "thread-page:dirty", custom } : { kind: "thread-page:clean" }));
  const typing = createTypingTracker(doc, prim, config.swapIdleMs, send);
  const session = createSessionState(doc);
  const bridge = createBridgeClient({ pageRevision: config.pageRevision, send: (request) => send(request), nextId: () => channel.nextId("b"), document: doc });
  const initialCause: ReadOnlyCause = config.archived ? "archived" : config.stale ? "offline" : null;
  const readOnly = createReadOnlyController(doc, initialCause);
  const recorder = createRecordClient((message) => send(message), () => channel.nextId("r"));
  const drafts = createDrafts(win, { revision: config.pageRevision, send, prim, notice: (form, text) => notice(form, text) });
  const scroll = installScroll(win, prim, (state) => send({ kind: "thread-page:scroll", state }));
  const restorer = createRestorer(win, { drafts, scroll, send });
  const largeMedia = createLargeMedia(win, { send, nextId: () => channel.nextId("f"), embedded });

  const embeds = config.embedAvailable
    ? createEmbedManager(win, {
        invoke: (method, params) => bridge.invoke(method, params),
        setDirty: (value) => {
          dirty.setEmbedded(value);
          // Reported once per transition, like the page's own dirt. 02 R4.47
          if (value !== embedDirty) {
            embedDirty = value;
            send({ kind: "thread-page:embed-dirty", dirty: value });
          }
        },
        embedded,
        send,
        dictate: (prompt, fromControl) => recorder.request("dictate", { prompt, fromControl }),
        voiceAvailable: () => voiceAvailable,
        workingLabel: () => session.label(),
        prim,
      })
    : null;

  const textAreas = createTextAreaControls(win, {
    embedded,
    uploads: config.uploads !== false,
    isReadOnly: () => readOnly.isReadOnly(),
    dictate: (prompt, fromControl) => recorder.request("dictate", { prompt, fromControl }),
    primitives: prim,
    markDirty: (form) => {
      dirty.touch(form);
    },
  });
  installAudioInputs(win, { embedded, voiceAvailable: () => voiceAvailable, record: () => recorder.request("audio") });

  // The page's own `fetch` of a relative file goes through the shell where the file route refuses the frame. 05 R-S7a
  if (!config.ownFilesByFrame && !embedded) {
    installOwnFetch(win, {
      documentPath: config.documentPath,
      rootUrl,
      request: (path, method) =>
        new Promise((resolve) => {
          const id = channel.nextId("f");
          fileRequests.set(id, (answer) => resolve(answer.ok ? { ok: true, status: answer.status, contentType: answer.contentType, blob: answer.blob } : { ok: false, status: answer.status, error: answer.error }));
          send({ kind: "thread-page:file-request", id, path, purpose: "fetch", init: { method } });
        }),
    });
  }

  installApi(win, {
    version: 1,
    invoke: (method, params) => bridge.invoke(method, params),
    watch: (method, params, listener, options) => bridge.watch(method, params, listener, options),
    setDirty: (value) => dirty.setCustom(value !== false),
    ...(embeds ? { embed: (target: unknown, options: unknown) => embeds.embed(target, options) } : {}),
    setScope: (folder) => bridge.setScope(folder),
    get scope() {
      return bridge.scope();
    },
  });

  /** A notice for a form's status, or the first captured form's, or the document's. */
  function notice(form: HTMLFormElement | null, text: string): void {
    const target = form ?? capturedForms(doc)[0] ?? null;
    if (target) setStatus(target, text);
  }

  /** A newer version waits: the attribute, the event, and the line in the status of every form the reader touched or is in; none otherwise — the attribute says it (NS-10). Cleared when it no longer waits. 05 R2.21; U49 */
  function markUpdate(available: boolean): void {
    updateAvailable = available;
    if (available) doc.documentElement?.setAttribute(UPDATE_ATTRIBUTE, "available");
    else doc.documentElement?.removeAttribute(UPDATE_ATTRIBUTE);
    const forms = capturedForms(doc);
    const focused = ownerForm(doc.activeElement);
    const told = available ? new Set([...dirty.dirtyForms(), ...(focused ? [focused] : [])].filter((form) => !isManualForm(form))) : new Set<HTMLFormElement>();
    for (const form of forms) setUpdateStatus(form, told.has(form) ? UPDATE_DEFERRED_STATUS : null);
    try {
      doc.dispatchEvent(new win.CustomEvent(UPDATE_EVENT, { detail: { available } }));
    } catch {
      // A document that cannot take the event still has the attribute.
    }
  }

  function announce(name: string, detail: unknown): void {
    try {
      doc.dispatchEvent(new win.CustomEvent(name, { detail }));
    } catch {
      // Nothing to announce to.
    }
  }

  function prepare(root: ParentNode): void {
    for (const form of formsReachedFrom(root)) prepareForm(form);
    session.prepare(root);
    textAreas.prepare(root);
    largeMedia.prepare(root);
    readOnly.prepare(root);
  }

  // The reader's next input in a form clears an error or notice standing in its status (NS-8).
  prim.on(
    doc,
    "input",
    (event) => {
      const form = ownerForm(event.target as Element | null);
      if (form && !isManualForm(form) && !pendingByForm.has(form)) clearStatusOverride(form);
    },
    true,
  );

  prepare(doc);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => prepare(doc), { once: true });
  if (typeof win.MutationObserver === "function" && doc.documentElement) {
    new win.MutationObserver((records) => {
      for (const record of records) for (const node of Array.from(record.addedNodes)) if (node.nodeType === 1) prepare(node as Element);
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }

  // Escape in the page cancels an open recording bar. 05 R3.32
  prim.on(
    win,
    "keydown",
    (event) => {
      if (prim.key(event).key === "Escape") send({ kind: "thread-page:escape" });
      if (embedded && prim.trusted(event)) send({ kind: "thread-page:gesture", atMs: Date.now() });
    },
    true,
  );
  if (embedded) prim.on(win, "click", (event) => prim.trusted(event) && send({ kind: "thread-page:gesture", atMs: Date.now() }), true);

  // The home page's acts ride on DOM events; the shell honours them from the home alone. 05 R-S12
  prim.on(doc, DRAFT_DISCARD_EVENT, (event) => {
    const detail = (event as CustomEvent).detail as unknown;
    if (!isRecord(detail) || typeof detail.session !== "string" || typeof detail.documentPath !== "string" || typeof detail.key !== "string" || typeof detail.field !== "string") return;
    send({ kind: "thread-page:draft-discard", session: detail.session, documentPath: detail.documentPath, key: detail.key, field: detail.field });
  });
  prim.on(doc, GRANT_REVOKE_EVENT, (event) => {
    const detail = (event as CustomEvent).detail as unknown;
    if (!isRecord(detail) || typeof detail.from !== "string" || typeof detail.to !== "string") return;
    send({ kind: "thread-page:grant-revoke", from: detail.from, to: detail.to });
  });

  // --- fragments and queries. 01 R1.12f, R1.12g ---
  function ownQuery(): string {
    const params = new win.URLSearchParams(win.location.search);
    for (const name of RESERVED_QUERY_NAMES) params.delete(name);
    return params.toString();
  }
  function withoutOwnHostParameters(query: string): string {
    if (!query || query === "?") return "";
    const own = new win.URLSearchParams(win.location.search);
    const kept = query
      .slice(1)
      .split("&")
      .filter((pair) => {
        if (!pair) return false;
        const [name, value] = [...new win.URLSearchParams(pair).entries()][0] ?? ["", ""];
        return !(RESERVED_QUERY_NAMES.includes(name) && own.get(name) === value);
      });
    return kept.length > 0 ? `?${kept.join("&")}` : "";
  }
  let moving: string | null = null;
  function moveToFragment(fragment: string): void {
    if (embedded) {
      const id = fragment.slice(1);
      let name = id;
      try {
        name = decodeURIComponent(id);
      } catch {
        // As written.
      }
      (doc.getElementById(name) ?? doc.getElementById(id))?.scrollIntoView();
      return;
    }
    const here = win.location.href.split("#")[0] ?? "";
    let target: string;
    try {
      target = new win.URL(here + fragment).hash;
    } catch {
      return;
    }
    moving = target === win.location.hash ? null : target;
    win.location.replace(here + fragment);
  }
  if (!embedded) {
    prim.on(win, "hashchange", () => {
      const step = moving !== null && moving === win.location.hash;
      moving = null;
      send({ kind: "thread-page:fragment", fragment: win.location.hash, ...(step ? { step: true as const } : {}) });
    });
  }

  // --- submissions. 02 R4.5–R4.9, R-K6 ---
  prim.on(
    doc,
    "submit",
    (event) => {
      const form = event.target as Element | null;
      if (!form || tagOf(form) !== "form" || isManualForm(form)) return;
      prim.preventDefault(event);
      const target = form as HTMLFormElement;
      if (readOnly.isReadOnly() || pendingByForm.has(target)) return;
      const submissionId = newSubmissionId();
      const intent = buildIntent(target, (event as SubmitEvent).submitter ?? null, submissionId, textAreas.filesOf(target));
      if (embedded && intent.files.length > 0) {
        setStatus(target, EMBEDDED_FILES_REFUSAL);
        return;
      }
      const problem = fileLimitProblem(intent.files);
      if (problem) {
        setStatus(target, problem);
        return;
      }
      const pending: PendingForm = { form: target, disabled: [], dirtyVersion: dirty.versionOf(target) };
      pendingForms.set(submissionId, pending);
      pendingByForm.add(target);
      setStatus(target, intent.files.length > 0 ? "Uploading…" : "Sending…");
      pending.disabled = lockForm(target);
      drafts.flush();
      send({ kind: "thread-page:submit", submissionId, title: intent.title, writtenAgainst: config.pageRevision, formId: intent.identity.id, formTitle: intent.identity.title, action: intent.action, answers: intent.answers, files: intent.files });
    },
    true,
  );

  installAnchorInterception(
    doc,
    { documentPath: config.documentPath, rootUrl, embedded },
    {
      document: (path, fragment, linked) => {
        const query = withoutOwnHostParameters(linked);
        if (fragment && path === config.documentPath && new win.URLSearchParams(query).toString() === ownQuery()) {
          moveToFragment(fragment);
          return;
        }
        send({ kind: "thread-page:open-document", path, ...(fragment ? { fragment } : {}), ...(query ? { query } : {}) });
      },
      fragment: (fragment) => moveToFragment(fragment),
      file: (path, download, name) => {
        send({ kind: "thread-page:open-file", path, download, name });
      },
      external: (url, label) => {
        void bridge.invoke("navigation.openExternal", label ? { url, label } : { url }).catch(() => undefined);
      },
      handler: (url) => {
        try {
          win.open(url, "_blank", "noopener,noreferrer");
        } catch {
          // A browser that refuses leaves the page as it was.
        }
      },
    },
  );

  function onShellMessage(message: ShellMessage): void {
    if (!("kind" in message)) {
      bridge.receive(message);
      return;
    }
    switch (message.kind) {
      case "thread-page:ping":
        send({ kind: "thread-page:pong", nonce: message.nonce });
        return;
      case "thread-page:source-state":
        readOnly.apply(message.archived ? "archived" : message.stale ? "offline" : null, message.reason);
        textAreas.update();
        return;
      case "thread-page:session-state": {
        const relabelled = message.label !== session.label();
        session.apply(message.working, message.label);
        if (relabelled) embeds?.setWorkingLabel();
        return;
      }
      case "thread-page:update":
        if (message.available !== updateAvailable) markUpdate(message.available);
        return;
      case "thread-page:drafts":
        announce(DRAFTS_EVENT, { drafts: message.leftovers });
        return;
      case "thread-page:grants":
        announce(GRANTS_EVENT, { grants: message.grants });
        return;
      case "thread-page:voice":
        voiceAvailable = message.available;
        textAreas.setVoice(voiceAvailable);
        embeds?.setVoice(voiceAvailable);
        return;
      case "thread-page:restore":
        restorer.restore(message);
        if (message.leftovers) announce(DRAFTS_EVENT, { drafts: message.leftovers });
        return;
      case "thread-page:restore-now":
        return;
      case "thread-page:flush":
        drafts.flush();
        scroll.flush();
        send({ kind: "thread-page:flushed", nonce: message.nonce });
        return;
      case "thread-page:shown":
        shown = true;
        restorer.shown();
        textAreas.update();
        return;
      case "thread-page:submit-progress": {
        const pending = pendingForms.get(message.submissionId);
        if (pending) setStatus(pending.form, message.message);
        return;
      }
      case "thread-page:submit-result": {
        const pending = pendingForms.get(message.submissionId);
        if (!pending) return;
        pendingForms.delete(message.submissionId);
        pendingByForm.delete(pending.form);
        unlockForm(pending.disabled);
        if (message.ok) {
          setDeliveryStatus(pending.form, sentMessage(message.delivery));
          dirty.clearDelivered(pending.form, pending.dirtyVersion);
          drafts.forget(pending.form);
        } else if (message.error === "stale_page") setStatus(pending.form, FORM_GONE_STATUS);
        else setStatus(pending.form, message.message || "Could not send; your text is kept.");
        if (readOnly.isReadOnly()) readOnly.prepare(pending.form);
        textAreas.update();
        return;
      }
      case "thread-page:file": {
        if (largeMedia.receive(message)) return;
        const settle = fileRequests.get(message.id);
        if (settle) {
          fileRequests.delete(message.id);
          settle(message);
        }
        return;
      }
      case "thread-page:recorded":
        recorder.receive(message);
        return;
      case "thread-page:draft-notice":
        notice(null, message.text);
        return;
      default:
        return;
    }
  }
  channel.onMessage(onShellMessage);

  // The handshake: this runtime makes the channel and hands one end to the shell in its `ready`. 05 R2.3a
  if (typeof win.MessageChannel === "function" && win.parent && win.parent !== win) {
    const pair = new win.MessageChannel();
    channel.connect(pair.port1);
    win.parent.postMessage({ kind: "thread-page:ready", v: HANDSHAKE_VERSION, pageRevision: config.pageRevision, documentPath: config.documentPath, embedded }, "*", [pair.port2]);
  }

  return {
    deliver: (message) => onShellMessage(message),
    connect: (port) => channel.connect(port),
  };
}

