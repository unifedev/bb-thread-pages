import type { Contributor } from "../domain/capabilities/contributed.ts";
import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { LIMITS, kibibytes, mebibytes } from "../domain/limits.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../domain/sandbox.ts";
import { ENTRY_FILE, UPLOAD_DIR } from "../pages/layout.ts";
import type { SiteStrategy } from "../pages/site.ts";

/**
 * The authoring guide, printed by `bb thread-page guide`. Assembled from
 * prose, the limits table and the capability registry at load, so every
 * number and every capability in it is the implementation's own. It carries
 * no example pages, page shapes or component snippets: code in it states a
 * mechanism and nothing more. spec R6.24–R6.27, DECISIONS D11
 */
export function buildGuide(registry: CapabilityRegistry, site: SiteStrategy, contributors: readonly Contributor[] = []): string {
  return [
    intro(),
    forms(),
    textAreas(),
    uploads(),
    ownFiles(site),
    documents(),
    parts(),
    keepingCurrent(),
    embedding(),
    runtimeApi(),
    voice(),
    capabilities(registry),
    contributed(contributors),
    startingSessions(),
    network(),
    browserAffordances(),
    otherSites(),
    composition(),
    home(),
    accessibility(),
    upgrading(),
    limits(),
    limitations(site),
  ].join("\n\n");
}

const intro = () => `# Thread Pages — authoring guide

A page is a complete HTML document you write and edit directly; saving
publishes it. Nothing is provided to fill in — no template, no stylesheet, no
components — so its structure, its look and its interactions are yours, and
the task decides them. It runs in a sandboxed frame on an opaque origin with
no host credentials, and talks to the host only through captured forms and
\`window.threadPage\`.

Your page root is your session's storage directory (\`$BB_THREAD_STORAGE\`):

    ${ENTRY_FILE}       the entry document — the page; \`init\` does not create it, you do
    <any files>      served beside it, nested directories included
    ${UPLOAD_DIR}/         files the reader attached, named by the host

Until ${ENTRY_FILE} exists, the page's link shows the reader that it has not been
written yet, and the page appears there as soon as you save it.`;

const forms = () => `## Forms

Every <form> in the document is captured and delivered to your session as a
message — no JavaScript needed. Add data-thread-page-manual to a form your
own script owns; the host then leaves it entirely alone.

- Nothing is required and blank is a real answer: native validation is
  suppressed, and a blank field arrives as "(left blank)".
- Answer names come from, in order: data-label on the control, the enclosing
  fieldset's legend, aria-label, the wrapping label's text, a <label for>,
  the field name. Hints (<small>), options and nested controls are excluded.
- Groups collapse: one checkbox is Yes/No; several checkboxes with one name
  are a list of the checked values; radios are the one checked value or
  blank; a multiple <select> is a list.
- The submit button's value leads the message as **Action**.
- Each form has its own pending, dirty and status state. While a submission
  is in flight its controls are disabled; afterwards the status line says
  "Sent (queued)" or why it failed.
- Typing into a captured form marks the page dirty, so a new version of the
  page is not shown under the reader: they are offered it instead. Custom state
  the host cannot see: window.threadPage.setDirty(true|false).

### Controls anywhere on the page

A control does not have to sit inside its form. Give the form an id and the
control \`form="that-id"\`, and it belongs to that form wherever it is in the
document: its answer is delivered with the form, typing into it marks the page
dirty, and it is disabled while the form sends. A question can therefore sit
beside the thing it asks about and still arrive in one answer. Its name
follows the rules above, looked up around the control itself. The form's
status line appears inside the form element, so put that element where the
reader expects to send from.

Always include one empty text field for anything else: the reader may want
something none of your options cover.

The message you receive looks like:

    The user answered the form on your Thread Page — <form's data-title or the h1>.

    **Action**
    Approve

    **Which approach**
    second

    **Anything else**
    (left blank)

### The dialog trap

A <form method="dialog"> inside a <dialog> is a form, so it is captured too.
If you write one as a purely local confirm and forget the opt-out attribute,
pressing its button **sends a real message you did not intend**, and because
its buttons carry control-flow values, you receive a plausible fabricated
decision:

    The user answered the form on your Thread Page — <the page's heading>.

    **Action**
    confirm

Nothing marks it as accidental, and if a turn is running it arrives on the
next one, detached from what caused it. Put data-thread-page-manual on every
dialog form that is not meant to answer you.`;

const textAreas = () => `### Every text area takes voice and files

Each <textarea> you write shows one small row inside its bottom-right corner,
drawn by the host in the field's own text colour: the files attached to it,
then **Dictate** (a microphone) and **Attach files** (a paperclip). The row
lives in a layer of the host's outside your document tree — your CSS does not
reach it, the field's markup, attributes and style are untouched, nothing
moves, nothing is drawn below the field, and it scrolls with the field (inside
a scrolling element of yours it hides while that element scrolls) — and its
buttons are reached by Tab right after the field. In right-to-left text the row
sits at the bottom-left. Dictate records the
reader in the host's recording bar at once and inserts the host's transcript at
the caret, then fires \`input\` and \`change\`. Attach — or pasting or dropping
files onto the field — adds a chip per file to the row (the name shortened in
the middle, each removable; what does not fit is behind a "+N" that lists it).
The files are uploaded with the form, and the answer reports their paths beside
that field's text, under **Attached here:** (an audio file with its
transcript), within the form's limits (${mebibytes(LIMITS.uploadFileBytes)} per file, ${LIMITS.uploadsPerForm} per form, file
inputs included). The row covers the field's last line where it runs that far,
as a resize handle does. A text area outside any form, on the built-in home
page or inside another page's embed gets Dictate only; a disabled, read-only,
hidden or modal-dialog one gets neither, and a field loses them while its form
sends; Dictate is absent where the reader cannot record (see *Voice*). Put
\`data-thread-page-manual\` on a <textarea> to give it no controls — its answer is
still sent with its form — or on the form to leave the whole form alone. Do
that for an editor built on a hidden-looking <textarea> (some code editors keep
a small one at the caret) and when you build your own voice button. A text area
inside your own shadow DOM gets no controls, \`form.reset()\` does not clear the
attached files, and a paste or drop your own handler already took
(\`preventDefault\`) attaches nothing.`;

