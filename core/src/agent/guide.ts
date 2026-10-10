// `buildGuide(input)`: the authoring guide, generated from the registry, the limits, the provider's defaults and the contributors (04 §The guide, R6.24–R6.29; 07 §Guide text). Every number is from `input.limits`; every method entry from a spec; nothing hand-written per method.
import type { AnyCapabilitySpec, CapabilityTier, ProviderMember } from "../domain/capabilities/contract.ts";
import type { Contributor } from "../domain/capabilities/contributed.ts";
import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { ENTRY_DOCUMENT, UPLOAD_DIR } from "../domain/document-path.ts";
import { BRIDGE_ERROR_CODES } from "../domain/errors.ts";
import { MANUAL_ATTRIBUTE, TITLE_ATTRIBUTE } from "../domain/html/forms.ts";
import { kibibytes, mebibytes, type Limits } from "../domain/limits.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../domain/sandbox.ts";
import { EARLIER_VERSION_LINE, formatSubmissionMessage, sentFromLine } from "../domain/submissions/message.ts";
import type { ProviderChoice } from "../host/provider.ts";
import { UPDATE_DEFERRED_STATUS } from "../runtime/shared/protocol.ts";
import type { CommandSpellings } from "./instruction.ts";

/** Everything the guide is generated from. DESIGN §B.6 */
export interface GuideInput {
  /** Built-ins actually enabled on this host, and every defined one for the absent list. */
  registry: CapabilityRegistry;
  /** Parsed declarations, with their guide text. 07 */
  contributors: readonly Contributor[];
  limits: Limits;
  /** For "sessions.start and its explicit defaults" (03 R5.22): the providers as `providers.list` reports them, or null where the host has none. */
  defaults: { providers: readonly ProviderChoice[] | null; workspaceEnvironments: boolean };
  /** `provider.voice.status()`, or null where the host has no voice member. */
  voice: { configured: boolean; limits: { bytes: number; seconds: number; attempts: number } } | null;
  /** `provider.attachments` present. 03 R5.75 */
  attachments: boolean;
  /** How a page's own files reach the reader. 05 R-S7, R-S10 */
  strategy: "by-url" | "carried";
  commands: CommandSpellings;
}

const TIER_WORDS: Record<CapabilityTier, string> = {
  core: "core",
  composition: "composition",
  voice: "voice and files",
  respond: "respond",
  extras: "host extras",
};

const MEMBER_WORDS: Record<ProviderMember, string> = {
  respond: "a provider that answers waits (`sessions.respond`)",
  usage: "a provider that reports context use",
  archive: "a provider that archives sessions",
  markRead: "a provider with read marks",
  openHost: "a provider with a session address of its own",
  providers: "a provider that lists its AI providers",
  browse: "a provider with a native folder picker",
};

const seconds = (ms: number): string => `${ms / 1000} s`;
const minutes = (ms: number): string => `${ms / 60_000} min`;
const hours = (ms: number): string => `${ms / 3_600_000} h`;
const perMinute = (intervalMs: number): string => `${Math.round((60_000 / intervalMs) * 10) / 10}`;

/** The authoring guide as Markdown. 04 R6.12, R6.24–R6.27 */
export function buildGuide(input: GuideInput): string {
  const sections = [
    intro(input),
    forms(input),
    textAreas(input),
    uploads(input),
    drafts(input),
    refresh(input),
    ownFiles(input),
    documents(input),
    parts(input),
    embedding(input),
    runtimeApi(input),
    transcript(input),
    nextTurnSettings(input),
    respond(input),
    capabilities(input),
    startingSessions(input),
    framing(),
    voice(input),
    network(input),
    affordances(),
    otherSites(),
    composition(input),
    home(input),
    accessibility(),
    contributed(input),
    limitsTable(input),
  ];
  return sections.join("\n\n") + "\n";
}

function intro(input: GuideInput): string {
  const L = input.limits;
  return `# Pages — the authoring guide

A page is one HTML document you write and edit directly; saving publishes it.
Nothing is provided to fill in — no template, no stylesheet, no components —
so its structure, its look and its interactions are yours, and the task
decides them. It runs in a sandboxed frame on an opaque origin with no host
credential and talks to the host only through captured forms and
\`window.threadPage\`.

Your page root is the directory \`${input.commands.init}\` prints as \`Root\`:

    ${ENTRY_DOCUMENT}       the entry document — the page; \`init\` does not create it, you do
    <any files>      served beside it, nested directories included
    ${UPLOAD_DIR}/         files the reader attached, named by the host

Until \`${ENTRY_DOCUMENT}\` exists the page's link shows the reader that it has not
been written yet; the page appears there as soon as you save it. The entry document is at most ${mebibytes(L.entryDocumentBytes)}; above that it is
refused with a message naming the limit, never truncated.

Everything below is generated from this host's own capability registry and
limits: what it says is what this host does, and every limit is a number.

## Around your page

The host draws no chrome around your page: no bar, no title, no buttons. What
the reader sees is your document, edge to edge. The host tells your page three
things through attributes on \`<html>\` that it sets and keeps current —
\`data-thread-page-session="working"|"idle"\`,
\`data-thread-page-readonly="offline"|"archived"\`, and
\`data-thread-page-update="available"\` while a newer version waits for the
reader to stop typing — and mirrors the session state on every captured form.
While your session works, each captured form's status line carries the host's
working text; a form sent meanwhile is queued and says so. Style these
attributes if you want a dot, a banner or nothing; a page that never reads
them still works. To let the reader open the session in the host, call
\`sessions.openHost\` with your own session id. Read-only, delivery and draft
notices appear in the form's status line, which you may style but must not
remove. A \`contenteditable\` element cannot be drafted: once edited it holds
the swap while it keeps focus, as \`setDirty(true)\` does; prefer a
\`<textarea>\`, whose text survives the swap.`;
}

function forms(input: GuideInput): string {
  const L = input.limits;
  const trap = formatSubmissionMessage({ title: "<the page's heading>", action: "confirm", answers: [], files: [] }, (path) => path);
  return `## Forms

Every \`<form>\` in the document is captured and delivered to your session as
a message, with no JavaScript. Add \`${MANUAL_ATTRIBUTE}\` to a form your own
script owns; the host then leaves it entirely alone, controls associated with
it from elsewhere included.

- Nothing is required and blank is a real answer: native validation is
  suppressed, and a blank field arrives as \`(left blank)\`.
- Answer names come from, in order: \`data-label\` on the control, the
  enclosing \`<fieldset>\`'s legend, \`aria-label\`, the wrapping \`<label>\`'s
  text, a \`<label for>\`, the field name.
- Groups collapse: one checkbox is Yes/No; several checkboxes with one name
  are a list of the checked values; radios are the one checked value or
  blank; a multiple \`<select>\` is a list of at most ${L.answerListItems} items.
- The submit button's value leads the message as **Action**.
- Each form has its own pending, dirty and status state. While a submission
  is in flight its controls are disabled; afterwards the status line says
  *Sent*, *Queued* or *Steered*, or why it failed.
- One submission carries at most ${L.answersPerSubmission} answers of ${L.answerValueChars} characters each, in a
  body of at most ${kibibytes(L.submissionBodyBytes)} excluding uploaded bytes.

**Controls anywhere on the page.** A control does not have to sit inside its
form. Give the form an \`id\` and the control \`form="that-id"\`, and it belongs to
that form wherever it is in the document: its answer is delivered with the
form, typing into it marks the page dirty, and it is disabled while the form
sends. A question can therefore sit beside the thing it asks about and still
arrive in one answer. The form's status line appears inside the form element,
so put that element where the reader expects to send from.

Always include one empty text field for anything else: the reader may want
something none of your options cover. That field is a \`<textarea>\`, and it
takes voice and files with no code of yours (below).

**Give every form a stable \`id\`.** A submission and a draft name their form
by \`id\`, else by \`${TITLE_ATTRIBUTE}\`, never by position. A form with neither is
matched only against the revision it was written on — so when you rewrite
the page while the reader is typing, keep ids and titles stable and the
answer still arrives. An answer delivered against an earlier revision
carries the labels the reader saw and one leading line, right after the
heading: \`${EARLIER_VERSION_LINE}\`. A form whose fields are gone from the
current revision is not delivered; the reader's text is kept in the shell.

The message you receive looks like:

${indent(formatSubmissionMessage({ title: "<the form's data-title or the h1>", action: "Approve", answers: [{ name: "approach", label: "Which approach", value: "second" }, { name: "else", label: "Anything else", value: "" }], files: [] }, (path) => path))}

### The dialog trap

A \`<form method="dialog">\` inside a \`<dialog>\` is a form, so it is captured
too. If you write one as a purely local confirm and forget the opt-out
attribute, pressing its button **sends a real message you did not intend**,
and because its buttons carry control-flow values, you receive a plausible
fabricated decision:

${indent(trap)}

Nothing marks it as accidental, and if a turn is running it arrives on the
next one, detached from what caused it. Put \`${MANUAL_ATTRIBUTE}\` on every
dialog form that is not meant to answer you.`;
}

