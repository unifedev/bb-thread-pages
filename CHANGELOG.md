# Changelog

Derived from the private monorepo's CHANGELOG (`unifedev/unife` ebe805a): the parts that
concern the bb plugin and the server vendored into it. References to `reviews/`, `NOTES.md`, `DESIGN.md`,
`RELEASE-*.md` and branch names are to that monorepo; `packages/bb-pages` is this plugin's directory there.
Versions 1.9.0 and earlier were a different implementation of the same plugin; their changelog is in the
`v1.9.0` tag of this repository.

## 1.14.9 (bb plugin) — 2026-10-30

The bb plugin's release of the 0.6.26 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.9`): the page server stops waiting on a host call
after 30 seconds (90 for a file upload), and the home recovers on its own from a call that never answers, both from
pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.9.

## 0.6.26 — 2026-10-30

When the host never answers a call, the page server now stops waiting after 30 seconds, tells the page the host did
not answer, and frees the call's place, so a page or the home keeps working instead of being refused everything after
eight such calls (B-0232); file uploads get the same after 90 seconds (B-0238). The home also recovers on its own when
one of its reads never comes back (B-0228). All three are in pages-core, so both hosts carry them.

`@unifedev/pages-core` 0.6.9, `@unifedev/claude-pages` 0.6.26, the bb plugin `@unifedev/thread-pages` 1.14.9.

### Fixed

- **A host call that never answers no longer uses up a page's calls.** The page server waited for the host as long as
  it took, and each call still waiting held one of the eight a page may have in flight. After eight that never came
  back, every call from that page was refused as rate limited, sends included, until the host gave up on those calls
  (bb does after 75 seconds) or the server restarted; for the home those eight are shared by every home tab on every
  device, so a reload did not help. Now the server stops waiting after 30 seconds, answers `unavailable` with reason
  `timeout` ("The host did not answer within 30 seconds"), and the call's place is free again at once. A send or
  another write may still go through later: a form answer or a confirmed action tried again is not done a second
  time, and once the host answers, the retry gets that answer. A call that was still waiting for an earlier step when
  it was answered does nothing more. The folder picker and voice transcription are not cut off, and calls to other
  plugins keep their own 30-second limit. Test: `packages/pages-core/test/serving/bridge-timeout.test.ts`.
- **A file upload the host never takes no longer uses up a page's calls.** A form's file upload and a file attached to
  a prompt waited for the host as long as it took, in one of the page's eight places. Now the server stops waiting 90
  seconds after the upload took its place, and the form shows "The host did not answer within 90 seconds". 90 seconds
  is above the 75 seconds after which bb itself gives up on a host call, and a 24 MiB file took under a second on bb
  on the same machine, so no host call that would succeed is cut on its own. An attachment the host takes after that
  is not added to the prompt; an upload that lands late stays in the page's `uploads/` folder, named by no answer.
  Test: `packages/pages-core/test/serving/file-timeout.test.ts`.
- **A host call that never answers no longer freezes the home.** The home waited for every read as long as the host
  took. A read that never came back kept an older session reopened after a reload from ever refreshing, stopped the
  session list or the open chat from updating, and four of them stopped every call the home makes, sends included,
  until the tab was reloaded. Now a read that has no answer after 60 seconds fails in the home itself (the server's
  30-second answer above usually comes first; this covers an answer lost on the way back), and the home tries again
  as it would after any failed read. Sending, answering, stopping and the other actions still wait for the server.
  If the home cannot read your saved view settings when it starts, it no longer saves its defaults over them.
  Test: `packages/pages-core/test/agent/home.test.ts`.

## 0.6.25 — 2026-10-30

On Claude Code under LXCFS (LXD, Incus, some Kubernetes nodes), the page server now says in its log why it drops its
notes of the processes it pushed answers to, where 0.6.24 dropped them without a word (B-0257).
`@unifedev/claude-pages` 0.6.25; `@unifedev/pages-core` stays 0.6.8 and the bb plugin `@unifedev/thread-pages`
1.14.8: neither changes.

## 0.6.24 — 2026-10-30

On Claude Code, a page answer you stopped with Esc in one terminal now runs in the other terminal you opened the
conversation in, at once, instead of waiting until the first terminal closes (B-0250, a regression in 0.6.22). Two
narrower cases of one conversation open in two terminals are fixed with it (B-0252, B-0253). On Linux, the page
server's check of the processes it pushed answers to now also works in Alpine and Debian slim containers, and its
log says when it cannot check (B-0254, B-0256).
`@unifedev/claude-pages` 0.6.24; `@unifedev/pages-core` stays 0.6.8 and the bb plugin `@unifedev/thread-pages`
1.14.8: neither changes.

## 0.6.23 — 2026-10-30

On Claude Code, an answer taken across a `/clear` now runs once and reads delivered even when the page server
restarted in between (B-0244), and a terminal that lost its page to another terminal no longer reports the
conversation ended when it leaves it (B-0249). `@unifedev/claude-pages` 0.6.23; `@unifedev/pages-core` stays 0.6.8
and the bb plugin `@unifedev/thread-pages` 1.14.8: neither changes.

## 0.6.22 — 2026-10-30

On Claude Code, with one conversation open in two terminals, an answer from the page now runs once, in one terminal
(B-0239), and typing in a terminal while its own turn runs takes the page back to it (B-0241). A background session
you remove with `claude rm` leaves the home, and the "Untitled session" rows the agent view left before 0.6.20 are
cleared (B-0240). `@unifedev/claude-pages` 0.6.22; `@unifedev/pages-core` stays 0.6.8 and the bb plugin
`@unifedev/thread-pages` 1.14.8: neither changes.

## 0.6.21 — 2026-10-30

On Claude Code, a page answer that runs after a `/clear` now reads "delivered" and runs only once, also when the page
server was away at that moment, or when you typed `/clear` and then `/branch` or `/resume` quickly (B-0234, B-0236).
`@unifedev/claude-pages` 0.6.21; `@unifedev/pages-core` stays 0.6.8 and the bb plugin `@unifedev/thread-pages` 1.14.8:
neither changes.

## 0.6.20 — 2026-10-30

On Claude Code, opening the agent view no longer adds an "Untitled session" to the home (B-0233).
`@unifedev/claude-pages` 0.6.20; `@unifedev/pages-core` stays 0.6.8 and the bb plugin `@unifedev/thread-pages`
1.14.8: neither changes.

## 0.6.19 — 2026-10-29

On Claude Code, a conversation open in two terminals at once no longer makes its page flicker: the page follows the
terminal you last typed in (B-0230). `@unifedev/claude-pages` 0.6.19; `@unifedev/pages-core` stays 0.6.8 and the bb
plugin `@unifedev/thread-pages` 1.14.8: neither changes.

## 0.6.18 — 2026-10-29

On Claude Code, a page answer that runs after two quick `/clear`s now reads "delivered" on the page it came from, and
runs only once (B-0231). `@unifedev/claude-pages` 0.6.18; `@unifedev/pages-core` stays 0.6.8 and the bb plugin
`@unifedev/thread-pages` 1.14.8: neither changes.

## 0.6.17 — 2026-10-29

On Claude Code, a page answer that runs after you type `/resume` or `/branch` now reads "delivered" on the page it came
from, and runs only once (B-0229). `@unifedev/claude-pages` 0.6.17; `@unifedev/pages-core` stays 0.6.8 and the bb
plugin `@unifedev/thread-pages` 1.14.8: neither changes.

## 0.6.16 — 2026-10-29

On Claude Code, a conversation you resume or branch inside a session gets its own page (B-0222), the page of a session
you left stays ended (B-0224), and an answer run after a `/clear` is reported delivered even when the new session
reaches the page server late, without running a second time when you go back to the old conversation (B-0225).
`@unifedev/claude-pages` 0.6.16; `@unifedev/pages-core` stays 0.6.8 and the bb plugin `@unifedev/thread-pages`
1.14.8: neither changes.

## 1.14.8 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.15 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.8`): an older session the home reopens after a
reload comes back with its state and its questions, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.8.

## 0.6.15 — 2026-10-29

An older session the home reopens after a reload comes back with its state and its questions, however deep it is in
its workspace. In pages-core's built-in home, so both hosts carry it (B-0221): spec 08 A201.

`@unifedev/pages-core` 0.6.8, `@unifedev/claude-pages` 0.6.15, the bb plugin `@unifedev/thread-pages` 1.14.8.

### Fixed

- **An older session reopened after a reload shows its real state.** When the home could not find the session where
  it saved it (it had moved, or the host no longer took that place), it looked only at the newest 150 sessions of its
  workspace, from the top each time. A session deeper than that stayed open under its title but never refreshed: it
  showed as working, its menu offered Stop the turn, and a question or approval it asked never showed. Now each look
  carries on where the last one stopped, to the end of the workspace; once found, the session joins the list with its
  state, its questions and its page, and later looks read only the page it was found on. A session the host still
  keeps but lists nowhere shows no state and no Stop, and is looked for every 5 minutes instead of every 30 seconds.
  Test: `packages/pages-core/test/agent/home.test.ts`.

## 0.6.14 — 2026-10-29

On Claude Code, a page that sent answers just before you typed `/clear` now reads them as delivered (B-0217).
`@unifedev/claude-pages` 0.6.14; `@unifedev/pages-core` stays 0.6.7 and the bb plugin `@unifedev/thread-pages`
1.14.7: neither changes.

## 1.14.7 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.13 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.7`): a reload comes back to an older session opened
from the home's search, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.7.

## 0.6.13 — 2026-10-29

A reload comes back to an older session opened from the home's search. In pages-core's built-in home, so both hosts
carry it (B-0214): spec 08 A201.

`@unifedev/pages-core` 0.6.7, `@unifedev/claude-pages` 0.6.13, the bb plugin `@unifedev/thread-pages` 1.14.7.

### Fixed

