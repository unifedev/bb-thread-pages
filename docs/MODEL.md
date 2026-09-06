# How Thread Pages works

This answers four questions: what instructions exist and where they live, where
the HTML lives, where the template lives, and how you reach a page from a phone.

## The one-paragraph version

Each bb thread gets one HTML file in its own thread storage. The agent edits that
file directly; saving it *is* publishing. A plugin route serves the file inside a
sandboxed iframe on the bb origin you are already logged into, so the same URL
works on your laptop and your phone with no extra port, tunnel, or password.
Forms in the page post back to the thread as your next message.

## Every instruction, and where it lives

There are three, and only the first is loaded into every session.

| # | What | Where it is stored | Loaded when |
| --- | --- | --- | --- |
| 1 | **The contract** — the page is the conversation, how to ask well, what belongs on a page | `authoring.ts` → `DEFAULT_AGENT_INSTRUCTION`, overridable in the `agentInstructionText` setting (stored in bb's settings DB) | Injected into every eligible root thread, if `agentInstructions` is on |
| 2 | **The seed comment** — the three class names, the theme attributes, the escape-hatch rule | Inside each page's own HTML, put there by the seed | Read by the agent when it opens the file |
| 3 | **The authoring guide** — charts, branching, swipe decks, files, assets, the bridge | `authoring.ts` → `AUTHORING_GUIDE`, printed by `bb thread-page guide` | Only when an agent runs that command |

The split is deliberate. #1 is paid for by every session, so it holds only what
changes behaviour. #2 costs nothing because the agent is already reading the
file. #3 is unbounded and free to the sessions that never need it.

There is **no** skill, no agent tool, and no `CLAUDE.md` entry. Check what is
live with:

```sh
bb plugin config thread-pages          # all three settings and their values
bb thread-page guide                   # print #3
bb instructions get                    # bb-wide instructions (empty; not us)
```

To change the contract for all future sessions, edit `agentInstructionText`. To
change what new pages start from, edit `pageSeedHtml`. Neither touches a page
that already exists.

## Where the HTML lives

```
~/.bb/thread-storage/<threadId>/
  thread-page.html            the page — one file, ~28 KB seeded
  thread-page-assets/         optional: images, css, fonts, json you show
  thread-page-uploads/        files the user attached, named by the plugin
```

That is the whole storage model. The page is a normal file: read it, diff it,
edit it with any tool. There is no database of pages, no revision history, and
no separate publish step.

The plugin also keeps two small things in bb's existing `plugin_kv` table:

- `page-signing-key:v2` — 32 bytes, so open browser sessions survive a reload;
- `cache:<threadId>` — a best-effort last-good copy, so a page still opens
  read-only when its source machine is offline.

No plugin-owned SQLite database, no background service.

## Where the template lives

There is no template file on disk. The seed is a string in the plugin:

- `theme.ts` → `THEME_CSS` — the design system: five worlds, one resolver.
- `authoring.ts` → `DEFAULT_PAGE_SEED` — the document that wraps it.

`bb thread-page init` writes that seed **only when the file does not exist**. It
never overwrites. The consequence worth understanding: **each page carries its
own copy of the stylesheet.** The agent can therefore change any rule for one
page, and a plugin update can never restyle a page you have already read. The
cost is that improving the design system only affects pages created afterwards.

Five worlds are available; pick one with `data-theme` on `<html>`:
`paper`, `terminal`, `atrium`, `volume` (default), `bloom`. Also
`data-mode` (`system`/`light`/`dark`) and `data-atmos` (`on`/`off`).

## How a turn flows

1. Agent runs `bb thread-page init` → path, link, and `NEW`/`EXISTING`/`SKIP`.
2. Agent edits `thread-page.html`.
3. Your open tab notices the changed ETag and reloads itself.
4. You answer a form. The page posts to `/submit`.
5. The plugin turns the answers into a message and sends it to the thread.
6. It arrives as the agent's next turn.

`SKIP` means the thread is a helper — a child, a fork, or a hidden worker. Only
threads you started get a page, because those are the ones you talk to.

## Reaching it from your phone

**Nothing to expose.** Thread Pages has no server of its own — its routes are
part of the bb server:

```
https://<your-handle>.getbb.app/api/v1/plugins/thread-pages/http/page?threadId=<id>
```

Whatever origin reaches bb reaches your pages, behind the **same getbb.app
login**, with no second port and no separate share. Verified: an unauthenticated
request to that URL returns the getbb.app sign-in wall and leaks no page content.

`bb thread-page init` now prints that absolute URL when this bb is connected, so
the link an agent hands you is already the one you can open on a phone. When bb
is local-only it prints a relative path instead, which resolves against whatever
you are browsing from.

If you are not paired: `bb connect` once, from the dashboard. After that every
page is remote automatically — there is no per-page or per-port step, and
nothing for a new user to configure.

For a private alternative, point Tailscale Serve at the whole bb loopback origin.
Never Funnel it and never wildcard-bind bb.

## The security model

The page is written by an agent, so it is treated as untrusted code.

**Inside the iframe** (`sandbox="allow-scripts allow-forms"`, opaque origin):
your page's HTML, CSS and JavaScript. It has no bb cookie, no mutation token, no
parent DOM, no `localStorage`, no raw bb API, no CLI, no arbitrary file access,
and CSP blocks ordinary `fetch` and subresources.

**Outside the iframe**, plugin-authored code on the bb origin holds the action
token, performs same-origin calls, and renders confirmations.

**The bridge.** `window.threadPage.invoke(method, params)` reaches a fixed list
of named capabilities, each with its own validator, size limit, and effect class.
There is no generic "call bb" escape.

Anything that mutates state outside this thread requires a confirmation the page
cannot fake: the server answers once with a signed challenge carrying **its own**
summary, the trusted shell shows that summary in a dialog, and the server
re-verifies the signature before acting. The challenge is bound to one request
id, method, parameter fingerprint, page revision and thread, and expires in two
minutes — so it cannot be forged, replayed, or reused to approve different
parameters.

All capabilities are enabled except voice: `context.get`, `thread.activity`,
`thread.reply`, `threads.snapshot`, `threads.continue`, `threads.spawn`,
`threads.archive`, `threads.stop`, `threads.openPage`, `threads.openBb`,
`navigation.openExternal`, `projects.list`, `projects.browse`,
`projects.create`, `providers.list`, `storage.get`, `storage.set`.
`voice.captureAndTranscribe` has a contract but no handler, by your decision.

`projects.browse` opens the host's native folder picker and returns an **opaque,
single-use token** plus a display string — never a filesystem path the page could
reuse or leak. `projects.create` redeems that token.

**The honest limitation.** Page JavaScript can navigate its own frame and put
data in that URL. Browsers cannot prevent this while still allowing page scripts.
It grants no bb authority, but a page is code you are choosing to run.

## The home page, and the Sessions link

One thread's page is designated home:

```sh
bb thread-page home            # in the thread that should own it
bb thread-page home --clear    # remove the link everywhere
bb plugin config thread-pages  # shows homeThreadId
```

`/home` then redirects there, and **every other page shows a "← Sessions" link
back to it automatically**. That link is chrome in the trusted shell, so no page
authors it and no agent spends instruction budget on it. Home does not link to
itself.

`bb thread-page home` writes a real session hub when that thread has no page
yet, and never touches one that exists. The default groups sessions by project,
gives each group its own look, and offers filter, open, prompt, spawn, stop and
archive per row.

**Groups are not projects.** A group is a label, a look, and a *set* of project
ids, stored in the page's own scoped storage under `home.groups`. One group per
project is only the default. Ask the owning agent for "Work" and "Side projects",
or to put one project in two groups, and it edits the page — no schema, no plugin
change. Each group carries `data-world`, which re-resolves the design tokens for
that subtree, so a project genuinely looks different without a second document.

Home is an ordinary Thread Page: it calls `threads.snapshot`, `projects.list` and
`providers.list` and renders what it likes. You can ask the owning agent to
redesign it like any other page.

## The working indicator

While the owning thread is mid-turn, the page header shows a pulsing dot and
wording you control:

```sh
bb plugin config thread-pages set workingLabel "Thinking…"
bb plugin config thread-pages set workingLabel ""   # hides it
```

The point is the sentence: what you are reading is the last *saved* version, and
another one is coming. It costs nothing to run — the state rides on the
`x-thread-page-activity` header of the revision poll the shell already makes
every 10 seconds, so there is no extra request, nothing for a page to implement,
and nothing in any agent's instructions.

## Files in this repository

| File | Role |
| --- | --- |
| `server.ts` | Settings, CLI, HTTP routes, capability handlers, caching |
| `page.ts` | Token signing, HTML parsing/injection, both browser runtimes, form and upload serialization |
| `bridge.ts` | The capability contract and validators. No SDK, DOM, fetch, or filesystem imports |
| `authoring.ts` | The instruction, the seed, the guide |
| `home.ts` | The default home page: markup, styles, and script |
| `theme.ts` | The design system |