const uploads = () => `## Files the reader sends you

A captured form may contain <input type="file"> (multiple is fine). On submit
the files are uploaded first, then the submission is delivered naming them:

    **Attached files**
    - \`$BB_THREAD_STORAGE/${UPLOAD_DIR}/20260908-161200-3f9a1c-report.pdf\` (…, 48213 bytes)

Read them from there with your normal tools. Limits: ${mebibytes(LIMITS.uploadFileBytes)} per file,
${LIMITS.uploadsPerForm} files per form, counting the form's file inputs and the files attached to its text
areas together; a form over either is not sent, and its status line tells the
reader which file to remove. Names are generated by the host; the reader's
filename is only a suffix. An upload that fails shows in the form's status line
and no submission claims the missing file.

**A recorded answer.** \`<input type="file" accept="audio/*" capture>\` in a
captured form is answered by the reader's voice, with no code: on a phone
(a coarse pointer) the browser's own recorder answers it; elsewhere a click on
it opens the host's recording bar (up to ${LIMITS.voiceDefaultSeconds} s), and the recording becomes
the input's file. Where voice is not available — see *Voice* — it stays a plain
file picker. On submit the recording is uploaded like any file and transcribed
by the host, and the transcript arrives beside its path:

    - \`$BB_THREAD_STORAGE/${UPLOAD_DIR}/20260925-101500-1a2b3c-recording.webm\` (…, 38114 bytes)
      Transcript: Go with the second option, but keep the old export.

If it cannot be transcribed the file still arrives, and the line says
\`Transcript missing: …\`: listen to the file. Only this input's files and audio
attached to a text area are transcribed; audio chosen in any other file input
arrives as it is, with no transcript.`;

const ownFiles = (site: SiteStrategy) => `## Files you show the reader

Put them beside ${ENTRY_FILE} and reference them relatively — nested paths,
spaces and punctuation in names are all fine:

    <link rel="stylesheet" href="style.css">
    <script src="app.js"></script>
    <img src="figures/chart.png" alt="…">

No permission, no declaration, no API: writing a file into your page root is
enough. Keep everything inside your own page root; another agent's page is
not yours to write.

**How this actually works, because it constrains what you can do.** Your page
runs in a sandbox on an opaque origin, and a request it makes for itself
carries no credential. A bb on loopback asks for none and the file arrives; a
bb reached over an authenticated origin — which is how the reader opens the
page on a phone — refuses it. So the host resolves your relative references
**when it serves the document**: each one is read from your page root and
rewritten to a \`data:\` URL before the reader's browser ever sees it. The
consequences worth knowing:

- It works the same on every origin. Write the reference; do not work around it.
- Your files are **inside the document**, so they count against the ${mebibytes(LIMITS.entryDocumentBytes)}
  entry limit, and a page over ${kibibytes(LIMITS.offlineCopyBytes)} keeps no offline copy. Per file at
  most ${mebibytes(LIMITS.inlineFileBytes)}, ${mebibytes(LIMITS.inlineTotalBytes)} across the page; base64 adds a third to both.
- A file that is missing, too large or over the budget is **left as you wrote
  it** and named in the plugin log (\`bb plugin logs thread-pages\`) and in
  \`bb thread-page status\`. The page still renders; that one reference does not
  resolve. Media is the exception — see *Large video, audio and images* below.
- \`url()\` inside a stylesheet you reference is followed too, so backgrounds
  and \`@font-face\` survive. Absolute and remote URLs are never touched.
- Changing a file beside ${ENTRY_FILE} changes the document, so an open page
  refreshes — see *Keeping a page current*. You do not have to touch
  ${ENTRY_FILE} to publish new data.
${
  site.name === "core-storage"
    ? `
**One limitation left on this host:** \`fetch("data.json")\` of your own file
from page script is refused (403) — the host's file route rejects the
sandbox's \`Origin: null\`, and only subresource references are resolved for
you. Load data with <script src="data.js"> or inline it in the document.
Remote fetches work (see Network).`
    : `
Page script may also fetch its own files as data: \`await fetch("data.json")\`.`
}

**Large video, audio and images.** A \`<video>\`, \`<audio>\`, \`<source>\`,
\`<img>\` or \`<track>\` \`src\`, or a \`poster\`, naming one of your files that is too
large to carry is fetched for the reader instead: the top bar fetches it from
the host with the reader's credential and hands your page the bytes as a
\`blob:\` URL. Plain markup is enough — \`<video src="clip.mp4" controls>\` of a
file up to ${mebibytes(LIMITS.shellFetchBytes)} (${mebibytes(LIMITS.shellFetchImageBytes)} for an image, the host's own read limits) plays and
seeks on every origin, a phone over the host's remote address included. What
to know:

- Until the bytes arrive the element has no \`src\` (the served document holds
  \`data-thread-page-src="clip.mp4"\` in its place), so script that reads
  \`video.src\` at load sees nothing; wait for \`loadedmetadata\`. A file that
  cannot come gets \`data-thread-page-unavailable\` with the reason.
- The whole file is fetched before it plays: prefer a video of a few MiB, and
  compress before you publish. A larger file cannot reach the reader at all —
  put it at a public URL and reference that.
- Only those elements. A large stylesheet, script, font, \`srcset\` candidate or
  CSS \`url()\` is not fetched this way; keep them within the carrying limits.
- Not inside another page's embed: there the element says why, and the reader
  can open the page itself.
- \`bb thread-page status\` lists each such file as *fetched by the shell*.

**Linking to your own files.** A link to one of your files that is not a
document of the page is carried out by the top bar, from the host's own
address, with the reader's credential:

- \`<a href="report.pdf">\` (any \`target\`) opens the file in a **new tab**; your
  page stays. Images, video, audio, PDF, text, CSV, JSON and HTML open;
  **an SVG, XML or any other type is downloaded instead**, because a tab on the
  host's address must not run a file's script.
- \`<a href="clip.mp4" download="Our clip.mp4">\` **downloads** it under that
  name (the file's own name when the attribute is empty).
- A link to another \`.html\` document of the page opens it in the page (see
  *Several documents*); with \`download\` it is downloaded.
- A relative link that climbs out of your page root does nothing.
- If the browser gives no tab and the reader is still on your page, the top
  bar asks — *Open “file” in a new tab?* — and opens it from that click.
- **Safari does not play a video opened in its own tab** over the host's
  remote address (Mac and iPhone): its player needs byte-range responses, which
  bb does not serve yet (bb #4339), and over bb Connect the size is not sent
  either. Show a video in the page with \`<video src="clip.mp4" controls>\`,
  where it plays and has its own full-screen control; offer the file with
  \`download\` rather than as a tab.`;

