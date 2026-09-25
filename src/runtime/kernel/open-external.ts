import { externalUrlProblem } from "../../domain/external-url.ts";
import { isRecord } from "../shared/protocol.ts";

/**
 * `navigation.openExternal` on the reader's click: the browser opens it in a
 * new window on the site's own origin, as it would a link, and no dialog is
 * shown. Without a click the browser would refuse the window, so the call
 * goes to the host, which confirms first as before. spec R5.34a, D34
 *
 * Returns whether it opened the URL here. Parameters the host would reject
 * are left for the host to reject with its own error.
 */
export function openExternalNatively(win: Window & typeof globalThis, params: unknown): boolean {
  if (!readerJustActed(win) || !isRecord(params)) return false;
  const keys = Object.keys(params);
  if (!keys.every((key) => key === "url" || key === "label") || !("url" in params)) return false;
  if ("label" in params && (typeof params.label !== "string" || params.label.length === 0 || params.label.length > 160)) return false;
  if (externalUrlProblem(params.url) !== null) return false;
  try {
    win.open(new URL(params.url as string).href, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** Transient user activation, where the engine reports it; engines that do not are treated as not activated. */
function readerJustActed(win: Window): boolean {
  const activation = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive === true : false;
}
