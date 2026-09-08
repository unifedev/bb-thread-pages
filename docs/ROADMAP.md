# Roadmap

Version 0.3.0 · September 2026

> **The eight open design decisions were answered in September 2026.** See
> [DECISIONS.md](./DECISIONS.md) for the answers and their reasoning. Two of them
> change this document: pages get **general network access** (a reversed
> non-goal), and **starting work from a page is required**, not optional. Items
> below that predate those answers are marked where they conflict.
>
> **Those decisions are now written up as a full specification in
> [../spec/](../spec/)**, which supersedes this file as the source of truth for
> *what to build*. This roadmap remains the record of what is left to do and
> what was considered and rejected;
> [../spec/09-conformance.md](../spec/09-conformance.md) is the authoritative
> list of where today's code diverges from the spec.

## Done

Everything needed for daily use is implemented and verified in a browser.

**The page.** Complete HTML/CSS/JS mini-apps in an opaque sandbox, parsed with
parse5 and kernel-injected before authored scripts. Five-world design system
carried in each page. Automatic semantic forms with independent per-form state,
blank-safe answers, manual opt-out, and update protection. File attachments in a
confined upload directory. A confined asset directory with a matching CSP.

**The chrome.** Title bar, Sessions link, working indicator — all outside the
sandbox, none of it costing an agent anything.

**The home page.** `bb thread-page home` designates any thread's page and writes
a session hub grouped by project, with a look per group and grouping stored in
the page rather than hard-wired.

**The bridge.** Seventeen of eighteen capabilities, with trusted confirmation for
every cross-thread, destructive, device and external-navigation effect.

**Access.** Remote by default through the existing bb origin, with no port share.

## Left

### Before wide release

**A hostile-page corpus.** The only item I would call blocking for a public
audience. The confirmation flow is tested against forgery, replay and
parameter-swapping, but no test yet plays an attacker: trying to read the bb
cookie, reach `parent`/`top`, forge another thread's action, or reach the network.
The design says these are impossible; a test should prove it, and should also
demonstrate the self-frame navigation limitation rather than leave it as prose.

### Capabilities

**`voice.captureAndTranscribe`** has a contract and validators but no handler.
Recording happens in trusted chrome and transcription goes through bb's own voice
service. Deferred as unused; the contract is there when it is wanted.

### Known bugs

#### Found September 2026 while building a multi-page console

Five findings from using the plugin hard against a real bb (0.42.1) on one
machine, each stated with what was measured. The design decisions that gated
them have since been made, so each now carries what the decision settled — but
**no implementation is specified**, and the exact fix is still to be written.

1. **Assets are blocked whenever the page is read over HTTPS.** The highest-impact
   of these: it silently breaks every external stylesheet, script, image and font
   on remote and mobile access, which is the plugin's own default access story.

   `assetCspSource` resolves the asset base against `context.req.url`. Behind bb
   Connect that URL keeps the loopback scheme, so the emitted CSP source is
   `http://<handle>.getbb.app/...` while the document is loaded from
   `https://<handle>.getbb.app/...`. A CSP source with the wrong scheme never
   matches, so the browser blocks the subresource. Measured: with
   `X-Forwarded-Proto: https` and `Host: bart.getbb.app`, the response still
   carries `style-src 'unsafe-inline' http://bart.getbb.app/api/v1/file-previews/…`.
   Forcing the header either way makes no difference — the scheme comes from the
   request URL, not the forwarded proto.

   Symptom as a user sees it: a page that loads its stylesheet with
   `<link href="shell.css">` renders unstyled remotely and correctly on
   loopback; an otherwise identical page with an inline `<style>` is fine in
   both. Nothing errors in the page — only a CSP violation the reader cannot see.

   Open: whether the source should be scheme-relative, host-relative, derived
   from a forwarded-proto/`Forwarded` header, or whether the plugin should stop
   emitting an absolute source at all. **D7 narrows this** — with network access
   opened, the asset source stops being the only permitted origin, which may make
   the whole absolute-source construction unnecessary. **D8 answered** the
   related question: no new failure channel is built, but nothing should fail
   silently *by design*.

