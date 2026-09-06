import {
  DEFAULT_HOME_BODY,
  DEFAULT_HOME_SCRIPT,
  DEFAULT_HOME_STYLE,
} from "./home.js";
import { escapeHtml } from "./page.js";
import { THEME_CSS } from "./theme.js";

/**
 * The standing contract, injected into eligible root threads.
 *
 * It carries why the page matters and how to ask well, because those are what
 * actually change an agent's behaviour. Everything mechanical - form wiring,
 * styling, labels, blank handling - is absorbed by the runtime and the seed, so
 * none of it is spent here. Anything deeper is one guide command away, paid for
 * only by the sessions that need it.
 */
export const DEFAULT_AGENT_INSTRUCTION = `# The page is the conversation

The user does not read chat. Every turn you write or update one HTML page, they
read it and reply from inside it, and their answer arrives as your next message.
Everything they need must be on that page, and every action they might take must
be possible from it — including the ones you would rather they did not choose. A
page they cannot answer from is a dead end. Chat carries the link and one line.

Start every turn with \`bb thread-page init\`. It prints the page path and link.
Read an existing page before editing it; saving publishes it immediately and an
open page reloads itself. Update it on every turn, including small ones. If init
says SKIP this thread is a helper — answer in chat and stay off the page. When
you spawn threads of your own, parent them to yourself so they stay helpers.

## Every page ends with a way to answer

Any <form> is wired automatically: answers arrive as your next message. Write
plain semantic HTML — it is already styled, and there is nothing to remember.
<fieldset><legend> names a group, a wrapping <label> names one control, <small>
is a hint, and several <button name value> give one-click answers.

Asking well is most of the work. Answering should cost a click, not a paragraph:
buttons and radios for decisions, checkboxes for multi-select, free text only
where the answer is genuinely open. A range needs a scale that means something
and is easier to drag than to type — never a vague 1-to-5. Nothing is ever
required and blank is a real answer, so ask for everything that would help and
let them skip the rest. Always leave one open text field for what you failed to
anticipate: your form is their only way to redirect you, and a form that permits
only the answers you expect quietly takes the decision away from them.

## What belongs on the page

Only what they cannot skip: what you did, at the level they could explain it to
someone else; decisions that are genuinely theirs, with the options and your
recommendation; what only they can supply; anything they should sanity-check
because a wrong assumption of yours would be costly.

Every word necessary, nothing said twice. Each update leads with what changed and
has to stand alone, because they answer from that version without scrolling back.
Report failures, skipped steps and your own mistakes plainly. Conclusion first,
detail only if it changes what they do.

You own the work end to end: make the routine calls yourself, keep every file you
touch correct as you go, and escalate to the page rather than to chat.

## The home page

One thread's page is the home page, and every other page shows a Sessions link
back to it automatically — you never write that link yourself. Home is an
ordinary page: it should list the user's sessions with the threads.snapshot
capability and let them open, continue, or start one.

If the user asks for a home page, or asks where their sessions are, run
\`bb thread-page home\` in the thread that should own it and then build that page
against \`bb thread-page guide\`. Check whether one already exists before making
a second.

A page needing more than prose and a form — a chart, a branch, cards to swipe, a
file, live session control — runs \`bb thread-page guide\` first.`;

/**
 * The default new-page document.
 *
 * The design system travels in the page rather than being injected at render
 * time, so the agent can read and change every rule, and a later plugin update
 * never restyles a page the user has already read. Plain semantic HTML inside
 * <main> is fully styled by it; there are three class names in total.
 */
export const DEFAULT_PAGE_SEED = `<!doctype html>
<html lang="en" data-theme="volume" data-mode="system" data-atmos="on">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>{{TITLE}}</title>
  <style>${THEME_CSS}</style>
</head>
<body>
  <div class="atmosphere" aria-hidden="true"></div>
  <div class="wrap">

  <header class="brief-head">
    <h1>{{TITLE}}</h1>
    <p class="brief-meta"><span>{{DATE}}</span></p>
  </header>

  <!--
    Write inside the main element below. Plain semantic HTML is already styled:
    h2, p, ul, table, form, fieldset/legend, a wrapping label, small, details.
    Three class names exist: .card boxes an aside, .needs-you flags a block
    that is blocked on the reader, .label is a small uppercase tag.

    data-theme is paper | terminal | atrium | volume | bloom.
    data-mode is system | light | dark. data-atmos is on | off.

    Any extra CSS goes in one more style block, everything inside
    @scope (main), and colour and shape from var(--token) only — never a hex.
    That is what keeps a bespoke page correct in all five worlds and in dark.

    For charts, multi-screen flows, files, activity, or bridge methods:
      bb thread-page guide
  -->
  <main>
    <p>Replace this with what changed and what you need from the reader.</p>

    <form data-title="{{TITLE}}">
      <label>Reply
        <textarea name="reply" rows="4"></textarea>
      </label>
      <button name="action" value="Reply">Reply</button>
    </form>
  </main>

  </div>
</body>
</html>
`;

