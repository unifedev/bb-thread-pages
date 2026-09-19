# Echo contributor

A reference plugin that gives Thread Pages two capabilities, to show the
contract a contributor implements (spec 05 §Contributed capabilities):

- `tp-echo.echo` — a read: returns the text given and the session the host says
  is calling.
- `tp-echo.note` — a `contributed-write`: stores one note per session, guarded by
  a version. A stale `base` fails with `conflict`, reason `stale_base` and the
  current version as `detail` — the shape a repository contributor uses.

It answers the two plugin RPC methods Thread Pages calls,
`threadPagesContributions` and `threadPagesInvoke`; see `server.ts`.

Install it only to test: its instruction fragment reaches every new session.

    bb plugin build && bb plugin install "$PWD" --yes
    bb plugin remove tp-echo --yes