function textAreas(input: GuideInput): string {
  const L = input.limits;
  const dictate = input.voice ? "**Dictate** (a microphone) and " : "";
  const voiceNote = input.voice
    ? `Dictate records the reader in the host's recording bar at once and inserts the host's transcript at the caret (the last ${L.voicePromptChars} characters before it go to the transcriber as context), then fires \`input\` and \`change\`; it is shown only where the reader's surface can record. `
    : "This host has no transcription, so no Dictate control is shown; the row holds Attach alone. ";
  return `### Every text area takes ${input.voice ? "voice and " : ""}files

Each \`<textarea>\` you write shows one small row inside its bottom-right corner,
drawn by the host in the field's own text colour, ${L.textareaIconPx} px line icons: the files
attached to it, then ${dictate}**Attach** (a paperclip). The row lives in a
layer of the host's outside your document tree — your CSS does not reach it,
the field's markup, attributes and style are untouched, nothing moves and
nothing is drawn below the field — and its buttons are reached by Tab right
after the field. ${voiceNote}Attach — or pasting or dropping files onto the
field — adds a chip per file to the row (each removable; what does not fit is
behind a "+N" chip that lists them). The files are uploaded with the form, and
the answer reports their paths beside that field's text under
**Attached here:** (an audio file with its transcript), within the form's
limits: ${mebibytes(L.uploadFileBytes)} per file and ${L.uploadsPerForm} per form, file inputs included. A text area
outside any form, on the built-in home page or inside another page's embed
gets ${input.voice ? "Dictate only" : "no Attach"}; a disabled, read-only or hidden one gets neither, and a
field loses them while its form sends. Put \`${MANUAL_ATTRIBUTE}\` on a
\`<textarea>\` to give it no controls — its answer is still sent with its form —
or on the form to leave the whole form alone. Do that for an editor built on a
hidden-looking \`<textarea>\` and when you build your own voice button.`;
}

function uploads(input: GuideInput): string {
  const L = input.limits;
  const sample = formatSubmissionMessage(
    { title: "<the form's title>", action: "Send", answers: [], files: [{ field: null, name: "report.pdf", path: `${UPLOAD_DIR}/20260908-161200-3f9a1c-report.pdf`, sizeBytes: 48213 }] },
    (path) => `<root>/${path}`,
  );
  const recording = formatSubmissionMessage(
    { title: "<the form's title>", action: null, answers: [], files: [{ field: null, name: "recording.webm", path: `${UPLOAD_DIR}/20260925-101500-1a2b3c-recording.webm`, sizeBytes: 38114, transcript: "Go with the second option, but keep the old export." }] },
    (path) => `<root>/${path}`,
  );
  const recorder = input.voice
    ? `elsewhere a click on it opens the host's recording bar (up to ${L.voiceDefaultSeconds} s), and the recording becomes the input's file`
    : "elsewhere, since this host has no transcription, it stays a plain file picker";
  return `## Files the reader sends you

A captured form may contain \`<input type="file">\` (\`multiple\` is fine). On
submit the files are uploaded first, then the submission is delivered naming
them:

${indent(sample)}

Read them from there with your normal tools. Limits: ${mebibytes(L.uploadFileBytes)} per file, ${L.uploadsPerForm}
files per form, counting the form's file inputs and the files attached to its
text areas together; a form over either is not sent, and its status line
tells the reader which file to remove. Names are generated by the host; the
reader's filename is only a suffix. An upload that fails shows in the form's
status line and no submission claims the missing file.

**A recorded answer.** \`<input type="file" accept="audio/*" capture>\` in a
captured form is answered by the reader's voice, with no code: on a phone the
browser's own recorder answers it; ${recorder}. On submit the recording is uploaded
like any file${input.voice ? " and transcribed by the host, and the transcript arrives beside its path" : ""}:

${indent(recording)}

If it cannot be transcribed the file still arrives and the line says
\`Transcript missing: …\`: listen to the file. A transcript longer than ${L.transcriptChars}
characters is cut and marked. Only this input's files and audio attached to a
text area are transcribed; audio chosen in any other file input arrives as it
is, with no transcript.`;
}

function drafts(input: GuideInput): string {
  const L = input.limits;
  return `## Drafts

What the reader has typed is kept by the shell, in its own storage on the
host origin, across an in-place swap, a reload and a revision change, and
restored into the matching field — a field of a captured form, a field of a
form that opted out, or a bare \`<textarea>\` or text input outside any form
(keyed by its \`id\`, else its \`name\`). Restoring fires \`input\` and \`change\`,
so your script sees it and the page is dirty; a field your script already
filled is not overwritten, and that draft is listed on the home page instead,
under *Unsent drafts*.

- The opt-out is native HTML: a field or form with \`autocomplete="off"\` (and
  the values \`current-password\`, \`new-password\`, \`one-time-code\`), any
  \`type="password"\` and any file input is never drafted. No other attribute
  is read.
- Drafts expire after ${L.draftRetentionMs / 86_400_000} days, are bounded at ${mebibytes(L.draftsPerSessionBytes)} per session, and are
  cleared on delivery or by the reader from the home page.
- **A restored draft is readable by the page that shows it, as typed text
  is.** A page that must not see an unsent value marks the field
  \`autocomplete="off"\`.`;
}

function refresh(input: GuideInput): string {
  const L = input.limits;
  return `## Keeping a page current

Saving is publishing, and an open page follows. The shell re-checks your
document with one conditional request — every ${seconds(L.shellPollWorkingMs)} while your session is
working and for ${seconds(L.shellPollAfterAnswerMs)} after the reader answers from the page, every ${seconds(L.shellPollMs)}
otherwise, never while the tab is hidden. When the document changed it is
**swapped in place**: the new one loads hidden behind the one on screen, the
reader's drafts and scroll position are restored into it, and it takes the
old one's place in one step. Nothing flashes, the address and the history
are untouched. If the new document takes longer than ${seconds(L.refreshSwapMs)} to load, the
host shows it anyway and says so in a line under the page.

**Your page needs no code for any of this, and must not build its own.**
There is no reload call in the API. Do not poll for your own revision, do not
\`location.reload()\`, and do not hop between twin documents to force a
refresh: each is slower, costs the page's call budget, or litters the
reader's history.

- **The swap waits for the reader.** A new version is not swapped in while
  the reader is typing — a text control is focused and the last keystroke was
  less than ${seconds(L.swapIdleMs)} ago — while a submission is in flight, while a dialog is
  open, or while your page holds \`setDirty(true)\` (until \`setDirty(false)\`;
  delivering a form clears it when nothing else was touched since). Meanwhile
  \`<html>\` carries \`data-thread-page-update="available"\`, a
  \`thread-page:update\` event fires on the document, and every form the reader
  touched says "${UPDATE_DEFERRED_STATUS}" in its status line. The moment
  nothing holds it, the swap happens, with the text and the caret restored.
- **A draft survives the swap** (above), so a reader mid-sentence loses
  nothing either way.
- **Make the build deterministic.** An unchanged data set must produce a
  byte-identical document: a generated timestamp turns every rebuild into a
  refresh for every reader.
- **A refresh starts the document fresh.** Script state does not survive it.
  Keep what must survive in \`storage\`, or in the document you write.

\`window.threadPage.watch\` is the other half, for live host state — sessions,
the transcript — that does not live in your file. Use the document rewrite
for data you generate, and \`watch\` for data the host owns.`;
}

