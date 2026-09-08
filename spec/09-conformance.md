# 09 — Limits, acceptance, and divergences

## Limits

Recommended values. A host MAY choose others but MUST document them, and MUST
state each as a number in the authoring guide (R6.26).

| Limit | Value | Applies to |
| --- | --- | --- |
| Entry document size | 5 MiB | Refused above, never truncated |
| Upload per file | 24 MiB | Refused above |
| Uploads per form | 8 | Extra files ignored, visibly |
| Submission body | 64 KiB | Excluding uploaded bytes |
| Capability payload | 64 KiB | Request and response, serialised |
| Capability JSON depth | 16 | Rejected above |
| Capability JSON nodes | 10 000 | Rejected above |
| Prompt length | 32 KiB | `sessions.start`, `sessions.send` |
| Result text | 64 KiB | `session.reply` |
| Title length | 240 chars | Truncated for display |
| `storage` value | 32 KiB | Per key |
| Snapshot page | 100 default / 200 max | `sessions.snapshot` |
| Activity items | 8 default / 20 max | `session.activity` |
| Render/action token life | 2 hours | |
| Confirmation challenge life | 2 minutes | |
| Folder selection token life | 10 minutes | Single use |
| Submission idempotency | 512 records / 5 min | |
| Rate limit | 30 per minute, 4 concurrent | Per page (see R2.40) |
| Shell poll interval | 10 s visible, paused hidden | |
| `watch` interval | 8 s default, 2 s–5 min clamp | |

## Acceptance criteria

Organised so each maps to a testable assertion. A conformant implementation
passes all of them.

### Page model

- A01 An eligible session gets a page on first `init`; a second `init` reports
  the existing page and changes nothing.
- A02 An ineligible session is told it has no page and none is created.
- A03 Editing the file changes what is served, with no other action.
- A04 The entry document is served at the page's URL.
- A05 A nested file (`sub/dir/file.css`) is served at its relative path.
- A06 A relative reference in the document resolves to the page's own file.
- A07 `..`, absolute paths, encoded traversal and out-of-root symlinks are all
  refused.
- A08 A document over the size limit is refused with a message naming the limit.
- A09 A page whose owner is idle stays fully interactive.

### Serving

- A10 The document cannot reach the shell's DOM or `window.top`; both throw.
- A11 A changed file produces a new revision, and an open page reloads.
- A12 A dirty page does **not** auto-reload; the reader is offered the choice.
- A13 Typing in a captured form marks the page dirty without page code.
- A14 A token for session A cannot read session B's page.
- A15 A token for an old revision is refused for submissions and capability calls
  with a distinguishable stale-page error.
- A16 With the source unreachable, the page opens read-only, says so in chrome,
  and its captured forms are disabled.
- A17 A submission against a stale copy is refused, not queued.
- A18 The same submission id with the same content delivers once; with different
  content it is a conflict.
- A19 The working indicator appears mid-turn and needs no extra polling channel.
- A20 Exceeding the rate limit returns a distinguishable error, and ordinary page
  behaviour does not exceed it.

### Trust

- A21 The frame has no host cookie and no action token.
- A22 A forged capability call naming another session is rejected.
- A23 A confirmation challenge cannot be forged, replayed, or reused with altered
  parameters, including reordered keys.
- A24 A declined confirmation rejects with `cancelled`.
- A25 The confirmation summary comes from the host; page-supplied text is ignored.
- A26 One page cannot read another page's `storage`.
- A27 `projects.browse` returns no filesystem path.
- A28 A page can `fetch` a third-party origin, and can load a remote font,
  script, stylesheet and image.
- A29 A page can `fetch` its own file as data — asserted with a real request from
  the sandboxed document, not by loading it as a subresource, since only the
  former exercises the `Origin: null` path (R3.13).
- A30 Every row of the hostile-page table in
  [03-trust.md](./03-trust.md) has a test asserting the stated outcome.

### Page runtime

- A31 A plain `<form>` with no JavaScript delivers to the owning session.
- A32 A form with the opt-out attribute is untouched.
- A33 Blank answers are delivered as blank.
- A34 Labels resolve per R4.10, and a label wrapping its own input reads as just
  the question.
- A35 Checkbox, radio and multi-select groups collapse per R4.12.
- A36 Two forms have independent pending and dirty state.
- A37 An `<a href>` to an external URL works, routed through confirmation.
- A38 An uploaded file lands under a host-generated name in the page's uploads
  directory and is reported to the agent by path.
- A39 An upload failure is visible in the form's status and no submission claims
  the missing file.
- A40 `invoke` before the channel is ready is queued, not lost.
- A41 `watch` stops polling when stopped, and pauses when hidden.
- A42 A page that never calls `watch` causes no polling.

### Capabilities

