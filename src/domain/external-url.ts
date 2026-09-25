/**
 * What `navigation.openExternal` accepts: an absolute http(s) URL with a host
 * and no credentials, within bounds. Pure, so the host's validator and the
 * kernel's native path apply one rule. spec R5.32
 */
export function externalUrlProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !/^[^\u0000- \u007f]+$/.test(value)) return "Expected an absolute http or https URL";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Expected an absolute http or https URL";
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    return "Expected an absolute http or https URL without credentials";
  }
  return null;
}
