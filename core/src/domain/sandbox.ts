// The exact `sandbox` value, the document CSP, the shell CSP, `Permissions-Policy` values (05 R3.3, R3.3b, R3.27, R3.30, R3.31).

/**
 * The sandbox every page document runs in: the page frame, its CSP, and
 * every embed frame. One definition, so the three cannot drift. spec 05 R3.3,
 * R3.24; 02 R4.43
 *
 * `allow-scripts allow-forms`: the page is an application. `allow-popups`: a
 * window the page opens itself opens, but stays sandboxed on an opaque origin.
 * `allow-downloads`: a download the page builds fires. Refused for good:
 * `allow-same-origin`, `allow-top-navigation*`, `allow-modals`; refused while
 * R3.3a applies: `allow-popups-to-escape-sandbox`.
 */
export const PAGE_SANDBOX_FLAGS = ["allow-scripts", "allow-forms", "allow-popups", "allow-downloads"] as const;
export const PAGE_SANDBOX = PAGE_SANDBOX_FLAGS.join(" ");
export const REFUSED_SANDBOX_FLAGS = ["allow-popups-to-escape-sandbox", "allow-same-origin", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-modals"] as const;

/** Full screen for the page and anything it frames; WebKit needs the `*`. 05 R3.3b */
export const PAGE_FRAME_ALLOW = "fullscreen *";

/**
 * The document's CSP: the sandbox restated; the open network (R3.11); frames
 * of any https site plus blob/data documents the page builds (R3.27); framed
 * only by the shell (R3.27). spec 05 R3.3, R3.11, R3.27
 */
export const DOCUMENT_CSP = [
  `sandbox ${PAGE_SANDBOX}`,
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "frame-src https: blob: data:",
  "frame-ancestors 'self'",
].join("; ");

/** The document's `Permissions-Policy`: the page never holds the microphone. 05 R3.30 */
export const DOCUMENT_PERMISSIONS_POLICY = "microphone=()";

/** The shell's `Permissions-Policy`: the microphone to the shell only. 05 R3.31 */
export const SHELL_PERMISSIONS_POLICY = "microphone=(self), camera=(), geolocation=(), payment=(), usb=()";

/**
 * The shell's CSP, given the nonce of its one inline script: its own origin
 * only, no frames but its own documents, framed by nothing but itself.
 * spec 05 R3.5, R3.6, R3.27
 */
export function shellCsp(nonce: string): string {
  // `frame-src 'self' blob: data:`: the document frame loads from this origin, and WebKit checks a blob/data download the page builds against the parent's frame-src (02 R4.15d). DESIGN §F.2
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' blob: data:",
    "media-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** The CSP of any own file served by URL: the sandbox alone. 05 R-S4, §Own files by URL */
export const FILE_CSP = "sandbox";