const keepingCurrent = () => `## Keeping a page current

Saving is publishing, and an open page follows. The shell re-checks your
document with one conditional request — every **${LIMITS.shellPollWorkingMs / 1000} s while your session is
working, and for ${LIMITS.shellPollAfterAnswerMs / 1000} s after the reader answers from the page**; every ${LIMITS.shellPollMs / 1000} s
otherwise; never while the tab is hidden. When the document changed it is
**swapped in place**: the new one loads behind the one on screen and takes its
place when it is ready. The top bar stays, nothing flashes, the address and the
history are untouched, and the reader's scroll position is kept. So a reader
who answers and watches sees your rewritten page about ${LIMITS.shellPollWorkingMs / 1000} s after you save it.

**Your page needs no code for any of this, and must not build its own.** There
is no reload call in the API. Do not poll for your own revision, do not
\`location.reload()\` (inside the frame it reloads the document without its
connection to the host), and do not hop between twin documents to force a
refresh — each of those is slower, costs the page's call budget, or litters the
reader's history.

The entry document is the only artifact guaranteed to reach every reader, on
every origin. Rewriting it — or any file or part it carries — is therefore how
you push new data to an open page: a page that follows a data source is a page
something rewrites, and while your session works the reader sees each rewrite
within seconds.

Three things to get right:

- **Make the build deterministic.** An unchanged data set must produce a
  byte-identical document. This is the non-obvious half: a generated timestamp
  in the payload turns every rebuild into a refresh for every reader.
- **The dirty flag is what protects the reader.** While the page is dirty a new
  version is *offered* in the top bar ("Page changed — reload when ready")
  rather than shown. A captured form sets it when the reader types; for state
  the host cannot see, call \`setDirty(true)\` — and \`setDirty(false)\` when
  it is safe again, or the reader stops getting your updates.
- **A refresh starts the document fresh.** Script state does not survive it.
  Keep what must survive in \`storage\`, or in the document you write.

\`window.threadPage.watch\` is the other half, for live host state — sessions,
activity — that does not live in your file. Use the document rewrite for data
you generate, and \`watch\` for data the host owns.`;

const parts = () => `## A document made of parts

A document can be assembled from several files when it is served, so a page
made of pieces needs no build step: adding a piece is writing one file.

    <main>
      <link rel="thread-page-include" href="_cards/*.html">
    </main>

The \`<link>\` is replaced, in place, by the text of the file it names — or, with
a \`*\`, of every matching file in **name order** (plain character order: number
them \`01-…\`, \`02-…\`; \`10\` sorts before \`2\`). \`*\` matches within the last path
segment only (at most 4 per pattern), and never a name starting with a dot. A
pattern that matches nothing leaves nothing.

- **A part is a file with a path segment starting with \`_\`** — \`_cards/a.html\`,
  \`slides/_intro.html\`, \`_footer.html\`. Only a part can be included, and a
  part is **never a document of the page**: no link or address opens it. Every
  other \`.html\` file is a document (above) and cannot be included.
- Replacement is textual. The reader's browser parses the assembled document
  once, as if you had written one file, so a part may hold table rows, a
  \`<script>\`, a \`<style>\`, or half of a list. A part is a fragment: no doctype,
  no \`<html>\`, no \`<head>\`.
- A part's relative \`src\`, \`href\`, \`poster\` and \`srcset\` resolve **from the
  part's own directory**, and those files are carried into the document like
  any other. URLs a script builds at run time resolve from the document.
- A part may include parts, ${LIMITS.includeDepth} levels deep. At most ${LIMITS.includeParts} parts and ${LIMITS.includeElements} include
  elements per document, each part at most ${mebibytes(LIMITS.includePartBytes)}, and the assembled document
  stays within the ${mebibytes(LIMITS.entryDocumentBytes)} entry limit.
- Paths stay inside your page root: \`..\`, absolute paths and symbolic links are
  refused, as for every file of the page.
- The revision covers the assembled document. Change, add or delete a part and
  an open reader gets the new document — you never touch ${ENTRY_FILE}.
- An include that cannot be honoured — missing, not a part, outside the root,
  over a limit — is **left as you wrote it**, and the document is still served.
  \`bb thread-page status\` lists each one with its reason, and so does the
  plugin log.

Parts are one document once assembled: ids, form names and script globals share
one namespace. Give each part what it needs to stand beside the others.`;

const embedding = () => `## Showing another session's page

A page can show another session's page inside it, live, and let the reader
answer **that page's agent** from there. One call:

    const stop = window.threadPage.embed(target, { sessionId, path, onState })

\`target\` is an \`<iframe>\` you placed, or any container element — the host puts
a frame filling it. \`sessionId\` is the session whose page to show; \`path\` is a
document of that page (default its entry document). Call \`stop()\` to remove it.
Size and position the frame or its container as you like; the host supplies no
chrome around it.

What the host does for you, with no further code:

- loads the document exactly as the host serves it at its own address, into a
  frame that is **always** sandboxed exactly as your page is —
  \`sandbox="${PAGE_SANDBOX}"\`
  \`allow="${PAGE_FRAME_ALLOW}"\` — whatever you set, on an origin of its own: it cannot
  reach your page, and you cannot reach into it;
- keeps it fresh: every ${LIMITS.embedPollWorkingMs / 1000} s while an embedded session is working or was
  answered through its embed in the last ${LIMITS.embedPollAfterAnswerMs / 1000} s, every ${LIMITS.embedPollMs / 1000} s otherwise, never
  while the tab is hidden. **All the embeds of a page are checked in one call
  per tick** (up to ${LIMITS.pagesReadEntries} per call, more take turns), so twelve embeds cost your
  call budget what one does. At most ${LIMITS.embedsPerPage} embeds on a page;
- refreshes an embed without touching your page, and keeps its scroll position;
- never refreshes it under a reader who is typing in it: the new version is
  offered inside the embed, and your page counts as dirty meanwhile, so your own
  refresh waits too;
- follows its links: one to another document of that page opens in the embed,
  an \`https:\` link goes through the usual confirmation;
- shows a short line of its own when there is nothing to show — no such
  session, archived, no page yet, too large, unreachable — and keeps checking.

**Answers go to the session that owns the embedded page, never to yours.** Its
forms and \`session.reply\` behave, validate and are worded exactly as on its own
address, so that agent cannot tell the answer came through your page. The
**first** time the reader answers a given session from inside your page, the
host asks them once, in the top bar's own dialog: *Let ‘your page’ send your
answers to ‘that session’?* It is remembered; the reader can revoke it from
the top bar. Declined, the answer is not sent and the form says so. You cannot
word, skip or pre-approve it, and there is nothing to handle. A document of
your own page embedded in your page needs no grant.

Inside an embed the page is itself, with less reach: \`context.get\` describes
*its* session; \`pages.open\`, \`sessions.openHost\`, \`navigation.openExternal\`,
\`sessions.snapshot\`, \`projects.list\` and \`providers.list\` work; everything else
— \`storage.get\`/\`storage.set\`, \`session.activity\`, \`sessions.send\`/\`start\`/
\`stop\`/\`archive\`/\`markRead\`, \`projects.browse\`/\`create\`,
\`voice.captureAndTranscribe\`, contributed capabilities —
rejects with \`unavailable\` (a text area there still offers Dictate, recorded
by your page's top bar, but no Attach), and it may make ${LIMITS.embedCallsPerMinute} calls a minute,
answers and followed links included. \`pages.open\` and \`sessions.openHost\` work
from inside an embed only on the reader's click, so a page cannot take the
reader away by itself when it is shown somewhere.
**A form with a file attached is not sent from inside an embed**; its status
line tells the reader to open the page itself. Likewise a link to one of the
embedded page's own non-document files does nothing there, and its large media
does not load (the element says why). **Embedding is one level deep:**
\`embed\` called inside an embedded page shows a line saying so and loads nothing.
So write your own page to degrade when \`storage\` answers \`unavailable\`: it may
be shown inside someone else's.

\`onState\`, if you pass it, is called with
\`{ status, sessionId, path, title, revision, working, updateAvailable }\` when any
of them changes — \`status\` is \`loading\`, \`shown\`, \`not_found\`, \`no_page\`,
\`too_large\`, \`unavailable\` or \`nested\`; \`title\` and \`working\` are the owning
session's. Use it to draw your own frame around an embed: a title, a working
dot, a link made with \`pages.open\`. Without it, pass nothing.

Feature-check on a page that may be read on an older host:
\`typeof window.threadPage.embed === "function"\`.

Underneath are two capabilities you rarely call yourself. \`pages.read\` returns
other sessions' page documents (a whole document is agent output you can read
and send anywhere — quote or summarise another page with it, parsing \`html\`
with \`DOMParser\`). \`pages.answer\` delivers an embed's answer and only that: it
takes the token a read returned, never a session id or a prompt. To *say*
something to another session in your own words, use \`sessions.send\`, which the
reader confirms each time.

To show another **site**, write an \`<iframe src="https://…">\` — see *Other
sites in a frame*. \`embed\` is for pages of this host, which a frame by URL
cannot show.
Link to it.`;

