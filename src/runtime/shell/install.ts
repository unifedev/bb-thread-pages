import { HANDSHAKE_VERSION, isRecord, type ShellConfig } from "../shared/protocol.ts";
import { createChromeActions } from "./actions.ts";
import { createConfirmer } from "./confirm.ts";
import { createNavigator } from "./navigate.ts";
import { createPoller, type Poller } from "./poll.ts";
import { createRelay } from "./relay.ts";

/**
 * Wires the shell: loads the document into the sandboxed frame, hands it one
 * MessagePort once it reports ready, relays its messages, polls for a new
 * revision, and owns the chrome. spec 02 §The shell
 */
export interface ShellElements {
  frame: HTMLIFrameElement;
  status: HTMLElement;
  work: HTMLElement;
  reload: HTMLButtonElement;
  dialog: HTMLDialogElement;
  acts: HTMLElement;
  pin: HTMLButtonElement;
  read: HTMLButtonElement;
  archive: HTMLButtonElement;
  title: HTMLElement;
}

export interface ShellHandle {
  poller: Poller;
}

export function installShell(win: Window & typeof globalThis, config: ShellConfig, elements: ShellElements, fetchImpl?: typeof fetch): ShellHandle {
  const { frame, status, work, reload, dialog, acts, pin, read, archive, title } = elements;
  let framePort: MessagePort | null = null;
  let awaitingReady = true;
  let lastStale = config.stale;

  const view = {
    setStatus(text: string, warn: boolean) {
      status.textContent = text;
      status.dataset.tone = warn ? "warn" : "";
    },
    setWorking(working: boolean) {
      work.dataset.visible = working && config.workingLabel ? "true" : "false";
    },
    showReload(visible: boolean) {
      reload.dataset.visible = visible ? "true" : "false";
    },
    onStaleChanged(stale: boolean) {
      lastStale = stale;
      framePort?.postMessage({ kind: "thread-page:source-state", stale });
    },
    reloadView() {
      win.location.reload();
    },
  };

  const poller = createPoller(win, config, view, fetchImpl);
  const navigator = createNavigator(win);
  const confirmer = createConfirmer(dialog);
  const relay = createRelay({ config, confirmer, navigator, onDirty: (dirty) => poller.setDirty(dirty), ...(fetchImpl ? { fetchImpl } : {}) });
  const homeLink = win.document.querySelector<HTMLAnchorElement>("a.home");
  createChromeActions(config, { acts, pin, read, archive, title }, {
    confirmer,
    view: {
      setStatus: (text, warn) => view.setStatus(text, warn),
      navigateAway: () => {
        if (homeLink?.href) win.location.assign(homeLink.href);
        else win.location.reload();
      },
    },
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  function connectFrame(): void {
    const channel = new win.MessageChannel();
    const port = channel.port1;
    framePort = port;
    port.onmessage = (event) => relay.handle(port, event.data);
    port.start?.();
    frame.contentWindow?.postMessage({ kind: "thread-page:connect", version: HANDSHAKE_VERSION }, "*", [channel.port2]);
    port.postMessage({ kind: "thread-page:source-state", stale: lastStale });
  }

  win.addEventListener("message", (event) => {
    // Only the frame's opaque origin, only once, only the handshake.
    if (!awaitingReady || event.origin !== "null" || event.source !== frame.contentWindow) return;
    const data = event.data as unknown;
    if (!isRecord(data) || data.kind !== "thread-page:ready" || data.version !== HANDSHAKE_VERSION) return;
    awaitingReady = false;
    connectFrame();
  });

  reload.addEventListener("click", () => win.location.reload());

  frame.src = config.documentUrl;
  poller.start();
  return { poller };
}
