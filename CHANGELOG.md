# Changelog

## 1.9.0 — 2026-10-06 — a document's query; a reload inside the page; a budget per document

Implements spec 1.7 (`bartsoj/bb-thread-pages`, DECISIONS D43–D45), from the
templates' test 10 on 1.8.0 with the Syns plugin 0.5.0. Existing pages keep
working; `window.threadPage.version` and the bridge protocol stay `1`.

### Security: the shell no longer hands its channel to whatever is in the frame (D44, X49)

- **Released 1.8.x is affected.** The shell posted its port into the page's
  frame, to whatever document was in it at that moment. A new revision of a
  page, loaded behind the shown one, could `location.replace()` its frame to an
  HTML file with no runtime right after its runtime said ready; the shell then
  handed that file the channel, and it answered the session as the reader,
  with no action of theirs (measured on 1.8.0 in Chromium, Firefox and WebKit
  by the 1.9.0 review). Update to 1.9.0.
- The handshake is reversed: the page's runtime makes the channel itself and
  hands its port to the shell inside its first `ready`, before any page script
  runs. The shell takes a port only from the first `ready` of a frame it
  loaded itself and never posts a port into a frame; a refreshed document's
  port is kept and heard from when it is shown. A port a document made dies
  with it, so nothing navigated into its frame later can use it.
- After every load of a frame whose runtime handed over a port, the shell
  pings that runtime over its port, at the load and again 7.5 s later. A
  document that left its frame — swapped out by a page, even before it
  finished loading — cannot answer, since its port died with it; with neither
  ping answered within 15 s, the shell replaces it with the open document in a
  fresh frame. A busy page answers late and stays. A page doing this again and
  again is stopped after three reloads in a row, with a line in the status;
  the count clears only once a document has kept answering for 10 s.
- The handshake's version is 2: a page's tab left open across the update
  shows nothing until it is reloaded.

### A document's query is carried (D43)

- A link `<a href="tool.html?scope=clients/vela/q3-board#card-1">` opens
  `tool.html` with its query and its fragment. The document reads the query as
  on any site: `new URLSearchParams(location.search).get("scope")`.
  `location.search` also holds the host's own `session` and `path`, which a
  document query may not use: such a link does not open, and the status says
  why.
- The address carries it inside `path`:
  `…/page?session=<id>&path=tool.html?scope=clients/vela/q3-board#card-1`. The
  shell writes a second parameter's `&` as `%26`; a raw `&` typed there
  (`path=tool.html?scope=a&view=grid`) gives the document every parameter the
  address does not use itself, and the address is written back with `%26`.
- A link built from `location.search` (`"tool.html" + location.search`, or a
  router keeping the query) works: the host's own `session` and `path` are
  dropped when they are the open document's. A query-only link (`?scope=b`),
  which the page's `<base>` would send to the page's folder, opens this
  document with that query.
- Kept on open, links, reload, back and forward, and `location.reload()`. A
  link to the same document with another query loads it again; a `#…` link
  keeps the query. At most 2,048 characters, no `#`, spaces or control
  characters.
- So the generic `tool.html` names its folder in the query and leaves the
  fragment to the app's own routes (Linear, Notion, Spec Kit, OpenSpec,
  Kanban's open card), which until now overwrote the folder. The guide's
  pattern reads the folder from the query.

### A reload inside the page reconnects (D44)

- `location.reload()` in a page left it on "Loading…": the shell took a
  handshake only once per frame. Now, when the frame it shows reports ready
  for a load the shell did not make, it connects nothing and loads the open
  document again, at its query and fragment, into a fresh frame, connected as
  any load. So a reload inside the page comes back working.

### The request budget is per document and scope, under a session cap (D45)

- Each request counts against its document's budget — the session, the
  document's path and, for capability calls, the calling document's scope —
  at 120 a minute and 8 in flight, as before, and against its session's, at
  600 a minute and 32 in flight. Seven tools in one session, which were
  refused with "Too many requests from this page", now load and save.

- Known divergence X48: a malformed capability request is refused before it is
  charged to a budget (the scope it carries picks the budget).

### Verified