const runtimeApi = () => `## window.threadPage

The complete page-facing API; it is frozen and cannot be replaced.

    window.threadPage.version               // 1
    await window.threadPage.invoke(method, params)
    const stop = window.threadPage.watch(method, params, (value, error) => {…}, { intervalMs })
    window.threadPage.setDirty(true | false)
    const stopEmbed = window.threadPage.embed(target, { sessionId, path, onState })
    window.threadPage.setScope("clients/vela/q3-board")   // or null; returns the scope sent
    window.threadPage.scope                 // the scope set, or null

- \`invoke\` resolves with the capability's result and rejects with an Error
  whose \`code\` is one of: invalid_json, invalid_request, invalid_params,
  invalid_response, request_too_large, response_too_large,
  unsupported_version, unknown_method, stale_page, confirmation_required,
  confirmation_invalid, cancelled, not_found, conflict, unavailable,
  rate_limited, handler_error, invalid_result. Calls made before the page is
  connected are queued, never lost.
- \`watch\` polls a read capability: default every ${LIMITS.watchDefaultMs / 1000} s, clamped to
  ${LIMITS.watchMinMs / 1000} s–${LIMITS.watchMaxMs / 60_000} min, paused while the tab is hidden. Errors go to the
  listener's second argument. Call the returned function to stop; a page that
  never calls watch causes no polling.
- \`embed\` shows another session's page — see *Showing another session's page*.
- \`setScope\` scopes the document's later calls to a folder inside your
  session's folder — see *Capabilities from other plugins*.
- \`stale_page\` means the page changed under the call: the shell shows the new
  version, or offers it while the page is dirty. \`cancelled\` means the reader declined a confirmation — a normal
  outcome every page calling a confirmed capability must handle, not an error.

Check what is enabled rather than assume: \`(await invoke("context.get")).capabilities\`.`;

const voice = () => `## Voice

\`voice.captureAndTranscribe\` records the reader and returns the host's
transcript, so a page can have a "speak to the agent" button and no field at
all; what the text does next — \`session.reply\`, filling something, matching a
command — is yours. Text areas and the audio capture input use the same
recorder with no code (above).

    button.onclick = async () => {
      try { const { text } = await window.threadPage.invoke("voice.captureAndTranscribe", { prompt: context }); use(text); }
      catch (e) { if (e.code !== "cancelled") say(e.message); }
    };

- Only the host records, never your page: its recording bar — the host's own
  chrome, floating at the bottom centre of the page area, where your page
  cannot draw — shows a live waveform, Cancel and Done, and **it is the
  confirmation**: there is no dialog, and nothing leaves the reader's device
  until they press Done. Escape cancels it, in your page too. The
  recording goes only to the host's transcriber; your page gets the text, and
  the recording as a \`Blob\` only with \`keepAudio: true\`.
- The bar opens **only from the reader's action** in your page — call it from a
  click or key handler, never on load or from a timer — and one at a time: a
  call without the action, or while another bar or confirmation is open, is
  \`unavailable\`. A press in the host's own chrome (the top bar, a dialog, the
  bar's Cancel or Done) is not the reader acting in your page: for about 5 s
  after one, and 2 s after a bar or dialog closes, a call from your page opens
  the bar **armed** — the microphone stays off until the reader presses Record
  in it. A page that re-asks after \`cancelled\` therefore only puts an armed
  bar back in front of the reader. Don't. (A text area's own Dictate records
  at once when the reader presses it where it is plainly visible — not under
  anything of yours in the top layer, on a document you have not faded or
  filtered away.)
- \`cancelled\`: Cancel, Escape, or Done before ${LIMITS.voiceMinMs / 1000} s (the bar says *Too short*).
  \`request_too_large\`: over the host's size limit. \`unavailable\`, with the
  reason: no transcription service on this host, a browser or app that cannot
  record here (the bb desktop app's in-app browser tab cannot; a browser, on a
  phone too, can), the microphone refused (voice then stays off until the page
  is reloaded), or a transcription that failed.
- Length: \`maxDurationSeconds\` from 1 to ${LIMITS.voiceMaxSeconds}, default ${LIMITS.voiceDefaultSeconds} (Dictate and the audio
  input use ${LIMITS.voiceDefaultSeconds}); at the cap recording stops and the bar waits for Done.
  \`prompt\` — context such as names, terms, what came before — at most
  ${LIMITS.voicePromptChars} characters; \`language\` a tag such as \`de\`, a hint.
- The host's own limits, on bb: 20 MB of audio with its default transcription
  service (5 MB before bb a67f21bab), 25 MB with OpenAI; each attempt 10 s,
  2 attempts. There is no
  streaming: the text comes once, after Done. A long recording is slow to
  transcribe and may time out — prefer short turns.
- \`context.get\` lists the method wherever the host implements it, even when
  voice cannot work for this reader; the call then says why. Inside another
  page's embed it is not available (Dictate in a text area still is).`;

