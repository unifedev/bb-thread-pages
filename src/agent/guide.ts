import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { LIMITS, kibibytes, mebibytes } from "../domain/limits.ts";
import { ENTRY_FILE, UPLOAD_DIR } from "../pages/layout.ts";
import type { SiteStrategy } from "../pages/site.ts";

/**
 * The authoring guide, printed by `bb thread-page guide`. Assembled from
 * prose, the limits table and the capability registry at load, so every
 * number and every capability in it is the implementation's own. It carries
 * no example pages, page shapes or component snippets: code in it states a
 * mechanism and nothing more. spec R6.24–R6.27, DECISIONS D11
 */
export function buildGuide(registry: CapabilityRegistry, site: SiteStrategy): string {
  return [
    intro(),
    forms(),
    uploads(),
    ownFiles(site),
    keepingCurrent(),
    runtimeApi(),
    capabilities(registry),
    startingSessions(),
    network(),
    unavailable(),
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
  page does not reload under the reader. Custom state the host cannot see:
  window.threadPage.setDirty(true|false).

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

const uploads = () => `## Files the reader sends you

A captured form may contain <input type="file"> (multiple is fine). On submit
the files are uploaded first, then the submission is delivered naming them:

    **Attached files**
    - \`$BB_THREAD_STORAGE/${UPLOAD_DIR}/20260908-161200-3f9a1c-report.pdf\` (…, 48213 bytes)

Read them from there with your normal tools. Limits: ${mebibytes(LIMITS.uploadFileBytes)} per file,
${LIMITS.uploadsPerForm} files per form (extras are dropped visibly). Names are generated by
the host; the reader's filename is only a suffix. An upload that fails shows
in the form's status line and no submission claims the missing file.`;

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
  it** and named in the plugin log (\`bb plugin logs thread-pages\`). The page
  still renders; that one reference does not resolve.
- \`url()\` inside a stylesheet you reference is followed too, so backgrounds
  and \`@font-face\` survive. Absolute and remote URLs are never touched.
- Changing a file beside ${ENTRY_FILE} changes the document, so an open page
  reloads — see *Keeping a page's data current*. You do not have to touch
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
}`;

const keepingCurrent = () => `## Keeping a page's data current

The entry document is the only artifact guaranteed to reach every reader, on
every origin. Rewriting it is therefore how you push new data to an open page:
the shell notices the new revision within ${LIMITS.shellPollMs / 1000} s and reloads the page under
the reader, preserving what they were typing. You do not need a poller, a
sidecar or a socket for this — a page that follows a data source is a page
something rewrites.

Three things to get right:

- **Make the build deterministic.** An unchanged data set must produce a
  byte-identical document. This is the non-obvious half: a generated timestamp
  in the payload turns every rebuild into a reload for every reader, and the
  page will look like it is flickering for no reason.
- **Set \`setDirty(true)\` while the reader is mid-edit** in state the host
  cannot see. A captured form does this for you; your own widgets do not.
- **Refresh on a slow watch, not a tight timer.** A page shares a budget of
  ${LIMITS.ratePerMinute} requests a minute with its own forms.

\`window.threadPage.watch\` is the other half, for live host state — sessions,
activity — that does not live in your file. Use the document rewrite for data
you generate, and \`watch\` for data the host owns.`;

const runtimeApi = () => `## window.threadPage

The complete page-facing API; it is frozen and cannot be replaced.

    window.threadPage.version               // 1
    await window.threadPage.invoke(method, params)
    const stop = window.threadPage.watch(method, params, (value, error) => {…}, { intervalMs })
    window.threadPage.setDirty(true | false)

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
- \`stale_page\` means the page changed under the call: the shell offers a
  reload. \`cancelled\` means the reader declined a confirmation — a normal
  outcome every page calling a confirmed capability must handle, not an error.

Check what is enabled rather than assume: \`(await invoke("context.get")).capabilities\`.`;

function capabilities(registry: CapabilityRegistry): string {
  const rows = registry.list().map((spec) => {
    const status = spec.implemented ? (spec.confirmed ? "confirmed in trusted chrome" : "no confirmation") : "not implemented on this host: unknown_method";
    const lines = [`### \`${spec.method}\` — ${spec.effect} · ${status}`, "", spec.description, "", `Parameters: ${spec.doc.params}`, "", `Result: ${spec.doc.result}`];
    if (spec.doc.notes) lines.push("", spec.doc.notes);
    return lines.join("\n");
  });
  return `## Capabilities

Every way a page can affect anything outside itself. Effects: read;
own-session-write; cross-session-write, destructive and device (always
confirmed); navigation (confirmed when it leaves this host). A confirmed
capability shows a dialog in trusted chrome with the host's own wording; you
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
session — use \`session.reply\` for that.`;

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
flow that sends the reader to a login page and back (a page has no popups and
no top-level navigation, and login pages refuse to load in a frame), and an
SDK that checks a registered JavaScript origin, because \`null\` cannot be
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

const unavailable = () => `## What the sandbox silences

These do nothing, silently — the worst failure mode — so never rely on them:

- \`window.open\` — use \`pages.open\` for another page, \`sessions.openHost\`
  for the host application, and a plain <a href="https://…"> or
  \`navigation.openExternal\` for the web.
- \`window.prompt\`, \`alert\`, \`confirm\` — build the input or the question into
  the page, or use a confirmed capability, which renders its own dialog. A
  <dialog> you script yourself needs data-thread-page-manual on its form.
- top-level navigation — \`pages.open\` and \`sessions.openHost\` navigate the
  reader's view in place through trusted chrome; the back button returns.

An ordinary <a href="https://…"> works: the host intercepts the click and
routes it through \`navigation.openExternal\`, which confirms and names the
destination. Same-document fragments (#section) work natively. The trust
boundary is not configurable: no setting widens the sandbox.`;

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

const home = () => `## The home page

One page is home; every other page shows a "← Sessions" link back to it in
chrome you never write. \`bb thread-page home\` sets the pointer for the
current session (\`--clear\` removes it) and never creates or touches page
content. Home is an ordinary page. If the reader asks for one place to see and
steer their sessions, build it in a session dedicated to it — start one for
the purpose if you are mid-task — so nothing else ever rewrites it: its
buttons open other pages and start fresh sessions, and nothing messages its
own session. The reader can ask that session to change it at any time.

Refresh a page like this on a slow watch, not a tight timer: it shares a rate
budget of ${LIMITS.ratePerMinute} requests a minute with its own forms.`;

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
\`docs/FOR-PAGE-AUTHORS-1.1.md\` in the plugin, and \`docs/UPGRADING.md\` for
the 0.3.x method names.`;

const limits = () => `## Limits

| Limit | Value |
| --- | --- |
| Entry document | ${mebibytes(LIMITS.entryDocumentBytes)}, refused above, never truncated |
| Other files in the page root | ${mebibytes(25 * 1024 * 1024)} per file (${mebibytes(10 * 1024 * 1024)} for images), the host's read limit |
| Upload per file | ${mebibytes(LIMITS.uploadFileBytes)} |
| Uploads per form | ${LIMITS.uploadsPerForm} |
| Submission body | ${kibibytes(LIMITS.submissionBodyBytes)} excluding uploaded bytes; ${LIMITS.answersPerSubmission} answers; ${LIMITS.answerValueChars} characters per answer |
| Capability payload | ${kibibytes(LIMITS.capabilityPayloadBytes)} request and response, depth ${LIMITS.capabilityJsonDepth}, ${LIMITS.capabilityJsonNodes} nodes |
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
| Shell revision poll | every ${LIMITS.shellPollMs / 1000} s while visible |
| watch interval | ${LIMITS.watchDefaultMs / 1000} s default, ${LIMITS.watchMinMs / 1000} s–${LIMITS.watchMaxMs / 60_000} min |
| Offline copy | entry documents up to ${kibibytes(LIMITS.offlineCopyBytes)} are kept so the page opens read-only when its host is unreachable |`;

const limitations = (site: SiteStrategy) => `## Known limitations

- A page served from the offline copy is read-only: captured forms are
  disabled and effectful capabilities answer unavailable.
- A confirmed capability that fails on the host answers handler_error with a
  generic message; the cause is in the plugin log (\`bb plugin logs thread-pages\`).
- Embedding another page or site in an <iframe> is blocked (frame-src 'none').
- \`voice.captureAndTranscribe\` is not implemented: unknown_method.${
  site.name === "core-storage"
    ? `\n- fetch() of your own files from page script is refused on this host (see Files you show the reader).` +
      `\n- Your own files are carried inside the entry document rather than served as files, because this host cannot authorise a sandboxed document's own requests. That is why they count against the document's size limits.`
    : ""
}`;
