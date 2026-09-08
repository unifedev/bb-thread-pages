# Thread Pages

A bb plugin: every agent session gets one directly editable HTML page you can
read and answer from, on any device.

```sh
bb plugin install npm:@unifedev/thread-pages@^0.3.0
```

Then turn on **Agent initialization hint** in the plugin's settings, or ask any
agent to run `bb thread-page init`.

## This repository is the implementation only

The design, the specification, the decisions and their reasoning live in a
separate repository, **`unife-bb-plugin`** (Syns). Nothing in this repository
decides what the product should be; it implements what that one specifies.

| Where | What |
| --- | --- |
| `unife-bb-plugin` (Syns) | `spec/` — the buildable specification, 236 requirements. `docs/DECISIONS.md` — every design decision and why. `ARCHITECTURE.md`, `docs/MODEL.md`, `docs/ROADMAP.md` |
| this repository | TypeScript, tests, build, release |

The split exists so that design work and code work do not contend for the same
tree: strategy is decided in the spec repository, and picked up here as work.

**The specification and this code deliberately disagree** in sixteen recorded
places — six because the model changed, six real bugs, three accepted
carry-overs, one found while writing the spec. `spec/09-conformance.md` in the
spec repository lists each with the measurement that established it. The spec
wins in every case.

## Layout

```
server.ts      routes, settings, the CLI, capability handlers
page.ts        tokens, the shell, the document, the page kernel
bridge.ts      capability registry, validators, effect classes
authoring.ts   the standing instruction and the authoring guide
theme.ts       the default page seed
home.ts        the default home page
*.test.ts      vitest
```

## Working on it

```sh
npm ci
npm test
npm run typecheck
npm run build          # bb plugin build → dist/
bb plugin install .    # try it locally
```

Confirmed capabilities **cannot be verified in headless Chrome**: the trusted
`<dialog>` closes with the right return value but never fires its `close` event,
so the call hangs in `pending` with no error. Test those in a headed browser.
See `spec/09-conformance.md` §Testing note.

## Release

See the release section of `docs/ROADMAP.md` in the spec repository.

MIT
