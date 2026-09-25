# Changelog

## 1.6.0 — 2026-09-25 — links, popups, own files, full screen, other sites, large media

Implements spec 1.4 (`bartsoj/bb-thread-pages`, DECISIONS D33–D37). Existing
pages keep working; `window.threadPage.version` and the bridge protocol stay
`1`.

### Popups and downloads, sandboxed (D34, option D)

- The page frame and every embed frame are sandboxed
  `allow-scripts allow-forms allow-popups allow-downloads` (the document CSP
  says the same). `allow-popups-to-escape-sandbox` is refused, as are
  `allow-same-origin`, top navigation and modals.
- `window.open` and a `target` the page opens itself now work on a click, but
  the window **stays sandboxed** on an opaque origin: it holds nothing of the
  host's, whatever URL it shows.
- A link to another site keeps 1.5.0's path: `navigation.openExternal`, the
  reader confirms — now *Open “label” (origin) in a new tab?*, since the page
  stays — and the shell opens the site as itself. `navigation.openExternal`
  refuses this host's own origin and any `getbb.app` address with
  `invalid_params`: host addresses go through `pages.open` and
  `sessions.openHost`. No-dialog links wait
  until bb serves no file of a page unsandboxed on its origin (spec R8.33,
  X37).
- `mailto:` and `tel:` open a popup of the reader's handler, never in place of
  the page. A `blob:`/`data:` download the page builds is saved (Chromium and
  WebKit; WebKit also needed `blob:` and `data:` in the shell's `frame-src`).

### A page's own files: opened and downloaded by the shell (D33)

- A link to one of the page's own files that is not a document is carried out
  by the shell from its own origin, with the reader's credential: `download`
  saves it under the attribute's name; otherwise it opens in a new tab at the
  host's file address. Only passive types open in a tab; an SVG, XML, HTML
  (`.htm`, parts and uploads are served unsandboxed by bb) or unknown type is
  downloaded instead. When the browser gives no window and the top bar
  still has focus a moment later (iPhone Safari over bb Connect), it asks
  *Open “file” in a new tab?* and opens it from that click; refused again, the
  file opens in place and Back returns. A `null` from `window.open` alone is not
  taken as a refusal: the bb app and its in-app browser open the URL
  themselves and return `null`.
- Safari (Mac and iPhone) does not play a video opened in its own tab over bb
  Connect: its player needs byte ranges, which bb does not serve (#4339), and
  over Connect the size is not sent either. The guide says to show video in
  the page. A relative link that climbs out of the page root
  does nothing.

- The shell fetches only the files the served document deferred to it (D37),
  and the file name in its question is stripped of control, bidi and
  zero-width characters.
- `navigation.openExternal` refuses this host under any of its names: case and
  trailing dots folded, every loopback name on its port, and — for a reader on
  loopback — any host on that port (a LAN address or a DNS name for 127.0.0.1
  is the same server), plus any `getbb.app` name.

### Full screen (D35)

- `allow="fullscreen *"` on the page frame and embed frames. WebKit rejects a
  plain `allow="fullscreen"`.

### Other sites in a frame (D36 step 1)

- The document CSP allows `frame-src https:` (and `blob:`, `data:`). The frame
  inherits the sandbox: maps, Spotify, Wikipedia work; Vimeo, Figma and likely
  YouTube do not. This host's own documents now send `frame-ancestors 'self'`,
  so one framed by URL inside a page is refused (R3.27).

### Large own media (D37, interim)

- A `<video>`, `<audio>`, `<source>`, `<img>`, `<track>` or `poster` naming an
  own file too large to carry is marked instead of left bare; the shell fetches
  it (up to the host's read limit: 25 MiB, 10 MiB for images) and the page gets
  a `blob:` URL. Seeking works. Logged once, and listed by
  `bb thread-page status` as "fetched by the shell". Delete when bb lands
  #1632, #3617 and #4339.

### Why the popups stay sandboxed

- bb 0.43.4's thread-storage route serves `.svg` and `.xml` inline with no
  `sandbox` CSP (only `.html` gets one). With popups that escape the sandbox,
  page script could open such a file on the host's origin with the reader's
  credential; measured on a harness that serves files as bb does. With the
  popup sandboxed the same window has an opaque origin and holds nothing. The
  fix that would allow no-dialog links is bb's: a `sandbox` CSP on every raw
  file response.

## 1.5.0 — 2026-09-20 — refresh in place, embedded pages, parts

Implements spec 1.3 (`bartsoj/bb-thread-pages`, DECISIONS D28–D32). Existing
pages keep working unchanged; `window.threadPage.version` and the bridge
protocol stay `1`.

### A rewritten page reaches the reader in about two seconds, in place

- The shell re-checks the document every **2 s while the session is working,
  and for 60 s after the reader answers** from the page (a form,
  `session.reply`, an answer inside an embed); every 10 s otherwise; never
  while hidden. Still one conditional request, `304` when nothing changed.
- A changed document is **swapped in place** instead of reloading the shell: a
  fresh token, the new document loaded in a second frame behind the shown one,
  exchanged when it has loaded. No flash, no history entry, the address
  unchanged, the document's scroll position kept. Measured 0.8–1.8 s from save
  to visible, in Chromium, Firefox and WebKit.
- A page needs no code, and there is no reload call. Pages that polled
  `context.get` for their own revision, hopped between twin documents, or kept
  drafts in `storage` to survive a reload should delete that.
- The dirty rule is unchanged, and its offer no longer vanishes: "Page changed
  — reload when ready" used to be wiped by the next poll. It now stays until
  taken, and the new version is shown by itself once the page is clean again.
  Reload shows it in place.
- A document's files and parts that could not be carried are logged once per
  change, not once per poll.

### A page can show another session's page

- `const stop = threadPage.embed(target, { sessionId, path?, onState? })` —
  `target` is an `<iframe>` or a container. The kernel shows the document in a
  `srcdoc` frame that is always `sandbox="allow-scripts allow-forms"`, keeps it
  fresh (3 s while an embedded session works or was just answered, 10 s
  otherwise, paused while hidden), keeps its scroll position, never refreshes it
  under a reader who is typing (the update is offered inside the embed, and the
  embedding page counts as dirty meanwhile), follows its links, and shows a
  line of its own when there is nothing to show. **All embeds of a page are
  checked in one call per tick.** At most 32 per page; one level deep.
- The embedded document runs the **same kernel** in an embedded mode. Its forms
  and `session.reply` are worded, validated and de-duplicated exactly as on its
  own address and go to **its** session. Inside an embed `context.get`
  describes the embedded session; navigation and the list reads pass through;
  `storage.*`, `session.activity`, other `sessions.*`/`projects.*` methods and
  contributed capabilities answer `unavailable`; a form with a file attached is
  refused in its status line; 30 calls a minute.
- New capability **`pages.read`** `{ pages: [{ sessionId, path?, ifNoneMatch? }] }`
  (1–16): other sessions' documents exactly as the host serves them, or
  `unchanged`; per entry `deferred` or an `error`; its own response bound, 8 MiB.
- New capability **`pages.answer`** `{ answerToken, form | reply }`, effect
  `granted-write`: delivers only with the answer token a read returned — bound
  to the reading page's session, the target session, the document and its
  revision — and only in the shape of that page's own form or reply, worded by
  the host. It takes no session id and no prompt. `sessions.send` is unchanged.
- **One grant per (page → session)**: the first answer asks the reader once, in
  the shell's own dialog, naming both sessions; it is remembered, listed in the
  page's top bar ("Answers → n") and revocable there, and from
  `bb thread-page grants [--revoke <page> <target> | --revoke-all]`. A page's
  own session needs none. New setting **`embedAnswerGrants`** (default on)
  turns the question off.
- The document CSP is unchanged: `frame-src 'none'` still blocks frames with a
  URL; `srcdoc` was never subject to it (measured in three engines). Refreshing
  an embed adds no history entry.

### A document can be assembled from parts

- `<link rel="thread-page-include" href="_parts/*.html">` is replaced at serve
  time, in place, by the text of the file it names, or of every matching file in
  name order. Textual, so a part may hold table rows or a script. A part's
  relative `src`/`href`/`poster`/`srcset` resolve from the part's directory.
  Parts may include parts, 3 deep; 200 per document, 2 MiB each.
- **A part is any HTML path with a segment starting with `_`. Only parts can be
  included, and a part is never a document of the page.** *Compatibility:* an
  `.html` file under a `_` path could be opened as a document before and cannot
  now. None is known to exist.
- Same root confinement as every file of the page (no `..`, absolute paths or
  symbolic links); what cannot be included is left as written, logged, and
  listed by `bb thread-page status`. The revision covers the assembled
  document, so adding a part file refreshes the reader.
- Host contract: `files.list(location, directory)`.

### Also

- Concurrent loads of one document share one read.
- The guide gains *A document made of parts*, *Keeping a page current* and
  *Showing another session's page*, and no longer says embedding is blocked.
- An independent hostile-page review found no hole in the token or grant
  binding and eleven things to bound or tighten, all fixed before release: a
  glob matcher that could be made to backtrack for minutes (now a linear scan,
  at most 4 `*`), include expansion bounded in elements, listings and reports, a
  250 ms poll loop with more than 16 embeds, one budget for everything an
  embedded page can make its host spend, a cooldown after a declined grant,
  navigation from an embed only on the reader's click, dirt from an embed only
  once the reader has acted, `pages.read` loading each document once per call
  and deferring without reading, a refresh overtaken by a document switch,
  session titles unable to reword the grant dialog, and one confirmation at a
  time with a 400 ms arming delay.
- 285 tests (76 new), and a browser pass of 33 checks in three engines.

## 1.4.0 — 2026-09-19 — contributed capabilities

Implements spec 1.2 (`bartsoj/bb-thread-pages`, DECISIONS D18–D27).

### Other plugins can give pages capabilities

- A plugin contributes by answering two plugin RPC methods:
  `threadPagesContributions` (its declaration: `version`, `methods`, and
  optionally `instruction` and `guide`) and `threadPagesInvoke` (one call:
  `{ method, params, caller: { sessionId }, requestId }` → `{ ok, result }` or
  `{ ok: false, error: { code, message, reason?, detail? } }`). Every enabled,
  running plugin is asked; declarations are reused for 10 seconds.
- Methods are named `<plugin-id>.<name>`; built-in namespaces are reserved and
  a built-in can never be shadowed. Effects are `read` or the new
  `contributed-write`, and neither is ever confirmed.
- Parameters and results are declared in a JSON Schema subset. Parameter
  objects must be closed; results are projected onto what is declared.
- Bounds are declared per method up to 1 MiB (64 KiB when undeclared); a call
  is bounded to 30 seconds; the per-page rate budget is shared.
- The host passes the caller's session from the action token, and none from the
  built-in home page.
- Failures keep the fixed codes and may add a declared `reason` and a
  `detail` checked against its schema. The page sees both on the rejected
  Error. `watch` refuses a contributed write.
- Each contributed write is logged (method, session, outcome).
- `context.get` lists contributed methods with contributor, description,
  reasons and bounds; every entry now states its bounds.
- A contributor's instruction fragment (2 KiB) follows the standing
  instruction; its guide text (16 KiB) and its methods appear in
  `bb thread-page guide` under *Capabilities from other plugins*.
  `bb thread-page status` lists what is registered.
- `examples/echo-contributor/` is a reference contributor.

### Session reads

- `sessions.snapshot` rows and `session.activity` gain `startedAtMs`,
  `turnEndedAtMs` and, while waiting, `question` (at most 1024 characters).
  On bb, a turn's end is the thread's latest attention time, and the question
  comes from its pending interactions.

## 1.3.2 — 2026-09-14

- The documents under `docs/` moved to the public specification repository,
  <https://syns.dev/bartsoj/bb-thread-pages>. The guide's upgrade note links
  there.
- The README says how to contribute: change the spec first, in a Syns fork, and
  link that fork from the pull request.

## 1.3.1 — 2026-09-14

- **Agent instructions are on by default.** A session started right after
  install writes a page for its task; turning the setting off stops it. An
  install that stored `false` keeps it.
- `PLUGIN_OVERVIEW.md`: the long-form description the BB Community marketplace
  shows.

## 1.3.0 — 2026-09-14

Implements spec 1.1 (`unife-bb-plugin`, DECISIONS D11–D16).

### Home ships ready

- With no page designated as home, `/home` serves a built-in home page: the
  owner's tested session hub, generalised (no personal destinations, no project
  priorities, no remote fonts). It runs in the same sandbox as any page under a
  reserved identity of its own — its own action token, `storage` namespace and
  revision — and the capabilities that need a session (`session.reply`,
  `session.activity`, `projects.browse`, `projects.create`) are refused for it
  and left out of its `context.get` roster.
- Every page links to home, which is the built-in home until a page is
  designated. A designation that no longer resolves falls back to it with a
  notice in the shell.
- `bb thread-page home --clear` returns to the built-in home.

### Several documents in one page

- A link to another `.html` file in the page root opens that document inside
  the page: the shell stays, exchanges its action token for one bound to that
  document (`POST /document-session`), swaps the frame, and records the
  document in the address so reload, back and forward return to it.
- Each document has its own revision, offline copy and `<base>`; its own files
  resolve from its directory. The action token names its document, so forms,
  uploads and capabilities are checked against the document the reader sees.

### Links to bb

- `sessions.openHost` and the shell's "bb" action open
  `/projects/<projectId>/threads/<id>`; only sessions in bb's Personal project
  use `/threads/<id>`. 1.2.0 used the project-less address for every session.

### Nothing to fill in

- `bb thread-page init` creates no file. The agent writes the whole document;
  until it does, the page's link shows "Not written yet" in the shell's own bar
  and a line of host text in the frame, and the page appears on the first save.
- The five-world stylesheet, the seed's reply form and comment, the guide's
  "What plain HTML already gives you" and the starter hub are gone. The
  `pageSeedHtml` setting stays for an operator's own starting file, empty by
  default.
- An install that stored the 1.0.3–1.2.0 default seed or instruction as its own
  value reads it as today's default; a value an operator edited is kept.
- `bb thread-page home` sets the pointer and never creates page content.

### The standing instruction

- Rewritten: run `init` when the session starts, not every turn; nothing is
  provided to fill in and the page is built for this task; the reader answers
  where they read, with one empty text field for anything else; chat carries
  only the link. No control recipes, no styling, no home-page section.
- After six agent scenarios: a page that should stay put starts sessions from
  every form, its field for anything else included, and tells the reader it
  stays put; a page must read on a phone and in dark mode; the text is concise
  and actionable, and what the page shows does the explaining.

### Controls anywhere on the page

- A control joined to a form with `form="<id>"` is captured with that form
  wherever it sits: delivered, named, marked dirty, locked while sending and in
  read-only mode. It used to be silently dropped.

### The guide

- New section *Network, other services and servers*: the page's `null` origin,
  no browser storage, tokens in headers kept with `storage.set`, why sign-in
  flows and origin-checked SDKs do not work, and which servers a page reaches.
- *Several documents in one page* tells agents to keep the page's look in one
  stylesheet in the page root, linked from every document, so a document opened
  in place never arrives unstyled.
- `sessions.snapshot` documents its `status` values.
- No example pages, page shapes or component snippets.

### Confirmations

- The dialog for `sessions.start` leads with the session's `title` when the
  page passes one ("Start “Build” in …"), so buttons whose prompts open alike
  no longer show identical dialogs.

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
