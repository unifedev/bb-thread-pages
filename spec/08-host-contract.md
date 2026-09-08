# 08 — The host contract

P2 requires that this product be reimplementable: someone should be able to stand
up an equivalent host and have existing pages keep working. This file states what
a host must provide, so that requirement is testable rather than aspirational.

bb is the first host, not the definition.

## What a host must have

### Sessions

A host MUST have a notion of an **agent session** with:

- a stable id, usable in a URL path segment;
- a human-readable title;
- a status distinguishing at least *working*, *idle*, *waiting*, *failed*,
  *stopped*;
- a visibility distinguishing reader-facing sessions from internal helpers;
- a parentage notion, so a root can be told from a child or a fork;
- an archived/deleted state.

- **R8.1** A host MUST be able to answer "is this session eligible to own a page"
  from the above ([01-page-model.md](./01-page-model.md) §Eligibility).

### Session operations

- **R8.2** Send a message to a session, with at least *queue if busy* and
  *interrupt* modes, reporting which occurred.
- **R8.3** Start a new session in a project, as a visible root, returning its id.
  **This is mandatory**, not optional: durable surfaces depend on it (R5.20).
- **R8.4** Stop a session's running turn.
- **R8.5** Archive a session.
- **R8.6** List sessions with bounded paging.
- **R8.7** Read recent activity for a single session.

### Projects and grouping

- **R8.8** A host MUST have a notion of a project or workspace a session belongs
  to, exposable as `{ id, name, kind }` without leaking a path.
- **R8.9** A host MUST have a **default environment per project** so that
  `sessions.start` can succeed with no environment supplied (R5.23).

### Per-session storage

- **R8.10** A host MUST give each session a private directory it and its agent
  can write, and MUST be able to serve a subtree of it as static files.
- **R8.11** A host MUST provide a small per-session key-value store for page
  state, and MUST namespace it per session (R5.18).

### Serving

- **R8.12** A host MUST serve HTTP on an origin the reader authenticates to, and
  MUST allow the page routes to live on that same origin — so no second port,
  tunnel or credential is needed (R1.14).
- **R8.13** A host MUST be able to set arbitrary response headers, including
  `Content-Security-Policy`, `ETag` and `Content-Type`.
- **R8.14** A host MUST support conditional requests (`If-None-Match`).
- **R8.15** A host MUST know its own **externally reachable origin, including
  scheme**, when one exists. See §The scheme, below — this is not optional
  detail, it is where the reference implementation broke.

### Agent integration

- **R8.16** A host MUST provide a way to inject a standing instruction into new
  eligible sessions, and to turn that off.
- **R8.17** A host MUST provide a command surface the agent can invoke
  ([06-agent-contract.md](./06-agent-contract.md)).
- **R8.18** A host MUST give the agent an environment variable or equivalent
  naming its own session and its storage directory.

### Persistence

- **R8.19** A host MUST persist a signing key across restarts (R2.8).
- **R8.20** A host MUST persist the settings in [07-configuration.md](./07-configuration.md).
- **R8.21** A host MUST NOT require a database of its own for pages. A page is a
  file; the only persistent extras are the signing key, the settings, and an
  optional offline cache.

## What a host must not do

- **R8.22** MUST NOT require the page to know anything host-specific. No
  host-shaped API, no host-only affordance, no capability that is meaningless
  elsewhere (P4, R4.33).
- **R8.23** MUST NOT reshape a page based on where it is being read (R2.16).
- **R8.24** MUST NOT render page content itself, beyond the three chrome elements
  in R2.14–R2.15.
- **R8.25** MUST NOT give the page any credential (R3.1).

## The scheme

Called out separately because getting it wrong silently breaks every page read
remotely, which is the product's default access story.

A host is commonly reached through a tunnel or reverse proxy: the reader loads
`https://<public-host>/...` while the server itself listens on
`http://127.0.0.1:<port>`. Anything the host emits that names its own origin must
name the **reader's** origin, not the listening socket's.

- **R8.26** Any absolute URL or CSP source the host emits MUST use the scheme and
  authority the *reader* used. A host MUST NOT derive them from its listening
  socket or from an unverified `Host` header alone.
- **R8.27** Where the reader's origin cannot be established reliably, the host
  MUST prefer **origin-relative** URLs and **scheme-relative or host-less** CSP
  sources over guessing. A wrong absolute source fails closed and silently; a
  relative one cannot.
- **R8.28** A host MUST have a test that loads a page over HTTPS through a proxy
  and asserts that an external stylesheet, script and image all load. *This
  exact bug shipped in the reference implementation and was invisible on
  loopback* — see [09-conformance.md](./09-conformance.md).

## Portability checklist

A second implementation is conformant when, without modifying any existing page:

1. An existing page's entry document renders identically.
2. Its relative references to its own files resolve, including nested paths.
3. Its captured forms deliver to the owning session with the same labels.
4. `window.threadPage.invoke` accepts the same method names, parameters and
   errors.
5. `watch` polls and pauses identically.
6. Confirmed capabilities show a host-authored summary and reject a forged or
   replayed approval.
7. Uploads land in the page's own uploads directory under host-generated names.
8. The offline copy behaves as in [02-serving.md](./02-serving.md).
9. `sessions.start` succeeds with only a project and a prompt.
10. A page loaded over HTTPS can load its own external stylesheet.

- **R8.29** A host MUST document any capability it does not implement, and MUST
  report `unknown_method` rather than failing obscurely (R5.6).