2. **`threads.spawn` fails against this bb.** Every call returns
   `handler_error`; the plugin log says `HTTP 400: Required`. The handler sends
   project, prompt, title and visibility, and this bb's `createThreadRequest`
   also requires `environment`. Confirmed against the API directly: the same body
   fails with `{"code":"invalid_request","message":"Required"}` and adding
   `environment: {type: "project-default"}` succeeds and returns a starting
   thread. A page cannot work around it, because the page never controls that
   field.

   **Settled by D5 and D1.** This is a plain bug, and a blocking one: pages may
   start any work they want, and under D1 spawning is the mechanism durable
   surfaces are made of. The call must supply what bb requires and succeed
   without the page knowing about it. The remaining work is choosing the
   **explicit defaults** — environment, provider, model — and documenting them in
   the guide so an agent knows what it gets by saying nothing, and how to say
   something else.

3. **`providers.list` throws.** The handler calls `bb.sdk.providers.models()`
   and this bb returns something non-iterable; the log says
   `models is not iterable`. Consequence: no page can offer a provider, model or
   reasoning picker, even though `threads.spawn` accepts all three.

   Open: whether the shape changed upstream or the call is wrong. **D5 settled
   the product half** — model choice does belong to a page, so this is worth
   fixing rather than removing.

4. **Every authored `<form>` is captured by default, including forms that never
   meant to leave the page.** A `<form method="dialog">` inside a `<dialog>`,
   written purely to close a local confirm, submitted to the thread and reported
   "Sent (queued)". The message was real and the page's own dialog logic never
   ran.

   This is the documented behaviour of automatic forms, so it is arguably not a
   bug — but the default is dangerous in exactly the case an author does not
   think about, and `method="dialog"` is a form that by definition has no remote
   target.

   **Settled by D6: documentation only.** The behaviour stays; the plain-HTML
   promise is worth more than the sharp edge. The guide must warn about capture
   generally and about dialog forms specifically.

5. **A confined asset preview expires while the page holding its URLs does not.**
   `ASSET_PREVIEW_TTL_MS` is 10 minutes; a viewer token lasts 2 hours; the
   document is only re-fetched when its ETag changes. A page left open past the
   TTL keeps a `<base href>` pointing at a preview that now 404s, so its assets
   stop resolving with no visible cause. Measured: three preview ids issued
   earlier in the same session all return 404 while a freshly issued one
   returns 200.

   Open: whether the preview should be renewed on document fetch, whether the
   base should be indirected through a stable per-thread route, or whether the
   shell should reload when its asset base dies. Interacts with item 1 — both are
   about the asset base being a moving absolute URL — and with **D1's multi-file
   pages**, which need a stable per-page route anyway. Serving a page's own
   directory under its own route would address all three at once.

#### Sandbox affordances (earlier)

All three share one cause: the page frame is `sandbox="allow-scripts allow-forms"`,
so every browser-level affordance a page might reach for — popups, top navigation,
modal dialogs — is silently unavailable. Nothing errors; it just does nothing,
which is the worst failure mode. Each needs a plugin-owned path through the
trusted shell instead.

1. **`threads.openPage` / `threads.openBb` are blocked on mobile, and open a new
   tab on desktop.** The shell calls `window.open`, which mobile browsers block
   as an unrequested popup. It should navigate the *top* window in place instead,
   so the browser back button returns to the hub. That is also better on desktop:
   a hub you navigate from and back to beats a spray of tabs. The shell can do
   this with `location.assign` on its own window, since it is trusted code and the
   destination is built from a validated thread id.

   Fix it this way and **only** this way. A bb frontend could route the same
   request through `useBbNavigate()` for real in-app navigation, which is nicer
   inside bb and useless everywhere else. A plain-browser fix works in bb too;
   a bb-only fix leaves the phone broken. See *Portability* below.