- **A reload comes back to an older session opened from search.** The home reopens the session you had open when it
  reloads within 10 minutes, but it looked the session up only in the sidebar's rows, so one found with search past
  them dropped to New session, with no word why. A phone tab reloads often. Now the home also keeps that session's
  title, workspace and the page search found it on. After a reload it shows the session under its title, reads that
  page again, and the session joins the list as the open one, as when you picked it. If the session has moved off
  that page, its workspace is read. It says "This session is not listed" only once the host says the session is
  gone; a read that fails keeps the session open and is tried again. If the host refuses the saved page itself (on
  Claude Code, once the session it was read past is removed), the workspace is read instead, so a session opened from
  search and later deleted also says "not listed" without a reload. Test: `packages/pages-core/test/agent/home.test.ts`.

## 0.6.12 — 2026-10-29

On Claude Code, page answers run in the order you sent them also when one of them asks for a model or effort (B-0212).
`@unifedev/claude-pages` 0.6.12; `@unifedev/pages-core` stays 0.6.6 and the bb plugin `@unifedev/thread-pages`
1.14.6: neither changes.

## 1.14.6 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.11 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.6`): an older session picked from the home's search
opens, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.6.

## 0.6.11 — 2026-10-29

An older session found with the home's search opens and stays open. In pages-core's built-in home, so both hosts
carry it (B-0205): spec 08 A201.

`@unifedev/pages-core` 0.6.6, `@unifedev/claude-pages` 0.6.11, the bb plugin `@unifedev/thread-pages` 1.14.6.

### Fixed

- **An older session picked from the home's search opens.** The home's sidebar shows the newest sessions (of each
  workspace, where there are several) and says that search finds the rest. Search did find them, but picking one
  past the sidebar's rows showed "This session is not listed" for a session that was live. The picked session now
  joins the list as the open session and stays there while the host still finds it. Every 30 s the home reads again
  the one page search found it on, so its state, a question or decision it waits on, and a page written later all
  show, also where the host lists by start and the session never comes back among the newest rows. The home says
  "not listed" only once the host says the session is gone, as it already did for a session started from the home,
  and at once for one it already knew to be gone. Leaving it returns the sidebar to the newest rows. Test: `packages/pages-core/test/agent/home.test.ts`.

## 0.6.10 — 2026-10-29

On Claude Code, a page answer that Claude Code throws away after a stop in the terminal is no longer lost (B-0208),
and answers after a stop run in the order you sent them (B-0210).
`@unifedev/claude-pages` 0.6.10; `@unifedev/pages-core` stays 0.6.5 and the bb plugin `@unifedev/thread-pages`
1.14.5: neither changes.

## 1.14.5 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.9 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.5`): an `html` frame given no folder starts fresh
again on each `embed`, and a restored scroll survives a frame's late viewport, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.5.

## 0.6.9 — 2026-10-29

Only an `html` frame its page gave a folder is a new version of one document; one without starts fresh on each
`embed`, as in 0.5.2. A restored scroll is applied again only once a frame has a height. In pages-core, so both hosts
carry it (B-0159, B-0158): spec 02 R4.42a, R4.48a; 08 A207; fixture 15.

`@unifedev/pages-core` 0.6.5, `@unifedev/claude-pages` 0.6.9, the bb plugin `@unifedev/thread-pages` 1.14.5.

### Changed

- **An `html` frame given no folder starts fresh on each `embed`, as in 0.5.2.** `threadPage.embed(iframe, { html })`
  without `scope` (or with `null`) on an `<iframe>` that shows an `html` frame now shows a fresh frame: no drafts and
  no scroll carried from the earlier document, and the frame's `setDirty(true)`, typing or answer in flight does not
  hold the switch. 0.5.3 counted two calls without a `scope` as versions of one document, so a page switching one
  frame between different snippets carried a form's text from one into the other and waited while the reader typed.
  This holds also where the frame is bound to the page's own folder only because it was given none (0.5.4), and where
  one of the two calls gives a `scope` and the other does not. A frame given the same `scope` in both calls keeps
  0.5.3's behaviour: a new version that keeps the reader's typing and scroll and waits while they type. Tests:
  `packages/pages-core/test/runtime/kernel/embed.test.ts`.

### Fixed

- **A restored scroll survives a resize that leaves the frame without a height.** A frame that gets its viewport late
  (Firefox) has its scroll applied again on the first resize; a resize that changed only the width, with the height
  still 0, used that up and the frame stayed at the top. Now the scroll is applied again on the first resize that
  gives the frame a height. Test: `packages/pages-core/test/runtime/kernel/restore.test.ts`.

## 0.6.8 — 2026-10-29

On Claude Code, page answers that reach a session together are each delivered once (B-0185). `@unifedev/claude-pages`
0.6.8; `@unifedev/pages-core` stays 0.6.4 and the bb plugin `@unifedev/thread-pages` 1.14.4: neither changes.

## 1.14.4 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.7 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.4`): a page opened in the home shows its own
frames as on its own address, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.4.

## 0.6.7 — 2026-10-29

A page opened in the home shows its own frames, as on its own address (B-0189). `@unifedev/pages-core` 0.6.4,
`@unifedev/claude-pages` 0.6.7 and the bb plugin `@unifedev/thread-pages` 1.14.4: the same change on both hosts.
Spec 02 R4.48b, R4.52; 03 R5.59a, R5.61a; 05 R3.9; 07 R5.93; 08 A213. No agent text changed.

### Fixed

- **A page opened in the home shows its own frames.** The home's view of a session's page had no `threadPage.embed`,
  so a page that shows itself through frames of its own showed blank there: a Syns workspace opened from the home
  without the agent's page inside it (or, with Syns 0.12, did not open at all). Now `embed` works in the home's view
  as on the page's own address: `{ html }` frames and the session's own documents, their storage and plugin calls as
  that page's, an app frame held to its folder with its plugin told the call came from it, their forms delivered as
  from that frame, and inside them another session's page as it shows inside that page, answered under that page's
  grant and framing line. Uploads, files in forms and large media stay out of the home's view and its frames.
  Tests: `packages/pages-core/test/serving/home-view.test.ts`, `test/runtime/kernel/embed.test.ts`.

## 1.14.3 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.6 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.3`): a form's *Sent* stands until the agent's turn
ends, on the page and inside another page's embed of it.

### `@unifedev/thread-pages`

- `package.json` version 1.14.3.

## 0.6.6 — 2026-10-29

A form's delivery word (*Sent*, *Queued*, *Steered*) stands until the session is next idle (B-0186).
`@unifedev/pages-core` 0.6.3, `@unifedev/claude-pages` 0.6.6 and the bb plugin `@unifedev/thread-pages` 1.14.3: the
same change on both hosts. Spec 05 R2.24; 08 A212.

### Fixed

- **A form's *Sent* stays until the agent's turn ends.** Any change of the session's working state cleared a form's
  delivery word, so the turn the answer started replaced *Sent* with the working text at once: inside another page's
  `embed` of the page within one round trip, so the reader never saw *Sent*, and on the page itself after about 2 s.
  When the turn ended the line went blank and nothing said the answer had arrived. Now *Sent*, *Queued* or *Steered*
  stands through the turn it started or waits behind and goes when the session is next idle, or when the reader
  types in that form again; the page's other forms show the working text as before, and an error still stands until
  the reader types in its form. Test: `packages/pages-core/test/runtime/kernel/session-state.test.ts`.

## 1.14.2 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.5 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.2`): an app's answer from a frame of the page no
longer says it was given on an earlier version when only the page around it changed.

### `@unifedev/thread-pages`

- `package.json` version 1.14.2.

## 0.6.5 — 2026-10-29

An answer sent from an app shown in a frame of the agent's page no longer says it was given on an earlier version
when only the page around it changed (B-0181). `@unifedev/pages-core` 0.6.2, `@unifedev/claude-pages` 0.6.5 and the
bb plugin `@unifedev/thread-pages` 1.14.2: the same change on both hosts.

### Fixed

- **An app's answer no longer reads "Answered on an earlier version of the page" when the app did not change.** A
  page can show an app in a frame (a Syns workspace app, or any frame the page gives its own HTML). When the agent
  rewrote only its own page while the app stayed open, the app's next answer reached the agent with that line, as
  if the reader had typed into an outdated form. The page holds that app's document and the answer is always sent
  from what is on screen, so the line is now never added to it. Answers from the page's own forms and from a frame
  showing another file of the page keep the line as before. Test: `packages/pages-core/test/serving/submit.test.ts`.

### bb

- The same fix: the bb plugin's server is the shared one.

## 0.6.4 — 2026-10-29

On Claude Code, the page server uses the Claude Code config folder its sessions use, and keeps its own internal
settings to itself (B-0179, B-0182). `@unifedev/claude-pages` 0.6.4; `@unifedev/pages-core` stays 0.6.1 and the bb
plugin `@unifedev/thread-pages` 1.14.1: neither changes.

## 0.6.3 — 2026-10-29

On Claude Code, the page server no longer takes on the settings of the session that started it, and a second stop
request no longer cuts its stop short (B-0175, B-0176). `@unifedev/claude-pages` 0.6.3; `@unifedev/pages-core` stays
0.6.1 and the bb plugin `@unifedev/thread-pages` 1.14.1: neither changes.

## 0.6.2 — 2026-10-29

On Claude Code, an update reaches the running daemon (B-0171). `@unifedev/claude-pages` 0.6.2; `@unifedev/pages-core`
stays 0.6.1 and the bb plugin `@unifedev/thread-pages` 1.14.1: neither changes.

## 1.14.1 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.1 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.1`): `bb pages init`, `bb pages status` and the
answer wording for uploads give absolute paths, and with Connect on `init` also prints the page's loopback address
for the agent's own check.

### `@unifedev/thread-pages`

- `package.json` version 1.14.1.

## 0.6.1 — 2026-10-29

On bb, `init` gives paths every file tool takes, and an address the agent can open itself (B-0165, B-0166): spec 02
§The answer wording, 04 R6.7a, 05 §The serving host interface and R-S9, 06 R-P12; 08 A211.

`@unifedev/pages-core` 0.6.1, `@unifedev/claude-pages` 0.6.1, the bb plugin `@unifedev/thread-pages` 1.14.1.

### Changed

