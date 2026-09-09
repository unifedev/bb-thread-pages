# Upgrading

## 0.3.x → 1.0

1.0.0 was a rewrite against the specification, and it renamed the whole
page-facing surface at once. Nothing is aliased: an old name fails rather than
silently doing the right thing. A page written against 0.3.x therefore breaks
in several places at the same time, each of them quietly.

| 0.3.x | 1.0 |
| --- | --- |
| `thread-page.html` | `index.html` |
| `thread-page-assets/` | any file beside the entry document, nested paths included |
| `threads.spawn` | `sessions.start` |
| `threads.snapshot` | `sessions.snapshot` |
| `threads.send` | `sessions.send` |
| `threads.stop` | `sessions.stop` |
| `threads.archive` | `sessions.archive` |
| `threads.openPage` | `pages.open` |
| `threads.openBb` | `sessions.openHost` |
| `thread.get` | `context.get` |
| `thread.reply` / `threads.reply` | `session.reply` |
| `thread.activity` / `threads.activity` | `session.activity` |
| `page.storage.get` / `page.storage.set` | `storage.get` / `storage.set` |
| `navigation.open` | `navigation.openExternal` |
| `homeThreadId` (plugin setting) | `homeSessionId` (`bb thread-page status`) |
| `window.threadPage.assetUrl()` | removed — the API is frozen at `invoke` / `watch` / `setDirty` / `version` |

### The two that cost the most

**The entry document was renamed.** `thread-page.html` is not served and not
migrated. A session that had a page looks like a session that never had one.
`bb thread-page init` notices the old file and says so; move what you want out
of it by hand.

**`assetUrl()` was removed rather than deprecated**, so a page that calls it
throws instead of degrading. Reference files relatively instead.

### What the host tells you now

Calling a renamed method returns `unknown_method` with the replacement named:

    Unknown capability: threads.spawn (renamed to sessions.start in 1.0; there is no alias)

The table above is the complete list the host recognises; see
`src/domain/capabilities/renamed.ts`.

### Not a rename

`sessions.snapshot` also changed behaviour in 1.0.2: it lists root sessions
only unless you pass `includeChildren: true`, and every session now carries
`unread` and `attentionAtMs`. Check `bb thread-page guide` for the current
shape rather than assuming the 0.3.x one.