/**
 * Capabilities other plugins contribute: how they behave, and what is
 * registered right now, generated from the declarations so it cannot
 * contradict them. spec R6.28, R6.29, DECISIONS D18–D24, D27
 */
export function contributed(contributors: readonly Contributor[]): string {
  const perMinute = (seconds: number) => Math.round((60 / seconds) * 10) / 10;
  const registered =
    contributors.length === 0
      ? "None is registered on this host now."
      : contributors
          .map((contributor) => {
            const methods = contributor.methods.map((spec) => {
              const reasons = [...(spec.reasons?.keys() ?? [])];
              return `- \`${spec.method}\` — ${spec.effect}. ${spec.description} Request up to ${kibibytes(spec.maxRequestBytes)}, response up to ${kibibytes(spec.maxResponseBytes)}.${reasons.length ? ` Reasons: ${reasons.join(", ")}.` : ""}`;
            });
            return [`### ${contributor.id} ${contributor.version}`, "", ...(methods.length ? methods : ["- (no methods)"]), ...(contributor.guide ? ["", contributor.guide] : [])].join("\n");
          })
          .join("\n\n");
  return `## Capabilities from other plugins

Other plugins installed on this host may add capabilities to your page. Each
lives in a namespace named after its plugin — \`syns.read\`, say — and means
what that plugin says it means; Thread Pages only checks and delivers the call.
The plugin's own section below, and its instruction, explain its methods.

**Check, do not assume.** Call \`context.get\` when the page loads. A contributed
method appears in \`capabilities\` with \`contributor: { id, version }\`, a
\`description\`, its \`reasons\` and \`maxRequestBytes\`/\`maxResponseBytes\`. A method
that is not there answers unknown_method.

**When a method you need is missing,** keep the rest of the page working and
tell the reader, in your own words, what is missing and what would supply it —
usually installing or enabling the plugin its namespace names. Never show
invented or example data in its place.

**No dialog.** These calls run the moment you make them, writes included; the
plugin answers for what it does. If a write is something the reader would not
expect from the control they touched, make that plain on the page first.

**Your session is passed for you.** The plugin learns which session's page is
calling from the host; a session id in your parameters chooses nothing. From
the built-in home page there is no session.

**Scoped to a folder.** A document may say which folder inside your session's
folder its calls are about: \`threadPage.setScope("clients/vela/q3-board")\`.
Every \`invoke\` made after it, and every \`watch\` started after it, carries
that folder, and the plugin answers for it as if the session worked there; a
plugin that takes no folder answers as before, for the session's own folder,
so check what its section says. \`setScope(null)\` returns to the session's
folder. The folder is relative, \`/\`-separated, at most ${LIMITS.scopeChars} characters and
${LIMITS.scopeSegments} folders deep; one that is absolute, has \`~\` as its first folder, or has a
\`..\`, \`.\` or empty part throws a TypeError, and the host refuses it again
with invalid_params. Built-in capabilities ignore it, except \`storage\`: a
scoped document's \`storage.get\`/\`storage.set\` keys are its folder's own, apart
from the unscoped page's and every other folder's, so one tool keeps each
folder's drafts and settings separate. Set it before the first call
— an app the document goes on to load then works in its folder unchanged —
and take the folder from the document's address, so one document serves any
folder (see *Several documents in one page*):

    try {
      threadPage.setScope(decodeURIComponent(location.hash.slice(1)) || null);
    } catch (error) {
      // A fragment that is not a folder: say so on the page instead of loading anything.
    }

To load an app's own markup into that document, keep its head (the host's
runtime and \`<base>\` live there), append the app's head, replace the body
and re-create its scripts; never \`document.open\` or \`document.write\`, which
remove the runtime's listeners, so links would leave the page and forms would
not be captured.

**Failures.** The rejected Error carries \`code\` as usual, and may carry
\`reason\` — a word the method declares, such as \`no_repo\` — and \`detail\`,
data for that reason, such as the current version on a conflict. Branch on
\`reason\` when you know the plugin, on \`code\` when any will do: conflict —
what you based a write on has moved, so read again; unavailable — the method
exists but cannot serve this page now (not answering, over ${LIMITS.contributedCallMs / 1000} s, or nothing this
session can reach); unknown_method — no installed plugin provides it.

**Sizes.** Each method's bounds are in the roster: ${kibibytes(LIMITS.capabilityPayloadBytes)} unless the plugin
declares more, never more than ${mebibytes(LIMITS.contributedPayloadMaxBytes)}. Larger data comes in parts through
the method's own offset and limit, or cursor. A response is never cut short;
it fails with response_too_large.

**The budget is shared.** Every call, built-in or contributed, counts against
${LIMITS.ratePerMinute} a minute and ${LIMITS.rateConcurrent} at once. One watch at the default ${LIMITS.watchDefaultMs / 1000} s costs ${perMinute(LIMITS.watchDefaultMs / 1000)} calls a
minute; at the ${LIMITS.watchMinMs / 1000} s floor, ${perMinute(LIMITS.watchMinMs / 1000)}. Reading 300 items one call each costs 300 —
more than two minutes of budget. Load many items with the plugin's batched read
when it has one, and poll one small thing, such as a version.

**Changes arrive by polling.** \`watch\` a contributed read method and read more
only when it changes. There is no push. \`watch\` refuses a method that writes.

### Registered now

${registered}`;
}

function capabilities(registry: CapabilityRegistry): string {
  const rows = registry.list().map((spec) => {
    const status = !spec.implemented
      ? "not implemented on this host: unknown_method"
      : spec.effect === "granted-write"
        ? "asked once per pair in trusted chrome, then remembered"
        : spec.confirmed
          ? "confirmed in trusted chrome"
          : "no confirmation";
    const lines = [`### \`${spec.method}\` — ${spec.effect} · ${status}`, "", spec.description, "", `Parameters: ${spec.doc.params}`, "", `Result: ${spec.doc.result}`];
    if (spec.doc.notes) lines.push("", spec.doc.notes);
    return lines.join("\n");
  });
  return `## Capabilities

Every way a page can affect anything outside itself. Effects: read;
own-session-write; cross-session-write, destructive and device (always
confirmed); navigation (confirmed when it leaves this host); granted-write
(\`pages.answer\` only: the reader is asked once per pair of pages, not per
call). A confirmed capability shows a dialog in trusted chrome with the host's own wording; you
do not build it and cannot word it. Every capability validates its
parameters exactly — unknown keys are refused — and returns only the fields
listed here.

${rows.join("\n\n")}`;
}