- **bb: absolute paths for the agent.** `bb pages init` printed the page as `$BB_THREAD_STORAGE/index.html` and the
  root as `Root: $BB_THREAD_STORAGE/`; `bb pages status` and the file lines of an answer with uploads used the same
  form. Only a shell expands that variable: a file tool given it made a folder named `$BB_THREAD_STORAGE` in the
  working directory, so the page was written where nobody reads it. They now give the thread's storage path as bb
  reports it (`/…/index.html`, `Root: /…/`, `/…/uploads/<name>`). The folder is the same one, so pages already
  written are where they were and nothing moves. The standing instruction still names the folder as "your thread
  storage, `$BB_THREAD_STORAGE`"; that wording waits for the next guide batch. Tests:
  `packages/bb-pages/test/provider/sessions.test.ts`, `packages/bb-pages/test/integration/fixtures.test.ts`.
- **bb: a local address for the agent's own check.** With Connect paired, the URL `init` prints is the Connect
  address, which a browser on this machine is refused without signing in. `init` now adds one line after it,
  `Local: http://127.0.0.1:<port>/api/v1/plugins/thread-pages/http/page?session=<id> (this machine only, for your own
  check)`. That address opens the page on this machine with no sign-in and carries no credential. Without Connect the
  URL is already that address and there is no `Local:` line. In pages-core this is an optional
  `ServingHost.checkOrigin()`, used by `init` only. The Claude Code host has none, by design: its agent does not
  open the reader's page. Test: `packages/pages-core/test/agent/commands.test.ts`.

## 1.14.0 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.6.0 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.14.0`): a shortcut or installed app of the home or a
page carries the Syns mark and a sensible name, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.14.0.

## 0.6.0 — 2026-10-29

Shortcuts and installed apps carry the Syns mark and a sensible name, on bb and Claude Code alike, in pages-core
(B-0130): spec 05 R2.14, R2.14a, §Routes; 08 A210. A new route and head; no agent text changed.

`@unifedev/pages-core` 0.6.0, `@unifedev/claude-pages` 0.6.0, the bb plugin `@unifedev/thread-pages` 1.14.0.

### Added