- 427 unit tests (A148–A153 as unit, route and runtime tests).
- Reviewed before release in four passes; the last found the security fix
  closed in all three engines, and its two functional findings (a busy page
  taken for gone in Firefox; a reload count that a page could keep resetting)
  are fixed here.
- `test/browser/params.mjs`: 27 of 27 in Chromium, Firefox and WebKit — the
  query on open, links, the app's own routes, reload, back and forward;
  `location.reload()` twice; a frame navigated to a file with no runtime; the
  swap-in race (a new revision that `location.replace()`s itself to such a
  file right after its ready); query-only links and links built from
  `location.search`; a raw `&` in the address; a page busy 3.5 s and 5 s
  after load, which stays; a page leaving 300 ms after every load, which is
  stopped; seven tools of one session loading at once. The race leaks on released 1.8.0 (the file gets the channel
  in all three engines) and on the first 1.9.0 fix `bfedbc8`.
- `scope.mjs` 34 of 34 (its 1.8 check that a link's query is not carried now
  checks that it is), `kernel-hostile.mjs` 51 of 51 (its harness plays the
  new handshake), `voice.mjs` 53 of 53, and `media-links.mjs` 26 of 26 (25 in
  WebKit: the third-party Vimeo error, as at 1.8.0), in the three engines.

## 1.8.0 — 2026-10-06 — a document scopes its calls to a folder; fragments reach documents

Implements spec 1.6 (`bartsoj/bb-thread-pages`, DECISIONS D41–D42), for the
owner's ruling *one interface, one agent*: a session's agent works from its
project's root, and each app in a subfolder opens as another URL of the same
session's page. Existing pages and contributors keep working;
`window.threadPage.version` and the bridge protocol stay `1`.

### A document's scope (D41)

- `threadPage.setScope(folder)` scopes the document's later calls to a folder
  inside its session's folder; `setScope(null)` or `""` clears it, and
  `threadPage.scope` reads it. An `invoke` carries the scope current when it is
  called, a `watch` the one current when it started.