const startingSessions = () => `## Starting work from a page

\`sessions.start\` is how a page that should stay put comes to exist: its
buttons start fresh sessions instead of messaging you, so nothing asks you to
rewrite it. It succeeds with only a project and a prompt:

    await window.threadPage.invoke("sessions.start", {
      projectId, prompt: "Run the test suite. Report failures only; change nothing."
    });

What you get when you say nothing, and how to say otherwise:

- environment: the project's default. Otherwise \`environment: { sameAs: sessionId }\`
  runs in the same environment as that session.
- provider, model, reasoningLevel: the project's defaults. Otherwise name ids
  from \`providers.list\`.
- title: the host's own. Otherwise \`title\`.
- The session is a visible root owned by the reader, never a child of yours.

The confirmation names the project and the prompt. Handle \`cancelled\`:

    try { await invoke("sessions.start", {…}); say("Started."); }
    catch (e) { say(e.code === "cancelled" ? "Nothing started." : e.message); }

\`sessions.send\` steers an existing session the same way; it refuses your own
session — use \`session.reply\` for that.

**With files.** Both take \`files\`: a \`FileList\`, an array of \`File\`, or the
\`<input type="file">\` itself — for example a screenshot the reader picked:

    await invoke("sessions.start", { projectId, prompt: "What is wrong here?", files: picker });

The confirmation names every file with its size, nothing is uploaded until the
reader confirms, and each file becomes a native attachment of the prompt in the
target project (the start's \`projectId\`, or the project of the session a send
goes to), so the model sees an image as an image, exactly as when the reader
attaches it in bb. At most ${LIMITS.promptFiles} files of ${mebibytes(LIMITS.promptFileBytes)} each, else \`request_too_large\` before
any dialog; bb itself attaches images of at most 10 MB and no HEIC or HEIF
images, which are refused before the dialog too (\`request_too_large\`,
\`invalid_params\`). If an upload fails nothing is started or sent and the call rejects
naming the file (\`request_too_large\` when the host refused it for its size,
\`handler_error\` otherwise). A host that cannot attach files answers
\`unavailable\` rather than starting without them. This works from the built-in
home page too; files for your own session go through a form instead.`;

const network = () => `## Network, other services and servers

Pages have internet access: fetch any origin, load remote fonts, scripts,
stylesheets, images and media, open WebSockets. The page still holds no host
credential — reaching a URL and acting as the host are different things.

**What your page is, to another server.** Its origin is \`null\`. Every request
it makes carries \`Origin: null\` and no cookie of any kind — not the host's, and
not the reader's session with any other service. The sandbox gives it no
storage of its own either: \`document.cookie\`, \`localStorage\`,
\`sessionStorage\` and IndexedDB throw. Keep what must survive a reload with
\`storage.set\` (${kibibytes(LIMITS.storageValueBytes)} per key).

**Acting on another service as the reader.** Authenticate with a token in a
request header — an API key or personal token the reader gives the page, kept
with \`storage.set\`. That works whenever the service answers a cross-origin
request from \`Origin: null\`, and many APIs do; an unauthenticated call that
comes back as a readable 401 tells you the origin is accepted. Two things do
not work, and the host offers no mechanism for either, by design: a sign-in
flow that sends the reader to a login page and back (your page's own popups
stay sandboxed, its origin is \`null\` so the flow has nowhere to return to, it
has no top-level navigation, and login pages refuse to load in a frame), and an SDK
that checks a registered JavaScript origin, because \`null\` cannot be
registered.

**A server of your own.** Page script runs in the reader's browser, so where
the reader is decides what it can reach:

- a server on the reader's machine at a loopback address, such as
  \`http://127.0.0.1:8000\`, when the page is read on that machine — also through
  the host's remote address (a browser may ask the reader's permission first);
- any public URL, from any device — for a phone, give your server a public
  address and its own token;
- **not** anything behind the host's own authentication: its API, its file
  route, or a port it shares for you. Those need a cookie the page cannot send.

A server your page calls must answer CORS for \`Origin: null\`, preflights
included, and check its own token.

Two more consequences to know: script can reach whatever the reader's device
can reach, including its own network, and it can navigate its own frame with
data in the URL. Both are accepted, documented properties of the model, not
bugs to work around.`;

const browserAffordances = () => `## Links, windows, downloads and full screen

On the reader's click:

- **Links.** Any \`<a href="https://…">\` works, whatever its \`target\`: the host
  intercepts the click and routes it through \`navigation.openExternal\`, which
  **asks the reader** in the top bar's dialog — *Open “label” (https://site) in
  a new tab?* — and then opens the site in a **new tab** as itself, signed in
  as the reader is. Your page is never replaced. Call
  \`navigation.openExternal\` yourself from script for the same thing.
- **This host's own addresses are not "another site".**
  \`navigation.openExternal\` refuses them — any URL on the host's origin, and
  any \`getbb.app\` address — with \`invalid_params\`, before any dialog, and so
  does a link to one. Open another page with \`pages.open\` and a session with
  \`sessions.openHost\`; link your own files relatively.
- **\`window.open(url)\`** from a click handler opens a window, with no dialog —
  but that window **stays sandboxed**: the site in it has no cookies and no
  storage, as in a frame. Fine for a plain page or a document you built;
  use a link or \`navigation.openExternal\` for a site the reader must use as
  themselves. Without a click the browser blocks it, as it would anywhere.
- **\`mailto:\` and \`tel:\`** links hand off to the reader's mail and phone apps.
- **Downloads.** A file your page builds downloads the usual way: make a
  \`Blob\`, point an \`<a download="name.csv">\` at \`URL.createObjectURL(blob)\`, click
  it. Your own files: see *Linking to your own files*.
- **Full screen.** \`element.requestFullscreen()\` from a click works, in your page
  and inside an embed; Escape leaves. On an iPhone only a \`<video>\` goes full
  screen, through its own control.

What still does nothing, silently — never rely on it:

- \`window.prompt\`, \`alert\`, \`confirm\` — build the input or the question into
  the page, or use a confirmed capability, which renders its own dialog. A
  <dialog> you script yourself needs data-thread-page-manual on its form.
- top-level navigation — your page cannot replace the top bar. \`pages.open\`
  and \`sessions.openHost\` navigate the reader's view in place through trusted
  chrome; the back button returns.

Same-document fragments (#section) work natively. The trust boundary is not
configurable: no setting widens the sandbox.`;

