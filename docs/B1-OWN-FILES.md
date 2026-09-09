# A page's own files, and the workaround that should be deleted

**Status:** the workaround shipped. It is temporary by design. This document
says what it works around, how to know the workaround is no longer needed, and
exactly what to delete.

## The bug

A page that loads its own stylesheet or data file renders correctly on
loopback and **renders empty for the reader on bb Connect** — the origin a
reader actually uses on a phone. Nothing errors. The author cannot see it from
the machine that wrote the page, so every fixture in `verify/` passed while the
feature was broken in the field.

Reported as B1 in `unife-bb-plugin/docs/FIELD-ISSUES-2026-09-08.md`, where a
reader saw a fully functional interface reporting that a 300-row wiki was
empty.

## The cause, measured

Unauthenticated GETs, no cookie, 2026-09-09, bb 0.42.1:

| Path | loopback `127.0.0.1:38886` | `bart.getbb.app` |
| --- | --- | --- |
| `…/plugins/thread-pages/http/page?session=…` | 200 | 401 |
| `…/threads/<id>/thread-storage/files/index.html` | 200 | 401 |
| `/api/v1/health` (does not exist) | 404 | 401 |
| `…/plugins/nonexistent-xyz/http/page` | 404 | **401** |

The last row is the one that matters: a plugin that does not exist gets bb's
own 404 locally and Cloudflare's 401 remotely. **bb Connect authenticates at
the edge, before bb is reached at all.** The remote responses carry
`server: cloudflare` and a `cf-ray`, and their body is the Connect sign-in
gate — `apps/connect/src/worker.ts` in `get-bb/bb`, which ends its credential
ladder with `signInPage(...)` when no session cookie is present.

The page frame is `sandbox="allow-scripts allow-forms"`, so it has an opaque
origin. Its **document** request is issued by the trusted shell, whose
site-for-cookies is the Connect host, so the `SameSite=Lax` cookie is attached
and the document loads. Any **subresource** request issued from inside that
frame has an opaque origin in its ancestor chain, so its site-for-cookies is
null, the request counts as cross-site, and the Lax cookie is not attached.
Both Connect cookies are Lax: `apps/desktop/src/connect-desktop-session.ts`
hard-codes `sameSite: "lax"`, and the account cookie is better-auth's default.

The document-request half and the edge-gate half are measured. The
cookie-attachment rule is the specification applied to a case that cannot be
instrumented without devtools on the authenticated remote origin; it is the
only account consistent with what was observed.

### What this rules out

**Plugin prefix routes do not fix this.** The `plugin-prefix` site strategy in
`src/pages/site.ts` and the proposal in
`unife-bb-plugin/rewrite/07-bb-prefix-routes-proposal.md` move a page's files
from one path the edge 401s to another path the edge 401s. Prefix routes fix a
different bug — X17, `fetch()` of a page's own files, refused because bb core
routes reject `Origin: null` — and they are the substrate the real fix needs.
They are not the fix.

## The workaround, as shipped

`src/pages/inline.ts` resolves every relative reference in the entry document
against the page root **when the document is served**, and rewrites it to a
`data:` URL. The document is the one artifact whose request is always
authorised, so it carries the page's files with it.

- The URL is rewritten, not the element, so `defer`, `type="module"`, `media`,
  `alt` and every other attribute keep their meaning — and a file containing
  `</script>` cannot break out of the document.
- `url()` inside a resolved stylesheet is followed, bounded by
  `LIMITS.inlineCssDepth`.
- Anything absolute, protocol-relative, already a URL, or a bare fragment is
  left exactly as written.
- Anything missing, over `LIMITS.inlineFileBytes`, or over
  `LIMITS.inlineTotalBytes` is left as written and logged by path and reason.
  The page degrades to its pre-workaround behaviour rather than to a broken
  document.
- Traversal is refused by `isSafeRelativePath` and reported as `unsafe-path`.

Wired in `src/plugin.ts` (one argument to `createPageStore`) and resolved
inside `PageStore.load`, so the served document, its revision, its ETag and its
offline copy all describe the same bytes.

### What it costs

- A page's files are inside the document, so they count against the 5 MiB
  entry limit, and a page over 200 KiB keeps no offline copy. That drop used
  to be silent; `page-store.ts` now logs it with the size and the limit.
- base64 adds a third.
- Files are re-read on each document load. Sidecar edits therefore reload an
  open page, which is a better story than before — but a very large data file
  is re-read on every revision poll that returns a body.
- A `data:` URL module script cannot resolve relative imports.

## When to delete it

When the host can authorise a sandboxed document's own subresource requests.
Concretely, when **both** of these have landed in bb:

1. **Prefix plugin HTTP routes** — `bb.http.route("GET", "/page/*", …)` with
   `auth: "none"`, so this plugin can serve its own page directory and the
   document URL becomes path-shaped. Branch: `feat/plugin-prefix-http-routes`.
2. **A Connect page grant** — a short-lived, signed, GET-only credential
   carried as a path segment (`…/http/__grant/<token>/…`, so relative
   references inherit it) that the Connect worker verifies and strips before
   forwarding. Branch: `feat/connect-page-grant`.

A cookie change (`SameSite=None`) was considered and rejected: it attaches the
cookie to every cross-site request to the Connect domain, including subresource
GETs that carry no `Origin` header for bb's own origin checks to reject.

### How to verify it is no longer needed

Write a file beside `index.html`, reference it relatively, disable the
workaround, and read the page **over bb Connect on a phone or with devtools on
the remote origin** — never on loopback, where it has always worked. This is
the acceptance criterion `verify/` is missing.

### What to delete

1. `src/pages/inline.ts` and `test/pages/inline.test.ts`.
2. The `resolve` argument to `createPageStore` in `src/plugin.ts`, and the
   `PageResolver` type, the `site` field on `LoadedPage`, and the resolve block
   in `PageStore.load` in `src/pages/page-store.ts`.
3. `inlineFileBytes`, `inlineTotalBytes` and `inlineCssDepth` from
   `src/domain/limits.ts`.
4. The "How this actually works" block in `ownFiles()` and the added row in
   `limitations()` in `src/agent/guide.ts`, plus the guide tests asserting them.
5. This document.

Keep the offline-copy warning in `page-store.ts`. It was always right; the
workaround only made it matter sooner.
