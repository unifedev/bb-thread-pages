# 05 — Capabilities

The only way a page can affect anything outside itself.

## Rules for every capability

- **R5.1** Each capability MUST have a fixed name, a parameter validator, a
  result validator, an effect class, and a confirmation requirement.
- **R5.2** Parameters MUST be validated before use: exact key sets (unknown keys
  rejected), types, ranges, string patterns, and bounded serialised size, depth
  and node count.
- **R5.3** Results MUST be **projected**, not passed through. A capability
  returns only the fields it declares. A host MUST NOT widen a result because its
  own API returned more.
- **R5.4** There MUST NOT be a generic invoke, an endpoint parameter, or a
  provider pass-through (R3.10).
- **R5.5** Adding a capability MUST NOT require a new page-side component.
- **R5.6** A capability that is defined but not implemented MUST fail with
  `unknown_method`, not hang or return a fake result.

### Effect classes

| Class | Meaning | Confirmed |
| --- | --- | --- |
| `read` | Returns data, changes nothing | no |
| `own-session-write` | Affects only the page's own session | no |
| `cross-session-write` | Affects another session, or creates one | **yes** |
| `destructive` | Stops or archives a session | **yes** |
| `navigation` | Sends the reader somewhere | see below |
| `device` | Uses the reader's hardware or a native dialog | **yes** |

- **R5.7** Every `cross-session-write`, `destructive` and `device` capability MUST
  be confirmed per [03-trust.md](./03-trust.md) §Confirmed effects.
- **R5.8** Navigation to another page of this host MAY be unconfirmed; navigation
  to an external origin MUST be confirmed.

## Reads

### `context.get`
`read` · no params.

Returns the page's own identity and the live capability roster:

```
{ protocolVersion, session: { id, title, projectId }, page: { revision, readOnly },
  capabilities: [{ method, effect, confirmation }] }
```

- **R5.9** The roster MUST reflect what is actually enabled, so a page can
  discover its own surface rather than assume it.

### `session.activity`
`read` · `{ limit? }`

Rich per-turn activity for **the page's own session only**: state
(`working` | `idle` | `waiting` | `failed` | `stopped`), a timestamp, and up to
`limit` recent items with kind, label, text, completion flag and time.

- **R5.10** MUST NOT accept a session id. It is always the owner.

### `sessions.snapshot`
`read` · `{ projectId?, includeArchived?, limit?, cursor? }`

A bounded, projected list of sessions.

Per session, the minimum set: `id`, `title`, `projectId`, `parentSessionId`,
`status`, `archived`, `page: { available, revision }`, `updatedAtMs`.

- **R5.11** MUST be bounded. Recommended default 100, maximum 200 per call.
- **R5.12** MUST support paging with an opaque cursor. A host MUST NOT ship a
  cursor field that is always null.
- **R5.13** **Widened reads are decided in direction, not in content.** The field
  set above is the floor; a host MAY return more per session, and the set is
  expected to grow. Each additional field MUST be chosen deliberately, as part of
  a considered set, and documented — because whatever a page can read it can also
  send anywhere (R3.11). Do not widen by exposing whatever the underlying API
  happens to hold.
- **R5.14** A host MUST NOT include message bodies or agent output in this
  capability without an explicit decision to do so.

### `projects.list`
`read` · no params. Returns `{ id, name, kind }` per project. MUST NOT include
filesystem paths or host identifiers.

### `providers.list`
`read` · no params. Returns the provider and model choices a page may pass to
`sessions.start`.

- **R5.15** If a host cannot enumerate them it MUST fail with a clear error, and
  MUST NOT return an empty list as if none existed.

### `storage.get`
`read` · `{ key }`. Returns `{ found, value? }`.

## Writes to the page's own session

### `session.reply`
`own-session-write` · `{ title?, mode?, result, idempotencyKey? }`

Sends a structured result to the owning session as the reader's next message. For
interactive pages whose answer is not a form.

- **R5.16** `mode` MUST support at least `queue` (wait for the current turn) and
  `steer` (interrupt it). Default `queue`.
- **R5.17** With an idempotency key, a repeat MUST NOT deliver twice.

### `storage.set`
`own-session-write` · `{ key, value }`

Small JSON state that survives a reload.

- **R5.18** MUST be namespaced per session. A page MUST NOT be able to read or
  write another page's state.
- **R5.19** Value size MUST be bounded. Recommended 32 KiB.

## Starting and steering work

This section is **load-bearing**: under [01-page-model.md](./01-page-model.md)
§Durable surfaces, starting sessions is the mechanism durable surfaces are made
of, not a convenience.

### `sessions.start`
`cross-session-write` · confirmed · `{ projectId, prompt, title?, providerId?, model?, reasoningLevel?, environment? }`

Starts a new visible root session and returns `{ sessionId }`.

- **R5.20** **This MUST work.** A host MUST supply every field its own session
  API requires — including any it does not expose to the page — and MUST NOT fail
  because the page omitted something it never knew about.