const otherSites = () => `## Other sites in a frame

\`<iframe src="https://…">\` works. The frame inherits your page's sandbox, so
the site inside it runs with **no cookies and no storage**: it is never signed
in, and anything that needs \`localStorage\` or a cookie to start fails.

- **Works:** maps (the OpenStreetMap and Google Maps embeds), the Spotify embed,
  Wikipedia, plain informational sites.
- **Breaks:** video players and apps — Vimeo shows its poster at most, Figma is
  blank, YouTube very likely fails. Link to them instead.
- **Refuses any frame:** sites that send \`X-Frame-Options\` or
  \`frame-ancestors\` — CodePen, most sign-in pages, many apps. Link to them.
- Add \`allow="fullscreen"\` to the \`<iframe>\` if the site has a full-screen
  button.
- Only \`https:\` (plus \`blob:\` and \`data:\` documents you build). A page of **this
  host** is refused by URL — show it with \`threadPage.embed\`.

Nothing in your page can read into the frame, and nothing in it can reach
your page or the host.`;

const composition = () => `## One agent, one page

Your page is yours alone. You never read or write another agent's page, and
the host provides no mechanism to. If the reader wants a dashboard, a console
or a second view, start a session with instructions to build it; that agent
writes its own page. Link to it with \`pages.open\`, or suggest making it home.
If you want another agent's page changed, send that agent a message with
\`sessions.send\` rather than editing its file. Do not create a session merely
to hold a page: a page that stays put is owned by a real agent that built it
and then stopped.

**The whole file is yours.** There is no page-editing API and there is not
meant to be one: ${ENTRY_FILE} is a file in your storage directory that you
read and write with your ordinary tools. Nothing in it is reserved. Rewriting
the document whole is the expected way to change it, and safer than splicing,
because a splice computed from string indices can silently eat content that a
whole-document write cannot.

**A page may be build output.** A repository script generating pages into
several sessions' storage — so a team gets one identical interface from a
checkout rather than from three agents independently writing HTML — is
legitimate. The rule that does not bend: every page still has one owning
session, and that session's agent builds the page the first time, whether or
not a script takes over afterwards. A page with no agent behind it is a page
nobody can be asked to change.`;

const documents = () => `## Several documents in one page

Your page may hold more than one HTML document. Any \`.html\` file in your page
root other than ${ENTRY_FILE} — nested directories included, ${UPLOAD_DIR}/ excluded,
and excluding *parts* (any path with a segment starting with \`_\`; see *A
document made of parts*) — is a document of the page. Link to it relatively, as a static site would:

    <a href="details.html">Details</a>

A click on such a link opens that document **inside the page**: the top bar
stays, the address changes so reload, back and forward return to it, and it
runs with the same runtime — its forms answer your session and its
capabilities act for it. Each document has its own revision, so saving one
refreshes only a reader who is looking at it. Its own relative references
resolve from its own directory.

Every document is part of the same page and should look it: a document opened
in place arrives with only the styles it carries itself. Keep the page's look
in one stylesheet in your page root and link it from every document —
\`<link rel="stylesheet" href="page.css">\`, or \`../page.css\` from a nested one —
so none arrives unstyled. That stylesheet belongs to this page alone; other
pages are not yours to style.

A link may carry a fragment — \`<a href="tool.html#clients/vela/q3-board">\` —
and the document opens with it: \`location.hash\` is \`#clients/vela/q3-board\`,
the reader's address shows it, and reload, back and forward return to it.
This is how one document takes a parameter. A link to the same document at
another fragment, or a bare \`<a href="#clients/x">\`, does not reload it:
\`hashchange\` fires, as on any site, the address follows, and Back returns to
where it was, also after the reader has opened another document. To change the
fragment from script, set \`location.hash\` (the address follows; its Back step
lasts only while this document stays open) or click such a link with
\`link.click()\` (a Back step that lasts). Never use \`history.pushState\` or
\`replaceState\`: the page's \`<base>\` resolves their URL against your page's
folder and they fire no \`hashchange\`. A query (\`tool.html?x=1\`) is not
carried; use the fragment. Inside an embed, fragments are not carried: a
\`#…\` link only scrolls.

What does not carry over: script state. Each document starts fresh, like a
page load. When state has to survive switching — a half-typed answer on one
view while the reader looks at another — keep the views in one document and
switch them with script instead.`;

const home = () => `## The home page

One page is home; every other page shows a "← Sessions" link back to it in
chrome you never write. Until a page is designated, home is the **built-in
home page**: a hub of the reader's sessions the plugin ships, running in the
same sandbox as any page. \`bb thread-page home\` makes the current session's
page home instead (\`--clear\` returns to the built-in one); it never creates
or touches page content.

If the reader asks for a home of their own, build it in a session dedicated
to it — start one for the purpose if you are mid-task — so nothing else ever
rewrites it: its buttons open other pages and start fresh sessions, and
nothing messages its own session. The reader can ask that session to change
it at any time. Refresh a page like this on a slow watch, not a tight timer:
it shares a rate budget of ${LIMITS.ratePerMinute} requests a minute with its own forms.`;

const accessibility = () => `## Before you save

- Read it once at 320px wide, once in dark mode, once with reduced motion.
- Every action reachable by keyboard; nothing pointer-only.
- A zero in a chart gets a visible mark, or the eye reads missing data.
- Read it once over the reader's real origin, not only loopback. A local bb
  requires no credential and a remote one does, so anything the page loads for
  itself can work for you and fail for them. Authentication is the one axis
  where behaviour genuinely differs between your machine and theirs.`;

const upgrading = () => `## If your page predates 1.1

Three things to fix in a page written against 1.0.x. Each is a one-line edit
and none of them announces itself.

1. **Add \`[hidden] { display: none !important; }\`** to your <style> if it came
   from the old starting file. A class rule that sets display outranks the
   attribute, so an element you wrote \`hidden\` renders as an empty bar.
2. **Delete the seed's old authoring comment** if it is still there. It spelled
   tags out literally, so every string operation you run on your own file sees
   a <main> and a <style> that are not elements, and the obvious splice starts
   inside the comment.
3. **Move inlined data back out.** 1.0 told you to inline anything the page
   could not do without, because a file beside the page failed on the reader's
   origin. That is fixed: reference it relatively and it works everywhere. Your
   entry document gets small again, which makes it cheap to rewrite.

Then check \`bb plugin logs thread-pages\` once, and read the page over the
reader's real origin rather than loopback.

Full notes, including what still is not possible:
\`docs/FOR-PAGE-AUTHORS-1.1.md\`, and \`docs/UPGRADING.md\` for the 0.3.x method
names, in the specification at https://syns.dev/bartsoj/bb-thread-pages.`;

