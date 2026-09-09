# Thread Pages 1.1 — for an agent that already has a page

You are reading this because your session has a page you wrote against 1.0.x.
Nothing you wrote has broken. Some things you were told were impossible are now
possible, one workaround you were told to use is no longer needed, and two
things in your page are worth fixing while you are here.

Run `bb thread-page guide` for the full current contract. This file is only the
difference.

---

## 1. Your page's own files work now — on the reader's phone, not just yours

**What you were told in 1.0:** subresources "load normally", and `fetch()` of
your own files is refused.

**What was actually true:** a file beside `index.html` loaded on loopback and
was **refused on any authenticated origin**, including bb Connect, which is how
your reader opens the page on a phone. Your page rendered; its stylesheet and
data did not; nothing errored. If you built anything that reads a file beside
`index.html`, it has probably been silently empty for your reader this whole
time, and you could not have seen it from your own machine.

**What is true now:** the host resolves every relative reference when it serves
the document and rewrites it to a `data:` URL. Write the reference; it works on
every origin.

    <link rel="stylesheet" href="page.css">
    <script src="data.js"></script>
    <img src="figures/chart.png" alt="…">

`url()` inside a stylesheet you reference is followed too, so backgrounds and
`@font-face` survive.

### What to do about it

**If you inlined data into `index.html` because the guide told you to** — move
it back out. `<script src="data.js">` works, and it makes your entry document
small again, which makes it cheap to edit.

**If your page has a file beside it and shows zeroes** — that was this bug. It
should be right now; no change needed on your side.

## 2. You can publish new data without rewriting `index.html`

Changing a file beside `index.html` changes the served document, so an open page
reloads within about ten seconds. That is the whole live-data mechanism: write
`data.js`, the reader's page updates.

Two things to get right, both in the guide under *Keeping a page's data current*:

- **Make the write deterministic.** An unchanged data set must produce a
  byte-identical file. A generated timestamp in the payload turns every rebuild
  into a reload for every reader, and your page will look like it is flickering
  for no reason.
- **Call `setDirty(true)`** while the reader is mid-edit in state the host
  cannot see. Captured forms do this for you; your own widgets do not.

## 3. Your files now count against the document's size

Because they are carried inside the document:

| | |
| --- | --- |
| Entry document | 5 MiB, including everything it carries |
| Per file | 2 MiB |
| All files together | 3 MiB |
| Offline copy kept | only under 200 KiB total |
| base64 | adds a third to all of the above |

A file that is missing, too large or over the budget is **left exactly as you
wrote it** and named in the log — `bb plugin logs thread-pages`. Your page still
renders; that one reference does not resolve. Check the log once after you
publish; it is the only place this is reported.

If your page carries a large dataset and you care about it opening offline, keep
the document under 200 KiB. The host now warns in the log when it drops the
offline copy instead of dropping it silently.

## 4. `[hidden]` — fix this in your page by hand

A class rule that sets `display` outranks the user-agent rule for the `hidden`
attribute, so `<p class="banner" hidden>` rendered as an empty coloured bar. New
pages get the fix in their seeded stylesheet. **Your page carries its own copy of
the stylesheet and will not get it.** Add this to your `<style>`:

    [hidden] { display: none !important; }

If you have ever written `hidden` on an element and been confused by a stray
empty bar in a screenshot, this was why.

## 5. Delete the old seed comment from your page

The 1.0 seed's authoring comment spelled HTML tags out literally — `<main>`,
`<style>`, `<script src="app.js">`. They are comment text, not elements, but
every string operation you run on your own file sees them. A structural check on
a healthy page reports two `<main>` elements and one unclosed `<script>`, and
`indexOf("<main>")` finds the comment before the real element, so the obvious
splice starts in the wrong place.

**If that comment is still in your `index.html`, delete it or rewrite it without
angle brackets.** It is costing you every time you edit your page. The current
seed names no tags at all.

## 6. Edit your page by rewriting it, not by splicing

There is no page-editing command and there is not meant to be one: `index.html`
is a file in your storage directory that you read and write with your ordinary
tools. **Nothing in it is reserved** — not the stylesheet, not the header, not
the comment it came with. Rewrite the whole document. A splice computed from
string indices can silently eat content; a whole-document write cannot.

This got much cheaper in 1.1: with §1 fixed, your stylesheet can live in
`page.css` instead of taking up 27 KB of the file you are rewriting.

## 7. If your page should stay put, it must not carry a form

A page nobody should have to rewrite — a dashboard, a console — holds no
captured `<form>`, because a form messages your session and something then has
to rewrite the page. Its buttons should call `sessions.start` and `pages.open`
instead. The 1.0 seed shipped a reply form, which read as an endorsement of the
wrong default; the current seed says to delete it.

**A page may now also be build output** — a script generating it from
version-controlled source is legitimate. The rule that does not bend: the page
still has one owning session, and that session's agent builds it the first time.
A page with no agent behind it is a page nobody can be asked to change.

## 8. If you call a 0.3.x method, the error now tells you the new name

    Unknown capability: threads.spawn (renamed to sessions.start in 1.0; there is no alias)

The full table is in `docs/UPGRADING.md`. There are still no aliases; the old
name still fails.

## 9. Before you save, read it over the reader's real origin

The old checklist covered 320px, dark mode and reduced motion — all things you
can check locally. It missed the only axis where behaviour actually differs:
**authentication.** A local bb requires no credential and a remote one does.
Read your page once over bb Connect, not only loopback. That is what would have
caught §1 two days earlier.

## What is still not possible

Unchanged in 1.1, so do not spend time on them:

- `fetch("data.json")` of your own file from page script. Only references in the
  document are resolved. Use `<script src="data.js">` or inline it.
- Embedding another page or site in an `<iframe>` (`frame-src 'none'`).
- `window.open`, `window.prompt`, `alert`, `confirm`, top-level navigation.
- Reading a file from the project your session belongs to.
- Reading or writing another agent's page, and any registry that would let one
  page list itself on another. If two pages should look alike, read the other
  page and copy from it.
- `voice.captureAndTranscribe`.

## A five-minute pass over your page

1. `bb thread-page init` — confirm it still says EXISTING and prints no warning.
2. Add `[hidden] { display: none !important; }` to your `<style>` (§4).
3. Delete the old seed comment if it is still there (§5).
4. If you inlined data to work around §1, move it into a file beside the page.
5. If the page should stay put, remove any captured `<form>` (§7).
6. `bb plugin logs thread-pages` — check nothing of yours failed to resolve (§3).
7. Read it once over bb Connect, on a phone if you can (§9).
