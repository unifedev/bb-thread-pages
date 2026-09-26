/**
 * Whether the reader has just acted in the page — not in the shell's own
 * chrome. spec R3.32a
 *
 * User Activation v2 propagates a gesture in the page frame to the shell, so
 * `navigator.userActivation.isActive` in the shell's own document is the
 * evidence the page cannot forge (measured in Chromium, Firefox and WebKit).
 * But the reader's own clicks and keys on the shell's chrome — the bar's
 * Cancel or Done, a dialog's buttons, the top bar — activate the shell too,
 * and a page could re-ask in that moment. The shell sees those gestures
 * itself, and after each one watches its own activation until it lapses:
 * until then, activation proves nothing about the page. Nothing the page does
 * reaches these listeners, and focus or pointer evidence was measured to be
 * forgeable or missing (the page frame can take focus without activation;
 * Chromium sends the shell no boundary events for the frame). After a bar or a
 * question closes, a short cooldown applies as well.
 *
 * Where the activation cannot be told to be the page's — in those windows, or
 * in an engine without the API — the bar is not refused but opened **armed**:
 * the microphone stays off until the reader presses Record in the bar itself,
 * a gesture in the shell's own chrome. With no activation at all, it is refused.
 *
 * One ask skips the windows: the kernel's own Dictate control, pressed by the
 * reader (a trusted event, read with primitives the kernel took before any
 * page script ran). A text area's microphone therefore always records at once,
 * right after Done too. Only `voice.captureAndTranscribe`, which any page
 * script can call, is armed in the windows.
 */
export type GestureDecision = { readonly mode: "record" } | { readonly mode: "arm"; readonly reason: string } | { readonly mode: "refuse"; readonly reason: string };

export interface ReaderGesture {
  /**
   * Whether a bar asked for now records at once, waits for Record, or does
   * not open. `control`: the kernel says the reader pressed its own Dictate
   * control; then a live activation records at once, even right after a
   * press on the chrome — the reader just pressed Dictate. spec R3.32a
   */
  decide(options?: { control?: boolean }): GestureDecision;
  /** A bar or a question closed just now. */
  closed(): void;
}

export const NEEDS_ACTION = "The recording bar opens only when the reader presses something in the page.";
export const REFUSED_WITHOUT_ACTION: GestureDecision = { mode: "refuse", reason: NEEDS_ACTION };
const CHROME_GESTURES = ["pointerdown", "pointerup", "mousedown", "touchend", "click", "keydown", "keyup"] as const;

export function createReaderGesture(win: Window & typeof globalThis, options: { cooldownMs?: number; pollMs?: number } = {}): ReaderGesture {
  const cooldownMs = options.cooldownMs ?? 2_000;
  const pollMs = options.pollMs ?? 100;
  const activation = () => (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  /** An activation the shell's own chrome caused may still be live. */
  let chromeActive = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closedAt = Number.NEGATIVE_INFINITY;

  function watch(): void {
    if (timer !== null) clearInterval(timer);
    // The first look comes after the gesture's own activation has had its chance to start.
    timer = setInterval(() => {
      const state = activation();
      if (!state || !state.isActive) {
        chromeActive = false;
        if (timer !== null) clearInterval(timer);
        timer = null;
      }
    }, pollMs);
  }

  function onChrome(event: Event): void {
    if (!event.isTrusted) return;
    chromeActive = true;
    watch();
  }

  for (const type of CHROME_GESTURES) win.addEventListener(type, onChrome, true);

  return {
    decide(options = {}) {
      const state = activation();
      // An engine that cannot say is never taken as a yes: the reader starts the recording in the bar.
      if (!state) return { mode: "arm", reason: "this browser cannot tell who pressed" };
      if (!state.isActive) return REFUSED_WITHOUT_ACTION;
      if (options.control === true) return { mode: "record" };
      if (chromeActive) return { mode: "arm", reason: "the last press was in the host's chrome" };
      if (Date.now() - closedAt < cooldownMs) return { mode: "arm", reason: "a bar or question just closed" };
      return { mode: "record" };
    },
    closed() {
      closedAt = Date.now();
    },
  };
}
