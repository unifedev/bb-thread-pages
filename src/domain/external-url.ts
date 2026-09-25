/**
 * What `navigation.openExternal` accepts: an absolute http(s) URL with a host
 * and no credentials, within bounds. spec R5.32 (R5.32a, this host's own
 * origin, is the handler's: it needs the request).
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