2. **Links inside a page do nothing.** An authored `<a href>` cannot navigate: the
   frame has no `allow-top-navigation`, and following the link inside the frame
   would replace the page with an unrelated document. The kernel should intercept
   clicks on anchors and route them: same-page fragments handled locally, and
   http(s) destinations through `navigation.openExternal`, which already exists
   and already confirms. Authors then write ordinary links and they work, which is
   the whole promise of "write plain HTML".

3. **The home page's Prompt button does nothing.** It uses `window.prompt`, and
   sandboxed frames without `allow-modals` return immediately with no value and no
   error. The page must supply its own inline field rather than a browser modal.
   Granting `allow-modals` is the wrong fix: it would let any generated page block
   the UI thread with `alert` loops.

The general lesson for the guide: a page cannot use `window.open`,
`window.prompt`, `alert`, `confirm`, or top-level navigation. Anything that needs
the browser itself must go through a capability. The guide should say so, because
an agent will reach for these by habit.

### Sandbox and exposure surface, as a whole

Separate from the individual bugs: the set of things a page may and may not
reach has never been reviewed as one thing. It is currently the *outcome* of
three independent mechanisms — the iframe `sandbox` attribute, the document CSP,
and the enabled capability list — and some of the resulting limits are intended
while others are incidental. Examples of the latter found in September:
`connect-src 'none'` also blocks a page reading its own asset as data;
`frame-src 'none'` blocks embedding in a way that looks like success;
WebGL cannot use an asset-URL texture (opaque origin taints the canvas) but can
use a `data:` URL, so the limit is bypassable by inlining and therefore protects
nothing.

Wanted: one document that states, per mechanism, what is deliberately denied and
why, so that a future limit is a decision rather than a side effect. This is the
subject of `DECISIONS.md` D4 and D7.

### bb IDE integration

Backlog, agreed September 2026. **Nothing here is scheduled** — the decision was
to document and stop. Read *Portability* first: it constrains every item.

#### Portability is the constraint

A page must behave identically in the bb app, in a browser, and on a phone. It
therefore stays a plain document that knows nothing about bb's UI: its only
contact with the outside is the attributes and capabilities the server already
exposes. Two consequences, both decided:

- **The shell's chrome stays on when embedded.** Title bar, Sessions link and
  working indicator render the same in every context, and the page is not
  reshaped by where it is being read. Two title bars in the bb panel is the
  accepted cost; an `embed` parameter that strips chrome was **rejected**.
- **No fix may depend on the bb frontend.** Anything that also has to work in
  Safari on a phone gets a browser-level fix, and bb inherits it.

So integration may add *entry points* to a page, and must not add *behaviour*
to one.

#### It needs a frontend entry first — deliberately deferred

The manifest declares `server` only. Every item below needs a `bb.app` entry,
React, the shimmed type-only devDependencies, vendored components and a jsdom
test setup — a one-time structural change that lands in every bb window. Agreed
as **yes, but not next**, so this whole section waits on that being wanted.

Experimental APIs are acceptable here: most of these surfaces carry the
`experimental_` prefix, and `engines.bb` is `>=0.40`, so a bb minor can break
them. Accepted knowingly.

#### The two items wanted

> **Note (September 2026).** The composer item below argues that starting a
> session from inside a page is *"a confirmation dialog and a guess at
> defaults"*. DECISIONS.md **D5 rejects that**: pages may start any work they
> want, with explicit documented defaults, because under D1 spawning is how
> durable surfaces come to exist at all. The panel and composer remain wanted as
> *entry points*; they are no longer a reason to keep page-started sessions weak.

**A sidebar nav panel.** `app.slots.navPanel` — a customizable left-sidebar row
with the plugin's existing `FileText` icon, owning its route at
`/plugins/thread-pages/*`. Its body is the full main area with no host padding,
so a full-bleed iframe of `/page` for the home thread *is* the maximized view.
The route already serves `frame-ancestors 'self'`, so it embeds same-origin with
no CSP change. bb's built-in Browser is deliberately not the vehicle: it is a
host content tab with no plugin-facing "open at this URL" API.