const limits = () => `## Limits

| Limit | Value |
| --- | --- |
| Entry document | ${mebibytes(LIMITS.entryDocumentBytes)}, refused above, never truncated |
| Other files in the page root | ${mebibytes(LIMITS.shellFetchBytes)} per file (${mebibytes(LIMITS.shellFetchImageBytes)} for images), the host's read limit |
| Carried into the document | ${mebibytes(LIMITS.inlineFileBytes)} per file, ${mebibytes(LIMITS.inlineTotalBytes)} per document |
| Large media fetched for the reader | up to ${mebibytes(LIMITS.shellFetchBytes)} per file (${mebibytes(LIMITS.shellFetchImageBytes)} for images); video, audio, img, source, track, poster only |
| Upload per file | ${mebibytes(LIMITS.uploadFileBytes)} |
| Uploads per form | ${LIMITS.uploadsPerForm}, file inputs and text-area attachments together; a form over it is not sent |
| Voice recording | ${LIMITS.voiceMinMs / 1000} s at least; \`maxDurationSeconds\` 1–${LIMITS.voiceMaxSeconds}, default ${LIMITS.voiceDefaultSeconds} (also Dictate and the audio input); context ${LIMITS.voicePromptChars} characters |
| Transcription (the host's, on bb) | 20 MB with the default service (5 MB before bb a67f21bab), 25 MB with OpenAI; 10 s per attempt, 2 attempts |
| Transcript beside a longer recording | cut at ${LIMITS.transcriptChars} characters and marked *(transcript shortened)* |
| Files with sessions.start / sessions.send | ${LIMITS.promptFiles} per call, ${mebibytes(LIMITS.promptFileBytes)} each; on bb images at most 10 MB, no HEIC/HEIF |
| Submission body | ${kibibytes(LIMITS.submissionBodyBytes)} excluding uploaded bytes; ${LIMITS.answersPerSubmission} answers; ${LIMITS.answerValueChars} characters per answer |
| Capability payload | ${kibibytes(LIMITS.capabilityPayloadBytes)} request and response, depth ${LIMITS.capabilityJsonDepth}, ${LIMITS.capabilityJsonNodes} nodes |
| Contributed capability payload | as each method declares in the roster, at most ${mebibytes(LIMITS.contributedPayloadMaxBytes)}; ${kibibytes(LIMITS.capabilityPayloadBytes)} when it declares none |
| Contributed call | ${LIMITS.contributedCallMs / 1000} s, then unavailable |
| Scope (setScope) | ${LIMITS.scopeChars} characters, ${LIMITS.scopeSegments} folders deep |
| Fragment carried to a document | ${LIMITS.fragmentChars} characters; a longer one is dropped |
| Prompt | ${kibibytes(LIMITS.promptChars)} characters (sessions.start, sessions.send) |
| session.reply result | ${kibibytes(LIMITS.resultTextBytes)} |
| Title | ${LIMITS.titleChars} characters |
| storage value | ${kibibytes(LIMITS.storageValueBytes)} per key; keys ${LIMITS.storageKeyChars} characters |
| sessions.snapshot | ${LIMITS.snapshotDefault} default, ${LIMITS.snapshotMax} maximum per call |
| session.activity | ${LIMITS.activityDefault} default, ${LIMITS.activityMax} maximum |
| Page session (action token) | ${LIMITS.actionTokenMs / 3_600_000} hours, then the shell reloads or asks |
| Confirmation | ${LIMITS.confirmationMs / 60_000} minutes to answer the dialog |
| Folder selection | ${LIMITS.selectionTokenMs / 60_000} minutes, single use |
| Submission idempotency | ${LIMITS.idempotencyRecords} records, ${LIMITS.idempotencyMs / 60_000} minutes |
| Rate limit | ${LIMITS.ratePerMinute} accepted requests a minute and ${LIMITS.rateConcurrent} in flight, per page; refused with rate_limited |
| Shell revision poll | every ${LIMITS.shellPollWorkingMs / 1000} s while the session works and for ${LIMITS.shellPollAfterAnswerMs / 1000} s after the reader answers; every ${LIMITS.shellPollMs / 1000} s otherwise; paused while hidden |
| Parts | ${LIMITS.includeParts} per document, ${mebibytes(LIMITS.includePartBytes)} each, ${LIMITS.includeDepth} levels deep; the assembled document within the entry limit |
| Embeds | ${LIMITS.embedsPerPage} per page; checked every ${LIMITS.embedPollWorkingMs / 1000} s while an embedded session works or was just answered, every ${LIMITS.embedPollMs / 1000} s otherwise; one call per tick for every ${LIMITS.pagesReadEntries} |
| pages.read | ${LIMITS.pagesReadEntries} documents per call, ${mebibytes(LIMITS.pagesReadBytes)} per response; a larger single document is refused, the rest deferred |
| Calls from one embedded page | ${LIMITS.embedCallsPerMinute} a minute, then rate_limited |
| Answer grant | asked once per (your page → embedded session), kept until revoked; ${LIMITS.grantsPerPage} per page |
| watch interval | ${LIMITS.watchDefaultMs / 1000} s default, ${LIMITS.watchMinMs / 1000} s–${LIMITS.watchMaxMs / 60_000} min |
| Offline copy | entry documents up to ${kibibytes(LIMITS.offlineCopyBytes)} are kept so the page opens read-only when its host is unreachable |`;

const limitations = (site: SiteStrategy) => `## Known limitations

- A page served from the offline copy is read-only: captured forms are
  disabled and effectful capabilities answer unavailable.
- A confirmed capability that fails on the host answers handler_error with a
  generic message; the cause is in the plugin log (\`bb plugin logs thread-pages\`).
- A site that needs cookies or storage — a video player, a design tool — does
  not work in an <iframe> (the frame inherits the sandbox); link to it. Inside
  an embed, in Safari, a relative reference that was *not* carried into the
  document (missing or over the size limits) resolves against the embedding
  page.
- A large own media file is fetched whole before it plays, and not at all
  inside another page's embed (see *Large video, audio and images*).
- Voice needs a microphone the top bar may use: in the bb desktop app's in-app
  browser tab there is none, so Dictate is not shown there and
  \`voice.captureAndTranscribe\` answers unavailable. The reader can open the
  page in a browser.
- Files attached to a \`sessions.start\` or \`sessions.send\` whose later upload
  failed stay in that project's attachments on bb, which has no way to remove
  one; they are attached to nothing.${
  site.name === "core-storage"
    ? `\n- fetch() of your own files from page script is refused on this host (see Files you show the reader).` +
      `\n- Your own files are carried inside the entry document rather than served as files, because this host cannot authorise a sandboxed document's own requests. That is why they count against the document's size limits.`
    : ""
}`;