function ownFiles(input: GuideInput): string {
  const L = input.limits;
  const byUrl = input.strategy === "by-url";
  const how = byUrl
    ? `On this host your files are **served by URL** on the reader's own origin,
with ranges, so a reference works as on any site: nothing is carried into
the document, a \`<video>\` seeks natively, and the document's size limit is
the document's alone.`
    : `On this host a sandboxed page cannot be served its own files by URL, so
the host **carries them in the document** when it serves it: each relative
reference is read from your page root and rewritten to a \`data:\` URL before
the reader's browser sees it. The consequences:

- Your files are inside the document, so they count against the ${mebibytes(L.entryDocumentBytes)} entry
  limit, and a page over ${kibibytes(L.offlineCopyBytes)} keeps no offline copy. Per file at most
  ${mebibytes(L.inlineFileBytes)}, ${mebibytes(L.inlineTotalBytes)} across the document; base64 adds a third to both.
- \`url()\` inside a stylesheet you reference is followed ${L.inlineCssDepth} levels deep, so
  backgrounds and \`@font-face\` survive. Absolute and remote URLs are never
  touched.
- A file that is missing, too large or over the budget is **left as you wrote
  it** and named in the host's log and in \`status\`. The page still renders;
  that one reference does not resolve. Media is the exception, below.
- Changing a file beside \`${ENTRY_DOCUMENT}\` changes the document, so an open page
  refreshes; you need not touch \`${ENTRY_DOCUMENT}\` to publish new data.

**Large video, audio and images.** A \`<video>\`, \`<audio>\`, \`<source>\`,
\`<img>\` or \`<track>\` \`src\`, or a \`poster\`, naming one of your files that is
too large to carry is fetched for the reader instead: the shell fetches it
from the host with the reader's credential and hands your page the bytes as
a \`blob:\` URL. Plain markup is enough — \`<video src="clip.mp4" controls>\` of
a file up to ${mebibytes(L.shellFetchBytes)} (${mebibytes(L.shellFetchImageBytes)} for a raster image) plays and seeks on every
origin. Until the bytes arrive the element has no \`src\` (the served document
holds \`data-thread-page-file\` in its place), so script that reads \`video.src\`
at load sees nothing; wait for \`loadedmetadata\`. A file that cannot come is
marked on its element with the reason and named in \`status\`. Only those
elements: a large stylesheet, script, font, \`srcset\` candidate or CSS \`url()\`
is not fetched this way. Not inside another page's embed: there the element
says why.`;
  return `## Files you show the reader

Put them beside \`${ENTRY_DOCUMENT}\` and reference them relatively — nested paths,
spaces and punctuation in names are all fine:

    <link rel="stylesheet" href="style.css">
    <script src="app.js"></script>
    <img src="figures/chart.png" alt="…">

No permission, no declaration, no API: writing a file into your page root is
enough. Keep everything inside your own page root; \`..\`, absolute paths and
symbolic links out of it are refused. Page script may fetch its own files as
data on every host: \`await fetch("data.json")\` works the same wherever the
page is read.

${how}

**Linking to your own files.** A link to one of your files that is not a
document of the page is carried out by the shell, from the host's own
address, with the reader's credential:

- \`<a href="report.pdf">\` (any \`target\`) opens the file in a **new tab**; your
  page stays. Raster images, audio, video, PDF, plain text, CSV, JSON and HTML
  open; **an SVG, XML or any other type is downloaded instead**, because a
  tab on the host's address must not run a file's script.
- \`<a href="clip.mp4" download="Our clip.mp4">\` **downloads** it under that
  name (the file's own name when the attribute is empty).
- A link to another \`.html\` document of the page opens it in the page (see
  *Several documents*); with \`download\` it is downloaded.
- A relative link that climbs out of your page root does nothing, and so does
  a link to a part.
- If the browser gives no tab and the reader is still on your page, the shell
  asks — *Open “file” in a new tab?* — and opens it from that click.`;
}

function documents(input: GuideInput): string {
  const L = input.limits;
  return `## Several documents in one page

Your page may hold more than one HTML document. Any \`.html\` file in your page
root other than \`${ENTRY_DOCUMENT}\` — nested directories included, \`${UPLOAD_DIR}/\` excluded,
and excluding *parts* (any path with a segment starting with \`_\`) — is a
document of the page. Link to it relatively, as a static site would:

    <a href="details.html">Details</a>

A click on such a link opens that document **inside the page**: the shell
stays, the address changes so reload, back and forward return to it, and it
runs with the same runtime — its forms answer your session and its
capabilities act for it. Each document has its own revision, so saving one
refreshes only a reader who is looking at it. Its own relative references
resolve from its own directory.

Every document is part of the same page and should look it: a document
opened in place arrives with only the styles it carries itself, so keep the
page's look in one stylesheet in your page root and link it from every
document — \`<link rel="stylesheet" href="page.css">\`, or \`../page.css\` from a
nested one.

A link may carry a fragment — \`<a href="tool.html#clients/vela">\` — and the
document opens with it: \`location.hash\` is \`#clients/vela\`, the reader's
address shows it, and reload, back and forward return to it. A link to the
same document at another fragment, or a bare \`<a href="#x">\`, does not reload
it: \`hashchange\` fires, the address follows, and Back returns to where it
was. To handle a \`#…\` link yourself, cancel it with \`preventDefault\` in a
handler on the link or on \`document\`. Never use \`history.pushState\` or
\`replaceState\`: the page's \`<base>\` resolves their URL against your page's
folder and they fire no \`hashchange\`. Inside an embed, fragments are not
carried: a \`#…\` link only scrolls. A fragment is at most ${L.fragmentChars} characters.

A link may carry a query too — \`<a href="tool.html?scope=clients/vela">\` —
and the document reads it as on any site:
\`new URLSearchParams(location.search).get("scope")\`. The names \`session\`,
\`path\` and \`render\` are the host's. A query is at most ${L.documentQueryChars} characters, with
no \`#\`, spaces or control characters; the same document with another query
is another load, and a \`#…\` link keeps the query.

What does not carry over: script state. Each document starts fresh, like a
page load. When state has to survive switching, keep the views in one
document and switch them with script instead.`;
}

function parts(input: GuideInput): string {
  const L = input.limits;
  return `## A document made of parts

A document can be assembled from several files when it is served, so a page
made of pieces needs no build step: adding a piece is writing one file.

    <main>
      <link rel="thread-page-include" href="_cards/*.html">
    </main>

The \`<link>\` is replaced, in place, by the text of the file it names — or,
with a \`*\`, of every matching file in **name order** (plain code-unit order:
number them \`01-…\`, \`02-…\`; \`10\` sorts before \`2\`). \`*\` matches within the
last path segment only, at most ${L.includePatternStars} per pattern, and never a name starting
with a dot. A pattern that matches nothing leaves nothing.

- **A part is a file with a path segment starting with \`_\`** — \`_cards/a.html\`,
  \`slides/_intro.html\`, \`_footer.html\`. Only a part can be included, and a
  part is **never a document of the page**: no link or address opens it.
  Every other \`.html\` file is a document and cannot be included.
- Replacement is textual. The reader's browser parses the assembled document
  once, as if you had written one file, so a part may hold table rows, a
  \`<script>\`, a \`<style>\`, or half of a list. A part is a fragment: no
  doctype, no \`<html>\`, no \`<head>\`.
- A part's relative \`src\`, \`href\`, \`poster\` and \`srcset\` resolve **from the
  part's own directory**. URLs a script builds at run time resolve from the
  document.
- A part may include parts, ${L.includeDepth} levels deep. At most ${L.includeParts} parts and ${L.includeElements}
  include elements per document, each part at most ${mebibytes(L.includePartBytes)}, and the
  assembled document stays within the ${mebibytes(L.entryDocumentBytes)} entry limit.
- Paths stay inside your page root: \`..\`, absolute paths and symbolic links
  are refused, as for every file of the page.
- The revision covers the assembled document. Change, add or delete a part
  and an open reader gets the new document; you never touch \`${ENTRY_DOCUMENT}\`.
- An include that cannot be honoured — missing, not a part, outside the root,
  over a limit — is **left as you wrote it**, and the document is still
  served. \`status\` lists each one with its reason (the first ${L.includeReports} per
  document), and so does the host's log.

Parts are one document once assembled: ids, form names and script globals
share one namespace.`;
}

