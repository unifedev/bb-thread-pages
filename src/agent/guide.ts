import type { CapabilityRegistry } from "../domain/capabilities/registry.ts";
import { LIMITS, kibibytes, mebibytes } from "../domain/limits.ts";
import { ENTRY_FILE, UPLOAD_DIR } from "../pages/layout.ts";
import type { SiteStrategy } from "../pages/site.ts";

/**
 * The authoring guide, printed by `bb thread-page guide`. Assembled from
 * prose, the limits table and the capability registry at load, so every
 * number and every capability in it is the implementation's own.
 * spec R6.24–R6.26
 */
export function buildGuide(registry: CapabilityRegistry, site: SiteStrategy): string {
  return [
    intro(),
    plainHtml(),
    forms(),
    uploads(),
    ownFiles(site),
    runtimeApi(),
    capabilities(registry),
    startingSessions(),
    network(),
    unavailable(),
    composition(),
    home(),
    accessibility(),
    limits(),
    limitations(site),
  ].join("\n\n");
}

const intro = () => `# Thread Pages — authoring guide

A page is a complete HTML document you edit directly; saving publishes it. It
runs in a sandboxed frame on an opaque origin with no host credentials, and
talks to the host only through captured forms and \`window.threadPage\`. Use
the smallest shape that makes the task easier: plain semantic HTML first, a
mini-app only when the shape of the thing is not prose.

Your page root is your session's storage directory (\`$BB_THREAD_STORAGE\`):

    ${ENTRY_FILE}       the entry document — the page
    <any files>      served beside it, nested directories included
    ${UPLOAD_DIR}/         files the reader attached, named by the host`;

const plainHtml = () => `## What plain HTML already gives you

The seed carries its own stylesheet, so semantic HTML is already styled.

    h2, p, ul, table      the page's type scale and rhythm
    form                  a panel wired to your session, with a status line
    fieldset + legend     a named group; the legend becomes the question
    label wrapping one    the label becomes that answer's name
    small inside a label  a hint (never part of the answer's name)
    input type=range      a slider with a live value readout
    input type=file       uploaded on submit, path sent to you
    details/summary       detail on demand; add name="x" for an accordion
    div.card              a boxed aside
    p.needs-you           a flagged block, for what is blocked on the reader
    span.label            a small uppercase tag

Three class names; everything else keys off what the element is. The look is
three attributes on <html>: data-theme (paper | terminal | atrium | volume |
bloom), data-mode (system | light | dark), data-atmos (on | off). Extra CSS
goes in one more <style>, everything inside @scope (main), colour and shape
from var(--token) only — that is what keeps a bespoke chart right in every
world and in dark mode. You may replace the stylesheet entirely; the page is
yours.`;

const forms = () => `## Forms

Every <form> in the document is captured and delivered to your session as a
message — no JavaScript needed. Add data-thread-page-manual to a form your
own script owns; the host then leaves it entirely alone.

- Nothing is required and blank is a real answer: native validation is
  suppressed, and a blank field arrives as "(left blank)".
- Answer names come from, in order: data-label on the control, the enclosing
  fieldset's legend, aria-label, the wrapping label's text, a <label for>,
  the field name. Hints, options and nested controls are excluded.
- Groups collapse: one checkbox is Yes/No; several checkboxes with one name
  are a list of the checked values; radios are the one checked value or
  blank; a multiple <select> is a list.
- The submit button's value leads the message as **Action**, so several
  <button name="action" value="…"> give one-click answers.
- Each form has its own pending, dirty and status state. While a submission
  is in flight its controls are disabled; afterwards the status line says
  "Sent (queued)" or why it failed.
- Typing into a captured form marks the page dirty, so a new version of the
  page does not reload under the reader. Custom state the host cannot see:
  window.threadPage.setDirty(true|false).

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
not yours to write.${
  site.name === "core-storage"
    ? `

**One limitation on this host:** \`fetch("data.json")\` of your own file from
page script is refused (403) — the host's file route rejects the sandbox's
\`Origin: null\`. Subresources (<script>, <link>, <img>) load normally, so
load data with <script src="data.js"> or inline it in the document. Remote
fetches work (see Network).`
    : `

Page script may also fetch its own files as data: \`await fetch("data.json")\`.`
}`;

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

const network = () => `## Network

Pages have internet access: fetch any origin, load remote fonts, scripts,
stylesheets, images and media, open WebSockets. The page still holds no host
credential — reaching a URL and acting as the host are different things.

Two consequences to know: page script runs in the reader's browser, so it can
reach what that device can reach, including its own network; and script can
navigate its own frame with data in the URL. Both are accepted, documented
properties of the model, not bugs to work around.`;

const unavailable = () => `## What the sandbox silences

These do nothing, silently — the worst failure mode — so never rely on them:

- \`window.open\` — use \`pages.open\` for another page, \`sessions.openHost\`
  for the host application, and a plain <a href="https://…"> or
  \`navigation.openExternal\` for the web.
- \`window.prompt\`, \`alert\`, \`confirm\` — build the input or the question into
  the page (an <input>, a <dialog> with data-thread-page-manual, a second
  form), or use a confirmed capability, which renders its own dialog.
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
and then stopped.`;

