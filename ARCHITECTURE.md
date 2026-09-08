# Architecture

Version 0.3.0 · September 2026

This is the design and its reasoning, as built. [docs/MODEL.md](./docs/MODEL.md)
is the operator's view — where things are stored and how to reach them.
[docs/ROADMAP.md](./docs/ROADMAP.md) is what is left.
[docs/DECISIONS.md](./docs/DECISIONS.md) records the design decisions and why
they were made.

> **[spec/](./spec/) is the specification the product is being rebuilt against.**
> It is complete and implementation-independent: someone who has never seen this
> code can build Thread Pages from it, on bb or on another host. Where this
> document and the spec disagree, **the spec wins** — this one describes what
> exists, the spec describes what is intended.
> [spec/09-conformance.md](./spec/09-conformance.md) lists every difference.

## Intent

A Thread Page is a small application an agent writes for one task, for one
person to read and answer from.

Chat is a poor medium for the moments that matter: a comparison, a diagram, a set
of choices, a thing only the user can decide. Those want a page. But a *fixed*
page — a dashboard with slots — is worse than chat, because the shape of what
needs saying changes with every task.

So the plugin supplies no design. It supplies a secure host for a document the
agent writes freshly each time, and a way for that document to talk back.

Three properties follow, and everything else is downstream of them:

1. **The page is a file the agent edits directly.** Not a template it fills, not
   an API it posts to. Saving is publishing.
2. **The agent's contract stays small.** One command, a short instruction, and
   an optional guide it fetches only when the page needs more than prose.
3. **Page code holds no bb authority.** It is generated, so it is sandboxed away
   from bb's credentials and given narrow named capabilities instead. It is *not*
   quarantined from the world — see *Trust boundary*.

## One agent, one page

Decided September 2026 ([docs/DECISIONS.md](./docs/DECISIONS.md) D1). This is the
model the rest of the design assumes.

A page is the product of **one agent's work**, tied to that agent's thread. There
is no second kind of page. It is one HTML file by default and may grow into a
site of several files when the agent needs that.

Durable surfaces — a project console, a dashboard, a task launcher — are not a
feature. They are what you get when a page's forms **spawn fresh agents** instead
of messaging their owner: nothing asks the owning agent to rewrite the page, so
it stays put. The spawned agent need have no route back into the page at all.

Two consequences worth stating plainly:

- **The home page is a convention, not a mechanism.** It is one agent's page that
  a setting happens to point at. Any page can be home.
- **A new dashboard is an agent, not a feature request.** Spawn an agent, tell it
  what to build, and it writes its own page. An agent that wants another
  interface to exist does the same rather than writing outside its own file — and
  can then talk to that agent to have it adjusted.

This is why `threads.spawn` is load-bearing rather than a convenience: it is the
mechanism durable surfaces are made of.

## Portability

The server contract is meant to be reimplementable. Someone should be able to
stand up an equivalent host and have existing pages keep working, so bb is the
first host rather than the definition. A page therefore reaches the outside only
through attributes and capabilities, never through anything bb-shaped, and no fix
may depend on bb's frontend.

## The shape

```
~/.bb/thread-storage/<threadId>/thread-page.html     the page
                              /thread-page-assets/   what it shows
                              /thread-page-uploads/  what the user sent
```

An agent runs `bb thread-page init`, gets that path, and edits the file. The
plugin serves it at a stable URL on the bb origin the user is already
authenticated to — so the same link works on a laptop and a phone with no extra
port, tunnel, or password.

Nothing else is stored. Two small values live in bb's existing key-value table: a
signing key, so open browser sessions survive a plugin reload, and a best-effort
last-good copy per page, so a page still opens read-only when its machine is
offline. There is no plugin database and no background service.

## Trust boundary

The page is generated code, so it is treated as hostile.

**Inside the iframe** — `sandbox="allow-scripts allow-forms"`, opaque origin.
Arbitrary HTML, CSS and JavaScript are allowed *because* the frame has no bb
cookie, no mutation token, no parent DOM, no `localStorage`, no raw bb API, no
CLI, and no filesystem access. Page-authored code can therefore be as creative as
the task needs without that creativity being a security question.

