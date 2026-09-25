/**
 * Large own media: the shell fetches it, the page gets a `blob:` URL.
 * spec R4.25a, DECISIONS D37
 *
 * A page's own file over the carrying limits cannot reach a reader on an
 * authenticated origin: the frame's own request carries no credential. The
 * serving pass marks such a reference on a media element, an image, a poster
 * or a text track (`data-thread-page-src="clip.mp4"` instead of `src`); here
 * the kernel asks the shell for the file, the shell fetches it from its own
 * origin with the reader's credential and hands the bytes back, and the
 * kernel sets the attribute to a `blob:` URL. Seeking works on a blob, so the
 * host's missing `Range` support does not matter.
 *
 * DELETE THIS when the host serves a sandboxed page its own files by URL on
 * every origin — bb's plugin prefix routes (get-bb/bb #1632), the Connect page
 * grant (#3617) and ranged reads of thread storage (#4339). The same trigger
 * as pages/inline.ts; see docs/B1-OWN-FILES.md in the specification.
 */
export const DEFERRED_ATTRIBUTES = ["src", "poster"] as const;
const MARKER = "data-thread-page-";
/** Set on an element whose file could not come, with the reason, so the author can see it in devtools. */
export const UNAVAILABLE_ATTRIBUTE = "data-thread-page-unavailable";
export const EMBEDDED_MEDIA_REFUSAL = "A large file of a page shown inside another page cannot be fetched; open that page on its own.";

export interface LargeMedia {
  /** Finds marked references under `root` and asks for their files. */
  prepare(root: ParentNode): void;
  /** The shell's answer to a request; false when it is not one. */
  receive(data: Record<string, unknown>): boolean;
  /** The channel is up: send what was asked before it was. */
  flush(): void;
}

export interface LargeMediaDeps {
  /** Posts to the shell; false when the channel is not ready. */
  post(message: { kind: "thread-page:file-request"; id: string; path: string }): boolean;
  /** Inside an embed the shell is not this page's: nothing can be fetched. */
  embedded: boolean;
}

type Outcome = { ok: true; url: string } | { ok: false; error: string };

export function createLargeMedia(win: Window & typeof globalThis, deps: LargeMediaDeps): LargeMedia {
  const doc = win.document;
  /** One fetch per file, however many elements show it. */
  const files = new Map<string, Promise<Outcome>>();
  const waiting = new Map<string, { path: string; settle(outcome: Outcome): void; sent: boolean }>();
  let counter = 0;

  function request(path: string): Promise<Outcome> {
    const known = files.get(path);
    if (known) return known;
    const answer = deps.embedded
      ? Promise.resolve<Outcome>({ ok: false, error: EMBEDDED_MEDIA_REFUSAL })
      : new Promise<Outcome>((settle) => {
          counter += 1;
          const id = `tp-file-${counter}`;
          const entry = { path, settle, sent: false };
          waiting.set(id, entry);
          entry.sent = deps.post({ kind: "thread-page:file-request", id, path });
        });
    files.set(path, answer);
    return answer;
  }

  function apply(element: Element, attribute: (typeof DEFERRED_ATTRIBUTES)[number], path: string, outcome: Outcome): void {
    // The page may have replaced or re-pointed the element meanwhile; only an unchanged marker is honoured.
    if (element.getAttribute(`${MARKER}${attribute}`) !== path) return;
    if (!outcome.ok) {
      element.setAttribute(UNAVAILABLE_ATTRIBUTE, outcome.error.slice(0, 200));
      try {
        win.console?.warn?.(`Thread Page: ${path} could not be fetched: ${outcome.error}`);
      } catch {
        // A console is a courtesy.
      }
      return;
    }
    element.removeAttribute(`${MARKER}${attribute}`);
    element.setAttribute(attribute, outcome.url);
    // A <source> set after its media element chose none needs the element to choose again.
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement as HTMLMediaElement | null;
    if (tag === "source" && parent && (parent.tagName === "VIDEO" || parent.tagName === "AUDIO") && !parent.hasAttribute("src") && typeof parent.load === "function") {
      try {
        parent.load();
      } catch {
        // jsdom has no media; a browser does.
      }
    }
  }

  function prepare(root: ParentNode): void {
    const selector = DEFERRED_ATTRIBUTES.map((attribute) => `[${MARKER}${attribute}]`).join(",");
    const found: Element[] = [];
    if ((root as Element).matches?.(selector)) found.push(root as Element);
    if (typeof root.querySelectorAll === "function") found.push(...Array.from(root.querySelectorAll(selector)));
    for (const element of found) {
      for (const attribute of DEFERRED_ATTRIBUTES) {
        const path = element.getAttribute(`${MARKER}${attribute}`);
        if (!path) continue;
        void request(path).then((outcome) => apply(element, attribute, path, outcome));
      }
    }
  }

  return {
    prepare,
    receive(data) {
      if (data.kind !== "thread-page:file" || typeof data.id !== "string") return false;
      const entry = waiting.get(data.id);
      if (!entry) return true;
      waiting.delete(data.id);
      const blob = data.blob as Blob | undefined;
      if (data.ok === true && blob && typeof blob === "object" && typeof win.URL?.createObjectURL === "function") {
        entry.settle({ ok: true, url: win.URL.createObjectURL(blob) });
      } else {
        entry.settle({ ok: false, error: typeof data.error === "string" && data.error ? data.error : "The file could not be fetched" });
      }
      return true;
    },
    flush() {
      for (const [id, entry] of waiting) {
        if (!entry.sent) entry.sent = deps.post({ kind: "thread-page:file-request", id, path: entry.path });
      }
    },
  };
}

