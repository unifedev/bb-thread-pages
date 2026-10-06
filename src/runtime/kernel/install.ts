import { RESERVED_QUERY_NAMES } from "../../domain/document-path.ts";
import { HANDSHAKE_VERSION, isRecord, type KernelConfig, type KernelMessage, type ShellMessage } from "../shared/protocol.ts";
import { installAnchorInterception } from "./anchors.ts";
import { installApi } from "./api.ts";
import { createBridgeClient } from "./bridge-client.ts";
import { createDirtyTracker } from "./dirty.ts";
import { createEmbedManager, EMBEDDED_FILES_REFUSAL } from "./embed.ts";
import { installAudioInputs } from "./audio-input.ts";
import { buildIntent, fileLimitProblem, formsReachedFrom, isManualForm, lockForm, ownerForm, prepareForm, statusLine, unlockForm, type PendingForm } from "./forms.ts";
import { createLargeMedia } from "./large-media.ts";
import { capturePrimitives, type KernelPrimitives } from "./primitives.ts";
import { createReadOnlyController } from "./readonly.ts";
import { createRecordClient } from "./record-client.ts";
import { createTextAreaControls } from "./textareas.ts";
import { installScroll } from "./scroll.ts";
import { createUpdateOffer } from "./update-offer.ts";

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

