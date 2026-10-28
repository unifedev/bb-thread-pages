// `externalUrlProblem(url, ownOrigins)` (03 R5.32, R5.32a): http(s) only; own-origin folding incl. loopback names and the all-hosts-on-port rule. `hostPageTarget` (R5.32b): the host's own page address read as `pages.open`.

const LOOPBACK_V4 = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/;

/** Whether a host name is one of the loopback names: `localhost`, 127.0.0.0/8, `::1`, `0.0.0.0`. 03 R5.32a */
export function isLoopbackHost(hostname: string): boolean {
  const name = foldHost(hostname);
  return name === "localhost" || name === "[::1]" || name === "::1" || name === "0.0.0.0" || LOOPBACK_V4.test(name);
}

/** Case folded, trailing dots dropped. 03 R5.32a */
function foldHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

/** An origin as `{ protocol, host, port }`, or null when it cannot be parsed as http(s). */
function parseOrigin(value: string): { protocol: string; host: string; port: string } | null {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return null;
  return { protocol: url.protocol, host: foldHost(url.hostname), port: url.port || defaultPort(url.protocol) };
}

/** Whether a parsed URL is on one of the host's own origins. 03 R5.32a */
function isOwnOrigin(parsed: URL, ownOrigins: readonly string[]): boolean {
  const target = { host: foldHost(parsed.hostname), port: parsed.port || defaultPort(parsed.protocol) };
  const targetLoopback = isLoopbackHost(target.host);
  for (const raw of ownOrigins) {
    const own = parseOrigin(raw);
    if (!own) continue;
    const ownLoopback = isLoopbackHost(own.host);
    // The same host on the same port, with loopback names folded together.
    if (own.port === target.port && (own.host === target.host || (ownLoopback && targetLoopback))) return true;
    // Reached on loopback: every host on that port is the same server (an all-interfaces bind, a DNS name for 127.0.0.1).
    if (ownLoopback && own.port === target.port) return true;
    // A declared own origin is own on any port.
    if (!ownLoopback && own.host === target.host) return true;
  }
  return false;
}

/** An absolute http(s) URL without credentials, or null. 03 R5.32 */
function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !/^[^\u0000- \u007f]+$/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) return null;
  return parsed;
}

/**
 * Why `navigation.openExternal` refuses a URL, or null when it may be asked
 * about. http(s) only, no credentials; never the host's own origins —
 * `ownOrigins` is every origin the reader reaches the host at (from the
 * request), the published origin and the serving host's declared ones. Names
 * fold case and trailing dots; every loopback name is the same host on the
 * same port; when an own origin is loopback, every host on that port is own;
 * a declared own origin is own on any port. A look-alike name is another
 * site. spec 03 R5.32, R5.32a
 */
export function externalUrlProblem(value: unknown, ownOrigins: readonly string[] = []): string | null {
  const parsed = httpUrl(value);
  if (!parsed) return "Expected an absolute http or https URL without credentials";
  if (isOwnOrigin(parsed, ownOrigins)) return "This is the host's own address; use pages.open or sessions.openHost";
  return null;
}

/**
 * The host's own page address as `pages.open` reads it: on an own origin,
 * `<base>/page` with exactly one non-empty `session` is that session's page,
 * `<base>/home` the home; anything else is null. spec 03 R5.32b
 */
export function hostPageTarget(value: unknown, ownOrigins: readonly string[], base: string): { sessionId: string } | { home: true } | null {
  const parsed = httpUrl(value);
  if (!parsed || !isOwnOrigin(parsed, ownOrigins)) return null;
  if (parsed.pathname === `${base}/home`) return { home: true };
  if (parsed.pathname !== `${base}/page`) return null;
  const sessions = parsed.searchParams.getAll("session");
  return sessions.length === 1 && sessions[0] ? { sessionId: sessions[0] } : null;
}
