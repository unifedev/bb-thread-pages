import { escapeHtml } from "../../domain/html/escape.ts";
import { THEME_CSS } from "./theme-css.ts";

/**
 * The document a new page starts from: complete, valid, with a working
 * captured form, its own stylesheet, and a short comment stating the
 * conventions while the agent is already reading the file. spec R6.18–R6.23
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
    Everything below is yours: this whole file, including the stylesheet in
    the head. Rewrite it however the task needs. Two things the file cannot
    tell you, because they are behaviour rather than markup:

    1. Every form element in this document is captured and delivered to this
       session as a message. That includes a dialog form you only meant as a
       local confirm; put data-thread-page-manual on any form that is not
       meant to answer. Nothing is required and blank is a real answer.
    2. window.prompt, alert, confirm and window.open do nothing here — the
       sandbox silences them. Build the input into the page instead.

    The look is three attributes on the html element. data-theme: paper,
    terminal, atrium, volume or bloom. data-mode: system, light or dark.
    data-atmos: on or off.

    If this page should stay put — a dashboard, a console, a page nobody
    should have to rewrite — delete the reply form below and let its buttons
    start fresh sessions instead. See the guide.

    Everything else — files beside this one, charts, live session state,
    starting sessions, links, limits — is in: bb thread-page guide

    This comment deliberately names no HTML tags. An earlier version spelled
    them out, and every agent that edited its page by string surgery found
    tags here that were not in the document. Keep it that way.
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

/** Applies the seed's substitutions; both are escaped. spec R6.21 */
export function renderSeed(template: string, title: string, now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return template.replaceAll("{{TITLE}}", escapeHtml(title)).replaceAll("{{DATE}}", escapeHtml(date));
}
