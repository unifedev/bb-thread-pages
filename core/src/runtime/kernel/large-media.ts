// Marked media elements (`data-thread-page-file`) → `file-request` → `blob:` URL (02 R4.25a); not inside an embed.
import type { KernelMessage, ShellMessage } from "../shared/protocol.ts";

/** `data-thread-page-file="<path>@<version>"` on an element whose `src` the server could not carry; `data-thread-page-poster` for a poster. 02 R4.25a */
export const FILE_ATTRIBUTE = "data-thread-page-file";
export const POSTER_ATTRIBUTE = "data-thread-page-poster";
export const UNAVAILABLE_ATTRIBUTE = "data-thread-page-unavailable";
export const EMBEDDED_MEDIA_REFUSAL = "A large file of a page shown inside another page cannot be fetched; open that page on its own.";

type Outcome = { ok: true; url: string } | { ok: false; error: string };

export interface LargeMedia {
  prepare(root: ParentNode): void;
  /** A shell `file` answer; true when it was one of this module's. */
  receive(message: ShellMessage): boolean;
}

export interface LargeMediaDeps {
  send(message: KernelMessage): void;
  nextId(): string;
  embedded: boolean;
}

/** The path a marker names, without its `@<version>` suffix. */
export function markedPath(value: string): string {
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(0, at) : value;
}

export function createLargeMedia(win: Window & typeof globalThis, deps: LargeMediaDeps): LargeMedia {
  const files = new Map<string, Promise<Outcome>>();
  const waiting = new Map<string, (outcome: Outcome) => void>();

  function request(path: string): Promise<Outcome> {
    const known = files.get(path);
    if (known) return known;
    const answer = deps.embedded
      ? Promise.resolve<Outcome>({ ok: false, error: EMBEDDED_MEDIA_REFUSAL })
      : new Promise<Outcome>((settle) => {
          const id = deps.nextId();
          waiting.set(id, settle);
          deps.send({ kind: "thread-page:file-request", id, path, purpose: "media" });
        });
    files.set(path, answer);
    void answer.then((outcome) => {
      if (!outcome.ok && files.get(path) === answer) files.delete(path);
    });
    return answer;
  }

  function apply(element: Element, marker: string, attribute: "src" | "poster", value: string, outcome: Outcome): void {
    if (element.getAttribute(marker) !== value) return;
    if (!outcome.ok) {
      element.setAttribute(UNAVAILABLE_ATTRIBUTE, outcome.error.slice(0, 200));
      try {
        win.console?.warn?.(`${markedPath(value)} could not be fetched: ${outcome.error}`);
      } catch {
        // A console is a courtesy.
      }
      return;
    }
    element.removeAttribute(marker);
    element.setAttribute(attribute, outcome.url);
    const parent = element.parentElement as HTMLMediaElement | null;
    if (element.tagName === "SOURCE" && parent && (parent.tagName === "VIDEO" || parent.tagName === "AUDIO") && typeof parent.load === "function") {
      try {
        parent.load();
      } catch {
        // No media in a test DOM.
      }
    }
  }

  return {
    prepare(root) {
      const selector = `[${FILE_ATTRIBUTE}],[${POSTER_ATTRIBUTE}]`;
      const found: Element[] = [];
      if ((root as Element).matches?.(selector)) found.push(root as Element);
      if (typeof root.querySelectorAll === "function") found.push(...Array.from(root.querySelectorAll(selector)));
      for (const element of found) {
        for (const [marker, attribute] of [[FILE_ATTRIBUTE, "src"], [POSTER_ATTRIBUTE, "poster"]] as const) {
          const value = element.getAttribute(marker);
          if (!value) continue;
          void request(markedPath(value)).then((outcome) => apply(element, marker, attribute, value, outcome));
        }
      }
    },
    receive(message) {
      if (!("kind" in message) || message.kind !== "thread-page:file") return false;
      const settle = waiting.get(message.id);
      if (!settle) return false;
      waiting.delete(message.id);
      if (message.ok && typeof win.URL?.createObjectURL === "function") settle({ ok: true, url: win.URL.createObjectURL(message.blob) });
      else settle({ ok: false, error: message.ok ? "The file could not be shown" : message.error });
      return true;
    },
  };
}
