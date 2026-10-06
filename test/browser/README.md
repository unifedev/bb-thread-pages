# Browser pass

What `npm run check` cannot see: a real browser against a running bb. Not part
of the unit suite; run it before a release that touches the shell, the kernel or
the serving pipeline. 33 checks (refresh A, embeds B, parts C), plus
`navcheck.mjs` (an embedded page navigates only on the reader's click) and
`csp-check.mjs` (what the document CSP does to `srcdoc` and URL frames; needs no
bb).

Needs: Playwright with its browsers (`npm i playwright && npx playwright install`
somewhere outside this repository), a running bb with this plugin, and **two
eligible sessions** — a host session that is *mid-turn* while the script runs
(the fast cadence is what is measured) and a second one to embed. The second
receives real messages, so use a throwaway session told to do nothing.

1. Copy `pages/t-*.html` and `pages/_tparts/` into the host session's page root,
   and `pages/embedded/*` into the embedded session's page root as `index.html`
   and `second.html`. Replace `HOST_SESSION_ID`, `EMBEDDED_SESSION_ID` and
   `THIRD_SESSION_ID` (any third eligible session; it is only read, and the
   script declines the grant) in them. Add a symbolic link
   `_tparts/zz-link.html -> /etc/hosts` to check that it is not included.
2. `TP_HOST_SESSION=thr_… TP_EMBEDDED_SESSION=thr_… ENGINE=chromium node live.mjs ABC`
   (`ENGINE` is `chromium`, `firefox` or `webkit`; the letters pick the groups).
3. `TP_HOST_SESSION=… TP_EMBEDDED_SESSION=… node navcheck.mjs`

The script turns `embedAnswerGrants` off and on again and revokes all grants
(`bb thread-page grants --revoke-all`). Playwright's `evaluate()` runs with a
simulated user gesture; `navcheck.mjs` therefore evaluates nothing while the
page loads.

Results of 20 September 2026 are in the specification repository,
`verify/EXPECTATIONS.md` §Fixture 09.

## Popups, own files, full screen, other sites, large media (spec 1.4)

`media-links.mjs` needs no bb: `serve.ts` runs this worktree's routes over the
unit tests' in-memory host and serves `verify/fixtures/10-media-links-embeds`
from the specification repository as one session's page root, with a stand-in
for bb's file route that answers as bb 0.43.4 does.

    node test/browser/serve.ts <spec>/verify/fixtures/10-media-links-embeds 8790
    GATE=1 TLS=<dir with key.pem, cert.pem> PROBE_SVG=1 node test/browser/serve.ts <same> 8791
    PLAYWRIGHT=<…>/playwright/index.mjs ENGINE=webkit BASE=https://localhost:8791 GATE=1 PROBE_SVG=1 node test/browser/media-links.mjs

`GATE=1` imitates bb Connect's edge: every request needs a `SameSite=Lax`
cookie set by `/login`, so a request from the sandboxed frame fails as it does
remotely. `PROBE_SVG=1` adds an SVG that tries to read the shell when a window
the page opens shows it — the bb-side issue in `CHANGELOG.md` 1.6.0 (X37). The
check passes when that window gets origin `null` and no token.

Results of 25 September 2026, option D (popups sandboxed, links confirmed):
Chromium and WebKit, 23 of 23 plain and 25 of 25 gated over https. With
popups that escaped the sandbox, the same probe read a token in both engines.


## Voice, text areas and files (spec 1.5)

`voice.mjs` needs no bb either: `serve.ts` serves `pages/voice` as one
session's page over the in-memory host, whose transcriber answers a fixed text
and whose attachments are kept in memory. `/__set` switches voice off and on,
makes transcription or one file's upload fail, and `/__stats` lists what reached
the host (transcriptions, attachments, starts, sends).

    SESSION=thr_voice node test/browser/serve.ts test/browser/pages/voice 8795
    PLAYWRIGHT=<…>/playwright/index.mjs ENGINE=chromium BASE=http://localhost:8795 node test/browser/voice.mjs

Fake microphones: Chromium with `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream` (and `channel: "chromium"`), Firefox with
`media.navigator.streams.fake` and `media.navigator.permission.disabled`, WebKit
with `grantPermissions(["microphone"])`. An init script opens the layer's
shadow root for inspection and, in the shell, records its own
`navigator.userActivation.isActive` whenever the page posts a probe.

Playwright's `evaluate` — and the checks behind a locator's click — run with a
simulated user gesture in the frame they touch, and the browser propagates it to
the shell. The activation checks therefore click by coordinates and evaluate
nothing while they wait.

Results of 26 September 2026 (Playwright 1.63; Chromium 153, Firefox 155,
WebKit 26.6): 53 of 53 in each engine (26 September: the owner's feedback — rows follow their field on fast scroll, files in the row, a text area's microphone records at once after Done). After a press in the shell's own chrome,
until that activation lapses (about 5 s), a bar opens armed and records only on
its Record; the pass waits before the page-initiated bars it means to record at
once, and checks the armed ones separately. In particular, a real click in the
sandboxed page frame makes the **shell's** `navigator.userActivation.isActive`
true in all three (User Activation v2 propagates to ancestors), it is false
when nobody pressed anything, and a call from a timer six seconds after a click
is refused. A page that re-asks the moment the reader clicks Cancel gets only
an armed bar, with no `getUserMedia` call until Record. Measured on the way: the page frame can take focus from the shell without
activation in all three engines, and Chromium sends the shell no pointer
boundary events for the frame, so neither is evidence of the reader's action.
Firefox keeps the files of a script-built paste event to itself, so
that one step is noted, not checked, there; a real paste carries them.

## Hostile pages against the kernel (review of 26 September 2026)

`kernel-hostile.mjs` needs no bb either: it serves this worktree's bundled
kernel inside a sandboxed frame whose parent plays the shell's handshake, and
checks the review's proofs of concept — a synthetic handshake, a throwing
original under a patched `postMessage`, a script's Tab before a real Enter,
`ElementInternals` and a patched `createElement`, a top-layer overlay and a
filtered-away page over Dictate — plus the rows under scripted and wheel
scrolling in body, element and sticky scrollers, right-to-left, and a narrow
field.

    PLAYWRIGHT=<…>/playwright/index.mjs node test/browser/kernel-hostile.mjs

Results of 26 September 2026: 45 of 45 across Chromium, Firefox and WebKit.

## A document's scope and fragment (D41, spike)

`scope.mjs` needs no bb: `serve.ts` with `ECHO=1` adds a contributor whose
`echo.caller` answers with the caller the host passed, and serves
`pages/scope` — `tool.html`, one generic document that takes its folder from
its fragment, and `loader.html`, which swaps an app's markup in.

    ECHO=1 SESSION=thr_scope node test/browser/serve.ts test/browser/pages/scope 8796
    PLAYWRIGHT=<…>/playwright/index.mjs ENGINE=chromium BASE=http://localhost:8796 node test/browser/scope.mjs

Results of 5 October 2026: 34 of 34 in Chromium, Firefox and WebKit, after
the review's fixes (back and forward across a document switch, bare `#…`
links, `#…` links the page handles itself). The reviewed build `5bea57e` fails three of them.

## A document's query, a reload inside the page, the budget (1.9.0, D43–D45)

`params.mjs` uses the same stand-in (`ECHO=1`, `pages/scope`): `app.html`
takes its folder from its query and routes with its fragment, reloads itself
from inside, and with `&burst=60` makes sixty calls at load. Section 8 waits
a minute for a fresh budget, then opens seven of them at once.

    ECHO=1 SESSION=thr_scope node test/browser/serve.ts test/browser/pages/scope 8796
    PLAYWRIGHT=<…>/playwright/index.mjs ENGINE=chromium BASE=http://localhost:8796 node test/browser/params.mjs

Results of 6 October 2026, after the second review: 24 of 24 in Chromium,
Firefox and WebKit, section 12 being the swap-in race (it needs `/__file`,
which publishes a new revision while the page is open; released 1.8.0 hands
the foreign file the channel in all three engines). Earlier: The reviewed build `a1a336e` gives a file with no runtime the channel (section 9: a forged answer reached the session) and fails sections 10 and 11; 1.8.0
fails 13 of them, since it refuses the address form outright.