function embedding(input: GuideInput): string {
  const L = input.limits;
  const hasRead = input.registry.isEnabled("pages.read");
  if (!hasRead) {
    return `## Showing another session's page

Not on this host: \`pages.read\` and \`pages.answer\` are absent, so
\`threadPage.embed\` is a stub (\`typeof window.threadPage.embed\` is not
\`"function"\`). Link to another page with \`pages.open\` instead.`;
  }
  return `## Showing another session's page

A page can show another session's page inside it, live, and let the reader
answer **that page's agent** from there. One call:

    const stop = window.threadPage.embed(target, { sessionId, path, onState })

\`target\` is an \`<iframe>\` you placed, or any container element — the host
puts a frame filling it. \`sessionId\` is the session whose page to show;
\`path\` is a document of that page (default its entry document). Call
\`stop()\` to remove it. Size and position the frame as you like; the host
supplies no chrome around it.

What the kernel does for you, with no further code:

- loads the document exactly as the host serves it, into a frame that is
  **always** sandboxed exactly as your page is — \`sandbox="${PAGE_SANDBOX}"\`,
  \`allow="${PAGE_FRAME_ALLOW}"\` — on an origin of its own: it cannot reach your page,
  and you cannot reach into it;
- keeps it fresh: every ${seconds(L.embedPollWorkingMs)} while an embedded session is working or was
  answered through its embed in the last ${seconds(L.embedPollAfterAnswerMs)}, every ${seconds(L.embedPollMs)} otherwise,
  never while the tab is hidden. **All the embeds of a page are checked in
  one \`pages.read\` call per tick for every ${L.pagesReadEntries} embeds**, so twelve embeds cost
  your call budget what one does; the author manages none of it. At most
  ${L.embedsPerPage} embeds on a page: a further one shows a placeholder with status
  \`unavailable\`;
- refreshes an embed without touching your page, and keeps its scroll
  position and drafts; never refreshes it under a reader who is typing in
  it — the new version waits until they pause, as on your page, and your
  page counts as dirty meanwhile;
- follows its links: one to another document of that page opens in the
  embed, an \`https:\` link goes through the usual confirmation;
- shows a short line of its own when there is nothing to show — no such
  session, archived, no page yet, too large, unreachable — and keeps
  checking. An archived session's page is shown read-only.

**Answers go to the session that owns the embedded page, never to yours.**
Its forms and \`session.reply\` are worded exactly as on its own address,
plus one leading line naming your page's session (see *Words sent into
another session*). The **first** time the reader answers a given session from
inside your page, the host asks them once, naming both pages; the grant is
remembered until the reader revokes it from the home page or with the
\`${input.commands.grants}\` command. Declined, the answer
is not sent (\`cancelled\`) and the form says so. You cannot word, skip or
pre-approve it. A document of your own page embedded in your page needs no
grant.

Inside an embed the page is itself, with less reach: \`context.get\` describes
*its* session; \`session.activity\` and \`session.messages\` answer for the
embedded session (an embedded activity feed reads \`session.messages\`;
\`session.activity\` there carries \`state\` and \`waiting\` and no items);
\`pages.open\`, \`sessions.openHost\`, \`navigation.openExternal\`,
\`sessions.snapshot\`, \`sessions.messages\`, \`workspaces.list\` and
\`providers.list\` work; \`session.respond\` with \`answers\` is carried under the
same grant. Everything else — \`storage.*\`, \`sessions.send\`, \`sessions.start\`,
every other \`sessions.*\` and \`workspaces.*\` method, \`pages.read\`,
\`pages.answer\`, \`session.respond\` with a \`decision\`, voice, every
contributed capability — rejects with \`unavailable\`, and an embed may make
${L.embedCallsPerMinute} calls a minute. Uploads are refused inside an embed: a form with a file
attached is not sent, and its status line tells the reader to open the page
itself. **Embedding is one level deep:** \`embed\` called inside an embedded
page shows a line saying so and loads nothing. So write your own page to
degrade when \`storage\` answers \`unavailable\`: it may be shown inside
someone else's.

\`onState\`, if you pass it, is called with
\`{ status, sessionId, path, title, revision, working, updateAvailable }\` when
any of them changes — \`status\` is \`loading\`, \`shown\`, \`not_found\`,
\`no_page\`, \`too_large\`, \`unavailable\` or \`nested\`. Use it to draw your own
frame around an embed: a title, a working dot, a link made with
\`pages.open\`.

Underneath are two capabilities you rarely call yourself. \`pages.read\`
returns other sessions' page documents (a whole document is agent output
you can read: quote or summarise another page with it, parsing \`html\` with
\`DOMParser\`). \`pages.answer\` delivers an embed's answer and only that: it
takes the token a read returned, never a session id. To *say* something to
another session in your own words, use \`sessions.send\`, which the reader
confirms each time.

To show another **site**, write an \`<iframe src="https://…">\` (see *Other
sites in a frame*). \`embed\` is for pages of this host, which a frame by URL
cannot show.`;
}

function runtimeApi(input: GuideInput): string {
  const L = input.limits;
  const hasEmbed = input.registry.isEnabled("pages.read");
  return `## window.threadPage

The complete page-facing API; it is frozen and cannot be replaced.

    window.threadPage.version               // 1
    await window.threadPage.invoke(method, params)
    const stop = window.threadPage.watch(method, params, (value, error) => {…}, { intervalMs })
    window.threadPage.setDirty(true | false)
    ${hasEmbed ? "const stopEmbed = window.threadPage.embed(target, { sessionId, path, onState })" : "window.threadPage.embed                 // absent on this host"}
    window.threadPage.setScope("clients/vela")   // or null; see *Capabilities from contributors*
    window.threadPage.scope                 // the scope set, or null

- \`invoke\` resolves with the capability's result and rejects with an \`Error\`
  whose \`code\` is one of: ${BRIDGE_ERROR_CODES.join(", ")}. A contributed
  failure also carries \`reason\` and \`detail\`. Calls made before the page is
  connected are queued, never lost.
- \`watch\` polls a read capability: default every ${seconds(L.watchDefaultMs)}, clamped to
  ${seconds(L.watchMinMs)}–${minutes(L.watchMaxMs)}, paused while the tab is hidden. Errors go to the
  listener's second argument. Call the returned function to stop; a page that
  never calls \`watch\` causes no polling. \`watch\` refuses a method that
  writes.
- \`setDirty\` marks state the host cannot see (see *Keeping a page current*).
- \`setScope\` scopes the document's later calls to a folder inside your
  session's folder; \`storage\` keys are then that folder's own.
- \`stale_page\` means the page changed under the call: the shell swaps in the
  new version, or offers it while the page is dirty. **\`cancelled\` means the
  reader declined a confirmation** — a normal outcome every page calling a
  confirmed capability must handle, not an error:

    try { await invoke("sessions.start", {…}); say("Started."); }
    catch (e) { say(e.code === "cancelled" ? "Nothing started." : e.message); }

Check what is enabled rather than assume: \`(await invoke("context.get")).capabilities\`.`;
}

function transcript(input: GuideInput): string {
  const L = input.limits;
  return `## The transcript

\`session.messages\` reads your own session's transcript and
\`sessions.messages\` any session's the reader can see, archived ones
included. A page recreating the host's chat on top of them is expected and
welcome. Beside the one-agent-one-page rule: a page may *show* another
session's transcript through \`sessions.messages\`, while the agent still
never reads or edits another agent's page file.

A row is \`{ id, atMs, turnId?, agentId?, cursor, kind, text?, from?, tool?,
question?, files?, done, truncated? }\`: \`kind\` is \`user\`, \`assistant\`,
\`tool\`, \`notice\` or \`question\`; \`from\` says who sent a user row
(\`reader\`, \`page\`, \`session\`, \`plugin\`, \`schedule\`), so a row a page
sent carries \`from: { kind: "page" }\`; \`tool\` is \`{ name, input, result?,
isError? }\`; \`question\` is \`{ id, options?, answered }\`. The server bounds
\`text\` at ${L.messageTextChars} characters, \`tool.input\` at ${kibibytes(L.toolInputBytes)} and \`tool.result\` at
${kibibytes(L.toolResultBytes)}, and one response at ${kibibytes(L.messagesResponseBytes)}; a cut row is marked \`truncated\`,
never dropped.

**Cursors.** The parameters are \`{ limit?, before?, after? }\`; \`limit\` is ${L.messagesDefault}
by default and ${L.messagesMax} at most, over it \`invalid_params\`; with no cursor the
newest \`limit\` rows come back, oldest first; \`before\` returns rows older
than the cursor (history) and \`after\` the oldest \`limit\` rows newer than it
(tailing); cursors are opaque, stable for the session and monotonic; every
row carries its own \`cursor\`, and every response carries \`nextCursor\` (the
newest row returned) and \`prevCursor\` (the oldest) — \`before: prevCursor\`
pages history, \`after: nextCursor\` tails — both \`null\` when no row came
back, and \`prevCursor\` \`null\` once the first row of the session was
returned. A live chat \`watch\`es \`{ limit: N }\` and reconciles by row \`id\`,
which a row keeps from its first appearance, and pages back with
\`before: <the oldest shown row's cursor>\`; \`done\` is true when the row's
content is final — an assistant row when its block completed, a tool row
when its result is in, a user row at once — and nothing else defines it.

**What a live chat costs.** A \`watch\` at the ${seconds(L.watchMinMs)} floor is ${perMinute(L.watchMinMs)} calls a
minute against the document's ${L.ratePerMinute}; at the default ${seconds(L.watchDefaultMs)} it is ${perMinute(L.watchDefaultMs)}. One
watch of \`session.messages\` plus one of \`session.activity\` leaves room for
the reader's own actions; a watch per visible row does not.`;
}