Beside it, `experimental_NewThreadComposer` as a fixed tab — bb's real compose
surface, with the provider, model, reasoning, environment and permission
pickers. This is the one thing a sandboxed page genuinely cannot do: starting a
session from inside a page is a confirmation dialog and a guess at defaults.
The panel hosts the agent-authored page and adds only that.

This does not make Home a native dashboard. The non-goal below stands: the
panel is a frame around the page the agent wrote, not a replacement for it.

**The page beside the chat.** `threadPanelAction` — a "Thread page" row in a
thread's right-panel launcher, opening that thread's page next to its
conversation. Stable API. Reading the page while watching the turn is currently
something you have to choose between; this is the item with the highest ratio of
value to cost in the section.

#### Considered and rejected

- **A button on each sidebar thread row**, next to archive. bb exposes no
  per-row slot. The only supported route is `experimental_threadList`, the one
  exclusive slot in the SDK: you inherit rows, windowing, pinning, unread,
  indicators, the context menu and the `data-sidebar-thread-*` DOM contract
  bb's keyboard shortcuts read, and you conflict with any other list-replacing
  plugin. Injecting into bb's own rows from a content script is possible and
  couples us to private markup that moves. Not worth one button; the panel tab
  above covers the need.
- **A per-session toggle for the initialization hint** on the New thread screen.
  The control is easy; the storage is not. `agents.configure` keys on a thread
  id, and on that screen the thread does not exist yet, so the choice can only
  be a best-effort guess that races two windows, a queued message or an
  overnight draft. Dropped rather than shipped racy. The global setting stays
  the way to control this.
- **Host-drawn confirmations for embedded pages.** Would be nicer inside bb and
  would not exist outside it. Fails *Portability*.
- **A `fileOpener` for `thread-page.html`.** Openers match by extension, so
  `html` would hijack every HTML file in every project.

### Settings

Wanted, and independent of everything above except the frontend entry —
`app.slots.settingsSection` renders arbitrary React below the host's declarative
form on the plugin's own page. bb already renders all five declared settings
itself, so this only adds what a form field cannot show.

- **A live seed preview.** `pageSeedHtml` is a ~28 KB string in a text box. An
  `<iframe srcdoc sandbox="allow-scripts">` renders it as it will actually look:
  no new route, no token, opaque origin.
- **Named presets for the instruction and the seed.** "More prompts" wants
  presets, not more text boxes: a `select` of named contracts and seeds, with
  the existing free-text field as an override while it is non-blank. Declarative
  settings already support `type: "select"`.
- **Show the instruction a new session would receive.** `agentInstructionText`
  is injected only into eligible root threads and only when the hint is on.
  The settings page should show the exact text that would be injected now, or
  say plainly that nothing would be — the current form cannot express that.

Not wanted, though it came up: a design-world picker to replace hand-editing
`data-theme` inside the seed. It is the theme picker the non-goals rule out.

### Follows from the September 2026 decisions

Not yet specified as implementation items — recorded so the consequences are not
lost. Read DECISIONS.md first; several of these replace items elsewhere in this
file.

- **Network access (D7).** Open `connect-src`, and decide what the guide tells an
  agent about it. One accepted consequence is recorded in D7: a page runs in the
  *reader's* browser, so an open `connect-src` can reach that device's own
  network, including loopback and private ranges. CSP cannot express "public
  internet only", so the choice is open access or an allow-list, and an
  allow-list contradicts the decision.
- **`threads.spawn` must work (D5).** Supply what bb requires, and *document the
  defaults* — an agent should know which environment, provider and model a
  page-started session gets when it says nothing, and how to override it.
- **Multi-file pages (D1).** A page may grow into a site. Today's assets are a
  flat directory, no subdirectories, served from a separate preview origin
  through an injected `<base href>`. That indirection is also the cause of the
  asset-CSP-scheme and preview-TTL bugs. Serving a page's own directory under the
  page's own route would satisfy multi-file and remove both causes; **a direction,
  not a decision.**
- **The standing instruction and guide (D1, D5, D6).** Teach the
  spawn-an-agent-for-a-new-interface route; document the spawn defaults; warn
  about automatic form capture, including `method="dialog"` forms.