**The network is not part of that boundary** (decided September 2026,
[docs/DECISIONS.md](./docs/DECISIONS.md) D7, reversing an earlier non-goal).
Pages get internet access. The reasoning: the agent that writes the page already
has the machine and can act directly; a remote script it chose to include is one
it could have used anywhere; local programs can already trigger agents; and the
whole surface sits behind auth. Restricting the network bought very little, and
cost most of what makes a page a real application.

It bought little because it never actually prevented exfiltration — see *The
honest limitation* below. Denying `connect-src` while leaving self-navigation
open was obscurity, not containment.

What the network does **not** change: the page still holds no bb credential, and
every effect on bb still goes through one validated capability at a time with a
trusted confirmation. Reaching a URL and holding bb's authority are different
things, and only the first is now open.

**Outside the iframe** — plugin-authored code on the bb origin. It holds the
action token, makes the same-origin calls, owns navigation, and renders
confirmations. The document URL carries render authority only, so page code never
sees a credential that can change anything.

**Between them** — one `MessagePort` and a fixed capability list. Each capability
has its own validator, size and depth limits, effect class, and output
projection. There is no generic "call bb" method, no path parameter, and no
provider passthrough.

### Confirmed effects

Anything that reaches outside the current thread requires a confirmation the page
cannot fake or word:

1. The page invokes the method.
2. The server refuses once, returning a signed challenge that carries **its own**
   summary, derived from validated parameters.
3. The trusted shell shows that summary in a dialog the sandbox cannot draw over.
4. The server verifies the signature before acting.

The challenge is bound to one request id, method, parameter fingerprint, page
revision and thread, and expires in two minutes. So it cannot be forged, replayed,
or reused to approve different parameters — a page cannot get "message thread A"
approved and then quietly reuse it for thread B.

### The honest limitation

Page JavaScript can navigate its own frame and encode data in the destination
URL. Browser sandbox flags do not close that channel, and CSP resource directives
do not either. A page therefore has access to data already inside its own frame.

It grants no bb authority. Closing it entirely would mean forbidding authored
JavaScript and shipping a declarative renderer instead, which would cost the
open-page model that is the point of the product. This is a stated trade, not an
oversight — and it is the reason the network restriction was dropped rather than
defended: a limit that a one-line self-navigation walks around is not a limit.

One consequence of open network access is worth naming because it does *not*
follow from "the agent already owns the host": a page runs in the **reader's**
browser, which is often a different machine on a different network. Page script
can therefore reach what that device can reach, including its loopback and
private-range addresses. CSP cannot express "public internet but not private
ranges", so the options were open access or a curated allow-list; the allow-list
was rejected as contradicting the decision. Recorded as accepted.

## Capabilities

| Method | Effect | Confirmed |
| --- | --- | --- |
| `context.get` | read | |
| `thread.activity` | read | |
| `threads.snapshot` | read | |
| `projects.list` | read | |
| `providers.list` | read | |
| `storage.get` | read | |
| `thread.reply` | current-thread write | |
| `storage.set` | current-thread write | |
| `threads.openPage` | navigation | |
| `threads.openBb` | navigation | |
| `threads.continue` | cross-thread write | yes |
| `threads.spawn` | cross-thread write | yes |
| `projects.create` | cross-thread write | yes |
| `threads.archive` | destructive | yes |
| `threads.stop` | destructive | yes |
| `navigation.openExternal` | navigation | yes |
| `projects.browse` | device | yes |
| `voice.captureAndTranscribe` | device | contract only |

Adding a capability extends this list. It never requires a new page component,
because no page component is built in.

Two deliberate narrowings. `projects.browse` opens the host's native folder
picker and returns an **opaque single-use token** plus a display string — never a
filesystem path the page could reuse or leak; `projects.create` redeems it.
`storage.*` is namespaced per thread, so pages cannot read each other's state
despite sharing one table.

## What the plugin renders, and what it does not

