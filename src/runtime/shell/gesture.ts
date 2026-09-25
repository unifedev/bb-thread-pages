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
 */
export interface ReaderGesture {
  /** Null when the shell may open the bar now; otherwise why not, in words for the reader. */
  refusal(): string | null;
  /** A bar or a question closed just now. */
  closed(): void;
}

export const NEEDS_ACTION = "The recording bar opens only when the reader presses something in the page.";
const AFTER_CHROME = "The recording bar opens only when the reader presses something in the page, not in the top bar; press it again in a moment.";
const AFTER_CLOSE = "The recording bar just closed; press again in a moment.";
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
    refusal() {
      const state = activation();
      // An engine that cannot say is never taken as a yes.
      if (!state) return "This browser cannot tell whether the reader pressed something in the page, so the recording bar stays closed.";
      if (!state.isActive) return NEEDS_ACTION;
      if (chromeActive) return AFTER_CHROME;
      if (Date.now() - closedAt < cooldownMs) return AFTER_CLOSE;
      return null;
    },
    closed() {
      closedAt = Date.now();
    },
  };
}
