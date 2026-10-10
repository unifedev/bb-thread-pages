// `externalUrlProblem(url, ownOrigins)` (03 R5.32, R5.32a): http(s) only; own-origin folding incl. loopback names and the all-hosts-on-port rule.

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
  const target = { host: foldHost(parsed.hostname), port: parsed.port || defaultPort(parsed.protocol) };
  const targetLoopback = isLoopbackHost(target.host);
  for (const raw of ownOrigins) {
    const own = parseOrigin(raw);
    if (!own) continue;
    const ownLoopback = isLoopbackHost(own.host);
    // The same host on the same port, with loopback names folded together.
    if (own.port === target.port && (own.host === target.host || (ownLoopback && targetLoopback))) return "This is the host's own address; use pages.open or sessions.openHost";
    // Reached on loopback: every host on that port is the same server (an all-interfaces bind, a DNS name for 127.0.0.1).
    if (ownLoopback && own.port === target.port) return "This is the host's own address; use pages.open or sessions.openHost";
    // A declared own origin is own on any port.
    if (!ownLoopback && own.host === target.host) return "This is the host's own address; use pages.open or sessions.openHost";
  }
  return null;
}
