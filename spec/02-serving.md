# 02 — Serving a page

## Shape

Three layers, and the separation between them is the whole security design:

```
┌─ shell ────────────────────────────────────────────┐  host-authored, trusted
│  title · home link · working indicator · Reload    │  holds the action token
│  ┌─ iframe (sandboxed, opaque origin) ───────────┐ │
│  │  document  ← the agent's entry file           │ │  untrusted, no credentials
│  │  + kernel  ← host-authored page runtime       │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
        │ one MessagePort, one capability at a time
        ▼
     host API
```

- **R2.1** The shell MUST be a separate document from the page. The page MUST NOT
  be able to read or modify it.
- **R2.2** The shell MUST hold the only credential that can cause an effect. The
  document MUST receive read authority only.
- **R2.3** All communication between page and shell MUST go over a single
  `MessagePort` handed to the document at load. There MUST be no other channel.

## Routes

Paths are relative to a host-chosen base. Names are normative; the base is not.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/page?session=<id>` | reader session | The shell for one page |
| GET | `/page/<id>/*` | render token | The document and every file in the page root |
| GET | `/home` | reader session | Redirect to the designated home page |
| POST | `/submit` | action token | Deliver a form submission to the owning session |
| POST | `/upload` | action token | Store one attached file |
| POST | `/bridge` | action token | Invoke one capability |

- **R2.4** Every route MUST require the reader's existing authenticated session
  with the host. The tokens below are *additional* scoping, never a replacement
  for authentication.
- **R2.5** A request naming a non-existent, ineligible or page-less session MUST
  return a human-readable error page or JSON error, never a blank response.

## Tokens

Two token scopes, both signed by a host-held key.

**Render token** — authority to *read* one page revision. Carried in the document
URL. Compromise reveals only what the reader can already see.

**Action token** — authority to *act* as the page's owner session. Held only by
the shell, sent only in request bodies, never in a URL.

Requirements:

- **R2.6** Both MUST be signed with a MAC using a key held only by the host, and
  MUST be verified in constant time.
- **R2.7** Both MUST carry: a version, a scope, the session id, the page revision
  they were minted for, an issued-at and an expiry. Verification MUST check every
  field, MUST reject an unknown scope, and MUST reject a lifetime longer than the
  configured maximum.
- **R2.8** The signing key MUST persist across host restarts, so an open reader
  session survives one. It MUST be generated on first use and never logged.
- **R2.9** Recommended token lifetime: 2 hours. A host MUST document its value.
- **R2.10** A token MUST NOT be usable for a different session or a different
  page revision than the one it names.

### Page revision

- **R2.11** A page revision MUST be a collision-resistant digest of the entry
  document's bytes. Recommended: SHA-256, hex.
- **R2.12** The revision MUST be used as the entity tag for the document, so
  ordinary HTTP conditional requests detect a change.
- **R2.13** A submission or capability call naming a revision other than the
  current one MUST be refused with a distinguishable "stale page" error, so the
  shell can offer a reload rather than silently acting on an old page.

## The shell

- **R2.14** The shell MUST show the page's title, an indication when the owning
  session is mid-turn, and a control to reload.
- **R2.15** The shell MUST show a link back to the designated home page, unless
  this page *is* home. The page never writes that link (P1: chrome is the host's
  job, and an agent should not pay for it).
- **R2.16** The shell's chrome MUST be identical wherever the page is read. It
  MUST NOT be suppressed or restyled by an embedding context (P1).
- **R2.17** The shell MUST poll the document route with a conditional request to
  detect a new revision. Recommended interval: 10 seconds while the tab is
  visible; polling MUST pause when it is not.
- **R2.18** On detecting a new revision the shell MUST reload the page, **unless**
  the page has declared itself dirty — see Update protection.
- **R2.19** The shell MUST render every confirmation dialog itself
  ([03-trust.md](./03-trust.md) §Confirmed effects). It MUST NOT accept dialog
  text from the page.
- **R2.20** When a token is close to expiry the shell MUST either refresh the
  page or tell the reader to reload. It MUST NOT silently stop working.

### Update protection

- **R2.21** A page MAY declare itself dirty (unsaved reader input, mid-flow
  state). While dirty, the shell MUST NOT auto-reload; it MUST surface that a new
  version exists and let the reader choose.
- **R2.22** Typing into any host-captured form MUST mark the page dirty
  automatically. A page MUST NOT have to implement that.
- **R2.23** A page MAY set and clear the dirty flag explicitly for state the host
  cannot see.

## Working indicator

- **R2.24** The shell MUST indicate when the owning session is mid-turn, so a
  reader knows the page they are looking at may be superseded.
- **R2.25** The indicator MUST ride along on the polling the shell already does.
  A host MUST NOT add a second polling channel for it.
- **R2.26** The indicator's wording MUST be configurable, and MUST be
  suppressible by configuring it blank.

## Caching and offline

A page is served from the reader's device but stored on the host's. Those may be
different machines, and the host may be unreachable.

- **R2.27** The host SHOULD keep a last-known-good copy of each page's entry
  document, so the page still opens when its source is unreachable.
- **R2.28** A page served from that copy MUST be marked read-only, MUST tell the
  reader so in host chrome the page cannot suppress, and MUST have its
  host-captured forms disabled.
- **R2.29** A submission or capability call attempted against a stale copy MUST
  be refused with a distinguishable error, never queued silently.
- **R2.30** The cache MUST be bounded in entries and bytes, and MUST verify that
  a cached document still matches its recorded revision before serving it.
- **R2.31** Caching of other files in the page root is OPTIONAL. A host that does
  not cache them MUST still serve the cached entry document.

## Submissions

- **R2.32** A submission MUST carry an action token, a client-generated
  submission id, the page revision, a title, the answers, and any uploaded file
  references.
- **R2.33** Delivery MUST be idempotent per submission id: a repeat of the same
  id with the same content MUST return the first outcome without delivering
  twice. A repeat with *different* content MUST be refused as a conflict.
- **R2.34** Idempotency records MUST be bounded in count and expire. Recommended:
  512 records, 5 minutes.
- **R2.35** The delivered message MUST identify itself as a page submission, name
  the form, and present each answer with its human-readable label. A blank answer
  MUST be delivered explicitly as blank, not omitted.
- **R2.36** If a submit button was used, its value MUST lead the message as the
  reader's chosen action.
- **R2.37** Delivery MUST NOT interrupt a running turn. It MUST queue when the
  session is busy, and the shell MUST report which happened.

## Rate limiting

- **R2.38** Effectful routes MUST be rate limited per page. Recommended: 30
  accepted requests per minute and 4 concurrent, per page.
- **R2.39** A rejected request MUST return a distinguishable "rate limited" error
  so a page can report it rather than appearing to hang.
- **R2.40** *Rationale, and a design obligation:* the shell's own polling and the
  page's own calls share this budget. A host MUST set the limit high enough, or
  scope it narrowly enough, that ordinary page behaviour cannot exhaust it. A
  page that shows a session list and refreshes it is ordinary behaviour.

## Errors

- **R2.41** Every failure MUST produce a distinguishable machine-readable code
  and a human-readable message.
- **R2.42** A message crossing to the page MUST NOT leak host internals:
  no filesystem paths, no stack traces, no internal identifiers.
- **R2.43** The host MUST log the underlying cause where an operator can read it.
- **R2.44** *No failure may be silent by design.* Where a limit or a blocked
  operation cannot be reported to the page, it MUST be stated in the authoring
  guide so an agent does not have to discover it by experiment.
