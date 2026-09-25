/**
 * The sandbox every page document runs in: the page frame, its CSP, and
 * every embed frame. One definition, so the three cannot drift. spec R3.3,
 * R3.24, R4.43, DECISIONS D34, D35
 *
 * - `allow-scripts allow-forms`: the page is an application.
 * - `allow-popups allow-popups-to-escape-sandbox`: a link or `window.open`
 *   on the reader's click opens a real window on the destination's own
 *   origin, as on any website (D34).
 * - `allow-downloads`: a download the page builds (`blob:`/`data:`) fires.
 *
 * Refused, and never to be added: `allow-same-origin` (the page would share
 * the host's origin), `allow-top-navigation*` (it could replace the shell),
 * `allow-modals` (it could draw browser dialogs over trusted chrome).
 */
export const PAGE_SANDBOX_FLAGS = ["allow-scripts", "allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-downloads"] as const;
export const PAGE_SANDBOX = PAGE_SANDBOX_FLAGS.join(" ");
export const REFUSED_SANDBOX_FLAGS = ["allow-same-origin", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-modals"] as const;

/**
 * Full screen for the page and anything it frames. WebKit rejects a plain
 * `allow="fullscreen"`: its default allowlist is the frame's src origin,
 * which an opaque origin never matches (measured 2026-09-25). D35
 */
export const PAGE_FRAME_ALLOW = "fullscreen *";
