# Changelog

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