export function installKernel(win: Window & typeof globalThis, config: KernelConfig, options: { primitives?: KernelPrimitives } = {}): KernelHandle {
  // Taken before any page script runs: the port is reached only through these. See primitives.ts.
  // Tests may hand in stand-ins, since jsdom makes no trusted event.
  const prim = options.primitives ?? capturePrimitives(win);
  const parentWindow = win.parent;
  const doc = win.document;
  let port: MessagePort | null = null;
  const pendingForms = new Map<string, PendingForm>();
  const pendingByForm = new WeakSet<HTMLFormElement>();

  function post(message: KernelMessage): boolean {
    if (!port) return false;
    try {
      prim.post(port, message);
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
  // The shell's recorder, asked for by Dictate and the audio capture input. D38
  const recorder = createRecordClient((message) => post(message));
  /** Whether the shell says the reader can record here. spec R4.59 */
  let voiceAvailable = false;

  const embeds = createEmbedManager(win, {
    invoke: (method, params) => bridge.invoke(method, params),
    setDirty: (value) => dirty.setEmbedded(value),
    embedded: config.embedded === true,
    dictate: (prompt) => recorder.request("dictate", prompt),
    voiceAvailable: () => voiceAvailable,
    escape: () => {
      post({ kind: "thread-page:escape" });
    },
  });
  const textAreas = createTextAreaControls(win, {
    embedded: config.embedded === true,
    uploads: config.uploads !== false,
    isReadOnly: () => readOnly.isReadOnly(),
    // Only the reader's own press on the kernel's control asks the shell to record at once. spec R3.32a
    dictate: (prompt, fromControl) => recorder.request("dictate", prompt, fromControl),
    primitives: prim,
    markDirty: (form) => {
      if (!isManualForm(form)) dirty.markForm(form);
    },
  });
  installAudioInputs(win, { embedded: config.embedded === true, voiceAvailable: () => voiceAvailable, record: () => recorder.request("audio") });
  const scroll = installScroll(win, (x, y) => {
    post({ kind: "thread-page:scroll", x, y });
  });
  // Inside an embed a new version is offered here, since there is no shell bar to offer it. spec R4.46
  const updateOffer = createUpdateOffer(doc, () => {
    post({ kind: "thread-page:apply-update" });
  });

  const largeMedia = createLargeMedia(win, { post: (message) => post(message), embedded: config.embedded === true });

  installApi(win, {
    version: 1,
    invoke: (method, params) => bridge.invoke(method, params),
    watch: (method, params, listener, options) => bridge.watch(method, params, listener, options),
    setDirty: (value) => dirty.setCustom(value !== false),
    embed: (target, options) => embeds.embed(target, options),
    setScope: (folder) => bridge.setScope(folder),
    get scope() {
      return bridge.scope();
    },
  });

  function prepare(root: ParentNode): void {
    for (const form of formsReachedFrom(root)) prepareForm(form);
    textAreas.prepare(root);
    largeMedia.prepare(root);
    readOnly.prepare(root);
    updateOffer.prepare();
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
    const form = ownerForm(event.target as Element | null);
    if (!form || isManualForm(form)) return;
    dirty.markForm(form);
  }
  // Escape in the page cancels an open recording bar, wherever the reader's focus is. spec R3.32
  win.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") post({ kind: "thread-page:escape" });
    },
    true,
  );
  /**
   * A link to a place in this document moves there with `location.replace`,
   * resolved against the document's own URL rather than the page's <base>: the
   * frame keeps no history of its own, which would not survive the shell
   * swapping the frame, and the shell adds the Back step instead. Inside an
   * embed the fragment is not carried: the link only scrolls. spec R1.12f
   */
  const URLOf = win.URL;
  const ParamsOf = win.URLSearchParams;
  /** The document's own query: its URL's, less the host's parameters. spec R1.12g */
  function ownQuery(): string {
    const params = new ParamsOf(win.location.search);
    for (const name of RESERVED_QUERY_NAMES) params.delete(name);
    return params.toString();
  }
  function sameQuery(query: string, own: string): boolean {
    return new ParamsOf(query).toString() === own;
  }
  /** The query less any of the host's parameters whose value is this document's own, kept as written otherwise. */
  function withoutOwnHostParameters(query: string): string {
    if (!query || query === "?") return "";
    const own = new ParamsOf(win.location.search);
    const kept = query
      .slice(1)
      .split("&")
      .filter((pair) => {
        if (!pair) return false;
        const [name, value] = [...new ParamsOf(pair).entries()][0] ?? ["", ""];
        return !(RESERVED_QUERY_NAMES.includes(name) && own.get(name) === value);
      });
    return kept.length > 0 ? `?${kept.join("&")}` : "";
  }
  let moving: string | null = null;
  function moveToFragment(fragment: string): void {
    if (config.embedded) {
      const id = fragment.slice(1);
      let name = id;
      try {
        name = decodeURIComponent(id);
      } catch {
        // An id as written.
      }
      (doc.getElementById(name) ?? doc.getElementById(id))?.scrollIntoView();
      return;
    }
    const here = win.location.href.split("#")[0] ?? "";
    let target: string;
    try {
      target = new URLOf(here + fragment).hash;
    } catch {
      return;
    }
    // The same fragment again only scrolls: no hashchange follows, so nothing is awaited.
    moving = target === win.location.hash ? null : target;
    win.location.replace(here + fragment);
  }
  // The shell's address follows the document's fragment, so a reload or a shared link returns to it. A move
  // this kernel made adds a step to the shell's history; any other change only updates the address. spec R1.12f
  if (!config.embedded) {
    win.addEventListener("hashchange", () => {
      const step = moving !== null && moving === win.location.hash;
      moving = null;
      post({ kind: "thread-page:fragment", fragment: win.location.hash, ...(step ? { step: true as const } : {}) });
    });
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
      const intent = buildIntent(target, (event as SubmitEvent).submitter ?? null, submissionId, textAreas.filesOf(target));
      // Uploads take the shell's token, which names the page this one is shown in. spec R4.51
      if (config.embedded && intent.files.length > 0) {
        statusLine(target).textContent = EMBEDDED_FILES_REFUSAL;
        return;
      }
      // File inputs and text areas count together; over the limits the form is not sent. spec R4.62
      const tooMany = fileLimitProblem(intent.files);
      if (tooMany) {
        statusLine(target).textContent = tooMany;
        return;
      }
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

  installAnchorInterception(
    doc,
    {
      document: (path, fragment, linked) => {
        // A link that keeps the current parameters (`"tool.html" + location.search`) carries the host's own
        // session and path; they are dropped when they are this document's, and refused otherwise. spec R1.12g
        const query = withoutOwnHostParameters(linked);
        // The same document — path and query — at another fragment is a fragment navigation, as on any
        // site; another query is another load. spec R1.12f, R1.12g
        if (fragment && path === config.documentPath && sameQuery(query, ownQuery())) {
          moveToFragment(fragment);
          return;
        }
        post({ kind: "thread-page:open-document", path, ...(fragment ? { fragment } : {}), ...(query && query !== "?" ? { query } : {}) });
      },
      fragment: (fragment) => moveToFragment(fragment),
      file: (path, download, name) => {
        post({ kind: "thread-page:open-file", path, download, name });
      },
      external: (url, label) => {
        void bridge.invoke("navigation.openExternal", label ? { url, label } : { url }).catch(() => undefined);
      },
      // A popup of the reader's handler (mailto:, tel:), inside the click; it stays sandboxed. D34
      handler: (url) => {
        try {
          win.open(url, "_blank", "noopener,noreferrer");
        } catch {
          // A browser that refuses leaves the page as it was.
        }
      },
    },
    config.siteRoot ?? null,
    config.embedded === true,
    config.documentPath ?? null,
  );

  function onShellMessage(data: unknown): void {
    if (!isRecord(data)) return;
    // The shell asks after each load of the frame whether this document is still the one in it. D44
    if (data.kind === "thread-page:ping") {
      if (typeof data.nonce === "number") post({ kind: "thread-page:pong", nonce: data.nonce });
      return;
    }
    if (data.kind === "thread-page:source-state") {
      readOnly.apply(data.stale === true);
      textAreas.update();
      return;
    }
    if (data.kind === "thread-page:voice") {
      voiceAvailable = data.available === true;
      textAreas.setVoice(voiceAvailable);
      embeds.setVoice(voiceAvailable);
      return;
    }
    if (recorder.receive(data)) return;
    if (data.kind === "thread-page:restore-scroll") {
      if (typeof data.x === "number" && typeof data.y === "number") scroll.restore(data.x, data.y);
      return;
    }
    if (largeMedia.receive(data)) return;
    if (data.kind === "thread-page:update-available") {
      if (config.embedded) updateOffer.show();
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
    prim.listen(next, (message) => onShellMessage(prim.data(message)));
    bridge.attach((request) => {
      prim.post(next, request);
    });
    if (dirty.isDirty()) post({ kind: "thread-page:dirty" });
    largeMedia.flush();
  }

  if (config.stale) readOnly.apply(true);
  /**
   * The handshake: this runtime makes the channel, keeps one end, and hands
   * the other to the shell inside its `ready`, before any page script runs.
   * The shell takes a port only from the first `ready` of a frame it loaded,
   * and never posts one into a frame, so a document the frame is navigated to
   * later — a file with no runtime included — can never be handed this
   * channel: the end kept here dies with this document. The revision lets the
   * shell notice a document newer than its token. spec R2.3, R2.18d, D44
   */
  // Without channels (a test DOM) there is no handshake; the tests connect a port of their own.
  if (typeof win.MessageChannel === "function") {
    const channel = new win.MessageChannel();
    connect(channel.port1);
    parentWindow.postMessage({ kind: "thread-page:ready", version: HANDSHAKE_VERSION, revision: config.pageRevision }, "*", [channel.port2]);
  }

  return { deliver: (message) => onShellMessage(message), connect: (fake) => connect(fake as MessagePort) };
}
