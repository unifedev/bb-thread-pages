/**
 * The design system carried by the default seed: five worlds, each with a
 * light and a dark palette, keyed off semantic HTML. Reviewed from the
 * prototype, not redesigned (RW-16). A page owns its copy and may change
 * any rule. spec R4.36, R4.37
 */
export const THEME_CSS = String.raw`
  :root {
    --bg:        #fbfbfa;
    --surface:   #ffffff;
    --ink:       #16181d;
    --ink-2:     #4a5058;
    --ink-3:     #767d87;
    --rule:      #e3e4e6;
    --rule-soft: #eeeff0;
    --accent:    #2f5cc7;
    --flag:      #a8410f;
    --ok:        #1f6b45;
    --code-bg:   #f2f3f4;
    --measure:   34rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:        #121316;
      --surface:   #191b1f;
      --ink:       #e9eaec;
      --ink-2:     #b0b5bc;
      --ink-3:     #838a93;
      --rule:      #2c2f35;
      --rule-soft: #232227;
      --accent:    #8aa9f0;
      --flag:      #e8a37a;
      --ok:        #79c69d;
      --code-bg:   #22242a;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }

  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 400 16.5px/1.6 ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    font-feature-settings: "kern", "liga";
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  .wrap {
    max-width: calc(var(--measure) + 6rem);
    margin: 0 auto;
    padding: 4.5rem 3rem 8rem;
  }
  @media (max-width: 640px) { .wrap { padding: 2.5rem 1.25rem 5rem; } }

  /* ---- header ---- */

  header.brief-head {
    padding-bottom: 1.75rem;
    margin-bottom: 3rem;
    border-bottom: 1px solid var(--rule);
  }
  header.brief-head h1 {
    margin: 0;
    font-size: 1.9rem;
    line-height: 1.2;
    font-weight: 640;
    letter-spacing: -0.021em;
    text-wrap: balance;
  }
  .brief-meta {
    margin: 0.85rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1.15rem;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* ---- rhythm ---- */

  main > * + * { margin-top: 1.05rem; }

  h2 {
    margin: 3rem 0 0;
    font-size: 1.16rem;
    line-height: 1.3;
    font-weight: 620;
    letter-spacing: -0.012em;
  }
  h2 + * { margin-top: 0.85rem; }

  h3 {
    margin: 2rem 0 0;
    font-size: 0.94rem;
    line-height: 1.35;
    font-weight: 640;
    letter-spacing: 0.005em;
    color: var(--ink-2);
  }
  h3 + * { margin-top: 0.6rem; }

  p, li { max-width: var(--measure); color: var(--ink-2); }
  p { margin: 0; }
  main > p:first-child { font-size: 1.06rem; color: var(--ink); }

  ul, ol { margin: 0; padding-left: 1.3rem; }
  li + li { margin-top: 0.42rem; }
  li::marker { color: var(--ink-3); }

  strong { font-weight: 620; color: var(--ink); }
  em { font-style: italic; }

  a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { text-decoration-thickness: 2px; }

  code {
    font: 0.85em/1.5 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    background: var(--code-bg);
    padding: 0.13em 0.36em;
    border-radius: 4px;
  }
  pre {
    margin: 0;
    background: var(--code-bg);
    border: 1px solid var(--rule-soft);
    border-radius: 8px;
    padding: 0.9rem 1.05rem;
    overflow-x: auto;
    font: 0.83rem/1.6 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
  }
  pre code { background: none; padding: 0; }

  hr {
    margin: 3rem 0;
    border: 0;
    border-top: 1px solid var(--rule);
  }

  /* ---- callouts: use sparingly ---- */

  .card {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1.15rem 1.3rem;
  }
  .card > * + * { margin-top: 0.7rem; }
  .card > h3:first-child { margin-top: 0; }

  .needs-you {
    border-left: 3px solid var(--flag);
    padding: 0.15rem 0 0.15rem 1.05rem;
  }
  .needs-you > * + * { margin-top: 0.55rem; }

  .label {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 660;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--flag);
  }
  .label.done { color: var(--ok); }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.55rem 0.9rem 0.55rem 0;
    border-bottom: 1px solid var(--rule-soft);
    vertical-align: top;
  }
  th {
    font-weight: 620;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  td { color: var(--ink-2); }

  /* ---- forms ----------------------------------------------------------
     Styled off semantic structure, not classes, so a page only ever needs
     plain HTML: fieldset/legend for a group, a wrapping label for a single
     control, small for a hint, button for an action. ------------------- */

  form {
    margin-top: 1.75rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1.4rem 1.45rem 1.3rem;
  }
  form > * + * { margin-top: 1.25rem; }

  /* 'margin: 0' here used to beat 'form > * + *' on specificity, so two groups
     of choices in a row ran together with no gap between them. */
  form fieldset { padding: 0; border: 0; min-width: 0; }
  form > fieldset { margin: 0; }
  form > fieldset + fieldset,
  form > * + fieldset,
  form > fieldset + * { margin-top: 1.25rem; }
  form legend,
  form > label,
  .field > label {
    display: block;
    padding: 0;
    font-size: 0.82rem;
    font-weight: 620;
    letter-spacing: 0.005em;
    color: var(--ink);
  }
  form legend { margin-bottom: 0.5rem; }

  form small, .field .hint {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--ink-3);
  }

  form input[type="file"] {
    display: block; margin-top: 0.45rem; font: inherit; font-size: 0.85rem;
    color: var(--ink-2); max-width: 100%;
  }
  form input[type="file"]::file-selector-button {
    font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * 0.6);
    padding: 0.35rem 0.75rem; margin-right: 0.6rem;
  }
  form input[type="text"], form input[type="number"], form input[type="url"],
  form input[type="email"], form input[type="date"], form textarea, form select {
    display: block;
    width: 100%;
    margin-top: 0.45rem;
    font: inherit;
    font-size: 0.92rem;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--rule);
    border-radius: 7px;
    padding: 0.5rem 0.65rem;
  }
  form textarea { resize: vertical; min-height: 4.5rem; line-height: 1.55; }
  form :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  /* One option row: a label wrapping a radio or checkbox. */
  form label:has(> input[type="radio"]),
  form label:has(> input[type="checkbox"]),
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--ink-2);
    cursor: pointer;
  }
  form label:has(> input[type="radio"]) + label,
  form label:has(> input[type="checkbox"]) + label,
  .choice + .choice { margin-top: 0.4rem; }
  form input[type="radio"], form input[type="checkbox"] {
    margin: 0.3rem 0 0;
    flex: none;
    accent-color: var(--accent);
  }

  form label:has(> input[type="range"]) {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--ink-2);
  }
  form input[type="range"] { flex: 1; min-width: 8rem; accent-color: var(--accent); }
  [data-thread-page-range] {
    flex: none;
    min-width: 2.2rem;
    text-align: right;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  [data-thread-page-status] {
    margin-top: 0.9rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--ink-3);
  }
  [data-thread-page-status][data-state="error"] { color: var(--flag); }
  [data-thread-page-status][data-state="sent"] { color: var(--ok); }

  @media print {
    body { background: #fff; color: #000; }
    .wrap { padding: 0; max-width: none; }
    form { display: none; }
  }
  /* ====================================================================
     FIVE WORLDS

     A theme here is not a palette. It is a palette, a typeface, a shape
     language, a way a screen arrives, an atmosphere, and — the part that
     matters most — its own idea of what an interactive thing looks like.
     Picking one changes how you choose and how you commit, not just what
     it costs to look at.

     Each theme declares both palettes at once as --l-* and --d-*; one
     resolver below maps the live half onto the tokens the base stylesheet
     already uses. The same declarations carry [data-world="x"], which is how
     a card on screen 1 renders a fragment of a page in a world you have not
     entered yet.
     ==================================================================== */

  /* ---- 1. paper — quiet document. Nothing to notice. ---- */
  [data-theme="paper"], [data-world="paper"] {
    --l-bg:#fbfbfa; --l-surface:#ffffff; --l-ink:#16181d; --l-ink-2:#4a5058;
    --l-ink-3:#6c737c; --l-rule:#e3e4e6; --l-rule-soft:#eeeff0; --l-code:#f2f3f4;
    --l-ah:222; --l-as:62; --l-al:48; --l-flag:#a8410f; --l-ok:#1f6b45;
    --d-bg:#121316; --d-surface:#191b1f; --d-ink:#e9eaec; --d-ink-2:#b0b5bc;
    --d-ink-3:#838a93; --d-rule:#2c2f35; --d-rule-soft:#232227; --d-code:#22242a;
    --d-ah:222; --d-as:70; --d-al:74; --d-flag:#e8a37a; --d-ok:#79c69d;
    --font-body: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:10px; --rule-w:1px; --head-weight:640; --head-track:-0.021em;
    --measure:34rem; --shadow:none; --label-case:uppercase; --caps-track:0.07em;
    --h1-size:1.9rem; --h1-lh:1.2;
  }

  /* ---- 2. terminal — console. Everything on a grid, nothing rounded. ---- */
  [data-theme="terminal"], [data-world="terminal"] {
    --l-bg:#f6f6f2; --l-surface:#ffffff; --l-ink:#15201a; --l-ink-2:#3c4a42;
    --l-ink-3:#646f69; --l-rule:#c9d2cb; --l-rule-soft:#e2e7e2; --l-code:#eaeee9;
    --l-ah:150; --l-as:88; --l-al:26; --l-flag:#a33a10; --l-ok:#14663c;
    --d-bg:#080b09; --d-surface:#0d120e; --d-ink:#cfe6d5; --d-ink-2:#94b39d;
    --d-ink-3:#6b8573; --d-rule:#20301e; --d-rule-soft:#161f16; --d-code:#111811;
    --d-ah:150; --d-as:64; --d-al:62; --d-flag:#e0a44f; --d-ok:#63d18e;
    --font-body: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    --font-head: var(--font-body);
    --radius:0px; --rule-w:1px; --head-weight:700; --head-track:0em;
    --measure:33rem; --shadow:none; --label-case:uppercase; --caps-track:0.14em;
    --h1-size:1.6rem; --h1-lh:1.25;
  }

  /* ---- 3. atrium — daylight on paper. Warm, serif, things have weight. ---- */
  [data-theme="atrium"], [data-world="atrium"] {
    --l-bg:#f6f2e9; --l-surface:#fffdf8; --l-ink:#1e1a14; --l-ink-2:#4b4337;
    --l-ink-3:#726958; --l-rule:#ddd5c4; --l-rule-soft:#ebe5d8; --l-code:#efe9db;
    --l-ah:142; --l-as:34; --l-al:30; --l-flag:#8a4b18; --l-ok:#2c5f3f;
    --d-bg:#16150f; --d-surface:#1f1d15; --d-ink:#f1ebdc; --d-ink-2:#c2b9a3;
    --d-ink-3:#8f8672; --d-rule:#33301f; --d-rule-soft:#262418; --d-code:#242216;
    --d-ah:130; --d-as:32; --d-al:66; --d-flag:#d99a5e; --d-ok:#8fc2a0;
    --font-body: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    --font-head: var(--font-body);
    --radius:14px; --rule-w:1px; --head-weight:600; --head-track:-0.008em;
    --measure:38rem;
    --shadow: 0 1px 2px rgba(40,30,10,.06), 0 10px 30px -14px rgba(40,30,10,.28);
    --label-case:none; --caps-track:0.02em;
    --h1-size:2.15rem; --h1-lh:1.15;
  }

  /* ---- 4. volume — depth. A lit scene with the page standing in it. ---- */
  [data-theme="volume"], [data-world="volume"] {
    --l-bg:#eef1f6; --l-surface:#ffffff; --l-ink:#0d1424; --l-ink-2:#3a4658;
    --l-ink-3:#5e687b; --l-rule:#ccd4e2; --l-rule-soft:#e0e6ef; --l-code:#e6ebf3;
    --l-ah:196; --l-as:78; --l-al:32; --l-flag:#9c4415; --l-ok:#136b58;
    --d-bg:#080b12; --d-surface:#111823; --d-ink:#dfe8f5; --d-ink-2:#a3b2c8;
    --d-ink-3:#74849b; --d-rule:#1e2a3c; --d-rule-soft:#151d2a; --d-code:#131b27;
    --d-ah:190; --d-as:82; --d-al:62; --d-flag:#e2a06b; --d-ok:#4fc7ad;
    --font-body: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:6px; --rule-w:1px; --head-weight:700; --head-track:-0.03em;
    --measure:34rem;
    --shadow: 0 2px 4px rgba(0,0,0,.18), 0 22px 40px -20px rgba(0,0,0,.45);
    --label-case:uppercase; --caps-track:0.11em;
    --h1-size:2.1rem; --h1-lh:1.1;
  }

  /* ---- 5. bloom — shapes and colour. Big type, soft mass, round everything. ---- */
  [data-theme="bloom"], [data-world="bloom"] {
    --l-bg:#fdf7f4; --l-surface:#ffffff; --l-ink:#1d1226; --l-ink-2:#4c3a59;
    --l-ink-3:#75647f; --l-rule:#ecdfe6; --l-rule-soft:#f5eef1; --l-code:#f6eef4;
    --l-ah:330; --l-as:62; --l-al:42; --l-flag:#b03d24; --l-ok:#2f6b58;
    --d-bg:#150e1c; --d-surface:#211729; --d-ink:#f4ecf6; --d-ink-2:#c0aecb;
    --d-ink-3:#95839f; --d-rule:#33243d; --d-rule-soft:#261a2e; --d-code:#281c32;
    --d-ah:326; --d-as:76; --d-al:72; --d-flag:#f0a184; --d-ok:#7fd0b4;
    --font-body: "Avenir Next", Avenir, "Futura", ui-rounded, ui-sans-serif, -apple-system, system-ui, sans-serif;
    --font-head: var(--font-body);
    --radius:22px; --rule-w:1.5px; --head-weight:700; --head-track:-0.035em;
    --measure:32rem;
    --shadow: 0 2px 6px rgba(60,20,60,.06), 0 18px 40px -18px rgba(60,20,60,.22);
    --label-case:none; --caps-track:0.03em;
    --h1-size:2.6rem; --h1-lh:1.02;
  }

  /* ---- the resolver: which half of a palette is live ---- */

  :root, [data-world] {
    --bg:var(--l-bg); --surface:var(--l-surface); --ink:var(--l-ink);
    --ink-2:var(--l-ink-2); --ink-3:var(--l-ink-3); --rule:var(--l-rule);
    --rule-soft:var(--l-rule-soft); --code-bg:var(--l-code);
    --ah:var(--l-ah); --as:var(--l-as); --al:var(--l-al);
    --flag:var(--l-flag); --ok:var(--l-ok);
  }
  @media (prefers-color-scheme: dark) {
    :root[data-mode="system"], :root[data-mode="system"] [data-world] {
      --bg:var(--d-bg); --surface:var(--d-surface); --ink:var(--d-ink);
      --ink-2:var(--d-ink-2); --ink-3:var(--d-ink-3); --rule:var(--d-rule);
      --rule-soft:var(--d-rule-soft); --code-bg:var(--d-code);
      --ah:var(--d-ah); --as:var(--d-as); --al:var(--d-al);
      --flag:var(--d-flag); --ok:var(--d-ok);
    }
  }
  :root[data-mode="dark"], :root[data-mode="dark"] [data-world] {
    --bg:var(--d-bg); --surface:var(--d-surface); --ink:var(--d-ink);
    --ink-2:var(--d-ink-2); --ink-3:var(--d-ink-3); --rule:var(--d-rule);
    --rule-soft:var(--d-rule-soft); --code-bg:var(--d-code);
    --ah:var(--d-ah); --as:var(--d-as); --al:var(--d-al);
    --flag:var(--d-flag); --ok:var(--d-ok);
  }

  /* Accent is composed, so the hue slider moves one number and saturation and
     lightness stay where the theme put them — which is what stops a dragged
     hue quietly failing contrast. */
  :root, [data-world] {
    --accent: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%));
    --accent-soft: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%) / 0.12);
    --accent-line: hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 1%) / 0.42);
  }

  /* ---- motion, declared at its reduced value ----
     Stillness is the default and movement is the enhancement, so a reader who
     asked for less and a reader who said nothing get the same page. */
  :root { --dur: 0ms; --slow: 0ms; --ease: cubic-bezier(.2,.75,.25,1); }
  @media (prefers-reduced-motion: no-preference) {
    :root { --dur: 220ms; --slow: 620ms; }
  }

  /* ---- density: two numbers the reader drags ---- */
  :root { --space: 1; --size: 16.5px; }

  body { font-family: var(--font-body); font-size: var(--size); }
  h1, h2, h3, legend, .h { font-family: var(--font-head); }
  /* The base sheet sizes the h1 through 'header.brief-head h1', which outranks a
     bare 'h1' — so the world's own display scale has to be stated there too. */
  header.brief-head h1, h1 {
    font-size: var(--h1-size); line-height: var(--h1-lh);
    font-weight: var(--head-weight); letter-spacing: var(--head-track);
  }
  h2 { font-weight: var(--head-weight); letter-spacing: var(--head-track); }
  p, li { max-width: var(--measure); }

  /* Prose stays inside --measure through 'p, li'; the page itself is wider so a
     picker is not forced into one column. */
  .wrap { max-width: calc(var(--measure) + 12rem);
          padding: calc(3rem * var(--space)) 3rem calc(5rem * var(--space)); }
  /* This rule sits after the base sheet's own narrow-screen padding and so
     replaced it. On a 320 px screen that was 48 px of gutter each side — a
     third of the width — until it was measured. */
  @media (max-width: 40rem) {
    .wrap { padding: calc(2.2rem * var(--space)) 1.15rem calc(4rem * var(--space)); }
  }
  main > * + * { margin-top: calc(1.05rem * var(--space)); }
  h2 { margin-top: calc(2.4rem * var(--space)); }
  h2 + * { margin-top: calc(0.8rem * var(--space)); }
  .card { border-radius: var(--radius); box-shadow: var(--shadow);
          padding: calc(1.1rem * var(--space)) 1.25rem; }
  form { border-radius: var(--radius); box-shadow: var(--shadow); }
  pre, code { border-radius: calc(var(--radius) * 0.35); }
  th, .label { text-transform: var(--label-case); letter-spacing: var(--caps-track); }
  hr, header.brief-head { border-color: var(--rule); }
  header.brief-head { border-bottom-width: var(--rule-w); }

  body { transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease); }

  /* ---- atmosphere -----------------------------------------------------
     Every peak colour below is opaque and sits a few percent from its own
     --bg, so the composite between them is bounded by two colours that can
     both be measured. That is what makes an atmosphere layer checkable
     rather than hoped about, and the page is complete with it off. */

  [data-theme="paper"],    [data-world="paper"]    { --l-atmos-1:#fbfbfa; --l-atmos-2:#fbfbfa; --d-atmos-1:#121316; --d-atmos-2:#121316; }
  [data-theme="terminal"], [data-world="terminal"] { --l-atmos-1:#f0f2ec; --l-atmos-2:#f2f4ef; --d-atmos-1:#0b110c; --d-atmos-2:#091009; }
  [data-theme="atrium"],   [data-world="atrium"]   { --l-atmos-1:#fdf8ec; --l-atmos-2:#f2ecdf; --d-atmos-1:#1e1c13; --d-atmos-2:#100f0a; }
  [data-theme="volume"],   [data-world="volume"]   { --l-atmos-1:#ffffff; --l-atmos-2:#e4e9f1; --d-atmos-1:#101927; --d-atmos-2:#04060a; }
  [data-theme="bloom"],    [data-world="bloom"]    { --l-atmos-1:#fbe9f1; --l-atmos-2:#ebf1fd; --d-atmos-1:#241430; --d-atmos-2:#10182c; }

  :root, [data-world] { --atmos-1:var(--l-atmos-1); --atmos-2:var(--l-atmos-2); }
  @media (prefers-color-scheme: dark) {
    :root[data-mode="system"], :root[data-mode="system"] [data-world] {
      --atmos-1:var(--d-atmos-1); --atmos-2:var(--d-atmos-2);
    }
  }
  :root[data-mode="dark"], :root[data-mode="dark"] [data-world] {
    --atmos-1:var(--d-atmos-1); --atmos-2:var(--d-atmos-2);
  }

  html { background: var(--bg); }
  body { background: none; }

  .atmosphere { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
  :root[data-atmos="off"] .atmosphere { display: none; }

  :root[data-theme="paper"] .atmosphere { display: none; }

  /* terminal: a faint character grid, because that is what it is made of */
  :root[data-theme="terminal"] .atmosphere {
    background-image:
      linear-gradient(to right, var(--atmos-1) 1px, transparent 1px),
      linear-gradient(to bottom, var(--atmos-1) 1px, transparent 1px);
    background-size: 1.1rem 1.65rem;
  }
  /* atrium: light from the upper left, and the floor falling away */
  :root[data-theme="atrium"] .atmosphere {
    background:
      radial-gradient(70rem 42rem at 12% -12%, var(--atmos-1), transparent 68%),
      linear-gradient(to bottom, transparent 55%, var(--atmos-2));
  }
  /* volume: one light source and a hard vignette, so the page reads as an object */
  :root[data-theme="volume"] .atmosphere {
    background:
      radial-gradient(46rem 34rem at 50% -8%, var(--atmos-1), transparent 62%),
      radial-gradient(90rem 70rem at 50% 120%, var(--atmos-2), transparent 70%);
  }
  /* bloom: mass and colour, nothing representational */
  :root[data-theme="bloom"] .atmosphere {
    background:
      radial-gradient(32rem 32rem at 8% 4%, var(--atmos-1), transparent 62%),
      radial-gradient(28rem 28rem at 96% 22%, var(--atmos-2), transparent 60%),
      radial-gradient(38rem 26rem at 40% 108%, var(--atmos-1), transparent 66%);
  }


  /* ====================================================================
     THE WORLD, APPLIED TO A PAGE

     Above this line is the design system: five worlds, one resolver. Below
     it is how a page written in plain semantic HTML picks the current world
     up — no class names, because the authoring rule is that a page is plain
     HTML and the conventions live here.

     To change the whole system's look, change one attribute on <html>:
         data-theme="paper | terminal | atrium | volume | bloom"
     ==================================================================== */

  /* ---- choosing: how a picked option reads, per world ---------------- */

  form label:has(> input[type="radio"]),
  form label:has(> input[type="checkbox"]) {
    flex-wrap: wrap;
    padding: 0.28rem 0.5rem;
    margin-left: -0.5rem;
    border-radius: calc(var(--radius) * 0.6);
    transition: transform var(--dur) var(--ease), background-color var(--dur) var(--ease),
                box-shadow var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  /* A hint belongs under the option it qualifies, not squeezed beside it. */
  form label:has(> input[type="radio"]) > small,
  form label:has(> input[type="checkbox"]) > small {
    flex: 0 0 100%; margin-left: 1.35rem; margin-top: 0.2rem;
  }
  form label:has(input:checked) { color: var(--ink); }

  :root[data-theme="paper"] form label:has(input:checked) {
    box-shadow: inset 2px 0 0 var(--accent);
  }

  /* terminal draws its own control, because a native radio is not made of
     characters and everything else in this world is */
  :root[data-theme="terminal"] form input[type="radio"],
  :root[data-theme="terminal"] form input[type="checkbox"] { position: absolute; opacity: 0; }
  :root[data-theme="terminal"] form label:has(> input[type="radio"])::before,
  :root[data-theme="terminal"] form label:has(> input[type="checkbox"])::before {
    content: "[ ]"; flex: none; color: var(--ink-3); letter-spacing: -0.05em;
  }
  :root[data-theme="terminal"] form label:has(input:checked)::before {
    content: "[\2588]"; color: var(--accent);
  }
  :root[data-theme="terminal"] form label:has(input:checked) { background: var(--rule-soft); }
  :root[data-theme="terminal"] form label:has(> input[type="radio"]) > small,
  :root[data-theme="terminal"] form label:has(> input[type="checkbox"]) > small { margin-left: 2.1rem; }

  :root[data-theme="atrium"] form label:has(input:checked) {
    background: var(--surface); transform: translateY(-2px); box-shadow: var(--shadow);
  }

  :root[data-theme="volume"] form fieldset { perspective: 900px; }
  :root[data-theme="volume"] form label:has(input:checked) {
    background: var(--surface); box-shadow: var(--shadow);
    border-left: 2px solid var(--accent);
    transform: rotateY(-2.2deg) translateZ(16px);
  }

  :root[data-theme="bloom"] form label:has(> input[type="radio"]),
  :root[data-theme="bloom"] form label:has(> input[type="checkbox"]) {
    border-radius: 99px; margin-left: 0; padding: 0.34rem 0.85rem;
  }
  :root[data-theme="bloom"] form label:has(input:checked) {
    background: var(--accent); color: var(--bg);
  }

  /* ---- committing: the primary action in the world's own material -----
     Scoped to a form's own children so the dictation button, which lives
     inside a .voice-field, keeps its own shape. */

  form > button, form > p > button {
    font: inherit; font-size: 0.9rem; font-weight: 640; cursor: pointer;
    color: var(--bg); background: var(--accent);
    border: var(--rule-w) solid var(--accent);
    border-radius: calc(var(--radius) * 0.7);
    padding: 0.55rem 1.15rem;
    transition: transform var(--dur) var(--ease), filter var(--dur) var(--ease),
                box-shadow var(--dur) var(--ease);
  }
  form > button + button, form > p > button + button { margin-left: 0.45rem; }
  form > button:first-of-type, form > p > button:first-of-type {
    color: var(--bg); background: var(--accent); border-color: var(--accent);
  }
  /* A second button is the alternative, not a rival. */
  form > button:not(:first-of-type), form > p > button:not(:first-of-type) {
    color: var(--accent); background: transparent; border-color: var(--rule);
  }
  form > button:hover:not(:disabled), form > p > button:hover:not(:disabled) { filter: brightness(1.08); }
  form > button:disabled, form > p > button:disabled { opacity: 0.5; cursor: default; filter: none; }

  :root[data-theme="terminal"] form > button:first-of-type,
  :root[data-theme="terminal"] form > p > button:first-of-type {
    background: var(--surface); color: var(--accent); border-color: var(--rule);
  }
  :root[data-theme="terminal"] form > button:hover:not(:disabled),
  :root[data-theme="terminal"] form > p > button:hover:not(:disabled) { border-color: var(--accent); }

  :root[data-theme="atrium"] form > button:first-of-type,
  :root[data-theme="atrium"] form > p > button:first-of-type { border-radius: 99px; box-shadow: var(--shadow); }

  /* volume commits by pressing an object, so the button is one: a lit face
     over a darker edge that the press pushes into the surface */
  :root[data-theme="volume"] form > button:first-of-type,
  :root[data-theme="volume"] form > p > button:first-of-type {
    box-shadow: 0 2px 0 hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 0.6%)),
                0 8px 16px -8px rgba(0, 0, 0, 0.55);
  }
  :root[data-theme="volume"] form > button:active:not(:disabled),
  :root[data-theme="volume"] form > p > button:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: 0 0 0 hsl(var(--ah) calc(var(--as) * 1%) calc(var(--al) * 0.6%));
  }

  :root[data-theme="bloom"] form > button:first-of-type,
  :root[data-theme="bloom"] form > p > button:first-of-type {
    border-radius: 99px; padding: 0.6rem 1.35rem; font-weight: 700;
  }
`;
