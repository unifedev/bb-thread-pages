// `checkScope`, `isCanonicalScope`, `scopeProblem` (07 R5.82).
import { LIMITS } from "./limits.ts";

/**
 * A document's scope: a folder inside its session's folder that the
 * capability calls it makes are about. The server does not read the folder;
 * it only refuses a scope that could name anything outside it, and hands the
 * rest to a contributor beside the session. Pure, so the kernel and the
 * server apply one rule. spec 07 R5.81–R5.86
 *
 * A scope is a relative path with `/` between its segments: no leading `/`,
 * no drive or `~`, no empty, `.` or `..` segment, no `\`, no control
 * characters, at most `scopeChars` characters and `scopeSegments` folders.
 * One trailing `/` is dropped. `null` or `""` is no scope.
 */
export type ScopeCheck = { readonly ok: true; readonly scope: string | null } | { readonly ok: false; readonly message: string };

// C0 controls, DEL and C1 controls: never part of a folder name a reader meant.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function checkScope(value: unknown): ScopeCheck {
  if (value === null || value === undefined || value === "") return { ok: true, scope: null };
  if (typeof value !== "string") return { ok: false, message: "A scope is a folder path as text, or null" };
  if (value.length > LIMITS.scopeChars) return { ok: false, message: `A scope is at most ${LIMITS.scopeChars} characters` };
  const path = value.endsWith("/") ? value.slice(0, -1) : value;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return { ok: false, message: "A scope is relative to the session's folder, not absolute" };
  if (path.includes("\\")) return { ok: false, message: "A scope separates folders with /, not \\" };
  if (CONTROL.test(path)) return { ok: false, message: "A scope cannot contain control characters" };
  const segments = path.split("/");
  if (segments.length > LIMITS.scopeSegments) return { ok: false, message: `A scope is at most ${LIMITS.scopeSegments} folders deep` };
  for (const segment of segments) {
    if (segment === "" || segment === ".") return { ok: false, message: "A scope has no empty or . folder names" };
    if (segment === "..") return { ok: false, message: "A scope cannot climb out with .." };
  }
  if (segments[0] === "~") return { ok: false, message: "A scope is relative to the session's folder, not the home folder" };
  return { ok: true, scope: path };
}

/** A scope as it crosses the wire: already canonical, never "". 07 R5.83 */
export function isCanonicalScope(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  const checked = checkScope(value);
  return checked.ok && checked.scope === value;
}

/** Why a wire scope is refused, or null when it is canonical. 07 R5.83 */
export function scopeProblem(value: unknown): string | null {
  if (isCanonicalScope(value)) return null;
  const checked = checkScope(value);
  if (!checked.ok) return checked.message;
  return "A scope crosses the wire in its canonical form: no trailing /, never empty";
}