/** `session.reply { settings }`: what this host lets a reply change for the next turn, worded by scope so the page's control says what it does (U47). */
function nextTurnSettings(input: GuideInput): string {
  const providers = input.defaults.providers;
  const provider = providers?.find((choice) => choice.default) ?? providers?.[0] ?? null;
  const head = `## Settings for the next turn

\`session.reply\` takes \`settings: { model?, reasoningLevel?, permissionMode? }\`
for the **next turn** — the one your message starts, or the queued one it
becomes; never the running one. Each value comes from \`providers.list\`,
and only a field that provider's \`settings\` names can be set from a page;
anything else fails the whole call with \`settings_unsupported\`
(\`detail.unsupported\` names the fields) before anything is delivered, so
resend without it. The result echoes \`settings\` with the scope applied.
\`permissionMode\` is confirmed in host chrome every time, like a permission
decision; \`model\` and \`reasoningLevel\` are not.

**Word the control honestly, by the scope the roster reports.** A field whose
scope is \`turn\` holds for this one answer: say “for this answer”. One
whose scope is \`session\` holds from now on, until something changes it
again: say “from now on”. A field the roster leaves out cannot be changed
mid-session on this host: do not draw a control for it.`;
  if (!provider) return `${head}

On this host no provider is listed, so \`settings\` has nothing to name: a reply that carries it is \`settings_unsupported\`.`;
  const fields = (["model", "reasoningLevel", "permissionMode"] as const).map((field) => {
    const scope = provider.settings[field];
    if (scope === undefined) return `- \`${field}\`: not changeable mid-session here; omit it.`;
    return `- \`${field}\`: ${scope === "turn" ? "for this answer only (`turn`)" : "from now on (`session`)"}.`;
  });
  return `${head}

On this host, for \`${provider.id}\` (${provider.displayName}):

${fields.join("\n")}`;
}

function respond(input: GuideInput): string {
  const L = input.limits;
  const own = input.registry.isEnabled("session.respond");
  const other = input.registry.isEnabled("sessions.respond");
  if (!own && !other) {
    return `## Answering for the agent

Not on this host: \`session.respond\` and \`sessions.respond\` are absent
(\`unknown_method\`), because its provider does not answer waits. A page can
still *show* what a session waits on — \`session.activity\` and
\`sessions.snapshot\` carry \`state\` and \`waiting\` — and tell the reader to
answer in the host.`;
  }
  return `## Answering for the agent

When a session's \`state\` is \`waiting\`, \`waiting\` says what for: \`kind\`
\`question\` (the agent asked; \`questions[]\` holds each question's \`id\`,
\`text\`, \`options[{ id, label }]\`, \`multiSelect\`, \`allowFreeText\`),
\`approval\` (a tool, a command, a file change, a permission or a plan needs a
decision; \`approval\` holds \`subject\`, the provider's \`summary\` and the
\`decisions\` offered), or \`other\` (the host knows only that it waits).
\`text\` is the one-line summary, at most ${L.questionChars} characters; \`id\` is what an
answer names, and a wait with \`id: null\` cannot be answered from a page.

${own ? "`session.respond`" : "`sessions.respond`"} answers ${own ? "your own session" : "another session"}${own && other ? " and `sessions.respond` any other" : ""}:

- \`{ id, answers }\` for a question: \`answers\` is keyed by question \`id\`, each
  \`{ selected: [option ids], freeText? }\`. A question that asks whether to
  proceed — how a question tool asks "shall I?" — is answered this way. On
  your own session it needs no dialog${other ? "; on another session it is covered by the pair grant the reader gives once per (your page, that session), the same grant `pages.answer` uses, and the reader's grants list on the home page shows when each pair last answered" : ""}.
- \`{ id, decision }\` for an approval: one of the \`decisions\` offered,
  \`allow_once\`, \`allow_for_session\` or \`deny\`. **A decision is confirmed by
  the reader in the shell every time**, on your own session and on any
  other, with the subject, the provider's whole summary and the decision
  named — \`allow_for_session\` spelled out as what it is. It is never covered
  by a grant, and \`pages.answer\` never carries one. A declined decision is
  \`cancelled\`, and further \`decision\` calls for that wait are \`cancelled\`
  without a dialog for ${seconds(L.declinedCooldownMs)}. A summary longer than ${kibibytes(L.decisionSummaryChars)} is
  \`unavailable\` (reason \`summary_too_long\`) rather than shown cut.

\`not_found\` once the wait is over or \`id\` is not the current wait's;
\`conflict\` when the answer does not match the wait's kind; \`invalid_params\`
for an unknown question or option id, several \`selected\` where
\`multiSelect\` is false, or \`freeText\` where \`allowFreeText\` is false.`;
}

function capabilities(input: GuideInput): string {
  const L = input.limits;
  const registry = input.registry;
  const enabled = registry.list().filter((spec) => spec.implemented);
  const absent = registry.defined().filter((spec) => !registry.isEnabled(spec.method) || !spec.implemented);
  const byTier = (tier: CapabilityTier) => enabled.filter((spec) => spec.tier === tier).map((spec) => `\`${spec.method}\``);
  const tiers: string[] = [];
  tiers.push(`- **core** (every host): ${byTier("core").join(", ")}.`);
  for (const tier of ["composition", "respond", "voice", "extras"] as const) {
    const methods = byTier(tier);
    if (methods.length > 0) tiers.push(`- **${TIER_WORDS[tier]}**, present on this host: ${methods.join(", ")}.`);
  }
  const absentLines =
    absent.length === 0
      ? "Every built-in capability of the protocol is present on this host."
      : `Absent on this host (\`unknown_method\`; a page checks the roster and tells the reader what is missing rather than inventing data):\n\n${absent
          .map((spec) => `- \`${spec.method}\` (${TIER_WORDS[spec.tier]} tier) — would be supplied by ${(spec.requires ?? []).map((member) => MEMBER_WORDS[member]).join(" and ") || "the host's implementation of it"}.`)
          .join("\n")}`;
  const rows = enabled.map((spec) => capabilityEntry(spec));
  return `## Capabilities

Every way a page can affect anything outside itself. Effects: \`read\`;
\`own-session-write\` (never confirmed); \`cross-session-write\`,
\`destructive\` and \`device\` (always confirmed in the shell, one dialog per
call, with the host's own wording — you do not build it and cannot word it);
\`navigation\` (confirmed when it leaves this host); \`reader-state\` (the
reader's own marks, not confirmed); \`granted-write\` (asked once per pair of
sessions, then remembered); \`contributed-write\` (a contributor's own state,
never confirmed by the host). Every capability validates its parameters
exactly — unknown keys are refused — and returns only the fields listed.
A request or response is at most ${kibibytes(L.capabilityPayloadBytes)} serialised (depth ${L.capabilityJsonDepth}, ${L.capabilityJsonNodes}
nodes) unless the entry says otherwise.

### By tier

${tiers.join("\n")}

${absentLines}

A workspace \`id\` is stable only while the host's signing key is: a page that
stored one and gets \`not_found\` lists workspaces again.

### Every capability

${rows.join("\n\n")}`;
}

function capabilityEntry(spec: AnyCapabilitySpec): string {
  const status =
    spec.effect === "granted-write"
      ? "asked once per pair in the shell, then remembered"
      : spec.confirmedFor === "decision"
        ? "confirmed in the shell for a `decision`, not for `answers`"
        : spec.confirmed
          ? "confirmed in the shell"
          : "no confirmation";
  const bounds: string[] = [];
  if (spec.maxRequestBytes !== undefined) bounds.push(`request up to ${kibibytes(spec.maxRequestBytes)}`);
  if (spec.maxResponseBytes !== undefined) bounds.push(`response up to ${kibibytes(spec.maxResponseBytes)}`);
  const lines = [`#### \`${spec.method}\` — ${spec.effect} · ${status}`, "", spec.description, "", `Parameters: ${spec.doc.params}`, "", `Result: ${spec.doc.result}`];
  if (spec.doc.notes) lines.push("", spec.doc.notes);
  if (bounds.length > 0) lines.push("", `Bounds: ${bounds.join(", ")}.`);
  return lines.join("\n");
}

