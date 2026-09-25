import { LIMITS } from "./limits.ts";

/**
 * A page's own files that are not its documents: which paths are its own, which
 * the shell may open in a tab of its own, and how much of one it fetches. Pure,
 * so the server, the kernel and the shell apply one rule. spec R1.4, R1.5,
 * R4.15b, R4.25a, DECISIONS D33, D37
 */

/** A path inside the page root: no absolute paths, no `.`/`..`/empty segments, no backslashes, no NUL. R1.4, R1.5 */
export function isOwnFilePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Raster images: the host reads these only up to its lower image limit. */
const IMAGES: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "heic", "heif", "tif", "tiff"]);

/**
 * The most the shell fetches of one file: the host's own read limit, lower for
 * images (bb's daemon: 25 MiB, 10 MiB for raster images). D37
 */
export function shellFetchLimit(path: string): number {
  return IMAGES.has(extensionOf(path)) ? LIMITS.shellFetchImageBytes : LIMITS.shellFetchBytes;
}

/**
 * Files the shell opens in a new tab at the host's own address. Only types
 * that cannot run script there: the tab is on the host's origin with the
 * reader's credential, so an SVG, XML, HTML or unknown type is downloaded
 * instead. HTML is excluded even though bb sandboxes `.html`: it serves `.htm`
 * (and any other name its MIME table maps to `text/html`) unsandboxed, and a
 * part or an upload is not a document the shell would open in place. D33
 */
const OPENABLE: ReadonlySet<string> = new Set([
  ...IMAGES,
  "pdf",
  "mp4", "m4v", "webm", "mov", "ogv", "ogg", "oga", "mp3", "m4a", "aac", "wav", "flac", "opus",
  "txt", "md", "csv", "tsv", "json", "log", "vtt", "srt",
]);

export function isOpenableInTab(path: string): boolean {
  return OPENABLE.has(extensionOf(path));
}

/** The name a download is saved under: the author's, reduced to a file name; null means the file's own name. */
export function downloadName(value: string | null | undefined): string | null {
  const base = (value ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "_").trim().slice(0, 200);
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".." ? cleaned : null;
}

/** The file's own name, for a download that names none. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || "download";
}

/** A path within the page root as a URL path below the files address. */
export function encodeFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