- **Rebuild the console pages (D1).** The five built in the experiment have no
  owning agent — their threads were created with the prompt scheduled a month out
  and the queued message deleted. Under D1 that hack is unnecessary: each page
  should be owned by a real agent that built it and then stopped.
- **Drop the shared rail (D3).** The `hub.js` file copied into six threads is
  against the no-sharing decision. Shared appearance is an instruction to the
  agents that write the pages, not a shared file.
- **Widen `threads.snapshot` (D4).** Direction decided; the field set is not.
  Choose the fields as a set, not one at a time.
- **Portability of the server contract (principle 2).** It should be possible to
  reimplement this server elsewhere and have pages keep working. Worth an
  explicit statement of the contract a host must satisfy.

### Worth doing

- **Asset and upload cleanup.** Neither directory is ever pruned. A page that
  receives many attachments grows without bound.
- **`threads.snapshot` paging.** `nextCursor` is always `null`; the limit is 200.
  Fine for now, wrong eventually — and now also needed by D4.
- **Design-system updates for existing pages.** Each page carries its own
  stylesheet, which is what makes per-page restyling safe and plugin updates
  harmless. The cost is that improvements only reach new pages. If that becomes
  annoying, the answer is a command that re-splices the current stylesheet into a
  page on request — not injection at render time, which would take the property
  away. **Confirmed** by DECISIONS.md D3, which chose no sharing between pages.
- **A second reference page.** The home page is the only worked example. One
  more — a diagram or a multi-screen flow — would show the range better than the
  guide's prose.

## Non-goals

- **A component library or theme picker.** The plugin hosts pages; it does not
  design them. Five worlds exist so a page has a coherent starting point, not so
  it has a menu.
- **A fixed dashboard.** Home is an ordinary page. Anything the plugin renders
  itself is one thing an agent cannot adapt to the task. A bb nav panel that
  frames the agent-authored page is not an exception; a native React session
  list would be. **Reinforced** by DECISIONS.md D1: a dashboard is a page some
  agent was asked to build, and home is a pointer at one such page — so there is
  nothing for the plugin to render even in principle.
- **A page that knows it is inside bb.** A page behaves the same in the bb app,
  a browser and a phone, and reaches the outside only through the server's
  attributes and capabilities. No bb-only affordance, and no bb-only fix for a
  bug a phone also has.
- **Strict no-exfiltration.** Would require forbidding authored JavaScript, which
  is the product. See ARCHITECTURE.md.

### Reversed September 2026

- ~~**General network access from a page.**~~ **Reversed** by DECISIONS.md D7.
  Pages get internet access. The exfiltration argument for the old position did
  not survive inspection: a page can already encode frame-local data in a
  self-navigation URL, which neither sandbox flags nor CSP resource directives
  prevent, so `connect-src 'none'` bought obscurity rather than prevention. A
  page still holds no bb authority, and every effect on bb still goes through one
  validated capability. Named capabilities remain the right shape for anything
  that needs bb's *credentials*, which is a different thing from reaching a URL.

## Release

1. `npm ci && bb plugin types --check . && npm test && npm run typecheck && npm run build`
2. Tag `vX.Y.Z` and push. bb records the tag with the commit it pointed at and
   **refuses a tag that later moves** — so publish a fix as a new version rather
   than retagging. If a tag has to move, everyone on it must remove and reinstall.
3. Verify `bb plugin install git:<url>@^X.Y.0` on a clean machine.
4. Publish to npm (see below).
5. Submit to the marketplace with the `submit-a-plugin` skill, which reads the
   current contract from `github.com/get-bb/marketplace` rather than assuming one.

### Publishing to npm

The scope has to exist and you have to be logged in as a member:

```sh
npm login                       # as the account that owns @unifedev
npm publish --access public
```

`dist/` is committed and also packed, so neither a git nor an npm install needs a
build step. `package-lock.json` is committed for the git path — npm strips it from
tarballs by design, which is fine because npm resolves `parse5` itself.

Verify afterwards with `bb plugin install npm:@unifedev/thread-pages@^0.3.0`.
