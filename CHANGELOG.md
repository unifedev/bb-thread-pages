# Changelog

## 1.2.0 — 2026-09-11

### The bar acts on the session you're reading

- Every page's top bar now carries four actions for the session it shows:
  ☆ pin in bb (the host's own pin, the one its sidebar shows), bb (open the
  conversation in bb), Read/Unread (the reader's mark) and Archive. Archive
  confirms in the shell's own dialog; afterwards the view goes home, or
  reloads when there is none.
- The actions post to a new `POST /chrome-action` route gated by the page's
  action token, so a sandboxed page cannot reach it; only the trusted shell
  holds that token. On a stale offline copy the buttons are disabled.
- The shell is identical on every page, so the actions appear on every page at
  once — existing pages included, no rewrite needed.
- `SessionRecord` gains `pinned` and the host contract gains `sessions.pin`,
  implemented over bb's `threads.pin` / `threads.unpin`.
- The bar wraps and the title can shrink below its content width, so long
  titles on phone-width screens no longer scroll the page horizontally.

## 1.1.0 — 2026-09-09

Page authors upgrading from 1.0.x: `docs/FOR-PAGE-AUTHORS-1.1.md` says what
changed for a page you already wrote, and what now works that did not.


Worked through the two field reports in `unife-bb-plugin/docs`. Full
disposition: `unife-bb-plugin/docs/FIELD-ISSUES-RESOLUTION.md`.

### A page's own files reach the reader

- The entry document now carries them. Each relative reference is resolved
  from the page root when the document is served and rewritten to a `data:`
  URL. Before this, a page that loaded its own stylesheet or data file worked
  on loopback and rendered empty on bb Connect — the origin a reader actually
  uses — because bb Connect authenticates at the edge and a sandboxed frame's
  subresource requests carry no credential.
- `url()` inside a resolved stylesheet is followed, so backgrounds and
  `@font-face` survive. Absolute and remote URLs are untouched. Anything
  missing, oversized or over budget is left exactly as written and named in
  the log, so a page degrades rather than breaks. Traversal is refused.
- Editing a file beside `index.html` now changes the document, so an open page
  reloads without the entry document being touched.
- This is a workaround for a host limitation, with a written deletion plan:
  `docs/B1-OWN-FILES.md`.
- The offline copy is no longer dropped in silence when a document is over
  200 KiB.

### The seed and the guide

- The seed's comment names no HTML tags. It used to spell `<main>` and
  `<style>` out, which made every string count and every string index in an
  agent's own page lie. A test asserts that every tag token in the raw seed is
  a real element in the parsed DOM.
- The seed says what to do when a page should stay put: delete the reply form.
- `[hidden]` means hidden: a class rule setting `display` used to outrank it.
- The guide stops claiming that subresources "load normally", says how a page's
  own files actually reach the reader and what that costs, and gains
  *Keeping a page's data current* — rewriting the entry document is how new
  data reaches an open page, and the build that writes it must be
  deterministic.
- The guide says the whole file belongs to the agent, that nothing in it is
  reserved, and that rewriting it whole is expected and safer than splicing.
- A page may be build output as long as one session owns it and that session's
  agent built it first.
- "Before you save" asks for one reading over the reader's real origin.

### Upgrading from 0.3.x

- `unknown_method` names the replacement when a page calls a renamed method.
  There are still no aliases; the old name still fails, legibly.
- `docs/UPGRADING.md` carries the full rename table.

## 1.0.3 — 2026-09-08

- New capability `sessions.markRead` `{ sessionId, read? }` with the new
  `reader-state` effect class: changes only the reader's read mark, never
  the session's work, so it is not confirmed (spec R5.7a, RW-19).
- Starter hub: a failed session needs you only while it is unread; every row
  has a Read/Unread toggle; the "+ New" prompt box is styled.

## 1.0.2 — 2026-09-08

The home page matches what the reader sees in bb, and the starter hub is
built for finding a session fast.

- `sessions.snapshot` lists root sessions only by default (`includeChildren:
  true` adds sub-agents), and every session carries `unread` and
  `attentionAtMs` — bb's own unread mark and when it asked for attention.
  A deliberate widening under D4 (RW-18).
- The starter hub: sticky search (press `/`), "Needs you" (working, waiting,
  failed, unread) and "All" views, projects that need the reader first, five
  recent per project then "Show 10 more" (bb's sidebar rule), one dense line
  per session that opens its page (or the session in bb), Stop, Archive,
  start a session per project, unread in bold.

## 1.0.1 — 2026-09-08

Onboarding: how a home page comes to exist is now said in the product, not
only in the README.

- `init` ends with a `home:` line — the link, or "none set" and the one
  sentence that says how to make one.
- The standing instruction gains a short "The home page" paragraph.
- The guide's §The home page is a three-step recipe with a complete, working
  starter hub (projects grouped, page and bb links, stop, start a session with
  `cancelled` handled, collapsed groups kept in `storage`).
- `/home` without a home explains what to ask an agent.

## 1.0.0 — 2026-09-08

A rewrite against the specification in `unife-bb-plugin/spec`. Nothing from
0.3.x is carried over except the seed's design system and the reasoning.

### Model

- A page is a site: `index.html` in the session's storage directory, any file
  beside it served relatively with nested paths and free filenames, `uploads/`
  for attachments. The flat `thread-page-assets/` directory, the separate
  preview origin, the injected off-origin `<base>` and the `assetUrl()` API are
  gone (X1, X2, X3, X7, X10).
- One agent, one page. `bb thread-page home` sets a pointer and creates the
  plain seed if needed; it no longer writes a session hub.
- The prototype's `thread-page.html` is not served or migrated; `init` says so.

### Capabilities

- Renamed to the spec's vocabulary: `session.*`, `sessions.*`, `pages.open`,
  `sessions.openHost`, `navigation.openExternal`, `projects.*`, `providers.list`,
  `storage.*`. No aliases for the old `thread.*`/`threads.*` names.
- `sessions.start` works: it always supplies an environment (X8), starts a
  visible root, and documents its defaults (`environment: "project-default"`
  or `{ sameAs }`).
- `providers.list` works (X9) and groups models per provider with reasoning levels.
- `sessions.snapshot` pages with a real cursor (X11).
- `pages.open` and `sessions.openHost` navigate the reader's view in place;
  authored `<a href="https://…">` links work through `navigation.openExternal`
  (X4, X5).
- Every confirmed capability is challenged by the server with its own summary;
  the shell only relays.

### Trust

- Pages have network access (D7): open `connect-src`, remote fonts, scripts,
  images, workers. Frames stay blocked. No render token; read authority is the
  reader's bb session, and the document URL carries no secret.
- Action tokens (`v3`), confirmation challenges bound to canonical parameters,
  per-page rate limit of 120 requests a minute and 8 in flight.

### Agent contract

- Standing instruction rewritten to spec 06 (teaches one-agent-one-page and
  the composition route); under 4096 characters.
- The guide is generated from the limits table and the capability registry.
- New `bb thread-page status`.

### Known limitation on bb 0.42.1

- Page script cannot `fetch()` its own files (bb core answers 403 to
  `Origin: null`); subresources load. See README §Serving on bb 0.42.1.