- A43 `context.get`'s roster matches the capabilities actually enabled.
- A44 `session.activity` accepts no session id.
- A45 `sessions.snapshot` pages with a real cursor and honours its cap.
- A46 **`sessions.start` succeeds with only a project id and a prompt**, and the
  new session is a visible root in the project's default environment.
- A47 `sessions.start`'s confirmation names the project and the prompt.
- A48 `sessions.send` refuses the page's own session.
- A49 `sessions.stop` refuses the page's own session.
- A50 `pages.open` navigates in place and works in a plain mobile browser.
- A51 An unimplemented capability reports `unknown_method`.
- A52 Results contain only declared fields even when the host's own API returns
  more.

### Agent contract

- A53 `init` is idempotent and prints a path and an openable URL.
- A54 `home` sets a pointer and does not modify page content.
- A55 The standing instruction is injected only into eligible sessions and only
  when enabled.
- A56 The standing instruction contains the one-agent-one-page rule and the
  start-an-agent route (R6.17).
- A57 The guide documents every capability, `cancelled`, the `method="dialog"`
  trap, network access, the unavailable browser affordances, and the
  `sessions.start` defaults.
- A58 The guide contains no claim contradicting the implementation (R6.25).

### Configuration

- A59 Changing the seed or instruction does not alter existing pages.
- A60 A blank working label hides the indicator.
- A61 A stale home pointer does not break page serving.
- A62 No setting can widen the sandbox or grant the page a credential.

## Known divergences from the reference implementation

`@unifedev/thread-pages` 0.3.2, measured September 2026. This spec wins in all
cases.

Divergences are numbered `X1…`, deliberately *not* `D1…`, because `D1`–`D8` are
the design decisions in [../docs/DECISIONS.md](../docs/DECISIONS.md).

### Structural — the model changed

| # | Reference behaviour | Spec |
| --- | --- | --- |
| X1 | Assets are one **flat** directory, restricted to letters/digits/dot/dash/underscore, no subdirectories | A page is a **site**: any files, nested (R1.10–R1.12) |
| X2 | Assets served from a **separate preview origin**, injected as `<base href>` | Served from the page's **own** route; no injected base (R1.3) |
| X3 | An `assetUrl()` API is needed to construct an asset URL | No API needed; relative references work (R4.27) |
| X4 | `threads.openPage` opens a **new tab** via `window.open`; blocked on mobile | Navigates **in place** (R5.29–R5.31) |
| X5 | Authored `<a href>` does nothing | Works, via interception (R4.15) |
| X6 | The home page's own UI used `window.prompt`, which silently returns nothing | No browser modals; in-page fields (R4.13, R4.16) |

### Bugs this spec closes

| # | Reference bug | Spec requirement |
| --- | --- | --- |
| X7 | **Every external subresource is blocked over HTTPS.** The asset CSP source is built from the listening socket's URL, so it emits `http://<host>/…` while the document loads from `https://<host>/…`; the scheme mismatch blocks the file. Invisible on loopback | R8.26–R8.28 |
| X8 | **`sessions.start` always fails.** The call omits the required `environment` field; the host answers `400 Required` and the page sees `handler_error` | R5.20, R5.23, R8.9 |
| X9 | **`providers.list` throws** (`models is not iterable`), so no page can offer a model picker | R5.15 |
| X10 | **The asset preview expires in 10 minutes** while tokens last 2 hours and the document is only refetched on change; a long-open page keeps a base URL that 404s | Removed by R1.2/R1.3 — there is no separate preview to expire |
| X11 | `sessions.snapshot` ships `nextCursor` always `null` | R5.12 |
| X12 | `handler_error` reaches the page with no cause, and the real error is only in the host log | R5.41 documents this as an accepted cost; R2.43 requires the log |
| X16 | The file route answers `403` to `Origin: null`, so a page cannot `fetch` its own file even though the same URL loads as a subresource | R3.13 |

### Deliberate carry-overs

Not bugs. Kept as-is, with a documentation obligation.

| # | Behaviour | Why |
| --- | --- | --- |
| X13 | Every form is captured unless opted out, including `method="dialog"` forms | The plain-HTML promise is worth more than the sharp edge; the guide must warn (R4.17–R4.18) |
| X14 | No page-error channel back to the agent | Status quo chosen; instead, no limit may be silent *by design* (R2.44) |
| X15 | A page can exfiltrate data it can already see | Stated trade (R3.23) |

### Testing note

`sessions.start` and every other confirmed capability **cannot be verified in
headless Chrome**: the trusted `<dialog>` closes with the right return value but
its `close` event never fires, so the call hangs in `pending` forever with no
error. This is a headless artifact, not a product bug — the identical page
resolves correctly in a headed browser.

- **R9.1** Acceptance tests for confirmed capabilities MUST run in a headed
  browser, and the test suite MUST say why.