The plugin owns exactly three pieces of UI, all of them chrome outside the
sandbox:

- the page title bar;
- a **Sessions** link back to the home page;
- a working indicator while the thread is mid-turn.

The last two are worth explaining, because both could have been pushed onto
agents and deliberately were not.

**The Sessions link** is chrome so that no agent spends instruction budget on it
and no page can forget it. The home page it points to is not special: any
thread's page can be designated home with `bb thread-page home`, and it is an
ordinary Thread Page afterwards.

**The working indicator** answers "is it still writing?". Its state rides on the
`x-thread-page-activity` header of the revision poll the shell already makes
every ten seconds — so it costs no extra request, nothing in any page's HTML, and
nothing in any agent's instructions. Its wording is a setting; blank hides it.

Everything else is the page's.

## The home page

`bb thread-page home` designates a thread and, if that thread has no page yet,
writes a session hub. The default groups sessions by project and gives each group
its own look.

The design point is that **a group is not a project**. A group is a label, a
look, and a *set* of project ids, kept in the page's own scoped storage. One
group per project is only the default; a project may appear in several groups,
and regrouping is an edit to the page rather than a schema change.

Per-group looks need no second document. The stylesheet's `data-world` attribute
re-resolves every design token for a subtree, so a group can carry a different
palette, typeface, shape language and button style inside one page. Separate
linked pages remain possible through `threads.openPage`; they were not necessary.

## The design system

Five worlds — `paper`, `terminal`, `atrium`, `volume`, `bloom` — each declaring
both light and dark palettes at once, with one resolver publishing the live half
onto the tokens the rest of the sheet uses. A page picks one with `data-theme` on
`<html>`, plus `data-mode` and `data-atmos`.

It needs no class names: every rule keys off semantic structure, so plain HTML is
already styled. Three class names exist for things structure cannot express —
`.card`, `.needs-you`, `.label`.

**The stylesheet travels inside each page** rather than being injected at render
time. That means an agent can change any rule for one page, and a plugin update
can never restyle a page the user has already read. The cost is that improvements
to the design system only reach pages created afterwards; that trade favours the
reader.

A page may add one more `<style>` with two rules: everything inside
`@scope (main)`, and colour and shape from `var(--token)` only. The second is
what keeps a bespoke chart correct in all five worlds and in dark mode.

## Instructions

Three, and only the first is loaded per session.

1. **The contract** — why the page matters, how to ask well, what belongs on a
   page. Injected into eligible root threads. It holds only what changes
   behaviour; every mechanical convention is absorbed by the runtime or the seed.
2. **The seed comment** — the class names, the theme attributes, the escape-hatch
   rule. Free, because the agent is already reading the file.
3. **The guide** — `bb thread-page guide`. Unbounded, and paid for only by the
   sessions that open it.

There is no skill and no agent tool. Both would put the plugin in every session's
context whether or not the task needs it.

## Eligibility

Only threads a user started get a page. Children, forks and hidden workers get
`SKIP` and answer in chat, because they are not the ones being talked to. `init`
rechecks this at call time rather than trusting the injected instruction.

## Testing

93 tests over three suites, none needing a browser:

- `bridge.test.ts` — the capability contract in isolation: validators, limits,
  effect classes, confirmation binding. No SDK, DOM, or filesystem.
- `page.test.ts` — HTML parsing against malformed and adversarial documents,
  kernel ordering, sandbox invariants, form and label derivation.
- `server.test.ts` — routes, tokens, capabilities, uploads, assets, home, and the
  working state, against a fake host.

Browser verification is done by hand for the things tests cannot see. Several
real defects were found only that way — an invalid CSP source that silently
blocked every relative asset, an auth rule that rejected raw upload bodies, a
`<select>`'s options leaking into an answer label, and a snapshot flag that
selected archived threads instead of adding them. Each has a test now.

The gap worth naming: there is no hostile-page corpus yet. The confirmation flow
is tested against forgery, replay and parameter-swapping, but no test plays an
attacker trying to reach the parent frame or steal a cookie.
