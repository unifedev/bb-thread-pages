/**
 * Where a page lives. spec 01 §Storage, RW-3
 *
 * The page root is the session's storage directory itself. The entry document
 * is `index.html`; reader uploads land in `uploads/` under host-generated
 * names. Everything else in the root is the page's own site.
 */
export const ENTRY_FILE = "index.html";
export const UPLOAD_DIR = "uploads";
/** The prototype's entry file, recognised only to tell an agent about it. */
export const LEGACY_ENTRY_FILE = "thread-page.html";

const UPLOAD_NAME = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{6}-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function joinPath(root: string, ...segments: string[]): string {
  const base = root.replace(/[\\/]+$/, "");
  return [base, ...segments].join("/");
}

export function entryPath(root: string): string {
  return joinPath(root, ENTRY_FILE);
}

export function legacyEntryPath(root: string): string {
  return joinPath(root, LEGACY_ENTRY_FILE);
}

export function uploadPath(root: string, name: string): string {
  if (!isSafeUploadName(name)) throw new Error("Unsafe upload name");
  return joinPath(root, UPLOAD_DIR, name);
}

/** The reader's filename reduced to a safe suffix; the host chooses the rest. spec R4.21 */
export function sanitizeUploadSuffix(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._-]+/, "");
  return cleaned.slice(0, 80) || "upload";
}

/** `YYYYMMDD-HHMMSS-<6 hex>-<suffix>`; never taken from the reader. spec R4.21 */
export function uploadFileName(originalName: string, now: number, randomHex: string): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const name = `${stamp}-${randomHex.slice(0, 6)}-${sanitizeUploadSuffix(originalName)}`;
  if (!isSafeUploadName(name)) throw new Error("Generated upload name is invalid");
  return name;
}

export function isSafeUploadName(name: string): boolean {
  return UPLOAD_NAME.test(name) && !name.includes("..");
}

/**
 * A relative path inside the page root: no absolute paths, no `.`/`..`/empty
 * segments, no backslashes, no NUL. spec R1.4
 */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > 1024 || path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
