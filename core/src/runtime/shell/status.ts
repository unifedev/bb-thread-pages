// The notice strip: host-level lines a dead or unreachable page cannot show itself (deleted, expired, stopped reloading, unreachable host, a blocked tab, a voice failure, still loading). No height and no content except while it has text (U49; 05 R2.18a, R2.18d, R2.20, R2.44).
export const STILL_LOADING = "The new version is still loading…";
export const STOPPED_LINE = "This page keeps reloading itself and was stopped; reload this tab to try again.";
export const ARCHIVED_LINE = "This session is archived — read-only";
export const DELETED_LINE = "This session was deleted.";
export const EXPIRING_LINE = "Session expiring — reload when ready";
export const EXPIRED_LINE = "Session expired — reload this page";
export const UNREACHABLE_LINE = "Cannot reach the host";
export const STORAGE_FALLBACK_LINE = "Drafts survive updates but not a reload in this browser.";
export const BLOCKED_TAB_LINE = "The browser blocked the new tab.";

export interface Notice {
  /** A line that stays until cleared or replaced. */
  set(text: string): void;
  clear(): void;
  /** A transient line, gone after `ms`. */
  notice(text: string, ms?: number): void;
  /** A line with a link the reader can click, for a new tab the browser refused to open. 03 R5.33 */
  link(text: string, href: string, label: string): void;
  text(): string;
  element: HTMLElement;
}

export function createNotice(element: HTMLElement): Notice {
  const doc = element.ownerDocument;
  const text = doc.createElement("span");
  text.setAttribute("data-tp", "notice-text");
  const anchor = doc.createElement("a");
  anchor.setAttribute("data-tp", "notice-link");
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.hidden = true;
  element.replaceChildren(text, anchor);
  let line: { text: string; link?: { href: string; label: string } } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function render(): void {
    text.textContent = line?.text ?? "";
    const link = line?.link;
    anchor.hidden = !link;
    anchor.href = link ? link.href : "";
    anchor.textContent = link ? link.label : "";
    // Visible only with text: the strip has no height otherwise. U49
    if (line && line.text) element.setAttribute("data-visible", "true");
    else element.removeAttribute("data-visible");
  }

  function stopTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  render();
  return {
    element,
    set(value) {
      stopTimer();
      line = { text: value };
      render();
    },
    clear() {
      stopTimer();
      line = null;
      render();
    },
    link(value, href, label) {
      stopTimer();
      line = { text: value, link: { href, label } };
      render();
    },
    notice(value, ms = 6_000) {
      stopTimer();
      line = { text: value };
      render();
      timer = setTimeout(() => {
        timer = null;
        line = null;
        render();
      }, ms);
    },
    text: () => line?.text ?? "",
  };
}
