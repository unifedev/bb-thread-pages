# Roadmap

Version 0.3.0 · September 2026

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

### Worth doing

- **Asset and upload cleanup.** Neither directory is ever pruned. A page that
  receives many attachments grows without bound.
- **`threads.snapshot` paging.** `nextCursor` is always `null`; the limit is 200.
  Fine for now, wrong eventually.
- **Design-system updates for existing pages.** Each page carries its own
  stylesheet, which is what makes per-page restyling safe and plugin updates
  harmless. The cost is that improvements only reach new pages. If that becomes
  annoying, the answer is a command that re-splices the current stylesheet into a
  page on request — not injection at render time, which would take the property
  away.
- **A second reference page.** The home page is the only worked example. One
  more — a diagram or a multi-screen flow — would show the range better than the
  guide's prose.

## Non-goals

- **A component library or theme picker.** The plugin hosts pages; it does not
  design them. Five worlds exist so a page has a coherent starting point, not so
  it has a menu.
- **A fixed dashboard.** Home is an ordinary page. Anything the plugin renders
  itself is one thing an agent cannot adapt to the task.
- **General network access from a page.** When a task needs a remote service it
  should get a named, reviewed capability, not a fetch proxy.
- **Strict no-exfiltration.** Would require forbidding authored JavaScript, which
  is the product. See ARCHITECTURE.md.

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