- **R5.21** The started session MUST be a **visible root**, owned by the reader,
  not a hidden helper of the calling page's session. A page starting work creates
  the reader's work.
- **R5.22** **Explicit defaults.** Every optional field MUST have a defined,
  documented default, and the authoring guide MUST state what a page gets when it
  says nothing and how to say otherwise. Using the defaults must be a deliberate
  choice rather than an accident.
- **R5.23** The default environment MUST be the project's own default. A host
  MUST NOT invent a workspace, and MUST NOT silently reuse the calling session's.
- **R5.24** The confirmation summary MUST name the project and enough of the
  prompt to be recognisable, and SHOULD name the resolved provider, model and
  environment — so the reader approves something legible rather than an id
  (R3.18).
- **R5.25** A page MUST NOT be able to start a session in a project the reader
  cannot see.

### `sessions.send`
`cross-session-write` · confirmed · `{ sessionId, prompt, mode? }`

Sends a prompt to an existing session. Returns `{ sessionId, delivery, duplicate }`.

- **R5.26** MUST refuse the page's own session, directing the caller to
  `session.reply`. Two paths to one effect with different confirmation rules is a
  hole.
- **R5.27** MUST report whether the message started a turn or was queued.

### `sessions.stop`
`destructive` · confirmed · `{ sessionId }`

- **R5.28** MUST refuse the page's own session: stopping it would kill the turn
  about to read the answer.

### `sessions.archive`
`destructive` · confirmed · `{ sessionId }`

## Navigation

### `pages.open`
`navigation` · `{ sessionId }` — opens another session's page.

- **R5.29** MUST navigate the **reader's current view in place**, not open a new
  tab. Rationale: popups are blocked outright on mobile, so a new tab is broken
  on the device this product most needs to work on; and in-place navigation gives
  the reader a working back button.
- **R5.30** MUST be implemented in the shell using its own window, since it is
  trusted code and the destination is built from a validated session id.
- **R5.31** MUST be implemented in a way that works in a plain browser. A
  host-application-only implementation is a violation of P1/P2: it would leave
  the phone broken.

### `sessions.openHost`
`navigation` · `{ sessionId }` — opens a session in the host application, when
the host has one. MAY be absent; if absent it MUST report `unknown_method`.

### `navigation.openExternal`
`navigation` · confirmed · `{ url, label? }`

- **R5.32** MUST accept only http(s).
- **R5.33** The confirmation MUST name the destination origin.
- **R5.34** This is the target of the anchor interception in R4.15.

## Device

### `projects.browse`
`device` · confirmed · no params

Opens the host's native folder picker. Returns an **opaque single-use token** plus
a display string.

- **R5.35** MUST NOT return a filesystem path. The page never learns one.
- **R5.36** The token MUST be single-use, short-lived (recommended 10 minutes),
  and valid only for the requesting page's session.

### `projects.create`
`cross-session-write` · confirmed · `{ selectionToken, name? }`

Redeems a `projects.browse` token.

- **R5.37** MUST reject a token issued to a different session, already redeemed,
  or expired.

### `voice.captureAndTranscribe`
`device` · confirmed · `{ language?, prompt?, maxDurationSeconds? }`

**Deferred.** Contract only. A host that does not implement it MUST report
`unknown_method` (R5.6).

## Errors

- **R5.38** Every failure MUST carry a code from this fixed set:

`invalid_json` · `invalid_request` · `invalid_params` · `invalid_response` ·
`request_too_large` · `response_too_large` · `unsupported_version` ·
`unknown_method` · `stale_page` · `confirmation_required` ·
`confirmation_invalid` · `cancelled` · `not_found` · `conflict` ·
`unavailable` · `rate_limited` · `handler_error` · `invalid_result`

- **R5.39** `cancelled` MUST mean the reader declined a confirmation and nothing
  else. Every page that calls a confirmed capability is expected to handle it.
- **R5.40** `stale_page` MUST mean the page changed under the caller.
- **R5.41** `handler_error` MUST be accompanied by a host-side log entry naming
  the real cause. *Known cost, accepted:* the page sees only a generic message.

## Capability summary

| Method | Effect | Confirmed |
| --- | --- | --- |
| `context.get` | read | |
| `session.activity` | read | |
| `sessions.snapshot` | read | |
| `projects.list` | read | |
| `providers.list` | read | |
| `storage.get` | read | |
| `session.reply` | own-session write | |
| `storage.set` | own-session write | |
| `pages.open` | navigation | |
| `sessions.openHost` | navigation | |
| `sessions.send` | cross-session write | yes |
| `sessions.start` | cross-session write | yes |
| `projects.create` | cross-session write | yes |
| `sessions.stop` | destructive | yes |
| `sessions.archive` | destructive | yes |
| `navigation.openExternal` | navigation | yes |
| `projects.browse` | device | yes |
| `voice.captureAndTranscribe` | device | deferred |
