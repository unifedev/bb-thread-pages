# Thread Pages

A bb plugin: every agent session gets one page it writes itself, served as a
site the reader can read and answer from on any device.

```sh
bb plugin install git:https://github.com/unifedev/bb-thread-pages.git@^1.0.0
```

Every new session then writes a page for its task, built for that task, and
answers you from it. The standing instruction that asks it to is on from
install; turn off **Agent instructions** in the plugin's settings (or
`bb plugin config thread-pages set agentInstructions false`) to stop it.

Home works from the start: every page links to a built-in hub of your sessions.
If you want a home of your own, ask a session to build one; it runs
`bb thread-page home` there, and `bb thread-page home --clear` returns to the
built-in one.

## This repository is the implementation only

The product is specified in a separate repository, **`unife-bb-plugin`**
(Syns): `spec/` is the buildable specification, `docs/DECISIONS.md` the
reasoning, `rewrite/` the architecture of this implementation and the
decisions taken while building it, `verify/` the fixtures and scenarios that
verify it. Nothing here decides what the product should be.

## What an agent gets

- `bb thread-page init` — prints the page's path and link, and whether the
  agent still has to write it. It creates no file, unless an operator has
  configured a seed of their own; there is no template, stylesheet or example.
- `bb thread-page guide` — the authoring guide: forms and controls anywhere on
  the page, own files and several documents, uploads, `window.threadPage`,
  every capability, other services and servers, limits, and what the sandbox
  silences.
- `bb thread-page home [--clear]` — makes this session's page the home page,
  or returns to the built-in one.
- `bb thread-page status` — settings, the exact instruction a new session
  receives, and this session's page.

The page root is the session's storage directory (`$BB_THREAD_STORAGE`):
`index.html` is the page, any file beside it is served relatively (nested
paths included), any other `.html` file is a document of the page that opens
in place, and `uploads/` holds what the reader attaches.

## Layout

```
server.ts                 entry: hands bb to the composition root
src/plugin.ts             composition root
src/domain/               host-free: limits, errors, tokens, capabilities, submissions, HTML injection
src/host/                 the host contract (spec 08) and its projected types
src/bb/                   the bb adapter — the only package that imports the SDK's runtime shapes
src/pages/                page layout, the page store (revision, offline copy), the site strategy
src/serving/              routes, the bridge dispatcher and capability handlers
src/agent/                CLI, standing instruction, an operator's optional seed, generated guide
src/home/                 the built-in home page (bundled by scripts/build-runtime.mjs)
src/config/               the five settings
src/runtime/              browser code: the kernel (inside the sandboxed page) and the shell (trusted chrome)
src/generated/            the bundled runtimes as string modules (committed; npm run build:runtime)
test/                     vitest: domain, runtime (jsdom), serving (fake host), bb adapter, guide
scripts/build-runtime.mjs esbuild step for src/runtime
```

## Working on it

```sh
npm ci
npm run check          # build runtimes, typecheck, test
npm run build          # runtimes + bb plugin build → dist/
bb plugin install .    # try it locally
```

`src/generated/*.ts` must be rebuilt (`npm run build:runtime`) after any
change under `src/runtime/`; a test fails when they are stale.

Confirmed capabilities render a dialog in the shell; its buttons, not the
dialog's `close` event, settle the result, so they can be driven headlessly.

## Serving on bb 0.42.1

bb's plugin router matches paths exactly, so the plugin cannot serve
`/page/<id>/*` itself. Files beside `index.html` are served by bb core's
thread-storage route through one same-origin `<base>` injected into the
document (`SiteStrategy` "core-storage"). One consequence: page script cannot
`fetch()` its own files (bb refuses the sandbox's `Origin: null`); subresources
load normally. The "plugin-prefix" strategy in `src/pages/site.ts` removes the
limitation once bb offers prefix routes.

## Release

A release is a git tag **and** an npm publish, always both: `bb plugin install
git:…@^X.Y.0` resolves tags, `bb plugin install npm:@unifedev/thread-pages`
resolves npm, and the two must name the same code.

1. `npm ci && npm run check && npm run build`
2. Bump `version` in `package.json`, add the `CHANGELOG.md` entry, commit
   `dist/` and `src/generated/` with it.
3. `git tag -a vX.Y.Z -m "Thread Pages X.Y.Z" && git push origin main --tags`.
   bb refuses a tag that later moves: publish a fix as a new version.
4. `npm publish --access public` (as a member of `@unifedev`). Verify with
   `npm view @unifedev/thread-pages version`.
5. On a clean machine: `bb plugin install npm:@unifedev/thread-pages@^X.Y.0`
   or the `git:` form, then `bb thread-page status`.

MIT