function startingSessions(input: GuideInput): string {
  const L = input.limits;
  const providers = input.defaults.providers;
  const defaultProvider = providers?.find((choice) => choice.default) ?? null;
  const defaultModel = defaultProvider?.models.find((model) => model.default) ?? null;
  const defaultMode = defaultProvider?.permissionModes?.find((mode) => mode.default) ?? null;
  const defaults: string[] = [];
  defaults.push(`- \`environment\`: ${input.defaults.workspaceEnvironments ? "the workspace's default environment. Otherwise one of its `environments[].id` from `workspaces.list`." : "none; this host's workspaces have no environments, and any `environment` value is `invalid_params`."}`);
  if (providers === null) {
    defaults.push("- `providerId`, `model`, `reasoningLevel`, `permissionMode`: the host's own defaults. This host does not list providers (`providers.list` is absent), so there is nothing to choose from: say nothing.");
  } else if (defaultProvider === null) {
    defaults.push("- `providerId`, `model`, `reasoningLevel`, `permissionMode`: the host lists no provider right now; say nothing and the host uses its own defaults.");
  } else {
    defaults.push(`- \`providerId\`: \`${defaultProvider.id}\` (${defaultProvider.displayName}). Otherwise an id from \`providers.list\`.`);
    defaults.push(`- \`model\`: ${defaultModel ? `\`${defaultModel.id}\` (${defaultModel.displayName})` : "the provider's own default"}. Otherwise one of that provider's \`models[].id\`.`);
    defaults.push(`- \`reasoningLevel\`: the provider's own default${defaultProvider.reasoningLevels?.length ? `. Otherwise one of ${defaultProvider.reasoningLevels.map((level) => `\`${level.id}\``).join(", ")}` : "; this provider lists no levels"}.`);
    defaults.push(`- \`permissionMode\`: ${defaultMode ? `\`${defaultMode.id}\` (${defaultMode.displayName}). Otherwise one of ${defaultProvider.permissionModes!.map((mode) => `\`${mode.id}\``).join(", ")}` : "the host has none; say nothing"}.`);
  }
  defaults.push("- `title`: the host's own, from the prompt. Otherwise `title`.");
  defaults.push("- The session is a visible root owned by the reader, never a child of yours.");
  const files = input.attachments
    ? `**With files.** \`sessions.start\`, \`sessions.send\` and \`session.reply\` take
\`files\`: a \`FileList\`, an array of \`File\`, or the \`<input type="file">\`
itself. The confirmation names every file with its size, nothing is uploaded
until the reader confirms, and each file becomes a native attachment of the
prompt in the target workspace, so the model sees an image as an image. At
most ${L.promptFiles} files of ${mebibytes(L.promptFileBytes)} each, else \`request_too_large\` before any dialog. If an
upload fails nothing is started or sent and the call rejects naming the file.
This works from the built-in home page too; files for your own session go
through a form or \`session.reply\`.`
    : `**With files.** This host cannot attach files to a prompt: \`files\` on
\`sessions.start\`, \`sessions.send\` or \`session.reply\` answers \`unavailable\`
rather than starting without them. Files for your own session go through a
form.`;
  return `## Starting work from a page

\`sessions.start\` is how a page that should stay put comes to exist: its
buttons start fresh sessions instead of messaging you, so nothing asks you
to rewrite it. It succeeds with only a workspace and a prompt of at most
${kibibytes(L.promptChars)}:

    await window.threadPage.invoke("sessions.start", {
      workspaceId, prompt: "Run the test suite. Report failures only; change nothing."
    });

What you get when you say nothing, and how to say otherwise — the defaults
are this host's own, printed as values:

${defaults.join("\n")}

The confirmation names the workspace, the prompt and the resolved provider,
model and environment. Handle \`cancelled\` (see *window.threadPage*).
\`sessions.send\` steers an existing session the same way; it refuses your own
session — use \`session.reply\` for that.

${files}`;
}

function framing(): string {
  return `## Words sent into another session

A prompt or answer a page sends through a grant — \`pages.answer { reply: {
kind: "prompt" } }\`, or any answer under a pair grant — arrives with one
leading line naming the page's session: \`${sentFromLine("<title>")}\`,
right after the heading or, for a prompt, as the first paragraph. Only the
page's own session receives words as typed. \`sessions.send\`, which the
reader confirms each time, delivers the prompt as the reader's own words.`;
}

function voice(input: GuideInput): string {
  const L = input.limits;
  if (!input.registry.isEnabled("voice.captureAndTranscribe") || !input.voice) {
    return `## Voice

Not on this host: \`voice.captureAndTranscribe\` is absent (\`unknown_method\`)
because the host has no transcriber, and text areas show no Dictate control.
A \`<input type="file" accept="audio/*" capture>\` still records on a phone and
arrives as a file, with the line \`Transcript missing\`.`;
  }
  const hostLimits = input.voice.limits;
  const configured = input.voice.configured ? "" : "\n\nRight now the host reports no transcription service configured, so every call is `unavailable` and Dictate is not shown; the capability stays listed in `context.get`.";
  return `## Voice

\`voice.captureAndTranscribe\` records the reader and returns the host's
transcript, so a page can have a "speak to the agent" button and no field at
all; what the text does next — \`session.reply\`, filling something — is yours.
Text areas and the audio capture input use the same recorder with no code.

    button.onclick = async () => {
      try { const { text } = await window.threadPage.invoke("voice.captureAndTranscribe", { prompt: context }); use(text); }
      catch (e) { if (e.code !== "cancelled") say(e.message); }
    };

- Only the host records, never your page: its recording bar — chrome your
  page cannot draw over — shows a live waveform, Cancel and Done, and **it is
  the confirmation**: there is no dialog, and nothing leaves the reader's
  device until they press Done. Escape cancels it. The recording goes only to
  the host's transcriber; your page gets the text, and the recording as a
  \`Blob\` only with \`keepAudio: true\`.
- The bar opens **only from the reader's click or key press in your page** —
  never on load or from a timer — and one at a time: a call without the
  action, or while another bar or confirmation is open, is \`unavailable\`.
- \`cancelled\`: Cancel, Escape, or Done before ${seconds(L.voiceMinMs)} (the bar says *Too short*).
  \`unavailable\`, with the reason: no transcription service, a surface that
  cannot record, the microphone refused, inside an embed, or a transcription
  that failed. \`request_too_large\`: over the transcriber's limit.
- Length: \`maxDurationSeconds\` from 1 to ${L.voiceMaxSeconds}, default ${L.voiceDefaultSeconds} (Dictate and the
  audio input use ${L.voiceDefaultSeconds}); at the cap recording stops and the bar waits for
  Done. \`prompt\` — names, terms, what came before — at most ${L.voicePromptChars} characters;
  \`language\` a tag such as \`de\`, a hint.
- This host's transcriber takes at most ${mebibytes(hostLimits.bytes)} of audio, ${hostLimits.seconds} s per
  attempt, ${hostLimits.attempts} attempts; the server passes it at most ${mebibytes(L.transcriptionBytes)}. There is no
  streaming: the text comes once, after Done. Prefer short turns.${configured}`;
}

function network(input: GuideInput): string {
  const L = input.limits;
  return `## Network, other services and servers

Pages have internet access: fetch any origin, load remote fonts, scripts,
stylesheets, images and media, open WebSockets. The page still holds no host
credential — reaching a URL and acting as the host are different things.

**What your page is, to another server.** Its origin is \`null\`. Every
request it makes carries \`Origin: null\` and no cookie of any kind — not the
host's, and not the reader's session with any other service. The sandbox
gives it no storage of its own either: \`document.cookie\`, \`localStorage\`,
\`sessionStorage\` and IndexedDB are unavailable. Keep what must survive a
reload with \`storage.set\` (${kibibytes(L.storageValueBytes)} per key, ${mebibytes(L.storagePageBytes)} per page).

**Acting on another service as the reader.** Authenticate with a token in a
request header — an API key or personal token the reader gives the page,
kept with \`storage.set\`. That works whenever the service answers a
cross-origin request from \`Origin: null\`, and many APIs do. Two things do
not work, and the host offers no mechanism for either, by design: a sign-in
flow that sends the reader to a login page and back (your page's popups
stay sandboxed, its origin is \`null\` so the flow has nowhere to return to,
it has no top-level navigation, and login pages refuse to load in a frame),
and an SDK that checks a registered JavaScript origin, because \`null\`
cannot be registered.

**A server of your own.** Page script runs in the reader's browser, so where
the reader is decides what it can reach:

- a server on the reader's machine at a loopback address, when the page is
  read on that machine;
- any public URL, from any device — for a phone, give your server a public
  address and its own token;
- **not** anything behind the host's own authentication: its API, its file
  route, or a port it shares for you. Those need a credential the page
  cannot send.

A server your page calls must answer CORS for \`Origin: null\`, preflights
included, and check its own token.`;
}

