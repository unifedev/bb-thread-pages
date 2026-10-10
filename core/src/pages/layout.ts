// `ENTRY_FILE`, `UPLOAD_DIR`, upload name generation (`YYYYMMDD-HHMMSS-xxxxxx-<suffix>`), `isSafeUploadName` — where a page's files live (01 §The site, 02 R4.21).
import { ENTRY_DOCUMENT, UPLOAD_DIR } from "../domain/document-path.ts";
import { isSafeUploadName } from "../domain/submissions/parse.ts";

/** The entry document of a page. 01 R1.1 */
export const ENTRY_FILE = ENTRY_DOCUMENT;
export { UPLOAD_DIR, isSafeUploadName };

/** The reader's file name reduced to `[A-Za-z0-9._-]`, leading dots and separators stripped, ≤ 80 characters, the extension kept where it fits. 02 R4.21; DR-42 */
export function sanitizeUploadSuffix(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._-]+/, "");
  if (cleaned.length <= 80) return cleaned || "upload";
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : "";
  const stem = cleaned.slice(0, 80 - extension.length).replace(/[._-]+$/, "") || "upload";
  return `${stem}${extension}`;
}

/** `<yyyymmdd>-<hhmmss>-<6 hex>-<suffix>`: host-generated, never the reader's name as a path. 02 R4.21, 05 §Routes `/upload` */
export function uploadFileName(originalName: string, now: number, randomHex: string): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const hex = randomHex.toLowerCase().replace(/[^0-9a-f]/g, "").padEnd(6, "0").slice(0, 6);
  const name = `${stamp}-${hex}-${sanitizeUploadSuffix(originalName)}`;
  if (!isSafeUploadName(name)) throw new Error("Generated upload name is invalid");
  return name;
}

/** The path of an upload under the page root. 02 R4.22 */
export function uploadPath(name: string): string {
  return `${UPLOAD_DIR}/${name}`;
}
