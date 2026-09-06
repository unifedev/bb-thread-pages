# Thread Pages

`@unifedev/thread-pages` — part of [Unife](https://github.com/unifedev), a
unified interface for everything. Thread Pages is the unified interface for
working with AI agents; this plugin implements it for [bb](https://getbb.app).

**Every agent session gets one web page, written for that task, that you can read
and answer from on any device.**

An agent usually has more to tell you than chat can carry: a comparison, a
diagram, a set of choices, a thing only you can decide. Thread Pages gives it a
page to say it on — and gives you a form to answer from, which arrives as the
agent's next message.

The page is a complete HTML document the agent writes for the task at hand. If it
needs a chart, it writes a chart. If it needs a multi-screen flow, a diagram you
click, or three separate forms, it writes that. The plugin supplies the secure
host, never the design.

## Install

```sh
bb plugin install git:https://github.com/unifedev/bb-thread-pages.git
```

Then turn on **Agent initialization hint** in the plugin's settings, so new
sessions use their page automatically:

```sh
bb plugin config thread-pages set agentInstructions true
```

That is the whole setup. If this bb is paired with `bb connect`, every page is
reachable from your phone immediately — there is no port to expose and nothing
per-page to configure.

## Using it

The agent's whole workflow is one command:

```sh
bb thread-page init      # create or locate this thread's page; prints the link
```

Two others exist:

```sh
bb thread-page guide     # authoring reference, only when a page needs more
bb thread-page home      # make this thread's page the home page
```

`bb thread-page home` writes a session hub grouped by project, with a filter,
live status, and per-row open, prompt, stop and archive. Every other page then
shows a **← Sessions** link back to it. Home is an ordinary page afterwards: ask
the agent that owns it to regroup or restyle it.

## Documentation

- [docs/MODEL.md](./docs/MODEL.md) — **start here**: instructions, storage,
  templates, and remote access
- [ARCHITECTURE.md](./ARCHITECTURE.md) — the design and its reasoning
- [docs/ROADMAP.md](./docs/ROADMAP.md) — what is left
- [PLUGIN_OVERVIEW.md](./PLUGIN_OVERVIEW.md) — marketplace description

## What a page can do

Authored freely inside the sandbox:

- any HTML, CSS and JavaScript, including Web Components, SVG, canvas, and
  multi-screen state;
- forms that reply to the thread with no code at all — blank answers included,
  several forms at once, each with its own state;
- file attachments, stored beside the thread and handed to the agent by path;
- images, stylesheets, fonts and data from a confined per-thread asset folder;
- live thread activity, so a page can show what the agent is doing now;
- small state that survives a reload.

Through named capabilities, with confirmation where it matters:

- list sessions, projects and providers;
- message, start, stop or archive a session;
- create a project through the host's native folder picker;
- open another page, a bb thread, or an external link.

The plugin also supplies three pieces of chrome outside the page: the title bar,
the Sessions link, and a working indicator while the thread is mid-turn. Its
wording is a setting; blank hides it.

## Where things live

```
~/.bb/thread-storage/<threadId>/
  thread-page.html            the page
  thread-page-assets/          what it shows you
  thread-page-uploads/         what you attached
```

The page is a normal file — read it, diff it, keep it. There is no database of
pages and no separate publish step. Settings hold the instruction text and the
new-page seed, so you can change what future pages start from without touching
one that exists.

## Access

Thread Pages needs no port share. Its routes are part of the bb server, so the
origin that reaches bb reaches your pages, behind the same owner login:

```text
https://<handle>.getbb.app/api/v1/plugins/thread-pages/http/page?threadId=<id>
```

`bb thread-page init` prints that absolute URL whenever this bb is connected, and
a relative path when it is local-only. For private access instead, point
Tailscale Serve at the whole bb loopback origin — never Funnel it, and never
wildcard-bind bb.

## Security

The page is generated code, so it is treated as untrusted. It runs in an
opaque-origin sandbox with no bb cookie, no mutation token, no parent DOM, no
`localStorage`, no raw bb API, no CLI, no filesystem access, and no ordinary
network access. Everything it can ask bb to do goes through one validated,
named capability at a time.

Anything reaching outside the current thread requires a confirmation the page
cannot fake: the server answers once with a signed challenge carrying **its own**
summary, the trusted shell shows that summary, and the server re-verifies the
signature before acting. The challenge is bound to one request, method, parameter
fingerprint, page revision and thread, and expires in two minutes.

One limitation stated plainly: page JavaScript can navigate its own frame and put
data in that URL. Browsers cannot prevent this while still allowing page scripts.
It grants no bb authority, but a page is code you are choosing to run.

## Development

```sh
npm ci
bb plugin types --check .
npm test
npm run typecheck
npm run build
bb plugin reload thread-pages
```

93 tests cover the capability contract, token scope and tampering, HTML parsing
against adversarial documents, sandbox and CSP invariants, forms, uploads,
confined assets, the home page, and the confirmation flow against forgery,
replay and parameter-swapping.

## Licence

MIT