- A scope is relative and `/`-separated: no leading `/`, drive or `~`, no
  empty, `.` or `..` folder, no `\`, no control characters, at most 1,024
  characters and 64 folders; one trailing `/` is dropped. The kernel throws a
  `TypeError` for anything else, and the host refuses it again with
  `invalid_params` before any contributor is called.
- A contributor receives it beside the session: `threadPagesInvoke` gets
  `caller: { sessionId, scope }`, with `scope` only when the document set one,
  so every other call is unchanged. The contributor resolves it against the
  session's folder and answers for symbolic links. Built-in capabilities
  ignore it, except `storage`; a scoped contributed call from the built-in
  home page is `invalid_params`. The reference contributor
  (`examples/echo-contributor`) echoes it and keeps its notes per session and
  folder.
- `storage.get` and `storage.set` are namespaced by the calling document's
  scope: a scoped document's keys live apart from the unscoped page's and from
  every other scope's, so one `tool.html#…` per folder no longer shares
  `prefs` or `draft:*` with the others (a draft saved in one folder's tool was
  read, and overwritten, by another's). An unscoped page's keys are stored
  exactly as in 1.7, so existing pages keep what they saved.

### Fragments reach documents (D41)

- Until now neither a fragment nor a query reached a document: links dropped
  both, the frame was loaded without the address's fragment, and the shell's
  own fragment stuck to the next document opened.
- Now the shell loads the document at its address's fragment; a link carries
  its own (`<a href="tool.html#clients/vela/q3-board">`); reload, back and
  forward return to it; a link to the same document at another fragment, or a
  bare `<a href="#…">` the page does not handle itself, is a fragment navigation (`hashchange`, no reload) and
  the address follows, as it follows any change the document makes through
  `location`; changing only the address's fragment opens the document at it.
- A link's move within the document is made by the kernel with
  `location.replace`, against the document's own URL, and the shell adds the
  history step: the frame keeps no history of its own, which would die when the
  shell swaps the frame, so back and forward retrace fragment moves across
  other documents. A bare `#…` link no longer navigates the frame to the
  page's storage folder (it did in 1.7 too, through the injected `<base>`).
  The kernel acts on it only after the page's own handlers, and only when none
  cancelled the click, so menus and tabs written as `href="#"` with
  `return false`, or with `preventDefault` in a listener, behave as before.
  Inside an embed a `#…` link only scrolls. The fragment never reaches the server; one over
  2,048 characters is dropped. A query is still not carried. Inside an embed,
  fragments are not carried.
- The guide documents both: the pattern for one document that serves any
  folder (with a `try`), loading an app's markup without `document.open`, and
  changing the fragment from script through `location`, never the History
  API.

### The instruction's real budget (D42)

- bb cuts a plugin's agent instructions at 4,096 characters, the standing
  instruction and every contributor's fragment together. `bb thread-page
  status` now shows the joined length against that cap, what the standing
  instruction leaves for fragments, and per contributor whether its fragment
  arrives whole, or how much arrives and its last words. The operator's log
  warns once per fragment and version that would be cut. The host contract
  gains an optional `instructionChars`.

### Verified

- 416 unit tests (A139–A147 as unit, route and runtime tests);
  `kernel-hostile.mjs` 51 of 51 in the three engines.
- Reviewed before release, three passes; the last found it safe to release. The first review's findings on back and forward
  (1), the History API (2) and bare `#…` links (3) are fixed here, and the
  second review's on links a page handles itself; findings 4 and 5 are left
  for later (DECISIONS D41).
- Known divergences (spec 1.6, X43, X44): Back between two fragments of the
  same document reloads it, so unsaved input is lost without the usual offer;
  a fragment set from script with `location.hash`, then another document, then
  Back, lands wrongly (WebKit: on the older fragment; Chromium and Firefox: the
  second Back does nothing or leaves the page).
- `test/browser/scope.mjs`: 34 of 34 checks in Chromium, Firefox and WebKit
  against the plugin's own served output, with a contributor echoing its
  caller — including back and forward across a document switch after a
  fragment move, a bare `#…` link, `#…` links the page handles itself, and a
  loader that swaps an app's markup in, whose scripts see
  the scope while links keep working. (`document.open` erases the kernel's
  listeners; the guide's pattern does not use it.)
- On the owner's bb, a joint proof with the Syns plugin passed all seven rows:
  `tool.html#<folder>` opens a placed app scoped to its folder, a template
  placed from the page opens the same way, and escapes are refused at every
  layer.
- Not verified: phones; bb Connect, whose sign-in drops the fragment for a
  signed-out reader (handed over to bb, `docs/bb-contributions/` in the design
  tree).

## 1.7.0 — 2026-09-26 — voice, text areas that take voice and files, files with sessions

Implements spec 1.5 (`bartsoj/bb-thread-pages`, DECISIONS D38–D40). Existing
pages keep working; `window.threadPage.version` and the bridge protocol stay
`1`.

### Voice: the shell records, bb transcribes, the page gets text (D38)

- The shell's `Permissions-Policy` now allows the microphone to the shell
  itself (`microphone=(self)`); every page document keeps `microphone=()`, and
  neither the page frame nor an embed frame is given it. The page never holds
  the device.
- A recording bar in the shell's own chrome, floating at the bottom centre of
  the page area — live waveform, Cancel, Done — is the consent: nothing leaves
  the reader's device until Done, Escape (in the page too) and Cancel discard,
  and a Done under 1 s says *Too short* and sends nothing. A bar open when the
  page's document changes is cancelled. It opens only while the shell's own
  document has the reader's activation from a gesture in the page, one at a
  time, and it counts as a question beside the confirmation dialog. Where the
  shell cannot tell the activation is the page's — after a press on its own
  chrome, until that activation lapses; 2 s after a bar or dialog closes; or in
  an engine without `navigator.userActivation` — the bar opens **armed**: the
  microphone stays off until the reader presses Record in the bar (Cancel or
  Escape there is `cancelled`). Dictate right after Done takes one more press,
  and a page that re-asks after Cancel only shows an armed bar again. The recorder copies bb's composer: the first supported
  of webm, mp4 and ogg, the chunk's type (Firefox leaves the recorder's empty),
  250 ms slices, and bb's preferred microphone
  (`bb.voiceInput.audioInputDeviceId`).
- Transcription goes shell → `POST /transcribe` (JSON and base64, the action
  token) → the host contract's new optional `voice` → on bb
  `sdk.system.transcribeVoice`, the endpoint bb's composer uses. Whether a
  service is configured comes from `sdk.system.config()`
  (`voiceTranscriptionEnabled`). bb takes no language, so a hint rides at the
  head of the context.
- `voice.captureAndTranscribe` is implemented and always listed (confirmation
  `required`): `{ language?, prompt? (≤ 1000), maxDurationSeconds? (1–600,
  default 120), keepAudio? }` → `{ text }`, plus the recording as a `Blob`
  with `keepAudio`. `unavailable`, with the reason, when the host cannot
  transcribe, no service is configured, the reader's surface cannot record
  (secure context, `getUserMedia`, `MediaRecorder`, microphone permission not
  `denied`), the microphone was refused (then until reload), or the call came
  without the reader's action; `request_too_large` over the host's size limit.
  Inside an embed it stays `unavailable`.
- `<input type="file" accept="audio/*" capture>` in a captured form: with a
  fine pointer a click opens the shell's recorder and the recording becomes the
  input's file; with a coarse one (a phone) the browser's own recorder answers.
  On submit the shell transcribes it from the stored upload and the answer
  carries `Transcript: …` beside its path, or says it is missing.

### Every text area takes voice and files (D39)

- Each `<textarea>` gets **Dictate** and **Attach files** — line icons at
  16 px in the field's own colour — over its bottom-right corner, in a closed
  shadow root whose host is the last child of `<html>`, fixed by inline
  `!important` styles: the field and the page's layout are untouched and page
  CSS cannot reach them. Tab goes from the field to Dictate, Attach, then what
  follows. Disabled, read-only, hidden, modal-dialog and opted-out fields get
  none, and a field loses them while its form sends or the page is an offline
  copy.
- Dictate inserts the transcript at the caret with a separating space and fires
  `input` and `change`; the text before the caret goes as context.
- Attach, paste and drop list files under the field (no layout space). They
  upload with the form, and the answer reports them under **Attached here:**
  beside that field's text, audio with its transcript. File inputs and text
  areas count together: 24 MiB each and 8 per form, and a form over either is
  now refused visibly instead of cut short.
- Attach is offered only in a captured form, not inside an embed and not on the
  built-in home. Dictate works inside an embed through the embedding page's
  shell. `data-thread-page-manual` on a text area removes its controls only.

### After the owner's first live use

- **The controls stay on their field while scrolling.** The layer's host now
  sits at the document's origin (`position: absolute`) and each row is placed
  in document coordinates, so page scrolling moves it with the field on the
  compositor, with no script per scroll. A field under a fixed ancestor, or a
  sticky one stuck to the viewport, gets a fixed row. A field inside a
  scrolling element — the body too, when `<html>` has an overflow of its own
  and the body scrolls — is placed again on that element's scroll events and
  its row is hidden while the element scrolls, coming back 120 ms after it
  stops: a main-thread re-place would trail compositor scrolling by a frame.
  Measured every animation frame during scripted and wheel scrolling: 0 px off
  while shown in all three engines (1.7.0 as merged: up to 966 px, and 30 px
  on a body-scrolling page before this).
- **Attached files sit in the row, inside the field.** One row at the field's
  bottom-right (bottom-left in right-to-left text): a chip per file (a line
  file icon, the name shortened in the middle keeping its extension, a remove
  button named *Remove <name>*), then Dictate and Attach files; what does not
  fit is behind *+N* (*Show N more files*), which opens a list of them, each
  removable; with hardly any room, one *N files* chip. Refusals show above the
  row, stacked with the list. Chips take the nearest opaque background behind
  the field, or the canvas in the page's colour scheme. Nothing is drawn below
  the field any more.
- **A text area's microphone records at once**, right after Done or Cancel
  too — when the reader's own press (a trusted event) lands on a plainly
  visible control: no page element in the top layer, nothing painted after the
  layer, the document neither faded, filtered, clipped nor hidden, and the
  field's colour not transparent. Otherwise, and for
  `voice.captureAndTranscribe` from page script, the bar opens armed in the
  windows after a press on the shell's chrome. The shell still requires its
  own live activation.
- **Hardening of the kernel.** The handshake is accepted only as a trusted
  message from the parent, and every genuine one is stopped before any page
  listener, so a page can neither slip in its own port nor catch the shell's.
  The kernel takes `postMessage`, the port's `onmessage` setter and `start`,
  the `MessageEvent` getters, `addEventListener`, `stopImmediatePropagation`,
  the keyboard event getters, `Reflect.apply` and every DOM operation it uses
  on the layer when it starts, before any page script; an error an original
  raises is raised, never retried through a live, page-patchable method. The
  layer's host is a plain `<div>`, so a page cannot define it as a custom
  element and read its closed root through `ElementInternals`. Only trusted
  keys move focus onto the controls. What this does not change: the kernel is
  page territory (R3.33). A page can still cover, hide or remove the controls,
  lure the reader into pressing one, or break the kernel before a gesture
  reaches it; the most a page gains is a recording bar that records at once,
  with the bar visible and Done still the reader's.
- Inside an embed, Dictate stays on the ordinary path (armed in those windows).
- `test/browser/kernel-hostile.mjs`: the review's hostile pages (a synthetic
  handshake, a throwing original under a patched `postMessage`, a script's Tab,
  `ElementInternals` and a patched `createElement`, a top-layer overlay, a
  filtered page), scrolling in body, element and sticky scrollers with the
  wheel, right-to-left and a narrow field: 45 of 45 across the three engines.

