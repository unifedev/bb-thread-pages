/**
 * The sandbox every page document runs in: the page frame, its CSP, and
 * every embed frame. One definition, so the three cannot drift. spec R3.3,
 * R3.24, R4.43, DECISIONS D34, D35
 *
 * - `allow-scripts allow-forms`: the page is an application.
 * - `allow-popups`: a window the page opens itself (`window.open`, a
 *   `target` it names) opens, but **stays sandboxed** on an opaque origin, so
 *   it holds nothing of the host's whatever URL it shows (D34, option D).
 * - `allow-downloads`: a download the page builds (`blob:`/`data:`) fires.
 *
 * A link to another site goes through `navigation.openExternal`, confirmed,
 * and the shell opens it as itself (R4.15, R5.8).
 *
 * Refused, and never to be added while the host serves any file of a page
 * unsandboxed on its own origin (spec R8.33, X37):
 * `allow-popups-to-escape-sandbox` — a window page script opened on such a
 * file would run with the reader's credential. Refused for good:
 * `allow-same-origin` (the page would share the host's origin),
 * `allow-top-navigation*` (it could replace the shell), `allow-modals` (it
 * could draw browser dialogs over trusted chrome).
 */
export const PAGE_SANDBOX_FLAGS = ["allow-scripts", "allow-forms", "allow-popups", "allow-downloads"] as const;
export const PAGE_SANDBOX = PAGE_SANDBOX_FLAGS.join(" ");
export const REFUSED_SANDBOX_FLAGS = ["allow-popups-to-escape-sandbox", "allow-same-origin", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-modals"] as const;

/**
 * Full screen for the page and anything it frames. WebKit rejects a plain
 * `allow="fullscreen"`: its default allowlist is the frame's src origin,
 * which an opaque origin never matches (measured 2026-09-25). D35
 */
export const PAGE_FRAME_ALLOW = "fullscreen *";