function affordances(): string {
  return `## Links, windows, downloads and full screen

On the reader's click:

- **Links.** Any \`<a href="https://…">\` works, whatever its \`target\`: the
  kernel routes the click through \`navigation.openExternal\`, which **asks the
  reader** in the shell's dialog, naming the destination, and then opens the
  site in a **new tab** as itself, signed in as the reader is. Your page is
  never replaced. Call \`navigation.openExternal\` yourself from script for the
  same thing.
- **This host's own addresses are not "another site".** \`navigation.openExternal\`
  refuses them with \`invalid_params\`, before any dialog, and so does a link to
  one. Open another page with \`pages.open\`, a session with
  \`sessions.openHost\` where the host has it; link your own files relatively.
- **\`window.open(url)\`** from a click handler opens a window with no dialog —
  but that window **stays sandboxed**: the site in it has no cookies and no
  storage, as in a frame. Fine for a plain page or a document you built; use
  a link for a site the reader must use as themselves. Without a click the
  browser blocks it, as it would anywhere.
- **\`mailto:\` and \`tel:\`** links hand off to the reader's mail and phone apps.
- **Downloads.** A file your page builds downloads the usual way: make a
  \`Blob\`, point an \`<a download="name.csv">\` at \`URL.createObjectURL(blob)\`,
  click it. Your own files: see *Linking to your own files*.
- **Full screen.** \`element.requestFullscreen()\` from a click works, in your
  page and inside an embed; Escape leaves. On an iPhone only a \`<video>\` goes
  full screen, through its own control.

What still does nothing, silently — never rely on it:

- \`window.prompt\`, \`alert\`, \`confirm\` — build the input or the question into
  the page, or use a confirmed capability, which renders its own dialog. A
  \`<dialog>\` you script yourself needs \`${MANUAL_ATTRIBUTE}\` on its form.
- top-level navigation — your page cannot replace the host's document around
  it. \`pages.open\` and \`sessions.openHost\` navigate the reader's view in
  place; the back button returns.

Same-document fragments work natively. The trust boundary is not
configurable: no setting widens the sandbox.`;
}

function otherSites(): string {
  return `## Other sites in a frame

\`<iframe src="https://…">\` works. The frame inherits your page's sandbox, so
the site inside it runs with **no cookies and no storage**: it is never
signed in, and anything that needs \`localStorage\` or a cookie to start
fails.

- **Works:** maps embeds, plain informational sites, documents.
- **Breaks:** video players and apps that need storage or a sign-in — they
  show a poster at most, or nothing. Link to them instead.
- **Refuses any frame:** sites that send \`X-Frame-Options\` or
  \`frame-ancestors\` — most sign-in pages, many apps. Link to them.
- Add \`allow="fullscreen"\` to the \`<iframe>\` if the site has a full-screen
  button.
- Only \`https:\` (plus \`blob:\` and \`data:\` documents you build). A page of
  **this host** is refused by URL — show it with \`threadPage.embed\`.

Nothing in your page can read into the frame, and nothing in it can reach
your page or the host.`;
}

function composition(input: GuideInput): string {
  const hasHome = input.registry.isEnabled("pages.open");
  return `## One agent, one page

Your page is yours alone. You never read or write another agent's page, and
the host provides no mechanism to. If the reader wants a dashboard, a console
or a second view, start a session with instructions to build it; that agent
writes its own page. Link to it with \`pages.open\`${hasHome ? ", or suggest making it home" : ""}.
If you want another agent's page changed, send that agent a message with
\`sessions.send\` rather than editing its file. Do not create a session merely
to hold a page: a page that stays put is owned by a real agent that built it
and then stopped.

**A page that should stay put** is one whose forms — its field for anything
else included — start fresh sessions (\`sessions.start\`) instead of messaging
you, and it tells the reader it stays put. Nothing then asks you to rewrite
it.

**The whole file is yours.** There is no page-editing API and there is not
meant to be one: \`${ENTRY_DOCUMENT}\` is a file in your page root that you read and
write with your ordinary tools. Nothing in it is reserved. Rewriting the
document whole is the expected way to change it, and safer than splicing.

**A page may be build output.** A repository script generating pages into
several sessions' page roots is legitimate. The rule that does not bend:
every page still has one owning session, and that session's agent builds
the page the first time. A page with no agent behind it is a page nobody can
be asked to change.`;
}

function home(input: GuideInput): string {
  const L = input.limits;
  return `## The home page

One page is home: the address a reader starts from (the host's \`home\`
route); no page links to it on its own, since the host draws nothing around
a page. Until a page is designated, home is the **built-in home page**:
a list of the reader's sessions and workspaces that the server ships,
running in the same sandbox as any page, with a reserved identity of its
own — it is attributed to no session and can act as none. Designating a page
is \`${input.commands.home}\`, run in that page's session (\`--clear\` returns to the
built-in one, which stays at \`home?builtin=1\` meanwhile); it sets a pointer and never
creates or touches page content. A designated page is still an agent's page:
the built-in home's duties (the reader's unsent drafts, the grants) never
reach it. Replacing the built-in home takes nothing
else, and no setting edits or restyles it.

If the reader asks for a home of their own, build it in a session dedicated
to it — start one for the purpose if you are mid-task — so nothing else ever
rewrites it: its buttons open other pages and start fresh sessions, and
nothing messages its own session. Refresh a page like this on a slow watch,
not a tight timer: it shares a budget of ${L.ratePerMinute} requests a minute with its own
forms, and its session's ${L.sessionRatePerMinute} with every other document of that session.`;
}

function accessibility(): string {
  return `## Before you save

- Read it once at a phone's width, once in dark mode, once with reduced
  motion.
- Every action reachable by keyboard; nothing pointer-only.
- A zero in a chart gets a visible mark, or the eye reads missing data.
- Read it once over the reader's real origin, not only where you are:
  authentication is the one axis where behaviour differs between your
  machine and theirs.`;
}

function contributed(input: GuideInput): string {
  const L = input.limits;
  const registered =
    input.contributors.length === 0
      ? "None is registered on this host now."
      : input.contributors
          .map((contributor) => {
            const methods = contributor.methods.map((spec) => {
              const reasons = [...(spec.reasons?.keys() ?? [])];
              return `- \`${spec.method}\` — ${spec.effect}. ${spec.description} Request up to ${kibibytes(spec.maxRequestBytes ?? L.capabilityPayloadBytes)}, response up to ${kibibytes(spec.maxResponseBytes ?? L.capabilityPayloadBytes)}.${reasons.length > 0 ? ` Reasons: ${reasons.join(", ")}.` : ""}`;
            });
            return [`### ${contributor.id} ${contributor.version}`, "", ...(methods.length > 0 ? methods : ["- (no methods)"]), ...(contributor.guide ? ["", contributor.guide] : [])].join("\n");
          })
          .join("\n\n");
  return `## Capabilities from contributors

Other extensions installed on this host may add capabilities to your page.
Each lives in a namespace named after its contributor and means what that
contributor says it means; the host only checks and delivers the call. The
contributor's own section below, and its instruction fragment, explain its
methods.

**Check, do not assume.** Call \`context.get\` when the page loads. A
contributed method appears in \`capabilities\` with \`contributor: { id,
version }\`, a \`description\`, its \`reasons\` and
\`maxRequestBytes\`/\`maxResponseBytes\`. A method that is not there answers
\`unknown_method\`.

**When a method you need is missing,** keep the rest of the page working and
tell the reader, in your own words, what is missing and what would supply it
— usually installing or enabling the extension its namespace names. Never
show invented or example data in its place.

**No dialog.** These calls run the moment you make them, writes included;
the contributor answers for what it does. If a write is something the reader
would not expect from the control they touched, ask the reader on the page
first.

**Your session is passed for you.** The contributor learns which session's
page is calling from the host; a session id in your parameters chooses
nothing. From the built-in home page there is no session, and a scoped
call from it is refused.

**Scoped to a folder.** A document may say which folder inside your session's
folder its calls are about: \`threadPage.setScope("clients/vela")\`. Every
\`invoke\` made after it, and every \`watch\` started after it, carries that
folder. \`setScope(null)\` returns to the session's folder. The folder is
relative, \`/\`-separated, at most ${L.scopeChars} characters and ${L.scopeSegments} folders deep; one
that is absolute, has \`~\` as its first folder, or has a \`..\`, \`.\` or empty
part throws a \`TypeError\`, and the host refuses it again with
\`invalid_params\`. Built-in capabilities ignore it, except \`storage\`: a scoped
document's keys are its folder's own. Set it before the first call, and take
the folder from the document's query (see *Several documents in one page*).

**Failures.** The rejected \`Error\` carries \`code\` as usual, and may carry
\`reason\` — a word the method declares — and \`detail\`, data for that reason.
Branch on \`reason\` when you know the contributor, on \`code\` when any will
do: \`conflict\` — what you based a write on has moved, so read again;
\`unavailable\` — the method exists but cannot serve this page now (not
answering, over ${seconds(L.contributedCallMs)}, or nothing this session can reach);
\`unknown_method\` — no installed extension provides it.

**Sizes.** Each method's bounds are in the roster: ${kibibytes(L.capabilityPayloadBytes)} unless the
contributor declares more, never more than ${mebibytes(L.contributedPayloadMaxBytes)}. Larger data comes in
parts through the method's own offset and limit, or cursor. A response is
never cut short; it fails with \`response_too_large\`.

**The budget is shared.** Every call, built-in or contributed, counts against
its document's budget — ${L.ratePerMinute} a minute and ${L.rateConcurrent} at once for each document and
scope — and against the session's, ${L.sessionRatePerMinute} a minute and ${L.sessionRateConcurrent} at once for all
its documents together. One \`watch\` at the default ${seconds(L.watchDefaultMs)} costs ${perMinute(L.watchDefaultMs)} calls a
minute; at the ${seconds(L.watchMinMs)} floor, ${perMinute(L.watchMinMs)}. Reading three hundred items one call
each costs three hundred — more than two minutes of budget. Load many items
with the contributor's batched read when it has one, and poll one small
thing, such as a version.

**Changes arrive by polling.** \`watch\` a contributed read method and read
more only when it changes. There is no push.

### Registered now

${registered}`;
}