### Files with `sessions.start` and `sessions.send` (D40)

- `files` — a `FileList`, an array of `File` or an `<input type="file">` — goes
  from the kernel to the shell by structured clone; the host sees each file's
  name, size and type, bound into the confirmation's challenge, and the dialog
  names every file with its size. At most 8 files of 24 MiB each, else
  `request_too_large` before any dialog.
- After Confirm the shell stores each file through `POST /attach`, which needs
  the call and its challenge and the exact approved size, as a project
  attachment (`sdk.projects.attachments.upload`); the call then carries them as
  `localImage`/`localFile` items. The host checks count, name, size and type in
  order and refuses a mismatch with `confirmation_invalid`. A failed upload
  starts or sends nothing and names the file (`request_too_large` or
  `handler_error`); bb has no route to remove an attachment, so what was
  stored for the call is logged and left, attached to nothing. A host without
  attachments answers `unavailable`. Works from the built-in home.

### Also

- Every confirmation is used once: replaying an approved call's challenge
  within its two minutes, with or without files, is `confirmation_invalid` and
  starts or sends nothing.
- Confirmation summaries may be 1024 characters and list every file whole, one
  per line (names sanitised and shortened in the middle, keeping the
  extension); the rest of the summary shortens to fit. Signed tokens may be
  8 KiB.
- An approved call's first upload opens a 30-minute upload grant, so a slow
  connection can finish after the 2-minute challenge; the grant is used once
  (a replayed challenge stores and starts nothing), and every path that leaves
  stored attachments unused — a failed upload, a failed call, a mismatch, a
  file stored twice, an expired grant — removes them where the host can and
  logs each by project and path where it cannot (bb), and the reader is told.
- bb's own attachment rules — images at most 10 MB, no HEIC/HEIF — are
  checked before the dialog, and bb's own refusal message reaches the page.
- A transcript longer than 16,000 characters is shortened and marked
  *(transcript shortened)* instead of failing the answer; only audio files are
  ever sent to the transcriber.
- Text areas: `:disabled` (a disabled fieldset) and `inert` count as disabled;
  the layer's observers start only once a text area exists; paste and drop the
  page handled itself are left alone. `files: undefined` is no files.
- The guide documents text areas, voice, the recorded answer and `files`, with
  their limits; the standing instruction is unchanged.
- `test/browser/voice.mjs`: 53 checks, passing in Chromium, Firefox and WebKit.

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
