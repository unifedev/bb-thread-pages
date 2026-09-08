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
    Write inside <main>. Plain semantic HTML is already styled: h2, p, ul,
    table, form, fieldset/legend, a wrapping label, small, details. Three
    class names exist: .card boxes an aside, .needs-you flags a block that is
    blocked on the reader, .label is a small uppercase tag.

    Every <form> answers this session automatically unless it carries
    data-thread-page-manual. Blank answers are valid. A <form method="dialog">
    you only meant as a local confirm still sends a message unless it opts out.

    Files you put beside this index.html are served relatively: <img
    src="chart.png">, <link href="page.css">, <script src="app.js">, nested
    paths included. Ordinary <a href="https://…"> links work.

    data-theme: paper | terminal | atrium | volume | bloom.
    data-mode: system | light | dark. data-atmos: on | off.
    Extra CSS goes in one more <style>, everything inside @scope (main),
    colour and shape from var(--token) only.

    Never use window.prompt, alert, confirm or window.open: the sandbox
    silences them. For anything more — charts, files, live session state,
    starting sessions, links — run: bb thread-page guide
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
