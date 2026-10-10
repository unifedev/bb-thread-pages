// Transient activation check in the shell's own document (05 R3.32a–R3.32b): record at once, open armed, or refuse.

export type GestureDecision = { readonly mode: "record" } | { readonly mode: "arm"; readonly reason: string } | { readonly mode: "refuse"; readonly reason: string };

export interface ReaderGesture {
  /** `control`: the kernel says the reader pressed its own Dictate control; a live activation then records at once. 05 R3.32b */
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
  let chromeActive = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closedAt = Number.NEGATIVE_INFINITY;

  function watch(): void {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => {
      const state = activation();
      if (!state || !state.isActive) {
        chromeActive = false;
        if (timer !== null) clearInterval(timer);
        timer = null;
      }
    }, pollMs);
  }

  // The reader's own gestures on the shell's chrome activate the shell too; until that lapses activation proves nothing about the page.
  for (const type of CHROME_GESTURES) {
    win.addEventListener(
      type,
      (event) => {
        if (!event.isTrusted) return;
        chromeActive = true;
        watch();
      },
      true,
    );
  }

  return {
    decide(given = {}) {
      const state = activation();
      if (!state) return { mode: "arm", reason: "this browser cannot tell who pressed" };
      if (!state.isActive) return REFUSED_WITHOUT_ACTION;
      if (given.control === true) return { mode: "record" };
      if (chromeActive) return { mode: "arm", reason: "the last press was in the host's chrome" };
      if (Date.now() - closedAt < cooldownMs) return { mode: "arm", reason: "a bar or question just closed" };
      return { mode: "record" };
    },
    closed() {
      closedAt = Date.now();
    },
  };
}
