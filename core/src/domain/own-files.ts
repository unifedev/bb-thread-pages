// Which `src`/`href`/`poster`/`srcset` references are own files; media kinds for 02 R4.15b (open-in-tab types vs download); the shell's fetch limit.
import { LIMITS } from "./limits.ts";

/** A path inside the page root: no absolute paths, no `.`/`..`/empty segments, no backslashes, no NUL. 01 R1.4, R1.5 */
export function isOwnFilePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/**
 * Whether a reference in the document names one of the page's own files: a
 * relative URL with no scheme, no `//`, no `#`-only, resolved under the
 * document's directory without leaving the root. Returns the root-relative
 * path, or null. 01 R1.2, R1.3; 02 R4.15b
 */
export function ownFileReference(reference: string, documentDirectory: string): string | null {
  const value = reference.trim();
  if (value === "" || value.startsWith("#") || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith("//")) return null;
  const withoutSuffix = value.split("#")[0]!.split("?")[0]!;
  if (withoutSuffix === "") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return null;
  }
  const segments: string[] = documentDirectory.split("/").filter((segment) => segment.length > 0);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const path = segments.join("/");
  return isOwnFilePath(path) ? path : null;
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Raster images: the serving host reads these only up to its lower image limit. 02 R4.25a */
const IMAGES: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "heic", "heif", "tif", "tiff"]);

/** The most the shell fetches of one file: the serving host's read limit, lower for images. 02 R4.25a */
export function shellFetchLimit(path: string): number {
  return IMAGES.has(extensionOf(path)) ? LIMITS.shellFetchImageBytes : LIMITS.shellFetchBytes;
}

/**
 * Files the shell opens in a new tab at the host's own address: only types
 * that cannot run script there. An SVG, XML, HTML or unknown type is
 * downloaded instead. 02 R4.15b
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

/** Media the kernel defers to the shell when carried documents cannot hold it: audio, video and large images. 02 R4.25a */
const LARGE_MEDIA: ReadonlySet<string> = new Set([...IMAGES, "mp4", "m4v", "webm", "mov", "ogv", "ogg", "oga", "mp3", "m4a", "aac", "wav", "flac", "opus"]);

export function isLargeMediaType(path: string): boolean {
  return LARGE_MEDIA.has(extensionOf(path));
}

/** The name a download is saved under: the author's, reduced to a file name; null means the file's own name. 02 R4.15b */
export function downloadName(value: string | null | undefined): string | null {
  const base = (value ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "_").trim().slice(0, 200);
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".." ? cleaned : null;
}

/** The file's own name, for a download that names none. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || "download";
}

/** A path within the page root as a URL path below the files address. 05 §Own files by URL */
export function encodeFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