function limitsTable(input: GuideInput): string {
  const L = input.limits;
  const rows: [string, string][] = [
    ["Entry document", `${mebibytes(L.entryDocumentBytes)}, refused above, never truncated`],
    ["Carried into the document", input.strategy === "carried" ? `${mebibytes(L.inlineFileBytes)} per file, ${mebibytes(L.inlineTotalBytes)} per document; CSS \`url()\` ${L.inlineCssDepth} levels deep` : "nothing: own files are served by URL on this host"],
    ["Large media fetched for the reader", input.strategy === "carried" ? `up to ${mebibytes(L.shellFetchBytes)} per file (${mebibytes(L.shellFetchImageBytes)} for a raster image); video, audio, img, source, track, poster only` : "not needed: served by URL with ranges"],
    ["Upload per file", mebibytes(L.uploadFileBytes)],
    ["Uploads per form", `${L.uploadsPerForm}, file inputs and text-area attachments together; a form over it is not sent`],
    ["Transcript beside a recording", `cut at ${L.transcriptChars} characters and marked`],
    ["Submission body", `${kibibytes(L.submissionBodyBytes)} excluding uploaded bytes; ${L.answersPerSubmission} answers; ${L.answerValueChars} characters per answer; ${L.answerListItems} items per list answer`],
    ["Drafts", `kept ${L.draftRetentionMs / 86_400_000} days, ${mebibytes(L.draftsPerSessionBytes)} per session`],
    ["Capability payload", `${kibibytes(L.capabilityPayloadBytes)} request and response, depth ${L.capabilityJsonDepth}, ${L.capabilityJsonNodes} nodes`],
    ["Contributed capability payload", `as each method declares in the roster, at most ${mebibytes(L.contributedPayloadMaxBytes)}; ${kibibytes(L.capabilityPayloadBytes)} when it declares none`],
    ["Contributed call", `${seconds(L.contributedCallMs)}, then \`unavailable\``],
    ["Scope (setScope)", `${L.scopeChars} characters, ${L.scopeSegments} folders deep`],
    ["Fragment carried to a document", `${L.fragmentChars} characters; a longer one is dropped`],
    ["Document query", `${L.documentQueryChars} characters; \`session\`, \`path\` and \`render\` are the host's`],
    ["Prompt", `${kibibytes(L.promptChars)} characters (sessions.start, sessions.send, session.reply)`],
    ["session.reply result", kibibytes(L.resultTextBytes)],
    ["Title", `${L.titleChars} characters`],
    ["storage", `${kibibytes(L.storageValueBytes)} per key, ${mebibytes(L.storagePageBytes)} per page across scopes; keys ${L.storageKeyChars} characters; ${L.storageSetManyEntries} entries per setMany`],
    ["sessions.snapshot", `${L.snapshotDefault} default, ${L.snapshotMax} maximum per call`],
    ["session.activity", `${L.activityDefault} default, ${L.activityMax} maximum`],
    ["Transcript reads", `${L.messagesDefault} rows default, ${L.messagesMax} maximum; ${L.messageTextChars} characters of text, ${kibibytes(L.toolInputBytes)} tool input and ${kibibytes(L.toolResultBytes)} tool result per row; ${kibibytes(L.messagesResponseBytes)} per response`],
    ["Waiting text", `${L.questionChars} characters; a decision summary ${kibibytes(L.decisionSummaryChars)}`],
    ["Page session (action token)", `${hours(L.actionTokenMs)}, renewed by the shell's poll`],
    ["Confirmation", `${minutes(L.confirmationMs)} to answer the dialog`],
    ["Folder selection", `${minutes(L.selectionTokenMs)}, single use`],
    ["Submission idempotency", `${L.idempotencyRecords} records, ${minutes(L.idempotencyMs)}`],
    ["Rate limit", `${L.ratePerMinute} accepted requests a minute and ${L.rateConcurrent} in flight per document and scope, and ${L.sessionRatePerMinute} a minute and ${L.sessionRateConcurrent} in flight per session; refused with \`rate_limited\``],
    ["Shell revision poll", `every ${seconds(L.shellPollWorkingMs)} while the session works and for ${seconds(L.shellPollAfterAnswerMs)} after the reader answers; every ${seconds(L.shellPollMs)} otherwise; paused while hidden; a swap waits at most ${seconds(L.refreshSwapMs)} for the new document`],
    ["Swap while typing", `deferred until ${seconds(L.swapIdleMs)} after the last keystroke in a focused text control; also while a submission is in flight, a dialog is open, or the page holds \`setDirty(true)\``],
    ["Parts", `${L.includeParts} per document, ${L.includeElements} include elements, ${mebibytes(L.includePartBytes)} each, ${L.includeDepth} levels deep, ${L.includePatternStars} stars per pattern; the assembled document within the entry limit`],
    ["Embeds", `${L.embedsPerPage} per page; checked every ${seconds(L.embedPollWorkingMs)} while an embedded session works or was answered in the last ${seconds(L.embedPollAfterAnswerMs)}, every ${seconds(L.embedPollMs)} otherwise; one call per tick for every ${L.pagesReadEntries}`],
    ["pages.read", `${L.pagesReadEntries} documents per call, ${mebibytes(L.pagesReadBytes)} per response; a larger single document is refused, the rest deferred`],
    ["pages.answer", `${kibibytes(L.pagesAnswerBytes)} per request`],
    ["Calls from one embedded page", `${L.embedCallsPerMinute} a minute, then \`rate_limited\``],
    ["Answer grant", `asked once per (your page → embedded session), kept until revoked; ${L.grantsPerPage} per page, ${L.grantPages} pages; answer tokens last ${hours(L.answerTokenMs)}`],
    ["Declined decision or grant", `no dialog again for ${seconds(L.declinedCooldownMs)}`],
    ["watch interval", `${seconds(L.watchDefaultMs)} default, ${seconds(L.watchMinMs)}–${minutes(L.watchMaxMs)}`],
    ["Offline copy", `entry documents up to ${kibibytes(L.offlineCopyBytes)} are kept so the page opens read-only when its source is unreachable`],
    ["Voice", input.voice ? `${seconds(L.voiceMinMs)} at least; \`maxDurationSeconds\` 1–${L.voiceMaxSeconds}, default ${L.voiceDefaultSeconds}; context ${L.voicePromptChars} characters; audio at most ${mebibytes(L.transcriptionBytes)} to the transcriber` : "absent on this host"],
    ["Files with sessions.start / send / reply", input.attachments ? `${L.promptFiles} per call, ${mebibytes(L.promptFileBytes)} each; an approved call may upload them for ${minutes(L.attachGrantMs)}` : "absent on this host"],
    ["workspaces.list / providers.list", `${L.workspacesMax} workspaces, ${L.environmentsPerWorkspace} environments each; ${L.providersMax} providers, ${L.modelsPerProvider} models each; a longer list is cut to the first N in the host's order, the default kept`],
  ];
  return `## Limits

| Limit | Value |
| --- | --- |
${rows.map(([name, value]) => `| ${name} | ${value} |`).join("\n")}`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `    ${line}` : ""))
    .join("\n");
}