const home = () => `## The home page

One page is home; every other page shows a "← Sessions" link back to it in
chrome you never write. \`bb thread-page home\` sets the pointer for the
current session (\`--clear\` removes it) and creates the plain seed if the
session has no page yet; it never touches an existing page. Home is an
ordinary page — a hub is one an agent builds, and the right place to build it
is a session dedicated to it, so nothing else ever rewrites it.

### Setting one up, step by step

1. In the session that should own it (start one for the purpose if you are
   mid-task), run \`bb thread-page home\`. It prints the link every page will
   carry.
2. Replace <main> in that session's index.html with a hub like the one
   below, then stop. The page stays put because its buttons start fresh
   sessions or open other pages; nothing messages this session.
3. Tell the reader the link and that the hub is theirs to change: they can
   ask this session to regroup, restyle or add jobs any time.

### A starter hub

Complete and working as written; drop it into <main>. It lists sessions by
project, opens a page or the session in bb, starts work in a project, and
keeps the reader's collapsed groups in \`storage\`.

    <p class="brief-meta"><span data-count>Loading…</span></p>
    <p data-error class="needs-you" hidden></p>
    <div data-groups></div>

    <style>
    @scope (main) {
      details { margin-top: 1.25rem; }
      summary { cursor: pointer; font-weight: 600; }
      .row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; padding: .5rem 0; border-top: var(--rule-w) solid var(--rule-soft); }
      .row .name { flex: 1 1 14rem; }
      .row .state { font-size: .8rem; color: var(--ink-3); }
      .starter { margin-top: .75rem; }
      .starter textarea { width: 100%; min-height: 3.5rem; }
    }
    </style>

    <script>
    (async () => {
      const tp = window.threadPage;
      const groupsEl = document.querySelector("[data-groups]");
      const errorEl = document.querySelector("[data-error]");
      const countEl = document.querySelector("[data-count]");
      const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
      const fail = (message) => { errorEl.hidden = false; errorEl.textContent = message; };

      async function loadOpen() {
        try { const r = await tp.invoke("storage.get", { key: "home.open" }); return r.found ? r.value : {}; } catch { return {}; }
      }

      function actionButton(label, run) {
        const b = el("button", label); b.type = "button";
        b.addEventListener("click", async () => {
          b.disabled = true;
          try { await run(); }
          catch (e) { if (e.code !== "cancelled") fail(e.code + ": " + e.message); }
          finally { b.disabled = false; }
        });
        return b;
      }

      function renderRow(s) {
        const row = el("div", "", "row");
        row.append(el("span", s.title, "name"), el("span", s.status, "state"));
        if (s.page.available) row.append(actionButton("Page", () => tp.invoke("pages.open", { sessionId: s.id })));
        row.append(actionButton("Open in bb", () => tp.invoke("sessions.openHost", { sessionId: s.id })));
        if (s.status === "working") row.append(actionButton("Stop", () => tp.invoke("sessions.stop", { sessionId: s.id })));
        return row;
      }

      function renderStarter(project) {
        const box = el("details", "", "starter");
        box.append(el("summary", "Start a session in " + project.name));
        const text = el("textarea"); text.placeholder = "What should it do? Say what to report and what not to change.";
        const say = el("p", "", "state");
        const go = actionButton("Start", async () => {
          const prompt = text.value.trim();
          if (!prompt) { say.textContent = "Say what it should do."; return; }
          say.textContent = "Waiting for your confirmation…";
          try { await tp.invoke("sessions.start", { projectId: project.id, prompt }); say.textContent = "Started."; text.value = ""; await load(); }
          catch (e) { say.textContent = e.code === "cancelled" ? "Nothing started." : e.message; }
        });
        box.append(text, go, say);
        return box;
      }

      async function load() {
        try {
          errorEl.hidden = true;
          const [{ projects }, { sessions }, open] = await Promise.all([
            tp.invoke("projects.list"), tp.invoke("sessions.snapshot", { limit: 200 }), loadOpen(),
          ]);
          groupsEl.textContent = "";
          for (const project of projects) {
            const mine = sessions.filter((s) => s.projectId === project.id).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
            const group = el("details"); group.open = open[project.id] !== false;
            group.addEventListener("toggle", () => { open[project.id] = group.open; tp.invoke("storage.set", { key: "home.open", value: open }).catch(() => {}); });
            group.append(el("summary", project.name + " · " + mine.length));
            for (const s of mine) group.append(renderRow(s));
            group.append(renderStarter(project));
            groupsEl.append(group);
          }
          countEl.textContent = sessions.length + " sessions · updated " + new Date().toLocaleTimeString();
        } catch (e) { fail(e.message); }
      }

      await load();
      tp.watch("session.activity", { limit: 1 }, () => load(), { intervalMs: 20000 });
    })();
    </script>

Refresh on a button or a slow watch, not on a tight timer: the page shares a
rate budget of ${LIMITS.ratePerMinute} requests a minute with its own forms. Grouping is
yours to change: a group can be any set of projects, and \`data-theme\` on a
group's element can give it its own look.`;

const accessibility = () => `## Before you save

- Read it once at 320px wide, once in dark mode, once with reduced motion.
- Every action reachable by keyboard; nothing pointer-only.
- Inline SVG for diagrams and charts, with var(--accent) inside it; a zero
  gets a visible stub or the eye reads missing data.
- grep -o '#[0-9a-fA-F]\\{3,8\\}' ${ENTRY_FILE} inside your <style> should be empty.`;

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
  site.name === "core-storage" ? `\n- fetch() of your own files from page script is refused on this host (see Files you show the reader).` : ""
}`;