/**
 * The home page document: the same shell and stylesheet as any other page, with
 * a session hub already written into it. It is an ordinary page afterwards, so
 * the owning agent can restyle or regroup it on request.
 */
export function renderHomeSeed(template: string, now: Date = new Date()): string {
  const base = renderPageSeed(template, "Sessions", now);
  const bodyStart = base.indexOf("  <header class=\"brief-head\">");
  const bodyEnd = base.indexOf("  </div>\n</body>");
  if (bodyStart < 0 || bodyEnd < 0 || bodyEnd <= bodyStart) {
    // A custom seed we cannot splice: keep the user's own document rather than
    // silently replacing it, and let the agent write the hub itself.
    return base;
  }
  return (
    base.slice(0, bodyStart) +
    DEFAULT_HOME_BODY +
    `\n  <style>${DEFAULT_HOME_STYLE}</style>\n` +
    `  <script>${DEFAULT_HOME_SCRIPT}</script>\n\n` +
    base.slice(bodyEnd)
  );
}

export function renderPageSeed(
  template: string,
  title: string,
  now: Date = new Date(),
): string {
  const date = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return template
    .replaceAll("{{TITLE}}", escapeHtml(title))
    .replaceAll("{{DATE}}", escapeHtml(date));
}

export const AUTHORING_GUIDE = `# Thread Pages authoring guide

Use the smallest page shape that makes the task easier. Plain semantic HTML is
the default; a Thread Page may also be a complete HTML/CSS/JavaScript mini-app.
Saving the file publishes it.

## Built in

- Every non-manual <form> replies to this thread. Add
  data-thread-page-manual when your application owns submission.
- Blank answers are valid. Fieldset legends and labels become answer names.
- Multiple forms have independent pending and dirty state.
- A clicked submit button leads the message as Action.
- window.threadPage.setDirty(true|false) protects custom application state
  from an automatic page reload.
- window.threadPage.invoke(method, params) calls an enabled, validated BB
  capability. Run context.get to discover the current capability roster.

## What plain HTML already gives you

The seed carries the design system, so semantic HTML is already styled. You do
not need most of what follows; reach past prose only when the shape of the thing
genuinely is not prose.

  h2, p, ul, table    the page's type scale, rhythm, rules, tabular figures
  form                a panel, wiring to this thread, a status line
  fieldset + legend   a named group; the legend becomes the question
  label wrapping one  the label becomes that answer's name
  small in a label    a hint under the option
  input type=range    a slider with a live value readout
  input type=file     uploaded on submit, path sent to this thread
  details/summary     detail on demand; add name="x" for an accordion
  div class=card      a boxed aside
  p class=needs-you   a flagged block, for what is blocked on the reader
  span class=label    a small uppercase tag

Three class names. That is the whole vocabulary; everything else is selected by
what the element is.

## The look is three attributes

On <html>:

  data-theme   paper | terminal | atrium | volume | bloom
  data-mode    system | light | dark
  data-atmos   on | off

Each world sets a palette (both halves at once), a typeface, a shape language,
an atmosphere layer, and its own idea of what choosing and committing look like.
Changing the attribute reskins everything, including anything you built.

## The escape hatch

A page may carry one extra <style> block with two rules:

  1. Everything inside @scope (main). The browser enforces it, so a page cannot
     reach the shell.
  2. Tokens only. No hex, no rgb(). Colour and shape come from var(--...).

Rule 2 is what keeps a bespoke page inside the system: dark mode still works and
switching world reskins your chart too. A page that writes #3b82f6 is wrong half
the time and nobody notices until night.

Tokens: --bg --surface --ink --ink-2 --ink-3 --rule --rule-soft --code-bg
--accent --accent-soft --accent-line --flag --ok --font-body --font-head
--radius --rule-w --shadow --measure --space --size --h1-size --label-case
--caps-track --dur --ease

## Prefer native HTML first

- details/summary (and details name="x") for disclosure and accordions.
- input type="range" for an eyeballed scale; Thread Pages adds a live output.
- CSS :has() for simple branches — real different content, not a hidden field.
- overflow-x:auto plus scroll-snap for swipeable cards: a real swipe on a
  phone, a scrollbar on a desktop, arrow keys on a keyboard, in four lines.
- inline SVG for diagrams and charts; var(--accent) works inside it. Give a
  zero a visible stub bar or the eye reads it as missing data.
- animation-timeline: view() for scroll-linked motion, wrapped in
  @media (prefers-reduced-motion: no-preference) so still is the default.
- @starting-style with transition-behavior: allow-discrete for enter/exit.
- dialog, popover, container queries, color-mix(), and view transitions when
  they clarify the task.
- Respect prefers-reduced-motion and keep every action keyboard reachable.
  Never make something reachable only by pointer.

## Before you save

  grep -o '#[0-9a-fA-F]\{3,8\}' page.html   # inside your <style>: empty
  grep -c '@scope (main)' page.html          # 1 if you added a <style>

Then read it once at 320px wide, once in dark, once with reduced motion. Those
three are where a page that looks finished stops being one.

## Complete custom applications

Inline CSS and JavaScript, Web Components, SVG/canvas, internal routes, and
multi-step state are allowed inside the opaque sandbox. The page cannot read BB
cookies, the mutation token, parent DOM, localStorage, raw SDK/API, CLI, or
arbitrary files. Ordinary fetch and subresource networking are blocked unless a
confined resource is explicitly supplied.

Arbitrary JavaScript can still navigate its own sandboxed frame and encode
page/input data in the URL. The open mini-app model trusts authored code with
data already visible in its frame. Strong no-exfiltration requires a
declarative/no-authored-JavaScript page.

## The session hub, and the home page

One page is the home page; \`bb thread-page home\` designates the current
thread's. Every other page then shows a Sessions link back to it as chrome, so
no page writes that link. Home is an ordinary page — give it whatever design
suits, and render the list yourself:

  const { threads } = await window.threadPage.invoke("threads.snapshot", { limit: 50 });
  // each: id, title, projectId, parentThreadId, status, archived,
  //       page: { available, revision }, updatedAtMs

  await window.threadPage.invoke("threads.openPage", { threadId });   // its page
  await window.threadPage.invoke("threads.openBb", { threadId });     // in bb
  await window.threadPage.invoke("threads.continue", { threadId, prompt });
  await window.threadPage.invoke("threads.spawn", { projectId, prompt });
  await window.threadPage.invoke("threads.archive", { threadId });
  await window.threadPage.invoke("threads.stop", { threadId });

  const { projects } = await window.threadPage.invoke("projects.list", {});
  const { providers } = await window.threadPage.invoke("providers.list");

  // Folder picker, then create a project from the opaque selection token.
  const { selection } = await window.threadPage.invoke("projects.browse", {});
  if (selection) await window.threadPage.invoke("projects.create",
    { selectionToken: selection.token, name: "My project" });

  await window.threadPage.invoke("navigation.openExternal", { url, label });

  // Small state that survives a reload, scoped to this page.
  await window.threadPage.invoke("storage.set", { key: "wizard.step", value: 3 });
  const state = await window.threadPage.invoke("storage.get", { key: "wizard.step" });

Anything that changes another thread, archives, stops, creates a project, or
leaves bb shows a confirmation in trusted chrome first. You do not build that
and cannot word it; a declined action rejects with code "cancelled". Handle it.

## Current bridge

const context = await window.threadPage.invoke("context.get");
const stop = window.threadPage.watch(
  "thread.activity",
  { limit: 8 },
  (value) => renderActivity(value),
  { intervalMs: 8000 }
);

await window.threadPage.invoke("thread.reply", {
  title: "Diagram result",
  mode: "queue", // or "steer"
  result: { selectedNodes: ["a", "b"] },
  idempotencyKey: "optional-stable-key"
});

Call stop() when a watched component unmounts. A page that never calls watch
does no bridge polling.

## Files the user sends you

An automatic form may contain input type="file" (including multiple). On submit
the bytes are uploaded first, stored under this thread's confined upload
directory, and reported to you in the form message as:

  $BB_THREAD_STORAGE/thread-page-uploads/<generated-name>

Read them there with your normal tools. Each file must be under 24 MiB. Names
are generated by the plugin, so a hostile page cannot choose a path. Uploads
fail visibly on the page; they are never silently dropped.

## Files you show the user

Put sibling resources in:

  $BB_THREAD_STORAGE/thread-page-assets/

Reference them relatively (<img src="chart.png">, <link href="page.css">) or
resolve one explicitly:

  const url = window.threadPage.assetUrl("chart.png");

The directory is exposed to the page as one temporary, path-shaped preview and
is the only network origin the page's CSP allows. Names may use letters,
digits, dot, dash, and underscore only, with no subdirectories. When the
directory does not exist there is no asset base and assetUrl throws.

## Design ownership

The plugin does not impose a theme or component library. You may define any
task-specific visual system. Prefer CSS custom properties with light/dark
values so the page stays coherent, and test at a narrow mobile width.
`;
