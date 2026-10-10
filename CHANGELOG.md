# Changelog

Derived from the private monorepo's CHANGELOG (`unifedev/unife` 5137b61): the parts that
concern the bb plugin and the server vendored into it. References to `reviews/`, `NOTES.md`, `DESIGN.md`,
`RELEASE-*.md` and branch names are to that monorepo; `packages/bb-pages` is this plugin's directory there.
Versions 1.9.0 and earlier were a different implementation of the same plugin; their changelog is in the
`v1.9.0` tag of this repository.

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