- **A shortcut to the home or a page shows the Syns mark and a name.** Every page's outer document now carries the
  Syns mark as the tab icon (the brand's adaptive mark, lighter in dark mode) and as the iPhone home-screen icon (the
  blue mark on white), a name (the home: `Syns`; a page: its session's title), a one-line description (the home:
  `Syns`; a page: its project's name), the bar colour in light and dark, and a link to the address's web app
  manifest. On iPhone, Add to Home Screen makes the home an app named `Syns` and a page one named by its title; on
  macOS, Safari's Add to Dock and Chrome's Install do the same, each address its own app. On iPhone they open without
  Safari's bars, and on macOS each in a window of its own; over bb's remote address, a sign-in the app asks for is
  finished inside the app and returns to its address. The tab title is
  unchanged (the home's stays `Home`), nothing is drawn, no page can change the mark, and nothing is stored offline
  (no service worker).

## 1.13.4 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.5.4 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.13.4`): an `html` frame stays in the folder its page
gave it, and a plugin is told a call came from it, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.13.4.

## 0.5.4 — 2026-10-29

An `html` frame is bound to the folder its page gave it, and a plugin is told a call came from it, in pages-core, so
both hosts carry it (B-0154, B-0155): spec 02 R4.42a, R4.48a, R4.63; 04; 05 R3.9; 07 R5.83a, R5.84c and the call's
shape; 08 A208, A209; fixture 15.

`@unifedev/pages-core` 0.5.4, `@unifedev/claude-pages` 0.5.4, the bb plugin `@unifedev/thread-pages` 1.13.4.

### Changed

- **An app shown in a frame stays in its folder.** `threadPage.embed(iframe, { html, scope, title })`: `scope` is now
  the frame's bound, not only where it starts. Inside the frame `setScope` takes only that folder or one below it;
  `null` or any other folder throws `TypeError`. A `storage.*` or plugin call from the frame, its own or one it relays
  under a token for the page's own session, whose scope is not that folder or below it is refused `invalid_params`
  and does nothing. Without `scope` (or with `null`) the bound is the page's scope at the call; a page with no scope
  gives no bound, and the frame keeps the page's whole reach. A frame inside a frame is held by both: an `embed` there
  with a `scope` outside its bound throws. Other calls (`session.*`, `sessions.*`, forms, uploads) and another
  session's page shown inside the frame are as before. Until now `scope` was only where the frame started, so an
  app's script could widen it to the whole session. A page that has set its own scope and embeds an `html` frame
  without `scope` now starts that frame in its scope instead of in none. Tests:
  `packages/pages-core/test/serving/frame-bound.test.ts`, `packages/pages-core/test/runtime/kernel/embed.test.ts`.

## 1.13.3 (bb plugin) — 2026-10-29

The bb plugin's release of the 0.5.3 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.13.3`): an `html` frame keeps the reader's work across
a new version of its document, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.13.3.

## 0.5.3 — 2026-10-29

An `html` frame keeps the reader's drafts and scroll across a new version of its document, in pages-core, so both
hosts carry it (B-0153): spec 02 R4.42a, R4.48a, 08 A207, fixture 15.

`@unifedev/pages-core` 0.5.3, `@unifedev/claude-pages` 0.5.3, the bb plugin `@unifedev/thread-pages` 1.13.3.

### Changed

- **A new version of an `html` frame keeps what the reader typed.** `threadPage.embed(iframe, { html, scope, title })`
  on an `<iframe>` that already shows an `html` frame with the same `scope` (or none in both) is now a new version of
  that frame's document, not a fresh frame: it keeps the reader's drafts and scroll and takes the call's `title` and
  `onState`. While the reader types in it, an answer from it is in flight, or it holds `setDirty(true)`, the frame keeps
  the version it shows, is told a newer one waits (`data-thread-page-update`, the event, the forms' status line), and
  takes the latest once nothing holds it, as an embedded page does with its revisions; a recording the frame asked for
  (Dictate, a voice note) holds it too. Before it takes a version that waited, the frame waits `frameVersionGraceMs`
  (400 ms) once nothing holds it, so a tap that lifted the hold still lands where it was aimed; before any version it
  flushes its drafts and scroll, so the last keystrokes are kept and a form just sent does not come back filled in.
  Drafts of a form with neither an `id` nor a `data-title` are not carried to a different text. A call with the text the frame already shows loads
  nothing. Every call's stop function stops the frame: a page that disposes of an earlier call's stop function after
  showing a new version now stops the frame, where until 0.5.2 that earlier function did nothing. Another `scope`,
  `{ sessionId }`, or a container element still shows a fresh frame; a page that wants one on the same `<iframe>`
  stops it first. Two calls without a `scope` on one `<iframe>` count as versions of one document. The new version
  loads anew: it is not handed to `onPageUpdate`. Until now each call showed a fresh frame, so an app shown in a frame
  lost the reader's typing when the page showed its new version. Tests:
  `packages/pages-core/test/runtime/kernel/embed.test.ts`.

### Fixed

- **A frame restored before it has a viewport keeps its scroll.** In Firefox a frame of a page could reach
  DOMContentLoaded with no viewport yet (`innerHeight` 0), so the scroll restored into it was clamped to the top;
  the kernel now applies it again once the frame gets its size. Seen on the Claude Code host's page frame for a new
  version of an `html` frame; it applies to every frame the kernel restores. Tests:
  `packages/pages-core/test/runtime/kernel/restore.test.ts`.

## 1.13.2 (bb plugin) — 2026-10-28

The bb plugin's release of the 0.5.2 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.13.2`): the owner's guide batch, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.13.2.

## 0.5.2 — 2026-10-28

The owner's guide batch, in pages-core, so both hosts carry it (B-0143): spec 04 §The text, R6.17, R6.24, 08 A56.
Under Tests, the fixtures are read from the protocol's tree only (B-0149) and the instruction test reads its
committed copy only (B-0121).

`@unifedev/pages-core` 0.5.2, `@unifedev/claude-pages` 0.5.2, the bb plugin `@unifedev/thread-pages` 1.13.2.

### Changed

- **The standing instruction tells the agent to rewrite its page whole each turn.** Its first paragraph now reads
  "Every turn, rewrite one HTML page whole from what is true now", it says to run init "at the start and whenever you
  lose the page's path", and it ends its form line with "end with one form holding an empty text field for anything
  else". The sentence "Your page is yours alone." left it; the guide still teaches it in full. The text is 787 bytes
  around its placeholders. On bb, an *Agent instruction text* that is a verbatim copy of the 1.11.0–1.13.1 built-in
  text reads as the built-in text, so it moves to the new one; any other operator text is kept as it is.
- **The guide keeps one composer at the bottom of the page.** *Forms* now asks for the empty text field in one
  captured form at the bottom of the page, always visible, as how the reader starts the agent, with the page's other
  controls joined to it by `form="<its id>"` so their picks arrive with what was typed; that field is a `<textarea>`,
  so it takes files, and voice where the host transcribes. Tests: `packages/pages-core/test/agent/instruction.test.ts`,
  `guide.test.ts`, `packages/bb-pages/test/provider/instruction.test.ts`.

### Tests

- **The fixtures are read from the protocol's tree only; this repository's own copy is gone** (B-0149). The
  repository kept a copy of the protocol's `verify/`, made on 8 October and never kept up: it lacked fixtures 13–15 and
  had older 06, 09 and 10, and the browser fixture runner read it whenever no folder was named, so a plain
  `pnpm test:browser` failed 09 and 10. Every reader here (the runner, the integration tests of the core and both
  hosts, the Claude Code host's end-to-end test, `pnpm dev` without a directory) now finds the fixtures one way
  (`packages/pages-core/test/fixtures-dir.mjs`): `--fixtures-dir` where the reader takes it, else `PAGES_FIXTURES`,
  else the protocol tree placed at `~/.syns/unife-pages`. A named folder without fixtures, or none found, stops the run
  naming where it looked; nothing falls back to a stale copy. Fixture 06's "Reply with settings" probe (A189), which
  only this copy had, is now in the protocol's fixture 06. Nothing a page or a reader sees changes. Tests:
  `pnpm test:runner` (four new checks).
- **The instruction test compares the standing text with its committed copy only** (B-0121). It read spec 04 from a
  shared local checkout, so the same code passed or failed with whether that checkout was pulled. A script,
  `packages/pages-core/scripts/check-instruction-spec.mjs`, compares the copy with spec 04 at the spec's head, and the
  release's check step runs it. Nothing a page or a reader sees changes.

## 1.13.1 (bb plugin) — 2026-10-28

The bb plugin's release of the 0.5.1 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.13.1`): Stop on the page's own agent works at the
first Confirm while the agent saves, a Copy button works in Chrome and other Chromium browsers, and a document
whose own query names `file` opens as that document, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.13.1.

## 0.5.1 — 2026-10-28

Three fixes in pages-core, so both hosts carry them: Stop on the page's own session works at the first Confirm while
the agent saves (B-0120): spec 03 R5.28, 05 R2.13, R3.19, 02 R-K1, 08 A15, A49, 04's guide. A page may write the
clipboard on the reader's press in every browser (B-0133): spec 05 R3.3b, 02 R4.43, 08 A94; fixture 09. And a
document whose own query names `file` opens as that document on bb (B-0140), as 01 R1.12g already said.

`@unifedev/pages-core` 0.5.1, `@unifedev/claude-pages` 0.5.1, the bb plugin `@unifedev/thread-pages` 1.13.1.

### Fixed

- **Stopping the page's own agent works at the first Confirm while the agent saves.** When the agent saved its page
  while the reader looked at the Stop dialog, or in the moment between a save and the page updating, the confirmed
  Stop was refused `stale_page` and the turn kept running; a retry from the updated page was refused too. A stop of
  the page's own session now does not depend on which version of the page is open: the reader still confirms it, in
  the host's own words, and its confirmation still holds for that one request, once and briefly. A stop of another
  session, and every other call, is still refused `stale_page` once the page changed. The guide also says that a
  page with `onPageUpdate` is handed its new version rather than reloaded. Tests:
  `packages/pages-core/test/serving/bridge.test.ts` (§11a).
- **A Copy button in a page works in Chrome, other Chromium browsers and the bb desktop app.**
  `navigator.clipboard.writeText()` on the reader's click was refused in Chromium-based browsers, in the page and in
  any page shown inside it, while Safari and Firefox copied. The page frame and every frame the kernel shows now carry
  `allow="fullscreen *; clipboard-write *"`, so a click copies there too (measured in Chromium, WebKit and Firefox on
  both hosts, and in Chrome and the bb desktop app's Browser tab on bb). A write without the reader's recent click, in that
  frame or in a frame inside it, is still refused in every browser measured, and a page still cannot read the
  clipboard. A page that shows another page inside it can write the clipboard in the seconds after the reader clicks
  inside the page it shows, as Safari and Firefox already allowed. Tests:
  `packages/pages-core/test/runtime/shell/swap.test.ts`, `test/runtime/kernel/embed.test.ts`, and fixture 09 in
  Chromium, WebKit and Firefox.
- **On bb, a document whose own query names `file` opens as that document.** A link, `pages.open` or a typed page
  address to `tool.html?file=report.pdf` showed the file `report.pdf` in the frame instead of `tool.html`, and on
  every host a `file` typed as a further parameter of the page address (`&path=tool.html&file=report.pdf`) was
  dropped. The document now opens with `?file=report.pdf` as its own query, as with any other name the host does not
  use itself (`session`, `path`, `render`), and keeps it when the page updates; the page's own files still load as
  before. Claude Code opened the document already but lost its `file` at the page's next update. Tests:
  `packages/pages-core/test/serving/routes.test.ts` (the document route, B-0140).

### Tests

- **The browser fixture runner no longer counts a fixture that stopped early as a pass** (B-0144). It read a fixture
  until its rows had not changed for 2.5 s, and fixture 03's frame check waits silently for just as long, so a timer a
  little late ended the read after R4.13 with no FAIL. A fixture that declares a complete row (01–06) is now read until
  that row comes; one that never records it gets a FAIL row of the runner's own and the run exits 1. Nothing a page or
  a reader sees changes. Tests: `packages/pages-core/test/browser/runner.mjs` (`pnpm test:runner`).

## 1.13.0 (bb plugin) — 2026-10-28

The bb plugin's release of the 0.5.0 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.13.0`): a page shows a document it holds as a frame
of its own session, which works as the page itself, and `pages.open` opens another page at a document and a place,
from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.13.0.

## 0.5.0 — 2026-10-28

Two changes in pages-core, so both hosts carry them: a frame of the page's own session is the page (B-0136): spec 02
R4.42a, R4.48a (R4.44, R4.48–R4.53 now about another session's page), 03 R5.59a, 05 R2.32, 04's guide, 08 A101,
A104, A131, A205; fixture 15. And `pages.open` takes a document and a fragment (B-0135): spec 03 R5.29b, R5.32b,
01 R1.12d, 08 A206.

`@unifedev/pages-core` 0.5.0, `@unifedev/claude-pages` 0.5.0, the bb plugin `@unifedev/thread-pages` 1.13.0.

### Added

- **A page can show a document it holds, and that frame works as the page.** `threadPage.embed(target, { html,
  scope, title, onState })` shows `html` in a frame with the page's own kernel and its plugins' page scripts in front
  of it; `scope` is the folder its calls are about, `title` names it in its form answers. Inside it everything works
  as on the page: forms upload their files to `uploads/`, text areas offer Attach (and Dictate where the host has
  voice), a voice-note input records, every capability the page may call works with `files`, under the host's own
  confirmations and the page's own budget, `storage` and plugin calls carry the frame's scope, and the frame may embed
  further, up to 4 frames deep. Its form answers reach the page's own session worded `The user answered the form in
  <title> on your Thread Page — <form title>.` The page's kernel passes everything the frame sends to the host as the
  page's own, so the frame cannot name another session. Its links resolve as the page's; its relative images, styles
  and scripts load from the page's folder on Claude Code, which serves files by URL, and not on bb, which carries a
  page's files inside it: there a frame inlines them or names them absolutely. A plugin's page script runs inside each
  such frame too; the kernel's `data-config` says `embedded: true` there. Tests: `packages/pages-core/test/runtime/kernel/embed.test.ts` (the frame and
  its relay), `test/serving/submit.test.ts` (the answer), `test/runtime/protocol.test.ts`,
  `test/runtime/shell/submit.test.ts`, and fixture 15 in Chromium, WebKit and Firefox.
- **`pages.open` opens another session's page at one of its documents and at a place in it.**
  `pages.open({ sessionId, path: "notes.html", fragment: "results" })` opens that page at `notes.html`, scrolled to
  `#results`, in place, and Back returns; `path` may carry the document's query (`"tool.html?scope=a"`), as the page's
  address does. A link to another session's page address with `&path=…#…` now lands there too, where it opened the
  page's entry before; such a link whose `path` is not a document of the page (a part, a file that is not HTML) or whose
  fragment the call refuses now does nothing, where it opened the entry. A `path` that is not a document of a page (a part, `uploads/`, outside its folder, a query using
  the host's names `session`, `path` or `render`), a fragment with `#`, whitespace or control characters or over 2,048
  characters in the address, and either field beside `home` are `invalid_params`; whether the
  document exists is the opened page's to show. Tests: `packages/pages-core/test/serving/bridge.test.ts`,
  `test/domain/scope.test.ts`.

## 1.12.1 (bb plugin) — 2026-10-28

The bb plugin's release of the 0.4.1 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.12.1`): a link to another session's page or to the
home opens it in place, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.12.1.

## 0.4.1 — 2026-10-28

One change in pages-core, so both hosts carry it: a link to the host's own page address opens that page (B-0134):
spec 02 R4.15, 03 R5.32b, 04's guide, 08 A204.

`@unifedev/pages-core` 0.4.1, `@unifedev/claude-pages` 0.4.1, the bb plugin `@unifedev/thread-pages` 1.12.1.

### Fixed

- **A link to another session's page, or to the home, opens it.** An ordinary `<a href>` to the host's own page
  address — `…/page?session=<id>` or `…/home`, on any origin the reader reaches the host at — did nothing: the
  kernel sends every link outside the page to `navigation.openExternal`, which refuses the host's own origins, and
  the refusal was silent. The host now answers such a call as `pages.open` with that session (or the home): in
  place, with no dialog, the back button returning, and with `pages.open`'s own refusals (a deleted session is
  `not_found`). It works the same from a page opened on its own and from one shown inside another, on both hosts.
  Any other address of the host is still refused before a dialog, and other sites are still asked about first. A
  `path` or fragment in such a link is not carried yet: the page opens at its entry. Tests:
  `packages/pages-core/test/domain/scope.test.ts` (the address) and `test/serving/bridge.test.ts` (the dispatch).

## 1.12.0 (bb plugin) — 2026-10-25

The bb plugin's release of the 0.4.0 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.12.0`): contributed calls and page storage inside an
embed, the built-in home listing every project's sessions, and `pages.open { home: true }`, from pages-core.

### `@unifedev/thread-pages`

- `package.json` version 1.12.0.

## 0.4.0 — 2026-10-25

Three changes in pages-core, so both hosts carry them:
- inside an embed, contributed calls and page storage work for the embedded session (B-0124): spec 02 R4.48, 03
  R5.18a, 04's guide listing, 05 R3.25 and its threat table, 07 R5.49, 08 A99 and A200, decision U56;
- the built-in home lists every workspace's sessions (B-0123): spec 03 R5.12a, 08 A201, decision U57;
- a page can send the reader to the host's home (B-0126): spec 03 R5.29a, 05 R2.15 and R-S12, 08 A173 and A202,
  decision U58; and a page shown in the home may make 60 calls a minute (02 R4.49, 08 A203, decision U59).

`@unifedev/pages-core` 0.4.0, `@unifedev/claude-pages` 0.4.0, the bb plugin `@unifedev/thread-pages` 1.12.0.

### Changed

- **Inside an embed, a page's contributed capabilities and its `storage` work for the embedded session.** Shown in
  the built-in home's page view, or by a page of its own session, an embedded page calls its contributors'
  capabilities (e.g. `syns.*`) and `storage.get`, `storage.set` and `storage.setMany` as it would on its own address:
  the contributor is called with the embedded session, its workspace and the document's scope as caller, and storage
  is the embedded session's own. Shown inside another session's page, it gets its contributors' reads only; its
  storage and contributed writes answer `unavailable`, since that page could otherwise act as any session it reads. A
  page whose contributor's page script shows something else in place of the page (a Syns repository's workspace)
  therefore looks and works the same in the home and on its own address, and shows the same inside any page. The
  embedding page's kernel relays each such call with the embed's answer token, which the host checks was issued to
  that page; the calls count toward the embed's 30 a minute. `context.get` inside an embed lists what works there.
  Until now all of them were refused inside an embed with `unavailable`. Tests:
  `packages/pages-core/test/serving/contributed.test.ts` and `test/serving/storage.test.ts` (inside an embed),
  `test/runtime/kernel/embed.test.ts` (the relay), `test/runtime/protocol.test.ts`.
- **The built-in home lists the sessions of every workspace.** Where the host lists more than one workspace, the
  home reads each workspace's newest sessions rather than the first rows of one list, since a host's one list
  promises no order across workspaces (bb's comes project after project, so the home showed two or three projects).
  Workspaces with a session working, waiting, unread or active in the last 15 minutes, the open one and one a
  session was just started into are read every 12 s; the others in turn; near 40 calls a minute. Search reads each
  workspace's older sessions while a query is typed. A host with one workspace keeps the single list.
- **A session started from the home stays open.** It is no longer shown as "This session is not listed" after 30 s
  when the list has not caught up: its workspace is read at once, and the home says it is not listed only once the
  host answers that it is gone. Tests: `packages/pages-core/test/agent/home.test.ts`.

### Added

- **`pages.open({ home: true })` sends the reader to the host's home.** Beside `{ sessionId }`, it navigates the
  reader's view in place to the host's home address: the page designated as home while there is one, otherwise the
  built-in home page; Back returns. A page cannot reach the home any other way (top navigation is sandboxed, and
  `navigation.openExternal` refuses the host's own addresses), and a page that remembered the designated session's id
  broke when the home changed. Inside an embed it works right after the reader acts in it, as `pages.open` does.
  `{ sessionId }` and `{ home: true }` together, or neither, is `invalid_params`. Tests:
  `packages/pages-core/test/serving/bridge.test.ts`, `test/runtime/kernel/embed.test.ts`.
- **A page shown in the built-in home may make 60 calls a minute, not 30.** The home's main view is the page the reader
  opened there; at 30 a Syns workspace answered "Didn't open: rate_limited" when the reader flipped through files
  quickly. Elsewhere an embedded page keeps 30 a minute. Spec 02 R4.49, 08 §Limits (`homeEmbedCallsPerMinute`) and
  A203, decision U59. Tests: `packages/pages-core/test/runtime/kernel/embed.test.ts`.

## 1.11.0 (bb plugin) — 2026-10-23

The bb plugin's release of the 0.3.0 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.11.0`): contributors' page scripts, asked over the
plugin RPC `threadPagesPageScript`; `threadPage.onPageUpdate`, a page stopping its own session once the reader
confirms, and the shorter standing instruction, from pages-core.

### `@unifedev/thread-pages`

- An operator who kept a verbatim copy of the old built-in text (as the spec writes it, or as `bb pages status`
  printed it) gets the new one, as one who never set the text does; any other text is kept.
- `package.json` version 1.11.0.

## 0.3.0 — 2026-10-23

Four contract changes in pages-core, so both hosts carry them:
- contributors' page scripts (B-0111): spec 07 §A page script (R5.87–R5.94), 02 R4.1, 06 `contributors.pageScript`,
  08 `pageScriptBytes`, `pageScriptMs` and A192–A196;
- a page that shows its own new version (B-0112): spec 02 R4.66 and R4.33, 05 R2.18, R2.18c and R2.10's port note,
  04's guide listing, 08 A197–A199 and fixture 14;
- a page may stop its own session once the reader confirms (B-0113): spec 03 R5.28, 08 A49, decision U52;
- a shorter standing instruction (B-0114): spec 04 §The text, §It MUST convey, R6.17, R6.24 and A56, decision U54.

`@unifedev/pages-core` 0.3.0, `@unifedev/claude-pages` 0.3.0, the bb plugin `@unifedev/thread-pages` 1.11.0.

### Added

- **A contributor can give the documents a host serves a script of its own.** A contributor that declares
  `pageScript: true` is asked, each time a document is served (the page at its own address, and a page another page
  reads with `pages.read`), with the served session and its workspace (`null` on the built-in home), the document's
  path and the version the host already holds: `{ caller, documentPath, have } → null | { version, script? }`. Its
  script goes in right after the kernel, as `<script data-thread-page-contributor="<id>">`, ahead of the page's own
  scripts, in the host's contributor order. The text is held per contributor and version, so it crosses once per
  version; a script over 256 KiB, or one containing `</script` or `<!--`, is refused whole and logged; a contributor
  that does not answer within 2 s, throws or answers a wrong shape is left out of that serve and logged once. A
  contributor that does not declare the key is never asked: with none, every document is served exactly as before.
  bb: the plugin RPC `threadPagesPageScript`. Claude Code: a process gets `{ namespace, kind: "pageScript", … }` at
  its registered endpoint; a mod passes a third argument to `$.pages.contribute(declaration, handler, pageScript)`.
  The guide names a contributor that gives documents a script. Tests:
  `packages/pages-core/test/serving/page-scripts.test.ts` (who is asked, the order, home and embeds, the cache, the
  refusals, the time bound), the injection in `test/domain/document.test.ts`, each host's glue.
- **`threadPage.onPageUpdate(callback)`: a page that shows its own new version is handed it instead of being
  swapped.** While a callback is registered, a save of the shown document no longer loads a new frame: when the swap
  would have come (after the reader pauses typing, a sending form finishes, a dialog closes, or the page clears
  `setDirty`), the shell fetches the new page and the callback gets `{ html, revision, documentPath }`, `html` being
  the page as served without the host's own scripts (the kernel, the contributors' page scripts, an injected
  `<base>`). The document keeps its state, and its calls and answers are from then on written against the new
  revision, under the renewed action token. It returns a stop function; a callback that throws is logged and called
  again on the next save; a hand-over the document does not take within 4 s, or a page the shell cannot fetch, is a
  swap as before. Another document, Back and Forward and reloads load as before. An embedded page that calls it is
  kept current in its embed the same way. A page that never calls it is swapped exactly as before. The guide lists it.
  Where own files are served by URL (Claude Code), the handed page names each of its own files with the file's
  version in the address (`big.png?pages-v=…`), so an image, stylesheet or script the agent changed under the same
  name shows its new version in the page that stays; `pages.read` does the same there, for embeds.
  Tests: `packages/pages-core/test/runtime/kernel/page-update.test.ts`, `test/runtime/shell/page-update.test.ts`,
  the embed cases in `test/runtime/kernel/embed.test.ts`, `test/pages/inline.test.ts`'s versioned own files;
  fixture 14 in the browser runner; `test/browser/page-update-files.mjs` (`pnpm test:page-update-files`).

### Changed

- **A page may stop its own session, once the reader confirms** (spec 03 R5.28, 08 A49, decision U52).
  `sessions.stop` on the page's own session used to be refused before any dialog (`invalid_params`), so a chat on a
  page could not offer Stop while its agent worked. It now shows the host's usual dialog, naming it as this page's
  session ("Stop this page's own session, “‹title›” (‹id›)?"); Confirm stops the running turn (bb `threads.stop`;
  Claude Code aborts the live turn, and the session takes the next message), Cancel rejects with `cancelled` and
  stops nothing. A page alone still cannot stop the turn that reads it: unconfirmed, forged or replayed, the call
  stops nothing. `sessions.send`, `sessions.archive` and `sessions.respond` still refuse the own session. Tests:
  `packages/pages-core/test/serving/bridge.test.ts` (11a) and `hostile-page.test.ts` ("Forge or replay a
  confirmation"), both failing on 0.2.4. Fixture 06 A49 is now a manual button, as A46 is (a confirmed call cannot
  run headless).

### Versions

- `@unifedev/pages-core` 0.3.0; `@unifedev/claude-pages` (`package.json`, `plugin.json`) 0.3.0;
  `@unifedev/thread-pages` 1.11.0.

## 1.10.3 (bb plugin) — 2026-10-14

The bb plugin's release of the 0.2.4 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.10.3`). What changes for bb is the shell's Back and
Forward fix, from pages-core; no bb host code changed.

### `@unifedev/thread-pages`

- `package.json` version 1.10.3.

## 0.2.4 — 2026-10-14

A shell fix in pages-core (B-0105), so both hosts carry it: `@unifedev/pages-core` 0.2.3, `@unifedev/claude-pages`
0.2.4, the bb plugin `@unifedev/thread-pages` 1.10.3. No protocol change: spec 01 R1.12f, R1.12g and 08 A149 already
say what Back and Forward do; the shell now does it.

### Fixed

- **Back and Forward show the document of the entry they land on.** Opening another document of the page by a link
  pushed a history entry that named the document being left, not the one opened: the shell wrote the entry before the
  new document became its current one. So after a → b → c, Back showed a under the address of b, and Forward showed
  each entry's predecessor (claude-pages 0.2.3 and thread-pages 1.10.2, Chromium and WebKit). Each entry now names
  its own document, query and fragment. Steps faster than the host answers land right too: Back then Forward before
  the host has answered for the middle document used to show that document under the last one's address; the shell
  now compares against the document it is heading to, the newest step wins and a late answer is dropped, and a
  fragment move from the document being left no longer rewrites the new entry. Tests: `packages/pages-core/test/runtime/shell/install.test.ts` (the entries
  a link pushes; fails on 0.2.3's shell) and `pnpm --filter @unifedev/pages-core test:history`, a browser test on the
  reference server that clicks a → b → c?scope=x and steps Back, Back, Forward, Forward and `history.back()` in
  Chromium and WebKit, then the same with a host slow to answer for one document (on 0.2.3's shell 8 of the first
  16 steps fail; all pass now).

### Versions

- `@unifedev/pages-core` 0.2.3; `@unifedev/claude-pages` (`package.json`, `plugin.json`) 0.2.4;
  `@unifedev/thread-pages` 1.10.3.

## 0.2.3 — 2026-10-13

A Claude Code host fix (B-0001). No protocol change, no pages-core change (`@unifedev/pages-core` stays 0.2.2), no
bb host change (no bb release from this tag).

## 1.10.2 (bb plugin) — 2026-10-11

The bb plugin's release of the 0.2.2 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.10.2`; the marketplace entry's range `^1.3.1` reaches
it). What changes for bb is the built-in home (the hub) and the shell's grants refresh, both from pages-core; no bb
host code changed. Root `pnpm check` on the release commit passes.

### `@unifedev/thread-pages`

- `package.json` version 1.10.2.

## 0.2.2 — 2026-10-11

The built-in home becomes a hub in the host's look. No protocol change, no host code change; reviewed in two design
and three code rounds (findings fixed with tests that fail before each fix).

### Changed

- **The built-in home page is a hub in the host's look** (`packages/pages-core/src/home/builtin-home.html`, still one
  file, only `window.threadPage`). A sidebar of sessions by workspace with state glyphs, unread marks and sub-agents
  folded under their parent; a session opens as its page embedded in the main area or as a chat (transcript, question
  and approval cards, composer with files, Stop); New session is a composer with workspace (Add a folder…), model,
  effort and permission mode; search with an Archived filter; Unsent drafts and Page permissions from the footer;
  phone layout with a drawer; light and dark. Every control is feature-detected from the roster. "Open the page on
  its own" uses `pages.open` in place: a tab opened from the sandboxed home has no reader credential (measured).
  When a host's session list fails validation (`invalid_result`, seen on the Claude daemon: a row with an empty
  workspace id), the hub reads workspace by workspace, keeping each workspace's last good rows and holding its share
  of the budget near 40 calls a minute. The list loads in pages of 50 that halve on `response_too_large` (a page of
  200 real rows is over the 64 KiB bound), with "Show more sessions". In page view a strip says when the session waits
  on you or is not running in its host; a running turn can be steered (`sessions.send` `mode: "steer"`).
  Search reaches every session (it pages through the rest of the host's list while a query is typed). Every call the
  hub makes goes through one budget guard: at most 60 a minute and 4 at once, the reader's own actions first, polls
  paused while the tab is hidden; tests assert the bound over five simulated minutes of the worst cases.
  Tests: `test/agent/home.test.ts`.

### Fixed

- **pages-core shell:** after the reader grants a page the right to answer, the next poll goes without
  `If-None-Match`, so the home's Page permissions list shows the new pair without a reload
  (`src/runtime/shell/poll.ts`, `install.ts`; test in `test/runtime/shell/poll.test.ts`).

## 1.10.1 (bb plugin) — 2026-10-10

The bb plugin's release of the 0.2.1 tree below under the released identity (`@unifedev/thread-pages`, plugin id
`thread-pages`, repository `unifedev/bb-thread-pages`, tag `v1.10.1`; the marketplace entry's range `^1.3.1` reaches
it). What changes for bb is U50: `context.get`'s `session.settings` carries the thread's current model, reasoning
level and permission mode as provider ids, read from `threads.defaultExecutionOptions` on `sessions.get`; snapshot
rows carry no `settings` (one SDK call per row per poll is not paid). Review: `reviews/current-settings.md`. Root
`pnpm check` on `main` after the merge (`175a86b`): 101 files, 671 tests passed, 1 skipped.

### `@unifedev/thread-pages`

- `package.json` version 1.10.1. `src/provider/session-record.ts` and `src/provider/sessions.ts`: `SessionRecord.settings`
  from the resolved execution options, mapped to the ids `providers.list` uses; a value the roster does not name is
  left absent. Tests in `test/provider/session-record.test.ts` and `test/provider/sessions.test.ts`.

## 0.2.1 — 2026-10-10

One decision of the owner's (U50, from owner test 4 finding 5: "always my reasoning") in the protocol
`bartsoj/unife-pages` (spec 03 R-C10 and R5.11d, 04 R6.24, 06 R-P2, 08 A191), on branch `current-settings`, reviewed
in `reviews/current-settings.md` (`fb73724`: ship-after CS-1, CS-2; after `b942da6` with CS-1…CS-4 applied: ship) and
merged as `175a86b`. `PROTOCOL_VERSION` stays 1: the new field is optional on both reads. Root `pnpm check` on the
merge: 101 files, 671 tests passed, 1 skipped.

### Added

- **A page reads the session's current settings (U50).** `context.get`'s `session` gains `settings?: { model?,
  reasoningLevel?, permissionMode? }` and `sessions.snapshot` rows the same field: the session's current values as the
  host knows them, in the ids `providers.list` uses; a field the host cannot tell is absent, never guessed. The guide's
  "Settings for the next turn" tells a composer to start from them. `SessionRecord.settings?` on the provider contract
  (06 R-P2); `knownSettings` in `@unifedev/pages-core`'s `serving/bridge/handlers/settings.ts` bounds what is
  projected. On **bb**, `sessions.get` reads
  `threads.defaultExecutionOptions` for all three (snapshot rows carry none: one SDK call per row per poll is not
  paid). On **Claude Code**, the mod reports the model (`$.config.list()`'s alias, `$.session.model()`'s id) and the
  effort from the `Set effort level to …` line any `/effort` prints — the person's in the terminal or its own — at
  hello, on every such line and at each turn's end; the daemon maps them to the roster's ids (an alias the roster
  cannot express, `opus[1m]` or `opusplan`, leaves `model` absent); `permissionMode` is never reported (the only
  config row is the person's default, not the session's mode — probe on 2.1.296, `claude-pages/NOTES.md` "Current
  settings"). The guide: a composer starts from `session.settings`; a field absent there starts with no value
  chosen and travels only when the reader picks one.

### Fixed

- **CS-2 — no default stands in for an absent field.** The guide (`@unifedev/pages-core` `agent/guide.ts`, pinned in
  `guide.test.ts`), spec 04 R6.24 and the Claude host statement XC15 now say: a field absent from `session.settings`
  starts with no value chosen — an "as it is now" choice or the control left blank — and the reply carries it only when
  the reader picks a value; never a list's first id, never the provider's `default` (`reasoningLevels` carry none).

### `@unifedev/pages-core`

- `PAGES_CORE_VERSION` 0.2.1. `domain/capabilities/specs.ts` (the optional `settings` on `context.get`'s session and on
  snapshot rows), `host/provider.ts` and `host/index.ts` (`SessionRecord.settings`, the `SessionSettings` type),
  `serving/bridge/handlers/context.ts`, `handlers/sessions.ts`, `handlers/settings.ts` (`knownSettings`),
  `agent/guide.ts`. Tests: `test/serving/bridge.test.ts`, `test/agent/guide.test.ts`.

## 1.10.0 (bb plugin) — 2026-10-10

The bb plugin's release of the 0.2.0 tree below, under the released identity: package `@unifedev/thread-pages`, plugin
id `thread-pages`, display name "Thread Pages", repository `unifedev/bb-thread-pages`, the Community marketplace entry
`thread-pages`. The owner's decision (`unife-bb-plugin/docs/DECISIONS.md` D47): the switch from the 1.9.0
implementation to this one is a **plugin update** with no backward compatibility, and the version is **1.10.0** —
a minor, so that the marketplace entry's range `^1.3.1` reaches it without a marketplace PR — although the release is
breaking for everything but the pages themselves. Root `pnpm check` on the branch: 102 files, 666 tests passed, 1 skipped. Nothing in `@unifedev/pages-core` or `@unifedev/claude-pages` changes in this release.

### Breaking

- **`@unifedev/bb-pages` is renamed `@unifedev/thread-pages`** (`packages/bb-pages`; the directory keeps its working
  name). The plugin id is `thread-pages`: routes are `/api/v1/plugins/thread-pages/http/*`, `bb pages init` prints
  `plugin: thread-pages`, settings are `bb plugin config thread-pages`, logs `bb plugin logs thread-pages`. On a bb that
  ran a `bb-pages` 0.x path install, that install is a separate plugin with its own kv and settings: remove it, it
  is not updated into this one.
- **1.9.0 → 1.10.0 is a different implementation under the same id.** Kept: the pages (`$BB_THREAD_STORAGE/index.html`
  is a file), the five settings by name and value (an unedited 1.9 instruction text reads as the built-in one), the
  contributor RPC methods and the caller id. Gone: `bb thread-page` (the command is `bb pages`), the bar and every
  bar-era behaviour (0.2.0 Breaking below), the `homeSessionId` setting (the home designation is `bb pages home`), and
  every kv row 1.9 wrote: offline copies (`cache:*`), storage pages (`state:*`), grants (`grants:v1`) and the signing
  key (`signing-key:v3`) are **deleted once on the first start** by `src/migrate.ts`, guarded by the marker
  `pages-core:migrated-from:thread-pages-1`, with one `info` line giving the count; `pages-core:*` is never touched. A
  reader is asked for embed grants again once; a page's `storage` starts empty; a link 1.9 minted is re-minted on load.
- **The seed placeholder is `{title}`.** A `pageSeedHtml` from 1.9 carries over by value, but 1.9's `{{TITLE}}` and
  `{{DATE}}` now render literally: edit the seed to `{title}`; there is no date placeholder. A seed equal to one of
  1.0.3–1.2.0's shipped defaults reads as "no seed", like an instruction text equal to a shipped default reads as the
  built-in text (`PAST_SEED_DEFAULTS`, `PAST_INSTRUCTION_DEFAULTS` in `src/settings.ts`: all of 1.9's hashes carried).
- **Coexistence removed** (DESIGN §E, D-bb-1 superseded): `src/coexistence.ts`, the `defer()` hook of the two
  instruction slots, the `onPlugins` hook of the contributor refresh and the `instructions: deferred — …` line of
  `bb pages status` are gone. There is one plugin under one id.

### Upgrade

**An installed 1.9** (`git:https://github.com/unifedev/bb-thread-pages` or the marketplace entry): after the owner
pushes `v1.10.0`, `bb plugin update thread-pages` (or `bb plugin outdated` to see it offered). The first start sweeps
the kv rows and logs it. Sessions started under 1.9 keep an instruction naming `bb thread-page`; tell them to use
`bb pages`, or start new threads.

**This machine** (`bb-pages@0.2.0` from `path:…/unife-mono/packages/bb-pages`, `thread-pages@1.9.0` disabled):
`bb plugin remove bb-pages` first (its settings and kv go with it; the pages stay), then `bb plugin enable
thread-pages` and `bb plugin update thread-pages`. `RELEASE-0.2.0.md` §5 has the order and the checks.

### `@unifedev/thread-pages` (was `@unifedev/bb-pages`)

- `package.json`: name, version 1.10.0, `bb.name` "Thread Pages", `bb.description` from the marketplace entry's
  wording (no bar, no `bb thread-page`); the CLI stays `bb pages`.
- `src/migrate.ts` and `test/migrate.test.ts`: the one-time kv sweep over the SDK's `storage.kv.list()`.
- `scripts/release-bb.mjs <checkout of unifedev/bb-thread-pages> [--commit] [--tag] [--push]`: fills the public
  repository with a standalone, bb-buildable tree — the host sources, `@unifedev/pages-core` vendored under
  `core/src/` with the two import specifiers rewritten to relative paths, `package.json` with `parse5` as the one
  dependency (devDependencies for typecheck only: the SDK pinned exactly, its type-level peers `zod` and
  `@types/better-sqlite3`, `hono`, `@types/node`, `typescript`), the lockfile, README, this CHANGELOG derived (bb and pages-core parts), PLUGIN_OVERVIEW.md, LICENSE; of the core's
  `src/testing/` only the in-memory stores the server runs on — proves the generated runtimes are current, typechecks and runs `bb plugin build` there,
  and prints the owner's git commands (`v1.10.0`). **`dist/` is untracked**: 1.9 committed `dist/server.js`, and bb
  loads a shipped bundle in place of the sources; from 1.10.0 every install builds from source (bb's one-time
  toolchain download on a machine that never built a plugin).
- Tests pin `pluginId: "thread-pages"`; README, DESIGN (§E, §G, D-bb-1, D-bb-2), NOTES, `TESTING.md` and
  `RELEASE-0.2.0.md` §5 follow.

## 0.2.0 — 2026-10-09

The round after the `v0.1.0` tag (`fc4681e`, the owner's, 9 October 2026): four decisions of the owner's (U46–U49)
and two of the lead's (U44, U45) in the protocol `bartsoj/unife-pages`, and a fix round from the owner's testing on
Claude Code. Each branch had its independent review before it merged (`reviews/README.md`: `contributor-workspace`,
`fix-round-2`, `reply-settings`, `sign-in`, `no-shell`; each closed with `ship`). The tag is the owner's:
`RELEASE-0.2.0.md` has the commands. Root `pnpm check` on the release tree: 100 files, 652 tests, 1 skipped; the
browser fixtures 01–12 re-run on it in Chromium, WebKit and Firefox under both strategies with 0 unexpected FAIL rows
(`1606d09`).

Fix round 3 (branch `fix-round-3`, merged `a998fec` before the tag): the owner's fourth Claude Code test, 10 October 2026 (`packages/claude-pages/NOTES.md`
"Owner test 4"). No protocol change; `PROTOCOL_VERSION` stays 1. Root `pnpm check` after the merge: 663 tests.

### Breaking

For hosts that mount `@unifedev/pages-core` and for pages that read the shell's envelopes; readers and page authors
see wording and layout changes only.

- **`MountOptions.hostName` removed** (U49, NS-12). The shell draws no "Open in <host>"; both plugins stop passing it.
- **`ShellConfig`** loses `actions`, `hostName`, `notice` and `isHome`; gains `builtinHome` (set by the home route
  alone, NS-1). **`KernelConfig`** gains `swapIdleMs`. **`GrantSummary`** gains `from`/`fromTitle` (the home's list
  covers every pair on the host).
- **`ChromeActionBody` is cut** to `declined` and `revokeGrant` (now with `from?`, accepted under the home's token
  alone); `pin`, `open`, `markRead`, `archive` and `revokeAllGrants` are gone from `/chrome-action` — the home page's
  rows call `sessions.openHost`, `sessions.markRead` and `sessions.archive` as capabilities. `/chrome-action` may
  answer `{ ok: true, opened: false, notice }` (U46).
- **Kernel↔shell protocol** (`@unifedev/pages-core/runtime`): `thread-page:update-available` → `thread-page:update
  { available }`; `thread-page:apply-update` gone (the swap is deferred, not offered); `thread-page:dirty` carries
  `custom`; new `thread-page:typing`, `thread-page:session-state`, `thread-page:draft-discard`,
  `thread-page:grant-revoke`, `thread-page:drafts`, `thread-page:grants`; `thread-page:restore` may carry
  `leftovers`. `UPDATE_OFFER_LABEL` is replaced by `UPDATE_DEFERRED_STATUS`; `FORM_GONE_STATUS` points at the home
  page.
- **The 19th fixed error code, `settings_unsupported`** (U47; `reason: "settings"`, `detail.unsupported: string[]`,
  HTTP 400). `ProviderError.code` gains `unsupported` with `detail`.
- **`providers.list` rows must carry `settings`** (`ProviderChoice.settings: { model?, reasoningLevel?,
  permissionMode? }`, each `"turn" | "session"`); a model may list `reasoningLevels`. `ProviderHost.send` takes a
  fifth argument `settings?: ReplySettings` and returns `settings?: AppliedSettings` (06 R-P3a);
  `SessionRecord.providerId?` names the provider a session runs on.
- **`ContributorHost.workspaceOf(sessionId)` is required** (U44); every `ContributorCall.caller` carries
  `workspace: { id, path, machine } | null`.
- **`sessions.openHost` may answer `{ opened: false, notice }`** (U46) through the provider, the capability and
  `/chrome-action`; a page that treated anything but `{ url }` / `{ opened: true }` as an error must take it.
- **Limits** gain `swapIdleMs` (3 s) and `environmentsPerWorkspace` (64, PC-18); `Placement.slot` is any declared
  slot name.

### Upgrade

**bb**: superseded by 1.10.0 (bb plugin) above — the plugin ships as `thread-pages` 1.10.0, not as a `bb-pages` path
install. (As written for the path install: `cd packages/bb-pages && pnpm exec bb plugin build && bb plugin reload
bb-pages`; nothing to migrate between 0.1.0 and 0.2.0 of that install.) A reader with a page open gets the new shell on
the next load of the page; a form answered on the old shell still arrives.

**Pages** need no change: the bar is gone, so a page that relied on the bar's title, status line, Update button,
Drafts panel or Reload must show its own (`data-thread-page-session`, `data-thread-page-update`, the forms' status
lines; the guide's "Around your page" says how); `threadPage.version` stays `1`.

### `@unifedev/pages-core`

- **U49 — the host draws no chrome around the page** (branch `no-shell`, the owner's decision; spec 02, 04, 05, 06,
  08; `reviews/no-shell.md`, reviewed `2221f3b`, deltas `582599e` and `35fe99c`, final verdict ship):
  - The bar goes entirely: Home link, visible title, working dot, status line, "Page changed — Update", Pin, Open in
    host, Mark read, Archive, the Grants panel, the Drafts panel, Reload. The frame fills the viewport; `<title>`
    alone carries the session's title. A `#tp-notice` strip at the bottom has no height and no content except while
    the host has a line a dead page cannot show (deleted, expired, stopped reloading, unreachable host, blocked tab,
    voice failure, still loading); the 1 s "Loading the new version…" hint is dropped.
  - Session state and read-only reach the page as attributes the kernel keeps:
    `data-thread-page-session="working|idle"` on `<html>` and on every captured form,
    `data-thread-page-readonly="offline|archived"` on `<html>` (the `<aside>` banner is gone); while the session
    works, the host's `workingLabel` is each captured form's standing status (blank = nothing);
    `Sending…`/`Queued`/`Sent`/notices win while they show and clear on the next state change; read-only text wins
    over all. The shell posts `thread-page:session-state { working, label }` on connect and on each change of the
    poll's working header.
  - The update offer becomes a **deferred swap**: a new revision is swapped at once unless the reader is typing (a
    text control focused and an `input` within `swapIdleMs`, 3 s), a submission is pending, the page holds
    `setDirty(true)` or the confirm dialog / recorder is open; while deferred the kernel sets
    `data-thread-page-update="available"`, fires a `thread-page:update` DOM event and writes "This page has a newer
    version — it appears when you pause typing; your text is kept." into every touched or focused dirty form's
    status (NS-10); the deferred revision is not kept loaded (R2.18a). A hidden tab swaps past typing and dirt, never
    past a pending submission or an open dialog. The same rule inside embeds (the in-embed Update aside is gone).
  - The built-in home page: every row keeps Open in host (a U46 `{ opened: false, notice }` is shown in the row),
    Mark read/unread, Archive; each row lists its grant pairs with Revoke; an **Unsent drafts** section lists what a
    page's shell could not restore (`localStorage` `up:leftovers:<session>`, one entry per field with a stable id,
    read-modify-write, bounded in the session's 1 MiB with a notice; Copy and Discard; NS-3, NS-7). These duties
    ride `ShellConfig.builtinHome`, set by the home route alone — a designated agent page is served as any page and
    sees no other session's drafts (NS-1); `/home?builtin=1` keeps the built-in home reachable. The stale-home notice
    is in the home document (`<p data-thread-page-notice>`); the empty-page sentence is in the empty document.
  - Review fixes: the hold is re-checked after the flush, at `restored` and at the timeout (NS-2); a withdrawn
    revision lets a newer one be announced (NS-4); a newer revision during a load restarts it (NS-5); an edited
    `contenteditable` holds the swap while focused (NS-6); an error status stands across a state change and clears
    on the reader's next input (NS-8); no strip line at a hidden-tab timeout (NS-11); stale bar wording (NS-9); a
    page's `storage`-event reconcile is prune-only, so two tabs of one page converge (NS-14).
  - Guide: a new "Around your page" section with the owner's text; every mention of the bar, the Update button, the
    Drafts panel and Reload replaced; the limits table gains "Swap while typing". `check-neutral` and the bundle
    checks pass. The browser fixtures ran in Chromium, WebKit and Firefox under both strategies with 0 unexpected
    FAIL rows (`test/browser/EXPECTATIONS.md` regenerated). Verified in headless Chromium against a plain page over
    the dev server: the frame fills the viewport with nothing drawn, the working label in the forms' status, the
    deferred swap while typing, the swap after the pause with the text and caret kept, the home page's row actions.
- **U47 — a reply may name the next turn's model, reasoning level and permission mode** (branch `reply-settings`,
  the owner's decision; spec 03 R-C9, R5.41c, 06 R-P3a, 08 A189–A190; `reviews/reply-settings.md`, reviewed
  `562e074`, delta `6dbdf56`, verdict ship): `session.reply` takes `settings: { model?, reasoningLevel?,
  permissionMode? }`, applied to the next turn, never a running one; the result echoes each field's scope. A field
  the session's provider row does not name in `settings`, or a value it does not list, fails the whole call before
  delivery with `settings_unsupported` (`reason: "settings"`, `detail.unsupported`). `permissionMode` is confirmed
  per call like a decision. `providers.list` rows carry `settings` and a model may list its own `reasoningLevels`;
  the guide's "Settings for the next turn" words the control by scope. Review fixes: an embedded refusal carries
  `reason` and `detail`, an empty `settings` is dropped before `pages.answer`, the mode is shown whole in the
  confirmation (RS-5, RS-6, RS-11).
- **U46 — `sessions.openHost` may answer `{ opened: false, notice }`** (branch `fix-round-2`; `reviews/fix-round-2.md`,
  reviewed `6d2a3fe`, delta `f17f191`, verdict ship): passed through the capability (03 R5.31b) and `/chrome-action`
  (05); the shell shows the notice (`[data-tp=action-notice]`, 8 s).
- **U44 — `caller.workspace` in every contributed call** (merge `064adf3` of `contributor-workspace`;
  `reviews/contributor-workspace.md`, reviewed `d1d7797`, delta `cc0af85`, verdict ship): `caller` gains `workspace:
  { id, path, machine } | null`, supplied by the provider through `ContributorHost.workspaceOf(sessionId)`; `null`
  from the home page.
- **PC-17 / PC-18** (from `reviews/pages-core-0.1.0.md`): the model-list cut is stated identically in the guide,
  08 §Limits and 03 ("a longer list is cut to the first N in the host's order, the default kept"); the same bound
  now applies to a workspace's environments (`environmentsPerWorkspace` 64).
- **Regression found by the live checks (`3d6db95`) and fixed on branch `home-tdz`** (`550939a`, merged before the tag
  after its delta review): the built-in home document's `thread-page:grants` / `thread-page:drafts` listeners called
  `render()` before the `let workspaces, sessions` they read, so the home logged `Cannot access 'workspaces' before
  initialization` on load and lost its first grants/drafts render until the sessions watch redrew; the two are
  declared before the listeners.
- `status` no longer says pages link to the built-in home (`c38acfd`); the fake provider reports its real
  instruction slot (`2fa5986`).
- 71 test files, 455 tests.

### `@unifedev/bb-pages`

- **U47**: all three settings on `threads.send` with explicit `executionInputSources`, scope `turn`; per-model
  `reasoningLevels` (the union flattening fixed); a level without a model is checked against the thread's current
  model, the provider taken from the thread record (RS-1); a pass-through is warned (RS-8); `threads.send` is called
  with the SDK's own types (RS-16). `TESTING.md` item 12 is the owner's look at bb's queued row (X61).
- **U49**: `hostName` no longer passed at mount (NS-12); the pin member is implemented but unused; the
  `workingLabel` setting now describes the forms' status line.
- **U44**: `workspaceOf` answers with the thread's environment folder (a worktree or the checkout).
- Instruction fragments in the order 04 R6.29 gives, under one heading (`b8b0864`, `316b998`).
- Live on the owner's bb (0.45.0, path install, `bb plugin reload bb-pages`): `TESTING.md` is the owner's walk-through
  and `packages/bb-pages/test/live/2026-10-09/` the record (`2a957ed`; the second run after the merge, `3d6db95`:
  the page edge to edge with nothing drawn, the home's rows and actions, 13 of 14 checks — the one FAIL is the home
  regression below). Not covered by an agent: a remote reader over bb Connect, iPhone Safari on the device, the
  desktop app's Browser tab.
- Bar-era wording in the `home` command's summary and the README replaced (`c38acfd`).

### `@unifedev/pages-core` — fix round 3, 2026-10-10

- `sessions.openHost`: a provider URL the shell cannot navigate to (anything but `/`-relative or http(s)) answers
  `{ opened: false, notice: "This host gave an address the page cannot open." }` and logs a `warn`, instead of
  `{ opened: true }` with nothing happening. The fake provider gains `setOpenHostUrl`.

### Open after this version

- The rule-7 checks that need the owner's device or sign-in (`RELEASE-0.2.0.md` lists them): a remote reader over
  bb Connect, iPhone Safari, the desktop app's Browser pane, Safari and Firefox pressing the sign-in button, bb's
  queued row with reply settings (X61), a refused `/model` in an interactive Claude session.

## 0.1.0 — 2026-10-09

First cut of the monorepo: one host-neutral server and two host plugins, re-derived from the archived
implementations against the protocol in `bartsoj/unife-pages`, each reviewed before this version was set.
Tagged by the owner as `v0.1.0` at `fc4681e` on 9 October 2026; nothing published.

### What each package is

- `@unifedev/pages-core` (`packages/pages-core`) — the reference server. The domain (tokens, challenges, grants,
  budgets, submissions), the browser runtime (kernel and shell, bundled into `src/generated/`), serving (the page,
  document, file, submit, bridge and home routes), pages, the agent instruction and guide, the built-in home
  page. Knows no host: a host mounts it through the serving, provider and contributor contracts (spec 05–07).
- `@unifedev/bb-pages` (`packages/bb-pages`) — the bb plugin. `ProviderHost` and `ServingHost` over the bb
  plugin SDK (sessions, messages, files, kv, workspaces, providers, attachments, voice), the instruction slots,
  contributors, settings, the `bb pages` CLI, coexistence with the installed `thread-pages` plugin. Not installed
  on any bb yet.

### What is verified

- pages-core: 70 test files, 442 tests (Node and jsdom) green; the browser fixtures 01–12 under both file
  strategies (by-url, carried) in Chromium 156, WebKit 27.2 and Firefox 157 with 0 unexpected FAIL rows
  (`packages/pages-core/test/browser/EXPECTATIONS.md`); re-run on the tagged tree after the PC fixes in all three
  engines at once, and the regenerated record is byte-identical to the committed one. `build-runtime --check` and
  `check-neutral` pass.
- bb-pages: 19 files, 99 tests green against the SDK fake: every provider member, the serving adapter, settings,
  the CLI, coexistence, the composition root, and fixtures 01 and 06 served through the real core over the
  adapters (routes, headers, the submission wording that reaches the thread, the roster, the instruction).
  `bb plugin build` green. Run on the owner's bb (0.45.0) beside the released `thread-pages` 1.9.0
  (`packages/bb-pages/test/live/2026-10-09/REPORT.md`): both plugins running, instructions deferred, the old
  plugin's route and CLI unchanged; `bb pages status`, `init` (EXISTING, the Connect URL, no credential) and
  `guide` as designed; the owner's page opened through bb-pages in Chromium with the document in the sandboxed
  frame, the poll answered, the home listing 106 sessions and 7 providers, no console errors; WebKit with an
  iPhone viewport as an emulation. Found there and fixed in the core (`20f809c`): `providers.list` dropped a
  provider's default when it trimmed a catalog longer than 64 models, so the home's start form listed no
  provider on a bb whose Pi provider offers 450. Not covered: a remote reader over Connect (401 without the
  owner's session), the device, the in-app Browser, and every interaction that sends a message.

### What the host statements mark absent

- bb (`unife-bb-plugin/HOST-STATEMENT.md`, the `bb-pages` column): `delivery` is never `steered`; files are
  carried (R-S7 as core, X31); `storagePageBytes` is host-limited by bb's 256 KiB kv page; no
  `attachments.remove` (X54); `session.usage` is `context` only (X55); `kind: "other"` waits are reported, not
  answerable; A187 and A188 do not apply (no daemon registration, no cookie of its own).

### Open, from the reviews' deltas (`reviews/`)

- pages-core (delta: ship): the spec amendment PC-15 records — `unife-pages` 03 §`pages.answer` gains
  `form.action?` and 05 R2.32 names the submitter's value — before the guide is generated from the roster.
- bb-pages (delta: ship-after BB-2b, applied in `dd004a4`): the rule-7 run on a live bb is done for `bb pages
  init` and the owner's page through `bb-pages` (above); still owed to the owner: a remote reader over bb
  Connect, iPhone Safari, the desktop in-app Browser, and the interactions; the Connect status's `sharedPorts`
  shape (O-10) is read from bundles only.
- The core's `providers.list` fix (`20f809c`) has its delta review appended to `reviews/pages-core-0.1.0.md`
  (verdict: ship). Its two follow-ups for the next round: PC-17, say in the guide row, 08 §Limits and DESIGN §E.4
  that a longer catalog is cut to the first N in the host's order with the default kept; PC-18, the same bound for
  `workspaces.list`'s environments (unreachable on both known hosts).
