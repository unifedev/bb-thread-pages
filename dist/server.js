import { createRequire as __createRequire } from "node:module";
import { dirname as __pathDirname } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
const require = __createRequire(import.meta.url);
var __filename = __fileURLToPath(import.meta.url);
var __dirname = __pathDirname(__filename);

// server.ts
import { randomBytes } from "node:crypto";

// home.ts
var DEFAULT_HOME_BODY = String.raw`  <header class="brief-head">
    <h1>Sessions</h1>
    <p class="brief-meta">
      <span data-count>Loading…</span>
      <span data-updated></span>
    </p>
  </header>

  <main>
    <div class="toolbar">
      <input type="search" data-filter placeholder="Filter sessions…" aria-label="Filter sessions">
      <label class="inline"><input type="checkbox" data-show-idle checked> Show idle</label>
      <label class="inline"><input type="checkbox" data-show-archived> Show archived</label>
      <button type="button" data-refresh>Refresh</button>
    </div>

    <p data-error class="error" hidden></p>
    <div data-groups></div>
  </main>
`;
var DEFAULT_HOME_STYLE = String.raw`@scope (main) {
  .toolbar {
    display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center;
  }
  .toolbar input[type="search"] {
    flex: 1 1 14rem; min-width: 0; margin: 0; padding: 0.45rem 0.65rem;
    font: inherit; font-size: 0.9rem; color: var(--ink); background: var(--surface);
    border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * 0.7);
  }
  .toolbar .inline {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-size: 0.85rem; font-weight: 400; color: var(--ink-2); white-space: nowrap;
  }
  .toolbar .inline input { margin: 0; accent-color: var(--accent); }
  .toolbar button {
    font: inherit; font-size: 0.85rem; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: var(--rule-w) solid var(--rule);
    border-radius: calc(var(--radius) * 0.7); padding: 0.4rem 0.8rem;
  }
  .toolbar button:hover { border-color: var(--accent); }

  .error {
    margin-top: 1rem; padding: 0.7rem 0.9rem; color: var(--flag);
    border: var(--rule-w) solid var(--flag); border-radius: calc(var(--radius) * 0.7);
  }

  /* A group carries its own data-world, so every token below re-resolves. */
  .group {
    margin-top: 1.6rem; padding: 1.1rem 1.2rem 1.2rem;
    background: var(--surface); color: var(--ink);
    border: var(--rule-w) solid var(--rule); border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .group > summary {
    cursor: pointer; list-style: none; display: flex; flex-wrap: wrap;
    align-items: baseline; gap: 0.6rem;
  }
  .group > summary::-webkit-details-marker { display: none; }
  .group > summary::before {
    content: "▸"; color: var(--ink-3); font-size: 0.8em;
    transition: transform var(--dur) var(--ease);
  }
  .group[open] > summary::before { transform: rotate(90deg); }
  .group h2 {
    margin: 0; font-family: var(--font-head); font-size: 1.08rem;
    font-weight: var(--head-weight); letter-spacing: var(--head-track);
    color: var(--ink);
  }
  .group .meta {
    margin-left: auto; font-size: 0.75rem; color: var(--ink-3);
    font-variant-numeric: tabular-nums; text-transform: var(--label-case);
    letter-spacing: var(--caps-track);
  }

  .rows { margin-top: 1rem; display: grid; gap: 0.5rem; }
  .row {
    display: grid; grid-template-columns: 1fr auto; gap: 0.5rem 0.9rem;
    align-items: center; padding: 0.6rem 0.75rem;
    border: var(--rule-w) solid var(--rule-soft);
    border-radius: calc(var(--radius) * 0.8); background: var(--bg);
  }
  .row .name { font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
  .row .sub {
    margin-top: 0.15rem; font-size: 0.76rem; color: var(--ink-3);
    display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--ink-3); flex: none; }
  .dot[data-state="active"] { background: var(--ok); }
  .dot[data-state="failed"] { background: var(--flag); }
  .dot[data-state="waiting"] { background: var(--accent); }
  @media (prefers-reduced-motion: no-preference) {
    .dot[data-state="active"] { animation: home-pulse 1.4s ease-in-out infinite; }
  }
  @keyframes home-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }

  .acts { display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: flex-end; }
  .acts button {
    font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    color: var(--accent); background: transparent;
    border: var(--rule-w) solid var(--rule);
    border-radius: calc(var(--radius) * 0.6); padding: 0.28rem 0.6rem;
  }
  .acts button:hover:not(:disabled) { border-color: var(--accent); }
  .acts button:disabled { opacity: 0.5; cursor: default; }
  .acts button[data-danger]:hover:not(:disabled) { color: var(--flag); border-color: var(--flag); }

  .empty { margin-top: 0.9rem; font-size: 0.85rem; color: var(--ink-3); }

  .starter { margin-top: 1rem; }
  .starter summary {
    cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--accent);
  }
  .starter .fields { margin-top: 0.7rem; display: grid; gap: 0.6rem; }
  .starter textarea, .starter select {
    width: 100%; margin: 0; padding: 0.5rem 0.65rem; font: inherit; font-size: 0.9rem;
    color: var(--ink); background: var(--bg);
    border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * 0.7);
  }
  .starter textarea { min-height: 4rem; resize: vertical; line-height: 1.5; }
  .starter .go {
    justify-self: start; font: inherit; font-size: 0.85rem; font-weight: 640;
    cursor: pointer; color: var(--bg); background: var(--accent);
    border: var(--rule-w) solid var(--accent);
    border-radius: calc(var(--radius) * 0.7); padding: 0.45rem 1rem;
  }
  .say { min-height: 1.3em; font-size: 0.78rem; color: var(--ink-3); }
  .say[data-tone="bad"] { color: var(--flag); }
  .say[data-tone="good"] { color: var(--ok); }

  @media (max-width: 34rem) {
    .row { grid-template-columns: 1fr; }
    .acts { justify-content: flex-start; }
  }
}`;
var DEFAULT_HOME_SCRIPT = String.raw`(() => {
  "use strict";
  const tp = window.threadPage;
  const $ = (sel, root = document) => root.querySelector(sel);
  const groupsEl = $("[data-groups]");
  const errEl = $("[data-error]");
  const countEl = $("[data-count]");
  const updatedEl = $("[data-updated]");
  const filterEl = $("[data-filter]");
  const idleEl = $("[data-show-idle]");
  const archEl = $("[data-show-archived]");

  /* Five looks, assigned round-robin so adjacent projects never collide. A
     stored group can name its own. */
  const WORLDS = ["volume", "atrium", "terminal", "bloom", "paper"];
  const STORE_KEY = "home.groups";

  let projects = [];
  let threads = [];
  let groups = null;
  let open = {};

  function fail(message) {
    errEl.hidden = false;
    errEl.textContent = message;
  }

  function ago(ms) {
    if (!ms) return "";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  }

  function defaultGroups() {
    const used = projects.filter((p) => threads.some((t) => t.projectId === p.id));
    const rest = projects.filter((p) => !used.includes(p));
    return used.concat(rest).map((project, index) => ({
      id: project.id,
      label: project.name,
      world: WORLDS[index % WORLDS.length],
      projectIds: [project.id],
    }));
  }

  function visible(thread) {
    if (!archEl.checked && thread.archived) return false;
    if (!idleEl.checked && thread.status === "idle" && !thread.archived) return false;
    const needle = filterEl.value.trim().toLowerCase();
    if (needle && !thread.title.toLowerCase().includes(needle)) return false;
    return true;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(label, danger, run) {
    const button = el("button", null, label);
    button.type = "button";
    if (danger) button.dataset.danger = "";
    button.addEventListener("click", async () => {
      const original = button.textContent;
      button.disabled = true;
      try {
        button.textContent = await run();
      } catch (error) {
        /* A declined confirmation is a normal outcome, not a failure. */
        button.textContent = error && error.code === "cancelled" ? original : "failed";
        if (error && error.code !== "cancelled") {
          fail((error.code || "error") + ": " + (error.message || ""));
        }
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = original;
        }, 1600);
      }
    });
    return button;
  }

  function renderRow(thread) {
    const row = el("div", "row");
    const left = el("div");
    left.append(el("div", "name", thread.title || "Untitled"));
    const sub = el("div", "sub");
    const dot = el("span", "dot");
    dot.dataset.state = thread.status;
    sub.append(dot, el("span", null, thread.status));
    if (thread.archived) sub.append(el("span", null, "· archived"));
    if (thread.page.available) sub.append(el("span", null, "· has page"));
    sub.append(el("span", null, "· " + ago(thread.updatedAtMs)));
    left.append(sub);

    const acts = el("div", "acts");
    if (thread.page.available) {
      acts.append(actionButton("Page", false, async () => {
        await tp.invoke("threads.openPage", { threadId: thread.id });
        return "opened";
      }));
    }
    acts.append(actionButton("bb", false, async () => {
      await tp.invoke("threads.openBb", { threadId: thread.id });
      return "opened";
    }));
    acts.append(actionButton("Prompt", false, async () => {
      const prompt = window.prompt("Send to “" + thread.title + "”:");
      if (!prompt) return "Prompt";
      const result = await tp.invoke("threads.continue", {
        threadId: thread.id,
        prompt,
      });
      return result.delivery;
    }));
    if (thread.status === "active") {
      acts.append(actionButton("Stop", true, async () => {
        await tp.invoke("threads.stop", { threadId: thread.id });
        return "stopped";
      }));
    }
    if (!thread.archived) {
      acts.append(actionButton("Archive", true, async () => {
        await tp.invoke("threads.archive", { threadId: thread.id });
        await load();
        return "archived";
      }));
    }
    row.append(left, acts);
    return row;
  }

  function renderStarter(group) {
    const box = el("details", "starter");
    box.append(el("summary", null, "Start a session here"));
    const fields = el("div", "fields");

    const ids = group.projectIds.filter((id) => projects.some((p) => p.id === id));
    let projectId = ids[0];
    if (ids.length > 1) {
      const select = document.createElement("select");
      for (const id of ids) {
        const project = projects.find((p) => p.id === id);
        const option = document.createElement("option");
        option.value = id;
        option.textContent = project ? project.name : id;
        select.append(option);
      }
      select.addEventListener("change", () => { projectId = select.value; });
      fields.append(select);
    }

    const text = document.createElement("textarea");
    text.placeholder = "What should the new session do?";
    const go = el("button", "go", "Start");
    go.type = "button";
    const say = el("p", "say");

    go.addEventListener("click", async () => {
      const prompt = text.value.trim();
      if (!prompt) { say.dataset.tone = "bad"; say.textContent = "Say what it should do."; return; }
      if (!projectId) { say.dataset.tone = "bad"; say.textContent = "This group has no project."; return; }
      go.disabled = true;
      say.dataset.tone = "";
      say.textContent = "Waiting for confirmation…";
      try {
        await tp.invoke("threads.spawn", { projectId, prompt });
        say.dataset.tone = "good";
        say.textContent = "Started.";
        text.value = "";
        await load();
      } catch (error) {
        if (error && error.code === "cancelled") {
          say.dataset.tone = "";
          say.textContent = "Cancelled.";
        } else {
          say.dataset.tone = "bad";
          say.textContent = (error && error.message) || "Could not start it.";
        }
      } finally {
        go.disabled = false;
      }
    });

    fields.append(text, go, say);
    box.append(fields);
    return box;
  }

  function render() {
    groupsEl.textContent = "";
    const list = groups || defaultGroups();
    let shown = 0;

    for (const group of list) {
      const mine = threads
        .filter((t) => group.projectIds.includes(t.projectId))
        .filter(visible)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      const active = mine.filter((t) => t.status === "active").length;

      const box = document.createElement("details");
      box.className = "group";
      /* This is what gives each group its own look. */
      if (group.world) box.dataset.world = group.world;
      box.open = open[group.id] !== undefined ? open[group.id] : mine.length > 0;
      box.addEventListener("toggle", () => { open[group.id] = box.open; });

      const summary = document.createElement("summary");
      summary.append(el("h2", null, group.label));
      summary.append(
        el("span", "meta", mine.length + (active ? " · " + active + " active" : "")),
      );
      box.append(summary);

      if (mine.length) {
        const rows = el("div", "rows");
        for (const thread of mine) rows.append(renderRow(thread));
        box.append(rows);
      } else {
        box.append(el("p", "empty", "Nothing here right now."));
      }
      box.append(renderStarter(group));
      groupsEl.append(box);
      shown += mine.length;
    }

    countEl.textContent =
      shown + " of " + threads.length + " session" + (threads.length === 1 ? "" : "s");
    updatedEl.textContent = "updated " + new Date().toLocaleTimeString();
  }

  async function load() {
    try {
      errEl.hidden = true;
      const [projectList, snapshot, stored] = await Promise.all([
        tp.invoke("projects.list", {}),
        tp.invoke("threads.snapshot", { limit: 200, includeArchived: true }),
        tp.invoke("storage.get", { key: STORE_KEY }).catch(() => ({ found: false })),
      ]);
      projects = projectList.projects;
      threads = snapshot.threads;
      groups = stored && stored.found && Array.isArray(stored.value) ? stored.value : null;
      render();
    } catch (error) {
      fail((error && error.message) || "Could not load sessions.");
    }
  }

  for (const control of [filterEl, idleEl, archEl]) {
    control.addEventListener("input", () => { if (threads.length) render(); });
  }
  $("[data-refresh]").addEventListener("click", () => { void load(); });


  void load();
  /* Cheap and visible-only: the shell already reloads the page when the agent
     saves, so this only keeps statuses fresh while you are looking. */
  tp.watch("thread.activity", { limit: 1 }, () => { void load(); }, { intervalMs: 15000 });
})();`;

// page.ts
import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

// node_modules/parse5/dist/common/unicode.js
var UNDEFINED_CODE_POINTS = /* @__PURE__ */ new Set([
  65534,
  65535,
  131070,
  131071,
  196606,
  196607,
  262142,
  262143,
  327678,
  327679,
  393214,
  393215,
  458750,
  458751,
  524286,
  524287,
  589822,
  589823,
  655358,
  655359,
  720894,
  720895,
  786430,
  786431,
  851966,
  851967,
  917502,
  917503,
  983038,
  983039,
  1048574,
  1048575,
  1114110,
  1114111
]);
var REPLACEMENT_CHARACTER = "\uFFFD";
var CODE_POINTS;
(function(CODE_POINTS2) {
  CODE_POINTS2[CODE_POINTS2["EOF"] = -1] = "EOF";
  CODE_POINTS2[CODE_POINTS2["NULL"] = 0] = "NULL";
  CODE_POINTS2[CODE_POINTS2["TABULATION"] = 9] = "TABULATION";
  CODE_POINTS2[CODE_POINTS2["CARRIAGE_RETURN"] = 13] = "CARRIAGE_RETURN";
  CODE_POINTS2[CODE_POINTS2["LINE_FEED"] = 10] = "LINE_FEED";
  CODE_POINTS2[CODE_POINTS2["FORM_FEED"] = 12] = "FORM_FEED";
  CODE_POINTS2[CODE_POINTS2["SPACE"] = 32] = "SPACE";
  CODE_POINTS2[CODE_POINTS2["EXCLAMATION_MARK"] = 33] = "EXCLAMATION_MARK";
  CODE_POINTS2[CODE_POINTS2["QUOTATION_MARK"] = 34] = "QUOTATION_MARK";
  CODE_POINTS2[CODE_POINTS2["AMPERSAND"] = 38] = "AMPERSAND";
  CODE_POINTS2[CODE_POINTS2["APOSTROPHE"] = 39] = "APOSTROPHE";
  CODE_POINTS2[CODE_POINTS2["HYPHEN_MINUS"] = 45] = "HYPHEN_MINUS";
  CODE_POINTS2[CODE_POINTS2["SOLIDUS"] = 47] = "SOLIDUS";
  CODE_POINTS2[CODE_POINTS2["DIGIT_0"] = 48] = "DIGIT_0";
  CODE_POINTS2[CODE_POINTS2["DIGIT_9"] = 57] = "DIGIT_9";
  CODE_POINTS2[CODE_POINTS2["SEMICOLON"] = 59] = "SEMICOLON";
  CODE_POINTS2[CODE_POINTS2["LESS_THAN_SIGN"] = 60] = "LESS_THAN_SIGN";
  CODE_POINTS2[CODE_POINTS2["EQUALS_SIGN"] = 61] = "EQUALS_SIGN";
  CODE_POINTS2[CODE_POINTS2["GREATER_THAN_SIGN"] = 62] = "GREATER_THAN_SIGN";
  CODE_POINTS2[CODE_POINTS2["QUESTION_MARK"] = 63] = "QUESTION_MARK";
  CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_A"] = 65] = "LATIN_CAPITAL_A";
  CODE_POINTS2[CODE_POINTS2["LATIN_CAPITAL_Z"] = 90] = "LATIN_CAPITAL_Z";
  CODE_POINTS2[CODE_POINTS2["RIGHT_SQUARE_BRACKET"] = 93] = "RIGHT_SQUARE_BRACKET";
  CODE_POINTS2[CODE_POINTS2["GRAVE_ACCENT"] = 96] = "GRAVE_ACCENT";
  CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_A"] = 97] = "LATIN_SMALL_A";
  CODE_POINTS2[CODE_POINTS2["LATIN_SMALL_Z"] = 122] = "LATIN_SMALL_Z";
})(CODE_POINTS || (CODE_POINTS = {}));
var SEQUENCES = {
  DASH_DASH: "--",
  CDATA_START: "[CDATA[",
  DOCTYPE: "doctype",
  SCRIPT: "script",
  PUBLIC: "public",
  SYSTEM: "system"
};
function isSurrogate(cp) {
  return cp >= 55296 && cp <= 57343;
}
function isSurrogatePair(cp) {
  return cp >= 56320 && cp <= 57343;
}
function getSurrogatePairCodePoint(cp1, cp2) {
  return (cp1 - 55296) * 1024 + 9216 + cp2;
}
function isControlCodePoint(cp) {
  return cp !== 32 && cp !== 10 && cp !== 13 && cp !== 9 && cp !== 12 && cp >= 1 && cp <= 31 || cp >= 127 && cp <= 159;
}
function isUndefinedCodePoint(cp) {
  return cp >= 64976 && cp <= 65007 || UNDEFINED_CODE_POINTS.has(cp);
}

// node_modules/parse5/dist/common/error-codes.js
var ERR;
(function(ERR2) {
  ERR2["controlCharacterInInputStream"] = "control-character-in-input-stream";
  ERR2["noncharacterInInputStream"] = "noncharacter-in-input-stream";
  ERR2["surrogateInInputStream"] = "surrogate-in-input-stream";
  ERR2["nonVoidHtmlElementStartTagWithTrailingSolidus"] = "non-void-html-element-start-tag-with-trailing-solidus";
  ERR2["endTagWithAttributes"] = "end-tag-with-attributes";
  ERR2["endTagWithTrailingSolidus"] = "end-tag-with-trailing-solidus";
  ERR2["unexpectedSolidusInTag"] = "unexpected-solidus-in-tag";
  ERR2["unexpectedNullCharacter"] = "unexpected-null-character";
  ERR2["unexpectedQuestionMarkInsteadOfTagName"] = "unexpected-question-mark-instead-of-tag-name";
  ERR2["invalidFirstCharacterOfTagName"] = "invalid-first-character-of-tag-name";
  ERR2["unexpectedEqualsSignBeforeAttributeName"] = "unexpected-equals-sign-before-attribute-name";
  ERR2["missingEndTagName"] = "missing-end-tag-name";
  ERR2["unexpectedCharacterInAttributeName"] = "unexpected-character-in-attribute-name";
  ERR2["unknownNamedCharacterReference"] = "unknown-named-character-reference";
  ERR2["missingSemicolonAfterCharacterReference"] = "missing-semicolon-after-character-reference";
  ERR2["unexpectedCharacterAfterDoctypeSystemIdentifier"] = "unexpected-character-after-doctype-system-identifier";
  ERR2["unexpectedCharacterInUnquotedAttributeValue"] = "unexpected-character-in-unquoted-attribute-value";
  ERR2["eofBeforeTagName"] = "eof-before-tag-name";
  ERR2["eofInTag"] = "eof-in-tag";
  ERR2["missingAttributeValue"] = "missing-attribute-value";
  ERR2["missingWhitespaceBetweenAttributes"] = "missing-whitespace-between-attributes";
  ERR2["missingWhitespaceAfterDoctypePublicKeyword"] = "missing-whitespace-after-doctype-public-keyword";
  ERR2["missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers"] = "missing-whitespace-between-doctype-public-and-system-identifiers";
  ERR2["missingWhitespaceAfterDoctypeSystemKeyword"] = "missing-whitespace-after-doctype-system-keyword";
  ERR2["missingQuoteBeforeDoctypePublicIdentifier"] = "missing-quote-before-doctype-public-identifier";
  ERR2["missingQuoteBeforeDoctypeSystemIdentifier"] = "missing-quote-before-doctype-system-identifier";
  ERR2["missingDoctypePublicIdentifier"] = "missing-doctype-public-identifier";
  ERR2["missingDoctypeSystemIdentifier"] = "missing-doctype-system-identifier";
  ERR2["abruptDoctypePublicIdentifier"] = "abrupt-doctype-public-identifier";
  ERR2["abruptDoctypeSystemIdentifier"] = "abrupt-doctype-system-identifier";
  ERR2["cdataInHtmlContent"] = "cdata-in-html-content";
  ERR2["incorrectlyOpenedComment"] = "incorrectly-opened-comment";
  ERR2["eofInScriptHtmlCommentLikeText"] = "eof-in-script-html-comment-like-text";
  ERR2["eofInDoctype"] = "eof-in-doctype";
  ERR2["nestedComment"] = "nested-comment";
  ERR2["abruptClosingOfEmptyComment"] = "abrupt-closing-of-empty-comment";
  ERR2["eofInComment"] = "eof-in-comment";
  ERR2["incorrectlyClosedComment"] = "incorrectly-closed-comment";
  ERR2["eofInCdata"] = "eof-in-cdata";
  ERR2["absenceOfDigitsInNumericCharacterReference"] = "absence-of-digits-in-numeric-character-reference";
  ERR2["nullCharacterReference"] = "null-character-reference";
  ERR2["surrogateCharacterReference"] = "surrogate-character-reference";
  ERR2["characterReferenceOutsideUnicodeRange"] = "character-reference-outside-unicode-range";
  ERR2["controlCharacterReference"] = "control-character-reference";
  ERR2["noncharacterCharacterReference"] = "noncharacter-character-reference";
  ERR2["missingWhitespaceBeforeDoctypeName"] = "missing-whitespace-before-doctype-name";
  ERR2["missingDoctypeName"] = "missing-doctype-name";
  ERR2["invalidCharacterSequenceAfterDoctypeName"] = "invalid-character-sequence-after-doctype-name";
  ERR2["duplicateAttribute"] = "duplicate-attribute";
  ERR2["nonConformingDoctype"] = "non-conforming-doctype";
  ERR2["missingDoctype"] = "missing-doctype";
  ERR2["misplacedDoctype"] = "misplaced-doctype";
  ERR2["endTagWithoutMatchingOpenElement"] = "end-tag-without-matching-open-element";
  ERR2["closingOfElementWithOpenChildElements"] = "closing-of-element-with-open-child-elements";
  ERR2["disallowedContentInNoscriptInHead"] = "disallowed-content-in-noscript-in-head";
  ERR2["openElementsLeftAfterEof"] = "open-elements-left-after-eof";
  ERR2["abandonedHeadElementChild"] = "abandoned-head-element-child";
  ERR2["misplacedStartTagForHeadElement"] = "misplaced-start-tag-for-head-element";
  ERR2["nestedNoscriptInHead"] = "nested-noscript-in-head";
  ERR2["eofInElementThatCanContainOnlyText"] = "eof-in-element-that-can-contain-only-text";
})(ERR || (ERR = {}));

// node_modules/parse5/dist/tokenizer/preprocessor.js
var DEFAULT_BUFFER_WATERLINE = 1 << 16;
var Preprocessor = class {
  constructor(handler) {
    this.handler = handler;
    this.html = "";
    this.pos = -1;
    this.lastGapPos = -2;
    this.gapStack = [];
    this.skipNextNewLine = false;
    this.lastChunkWritten = false;
    this.endOfChunkHit = false;
    this.bufferWaterline = DEFAULT_BUFFER_WATERLINE;
    this.isEol = false;
    this.lineStartPos = 0;
    this.droppedBufferSize = 0;
    this.line = 1;
    this.lastErrOffset = -1;
  }
  /** The column on the current line. If we just saw a gap (eg. a surrogate pair), return the index before. */
  get col() {
    return this.pos - this.lineStartPos + Number(this.lastGapPos !== this.pos);
  }
  get offset() {
    return this.droppedBufferSize + this.pos;
  }
  getError(code, cpOffset) {
    const { line, col, offset } = this;
    const startCol = col + cpOffset;
    const startOffset = offset + cpOffset;
    return {
      code,
      startLine: line,
      endLine: line,
      startCol,
      endCol: startCol,
      startOffset,
      endOffset: startOffset
    };
  }
  _err(code) {
    if (this.handler.onParseError && this.lastErrOffset !== this.offset) {
      this.lastErrOffset = this.offset;
      this.handler.onParseError(this.getError(code, 0));
    }
  }
  _addGap() {
    this.gapStack.push(this.lastGapPos);
    this.lastGapPos = this.pos;
  }
  _processSurrogate(cp) {
    if (this.pos !== this.html.length - 1) {
      const nextCp = this.html.charCodeAt(this.pos + 1);
      if (isSurrogatePair(nextCp)) {
        this.pos++;
        this._addGap();
        return getSurrogatePairCodePoint(cp, nextCp);
      }
    } else if (!this.lastChunkWritten) {
      this.endOfChunkHit = true;
      return CODE_POINTS.EOF;
    }
    this._err(ERR.surrogateInInputStream);
    return cp;
  }
  willDropParsedChunk() {
    return this.pos > this.bufferWaterline;
  }
  dropParsedChunk() {
    if (this.willDropParsedChunk()) {
      this.html = this.html.substring(this.pos);
      this.lineStartPos -= this.pos;
      this.droppedBufferSize += this.pos;
      this.pos = 0;
      this.lastGapPos = -2;
      this.gapStack.length = 0;
    }
  }
  write(chunk, isLastChunk) {
    if (this.html.length > 0) {
      this.html += chunk;
    } else {
      this.html = chunk;
    }
    this.endOfChunkHit = false;
    this.lastChunkWritten = isLastChunk;
  }
  insertHtmlAtCurrentPos(chunk) {
    this.html = this.html.substring(0, this.pos + 1) + chunk + this.html.substring(this.pos + 1);
    this.endOfChunkHit = false;
  }
  startsWith(pattern, caseSensitive) {
    if (this.pos + pattern.length > this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return false;
    }
    if (caseSensitive) {
      return this.html.startsWith(pattern, this.pos);
    }
    for (let i = 0; i < pattern.length; i++) {
      const cp = this.html.charCodeAt(this.pos + i) | 32;
      if (cp !== pattern.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
  peek(offset) {
    const pos = this.pos + offset;
    if (pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return CODE_POINTS.EOF;
    }
    const code = this.html.charCodeAt(pos);
    return code === CODE_POINTS.CARRIAGE_RETURN ? CODE_POINTS.LINE_FEED : code;
  }
  advance() {
    this.pos++;
    if (this.isEol) {
      this.isEol = false;
      this.line++;
      this.lineStartPos = this.pos;
    }
    if (this.pos >= this.html.length) {
      this.endOfChunkHit = !this.lastChunkWritten;
      return CODE_POINTS.EOF;
    }
    let cp = this.html.charCodeAt(this.pos);
    if (cp === CODE_POINTS.CARRIAGE_RETURN) {
      this.isEol = true;
      this.skipNextNewLine = true;
      return CODE_POINTS.LINE_FEED;
    }
    if (cp === CODE_POINTS.LINE_FEED) {
      this.isEol = true;
      if (this.skipNextNewLine) {
        this.line--;
        this.skipNextNewLine = false;
        this._addGap();
        return this.advance();
      }
    }
    this.skipNextNewLine = false;
    if (isSurrogate(cp)) {
      cp = this._processSurrogate(cp);
    }
    const isCommonValidRange = this.handler.onParseError === null || cp > 31 && cp < 127 || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.CARRIAGE_RETURN || cp > 159 && cp < 64976;
    if (!isCommonValidRange) {
      this._checkForProblematicCharacters(cp);
    }
    return cp;
  }
  _checkForProblematicCharacters(cp) {
    if (isControlCodePoint(cp)) {
      this._err(ERR.controlCharacterInInputStream);
    } else if (isUndefinedCodePoint(cp)) {
      this._err(ERR.noncharacterInInputStream);
    }
  }
  retreat(count) {
    this.pos -= count;
    while (this.pos < this.lastGapPos) {
      this.lastGapPos = this.gapStack.pop();
      this.pos--;
    }
    this.isEol = false;
  }
};

// node_modules/parse5/dist/common/token.js
var TokenType;
(function(TokenType2) {
  TokenType2[TokenType2["CHARACTER"] = 0] = "CHARACTER";
  TokenType2[TokenType2["NULL_CHARACTER"] = 1] = "NULL_CHARACTER";
  TokenType2[TokenType2["WHITESPACE_CHARACTER"] = 2] = "WHITESPACE_CHARACTER";
  TokenType2[TokenType2["START_TAG"] = 3] = "START_TAG";
  TokenType2[TokenType2["END_TAG"] = 4] = "END_TAG";
  TokenType2[TokenType2["COMMENT"] = 5] = "COMMENT";
  TokenType2[TokenType2["DOCTYPE"] = 6] = "DOCTYPE";
  TokenType2[TokenType2["EOF"] = 7] = "EOF";
  TokenType2[TokenType2["HIBERNATION"] = 8] = "HIBERNATION";
})(TokenType || (TokenType = {}));
function getTokenAttr(token, attrName) {
  for (let i = token.attrs.length - 1; i >= 0; i--) {
    if (token.attrs[i].name === attrName) {
      return token.attrs[i].value;
    }
  }
  return null;
}

// node_modules/entities/dist/decode-codepoint.js
var decodeMap = /* @__PURE__ */ new Map([
  [0, 65533],
  // C1 Unicode control character reference replacements
  [128, 8364],
  [130, 8218],
  [131, 402],
  [132, 8222],
  [133, 8230],
  [134, 8224],
  [135, 8225],
  [136, 710],
  [137, 8240],
  [138, 352],
  [139, 8249],
  [140, 338],
  [142, 381],
  [145, 8216],
  [146, 8217],
  [147, 8220],
  [148, 8221],
  [149, 8226],
  [150, 8211],
  [151, 8212],
  [152, 732],
  [153, 8482],
  [154, 353],
  [155, 8250],
  [156, 339],
  [158, 382],
  [159, 376]
]);
function replaceCodePoint(codePoint) {
  if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
    return 65533;
  }
  return decodeMap.get(codePoint) ?? codePoint;
}

// node_modules/entities/dist/internal/decode-shared.js
function decodeBase64(input) {
  const binary = atob(input);
  const evenLength = binary.length & ~1;
  const out = new Uint16Array(evenLength / 2);
  for (let index = 0, outIndex = 0; index < evenLength; index += 2) {
    const lo = binary.charCodeAt(index);
    const hi = binary.charCodeAt(index + 1);
    out[outIndex++] = lo | hi << 8;
  }
  return out;
}

// node_modules/entities/dist/generated/decode-data-html.js
var htmlDecodeTree = /* @__PURE__ */ decodeBase64("QR08ALkAAgH6AYsDNQR2BO0EPgXZBQEGLAbdBxMISQrvCmQLfQurDKQNLw4fD4YPpA+6D/IPAAAAAAAAAAAAAAAAKhBMEY8TmxUWF2EYLBkxGuAa3RsJHDscWR8YIC8jSCSIJcMl6ie3Ku8rEC0CLjoupS7kLgAIRU1hYmNmZ2xtbm9wcnN0dVQAWgBeAGUAaQBzAHcAfgCBAIQAhwCSAJoAoACsALMAbABpAGcAO4DGAMZAUAA7gCYAJkBjAHUAdABlADuAwQDBQHIiZXZlAAJhAAFpeW0AcgByAGMAO4DCAMJAEGRyAADgNdgE3XIAYQB2AGUAO4DAAMBA8CFoYZFj4SFjcgBhZAAAoFMqAAFncIsAjgBvAG4ABGFmAADgNdg43fAlbHlGdW5jdGlvbgCgYSBpAG4AZwA7gMUAxUAAAWNzpACoAHIAAOA12Jzc6SFnbgCgVCJpAGwAZABlADuAwwDDQG0AbAA7gMQAxEAABGFjZWZvcnN1xQDYANoA7QDxAPYA+QD8AAABY3LJAM8AayNzbGFzaAAAoBYidgHTANUAAKDnKmUAZAAAoAYjeQARZIABY3J0AOAA5QDrAGEidXNlAACgNSLuI291bGxpcwCgLCFhAJJjcgAA4DXYBd1wAGYAAOA12Dnd5SF2ZdhiYwDyAOoAbSJwZXEAAKBOIgAHSE9hY2RlZmhpbG9yc3UXARoBHwE6AVIBVQFiAWQBZgGCAakB6QHtAfIBYwB5ACdkUABZADuAqQCpQIABY3B5ACUBKAE1AfUhdGUGYWmg0iJ0KGFsRGlmZmVyZW50aWFsRAAAoEUhbCJleXMAAKAtIQACYWVpb0EBRAFKAU0B8iFvbgxhZABpAGwAO4DHAMdAcgBjAAhhbiJpbnQAAKAwIm8AdAAKYQABZG5ZAV0BaSJsbGEAuGB0I2VyRG90ALdg8gA5AWkAp2NyImNsZQAAAkRNUFRwAXQBeQF9AW8AdAAAoJkiaSJudXMAAKCWIuwhdXMAoJUiaSJtZXMAAKCXIm8AAAFjc4cBlAFrKndpc2VDb250b3VySW50ZWdyYWwAAKAyImUjQ3VybHkAAAFEUZwBpAFvJXVibGVRdW90ZQAAoB0gdSJvdGUAAKAZIAACbG5wdbABtgHNAdgBbwBuAGWgNyIAoHQqgAFnaXQAvAHBAcUB8iJ1ZW50AKBhIm4AdAAAoC8i7yV1ckludGVncmFsAKAuIgABZnLRAdMBAKACIe8iZHVjdACgECJuLnRlckNsb2Nrd2lzZUNvbnRvdXJJbnRlZ3JhbAAAoDMi7yFzcwCgLypjAHIAAOA12J7ccABDoNMiYQBwAACgTSKABURKU1phY2VmaW9zAAsCEgIVAhgCGwIsAjQCOQI9AnMCfwNvoEUh9CJyYWhkAKARKWMAeQACZGMAeQAFZGMAeQAPZIABZ3JzACECJQIoAuchZXIAoCEgcgAAoKEhaAB2AACg5CoAAWF5MAIzAvIhb24OYRRkbAB0oAciYQCUY3IAAOA12AfdAAFhZkECawIAAWNtRQJnAvIjaXRpY2FsAAJBREdUUAJUAl8CYwJjInV0ZQC0YG8AdAFZAloC2WJiJGxlQWN1dGUA3WJyImF2ZQBgYGkibGRlANxi7yFuZACgxCJmJWVyZW50aWFsRAAAoEYhcAR9AgAAAAAAAIECjgIAABoDZgAA4DXYO91EoagAhQKJAm8AdAAAoNwgcSJ1YWwAAKBQIuIhbGUAA0NETFJVVpkCqAK1Au8C/wIRA28AbgB0AG8AdQByAEkAbgB0AGUAZwByAGEA7ADEAW8AdAKvAgAAAACwAqhgbiNBcnJvdwAAoNMhAAFlb7kC0AJmAHQAgAFBUlQAwQLGAs0CciJyb3cAAKDQIekkZ2h0QXJyb3cAoNQhZQDlACsCbgBnAAABTFLWAugC5SFmdAABQVLcAuECciJyb3cAAKD4J+kkZ2h0QXJyb3cAoPon6SRnaHRBcnJvdwCg+SdpImdodAAAAUFU9gL7AnIicm93AACg0iFlAGUAAKCoInAAQQIGAwAAAAALA3Iicm93AACg0SFvJHduQXJyb3cAAKDVIWUlcnRpY2FsQmFyAACgJSJuAAADQUJMUlRhJAM2AzoDWgNxA3oDciJyb3cAAKGTIUJVLAMwA2EAcgAAoBMpcCNBcnJvdwAAoPUhciJldmUAEWPlIWZ00gJDAwAASwMAAFIDaSVnaHRWZWN0b3IAAKBQKWUkZVZlY3RvcgAAoF4p5SJjdG9yQqC9IWEAcgAAoFYpaSJnaHQA1AFiAwAAaQNlJGVWZWN0b3IAAKBfKeUiY3RvckKgwSFhAHIAAKBXKWUAZQBBoKQiciJyb3cAAKCnIXIAcgBvAPcAtAIAAWN0gwOHA3IA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YwAAoN8i4SFycnCgtiEAoD0pgKIqImJjZG9zACsVMBU6FT4VQRVyImNhcAAAoEgqAAFhdTQVNxVwAACgRipwAACgSipvAHQAAKCNInIAAKBFKgDgKiIA/gACYWxydksVURVuFXMVcgByAG2gtyEAoDwpeQCAAWV2dwBYFWUVaRVxAHACXxUAAAAAYxVyAGUA4wAXFXUA4wAZFWUAZQAAoM4iZSJkZ2UAAKDPImUAbgA7gKQApEBlI2Fycm93AAABbHJ7FX8V5SFmdACgtiFpImdodAAAoLchZQDkAG0VAAFjaYsVkRVvAG4AaQBuAPQAkwFuAHQAAKAxImwiY3R5AACgLSOACUFIYWJjZGVmaGlqbG9yc3R1d3oAuBW7Fb8V1RXgFegV+RUKFhUWHxZUFlcWZRbFFtsW7xb7FgUXChdyAPIAtAJhAHIAAKBlKQACZ2xyc8YVyhXOFdAV5yFlcgCgICDlIXRoAKA4IfIA9QxoAHagECAAoKMiawHZFd4VYSJyb3cAAKAPKWEA4wBfAgABYXnkFecV8iFvbg9hNGQAoUYhYW/tFfQVAAFnciEC8RVyAACgyiF0InNlcQAAoHcqgAFnbG0A/xUCFgUWO4CwALBAdABhALRjcCJ0eXYAAKCxKQABaXIOFhIW8yFodACgfykA4DXYId1hAHIAAAFschsWHRYAoMMhAKDCIYACYWVnc3YAKBauAjYWOhY+Fm0AAKHEIm9zLhY0Fm4AZABzoMQi9SFpdACgZiZhIm1tYQDdY2kAbgAAoPIiAKH3AGlvQxZRFmQAZQAAgfcAO29KFksW90BuI3RpbWVzAACgxyJuAPgAUBZjAHkAUmRjAG8CXhYAAAAAYhZyAG4AAKAeI28AcAAAoA0jgAJscHR1dwBuFnEWdRaSFp4W7CFhciRgZgAA4DXYVd0AotkCZW1wc30WhBaJFo0WcQBkoFAibwB0AACgUSJpIm51cwAAoDgi7CF1cwCgFCLxInVhcmUAoKEiYgBsAGUAYgBhAHIAdwBlAGQAZwDlANcAbgCAAWFkaAClFqoWtBZyAHIAbwD3APUMbwB3AG4AYQByAHIAbwB3APMA8xVhI3Jwb29uAAABbHK8FsAWZQBmAPQAHBZpAGcAaAD0AB4WYgHJFs8WawBhAHIAbwD3AJILbwLUFgAAAADYFnIAbgAAoB8jbwBwAACgDCOAAWNvdADhFukW7BYAAXJ55RboFgDgNdi53FVkbAAAoPYp8iFvaxFhAAFkcvMW9xZvAHQAAKDxImkA5qC/JVsSAAFhaP8WAhdyAPIANQNhAPIA1wvhIm5nbGUAoKYpAAFjaQ4XEBd5AF9k5yJyYXJyAKD/JwAJRGFjZGVmZ2xtbm9wcXJzdHV4MRc4F0YXWxcyBF4XaRd5F40XrBe0F78X2RcVGCEYLRg1GEAYAAFEbzUXgRZvAPQA+BUAAWNzPBdCF3UAdABlADuA6QDpQPQhZXIAoG4qAAJhaW95TRdQF1YXWhfyIW9uG2FyAGOgViI7gOoA6kDsIW9uAKBVIk1kbwB0ABdhAAFEcmIXZhdvAHQAAKBSIgDgNdgi3XKhmipuF3QXYQB2AGUAO4DoAOhAZKCWKm8AdAAAoJgqgKGZKmlscwCAF4UXhxfuInRlcnMAoOcjAKATIWSglSpvAHQAAKCXKoABYXBzAJMXlheiF2MAcgATYXQAeQBzogUinxcAAAAAoRdlAHQAAKAFInAAMaADIDMBqRerFwCgBCAAoAUgAAFnc7AXsRdLYXAAAKACIAABZ3C4F7sXbwBuABlhZgAA4DXYVt2AAWFscwDFF8sXzxdyAHOg1SJsAACg4yl1AHMAAKBxKmkAAKG1A2x21RfYF28AbgC1Y/VjAAJjc3V24BfoF/0XEBgAAWlv5BdWF3IAYwAAoFYiaQLuFwAAAADwF+0ADQThIW50AAFnbPUX+Rd0AHIAAKCWKuUhc3MAoJUqgAFhZWkAAxgGGAoYbABzAD1gcwB0AACgXyJ2AESgYSJEAACgeCrwImFyc2wAoOUpAAFEYRkYHRhvAHQAAKBTInIAcgAAoHEpgAFjZGkAJxgqGO0XcgAAoC8hbwD0AIwCAAFhaDEYMhi3YzuA8ADwQAABbXI5GD0YbAA7gOsA60BvAACgrCCAAWNpcABGGEgYSxhsACFgcwD0ACwEAAFlb08YVxhjAHQAYQB0AGkAbwDuABoEbgBlAG4AdABpAGEAbADlADME4Ql1GAAAgRgAAIMYiBgAAAAAoRilGAAAqhgAALsYvhjRGAAA1xgnGWwAbABpAG4AZwBkAG8AdABzAGUA8QBlF3kARGRtImFsZQAAoEAmgAFpbHIAjRiRGJ0Y7CFpZwCgA/tpApcYAAAAAJoYZwAAoAD7aQBnAACgBPsA4DXYI93sIWlnAKAB++whaWcA4GYAagCAAWFsdACvGLIYthh0AACgbSZpAGcAAKAC+24AcwAAoLElbwBmAJJh8AHCGAAAxhhmAADgNdhX3QABYWvJGMwYbADsAGsEdqDUIgCg2SphI3J0aW50AACgDSoAAWFv2hgiGQABY3PeGB8ZsQPnGP0YBRkSGRUZAAAdGbID7xjyGPQY9xj5GAAA+xg7gL0AvUAAoFMhO4C8ALxAAKBVIQCgWSEAoFshswEBGQAAAxkAoFQhAKBWIbQCCxkOGQAAAAAQGTuAvgC+QACgVyEAoFwhNQAAoFghtgEZGQAAGxkAoFohAKBdITgAAKBeIWwAAKBEIHcAbgAAoCIjYwByAADgNdi73IAIRWFiY2RlZmdpamxub3JzdHYARhlKGVoZXhlmGWkZkhmWGZkZnRmgGa0ZxhnLGc8Z4BkjGmygZyIAoIwqgAFjbXAAUBlTGVgZ9SF0ZfVhbQBhAOSgswM6FgCghipyImV2ZQAfYQABaXliGWUZcgBjAB1hM2RvAHQAIWGAoWUibHFzAMYEcBl6GfGhZSLOBAAAdhlsAGEAbgD0AN8EgKF+KmNkbACBGYQZjBljAACgqSpvAHQAb6CAKmyggioAoIQqZeDbIgD+cwAAoJQqcgAA4DXYJN3noGsirATtIWVsAKA3IWMAeQBTZIChdyJFYWoApxmpGasZAKCSKgCgpSoAoKQqAAJFYWVztBm2Gb0ZwhkAoGkicABwoIoq8iFveACgiipxoIgq8aCIKrUZaQBtAACg5yJwAGYAAOA12FjdYQB2AOUAYwIAAWNp0xnWGXIAAKAKIW0AAKFzImVs3BneGQCgjioAoJAqAIM+ADtjZGxxco0E6xn0GfgZ/BkBGgABY2nvGfEZAKCnKnIAAKB6Km8AdAAAoNci0CFhcgCglSl1ImVzdAAAoHwqgAJhZGVscwAKGvQZFhrVBCAa8AEPGgAAFBpwAHIAbwD4AFkZcgAAoHgpcQAAAWxxxAQbGmwAZQBzAPMASRlpAO0A5AQAAWVuJxouGnIjdG5lcXEAAOBpIgD+xQAsGgAFQWFiY2Vma29zeUAaQxpmGmoabRqDGocalhrCGtMacgDyAMwCAAJpbG1yShpOGlAaVBpyAHMA8ABxD2YAvWBpAGwA9AASBQABZHJYGlsaYwB5AEpkAKGUIWN3YBpkGmkAcgAAoEgpAKCtIWEAcgAAoA8h6SFyYyVhgAFhbHIAcxp7Gn8a8iF0c3WgZSZpAHQAAKBlJuwhaXAAoCYg4yFvbgCguSJyAADgNdgl3XMAAAFld4wakRphInJvdwAAoCUpYSJyb3cAAKAmKYACYW1vcHIAnxqjGqcauhq+GnIAcgAAoP8h9CFodACgOyJrAAABbHKsGrMaZSRmdGFycm93AACgqSHpJGdodGFycm93AKCqIWYAAOA12Fnd4iFhcgCgFSCAAWNsdADIGswa0BpyAADgNdi93GEAcwDoAGka8iFvaydhAAFicNca2xr1IWxsAKBDIOghZW4AoBAg4Qr2GgAA/RoAAAgbExsaGwAAIRs7GwAAAAA+G2IbmRuVG6sbAACyG80b0htjAHUAdABlADuA7QDtQAChYyBpeQEbBhtyAGMAO4DuAO5AOGQAAWN4CxsNG3kANWRjAGwAO4ChAKFAAAFmcssCFhsA4DXYJt1yAGEAdgBlADuA7ADsQIChSCFpbm8AJxsyGzYbAAFpbisbLxtuAHQAAKAMKnQAAKAtIuYhaW4AoNwpdABhAACgKSHsIWlnM2GAAWFvcABDG1sbXhuAAWNndABJG0sbWRtyACthgAFlbHAAcQVRG1UbaQBuAOUAyAVhAHIA9AByBWgAMWFmAACgtyJlAGQAtWEAoggiY2ZvdGkbbRt1G3kb4SFyZQCgBSFpAG4AdKAeImkAZQAAoN0pZABvAPQAWxsAoisiY2VscIEbhRuPG5QbYQBsAACguiIAAWdyiRuNG2UAcgDzACMQ4wCCG2EicmhrAACgFyryIW9kAKA8KgACY2dwdJ8boRukG6gbeQBRZG8AbgAvYWYAAOA12FrdYQC5Y3UAZQBzAHQAO4C/AL9AAAFjabUbuRtyAADgNdi+3G4AAKIIIkVkc3bCG8QbyBvQAwCg+SJvAHQAAKD1Inag9CIAoPMiaaBiIOwhZGUpYesB1hsAANkbYwB5AFZkbAA7gO8A70AAA2NmbW9zdeYb7hvyG/Ub+hsFHAABaXnqG+0bcgBjADVhOWRyAADgNdgn3eEhdGg3YnAAZgAA4DXYW93jAf8bAAADHHIAAOA12L/c8iFjeVhk6yFjeVRkAARhY2ZnaGpvcxUcGhwiHCYcKhwtHDAcNRzwIXBhdqC6A/BjAAFleR4cIRzkIWls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ZmdobG1vcHJzdHV3CiwNLBEsHSwnLDEsQCxLLFIsYix6LIQsjyzLLOgs7Sz/LAotcgDyAAkDYQByAACgYykAAWNyFSwbLHUAdABlADuA+gD6QPIACQ1yAOMBIywAACUseQBeZHYAZQBtYQABaXkrLDAscgBjADuA+wD7QENkgAFhYmgANyw6LD0scgDyANEO7CFhY3FhYQDyAOAOAAFpckQsSCzzIWh0AKB+KQDgNdgy3XIAYQB2AGUAO4D5APlAYQFWLF8scgAAAWxyWixcLACgvyEAoL4hbABrAACggCUAAWN0Zix2LG8CbCwAAAAAcyxyAG4AZaAcI3IAAKAcI28AcAAAoA8jcgBpAACg+CUAAWFsfiyBLGMAcgBrYTuAqACoQAABZ3CILIssbwBuAHNhZgAA4DXYZt0AA2FkaGxzdZksniynLLgsuyzFLHIAcgBvAPcACQ1vAHcAbgBhAHIAcgBvAPcA2A5hI3Jwb29uAAABbHKvLLMsZQBmAPQAWyxpAGcAaAD0AF0sdQDzAKYOaQAAocUDaGzBLMIs0mNvAG4AxWPwI2Fycm93cwCgyCGAAWNpdADRLOEs5CxvAtcsAAAAAN4scgBuAGWgHSNyAACgHSNvAHAAAKAOI24AZwBvYXIAaQAAoPklYwByAADgNdjK3IABZGlyAPMs9yz6LG8AdAAAoPAi7CFkZWlhaQBmoLUlAKC0JQABYW0DLQYtcgDyAMosbAA7gPwA/EDhIm5nbGUAoKcpgAdBQkRhY2RlZmxub3Byc3oAJy0qLTAtNC2bLZ0toS2/LcMtxy3TLdgt3C3gLfwtcgDyABADYQByAHag6CoAoOkqYQBzAOgA/gIAAW5yOC08LechcnQAoJwpgANla25wcnN0AJkpSC1NLVQtXi1iLYItYQBwAHAA4QAaHG8AdABoAGkAbgDnAKEXgAFoaXIAoSmzJFotbwBwAPQAdCVooJUh7wD4JgABaXVmLWotZwBtAOEAuygAAWJwbi14LXMjZXRuZXEAceCKIgD+AODLKgD+cyNldG5lcQBx4IsiAP4A4MwqAP4AAWhyhi2KLWUAdADhABIraSNhbmdsZQAAAWxyki2WLeUhZnQAoLIiaSJnaHQAAKCzInkAMmThIXNoAKCiIoABZWxyAKcttC24LWKiKCKuLQAAAACyLWEAcgAAoLsicQAAoFoi7CFpcACg7iIAAWJ0vC1eD2EA8gBfD3IAAOA12DPddAByAOkAlS1zAHUAAAFicM0t0C0A4IIi0iAA4IMi0iBwAGYAAOA12GfdcgBvAPAAWQt0AHIA6QCaLQABY3XkLegtcgAA4DXYy9wAAWJw7C30LW4AAAFFZXUt8S0A4IoiAP5uAAABRWV/LfktAOCLIgD+6SJnemFnAKCaKYADY2Vmb3BycwANLhAuJS4pLiMuLi40LukhcmN1YQABZGkULiEuAAFiZxguHC5hAHIAAKBfKmUAcaAnIgCgWSLlIXJwAKAYIXIAAOA12DTdcABmAADgNdho3WWgQCJhAHQA6ABqD2MAcgAA4DXYzNzjCuQRUC4AAFQuAABYLmIuAAAAAGMubS5wLnQuAAAAAIguki4AAJouJxIqEnQAcgDpAB0ScgAA4DXYNd0AAUFhWy5eLnIA8gDnAnIA8gCTB75jAAFBYWYuaS5yAPIA4AJyAPIAjAdhAPAAeh5pAHMAAKD7IoABZHB0APgReS6DLgABZmx9LoAuAOA12GnddQDzAP8RaQBtAOUABBIAAUFhiy6OLnIA8gDuAnIA8gCaBwABY3GVLgoScgAA4DXYzdwAAXB0nS6hLmwAdQDzACUScgDpACASAARhY2VmaW9zdbEuvC7ELsguzC7PLtQu2S5jAAABdXm2LrsudABlADuA/QD9QE9kAAFpecAuwy5yAGMAd2FLZG4AO4ClAKVAcgAA4DXYNt1jAHkAV2RwAGYAAOA12GrdYwByAADgNdjO3AABY23dLt8ueQBOZGwAO4D/AP9AAAVhY2RlZmhpb3N38y73Lv8uAi8MLxAvEy8YLx0vIi9jInV0ZQB6YQABYXn7Lv4u8iFvbn5hN2RvAHQAfGEAAWV0Bi8KL3QAcgDmAB8QYQC2Y3IAAOA12DfdYwB5ADZk5yJyYXJyAKDdIXAAZgAA4DXYa91jAHIAAOA12M/cAAFqbiYvKC8AoA0gagAAoAwg");

// node_modules/entities/dist/internal/bin-trie-flags.js
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags2[BinTrieFlags2["FLAG13"] = 8192] = "FLAG13";
  BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 8064] = "BRANCH_LENGTH";
  BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));

// node_modules/entities/dist/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
  CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
  CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
  CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
  CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
  CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
  CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
  CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
  CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
  CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
  CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
  CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
function isNumber(code) {
  return code >= CharCodes.ZERO && code <= CharCodes.NINE;
}
function isHexadecimalCharacter(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
}
function isAsciiAlphaNumeric(code) {
  return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
}
function isEntityInAttributeInvalidEnd(code) {
  return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
  DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
  DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
var EntityDecoder = class {
  decodeTree;
  emitCodePoint;
  errors;
  constructor(decodeTree, emitCodePoint, errors) {
    this.decodeTree = decodeTree;
    this.emitCodePoint = emitCodePoint;
    this.errors = errors;
  }
  /** The current state of the decoder. */
  state = EntityDecoderState.EntityStart;
  /** Characters that were consumed while parsing an entity. */
  consumed = 1;
  /**
   * The result of the entity.
   *
   * Either the result index of a numeric entity, or the codepoint of a
   * numeric entity.
   */
  result = 0;
  /** The current index in the decode tree. */
  treeIndex = 0;
  /** The number of characters that were consumed in excess. */
  excess = 1;
  /** The mode in which the decoder is operating. */
  decodeMode = DecodingMode.Strict;
  /** The number of characters that have been consumed in the current run. */
  runConsumed = 0;
  /**
   * Resets the instance to make it reusable.
   * @param decodeMode Entity decoding mode to use.
   */
  startEntity(decodeMode) {
    this.decodeMode = decodeMode;
    this.state = EntityDecoderState.EntityStart;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.consumed = 1;
    this.runConsumed = 0;
  }
  /**
   * Write an entity to the decoder. This can be called multiple times with partial entities.
   * If the entity is incomplete, the decoder will return -1.
   *
   * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
   * entity is incomplete, and resume when the next string is written.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  write(input, offset) {
    switch (this.state) {
      case EntityDecoderState.EntityStart: {
        if (input.charCodeAt(offset) === CharCodes.NUM) {
          this.state = EntityDecoderState.NumericStart;
          this.consumed += 1;
          return this.stateNumericStart(input, offset + 1);
        }
        this.state = EntityDecoderState.NamedEntity;
        return this.stateNamedEntity(input, offset);
      }
      case EntityDecoderState.NumericStart: {
        return this.stateNumericStart(input, offset);
      }
      case EntityDecoderState.NumericDecimal: {
        return this.stateNumericDecimal(input, offset);
      }
      case EntityDecoderState.NumericHex: {
        return this.stateNumericHex(input, offset);
      }
      case EntityDecoderState.NamedEntity: {
        return this.stateNamedEntity(input, offset);
      }
    }
  }
  /**
   * Switches between the numeric decimal and hexadecimal states.
   *
   * Equivalent to the `Numeric character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericStart(input, offset) {
    if (offset >= input.length) {
      return -1;
    }
    if ((input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
      this.state = EntityDecoderState.NumericHex;
      this.consumed += 1;
      return this.stateNumericHex(input, offset + 1);
    }
    this.state = EntityDecoderState.NumericDecimal;
    return this.stateNumericDecimal(input, offset);
  }
  /**
   * Parses a hexadecimal numeric entity.
   *
   * Equivalent to the `Hexademical character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericHex(input, offset) {
    while (offset < input.length) {
      const char = input.charCodeAt(offset);
      if (isNumber(char) || isHexadecimalCharacter(char)) {
        const digit = char <= CharCodes.NINE ? char - CharCodes.ZERO : (char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10;
        this.result = this.result * 16 + digit;
        this.consumed++;
        offset++;
      } else {
        return this.emitNumericEntity(char, 3);
      }
    }
    return -1;
  }
  /**
   * Parses a decimal numeric entity.
   *
   * Equivalent to the `Decimal character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericDecimal(input, offset) {
    while (offset < input.length) {
      const char = input.charCodeAt(offset);
      if (isNumber(char)) {
        this.result = this.result * 10 + (char - CharCodes.ZERO);
        this.consumed++;
        offset++;
      } else {
        return this.emitNumericEntity(char, 2);
      }
    }
    return -1;
  }
  /**
   * Validate and emit a numeric entity.
   *
   * Implements the logic from the `Hexademical character reference start
   * state` and `Numeric character reference end state` in the HTML spec.
   * @param lastCp The last code point of the entity. Used to see if the
   *               entity was terminated with a semicolon.
   * @param expectedLength The minimum number of characters that should be
   *                       consumed. Used to validate that at least one digit
   *                       was consumed.
   * @returns The number of characters that were consumed.
   */
  emitNumericEntity(lastCp, expectedLength) {
    if (this.consumed <= expectedLength) {
      this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed);
      return 0;
    }
    if (lastCp === CharCodes.SEMI) {
      this.consumed += 1;
    } else if (this.decodeMode === DecodingMode.Strict) {
      return 0;
    }
    this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
    if (this.errors) {
      if (lastCp !== CharCodes.SEMI) {
        this.errors.missingSemicolonAfterCharacterReference();
      }
      this.errors.validateNumericCharacterReference(this.result);
    }
    return this.consumed;
  }
  /**
   * Parses a named entity.
   *
   * Equivalent to the `Named character reference state` in the HTML spec.
   * @param input The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNamedEntity(input, offset) {
    const { decodeTree } = this;
    let current = decodeTree[this.treeIndex];
    let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
    while (offset < input.length) {
      if (valueLength === 0 && (current & BinTrieFlags.FLAG13) !== 0) {
        const runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
        if (this.runConsumed === 0) {
          const firstChar = current & BinTrieFlags.JUMP_TABLE;
          if (input.charCodeAt(offset) !== firstChar) {
            return this.result === 0 ? 0 : this.emitNotTerminatedNamedEntity();
          }
          offset++;
          this.excess++;
          this.runConsumed++;
        }
        while (this.runConsumed < runLength) {
          if (offset >= input.length) {
            return -1;
          }
          const charIndexInPacked = this.runConsumed - 1;
          const packedWord = decodeTree[this.treeIndex + 1 + (charIndexInPacked >> 1)];
          const expectedChar = charIndexInPacked % 2 === 0 ? packedWord & 255 : packedWord >> 8 & 255;
          if (input.charCodeAt(offset) !== expectedChar) {
            this.runConsumed = 0;
            return this.result === 0 ? 0 : this.emitNotTerminatedNamedEntity();
          }
          offset++;
          this.excess++;
          this.runConsumed++;
        }
        this.runConsumed = 0;
        this.treeIndex += 1 + (runLength >> 1);
        current = decodeTree[this.treeIndex];
        valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      }
      if (offset >= input.length)
        break;
      const char = input.charCodeAt(offset);
      if (char === CharCodes.SEMI && valueLength !== 0 && (current & BinTrieFlags.FLAG13) !== 0) {
        return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
      }
      this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
      if (this.treeIndex < 0) {
        return this.result === 0 || // If we are parsing an attribute
        this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
        (valueLength === 0 || // And there should be no invalid characters.
        isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
      }
      current = decodeTree[this.treeIndex];
      valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      if (valueLength !== 0) {
        if (char === CharCodes.SEMI) {
          return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
        }
        if (this.decodeMode !== DecodingMode.Strict && (current & BinTrieFlags.FLAG13) === 0) {
          this.result = this.treeIndex;
          this.consumed += this.excess;
          this.excess = 0;
        }
      }
      offset++;
      this.excess++;
    }
    return -1;
  }
  /**
   * Emit a named entity that was not terminated with a semicolon.
   * @returns The number of characters consumed.
   */
  emitNotTerminatedNamedEntity() {
    const { result, decodeTree } = this;
    const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
    this.emitNamedEntityData(result, valueLength, this.consumed);
    this.errors?.missingSemicolonAfterCharacterReference();
    return this.consumed;
  }
  /**
   * Emit a named entity.
   * @param result The index of the entity in the decode tree.
   * @param valueLength The number of bytes in the entity.
   * @param consumed The number of characters consumed.
   * @returns The number of characters consumed.
   */
  emitNamedEntityData(result, valueLength, consumed) {
    const { decodeTree } = this;
    this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~(BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13) : decodeTree[result + 1], consumed);
    if (valueLength === 3) {
      this.emitCodePoint(decodeTree[result + 2], consumed);
    }
    return consumed;
  }
  /**
   * Signal to the parser that the end of the input was reached.
   *
   * Remaining data will be emitted and relevant errors will be produced.
   * @returns The number of characters consumed.
   */
  end() {
    switch (this.state) {
      case EntityDecoderState.NamedEntity: {
        return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
      }
      // Otherwise, emit a numeric entity if we have one.
      case EntityDecoderState.NumericDecimal: {
        return this.emitNumericEntity(0, 2);
      }
      case EntityDecoderState.NumericHex: {
        return this.emitNumericEntity(0, 3);
      }
      case EntityDecoderState.NumericStart: {
        this.errors?.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      case EntityDecoderState.EntityStart: {
        return 0;
      }
    }
  }
};
function determineBranch(decodeTree, current, nodeIndex, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (branchCount === 0) {
    return jumpOffset !== 0 && char === jumpOffset ? nodeIndex : -1;
  }
  if (jumpOffset) {
    const value = char - jumpOffset;
    return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIndex + value] - 1;
  }
  const packedKeySlots = branchCount + 1 >> 1;
  let lo = 0;
  let hi = branchCount - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const slot = mid >> 1;
    const packed = decodeTree[nodeIndex + slot];
    const midKey = packed >> (mid & 1) * 8 & 255;
    if (midKey < char) {
      lo = mid + 1;
    } else if (midKey > char) {
      hi = mid - 1;
    } else {
      return decodeTree[nodeIndex + packedKeySlots + mid];
    }
  }
  return -1;
}

// node_modules/parse5/dist/common/html.js
var NS;
(function(NS2) {
  NS2["HTML"] = "http://www.w3.org/1999/xhtml";
  NS2["MATHML"] = "http://www.w3.org/1998/Math/MathML";
  NS2["SVG"] = "http://www.w3.org/2000/svg";
  NS2["XLINK"] = "http://www.w3.org/1999/xlink";
  NS2["XML"] = "http://www.w3.org/XML/1998/namespace";
  NS2["XMLNS"] = "http://www.w3.org/2000/xmlns/";
})(NS || (NS = {}));
var ATTRS;
(function(ATTRS2) {
  ATTRS2["TYPE"] = "type";
  ATTRS2["ACTION"] = "action";
  ATTRS2["ENCODING"] = "encoding";
  ATTRS2["PROMPT"] = "prompt";
  ATTRS2["NAME"] = "name";
  ATTRS2["COLOR"] = "color";
  ATTRS2["FACE"] = "face";
  ATTRS2["SIZE"] = "size";
})(ATTRS || (ATTRS = {}));
var DOCUMENT_MODE;
(function(DOCUMENT_MODE2) {
  DOCUMENT_MODE2["NO_QUIRKS"] = "no-quirks";
  DOCUMENT_MODE2["QUIRKS"] = "quirks";
  DOCUMENT_MODE2["LIMITED_QUIRKS"] = "limited-quirks";
})(DOCUMENT_MODE || (DOCUMENT_MODE = {}));
var TAG_NAMES;
(function(TAG_NAMES2) {
  TAG_NAMES2["A"] = "a";
  TAG_NAMES2["ADDRESS"] = "address";
  TAG_NAMES2["ANNOTATION_XML"] = "annotation-xml";
  TAG_NAMES2["APPLET"] = "applet";
  TAG_NAMES2["AREA"] = "area";
  TAG_NAMES2["ARTICLE"] = "article";
  TAG_NAMES2["ASIDE"] = "aside";
  TAG_NAMES2["B"] = "b";
  TAG_NAMES2["BASE"] = "base";
  TAG_NAMES2["BASEFONT"] = "basefont";
  TAG_NAMES2["BGSOUND"] = "bgsound";
  TAG_NAMES2["BIG"] = "big";
  TAG_NAMES2["BLOCKQUOTE"] = "blockquote";
  TAG_NAMES2["BODY"] = "body";
  TAG_NAMES2["BR"] = "br";
  TAG_NAMES2["BUTTON"] = "button";
  TAG_NAMES2["CAPTION"] = "caption";
  TAG_NAMES2["CENTER"] = "center";
  TAG_NAMES2["CODE"] = "code";
  TAG_NAMES2["COL"] = "col";
  TAG_NAMES2["COLGROUP"] = "colgroup";
  TAG_NAMES2["DD"] = "dd";
  TAG_NAMES2["DESC"] = "desc";
  TAG_NAMES2["DETAILS"] = "details";
  TAG_NAMES2["DIALOG"] = "dialog";
  TAG_NAMES2["DIR"] = "dir";
  TAG_NAMES2["DIV"] = "div";
  TAG_NAMES2["DL"] = "dl";
  TAG_NAMES2["DT"] = "dt";
  TAG_NAMES2["EM"] = "em";
  TAG_NAMES2["EMBED"] = "embed";
  TAG_NAMES2["FIELDSET"] = "fieldset";
  TAG_NAMES2["FIGCAPTION"] = "figcaption";
  TAG_NAMES2["FIGURE"] = "figure";
  TAG_NAMES2["FONT"] = "font";
  TAG_NAMES2["FOOTER"] = "footer";
  TAG_NAMES2["FOREIGN_OBJECT"] = "foreignObject";
  TAG_NAMES2["FORM"] = "form";
  TAG_NAMES2["FRAME"] = "frame";
  TAG_NAMES2["FRAMESET"] = "frameset";
  TAG_NAMES2["H1"] = "h1";
  TAG_NAMES2["H2"] = "h2";
  TAG_NAMES2["H3"] = "h3";
  TAG_NAMES2["H4"] = "h4";
  TAG_NAMES2["H5"] = "h5";
  TAG_NAMES2["H6"] = "h6";
  TAG_NAMES2["HEAD"] = "head";
  TAG_NAMES2["HEADER"] = "header";
  TAG_NAMES2["HGROUP"] = "hgroup";
  TAG_NAMES2["HR"] = "hr";
  TAG_NAMES2["HTML"] = "html";
  TAG_NAMES2["I"] = "i";
  TAG_NAMES2["IMG"] = "img";
  TAG_NAMES2["IMAGE"] = "image";
  TAG_NAMES2["INPUT"] = "input";
  TAG_NAMES2["IFRAME"] = "iframe";
  TAG_NAMES2["KEYGEN"] = "keygen";
  TAG_NAMES2["LABEL"] = "label";
  TAG_NAMES2["LI"] = "li";
  TAG_NAMES2["LINK"] = "link";
  TAG_NAMES2["LISTING"] = "listing";
  TAG_NAMES2["MAIN"] = "main";
  TAG_NAMES2["MALIGNMARK"] = "malignmark";
  TAG_NAMES2["MARQUEE"] = "marquee";
  TAG_NAMES2["MATH"] = "math";
  TAG_NAMES2["MENU"] = "menu";
  TAG_NAMES2["META"] = "meta";
  TAG_NAMES2["MGLYPH"] = "mglyph";
  TAG_NAMES2["MI"] = "mi";
  TAG_NAMES2["MO"] = "mo";
  TAG_NAMES2["MN"] = "mn";
  TAG_NAMES2["MS"] = "ms";
  TAG_NAMES2["MTEXT"] = "mtext";
  TAG_NAMES2["NAV"] = "nav";
  TAG_NAMES2["NOBR"] = "nobr";
  TAG_NAMES2["NOFRAMES"] = "noframes";
  TAG_NAMES2["NOEMBED"] = "noembed";
  TAG_NAMES2["NOSCRIPT"] = "noscript";
  TAG_NAMES2["OBJECT"] = "object";
  TAG_NAMES2["OL"] = "ol";
  TAG_NAMES2["OPTGROUP"] = "optgroup";
  TAG_NAMES2["OPTION"] = "option";
  TAG_NAMES2["P"] = "p";
  TAG_NAMES2["PARAM"] = "param";
  TAG_NAMES2["PLAINTEXT"] = "plaintext";
  TAG_NAMES2["PRE"] = "pre";
  TAG_NAMES2["RB"] = "rb";
  TAG_NAMES2["RP"] = "rp";
  TAG_NAMES2["RT"] = "rt";
  TAG_NAMES2["RTC"] = "rtc";
  TAG_NAMES2["RUBY"] = "ruby";
  TAG_NAMES2["S"] = "s";
  TAG_NAMES2["SCRIPT"] = "script";
  TAG_NAMES2["SEARCH"] = "search";
  TAG_NAMES2["SECTION"] = "section";
  TAG_NAMES2["SELECT"] = "select";
  TAG_NAMES2["SOURCE"] = "source";
  TAG_NAMES2["SMALL"] = "small";
  TAG_NAMES2["SPAN"] = "span";
  TAG_NAMES2["STRIKE"] = "strike";
  TAG_NAMES2["STRONG"] = "strong";
  TAG_NAMES2["STYLE"] = "style";
  TAG_NAMES2["SUB"] = "sub";
  TAG_NAMES2["SUMMARY"] = "summary";
  TAG_NAMES2["SUP"] = "sup";
  TAG_NAMES2["TABLE"] = "table";
  TAG_NAMES2["TBODY"] = "tbody";
  TAG_NAMES2["TEMPLATE"] = "template";
  TAG_NAMES2["TEXTAREA"] = "textarea";
  TAG_NAMES2["TFOOT"] = "tfoot";
  TAG_NAMES2["TD"] = "td";
  TAG_NAMES2["TH"] = "th";
  TAG_NAMES2["THEAD"] = "thead";
  TAG_NAMES2["TITLE"] = "title";
  TAG_NAMES2["TR"] = "tr";
  TAG_NAMES2["TRACK"] = "track";
  TAG_NAMES2["TT"] = "tt";
  TAG_NAMES2["U"] = "u";
  TAG_NAMES2["UL"] = "ul";
  TAG_NAMES2["SVG"] = "svg";
  TAG_NAMES2["VAR"] = "var";
  TAG_NAMES2["WBR"] = "wbr";
  TAG_NAMES2["XMP"] = "xmp";
})(TAG_NAMES || (TAG_NAMES = {}));
var TAG_ID;
(function(TAG_ID2) {
  TAG_ID2[TAG_ID2["UNKNOWN"] = 0] = "UNKNOWN";
  TAG_ID2[TAG_ID2["A"] = 1] = "A";
  TAG_ID2[TAG_ID2["ADDRESS"] = 2] = "ADDRESS";
  TAG_ID2[TAG_ID2["ANNOTATION_XML"] = 3] = "ANNOTATION_XML";
  TAG_ID2[TAG_ID2["APPLET"] = 4] = "APPLET";
  TAG_ID2[TAG_ID2["AREA"] = 5] = "AREA";
  TAG_ID2[TAG_ID2["ARTICLE"] = 6] = "ARTICLE";
  TAG_ID2[TAG_ID2["ASIDE"] = 7] = "ASIDE";
  TAG_ID2[TAG_ID2["B"] = 8] = "B";
  TAG_ID2[TAG_ID2["BASE"] = 9] = "BASE";
  TAG_ID2[TAG_ID2["BASEFONT"] = 10] = "BASEFONT";
  TAG_ID2[TAG_ID2["BGSOUND"] = 11] = "BGSOUND";
  TAG_ID2[TAG_ID2["BIG"] = 12] = "BIG";
  TAG_ID2[TAG_ID2["BLOCKQUOTE"] = 13] = "BLOCKQUOTE";
  TAG_ID2[TAG_ID2["BODY"] = 14] = "BODY";
  TAG_ID2[TAG_ID2["BR"] = 15] = "BR";
  TAG_ID2[TAG_ID2["BUTTON"] = 16] = "BUTTON";
  TAG_ID2[TAG_ID2["CAPTION"] = 17] = "CAPTION";
  TAG_ID2[TAG_ID2["CENTER"] = 18] = "CENTER";
  TAG_ID2[TAG_ID2["CODE"] = 19] = "CODE";
  TAG_ID2[TAG_ID2["COL"] = 20] = "COL";
  TAG_ID2[TAG_ID2["COLGROUP"] = 21] = "COLGROUP";
  TAG_ID2[TAG_ID2["DD"] = 22] = "DD";
  TAG_ID2[TAG_ID2["DESC"] = 23] = "DESC";
  TAG_ID2[TAG_ID2["DETAILS"] = 24] = "DETAILS";
  TAG_ID2[TAG_ID2["DIALOG"] = 25] = "DIALOG";
  TAG_ID2[TAG_ID2["DIR"] = 26] = "DIR";
  TAG_ID2[TAG_ID2["DIV"] = 27] = "DIV";
  TAG_ID2[TAG_ID2["DL"] = 28] = "DL";
  TAG_ID2[TAG_ID2["DT"] = 29] = "DT";
  TAG_ID2[TAG_ID2["EM"] = 30] = "EM";
  TAG_ID2[TAG_ID2["EMBED"] = 31] = "EMBED";
  TAG_ID2[TAG_ID2["FIELDSET"] = 32] = "FIELDSET";
  TAG_ID2[TAG_ID2["FIGCAPTION"] = 33] = "FIGCAPTION";
  TAG_ID2[TAG_ID2["FIGURE"] = 34] = "FIGURE";
  TAG_ID2[TAG_ID2["FONT"] = 35] = "FONT";
  TAG_ID2[TAG_ID2["FOOTER"] = 36] = "FOOTER";
  TAG_ID2[TAG_ID2["FOREIGN_OBJECT"] = 37] = "FOREIGN_OBJECT";
  TAG_ID2[TAG_ID2["FORM"] = 38] = "FORM";
  TAG_ID2[TAG_ID2["FRAME"] = 39] = "FRAME";
  TAG_ID2[TAG_ID2["FRAMESET"] = 40] = "FRAMESET";
  TAG_ID2[TAG_ID2["H1"] = 41] = "H1";
  TAG_ID2[TAG_ID2["H2"] = 42] = "H2";
  TAG_ID2[TAG_ID2["H3"] = 43] = "H3";
  TAG_ID2[TAG_ID2["H4"] = 44] = "H4";
  TAG_ID2[TAG_ID2["H5"] = 45] = "H5";
  TAG_ID2[TAG_ID2["H6"] = 46] = "H6";
  TAG_ID2[TAG_ID2["HEAD"] = 47] = "HEAD";
  TAG_ID2[TAG_ID2["HEADER"] = 48] = "HEADER";
  TAG_ID2[TAG_ID2["HGROUP"] = 49] = "HGROUP";
  TAG_ID2[TAG_ID2["HR"] = 50] = "HR";
  TAG_ID2[TAG_ID2["HTML"] = 51] = "HTML";
  TAG_ID2[TAG_ID2["I"] = 52] = "I";
  TAG_ID2[TAG_ID2["IMG"] = 53] = "IMG";
  TAG_ID2[TAG_ID2["IMAGE"] = 54] = "IMAGE";
  TAG_ID2[TAG_ID2["INPUT"] = 55] = "INPUT";
  TAG_ID2[TAG_ID2["IFRAME"] = 56] = "IFRAME";
  TAG_ID2[TAG_ID2["KEYGEN"] = 57] = "KEYGEN";
  TAG_ID2[TAG_ID2["LABEL"] = 58] = "LABEL";
  TAG_ID2[TAG_ID2["LI"] = 59] = "LI";
  TAG_ID2[TAG_ID2["LINK"] = 60] = "LINK";
  TAG_ID2[TAG_ID2["LISTING"] = 61] = "LISTING";
  TAG_ID2[TAG_ID2["MAIN"] = 62] = "MAIN";
  TAG_ID2[TAG_ID2["MALIGNMARK"] = 63] = "MALIGNMARK";
  TAG_ID2[TAG_ID2["MARQUEE"] = 64] = "MARQUEE";
  TAG_ID2[TAG_ID2["MATH"] = 65] = "MATH";
  TAG_ID2[TAG_ID2["MENU"] = 66] = "MENU";
  TAG_ID2[TAG_ID2["META"] = 67] = "META";
  TAG_ID2[TAG_ID2["MGLYPH"] = 68] = "MGLYPH";
  TAG_ID2[TAG_ID2["MI"] = 69] = "MI";
  TAG_ID2[TAG_ID2["MO"] = 70] = "MO";
  TAG_ID2[TAG_ID2["MN"] = 71] = "MN";
  TAG_ID2[TAG_ID2["MS"] = 72] = "MS";
  TAG_ID2[TAG_ID2["MTEXT"] = 73] = "MTEXT";
  TAG_ID2[TAG_ID2["NAV"] = 74] = "NAV";
  TAG_ID2[TAG_ID2["NOBR"] = 75] = "NOBR";
  TAG_ID2[TAG_ID2["NOFRAMES"] = 76] = "NOFRAMES";
  TAG_ID2[TAG_ID2["NOEMBED"] = 77] = "NOEMBED";
  TAG_ID2[TAG_ID2["NOSCRIPT"] = 78] = "NOSCRIPT";
  TAG_ID2[TAG_ID2["OBJECT"] = 79] = "OBJECT";
  TAG_ID2[TAG_ID2["OL"] = 80] = "OL";
  TAG_ID2[TAG_ID2["OPTGROUP"] = 81] = "OPTGROUP";
  TAG_ID2[TAG_ID2["OPTION"] = 82] = "OPTION";
  TAG_ID2[TAG_ID2["P"] = 83] = "P";
  TAG_ID2[TAG_ID2["PARAM"] = 84] = "PARAM";
  TAG_ID2[TAG_ID2["PLAINTEXT"] = 85] = "PLAINTEXT";
  TAG_ID2[TAG_ID2["PRE"] = 86] = "PRE";
  TAG_ID2[TAG_ID2["RB"] = 87] = "RB";
  TAG_ID2[TAG_ID2["RP"] = 88] = "RP";
  TAG_ID2[TAG_ID2["RT"] = 89] = "RT";
  TAG_ID2[TAG_ID2["RTC"] = 90] = "RTC";
  TAG_ID2[TAG_ID2["RUBY"] = 91] = "RUBY";
  TAG_ID2[TAG_ID2["S"] = 92] = "S";
  TAG_ID2[TAG_ID2["SCRIPT"] = 93] = "SCRIPT";
  TAG_ID2[TAG_ID2["SEARCH"] = 94] = "SEARCH";
  TAG_ID2[TAG_ID2["SECTION"] = 95] = "SECTION";
  TAG_ID2[TAG_ID2["SELECT"] = 96] = "SELECT";
  TAG_ID2[TAG_ID2["SOURCE"] = 97] = "SOURCE";
  TAG_ID2[TAG_ID2["SMALL"] = 98] = "SMALL";
  TAG_ID2[TAG_ID2["SPAN"] = 99] = "SPAN";
  TAG_ID2[TAG_ID2["STRIKE"] = 100] = "STRIKE";
  TAG_ID2[TAG_ID2["STRONG"] = 101] = "STRONG";
  TAG_ID2[TAG_ID2["STYLE"] = 102] = "STYLE";
  TAG_ID2[TAG_ID2["SUB"] = 103] = "SUB";
  TAG_ID2[TAG_ID2["SUMMARY"] = 104] = "SUMMARY";
  TAG_ID2[TAG_ID2["SUP"] = 105] = "SUP";
  TAG_ID2[TAG_ID2["TABLE"] = 106] = "TABLE";
  TAG_ID2[TAG_ID2["TBODY"] = 107] = "TBODY";
  TAG_ID2[TAG_ID2["TEMPLATE"] = 108] = "TEMPLATE";
  TAG_ID2[TAG_ID2["TEXTAREA"] = 109] = "TEXTAREA";
  TAG_ID2[TAG_ID2["TFOOT"] = 110] = "TFOOT";
  TAG_ID2[TAG_ID2["TD"] = 111] = "TD";
  TAG_ID2[TAG_ID2["TH"] = 112] = "TH";
  TAG_ID2[TAG_ID2["THEAD"] = 113] = "THEAD";
  TAG_ID2[TAG_ID2["TITLE"] = 114] = "TITLE";
  TAG_ID2[TAG_ID2["TR"] = 115] = "TR";
  TAG_ID2[TAG_ID2["TRACK"] = 116] = "TRACK";
  TAG_ID2[TAG_ID2["TT"] = 117] = "TT";
  TAG_ID2[TAG_ID2["U"] = 118] = "U";
  TAG_ID2[TAG_ID2["UL"] = 119] = "UL";
  TAG_ID2[TAG_ID2["SVG"] = 120] = "SVG";
  TAG_ID2[TAG_ID2["VAR"] = 121] = "VAR";
  TAG_ID2[TAG_ID2["WBR"] = 122] = "WBR";
  TAG_ID2[TAG_ID2["XMP"] = 123] = "XMP";
})(TAG_ID || (TAG_ID = {}));
var TAG_NAME_TO_ID = /* @__PURE__ */ new Map([
  [TAG_NAMES.A, TAG_ID.A],
  [TAG_NAMES.ADDRESS, TAG_ID.ADDRESS],
  [TAG_NAMES.ANNOTATION_XML, TAG_ID.ANNOTATION_XML],
  [TAG_NAMES.APPLET, TAG_ID.APPLET],
  [TAG_NAMES.AREA, TAG_ID.AREA],
  [TAG_NAMES.ARTICLE, TAG_ID.ARTICLE],
  [TAG_NAMES.ASIDE, TAG_ID.ASIDE],
  [TAG_NAMES.B, TAG_ID.B],
  [TAG_NAMES.BASE, TAG_ID.BASE],
  [TAG_NAMES.BASEFONT, TAG_ID.BASEFONT],
  [TAG_NAMES.BGSOUND, TAG_ID.BGSOUND],
  [TAG_NAMES.BIG, TAG_ID.BIG],
  [TAG_NAMES.BLOCKQUOTE, TAG_ID.BLOCKQUOTE],
  [TAG_NAMES.BODY, TAG_ID.BODY],
  [TAG_NAMES.BR, TAG_ID.BR],
  [TAG_NAMES.BUTTON, TAG_ID.BUTTON],
  [TAG_NAMES.CAPTION, TAG_ID.CAPTION],
  [TAG_NAMES.CENTER, TAG_ID.CENTER],
  [TAG_NAMES.CODE, TAG_ID.CODE],
  [TAG_NAMES.COL, TAG_ID.COL],
  [TAG_NAMES.COLGROUP, TAG_ID.COLGROUP],
  [TAG_NAMES.DD, TAG_ID.DD],
  [TAG_NAMES.DESC, TAG_ID.DESC],
  [TAG_NAMES.DETAILS, TAG_ID.DETAILS],
  [TAG_NAMES.DIALOG, TAG_ID.DIALOG],
  [TAG_NAMES.DIR, TAG_ID.DIR],
  [TAG_NAMES.DIV, TAG_ID.DIV],
  [TAG_NAMES.DL, TAG_ID.DL],
  [TAG_NAMES.DT, TAG_ID.DT],
  [TAG_NAMES.EM, TAG_ID.EM],
  [TAG_NAMES.EMBED, TAG_ID.EMBED],
  [TAG_NAMES.FIELDSET, TAG_ID.FIELDSET],
  [TAG_NAMES.FIGCAPTION, TAG_ID.FIGCAPTION],
  [TAG_NAMES.FIGURE, TAG_ID.FIGURE],
  [TAG_NAMES.FONT, TAG_ID.FONT],
  [TAG_NAMES.FOOTER, TAG_ID.FOOTER],
  [TAG_NAMES.FOREIGN_OBJECT, TAG_ID.FOREIGN_OBJECT],
  [TAG_NAMES.FORM, TAG_ID.FORM],
  [TAG_NAMES.FRAME, TAG_ID.FRAME],
  [TAG_NAMES.FRAMESET, TAG_ID.FRAMESET],
  [TAG_NAMES.H1, TAG_ID.H1],
  [TAG_NAMES.H2, TAG_ID.H2],
  [TAG_NAMES.H3, TAG_ID.H3],
  [TAG_NAMES.H4, TAG_ID.H4],
  [TAG_NAMES.H5, TAG_ID.H5],
  [TAG_NAMES.H6, TAG_ID.H6],
  [TAG_NAMES.HEAD, TAG_ID.HEAD],
  [TAG_NAMES.HEADER, TAG_ID.HEADER],
  [TAG_NAMES.HGROUP, TAG_ID.HGROUP],
  [TAG_NAMES.HR, TAG_ID.HR],
  [TAG_NAMES.HTML, TAG_ID.HTML],
  [TAG_NAMES.I, TAG_ID.I],
  [TAG_NAMES.IMG, TAG_ID.IMG],
  [TAG_NAMES.IMAGE, TAG_ID.IMAGE],
  [TAG_NAMES.INPUT, TAG_ID.INPUT],
  [TAG_NAMES.IFRAME, TAG_ID.IFRAME],
  [TAG_NAMES.KEYGEN, TAG_ID.KEYGEN],
  [TAG_NAMES.LABEL, TAG_ID.LABEL],
  [TAG_NAMES.LI, TAG_ID.LI],
  [TAG_NAMES.LINK, TAG_ID.LINK],
  [TAG_NAMES.LISTING, TAG_ID.LISTING],
  [TAG_NAMES.MAIN, TAG_ID.MAIN],
  [TAG_NAMES.MALIGNMARK, TAG_ID.MALIGNMARK],
  [TAG_NAMES.MARQUEE, TAG_ID.MARQUEE],
  [TAG_NAMES.MATH, TAG_ID.MATH],
  [TAG_NAMES.MENU, TAG_ID.MENU],
  [TAG_NAMES.META, TAG_ID.META],
  [TAG_NAMES.MGLYPH, TAG_ID.MGLYPH],
  [TAG_NAMES.MI, TAG_ID.MI],
  [TAG_NAMES.MO, TAG_ID.MO],
  [TAG_NAMES.MN, TAG_ID.MN],
  [TAG_NAMES.MS, TAG_ID.MS],
  [TAG_NAMES.MTEXT, TAG_ID.MTEXT],
  [TAG_NAMES.NAV, TAG_ID.NAV],
  [TAG_NAMES.NOBR, TAG_ID.NOBR],
  [TAG_NAMES.NOFRAMES, TAG_ID.NOFRAMES],
  [TAG_NAMES.NOEMBED, TAG_ID.NOEMBED],
  [TAG_NAMES.NOSCRIPT, TAG_ID.NOSCRIPT],
  [TAG_NAMES.OBJECT, TAG_ID.OBJECT],
  [TAG_NAMES.OL, TAG_ID.OL],
  [TAG_NAMES.OPTGROUP, TAG_ID.OPTGROUP],
  [TAG_NAMES.OPTION, TAG_ID.OPTION],
  [TAG_NAMES.P, TAG_ID.P],
  [TAG_NAMES.PARAM, TAG_ID.PARAM],
  [TAG_NAMES.PLAINTEXT, TAG_ID.PLAINTEXT],
  [TAG_NAMES.PRE, TAG_ID.PRE],
  [TAG_NAMES.RB, TAG_ID.RB],
  [TAG_NAMES.RP, TAG_ID.RP],
  [TAG_NAMES.RT, TAG_ID.RT],
  [TAG_NAMES.RTC, TAG_ID.RTC],
  [TAG_NAMES.RUBY, TAG_ID.RUBY],
  [TAG_NAMES.S, TAG_ID.S],
  [TAG_NAMES.SCRIPT, TAG_ID.SCRIPT],
  [TAG_NAMES.SEARCH, TAG_ID.SEARCH],
  [TAG_NAMES.SECTION, TAG_ID.SECTION],
  [TAG_NAMES.SELECT, TAG_ID.SELECT],
  [TAG_NAMES.SOURCE, TAG_ID.SOURCE],
  [TAG_NAMES.SMALL, TAG_ID.SMALL],
  [TAG_NAMES.SPAN, TAG_ID.SPAN],
  [TAG_NAMES.STRIKE, TAG_ID.STRIKE],
  [TAG_NAMES.STRONG, TAG_ID.STRONG],
  [TAG_NAMES.STYLE, TAG_ID.STYLE],
  [TAG_NAMES.SUB, TAG_ID.SUB],
  [TAG_NAMES.SUMMARY, TAG_ID.SUMMARY],
  [TAG_NAMES.SUP, TAG_ID.SUP],
  [TAG_NAMES.TABLE, TAG_ID.TABLE],
  [TAG_NAMES.TBODY, TAG_ID.TBODY],
  [TAG_NAMES.TEMPLATE, TAG_ID.TEMPLATE],
  [TAG_NAMES.TEXTAREA, TAG_ID.TEXTAREA],
  [TAG_NAMES.TFOOT, TAG_ID.TFOOT],
  [TAG_NAMES.TD, TAG_ID.TD],
  [TAG_NAMES.TH, TAG_ID.TH],
  [TAG_NAMES.THEAD, TAG_ID.THEAD],
  [TAG_NAMES.TITLE, TAG_ID.TITLE],
  [TAG_NAMES.TR, TAG_ID.TR],
  [TAG_NAMES.TRACK, TAG_ID.TRACK],
  [TAG_NAMES.TT, TAG_ID.TT],
  [TAG_NAMES.U, TAG_ID.U],
  [TAG_NAMES.UL, TAG_ID.UL],
  [TAG_NAMES.SVG, TAG_ID.SVG],
  [TAG_NAMES.VAR, TAG_ID.VAR],
  [TAG_NAMES.WBR, TAG_ID.WBR],
  [TAG_NAMES.XMP, TAG_ID.XMP]
]);
function getTagID(tagName) {
  var _a;
  return (_a = TAG_NAME_TO_ID.get(tagName)) !== null && _a !== void 0 ? _a : TAG_ID.UNKNOWN;
}
var $ = TAG_ID;
var SPECIAL_ELEMENTS = {
  [NS.HTML]: /* @__PURE__ */ new Set([
    $.ADDRESS,
    $.APPLET,
    $.AREA,
    $.ARTICLE,
    $.ASIDE,
    $.BASE,
    $.BASEFONT,
    $.BGSOUND,
    $.BLOCKQUOTE,
    $.BODY,
    $.BR,
    $.BUTTON,
    $.CAPTION,
    $.CENTER,
    $.COL,
    $.COLGROUP,
    $.DD,
    $.DETAILS,
    $.DIR,
    $.DIV,
    $.DL,
    $.DT,
    $.EMBED,
    $.FIELDSET,
    $.FIGCAPTION,
    $.FIGURE,
    $.FOOTER,
    $.FORM,
    $.FRAME,
    $.FRAMESET,
    $.H1,
    $.H2,
    $.H3,
    $.H4,
    $.H5,
    $.H6,
    $.HEAD,
    $.HEADER,
    $.HGROUP,
    $.HR,
    $.HTML,
    $.IFRAME,
    $.IMG,
    $.INPUT,
    $.LI,
    $.LINK,
    $.LISTING,
    $.MAIN,
    $.MARQUEE,
    $.MENU,
    $.META,
    $.NAV,
    $.NOEMBED,
    $.NOFRAMES,
    $.NOSCRIPT,
    $.OBJECT,
    $.OL,
    $.P,
    $.PARAM,
    $.PLAINTEXT,
    $.PRE,
    $.SCRIPT,
    $.SECTION,
    $.SELECT,
    $.SOURCE,
    $.STYLE,
    $.SUMMARY,
    $.TABLE,
    $.TBODY,
    $.TD,
    $.TEMPLATE,
    $.TEXTAREA,
    $.TFOOT,
    $.TH,
    $.THEAD,
    $.TITLE,
    $.TR,
    $.TRACK,
    $.UL,
    $.WBR,
    $.XMP
  ]),
  [NS.MATHML]: /* @__PURE__ */ new Set([$.MI, $.MO, $.MN, $.MS, $.MTEXT, $.ANNOTATION_XML]),
  [NS.SVG]: /* @__PURE__ */ new Set([$.TITLE, $.FOREIGN_OBJECT, $.DESC]),
  [NS.XLINK]: /* @__PURE__ */ new Set(),
  [NS.XML]: /* @__PURE__ */ new Set(),
  [NS.XMLNS]: /* @__PURE__ */ new Set()
};
var NUMBERED_HEADERS = /* @__PURE__ */ new Set([$.H1, $.H2, $.H3, $.H4, $.H5, $.H6]);
var UNESCAPED_TEXT = /* @__PURE__ */ new Set([
  TAG_NAMES.STYLE,
  TAG_NAMES.SCRIPT,
  TAG_NAMES.XMP,
  TAG_NAMES.IFRAME,
  TAG_NAMES.NOEMBED,
  TAG_NAMES.NOFRAMES,
  TAG_NAMES.PLAINTEXT
]);
function hasUnescapedText(tn, scriptingEnabled) {
  return UNESCAPED_TEXT.has(tn) || scriptingEnabled && tn === TAG_NAMES.NOSCRIPT;
}

// node_modules/parse5/dist/tokenizer/index.js
var State;
(function(State2) {
  State2[State2["DATA"] = 0] = "DATA";
  State2[State2["RCDATA"] = 1] = "RCDATA";
  State2[State2["RAWTEXT"] = 2] = "RAWTEXT";
  State2[State2["SCRIPT_DATA"] = 3] = "SCRIPT_DATA";
  State2[State2["PLAINTEXT"] = 4] = "PLAINTEXT";
  State2[State2["TAG_OPEN"] = 5] = "TAG_OPEN";
  State2[State2["END_TAG_OPEN"] = 6] = "END_TAG_OPEN";
  State2[State2["TAG_NAME"] = 7] = "TAG_NAME";
  State2[State2["RCDATA_LESS_THAN_SIGN"] = 8] = "RCDATA_LESS_THAN_SIGN";
  State2[State2["RCDATA_END_TAG_OPEN"] = 9] = "RCDATA_END_TAG_OPEN";
  State2[State2["RCDATA_END_TAG_NAME"] = 10] = "RCDATA_END_TAG_NAME";
  State2[State2["RAWTEXT_LESS_THAN_SIGN"] = 11] = "RAWTEXT_LESS_THAN_SIGN";
  State2[State2["RAWTEXT_END_TAG_OPEN"] = 12] = "RAWTEXT_END_TAG_OPEN";
  State2[State2["RAWTEXT_END_TAG_NAME"] = 13] = "RAWTEXT_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_LESS_THAN_SIGN"] = 14] = "SCRIPT_DATA_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_END_TAG_OPEN"] = 15] = "SCRIPT_DATA_END_TAG_OPEN";
  State2[State2["SCRIPT_DATA_END_TAG_NAME"] = 16] = "SCRIPT_DATA_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_ESCAPE_START"] = 17] = "SCRIPT_DATA_ESCAPE_START";
  State2[State2["SCRIPT_DATA_ESCAPE_START_DASH"] = 18] = "SCRIPT_DATA_ESCAPE_START_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED"] = 19] = "SCRIPT_DATA_ESCAPED";
  State2[State2["SCRIPT_DATA_ESCAPED_DASH"] = 20] = "SCRIPT_DATA_ESCAPED_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED_DASH_DASH"] = 21] = "SCRIPT_DATA_ESCAPED_DASH_DASH";
  State2[State2["SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN"] = 22] = "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_OPEN"] = 23] = "SCRIPT_DATA_ESCAPED_END_TAG_OPEN";
  State2[State2["SCRIPT_DATA_ESCAPED_END_TAG_NAME"] = 24] = "SCRIPT_DATA_ESCAPED_END_TAG_NAME";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_START"] = 25] = "SCRIPT_DATA_DOUBLE_ESCAPE_START";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED"] = 26] = "SCRIPT_DATA_DOUBLE_ESCAPED";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH"] = 27] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH"] = 28] = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN"] = 29] = "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN";
  State2[State2["SCRIPT_DATA_DOUBLE_ESCAPE_END"] = 30] = "SCRIPT_DATA_DOUBLE_ESCAPE_END";
  State2[State2["BEFORE_ATTRIBUTE_NAME"] = 31] = "BEFORE_ATTRIBUTE_NAME";
  State2[State2["ATTRIBUTE_NAME"] = 32] = "ATTRIBUTE_NAME";
  State2[State2["AFTER_ATTRIBUTE_NAME"] = 33] = "AFTER_ATTRIBUTE_NAME";
  State2[State2["BEFORE_ATTRIBUTE_VALUE"] = 34] = "BEFORE_ATTRIBUTE_VALUE";
  State2[State2["ATTRIBUTE_VALUE_DOUBLE_QUOTED"] = 35] = "ATTRIBUTE_VALUE_DOUBLE_QUOTED";
  State2[State2["ATTRIBUTE_VALUE_SINGLE_QUOTED"] = 36] = "ATTRIBUTE_VALUE_SINGLE_QUOTED";
  State2[State2["ATTRIBUTE_VALUE_UNQUOTED"] = 37] = "ATTRIBUTE_VALUE_UNQUOTED";
  State2[State2["AFTER_ATTRIBUTE_VALUE_QUOTED"] = 38] = "AFTER_ATTRIBUTE_VALUE_QUOTED";
  State2[State2["SELF_CLOSING_START_TAG"] = 39] = "SELF_CLOSING_START_TAG";
  State2[State2["BOGUS_COMMENT"] = 40] = "BOGUS_COMMENT";
  State2[State2["MARKUP_DECLARATION_OPEN"] = 41] = "MARKUP_DECLARATION_OPEN";
  State2[State2["COMMENT_START"] = 42] = "COMMENT_START";
  State2[State2["COMMENT_START_DASH"] = 43] = "COMMENT_START_DASH";
  State2[State2["COMMENT"] = 44] = "COMMENT";
  State2[State2["COMMENT_LESS_THAN_SIGN"] = 45] = "COMMENT_LESS_THAN_SIGN";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG"] = 46] = "COMMENT_LESS_THAN_SIGN_BANG";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH"] = 47] = "COMMENT_LESS_THAN_SIGN_BANG_DASH";
  State2[State2["COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH"] = 48] = "COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH";
  State2[State2["COMMENT_END_DASH"] = 49] = "COMMENT_END_DASH";
  State2[State2["COMMENT_END"] = 50] = "COMMENT_END";
  State2[State2["COMMENT_END_BANG"] = 51] = "COMMENT_END_BANG";
  State2[State2["DOCTYPE"] = 52] = "DOCTYPE";
  State2[State2["BEFORE_DOCTYPE_NAME"] = 53] = "BEFORE_DOCTYPE_NAME";
  State2[State2["DOCTYPE_NAME"] = 54] = "DOCTYPE_NAME";
  State2[State2["AFTER_DOCTYPE_NAME"] = 55] = "AFTER_DOCTYPE_NAME";
  State2[State2["AFTER_DOCTYPE_PUBLIC_KEYWORD"] = 56] = "AFTER_DOCTYPE_PUBLIC_KEYWORD";
  State2[State2["BEFORE_DOCTYPE_PUBLIC_IDENTIFIER"] = 57] = "BEFORE_DOCTYPE_PUBLIC_IDENTIFIER";
  State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED"] = 58] = "DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED";
  State2[State2["DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED"] = 59] = "DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED";
  State2[State2["AFTER_DOCTYPE_PUBLIC_IDENTIFIER"] = 60] = "AFTER_DOCTYPE_PUBLIC_IDENTIFIER";
  State2[State2["BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS"] = 61] = "BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS";
  State2[State2["AFTER_DOCTYPE_SYSTEM_KEYWORD"] = 62] = "AFTER_DOCTYPE_SYSTEM_KEYWORD";
  State2[State2["BEFORE_DOCTYPE_SYSTEM_IDENTIFIER"] = 63] = "BEFORE_DOCTYPE_SYSTEM_IDENTIFIER";
  State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED"] = 64] = "DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED";
  State2[State2["DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED"] = 65] = "DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED";
  State2[State2["AFTER_DOCTYPE_SYSTEM_IDENTIFIER"] = 66] = "AFTER_DOCTYPE_SYSTEM_IDENTIFIER";
  State2[State2["BOGUS_DOCTYPE"] = 67] = "BOGUS_DOCTYPE";
  State2[State2["CDATA_SECTION"] = 68] = "CDATA_SECTION";
  State2[State2["CDATA_SECTION_BRACKET"] = 69] = "CDATA_SECTION_BRACKET";
  State2[State2["CDATA_SECTION_END"] = 70] = "CDATA_SECTION_END";
  State2[State2["CHARACTER_REFERENCE"] = 71] = "CHARACTER_REFERENCE";
  State2[State2["AMBIGUOUS_AMPERSAND"] = 72] = "AMBIGUOUS_AMPERSAND";
})(State || (State = {}));
var TokenizerMode = {
  DATA: State.DATA,
  RCDATA: State.RCDATA,
  RAWTEXT: State.RAWTEXT,
  SCRIPT_DATA: State.SCRIPT_DATA,
  PLAINTEXT: State.PLAINTEXT,
  CDATA_SECTION: State.CDATA_SECTION
};
function isAsciiDigit(cp) {
  return cp >= CODE_POINTS.DIGIT_0 && cp <= CODE_POINTS.DIGIT_9;
}
function isAsciiUpper(cp) {
  return cp >= CODE_POINTS.LATIN_CAPITAL_A && cp <= CODE_POINTS.LATIN_CAPITAL_Z;
}
function isAsciiLower(cp) {
  return cp >= CODE_POINTS.LATIN_SMALL_A && cp <= CODE_POINTS.LATIN_SMALL_Z;
}
function isAsciiLetter(cp) {
  return isAsciiLower(cp) || isAsciiUpper(cp);
}
function isAsciiAlphaNumeric2(cp) {
  return isAsciiLetter(cp) || isAsciiDigit(cp);
}
function toAsciiLower(cp) {
  return cp + 32;
}
function isWhitespace(cp) {
  return cp === CODE_POINTS.SPACE || cp === CODE_POINTS.LINE_FEED || cp === CODE_POINTS.TABULATION || cp === CODE_POINTS.FORM_FEED;
}
function isScriptDataDoubleEscapeSequenceEnd(cp) {
  return isWhitespace(cp) || cp === CODE_POINTS.SOLIDUS || cp === CODE_POINTS.GREATER_THAN_SIGN;
}
function getErrorForNumericCharacterReference(code) {
  if (code === CODE_POINTS.NULL) {
    return ERR.nullCharacterReference;
  } else if (code > 1114111) {
    return ERR.characterReferenceOutsideUnicodeRange;
  } else if (isSurrogate(code)) {
    return ERR.surrogateCharacterReference;
  } else if (isUndefinedCodePoint(code)) {
    return ERR.noncharacterCharacterReference;
  } else if (isControlCodePoint(code) || code === CODE_POINTS.CARRIAGE_RETURN) {
    return ERR.controlCharacterReference;
  }
  return null;
}
var Tokenizer = class {
  constructor(options, handler) {
    this.options = options;
    this.handler = handler;
    this.paused = false;
    this.inLoop = false;
    this.inForeignNode = false;
    this.lastStartTagName = "";
    this.active = false;
    this.state = State.DATA;
    this.returnState = State.DATA;
    this.entityStartPos = 0;
    this.consumedAfterSnapshot = -1;
    this.currentCharacterToken = null;
    this.currentToken = null;
    this.currentAttr = { name: "", value: "" };
    this.preprocessor = new Preprocessor(handler);
    this.currentLocation = this.getCurrentLocation(-1);
    this.entityDecoder = new EntityDecoder(htmlDecodeTree, (cp, consumed) => {
      this.preprocessor.pos = this.entityStartPos + consumed - 1;
      this._flushCodePointConsumedAsCharacterReference(cp);
    }, handler.onParseError ? {
      missingSemicolonAfterCharacterReference: () => {
        this._err(ERR.missingSemicolonAfterCharacterReference, 1);
      },
      absenceOfDigitsInNumericCharacterReference: (consumed) => {
        this._err(ERR.absenceOfDigitsInNumericCharacterReference, this.entityStartPos - this.preprocessor.pos + consumed);
      },
      validateNumericCharacterReference: (code) => {
        const error = getErrorForNumericCharacterReference(code);
        if (error)
          this._err(error, 1);
      }
    } : void 0);
  }
  //Errors
  _err(code, cpOffset = 0) {
    var _a, _b;
    (_b = (_a = this.handler).onParseError) === null || _b === void 0 ? void 0 : _b.call(_a, this.preprocessor.getError(code, cpOffset));
  }
  // NOTE: `offset` may never run across line boundaries.
  getCurrentLocation(offset) {
    if (!this.options.sourceCodeLocationInfo) {
      return null;
    }
    return {
      startLine: this.preprocessor.line,
      startCol: this.preprocessor.col - offset,
      startOffset: this.preprocessor.offset - offset,
      endLine: -1,
      endCol: -1,
      endOffset: -1
    };
  }
  _runParsingLoop() {
    if (this.inLoop)
      return;
    this.inLoop = true;
    while (this.active && !this.paused) {
      this.consumedAfterSnapshot = 0;
      const cp = this._consume();
      if (!this._ensureHibernation()) {
        this._callState(cp);
      }
    }
    this.inLoop = false;
  }
  //API
  pause() {
    this.paused = true;
  }
  resume(writeCallback) {
    if (!this.paused) {
      throw new Error("Parser was already resumed");
    }
    this.paused = false;
    if (this.inLoop)
      return;
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
    }
  }
  write(chunk, isLastChunk, writeCallback) {
    this.active = true;
    this.preprocessor.write(chunk, isLastChunk);
    this._runParsingLoop();
    if (!this.paused) {
      writeCallback === null || writeCallback === void 0 ? void 0 : writeCallback();
    }
  }
  insertHtmlAtCurrentPos(chunk) {
    this.active = true;
    this.preprocessor.insertHtmlAtCurrentPos(chunk);
    this._runParsingLoop();
  }
  //Hibernation
  _ensureHibernation() {
    if (this.preprocessor.endOfChunkHit) {
      this.preprocessor.retreat(this.consumedAfterSnapshot);
      this.consumedAfterSnapshot = 0;
      this.active = false;
      return true;
    }
    return false;
  }
  //Consumption
  _consume() {
    this.consumedAfterSnapshot++;
    return this.preprocessor.advance();
  }
  _advanceBy(count) {
    this.consumedAfterSnapshot += count;
    for (let i = 0; i < count; i++) {
      this.preprocessor.advance();
    }
  }
  _consumeSequenceIfMatch(pattern, caseSensitive) {
    if (this.preprocessor.startsWith(pattern, caseSensitive)) {
      this._advanceBy(pattern.length - 1);
      return true;
    }
    return false;
  }
  //Token creation
  _createStartTagToken() {
    this.currentToken = {
      type: TokenType.START_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(1)
    };
  }
  _createEndTagToken() {
    this.currentToken = {
      type: TokenType.END_TAG,
      tagName: "",
      tagID: TAG_ID.UNKNOWN,
      selfClosing: false,
      ackSelfClosing: false,
      attrs: [],
      location: this.getCurrentLocation(2)
    };
  }
  _createCommentToken(offset) {
    this.currentToken = {
      type: TokenType.COMMENT,
      data: "",
      location: this.getCurrentLocation(offset)
    };
  }
  _createDoctypeToken(initialName) {
    this.currentToken = {
      type: TokenType.DOCTYPE,
      name: initialName,
      forceQuirks: false,
      publicId: null,
      systemId: null,
      location: this.currentLocation
    };
  }
  _createCharacterToken(type, chars) {
    this.currentCharacterToken = {
      type,
      chars,
      location: this.currentLocation
    };
  }
  //Tag attributes
  _createAttr(attrNameFirstCh) {
    this.currentAttr = {
      name: attrNameFirstCh,
      value: ""
    };
    this.currentLocation = this.getCurrentLocation(0);
  }
  _leaveAttrName() {
    var _a;
    var _b;
    const token = this.currentToken;
    if (getTokenAttr(token, this.currentAttr.name) === null) {
      token.attrs.push(this.currentAttr);
      if (token.location && this.currentLocation) {
        const attrLocations = (_a = (_b = token.location).attrs) !== null && _a !== void 0 ? _a : _b.attrs = /* @__PURE__ */ Object.create(null);
        attrLocations[this.currentAttr.name] = this.currentLocation;
        this._leaveAttrValue();
      }
    } else {
      this._err(ERR.duplicateAttribute);
    }
  }
  _leaveAttrValue() {
    if (this.currentLocation) {
      this.currentLocation.endLine = this.preprocessor.line;
      this.currentLocation.endCol = this.preprocessor.col;
      this.currentLocation.endOffset = this.preprocessor.offset;
    }
  }
  //Token emission
  prepareToken(ct) {
    this._emitCurrentCharacterToken(ct.location);
    this.currentToken = null;
    if (ct.location) {
      ct.location.endLine = this.preprocessor.line;
      ct.location.endCol = this.preprocessor.col + 1;
      ct.location.endOffset = this.preprocessor.offset + 1;
    }
    this.currentLocation = this.getCurrentLocation(-1);
  }
  emitCurrentTagToken() {
    const ct = this.currentToken;
    this.prepareToken(ct);
    ct.tagID = getTagID(ct.tagName);
    if (ct.type === TokenType.START_TAG) {
      this.lastStartTagName = ct.tagName;
      this.handler.onStartTag(ct);
    } else {
      if (ct.attrs.length > 0) {
        this._err(ERR.endTagWithAttributes);
      }
      if (ct.selfClosing) {
        this._err(ERR.endTagWithTrailingSolidus);
      }
      this.handler.onEndTag(ct);
    }
    this.preprocessor.dropParsedChunk();
  }
  emitCurrentComment(ct) {
    this.prepareToken(ct);
    this.handler.onComment(ct);
    this.preprocessor.dropParsedChunk();
  }
  emitCurrentDoctype(ct) {
    this.prepareToken(ct);
    this.handler.onDoctype(ct);
    this.preprocessor.dropParsedChunk();
  }
  _emitCurrentCharacterToken(nextLocation) {
    if (this.currentCharacterToken) {
      if (nextLocation && this.currentCharacterToken.location) {
        this.currentCharacterToken.location.endLine = nextLocation.startLine;
        this.currentCharacterToken.location.endCol = nextLocation.startCol;
        this.currentCharacterToken.location.endOffset = nextLocation.startOffset;
      }
      switch (this.currentCharacterToken.type) {
        case TokenType.CHARACTER: {
          this.handler.onCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.NULL_CHARACTER: {
          this.handler.onNullCharacter(this.currentCharacterToken);
          break;
        }
        case TokenType.WHITESPACE_CHARACTER: {
          this.handler.onWhitespaceCharacter(this.currentCharacterToken);
          break;
        }
      }
      this.currentCharacterToken = null;
    }
  }
  _emitEOFToken() {
    const location = this.getCurrentLocation(0);
    if (location) {
      location.endLine = location.startLine;
      location.endCol = location.startCol;
      location.endOffset = location.startOffset;
    }
    this._emitCurrentCharacterToken(location);
    this.handler.onEof({ type: TokenType.EOF, location });
    this.active = false;
  }
  //Characters emission
  //OPTIMIZATION: The specification uses only one type of character token (one token per character).
  //This causes a huge memory overhead and a lot of unnecessary parser loops. parse5 uses 3 groups of characters.
  //If we have a sequence of characters that belong to the same group, the parser can process it
  //as a single solid character token.
  //So, there are 3 types of character tokens in parse5:
  //1)TokenType.NULL_CHARACTER - \u0000-character sequences (e.g. '\u0000\u0000\u0000')
  //2)TokenType.WHITESPACE_CHARACTER - any whitespace/new-line character sequences (e.g. '\n  \r\t   \f')
  //3)TokenType.CHARACTER - any character sequence which don't belong to groups 1 and 2 (e.g. 'abcdef1234@@#$%^')
  _appendCharToCurrentCharacterToken(type, ch) {
    if (this.currentCharacterToken) {
      if (this.currentCharacterToken.type === type) {
        this.currentCharacterToken.chars += ch;
        return;
      } else {
        this.currentLocation = this.getCurrentLocation(0);
        this._emitCurrentCharacterToken(this.currentLocation);
        this.preprocessor.dropParsedChunk();
      }
    }
    this._createCharacterToken(type, ch);
  }
  _emitCodePoint(cp) {
    const type = isWhitespace(cp) ? TokenType.WHITESPACE_CHARACTER : cp === CODE_POINTS.NULL ? TokenType.NULL_CHARACTER : TokenType.CHARACTER;
    this._appendCharToCurrentCharacterToken(type, cp < 65536 ? String.fromCharCode(cp) : String.fromCodePoint(cp));
  }
  //NOTE: used when we emit characters explicitly.
  //This is always for non-whitespace and non-null characters, which allows us to avoid additional checks.
  _emitChars(ch) {
    this._appendCharToCurrentCharacterToken(TokenType.CHARACTER, ch);
  }
  // Character reference helpers
  _startCharacterReference() {
    this.returnState = this.state;
    this.state = State.CHARACTER_REFERENCE;
    this.entityStartPos = this.preprocessor.pos;
    this.entityDecoder.startEntity(this._isCharacterReferenceInAttribute() ? DecodingMode.Attribute : DecodingMode.Legacy);
  }
  _isCharacterReferenceInAttribute() {
    return this.returnState === State.ATTRIBUTE_VALUE_DOUBLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_SINGLE_QUOTED || this.returnState === State.ATTRIBUTE_VALUE_UNQUOTED;
  }
  _flushCodePointConsumedAsCharacterReference(cp) {
    if (this._isCharacterReferenceInAttribute()) {
      this.currentAttr.value += String.fromCodePoint(cp);
    } else {
      this._emitCodePoint(cp);
    }
  }
  // Calling states this way turns out to be much faster than any other approach.
  _callState(cp) {
    switch (this.state) {
      case State.DATA: {
        this._stateData(cp);
        break;
      }
      case State.RCDATA: {
        this._stateRcdata(cp);
        break;
      }
      case State.RAWTEXT: {
        this._stateRawtext(cp);
        break;
      }
      case State.SCRIPT_DATA: {
        this._stateScriptData(cp);
        break;
      }
      case State.PLAINTEXT: {
        this._statePlaintext(cp);
        break;
      }
      case State.TAG_OPEN: {
        this._stateTagOpen(cp);
        break;
      }
      case State.END_TAG_OPEN: {
        this._stateEndTagOpen(cp);
        break;
      }
      case State.TAG_NAME: {
        this._stateTagName(cp);
        break;
      }
      case State.RCDATA_LESS_THAN_SIGN: {
        this._stateRcdataLessThanSign(cp);
        break;
      }
      case State.RCDATA_END_TAG_OPEN: {
        this._stateRcdataEndTagOpen(cp);
        break;
      }
      case State.RCDATA_END_TAG_NAME: {
        this._stateRcdataEndTagName(cp);
        break;
      }
      case State.RAWTEXT_LESS_THAN_SIGN: {
        this._stateRawtextLessThanSign(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_OPEN: {
        this._stateRawtextEndTagOpen(cp);
        break;
      }
      case State.RAWTEXT_END_TAG_NAME: {
        this._stateRawtextEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_LESS_THAN_SIGN: {
        this._stateScriptDataLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_OPEN: {
        this._stateScriptDataEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_END_TAG_NAME: {
        this._stateScriptDataEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START: {
        this._stateScriptDataEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPE_START_DASH: {
        this._stateScriptDataEscapeStartDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED: {
        this._stateScriptDataEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH: {
        this._stateScriptDataEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_DASH_DASH: {
        this._stateScriptDataEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN: {
        this._stateScriptDataEscapedEndTagOpen(cp);
        break;
      }
      case State.SCRIPT_DATA_ESCAPED_END_TAG_NAME: {
        this._stateScriptDataEscapedEndTagName(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_START: {
        this._stateScriptDataDoubleEscapeStart(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED: {
        this._stateScriptDataDoubleEscaped(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH: {
        this._stateScriptDataDoubleEscapedDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH: {
        this._stateScriptDataDoubleEscapedDashDash(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN: {
        this._stateScriptDataDoubleEscapedLessThanSign(cp);
        break;
      }
      case State.SCRIPT_DATA_DOUBLE_ESCAPE_END: {
        this._stateScriptDataDoubleEscapeEnd(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_NAME: {
        this._stateBeforeAttributeName(cp);
        break;
      }
      case State.ATTRIBUTE_NAME: {
        this._stateAttributeName(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_NAME: {
        this._stateAfterAttributeName(cp);
        break;
      }
      case State.BEFORE_ATTRIBUTE_VALUE: {
        this._stateBeforeAttributeValue(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_DOUBLE_QUOTED: {
        this._stateAttributeValueDoubleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_SINGLE_QUOTED: {
        this._stateAttributeValueSingleQuoted(cp);
        break;
      }
      case State.ATTRIBUTE_VALUE_UNQUOTED: {
        this._stateAttributeValueUnquoted(cp);
        break;
      }
      case State.AFTER_ATTRIBUTE_VALUE_QUOTED: {
        this._stateAfterAttributeValueQuoted(cp);
        break;
      }
      case State.SELF_CLOSING_START_TAG: {
        this._stateSelfClosingStartTag(cp);
        break;
      }
      case State.BOGUS_COMMENT: {
        this._stateBogusComment(cp);
        break;
      }
      case State.MARKUP_DECLARATION_OPEN: {
        this._stateMarkupDeclarationOpen(cp);
        break;
      }
      case State.COMMENT_START: {
        this._stateCommentStart(cp);
        break;
      }
      case State.COMMENT_START_DASH: {
        this._stateCommentStartDash(cp);
        break;
      }
      case State.COMMENT: {
        this._stateComment(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN: {
        this._stateCommentLessThanSign(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG: {
        this._stateCommentLessThanSignBang(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH: {
        this._stateCommentLessThanSignBangDash(cp);
        break;
      }
      case State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH: {
        this._stateCommentLessThanSignBangDashDash(cp);
        break;
      }
      case State.COMMENT_END_DASH: {
        this._stateCommentEndDash(cp);
        break;
      }
      case State.COMMENT_END: {
        this._stateCommentEnd(cp);
        break;
      }
      case State.COMMENT_END_BANG: {
        this._stateCommentEndBang(cp);
        break;
      }
      case State.DOCTYPE: {
        this._stateDoctype(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_NAME: {
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case State.DOCTYPE_NAME: {
        this._stateDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_NAME: {
        this._stateAfterDoctypeName(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_KEYWORD: {
        this._stateAfterDoctypePublicKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateBeforeDoctypePublicIdentifier(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypePublicIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypePublicIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER: {
        this._stateAfterDoctypePublicIdentifier(cp);
        break;
      }
      case State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS: {
        this._stateBetweenDoctypePublicAndSystemIdentifiers(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_KEYWORD: {
        this._stateAfterDoctypeSystemKeyword(cp);
        break;
      }
      case State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateBeforeDoctypeSystemIdentifier(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED: {
        this._stateDoctypeSystemIdentifierDoubleQuoted(cp);
        break;
      }
      case State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED: {
        this._stateDoctypeSystemIdentifierSingleQuoted(cp);
        break;
      }
      case State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER: {
        this._stateAfterDoctypeSystemIdentifier(cp);
        break;
      }
      case State.BOGUS_DOCTYPE: {
        this._stateBogusDoctype(cp);
        break;
      }
      case State.CDATA_SECTION: {
        this._stateCdataSection(cp);
        break;
      }
      case State.CDATA_SECTION_BRACKET: {
        this._stateCdataSectionBracket(cp);
        break;
      }
      case State.CDATA_SECTION_END: {
        this._stateCdataSectionEnd(cp);
        break;
      }
      case State.CHARACTER_REFERENCE: {
        this._stateCharacterReference();
        break;
      }
      case State.AMBIGUOUS_AMPERSAND: {
        this._stateAmbiguousAmpersand(cp);
        break;
      }
      default: {
        throw new Error("Unknown state");
      }
    }
  }
  // State machine
  // Data state
  //------------------------------------------------------------------
  _stateData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.TAG_OPEN;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  //  RCDATA state
  //------------------------------------------------------------------
  _stateRcdata(cp) {
    switch (cp) {
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RCDATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // RAWTEXT state
  //------------------------------------------------------------------
  _stateRawtext(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.RAWTEXT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data state
  //------------------------------------------------------------------
  _stateScriptData(cp) {
    switch (cp) {
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // PLAINTEXT state
  //------------------------------------------------------------------
  _statePlaintext(cp) {
    switch (cp) {
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Tag open state
  //------------------------------------------------------------------
  _stateTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createStartTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case CODE_POINTS.EXCLAMATION_MARK: {
          this.state = State.MARKUP_DECLARATION_OPEN;
          break;
        }
        case CODE_POINTS.SOLIDUS: {
          this.state = State.END_TAG_OPEN;
          break;
        }
        case CODE_POINTS.QUESTION_MARK: {
          this._err(ERR.unexpectedQuestionMarkInsteadOfTagName);
          this._createCommentToken(1);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName);
          this._emitChars("<");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.invalidFirstCharacterOfTagName);
          this._emitChars("<");
          this.state = State.DATA;
          this._stateData(cp);
        }
      }
  }
  // End tag open state
  //------------------------------------------------------------------
  _stateEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this._createEndTagToken();
      this.state = State.TAG_NAME;
      this._stateTagName(cp);
    } else
      switch (cp) {
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingEndTagName);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofBeforeTagName);
          this._emitChars("</");
          this._emitEOFToken();
          break;
        }
        default: {
          this._err(ERR.invalidFirstCharacterOfTagName);
          this._createCommentToken(2);
          this.state = State.BOGUS_COMMENT;
          this._stateBogusComment(cp);
        }
      }
  }
  // Tag name state
  //------------------------------------------------------------------
  _stateTagName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.tagName += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        token.tagName += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // RCDATA less-than sign state
  //------------------------------------------------------------------
  _stateRcdataLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.RCDATA_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  // RCDATA end tag open state
  //------------------------------------------------------------------
  _stateRcdataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RCDATA_END_TAG_NAME;
      this._stateRcdataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  handleSpecialEndTag(_cp) {
    if (!this.preprocessor.startsWith(this.lastStartTagName, false)) {
      return !this._ensureHibernation();
    }
    this._createEndTagToken();
    const token = this.currentToken;
    token.tagName = this.lastStartTagName;
    const cp = this.preprocessor.peek(this.lastStartTagName.length);
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        return false;
      }
      case CODE_POINTS.SOLIDUS: {
        this._advanceBy(this.lastStartTagName.length);
        this.state = State.SELF_CLOSING_START_TAG;
        return false;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._advanceBy(this.lastStartTagName.length);
        this.emitCurrentTagToken();
        this.state = State.DATA;
        return false;
      }
      default: {
        return !this._ensureHibernation();
      }
    }
  }
  // RCDATA end tag name state
  //------------------------------------------------------------------
  _stateRcdataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RCDATA;
      this._stateRcdata(cp);
    }
  }
  // RAWTEXT less-than sign state
  //------------------------------------------------------------------
  _stateRawtextLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.RAWTEXT_END_TAG_OPEN;
    } else {
      this._emitChars("<");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // RAWTEXT end tag open state
  //------------------------------------------------------------------
  _stateRawtextEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.RAWTEXT_END_TAG_NAME;
      this._stateRawtextEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // RAWTEXT end tag name state
  //------------------------------------------------------------------
  _stateRawtextEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.RAWTEXT;
      this._stateRawtext(cp);
    }
  }
  // Script data less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataLessThanSign(cp) {
    switch (cp) {
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SCRIPT_DATA_END_TAG_OPEN;
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.SCRIPT_DATA_ESCAPE_START;
        this._emitChars("<!");
        break;
      }
      default: {
        this._emitChars("<");
        this.state = State.SCRIPT_DATA;
        this._stateScriptData(cp);
      }
    }
  }
  // Script data end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_END_TAG_NAME;
      this._stateScriptDataEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escape start state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStart(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPE_START_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escape start dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapeStartDash(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
      this._emitChars("-");
    } else {
      this.state = State.SCRIPT_DATA;
      this._stateScriptData(cp);
    }
  }
  // Script data escaped state
  //------------------------------------------------------------------
  _stateScriptDataEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataEscapedLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_OPEN;
    } else if (isAsciiLetter(cp)) {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_START;
      this._stateScriptDataDoubleEscapeStart(cp);
    } else {
      this._emitChars("<");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data escaped end tag open state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagOpen(cp) {
    if (isAsciiLetter(cp)) {
      this.state = State.SCRIPT_DATA_ESCAPED_END_TAG_NAME;
      this._stateScriptDataEscapedEndTagName(cp);
    } else {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data escaped end tag name state
  //------------------------------------------------------------------
  _stateScriptDataEscapedEndTagName(cp) {
    if (this.handleSpecialEndTag(cp)) {
      this._emitChars("</");
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data double escape start state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeStart(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_ESCAPED;
      this._stateScriptDataEscaped(cp);
    }
  }
  // Script data double escaped state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscaped(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH;
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped dash dash state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedDashDash(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this._emitChars("-");
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN;
        this._emitChars("<");
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.SCRIPT_DATA;
        this._emitChars(">");
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitChars(REPLACEMENT_CHARACTER);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInScriptHtmlCommentLikeText);
        this._emitEOFToken();
        break;
      }
      default: {
        this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
        this._emitCodePoint(cp);
      }
    }
  }
  // Script data double escaped less-than sign state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapedLessThanSign(cp) {
    if (cp === CODE_POINTS.SOLIDUS) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPE_END;
      this._emitChars("/");
    } else {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }
  // Script data double escape end state
  //------------------------------------------------------------------
  _stateScriptDataDoubleEscapeEnd(cp) {
    if (this.preprocessor.startsWith(SEQUENCES.SCRIPT, false) && isScriptDataDoubleEscapeSequenceEnd(this.preprocessor.peek(SEQUENCES.SCRIPT.length))) {
      this._emitCodePoint(cp);
      for (let i = 0; i < SEQUENCES.SCRIPT.length; i++) {
        this._emitCodePoint(this._consume());
      }
      this.state = State.SCRIPT_DATA_ESCAPED;
    } else if (!this._ensureHibernation()) {
      this.state = State.SCRIPT_DATA_DOUBLE_ESCAPED;
      this._stateScriptDataDoubleEscaped(cp);
    }
  }
  // Before attribute name state
  //------------------------------------------------------------------
  _stateBeforeAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._err(ERR.unexpectedEqualsSignBeforeAttributeName);
        this._createAttr("=");
        this.state = State.ATTRIBUTE_NAME;
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }
  // Attribute name state
  //------------------------------------------------------------------
  _stateAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED:
      case CODE_POINTS.SOLIDUS:
      case CODE_POINTS.GREATER_THAN_SIGN:
      case CODE_POINTS.EOF: {
        this._leaveAttrName();
        this.state = State.AFTER_ATTRIBUTE_NAME;
        this._stateAfterAttributeName(cp);
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this._leaveAttrName();
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN: {
        this._err(ERR.unexpectedCharacterInAttributeName);
        this.currentAttr.name += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.name += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        this.currentAttr.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // After attribute name state
  //------------------------------------------------------------------
  _stateAfterAttributeName(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.EQUALS_SIGN: {
        this.state = State.BEFORE_ATTRIBUTE_VALUE;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._createAttr("");
        this.state = State.ATTRIBUTE_NAME;
        this._stateAttributeName(cp);
      }
    }
  }
  // Before attribute value state
  //------------------------------------------------------------------
  _stateBeforeAttributeValue(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.ATTRIBUTE_VALUE_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingAttributeValue);
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      default: {
        this.state = State.ATTRIBUTE_VALUE_UNQUOTED;
        this._stateAttributeValueUnquoted(cp);
      }
    }
  }
  // Attribute value (double-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueDoubleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // Attribute value (single-quoted) state
  //------------------------------------------------------------------
  _stateAttributeValueSingleQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_ATTRIBUTE_VALUE_QUOTED;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // Attribute value (unquoted) state
  //------------------------------------------------------------------
  _stateAttributeValueUnquoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.AMPERSAND: {
        this._startCharacterReference();
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        this.currentAttr.value += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK:
      case CODE_POINTS.APOSTROPHE:
      case CODE_POINTS.LESS_THAN_SIGN:
      case CODE_POINTS.EQUALS_SIGN:
      case CODE_POINTS.GRAVE_ACCENT: {
        this._err(ERR.unexpectedCharacterInUnquotedAttributeValue);
        this.currentAttr.value += String.fromCodePoint(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this.currentAttr.value += String.fromCodePoint(cp);
      }
    }
  }
  // After attribute value (quoted) state
  //------------------------------------------------------------------
  _stateAfterAttributeValueQuoted(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this._leaveAttrValue();
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case CODE_POINTS.SOLIDUS: {
        this._leaveAttrValue();
        this.state = State.SELF_CLOSING_START_TAG;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._leaveAttrValue();
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingWhitespaceBetweenAttributes);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }
  // Self-closing start tag state
  //------------------------------------------------------------------
  _stateSelfClosingStartTag(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        const token = this.currentToken;
        token.selfClosing = true;
        this.state = State.DATA;
        this.emitCurrentTagToken();
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInTag);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.unexpectedSolidusInTag);
        this.state = State.BEFORE_ATTRIBUTE_NAME;
        this._stateBeforeAttributeName(cp);
      }
    }
  }
  // Bogus comment state
  //------------------------------------------------------------------
  _stateBogusComment(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }
  // Markup declaration open state
  //------------------------------------------------------------------
  _stateMarkupDeclarationOpen(cp) {
    if (this._consumeSequenceIfMatch(SEQUENCES.DASH_DASH, true)) {
      this._createCommentToken(SEQUENCES.DASH_DASH.length + 1);
      this.state = State.COMMENT_START;
    } else if (this._consumeSequenceIfMatch(SEQUENCES.DOCTYPE, false)) {
      this.currentLocation = this.getCurrentLocation(SEQUENCES.DOCTYPE.length + 1);
      this.state = State.DOCTYPE;
    } else if (this._consumeSequenceIfMatch(SEQUENCES.CDATA_START, true)) {
      if (this.inForeignNode) {
        this.state = State.CDATA_SECTION;
      } else {
        this._err(ERR.cdataInHtmlContent);
        this._createCommentToken(SEQUENCES.CDATA_START.length + 1);
        this.currentToken.data = "[CDATA[";
        this.state = State.BOGUS_COMMENT;
      }
    } else if (!this._ensureHibernation()) {
      this._err(ERR.incorrectlyOpenedComment);
      this._createCommentToken(2);
      this.state = State.BOGUS_COMMENT;
      this._stateBogusComment(cp);
    }
  }
  // Comment start state
  //------------------------------------------------------------------
  _stateCommentStart(cp) {
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_START_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        const token = this.currentToken;
        this.emitCurrentComment(token);
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment start dash state
  //------------------------------------------------------------------
  _stateCommentStartDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptClosingOfEmptyComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment state
  //------------------------------------------------------------------
  _stateComment(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<";
        this.state = State.COMMENT_LESS_THAN_SIGN;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.data += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += String.fromCodePoint(cp);
      }
    }
  }
  // Comment less-than sign state
  //------------------------------------------------------------------
  _stateCommentLessThanSign(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.EXCLAMATION_MARK: {
        token.data += "!";
        this.state = State.COMMENT_LESS_THAN_SIGN_BANG;
        break;
      }
      case CODE_POINTS.LESS_THAN_SIGN: {
        token.data += "<";
        break;
      }
      default: {
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment less-than sign bang state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBang(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH;
    } else {
      this.state = State.COMMENT;
      this._stateComment(cp);
    }
  }
  // Comment less-than sign bang dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDash(cp) {
    if (cp === CODE_POINTS.HYPHEN_MINUS) {
      this.state = State.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH;
    } else {
      this.state = State.COMMENT_END_DASH;
      this._stateCommentEndDash(cp);
    }
  }
  // Comment less-than sign bang dash dash state
  //------------------------------------------------------------------
  _stateCommentLessThanSignBangDashDash(cp) {
    if (cp !== CODE_POINTS.GREATER_THAN_SIGN && cp !== CODE_POINTS.EOF) {
      this._err(ERR.nestedComment);
    }
    this.state = State.COMMENT_END;
    this._stateCommentEnd(cp);
  }
  // Comment end dash state
  //------------------------------------------------------------------
  _stateCommentEndDash(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        this.state = State.COMMENT_END;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "-";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment end state
  //------------------------------------------------------------------
  _stateCommentEnd(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EXCLAMATION_MARK: {
        this.state = State.COMMENT_END_BANG;
        break;
      }
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "-";
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // Comment end bang state
  //------------------------------------------------------------------
  _stateCommentEndBang(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.HYPHEN_MINUS: {
        token.data += "--!";
        this.state = State.COMMENT_END_DASH;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.incorrectlyClosedComment);
        this.state = State.DATA;
        this.emitCurrentComment(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInComment);
        this.emitCurrentComment(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.data += "--!";
        this.state = State.COMMENT;
        this._stateComment(cp);
      }
    }
  }
  // DOCTYPE state
  //------------------------------------------------------------------
  _stateDoctype(cp) {
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        this._createDoctypeToken(null);
        const token = this.currentToken;
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingWhitespaceBeforeDoctypeName);
        this.state = State.BEFORE_DOCTYPE_NAME;
        this._stateBeforeDoctypeName(cp);
      }
    }
  }
  // Before DOCTYPE name state
  //------------------------------------------------------------------
  _stateBeforeDoctypeName(cp) {
    if (isAsciiUpper(cp)) {
      this._createDoctypeToken(String.fromCharCode(toAsciiLower(cp)));
      this.state = State.DOCTYPE_NAME;
    } else
      switch (cp) {
        case CODE_POINTS.SPACE:
        case CODE_POINTS.LINE_FEED:
        case CODE_POINTS.TABULATION:
        case CODE_POINTS.FORM_FEED: {
          break;
        }
        case CODE_POINTS.NULL: {
          this._err(ERR.unexpectedNullCharacter);
          this._createDoctypeToken(REPLACEMENT_CHARACTER);
          this.state = State.DOCTYPE_NAME;
          break;
        }
        case CODE_POINTS.GREATER_THAN_SIGN: {
          this._err(ERR.missingDoctypeName);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this.state = State.DATA;
          break;
        }
        case CODE_POINTS.EOF: {
          this._err(ERR.eofInDoctype);
          this._createDoctypeToken(null);
          const token = this.currentToken;
          token.forceQuirks = true;
          this.emitCurrentDoctype(token);
          this._emitEOFToken();
          break;
        }
        default: {
          this._createDoctypeToken(String.fromCodePoint(cp));
          this.state = State.DOCTYPE_NAME;
        }
      }
  }
  // DOCTYPE name state
  //------------------------------------------------------------------
  _stateDoctypeName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.AFTER_DOCTYPE_NAME;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.name += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.name += String.fromCodePoint(isAsciiUpper(cp) ? toAsciiLower(cp) : cp);
      }
    }
  }
  // After DOCTYPE name state
  //------------------------------------------------------------------
  _stateAfterDoctypeName(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        if (this._consumeSequenceIfMatch(SEQUENCES.PUBLIC, false)) {
          this.state = State.AFTER_DOCTYPE_PUBLIC_KEYWORD;
        } else if (this._consumeSequenceIfMatch(SEQUENCES.SYSTEM, false)) {
          this.state = State.AFTER_DOCTYPE_SYSTEM_KEYWORD;
        } else if (!this._ensureHibernation()) {
          this._err(ERR.invalidCharacterSequenceAfterDoctypeName);
          token.forceQuirks = true;
          this.state = State.BOGUS_DOCTYPE;
          this._stateBogusDoctype(cp);
        }
      }
    }
  }
  // After DOCTYPE public keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicKeyword(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypePublicKeyword);
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Before DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypePublicIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.publicId = "";
        this.state = State.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // DOCTYPE public identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }
  // DOCTYPE public identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypePublicIdentifierSingleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.publicId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypePublicIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.publicId += String.fromCodePoint(cp);
      }
    }
  }
  // After DOCTYPE public identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypePublicIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Between DOCTYPE public and system identifiers state
  //------------------------------------------------------------------
  _stateBetweenDoctypePublicAndSystemIdentifiers(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // After DOCTYPE system keyword state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemKeyword(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        this.state = State.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        this._err(ERR.missingWhitespaceAfterDoctypeSystemKeyword);
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Before DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateBeforeDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.QUOTATION_MARK: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;
        break;
      }
      case CODE_POINTS.APOSTROPHE: {
        token.systemId = "";
        this.state = State.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.missingDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.DATA;
        this.emitCurrentDoctype(token);
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.missingQuoteBeforeDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // DOCTYPE system identifier (double-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierDoubleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.QUOTATION_MARK: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }
  // DOCTYPE system identifier (single-quoted) state
  //------------------------------------------------------------------
  _stateDoctypeSystemIdentifierSingleQuoted(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.APOSTROPHE: {
        this.state = State.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        token.systemId += REPLACEMENT_CHARACTER;
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this._err(ERR.abruptDoctypeSystemIdentifier);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        token.systemId += String.fromCodePoint(cp);
      }
    }
  }
  // After DOCTYPE system identifier state
  //------------------------------------------------------------------
  _stateAfterDoctypeSystemIdentifier(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.SPACE:
      case CODE_POINTS.LINE_FEED:
      case CODE_POINTS.TABULATION:
      case CODE_POINTS.FORM_FEED: {
        break;
      }
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInDoctype);
        token.forceQuirks = true;
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default: {
        this._err(ERR.unexpectedCharacterAfterDoctypeSystemIdentifier);
        this.state = State.BOGUS_DOCTYPE;
        this._stateBogusDoctype(cp);
      }
    }
  }
  // Bogus DOCTYPE state
  //------------------------------------------------------------------
  _stateBogusDoctype(cp) {
    const token = this.currentToken;
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.emitCurrentDoctype(token);
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.NULL: {
        this._err(ERR.unexpectedNullCharacter);
        break;
      }
      case CODE_POINTS.EOF: {
        this.emitCurrentDoctype(token);
        this._emitEOFToken();
        break;
      }
      default:
    }
  }
  // CDATA section state
  //------------------------------------------------------------------
  _stateCdataSection(cp) {
    switch (cp) {
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this.state = State.CDATA_SECTION_BRACKET;
        break;
      }
      case CODE_POINTS.EOF: {
        this._err(ERR.eofInCdata);
        this._emitEOFToken();
        break;
      }
      default: {
        this._emitCodePoint(cp);
      }
    }
  }
  // CDATA section bracket state
  //------------------------------------------------------------------
  _stateCdataSectionBracket(cp) {
    if (cp === CODE_POINTS.RIGHT_SQUARE_BRACKET) {
      this.state = State.CDATA_SECTION_END;
    } else {
      this._emitChars("]");
      this.state = State.CDATA_SECTION;
      this._stateCdataSection(cp);
    }
  }
  // CDATA section end state
  //------------------------------------------------------------------
  _stateCdataSectionEnd(cp) {
    switch (cp) {
      case CODE_POINTS.GREATER_THAN_SIGN: {
        this.state = State.DATA;
        break;
      }
      case CODE_POINTS.RIGHT_SQUARE_BRACKET: {
        this._emitChars("]");
        break;
      }
      default: {
        this._emitChars("]]");
        this.state = State.CDATA_SECTION;
        this._stateCdataSection(cp);
      }
    }
  }
  // Character reference state
  //------------------------------------------------------------------
  _stateCharacterReference() {
    let length = this.entityDecoder.write(this.preprocessor.html, this.preprocessor.pos);
    if (length < 0) {
      if (this.preprocessor.lastChunkWritten) {
        length = this.entityDecoder.end();
      } else {
        this.active = false;
        this.preprocessor.pos = this.preprocessor.html.length - 1;
        this.consumedAfterSnapshot = 0;
        this.preprocessor.endOfChunkHit = true;
        return;
      }
    }
    if (length === 0) {
      this.preprocessor.pos = this.entityStartPos;
      this._flushCodePointConsumedAsCharacterReference(CODE_POINTS.AMPERSAND);
      this.state = !this._isCharacterReferenceInAttribute() && isAsciiAlphaNumeric2(this.preprocessor.peek(1)) ? State.AMBIGUOUS_AMPERSAND : this.returnState;
    } else {
      this.state = this.returnState;
    }
  }
  // Ambiguos ampersand state
  //------------------------------------------------------------------
  _stateAmbiguousAmpersand(cp) {
    if (isAsciiAlphaNumeric2(cp)) {
      this._flushCodePointConsumedAsCharacterReference(cp);
    } else {
      if (cp === CODE_POINTS.SEMICOLON) {
        this._err(ERR.unknownNamedCharacterReference);
      }
      this.state = this.returnState;
      this._callState(cp);
    }
  }
};

// node_modules/parse5/dist/parser/open-element-stack.js
var IMPLICIT_END_TAG_REQUIRED = /* @__PURE__ */ new Set([TAG_ID.DD, TAG_ID.DT, TAG_ID.LI, TAG_ID.OPTGROUP, TAG_ID.OPTION, TAG_ID.P, TAG_ID.RB, TAG_ID.RP, TAG_ID.RT, TAG_ID.RTC]);
var IMPLICIT_END_TAG_REQUIRED_THOROUGHLY = /* @__PURE__ */ new Set([
  ...IMPLICIT_END_TAG_REQUIRED,
  TAG_ID.CAPTION,
  TAG_ID.COLGROUP,
  TAG_ID.TBODY,
  TAG_ID.TD,
  TAG_ID.TFOOT,
  TAG_ID.TH,
  TAG_ID.THEAD,
  TAG_ID.TR
]);
var SCOPING_ELEMENTS_HTML = /* @__PURE__ */ new Set([
  TAG_ID.APPLET,
  TAG_ID.CAPTION,
  TAG_ID.HTML,
  TAG_ID.MARQUEE,
  TAG_ID.OBJECT,
  TAG_ID.TABLE,
  TAG_ID.TD,
  TAG_ID.TEMPLATE,
  TAG_ID.TH
]);
var SCOPING_ELEMENTS_HTML_LIST = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.OL, TAG_ID.UL]);
var SCOPING_ELEMENTS_HTML_BUTTON = /* @__PURE__ */ new Set([...SCOPING_ELEMENTS_HTML, TAG_ID.BUTTON]);
var SCOPING_ELEMENTS_MATHML = /* @__PURE__ */ new Set([TAG_ID.ANNOTATION_XML, TAG_ID.MI, TAG_ID.MN, TAG_ID.MO, TAG_ID.MS, TAG_ID.MTEXT]);
var SCOPING_ELEMENTS_SVG = /* @__PURE__ */ new Set([TAG_ID.DESC, TAG_ID.FOREIGN_OBJECT, TAG_ID.TITLE]);
var TABLE_ROW_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TR, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_BODY_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_CONTEXT = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TEMPLATE, TAG_ID.HTML]);
var TABLE_CELLS = /* @__PURE__ */ new Set([TAG_ID.TD, TAG_ID.TH]);
var OpenElementStack = class {
  get currentTmplContentOrNode() {
    return this._isInTemplate() ? this.treeAdapter.getTemplateContent(this.current) : this.current;
  }
  constructor(document, treeAdapter, handler) {
    this.treeAdapter = treeAdapter;
    this.handler = handler;
    this.items = [];
    this.tagIDs = [];
    this.stackTop = -1;
    this.tmplCount = 0;
    this.currentTagId = TAG_ID.UNKNOWN;
    this.current = document;
  }
  //Index of element
  _indexOf(element) {
    return this.items.lastIndexOf(element, this.stackTop);
  }
  //Update current element
  _isInTemplate() {
    return this.currentTagId === TAG_ID.TEMPLATE && this.treeAdapter.getNamespaceURI(this.current) === NS.HTML;
  }
  _updateCurrentElement() {
    this.current = this.items[this.stackTop];
    this.currentTagId = this.tagIDs[this.stackTop];
  }
  //Mutations
  push(element, tagID) {
    this.stackTop++;
    this.items[this.stackTop] = element;
    this.current = element;
    this.tagIDs[this.stackTop] = tagID;
    this.currentTagId = tagID;
    if (this._isInTemplate()) {
      this.tmplCount++;
    }
    this.handler.onItemPush(element, tagID, true);
  }
  pop() {
    const popped = this.current;
    if (this.tmplCount > 0 && this._isInTemplate()) {
      this.tmplCount--;
    }
    this.stackTop--;
    this._updateCurrentElement();
    this.handler.onItemPop(popped, true);
  }
  replace(oldElement, newElement) {
    const idx = this._indexOf(oldElement);
    this.items[idx] = newElement;
    if (idx === this.stackTop) {
      this.current = newElement;
    }
  }
  insertAfter(referenceElement, newElement, newElementID) {
    const insertionIdx = this._indexOf(referenceElement) + 1;
    this.items.splice(insertionIdx, 0, newElement);
    this.tagIDs.splice(insertionIdx, 0, newElementID);
    this.stackTop++;
    if (insertionIdx === this.stackTop) {
      this._updateCurrentElement();
    }
    if (this.current && this.currentTagId !== void 0) {
      this.handler.onItemPush(this.current, this.currentTagId, insertionIdx === this.stackTop);
    }
  }
  popUntilTagNamePopped(tagName) {
    let targetIdx = this.stackTop + 1;
    do {
      targetIdx = this.tagIDs.lastIndexOf(tagName, targetIdx - 1);
    } while (targetIdx > 0 && this.treeAdapter.getNamespaceURI(this.items[targetIdx]) !== NS.HTML);
    this.shortenToLength(Math.max(targetIdx, 0));
  }
  shortenToLength(idx) {
    while (this.stackTop >= idx) {
      const popped = this.current;
      if (this.tmplCount > 0 && this._isInTemplate()) {
        this.tmplCount -= 1;
      }
      this.stackTop--;
      this._updateCurrentElement();
      this.handler.onItemPop(popped, this.stackTop < idx);
    }
  }
  popUntilElementPopped(element) {
    const idx = this._indexOf(element);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilPopped(tagNames, targetNS) {
    const idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(Math.max(idx, 0));
  }
  popUntilNumberedHeaderPopped() {
    this.popUntilPopped(NUMBERED_HEADERS, NS.HTML);
  }
  popUntilTableCellPopped() {
    this.popUntilPopped(TABLE_CELLS, NS.HTML);
  }
  popAllUpToHtmlElement() {
    this.tmplCount = 0;
    this.shortenToLength(1);
  }
  _indexOfTagNames(tagNames, namespace) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (tagNames.has(this.tagIDs[i]) && this.treeAdapter.getNamespaceURI(this.items[i]) === namespace) {
        return i;
      }
    }
    return -1;
  }
  clearBackTo(tagNames, targetNS) {
    const idx = this._indexOfTagNames(tagNames, targetNS);
    this.shortenToLength(idx + 1);
  }
  clearBackToTableContext() {
    this.clearBackTo(TABLE_CONTEXT, NS.HTML);
  }
  clearBackToTableBodyContext() {
    this.clearBackTo(TABLE_BODY_CONTEXT, NS.HTML);
  }
  clearBackToTableRowContext() {
    this.clearBackTo(TABLE_ROW_CONTEXT, NS.HTML);
  }
  remove(element) {
    const idx = this._indexOf(element);
    if (idx >= 0) {
      if (idx === this.stackTop) {
        this.pop();
      } else {
        this.items.splice(idx, 1);
        this.tagIDs.splice(idx, 1);
        this.stackTop--;
        this._updateCurrentElement();
        this.handler.onItemPop(element, false);
      }
    }
  }
  //Search
  tryPeekProperlyNestedBodyElement() {
    return this.stackTop >= 1 && this.tagIDs[1] === TAG_ID.BODY ? this.items[1] : null;
  }
  contains(element) {
    return this._indexOf(element) > -1;
  }
  getCommonAncestor(element) {
    const elementIdx = this._indexOf(element) - 1;
    return elementIdx >= 0 ? this.items[elementIdx] : null;
  }
  isRootHtmlElementCurrent() {
    return this.stackTop === 0 && this.tagIDs[0] === TAG_ID.HTML;
  }
  //Element in scope
  hasInDynamicScope(tagName, htmlScope) {
    for (let i = this.stackTop; i >= 0; i--) {
      const tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (tn === tagName)
            return true;
          if (htmlScope.has(tn))
            return false;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return false;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return false;
          break;
        }
      }
    }
    return true;
  }
  hasInScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML);
  }
  hasInListItemScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_LIST);
  }
  hasInButtonScope(tagName) {
    return this.hasInDynamicScope(tagName, SCOPING_ELEMENTS_HTML_BUTTON);
  }
  hasNumberedHeaderInScope() {
    for (let i = this.stackTop; i >= 0; i--) {
      const tn = this.tagIDs[i];
      switch (this.treeAdapter.getNamespaceURI(this.items[i])) {
        case NS.HTML: {
          if (NUMBERED_HEADERS.has(tn))
            return true;
          if (SCOPING_ELEMENTS_HTML.has(tn))
            return false;
          break;
        }
        case NS.SVG: {
          if (SCOPING_ELEMENTS_SVG.has(tn))
            return false;
          break;
        }
        case NS.MATHML: {
          if (SCOPING_ELEMENTS_MATHML.has(tn))
            return false;
          break;
        }
      }
    }
    return true;
  }
  hasInTableScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case tagName: {
          return true;
        }
        case TAG_ID.TABLE:
        case TAG_ID.HTML: {
          return false;
        }
      }
    }
    return true;
  }
  hasTableBodyContextInTableScope() {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case TAG_ID.TBODY:
        case TAG_ID.THEAD:
        case TAG_ID.TFOOT: {
          return true;
        }
        case TAG_ID.TABLE:
        case TAG_ID.HTML: {
          return false;
        }
      }
    }
    return true;
  }
  hasInSelectScope(tagName) {
    for (let i = this.stackTop; i >= 0; i--) {
      if (this.treeAdapter.getNamespaceURI(this.items[i]) !== NS.HTML) {
        continue;
      }
      switch (this.tagIDs[i]) {
        case tagName: {
          return true;
        }
        case TAG_ID.OPTION:
        case TAG_ID.OPTGROUP: {
          break;
        }
        default: {
          return false;
        }
      }
    }
    return true;
  }
  //Implied end tags
  generateImpliedEndTags() {
    while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED.has(this.currentTagId)) {
      this.pop();
    }
  }
  generateImpliedEndTagsThoroughly() {
    while (this.currentTagId !== void 0 && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
      this.pop();
    }
  }
  generateImpliedEndTagsWithExclusion(exclusionId) {
    while (this.currentTagId !== void 0 && this.currentTagId !== exclusionId && IMPLICIT_END_TAG_REQUIRED_THOROUGHLY.has(this.currentTagId)) {
      this.pop();
    }
  }
};

// node_modules/parse5/dist/parser/formatting-element-list.js
var NOAH_ARK_CAPACITY = 3;
var EntryType;
(function(EntryType2) {
  EntryType2[EntryType2["Marker"] = 0] = "Marker";
  EntryType2[EntryType2["Element"] = 1] = "Element";
})(EntryType || (EntryType = {}));
var MARKER = { type: EntryType.Marker };
var FormattingElementList = class {
  constructor(treeAdapter) {
    this.treeAdapter = treeAdapter;
    this.entries = [];
    this.bookmark = null;
  }
  //Noah Ark's condition
  //OPTIMIZATION: at first we try to find possible candidates for exclusion using
  //lightweight heuristics without thorough attributes check.
  _getNoahArkConditionCandidates(newElement, neAttrs) {
    const candidates = [];
    const neAttrsLength = neAttrs.length;
    const neTagName = this.treeAdapter.getTagName(newElement);
    const neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.type === EntryType.Marker) {
        break;
      }
      const { element } = entry;
      if (this.treeAdapter.getTagName(element) === neTagName && this.treeAdapter.getNamespaceURI(element) === neNamespaceURI) {
        const elementAttrs = this.treeAdapter.getAttrList(element);
        if (elementAttrs.length === neAttrsLength) {
          candidates.push({ idx: i, attrs: elementAttrs });
        }
      }
    }
    return candidates;
  }
  _ensureNoahArkCondition(newElement) {
    if (this.entries.length < NOAH_ARK_CAPACITY)
      return;
    const neAttrs = this.treeAdapter.getAttrList(newElement);
    const candidates = this._getNoahArkConditionCandidates(newElement, neAttrs);
    if (candidates.length < NOAH_ARK_CAPACITY)
      return;
    const neAttrsMap = new Map(neAttrs.map((neAttr) => [neAttr.name, neAttr.value]));
    let validCandidates = 0;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.attrs.every((cAttr) => neAttrsMap.get(cAttr.name) === cAttr.value)) {
        validCandidates += 1;
        if (validCandidates >= NOAH_ARK_CAPACITY) {
          this.entries.splice(candidate.idx, 1);
        }
      }
    }
  }
  //Mutations
  insertMarker() {
    this.entries.unshift(MARKER);
  }
  pushElement(element, token) {
    this._ensureNoahArkCondition(element);
    this.entries.unshift({
      type: EntryType.Element,
      element,
      token
    });
  }
  insertElementAfterBookmark(element, token) {
    const bookmarkIdx = this.entries.indexOf(this.bookmark);
    this.entries.splice(bookmarkIdx, 0, {
      type: EntryType.Element,
      element,
      token
    });
  }
  removeEntry(entry) {
    const entryIndex = this.entries.indexOf(entry);
    if (entryIndex !== -1) {
      this.entries.splice(entryIndex, 1);
    }
  }
  /**
   * Clears the list of formatting elements up to the last marker.
   *
   * @see https://html.spec.whatwg.org/multipage/parsing.html#clear-the-list-of-active-formatting-elements-up-to-the-last-marker
   */
  clearToLastMarker() {
    const markerIdx = this.entries.indexOf(MARKER);
    if (markerIdx === -1) {
      this.entries.length = 0;
    } else {
      this.entries.splice(0, markerIdx + 1);
    }
  }
  //Search
  getElementEntryInScopeWithTagName(tagName) {
    const entry = this.entries.find((entry2) => entry2.type === EntryType.Marker || this.treeAdapter.getTagName(entry2.element) === tagName);
    return entry && entry.type === EntryType.Element ? entry : null;
  }
  getElementEntry(element) {
    return this.entries.find((entry) => entry.type === EntryType.Element && entry.element === element);
  }
};

// node_modules/parse5/dist/tree-adapters/default.js
var defaultTreeAdapter = {
  //Node construction
  createDocument() {
    return {
      nodeName: "#document",
      mode: DOCUMENT_MODE.NO_QUIRKS,
      childNodes: []
    };
  },
  createDocumentFragment() {
    return {
      nodeName: "#document-fragment",
      childNodes: []
    };
  },
  createElement(tagName, namespaceURI, attrs) {
    return {
      nodeName: tagName,
      tagName,
      attrs,
      namespaceURI,
      childNodes: [],
      parentNode: null
    };
  },
  createCommentNode(data) {
    return {
      nodeName: "#comment",
      data,
      parentNode: null
    };
  },
  createTextNode(value) {
    return {
      nodeName: "#text",
      value,
      parentNode: null
    };
  },
  //Tree mutation
  appendChild(parentNode, newNode) {
    parentNode.childNodes.push(newNode);
    newNode.parentNode = parentNode;
  },
  insertBefore(parentNode, newNode, referenceNode) {
    const insertionIdx = parentNode.childNodes.indexOf(referenceNode);
    parentNode.childNodes.splice(insertionIdx, 0, newNode);
    newNode.parentNode = parentNode;
  },
  setTemplateContent(templateElement, contentElement) {
    templateElement.content = contentElement;
  },
  getTemplateContent(templateElement) {
    return templateElement.content;
  },
  setDocumentType(document, name, publicId, systemId) {
    const doctypeNode = document.childNodes.find((node) => node.nodeName === "#documentType");
    if (doctypeNode) {
      doctypeNode.name = name;
      doctypeNode.publicId = publicId;
      doctypeNode.systemId = systemId;
    } else {
      const node = {
        nodeName: "#documentType",
        name,
        publicId,
        systemId,
        parentNode: null
      };
      defaultTreeAdapter.appendChild(document, node);
    }
  },
  setDocumentMode(document, mode) {
    document.mode = mode;
  },
  getDocumentMode(document) {
    return document.mode;
  },
  detachNode(node) {
    if (node.parentNode) {
      const idx = node.parentNode.childNodes.indexOf(node);
      node.parentNode.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
  },
  insertText(parentNode, text) {
    if (parentNode.childNodes.length > 0) {
      const prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];
      if (defaultTreeAdapter.isTextNode(prevNode)) {
        prevNode.value += text;
        return;
      }
    }
    defaultTreeAdapter.appendChild(parentNode, defaultTreeAdapter.createTextNode(text));
  },
  insertTextBefore(parentNode, text, referenceNode) {
    const prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];
    if (prevNode && defaultTreeAdapter.isTextNode(prevNode)) {
      prevNode.value += text;
    } else {
      defaultTreeAdapter.insertBefore(parentNode, defaultTreeAdapter.createTextNode(text), referenceNode);
    }
  },
  adoptAttributes(recipient, attrs) {
    const recipientAttrsMap = new Set(recipient.attrs.map((attr) => attr.name));
    for (let j = 0; j < attrs.length; j++) {
      if (!recipientAttrsMap.has(attrs[j].name)) {
        recipient.attrs.push(attrs[j]);
      }
    }
  },
  //Tree traversing
  getFirstChild(node) {
    return node.childNodes[0];
  },
  getChildNodes(node) {
    return node.childNodes;
  },
  getParentNode(node) {
    return node.parentNode;
  },
  getAttrList(element) {
    return element.attrs;
  },
  //Node data
  getTagName(element) {
    return element.tagName;
  },
  getNamespaceURI(element) {
    return element.namespaceURI;
  },
  getTextNodeContent(textNode) {
    return textNode.value;
  },
  getCommentNodeContent(commentNode) {
    return commentNode.data;
  },
  getDocumentTypeNodeName(doctypeNode) {
    return doctypeNode.name;
  },
  getDocumentTypeNodePublicId(doctypeNode) {
    return doctypeNode.publicId;
  },
  getDocumentTypeNodeSystemId(doctypeNode) {
    return doctypeNode.systemId;
  },
  //Node types
  isTextNode(node) {
    return node.nodeName === "#text";
  },
  isCommentNode(node) {
    return node.nodeName === "#comment";
  },
  isDocumentTypeNode(node) {
    return node.nodeName === "#documentType";
  },
  isElementNode(node) {
    return Object.prototype.hasOwnProperty.call(node, "tagName");
  },
  // Source code location
  setNodeSourceCodeLocation(node, location) {
    node.sourceCodeLocation = location;
  },
  getNodeSourceCodeLocation(node) {
    return node.sourceCodeLocation;
  },
  updateNodeSourceCodeLocation(node, endLocation) {
    node.sourceCodeLocation = { ...node.sourceCodeLocation, ...endLocation };
  }
};

// node_modules/parse5/dist/common/doctype.js
var VALID_DOCTYPE_NAME = "html";
var VALID_SYSTEM_ID = "about:legacy-compat";
var QUIRKS_MODE_SYSTEM_ID = "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd";
var QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
  "+//silmaril//dtd html pro v0r11 19970101//",
  "-//as//dtd html 3.0 aswedit + extensions//",
  "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
  "-//ietf//dtd html 2.0 level 1//",
  "-//ietf//dtd html 2.0 level 2//",
  "-//ietf//dtd html 2.0 strict level 1//",
  "-//ietf//dtd html 2.0 strict level 2//",
  "-//ietf//dtd html 2.0 strict//",
  "-//ietf//dtd html 2.0//",
  "-//ietf//dtd html 2.1e//",
  "-//ietf//dtd html 3.0//",
  "-//ietf//dtd html 3.2 final//",
  "-//ietf//dtd html 3.2//",
  "-//ietf//dtd html 3//",
  "-//ietf//dtd html level 0//",
  "-//ietf//dtd html level 1//",
  "-//ietf//dtd html level 2//",
  "-//ietf//dtd html level 3//",
  "-//ietf//dtd html strict level 0//",
  "-//ietf//dtd html strict level 1//",
  "-//ietf//dtd html strict level 2//",
  "-//ietf//dtd html strict level 3//",
  "-//ietf//dtd html strict//",
  "-//ietf//dtd html//",
  "-//metrius//dtd metrius presentational//",
  "-//microsoft//dtd internet explorer 2.0 html strict//",
  "-//microsoft//dtd internet explorer 2.0 html//",
  "-//microsoft//dtd internet explorer 2.0 tables//",
  "-//microsoft//dtd internet explorer 3.0 html strict//",
  "-//microsoft//dtd internet explorer 3.0 html//",
  "-//microsoft//dtd internet explorer 3.0 tables//",
  "-//netscape comm. corp.//dtd html//",
  "-//netscape comm. corp.//dtd strict html//",
  "-//o'reilly and associates//dtd html 2.0//",
  "-//o'reilly and associates//dtd html extended 1.0//",
  "-//o'reilly and associates//dtd html extended relaxed 1.0//",
  "-//sq//dtd html 2.0 hotmetal + extensions//",
  "-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//",
  "-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//",
  "-//spyglass//dtd html 2.0 extended//",
  "-//sun microsystems corp.//dtd hotjava html//",
  "-//sun microsystems corp.//dtd hotjava strict html//",
  "-//w3c//dtd html 3 1995-03-24//",
  "-//w3c//dtd html 3.2 draft//",
  "-//w3c//dtd html 3.2 final//",
  "-//w3c//dtd html 3.2//",
  "-//w3c//dtd html 3.2s draft//",
  "-//w3c//dtd html 4.0 frameset//",
  "-//w3c//dtd html 4.0 transitional//",
  "-//w3c//dtd html experimental 19960712//",
  "-//w3c//dtd html experimental 970421//",
  "-//w3c//dtd w3 html//",
  "-//w3o//dtd w3 html 3.0//",
  "-//webtechs//dtd mozilla html 2.0//",
  "-//webtechs//dtd mozilla html//"
];
var QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...QUIRKS_MODE_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];
var QUIRKS_MODE_PUBLIC_IDS = /* @__PURE__ */ new Set([
  "-//w3o//dtd w3 html strict 3.0//en//",
  "-/w3c/dtd html 4.0 transitional/en",
  "html"
]);
var LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ["-//w3c//dtd xhtml 1.0 frameset//", "-//w3c//dtd xhtml 1.0 transitional//"];
var LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = [
  ...LIMITED_QUIRKS_PUBLIC_ID_PREFIXES,
  "-//w3c//dtd html 4.01 frameset//",
  "-//w3c//dtd html 4.01 transitional//"
];
function hasPrefix(publicId, prefixes) {
  return prefixes.some((prefix) => publicId.startsWith(prefix));
}
function isConforming(token) {
  return token.name === VALID_DOCTYPE_NAME && token.publicId === null && (token.systemId === null || token.systemId === VALID_SYSTEM_ID);
}
function getDocumentMode(token) {
  if (token.name !== VALID_DOCTYPE_NAME) {
    return DOCUMENT_MODE.QUIRKS;
  }
  const { systemId } = token;
  if (systemId && systemId.toLowerCase() === QUIRKS_MODE_SYSTEM_ID) {
    return DOCUMENT_MODE.QUIRKS;
  }
  let { publicId } = token;
  if (publicId !== null) {
    publicId = publicId.toLowerCase();
    if (QUIRKS_MODE_PUBLIC_IDS.has(publicId)) {
      return DOCUMENT_MODE.QUIRKS;
    }
    let prefixes = systemId === null ? QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES : QUIRKS_MODE_PUBLIC_ID_PREFIXES;
    if (hasPrefix(publicId, prefixes)) {
      return DOCUMENT_MODE.QUIRKS;
    }
    prefixes = systemId === null ? LIMITED_QUIRKS_PUBLIC_ID_PREFIXES : LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES;
    if (hasPrefix(publicId, prefixes)) {
      return DOCUMENT_MODE.LIMITED_QUIRKS;
    }
  }
  return DOCUMENT_MODE.NO_QUIRKS;
}

// node_modules/parse5/dist/common/foreign-content.js
var MIME_TYPES = {
  TEXT_HTML: "text/html",
  APPLICATION_XML: "application/xhtml+xml"
};
var DEFINITION_URL_ATTR = "definitionurl";
var ADJUSTED_DEFINITION_URL_ATTR = "definitionURL";
var SVG_ATTRS_ADJUSTMENT_MAP = new Map([
  "attributeName",
  "attributeType",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "clipPathUnits",
  "diffuseConstant",
  "edgeMode",
  "filterUnits",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "maskContentUnits",
  "maskUnits",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stitchTiles",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
  "zoomAndPan"
].map((attr) => [attr.toLowerCase(), attr]));
var XML_ATTRS_ADJUSTMENT_MAP = /* @__PURE__ */ new Map([
  ["xlink:actuate", { prefix: "xlink", name: "actuate", namespace: NS.XLINK }],
  ["xlink:arcrole", { prefix: "xlink", name: "arcrole", namespace: NS.XLINK }],
  ["xlink:href", { prefix: "xlink", name: "href", namespace: NS.XLINK }],
  ["xlink:role", { prefix: "xlink", name: "role", namespace: NS.XLINK }],
  ["xlink:show", { prefix: "xlink", name: "show", namespace: NS.XLINK }],
  ["xlink:title", { prefix: "xlink", name: "title", namespace: NS.XLINK }],
  ["xlink:type", { prefix: "xlink", name: "type", namespace: NS.XLINK }],
  ["xml:lang", { prefix: "xml", name: "lang", namespace: NS.XML }],
  ["xml:space", { prefix: "xml", name: "space", namespace: NS.XML }],
  ["xmlns", { prefix: "", name: "xmlns", namespace: NS.XMLNS }],
  ["xmlns:xlink", { prefix: "xmlns", name: "xlink", namespace: NS.XMLNS }]
]);
var SVG_TAG_NAMES_ADJUSTMENT_MAP = new Map([
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "textPath"
].map((tn) => [tn.toLowerCase(), tn]));
var EXITS_FOREIGN_CONTENT = /* @__PURE__ */ new Set([
  TAG_ID.B,
  TAG_ID.BIG,
  TAG_ID.BLOCKQUOTE,
  TAG_ID.BODY,
  TAG_ID.BR,
  TAG_ID.CENTER,
  TAG_ID.CODE,
  TAG_ID.DD,
  TAG_ID.DIV,
  TAG_ID.DL,
  TAG_ID.DT,
  TAG_ID.EM,
  TAG_ID.EMBED,
  TAG_ID.H1,
  TAG_ID.H2,
  TAG_ID.H3,
  TAG_ID.H4,
  TAG_ID.H5,
  TAG_ID.H6,
  TAG_ID.HEAD,
  TAG_ID.HR,
  TAG_ID.I,
  TAG_ID.IMG,
  TAG_ID.LI,
  TAG_ID.LISTING,
  TAG_ID.MENU,
  TAG_ID.META,
  TAG_ID.NOBR,
  TAG_ID.OL,
  TAG_ID.P,
  TAG_ID.PRE,
  TAG_ID.RUBY,
  TAG_ID.S,
  TAG_ID.SMALL,
  TAG_ID.SPAN,
  TAG_ID.STRONG,
  TAG_ID.STRIKE,
  TAG_ID.SUB,
  TAG_ID.SUP,
  TAG_ID.TABLE,
  TAG_ID.TT,
  TAG_ID.U,
  TAG_ID.UL,
  TAG_ID.VAR
]);
function causesExit(startTagToken) {
  const tn = startTagToken.tagID;
  const isFontWithAttrs = tn === TAG_ID.FONT && startTagToken.attrs.some(({ name }) => name === ATTRS.COLOR || name === ATTRS.SIZE || name === ATTRS.FACE);
  return isFontWithAttrs || EXITS_FOREIGN_CONTENT.has(tn);
}
function adjustTokenMathMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    if (token.attrs[i].name === DEFINITION_URL_ATTR) {
      token.attrs[i].name = ADJUSTED_DEFINITION_URL_ATTR;
      break;
    }
  }
}
function adjustTokenSVGAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    const adjustedAttrName = SVG_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    if (adjustedAttrName != null) {
      token.attrs[i].name = adjustedAttrName;
    }
  }
}
function adjustTokenXMLAttrs(token) {
  for (let i = 0; i < token.attrs.length; i++) {
    const adjustedAttrEntry = XML_ATTRS_ADJUSTMENT_MAP.get(token.attrs[i].name);
    if (adjustedAttrEntry) {
      token.attrs[i].prefix = adjustedAttrEntry.prefix;
      token.attrs[i].name = adjustedAttrEntry.name;
      token.attrs[i].namespace = adjustedAttrEntry.namespace;
    }
  }
}
function adjustTokenSVGTagName(token) {
  const adjustedTagName = SVG_TAG_NAMES_ADJUSTMENT_MAP.get(token.tagName);
  if (adjustedTagName != null) {
    token.tagName = adjustedTagName;
    token.tagID = getTagID(token.tagName);
  }
}
function isMathMLTextIntegrationPoint(tn, ns) {
  return ns === NS.MATHML && (tn === TAG_ID.MI || tn === TAG_ID.MO || tn === TAG_ID.MN || tn === TAG_ID.MS || tn === TAG_ID.MTEXT);
}
function isHtmlIntegrationPoint(tn, ns, attrs) {
  if (ns === NS.MATHML && tn === TAG_ID.ANNOTATION_XML) {
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].name === ATTRS.ENCODING) {
        const value = attrs[i].value.toLowerCase();
        return value === MIME_TYPES.TEXT_HTML || value === MIME_TYPES.APPLICATION_XML;
      }
    }
  }
  return ns === NS.SVG && (tn === TAG_ID.FOREIGN_OBJECT || tn === TAG_ID.DESC || tn === TAG_ID.TITLE);
}
function isIntegrationPoint(tn, ns, attrs, foreignNS) {
  return (!foreignNS || foreignNS === NS.HTML) && isHtmlIntegrationPoint(tn, ns, attrs) || (!foreignNS || foreignNS === NS.MATHML) && isMathMLTextIntegrationPoint(tn, ns);
}

// node_modules/parse5/dist/parser/index.js
var HIDDEN_INPUT_TYPE = "hidden";
var AA_OUTER_LOOP_ITER = 8;
var AA_INNER_LOOP_ITER = 3;
var InsertionMode;
(function(InsertionMode2) {
  InsertionMode2[InsertionMode2["INITIAL"] = 0] = "INITIAL";
  InsertionMode2[InsertionMode2["BEFORE_HTML"] = 1] = "BEFORE_HTML";
  InsertionMode2[InsertionMode2["BEFORE_HEAD"] = 2] = "BEFORE_HEAD";
  InsertionMode2[InsertionMode2["IN_HEAD"] = 3] = "IN_HEAD";
  InsertionMode2[InsertionMode2["IN_HEAD_NO_SCRIPT"] = 4] = "IN_HEAD_NO_SCRIPT";
  InsertionMode2[InsertionMode2["AFTER_HEAD"] = 5] = "AFTER_HEAD";
  InsertionMode2[InsertionMode2["IN_BODY"] = 6] = "IN_BODY";
  InsertionMode2[InsertionMode2["TEXT"] = 7] = "TEXT";
  InsertionMode2[InsertionMode2["IN_TABLE"] = 8] = "IN_TABLE";
  InsertionMode2[InsertionMode2["IN_TABLE_TEXT"] = 9] = "IN_TABLE_TEXT";
  InsertionMode2[InsertionMode2["IN_CAPTION"] = 10] = "IN_CAPTION";
  InsertionMode2[InsertionMode2["IN_COLUMN_GROUP"] = 11] = "IN_COLUMN_GROUP";
  InsertionMode2[InsertionMode2["IN_TABLE_BODY"] = 12] = "IN_TABLE_BODY";
  InsertionMode2[InsertionMode2["IN_ROW"] = 13] = "IN_ROW";
  InsertionMode2[InsertionMode2["IN_CELL"] = 14] = "IN_CELL";
  InsertionMode2[InsertionMode2["IN_SELECT"] = 15] = "IN_SELECT";
  InsertionMode2[InsertionMode2["IN_SELECT_IN_TABLE"] = 16] = "IN_SELECT_IN_TABLE";
  InsertionMode2[InsertionMode2["IN_TEMPLATE"] = 17] = "IN_TEMPLATE";
  InsertionMode2[InsertionMode2["AFTER_BODY"] = 18] = "AFTER_BODY";
  InsertionMode2[InsertionMode2["IN_FRAMESET"] = 19] = "IN_FRAMESET";
  InsertionMode2[InsertionMode2["AFTER_FRAMESET"] = 20] = "AFTER_FRAMESET";
  InsertionMode2[InsertionMode2["AFTER_AFTER_BODY"] = 21] = "AFTER_AFTER_BODY";
  InsertionMode2[InsertionMode2["AFTER_AFTER_FRAMESET"] = 22] = "AFTER_AFTER_FRAMESET";
})(InsertionMode || (InsertionMode = {}));
var BASE_LOC = {
  startLine: -1,
  startCol: -1,
  startOffset: -1,
  endLine: -1,
  endCol: -1,
  endOffset: -1
};
var TABLE_STRUCTURE_TAGS = /* @__PURE__ */ new Set([TAG_ID.TABLE, TAG_ID.TBODY, TAG_ID.TFOOT, TAG_ID.THEAD, TAG_ID.TR]);
var defaultParserOptions = {
  scriptingEnabled: true,
  sourceCodeLocationInfo: false,
  treeAdapter: defaultTreeAdapter,
  onParseError: null
};
var Parser = class {
  constructor(options, document, fragmentContext = null, scriptHandler = null) {
    this.fragmentContext = fragmentContext;
    this.scriptHandler = scriptHandler;
    this.currentToken = null;
    this.stopped = false;
    this.insertionMode = InsertionMode.INITIAL;
    this.originalInsertionMode = InsertionMode.INITIAL;
    this.headElement = null;
    this.formElement = null;
    this.currentNotInHTML = false;
    this.tmplInsertionModeStack = [];
    this.pendingCharacterTokens = [];
    this.hasNonWhitespacePendingCharacterToken = false;
    this.framesetOk = true;
    this.skipNextNewLine = false;
    this.fosterParentingEnabled = false;
    this.options = {
      ...defaultParserOptions,
      ...options
    };
    this.treeAdapter = this.options.treeAdapter;
    this.onParseError = this.options.onParseError;
    if (this.onParseError) {
      this.options.sourceCodeLocationInfo = true;
    }
    this.document = document !== null && document !== void 0 ? document : this.treeAdapter.createDocument();
    this.tokenizer = new Tokenizer(this.options, this);
    this.activeFormattingElements = new FormattingElementList(this.treeAdapter);
    this.fragmentContextID = fragmentContext ? getTagID(this.treeAdapter.getTagName(fragmentContext)) : TAG_ID.UNKNOWN;
    this._setContextModes(fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : this.document, this.fragmentContextID);
    this.openElements = new OpenElementStack(this.document, this.treeAdapter, this);
  }
  // API
  static parse(html, options) {
    const parser = new this(options);
    parser.tokenizer.write(html, true);
    return parser.document;
  }
  static getFragmentParser(fragmentContext, options) {
    const opts = {
      ...defaultParserOptions,
      ...options
    };
    fragmentContext !== null && fragmentContext !== void 0 ? fragmentContext : fragmentContext = opts.treeAdapter.createElement(TAG_NAMES.TEMPLATE, NS.HTML, []);
    const documentMock = opts.treeAdapter.createElement("documentmock", NS.HTML, []);
    const parser = new this(opts, documentMock, fragmentContext);
    if (parser.fragmentContextID === TAG_ID.TEMPLATE) {
      parser.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
    }
    parser._initTokenizerForFragmentParsing();
    parser._insertFakeRootElement();
    parser._resetInsertionMode();
    parser._findFormInFragmentContext();
    return parser;
  }
  getFragment() {
    const rootElement = this.treeAdapter.getFirstChild(this.document);
    const fragment = this.treeAdapter.createDocumentFragment();
    this._adoptNodes(rootElement, fragment);
    return fragment;
  }
  //Errors
  /** @internal */
  _err(token, code, beforeToken) {
    var _a;
    if (!this.onParseError)
      return;
    const loc = (_a = token.location) !== null && _a !== void 0 ? _a : BASE_LOC;
    const err = {
      code,
      startLine: loc.startLine,
      startCol: loc.startCol,
      startOffset: loc.startOffset,
      endLine: beforeToken ? loc.startLine : loc.endLine,
      endCol: beforeToken ? loc.startCol : loc.endCol,
      endOffset: beforeToken ? loc.startOffset : loc.endOffset
    };
    this.onParseError(err);
  }
  //Stack events
  /** @internal */
  onItemPush(node, tid, isTop) {
    var _a, _b;
    (_b = (_a = this.treeAdapter).onItemPush) === null || _b === void 0 ? void 0 : _b.call(_a, node);
    if (isTop && this.openElements.stackTop > 0)
      this._setContextModes(node, tid);
  }
  /** @internal */
  onItemPop(node, isTop) {
    var _a, _b;
    if (this.options.sourceCodeLocationInfo) {
      this._setEndLocation(node, this.currentToken);
    }
    (_b = (_a = this.treeAdapter).onItemPop) === null || _b === void 0 ? void 0 : _b.call(_a, node, this.openElements.current);
    if (isTop) {
      let current;
      let currentTagId;
      if (this.openElements.stackTop === 0 && this.fragmentContext) {
        current = this.fragmentContext;
        currentTagId = this.fragmentContextID;
      } else {
        ({ current, currentTagId } = this.openElements);
      }
      this._setContextModes(current, currentTagId);
    }
  }
  _setContextModes(current, tid) {
    const isHTML = current === this.document || current && this.treeAdapter.getNamespaceURI(current) === NS.HTML;
    this.currentNotInHTML = !isHTML;
    this.tokenizer.inForeignNode = !isHTML && current !== void 0 && tid !== void 0 && !this._isIntegrationPoint(tid, current);
  }
  /** @protected */
  _switchToTextParsing(currentToken, nextTokenizerState) {
    this._insertElement(currentToken, NS.HTML);
    this.tokenizer.state = nextTokenizerState;
    this.originalInsertionMode = this.insertionMode;
    this.insertionMode = InsertionMode.TEXT;
  }
  switchToPlaintextParsing() {
    this.insertionMode = InsertionMode.TEXT;
    this.originalInsertionMode = InsertionMode.IN_BODY;
    this.tokenizer.state = TokenizerMode.PLAINTEXT;
  }
  //Fragment parsing
  /** @protected */
  _getAdjustedCurrentElement() {
    return this.openElements.stackTop === 0 && this.fragmentContext ? this.fragmentContext : this.openElements.current;
  }
  /** @protected */
  _findFormInFragmentContext() {
    let node = this.fragmentContext;
    while (node) {
      if (this.treeAdapter.getTagName(node) === TAG_NAMES.FORM) {
        this.formElement = node;
        break;
      }
      node = this.treeAdapter.getParentNode(node);
    }
  }
  _initTokenizerForFragmentParsing() {
    if (!this.fragmentContext || this.treeAdapter.getNamespaceURI(this.fragmentContext) !== NS.HTML) {
      return;
    }
    switch (this.fragmentContextID) {
      case TAG_ID.TITLE:
      case TAG_ID.TEXTAREA: {
        this.tokenizer.state = TokenizerMode.RCDATA;
        break;
      }
      case TAG_ID.STYLE:
      case TAG_ID.XMP:
      case TAG_ID.IFRAME:
      case TAG_ID.NOEMBED:
      case TAG_ID.NOFRAMES:
      case TAG_ID.NOSCRIPT: {
        this.tokenizer.state = TokenizerMode.RAWTEXT;
        break;
      }
      case TAG_ID.SCRIPT: {
        this.tokenizer.state = TokenizerMode.SCRIPT_DATA;
        break;
      }
      case TAG_ID.PLAINTEXT: {
        this.tokenizer.state = TokenizerMode.PLAINTEXT;
        break;
      }
      default:
    }
  }
  //Tree mutation
  /** @protected */
  _setDocumentType(token) {
    const name = token.name || "";
    const publicId = token.publicId || "";
    const systemId = token.systemId || "";
    this.treeAdapter.setDocumentType(this.document, name, publicId, systemId);
    if (token.location) {
      const documentChildren = this.treeAdapter.getChildNodes(this.document);
      const docTypeNode = documentChildren.find((node) => this.treeAdapter.isDocumentTypeNode(node));
      if (docTypeNode) {
        this.treeAdapter.setNodeSourceCodeLocation(docTypeNode, token.location);
      }
    }
  }
  /** @protected */
  _attachElementToTree(element, location) {
    if (this.options.sourceCodeLocationInfo) {
      const loc = location && {
        ...location,
        startTag: location
      };
      this.treeAdapter.setNodeSourceCodeLocation(element, loc);
    }
    if (this._shouldFosterParentOnInsertion()) {
      this._fosterParentElement(element);
    } else {
      const parent = this.openElements.currentTmplContentOrNode;
      this.treeAdapter.appendChild(parent !== null && parent !== void 0 ? parent : this.document, element);
    }
  }
  /**
   * For self-closing tags. Add an element to the tree, but skip adding it
   * to the stack.
   */
  /** @protected */
  _appendElement(token, namespaceURI) {
    const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location);
  }
  /** @protected */
  _insertElement(token, namespaceURI) {
    const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);
    this._attachElementToTree(element, token.location);
    this.openElements.push(element, token.tagID);
  }
  /** @protected */
  _insertFakeElement(tagName, tagID) {
    const element = this.treeAdapter.createElement(tagName, NS.HTML, []);
    this._attachElementToTree(element, null);
    this.openElements.push(element, tagID);
  }
  /** @protected */
  _insertTemplate(token) {
    const tmpl = this.treeAdapter.createElement(token.tagName, NS.HTML, token.attrs);
    const content = this.treeAdapter.createDocumentFragment();
    this.treeAdapter.setTemplateContent(tmpl, content);
    this._attachElementToTree(tmpl, token.location);
    this.openElements.push(tmpl, token.tagID);
    if (this.options.sourceCodeLocationInfo)
      this.treeAdapter.setNodeSourceCodeLocation(content, null);
  }
  /** @protected */
  _insertFakeRootElement() {
    const element = this.treeAdapter.createElement(TAG_NAMES.HTML, NS.HTML, []);
    if (this.options.sourceCodeLocationInfo)
      this.treeAdapter.setNodeSourceCodeLocation(element, null);
    this.treeAdapter.appendChild(this.openElements.current, element);
    this.openElements.push(element, TAG_ID.HTML);
  }
  /** @protected */
  _appendCommentNode(token, parent) {
    const commentNode = this.treeAdapter.createCommentNode(token.data);
    this.treeAdapter.appendChild(parent, commentNode);
    if (this.options.sourceCodeLocationInfo) {
      this.treeAdapter.setNodeSourceCodeLocation(commentNode, token.location);
    }
  }
  /** @protected */
  _insertCharacters(token) {
    let parent;
    let beforeElement;
    if (this._shouldFosterParentOnInsertion()) {
      ({ parent, beforeElement } = this._findFosterParentingLocation());
      if (beforeElement) {
        this.treeAdapter.insertTextBefore(parent, token.chars, beforeElement);
      } else {
        this.treeAdapter.insertText(parent, token.chars);
      }
    } else {
      parent = this.openElements.currentTmplContentOrNode;
      this.treeAdapter.insertText(parent, token.chars);
    }
    if (!token.location)
      return;
    const siblings = this.treeAdapter.getChildNodes(parent);
    const textNodeIdx = beforeElement ? siblings.lastIndexOf(beforeElement) : siblings.length;
    const textNode = siblings[textNodeIdx - 1];
    const tnLoc = this.treeAdapter.getNodeSourceCodeLocation(textNode);
    if (tnLoc) {
      const { endLine, endCol, endOffset } = token.location;
      this.treeAdapter.updateNodeSourceCodeLocation(textNode, { endLine, endCol, endOffset });
    } else if (this.options.sourceCodeLocationInfo) {
      this.treeAdapter.setNodeSourceCodeLocation(textNode, token.location);
    }
  }
  /** @protected */
  _adoptNodes(donor, recipient) {
    for (let child = this.treeAdapter.getFirstChild(donor); child; child = this.treeAdapter.getFirstChild(donor)) {
      this.treeAdapter.detachNode(child);
      this.treeAdapter.appendChild(recipient, child);
    }
  }
  /** @protected */
  _setEndLocation(element, closingToken) {
    if (this.treeAdapter.getNodeSourceCodeLocation(element) && closingToken.location) {
      const ctLoc = closingToken.location;
      const tn = this.treeAdapter.getTagName(element);
      const endLoc = (
        // NOTE: For cases like <p> <p> </p> - First 'p' closes without a closing
        // tag and for cases like <td> <p> </td> - 'p' closes without a closing tag.
        closingToken.type === TokenType.END_TAG && tn === closingToken.tagName ? {
          endTag: { ...ctLoc },
          endLine: ctLoc.endLine,
          endCol: ctLoc.endCol,
          endOffset: ctLoc.endOffset
        } : {
          endLine: ctLoc.startLine,
          endCol: ctLoc.startCol,
          endOffset: ctLoc.startOffset
        }
      );
      this.treeAdapter.updateNodeSourceCodeLocation(element, endLoc);
    }
  }
  //Token processing
  shouldProcessStartTagTokenInForeignContent(token) {
    if (!this.currentNotInHTML)
      return false;
    let current;
    let currentTagId;
    if (this.openElements.stackTop === 0 && this.fragmentContext) {
      current = this.fragmentContext;
      currentTagId = this.fragmentContextID;
    } else {
      ({ current, currentTagId } = this.openElements);
    }
    if (token.tagID === TAG_ID.SVG && this.treeAdapter.getTagName(current) === TAG_NAMES.ANNOTATION_XML && this.treeAdapter.getNamespaceURI(current) === NS.MATHML) {
      return false;
    }
    return (
      // Check that `current` is not an integration point for HTML or MathML elements.
      this.tokenizer.inForeignNode || // If it _is_ an integration point, then we might have to check that it is not an HTML
      // integration point.
      (token.tagID === TAG_ID.MGLYPH || token.tagID === TAG_ID.MALIGNMARK) && currentTagId !== void 0 && !this._isIntegrationPoint(currentTagId, current, NS.HTML)
    );
  }
  /** @protected */
  _processToken(token) {
    switch (token.type) {
      case TokenType.CHARACTER: {
        this.onCharacter(token);
        break;
      }
      case TokenType.NULL_CHARACTER: {
        this.onNullCharacter(token);
        break;
      }
      case TokenType.COMMENT: {
        this.onComment(token);
        break;
      }
      case TokenType.DOCTYPE: {
        this.onDoctype(token);
        break;
      }
      case TokenType.START_TAG: {
        this._processStartTag(token);
        break;
      }
      case TokenType.END_TAG: {
        this.onEndTag(token);
        break;
      }
      case TokenType.EOF: {
        this.onEof(token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        this.onWhitespaceCharacter(token);
        break;
      }
    }
  }
  //Integration points
  /** @protected */
  _isIntegrationPoint(tid, element, foreignNS) {
    const ns = this.treeAdapter.getNamespaceURI(element);
    const attrs = this.treeAdapter.getAttrList(element);
    return isIntegrationPoint(tid, ns, attrs, foreignNS);
  }
  //Active formatting elements reconstruction
  /** @protected */
  _reconstructActiveFormattingElements() {
    const listLength = this.activeFormattingElements.entries.length;
    if (listLength) {
      const endIndex = this.activeFormattingElements.entries.findIndex((entry) => entry.type === EntryType.Marker || this.openElements.contains(entry.element));
      const unopenIdx = endIndex === -1 ? listLength - 1 : endIndex - 1;
      for (let i = unopenIdx; i >= 0; i--) {
        const entry = this.activeFormattingElements.entries[i];
        this._insertElement(entry.token, this.treeAdapter.getNamespaceURI(entry.element));
        entry.element = this.openElements.current;
      }
    }
  }
  //Close elements
  /** @protected */
  _closeTableCell() {
    this.openElements.generateImpliedEndTags();
    this.openElements.popUntilTableCellPopped();
    this.activeFormattingElements.clearToLastMarker();
    this.insertionMode = InsertionMode.IN_ROW;
  }
  /** @protected */
  _closePElement() {
    this.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.P);
    this.openElements.popUntilTagNamePopped(TAG_ID.P);
  }
  //Insertion modes
  /** @protected */
  _resetInsertionMode() {
    for (let i = this.openElements.stackTop; i >= 0; i--) {
      switch (i === 0 && this.fragmentContext ? this.fragmentContextID : this.openElements.tagIDs[i]) {
        case TAG_ID.TR: {
          this.insertionMode = InsertionMode.IN_ROW;
          return;
        }
        case TAG_ID.TBODY:
        case TAG_ID.THEAD:
        case TAG_ID.TFOOT: {
          this.insertionMode = InsertionMode.IN_TABLE_BODY;
          return;
        }
        case TAG_ID.CAPTION: {
          this.insertionMode = InsertionMode.IN_CAPTION;
          return;
        }
        case TAG_ID.COLGROUP: {
          this.insertionMode = InsertionMode.IN_COLUMN_GROUP;
          return;
        }
        case TAG_ID.TABLE: {
          this.insertionMode = InsertionMode.IN_TABLE;
          return;
        }
        case TAG_ID.BODY: {
          this.insertionMode = InsertionMode.IN_BODY;
          return;
        }
        case TAG_ID.FRAMESET: {
          this.insertionMode = InsertionMode.IN_FRAMESET;
          return;
        }
        case TAG_ID.SELECT: {
          this._resetInsertionModeForSelect(i);
          return;
        }
        case TAG_ID.TEMPLATE: {
          this.insertionMode = this.tmplInsertionModeStack[0];
          return;
        }
        case TAG_ID.HTML: {
          this.insertionMode = this.headElement ? InsertionMode.AFTER_HEAD : InsertionMode.BEFORE_HEAD;
          return;
        }
        case TAG_ID.TD:
        case TAG_ID.TH: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_CELL;
            return;
          }
          break;
        }
        case TAG_ID.HEAD: {
          if (i > 0) {
            this.insertionMode = InsertionMode.IN_HEAD;
            return;
          }
          break;
        }
      }
    }
    this.insertionMode = InsertionMode.IN_BODY;
  }
  /** @protected */
  _resetInsertionModeForSelect(selectIdx) {
    if (selectIdx > 0) {
      for (let i = selectIdx - 1; i > 0; i--) {
        const tn = this.openElements.tagIDs[i];
        if (tn === TAG_ID.TEMPLATE) {
          break;
        } else if (tn === TAG_ID.TABLE) {
          this.insertionMode = InsertionMode.IN_SELECT_IN_TABLE;
          return;
        }
      }
    }
    this.insertionMode = InsertionMode.IN_SELECT;
  }
  //Foster parenting
  /** @protected */
  _isElementCausesFosterParenting(tn) {
    return TABLE_STRUCTURE_TAGS.has(tn);
  }
  /** @protected */
  _shouldFosterParentOnInsertion() {
    return this.fosterParentingEnabled && this.openElements.currentTagId !== void 0 && this._isElementCausesFosterParenting(this.openElements.currentTagId);
  }
  /** @protected */
  _findFosterParentingLocation() {
    for (let i = this.openElements.stackTop; i >= 0; i--) {
      const openElement = this.openElements.items[i];
      switch (this.openElements.tagIDs[i]) {
        case TAG_ID.TEMPLATE: {
          if (this.treeAdapter.getNamespaceURI(openElement) === NS.HTML) {
            return { parent: this.treeAdapter.getTemplateContent(openElement), beforeElement: null };
          }
          break;
        }
        case TAG_ID.TABLE: {
          const parent = this.treeAdapter.getParentNode(openElement);
          if (parent) {
            return { parent, beforeElement: openElement };
          }
          return { parent: this.openElements.items[i - 1], beforeElement: null };
        }
        default:
      }
    }
    return { parent: this.openElements.items[0], beforeElement: null };
  }
  /** @protected */
  _fosterParentElement(element) {
    const location = this._findFosterParentingLocation();
    if (location.beforeElement) {
      this.treeAdapter.insertBefore(location.parent, element, location.beforeElement);
    } else {
      this.treeAdapter.appendChild(location.parent, element);
    }
  }
  //Special elements
  /** @protected */
  _isSpecialElement(element, id) {
    const ns = this.treeAdapter.getNamespaceURI(element);
    return SPECIAL_ELEMENTS[ns].has(id);
  }
  /** @internal */
  onCharacter(token) {
    this.skipNextNewLine = false;
    if (this.tokenizer.inForeignNode) {
      characterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE: {
        characterInBody(this, token);
        break;
      }
      case InsertionMode.TEXT:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        characterInTableText(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onNullCharacter(token) {
    this.skipNextNewLine = false;
    if (this.tokenizer.inForeignNode) {
      nullCharacterInForeignContent(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        tokenInColumnGroup(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        tokenAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onComment(token) {
    this.skipNextNewLine = false;
    if (this.currentNotInHTML) {
      appendComment(this, token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.INITIAL:
      case InsertionMode.BEFORE_HTML:
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        appendComment(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        appendCommentToRootHtmlElement(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        appendCommentToDocument(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onDoctype(token) {
    this.skipNextNewLine = false;
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        doctypeInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD:
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD: {
        this._err(token, ERR.misplacedDoctype);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onStartTag(token) {
    this.skipNextNewLine = false;
    this.currentToken = token;
    this._processStartTag(token);
    if (token.selfClosing && !token.ackSelfClosing) {
      this._err(token, ERR.nonVoidHtmlElementStartTagWithTrailingSolidus);
    }
  }
  /**
   * Processes a given start tag.
   *
   * `onStartTag` checks if a self-closing tag was recognized. When a token
   * is moved inbetween multiple insertion modes, this check for self-closing
   * could lead to false positives. To avoid this, `_processStartTag` is used
   * for nested calls.
   *
   * @param token The token to process.
   * @protected
   */
  _processStartTag(token) {
    if (this.shouldProcessStartTagTokenInForeignContent(token)) {
      startTagInForeignContent(this, token);
    } else {
      this._startTagOutsideForeignContent(token);
    }
  }
  /** @protected */
  _startTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        startTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        startTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        startTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        startTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        startTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        startTagInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        startTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        startTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        startTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        startTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        startTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        startTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        startTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        startTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        startTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        startTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        startTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        startTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        startTagAfterAfterBody(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        startTagAfterAfterFrameset(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEndTag(token) {
    this.skipNextNewLine = false;
    this.currentToken = token;
    if (this.currentNotInHTML) {
      endTagInForeignContent(this, token);
    } else {
      this._endTagOutsideForeignContent(token);
    }
  }
  /** @protected */
  _endTagOutsideForeignContent(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        endTagBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        endTagBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        endTagInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        endTagInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        endTagAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY: {
        endTagInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        endTagInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE: {
        endTagInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_CAPTION: {
        endTagInCaption(this, token);
        break;
      }
      case InsertionMode.IN_COLUMN_GROUP: {
        endTagInColumnGroup(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_BODY: {
        endTagInTableBody(this, token);
        break;
      }
      case InsertionMode.IN_ROW: {
        endTagInRow(this, token);
        break;
      }
      case InsertionMode.IN_CELL: {
        endTagInCell(this, token);
        break;
      }
      case InsertionMode.IN_SELECT: {
        endTagInSelect(this, token);
        break;
      }
      case InsertionMode.IN_SELECT_IN_TABLE: {
        endTagInSelectInTable(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        endTagInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY: {
        endTagAfterBody(this, token);
        break;
      }
      case InsertionMode.IN_FRAMESET: {
        endTagInFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_FRAMESET: {
        endTagAfterFrameset(this, token);
        break;
      }
      case InsertionMode.AFTER_AFTER_BODY: {
        tokenAfterAfterBody(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onEof(token) {
    switch (this.insertionMode) {
      case InsertionMode.INITIAL: {
        tokenInInitialMode(this, token);
        break;
      }
      case InsertionMode.BEFORE_HTML: {
        tokenBeforeHtml(this, token);
        break;
      }
      case InsertionMode.BEFORE_HEAD: {
        tokenBeforeHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD: {
        tokenInHead(this, token);
        break;
      }
      case InsertionMode.IN_HEAD_NO_SCRIPT: {
        tokenInHeadNoScript(this, token);
        break;
      }
      case InsertionMode.AFTER_HEAD: {
        tokenAfterHead(this, token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE: {
        eofInBody(this, token);
        break;
      }
      case InsertionMode.TEXT: {
        eofInText(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        tokenInTableText(this, token);
        break;
      }
      case InsertionMode.IN_TEMPLATE: {
        eofInTemplate(this, token);
        break;
      }
      case InsertionMode.AFTER_BODY:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        stopParsing(this, token);
        break;
      }
      default:
    }
  }
  /** @internal */
  onWhitespaceCharacter(token) {
    if (this.skipNextNewLine) {
      this.skipNextNewLine = false;
      if (token.chars.charCodeAt(0) === CODE_POINTS.LINE_FEED) {
        if (token.chars.length === 1) {
          return;
        }
        token.chars = token.chars.substr(1);
      }
    }
    if (this.tokenizer.inForeignNode) {
      this._insertCharacters(token);
      return;
    }
    switch (this.insertionMode) {
      case InsertionMode.IN_HEAD:
      case InsertionMode.IN_HEAD_NO_SCRIPT:
      case InsertionMode.AFTER_HEAD:
      case InsertionMode.TEXT:
      case InsertionMode.IN_COLUMN_GROUP:
      case InsertionMode.IN_SELECT:
      case InsertionMode.IN_SELECT_IN_TABLE:
      case InsertionMode.IN_FRAMESET:
      case InsertionMode.AFTER_FRAMESET: {
        this._insertCharacters(token);
        break;
      }
      case InsertionMode.IN_BODY:
      case InsertionMode.IN_CAPTION:
      case InsertionMode.IN_CELL:
      case InsertionMode.IN_TEMPLATE:
      case InsertionMode.AFTER_BODY:
      case InsertionMode.AFTER_AFTER_BODY:
      case InsertionMode.AFTER_AFTER_FRAMESET: {
        whitespaceCharacterInBody(this, token);
        break;
      }
      case InsertionMode.IN_TABLE:
      case InsertionMode.IN_TABLE_BODY:
      case InsertionMode.IN_ROW: {
        characterInTable(this, token);
        break;
      }
      case InsertionMode.IN_TABLE_TEXT: {
        whitespaceCharacterInTableText(this, token);
        break;
      }
      default:
    }
  }
};
function aaObtainFormattingElementEntry(p, token) {
  let formattingElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(token.tagName);
  if (formattingElementEntry) {
    if (!p.openElements.contains(formattingElementEntry.element)) {
      p.activeFormattingElements.removeEntry(formattingElementEntry);
      formattingElementEntry = null;
    } else if (!p.openElements.hasInScope(token.tagID)) {
      formattingElementEntry = null;
    }
  } else {
    genericEndTagInBody(p, token);
  }
  return formattingElementEntry;
}
function aaObtainFurthestBlock(p, formattingElementEntry) {
  let furthestBlock = null;
  let idx = p.openElements.stackTop;
  for (; idx >= 0; idx--) {
    const element = p.openElements.items[idx];
    if (element === formattingElementEntry.element) {
      break;
    }
    if (p._isSpecialElement(element, p.openElements.tagIDs[idx])) {
      furthestBlock = element;
    }
  }
  if (!furthestBlock) {
    p.openElements.shortenToLength(Math.max(idx, 0));
    p.activeFormattingElements.removeEntry(formattingElementEntry);
  }
  return furthestBlock;
}
function aaInnerLoop(p, furthestBlock, formattingElement) {
  let lastElement = furthestBlock;
  let nextElement = p.openElements.getCommonAncestor(furthestBlock);
  for (let i = 0, element = nextElement; element !== formattingElement; i++, element = nextElement) {
    nextElement = p.openElements.getCommonAncestor(element);
    const elementEntry = p.activeFormattingElements.getElementEntry(element);
    const counterOverflow = elementEntry && i >= AA_INNER_LOOP_ITER;
    const shouldRemoveFromOpenElements = !elementEntry || counterOverflow;
    if (shouldRemoveFromOpenElements) {
      if (counterOverflow) {
        p.activeFormattingElements.removeEntry(elementEntry);
      }
      p.openElements.remove(element);
    } else {
      element = aaRecreateElementFromEntry(p, elementEntry);
      if (lastElement === furthestBlock) {
        p.activeFormattingElements.bookmark = elementEntry;
      }
      p.treeAdapter.detachNode(lastElement);
      p.treeAdapter.appendChild(element, lastElement);
      lastElement = element;
    }
  }
  return lastElement;
}
function aaRecreateElementFromEntry(p, elementEntry) {
  const ns = p.treeAdapter.getNamespaceURI(elementEntry.element);
  const newElement = p.treeAdapter.createElement(elementEntry.token.tagName, ns, elementEntry.token.attrs);
  p.openElements.replace(elementEntry.element, newElement);
  elementEntry.element = newElement;
  return newElement;
}
function aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement) {
  const tn = p.treeAdapter.getTagName(commonAncestor);
  const tid = getTagID(tn);
  if (p._isElementCausesFosterParenting(tid)) {
    p._fosterParentElement(lastElement);
  } else {
    const ns = p.treeAdapter.getNamespaceURI(commonAncestor);
    if (tid === TAG_ID.TEMPLATE && ns === NS.HTML) {
      commonAncestor = p.treeAdapter.getTemplateContent(commonAncestor);
    }
    p.treeAdapter.appendChild(commonAncestor, lastElement);
  }
}
function aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry) {
  const ns = p.treeAdapter.getNamespaceURI(formattingElementEntry.element);
  const { token } = formattingElementEntry;
  const newElement = p.treeAdapter.createElement(token.tagName, ns, token.attrs);
  p._adoptNodes(furthestBlock, newElement);
  p.treeAdapter.appendChild(furthestBlock, newElement);
  p.activeFormattingElements.insertElementAfterBookmark(newElement, token);
  p.activeFormattingElements.removeEntry(formattingElementEntry);
  p.openElements.remove(formattingElementEntry.element);
  p.openElements.insertAfter(furthestBlock, newElement, token.tagID);
}
function callAdoptionAgency(p, token) {
  for (let i = 0; i < AA_OUTER_LOOP_ITER; i++) {
    const formattingElementEntry = aaObtainFormattingElementEntry(p, token);
    if (!formattingElementEntry) {
      break;
    }
    const furthestBlock = aaObtainFurthestBlock(p, formattingElementEntry);
    if (!furthestBlock) {
      break;
    }
    p.activeFormattingElements.bookmark = formattingElementEntry;
    const lastElement = aaInnerLoop(p, furthestBlock, formattingElementEntry.element);
    const commonAncestor = p.openElements.getCommonAncestor(formattingElementEntry.element);
    p.treeAdapter.detachNode(lastElement);
    if (commonAncestor)
      aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement);
    aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry);
  }
}
function appendComment(p, token) {
  p._appendCommentNode(token, p.openElements.currentTmplContentOrNode);
}
function appendCommentToRootHtmlElement(p, token) {
  p._appendCommentNode(token, p.openElements.items[0]);
}
function appendCommentToDocument(p, token) {
  p._appendCommentNode(token, p.document);
}
function stopParsing(p, token) {
  p.stopped = true;
  if (token.location) {
    const target = p.fragmentContext ? 0 : 2;
    for (let i = p.openElements.stackTop; i >= target; i--) {
      p._setEndLocation(p.openElements.items[i], token);
    }
    if (!p.fragmentContext && p.openElements.stackTop >= 0) {
      const htmlElement = p.openElements.items[0];
      const htmlLocation = p.treeAdapter.getNodeSourceCodeLocation(htmlElement);
      if (htmlLocation && !htmlLocation.endTag) {
        p._setEndLocation(htmlElement, token);
        if (p.openElements.stackTop >= 1) {
          const bodyElement = p.openElements.items[1];
          const bodyLocation = p.treeAdapter.getNodeSourceCodeLocation(bodyElement);
          if (bodyLocation && !bodyLocation.endTag) {
            p._setEndLocation(bodyElement, token);
          }
        }
      }
    }
  }
}
function doctypeInInitialMode(p, token) {
  p._setDocumentType(token);
  const mode = token.forceQuirks ? DOCUMENT_MODE.QUIRKS : getDocumentMode(token);
  if (!isConforming(token)) {
    p._err(token, ERR.nonConformingDoctype);
  }
  p.treeAdapter.setDocumentMode(p.document, mode);
  p.insertionMode = InsertionMode.BEFORE_HTML;
}
function tokenInInitialMode(p, token) {
  p._err(token, ERR.missingDoctype, true);
  p.treeAdapter.setDocumentMode(p.document, DOCUMENT_MODE.QUIRKS);
  p.insertionMode = InsertionMode.BEFORE_HTML;
  p._processToken(token);
}
function startTagBeforeHtml(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.BEFORE_HEAD;
  } else {
    tokenBeforeHtml(p, token);
  }
}
function endTagBeforeHtml(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.HTML || tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.BR) {
    tokenBeforeHtml(p, token);
  }
}
function tokenBeforeHtml(p, token) {
  p._insertFakeRootElement();
  p.insertionMode = InsertionMode.BEFORE_HEAD;
  p._processToken(token);
}
function startTagBeforeHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.HEAD: {
      p._insertElement(token, NS.HTML);
      p.headElement = p.openElements.current;
      p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    default: {
      tokenBeforeHead(p, token);
    }
  }
}
function endTagBeforeHead(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.HEAD || tn === TAG_ID.BODY || tn === TAG_ID.HTML || tn === TAG_ID.BR) {
    tokenBeforeHead(p, token);
  } else {
    p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenBeforeHead(p, token) {
  p._insertFakeElement(TAG_NAMES.HEAD, TAG_ID.HEAD);
  p.headElement = p.openElements.current;
  p.insertionMode = InsertionMode.IN_HEAD;
  p._processToken(token);
}
function startTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.TITLE: {
      p._switchToTextParsing(token, TokenizerMode.RCDATA);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      if (p.options.scriptingEnabled) {
        p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
      } else {
        p._insertElement(token, NS.HTML);
        p.insertionMode = InsertionMode.IN_HEAD_NO_SCRIPT;
      }
      break;
    }
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
      break;
    }
    case TAG_ID.SCRIPT: {
      p._switchToTextParsing(token, TokenizerMode.SCRIPT_DATA);
      break;
    }
    case TAG_ID.TEMPLATE: {
      p._insertTemplate(token);
      p.activeFormattingElements.insertMarker();
      p.framesetOk = false;
      p.insertionMode = InsertionMode.IN_TEMPLATE;
      p.tmplInsertionModeStack.unshift(InsertionMode.IN_TEMPLATE);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default: {
      tokenInHead(p, token);
    }
  }
}
function endTagInHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HEAD: {
      p.openElements.pop();
      p.insertionMode = InsertionMode.AFTER_HEAD;
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.BR:
    case TAG_ID.HTML: {
      tokenInHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function templateEndTagInHead(p, token) {
  if (p.openElements.tmplCount > 0) {
    p.openElements.generateImpliedEndTagsThoroughly();
    if (p.openElements.currentTagId !== TAG_ID.TEMPLATE) {
      p._err(token, ERR.closingOfElementWithOpenChildElements);
    }
    p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
    p.activeFormattingElements.clearToLastMarker();
    p.tmplInsertionModeStack.shift();
    p._resetInsertionMode();
  } else {
    p._err(token, ERR.endTagWithoutMatchingOpenElement);
  }
}
function tokenInHead(p, token) {
  p.openElements.pop();
  p.insertionMode = InsertionMode.AFTER_HEAD;
  p._processToken(token);
}
function startTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.HEAD:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.STYLE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      p._err(token, ERR.nestedNoscriptInHead);
      break;
    }
    default: {
      tokenInHeadNoScript(p, token);
    }
  }
}
function endTagInHeadNoScript(p, token) {
  switch (token.tagID) {
    case TAG_ID.NOSCRIPT: {
      p.openElements.pop();
      p.insertionMode = InsertionMode.IN_HEAD;
      break;
    }
    case TAG_ID.BR: {
      tokenInHeadNoScript(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function tokenInHeadNoScript(p, token) {
  const errCode = token.type === TokenType.EOF ? ERR.openElementsLeftAfterEof : ERR.disallowedContentInNoscriptInHead;
  p._err(token, errCode);
  p.openElements.pop();
  p.insertionMode = InsertionMode.IN_HEAD;
  p._processToken(token);
}
function startTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.BODY: {
      p._insertElement(token, NS.HTML);
      p.framesetOk = false;
      p.insertionMode = InsertionMode.IN_BODY;
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_FRAMESET;
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      p._err(token, ERR.abandonedHeadElementChild);
      p.openElements.push(p.headElement, TAG_ID.HEAD);
      startTagInHead(p, token);
      p.openElements.remove(p.headElement);
      break;
    }
    case TAG_ID.HEAD: {
      p._err(token, ERR.misplacedStartTagForHeadElement);
      break;
    }
    default: {
      tokenAfterHead(p, token);
    }
  }
}
function endTagAfterHead(p, token) {
  switch (token.tagID) {
    case TAG_ID.BODY:
    case TAG_ID.HTML:
    case TAG_ID.BR: {
      tokenAfterHead(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      p._err(token, ERR.endTagWithoutMatchingOpenElement);
    }
  }
}
function tokenAfterHead(p, token) {
  p._insertFakeElement(TAG_NAMES.BODY, TAG_ID.BODY);
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function modeInBody(p, token) {
  switch (token.type) {
    case TokenType.CHARACTER: {
      characterInBody(p, token);
      break;
    }
    case TokenType.WHITESPACE_CHARACTER: {
      whitespaceCharacterInBody(p, token);
      break;
    }
    case TokenType.COMMENT: {
      appendComment(p, token);
      break;
    }
    case TokenType.START_TAG: {
      startTagInBody(p, token);
      break;
    }
    case TokenType.END_TAG: {
      endTagInBody(p, token);
      break;
    }
    case TokenType.EOF: {
      eofInBody(p, token);
      break;
    }
    default:
  }
}
function whitespaceCharacterInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertCharacters(token);
}
function characterInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertCharacters(token);
  p.framesetOk = false;
}
function htmlStartTagInBody(p, token) {
  if (p.openElements.tmplCount === 0) {
    p.treeAdapter.adoptAttributes(p.openElements.items[0], token.attrs);
  }
}
function bodyStartTagInBody(p, token) {
  const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  if (bodyElement && p.openElements.tmplCount === 0) {
    p.framesetOk = false;
    p.treeAdapter.adoptAttributes(bodyElement, token.attrs);
  }
}
function framesetStartTagInBody(p, token) {
  const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
  if (p.framesetOk && bodyElement) {
    p.treeAdapter.detachNode(bodyElement);
    p.openElements.popAllUpToHtmlElement();
    p._insertElement(token, NS.HTML);
    p.insertionMode = InsertionMode.IN_FRAMESET;
  }
}
function addressStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
}
function numberedHeaderStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  if (p.openElements.currentTagId !== void 0 && NUMBERED_HEADERS.has(p.openElements.currentTagId)) {
    p.openElements.pop();
  }
  p._insertElement(token, NS.HTML);
}
function preStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.skipNextNewLine = true;
  p.framesetOk = false;
}
function formStartTagInBody(p, token) {
  const inTemplate = p.openElements.tmplCount > 0;
  if (!p.formElement || inTemplate) {
    if (p.openElements.hasInButtonScope(TAG_ID.P)) {
      p._closePElement();
    }
    p._insertElement(token, NS.HTML);
    if (!inTemplate) {
      p.formElement = p.openElements.current;
    }
  }
}
function listItemStartTagInBody(p, token) {
  p.framesetOk = false;
  const tn = token.tagID;
  for (let i = p.openElements.stackTop; i >= 0; i--) {
    const elementId = p.openElements.tagIDs[i];
    if (tn === TAG_ID.LI && elementId === TAG_ID.LI || (tn === TAG_ID.DD || tn === TAG_ID.DT) && (elementId === TAG_ID.DD || elementId === TAG_ID.DT)) {
      p.openElements.generateImpliedEndTagsWithExclusion(elementId);
      p.openElements.popUntilTagNamePopped(elementId);
      break;
    }
    if (elementId !== TAG_ID.ADDRESS && elementId !== TAG_ID.DIV && elementId !== TAG_ID.P && p._isSpecialElement(p.openElements.items[i], elementId)) {
      break;
    }
  }
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
}
function plaintextStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.tokenizer.state = TokenizerMode.PLAINTEXT;
}
function buttonStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BUTTON)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(TAG_ID.BUTTON);
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
}
function aStartTagInBody(p, token) {
  const activeElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(TAG_NAMES.A);
  if (activeElementEntry) {
    callAdoptionAgency(p, token);
    p.openElements.remove(activeElementEntry.element);
    p.activeFormattingElements.removeEntry(activeElementEntry);
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function bStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function nobrStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  if (p.openElements.hasInScope(TAG_ID.NOBR)) {
    callAdoptionAgency(p, token);
    p._reconstructActiveFormattingElements();
  }
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.pushElement(p.openElements.current, token);
}
function appletStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.activeFormattingElements.insertMarker();
  p.framesetOk = false;
}
function tableStartTagInBody(p, token) {
  if (p.treeAdapter.getDocumentMode(p.document) !== DOCUMENT_MODE.QUIRKS && p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
  p.insertionMode = InsertionMode.IN_TABLE;
}
function areaStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._appendElement(token, NS.HTML);
  p.framesetOk = false;
  token.ackSelfClosing = true;
}
function isHiddenInput(token) {
  const inputType = getTokenAttr(token, ATTRS.TYPE);
  return inputType != null && inputType.toLowerCase() === HIDDEN_INPUT_TYPE;
}
function inputStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._appendElement(token, NS.HTML);
  if (!isHiddenInput(token)) {
    p.framesetOk = false;
  }
  token.ackSelfClosing = true;
}
function paramStartTagInBody(p, token) {
  p._appendElement(token, NS.HTML);
  token.ackSelfClosing = true;
}
function hrStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._appendElement(token, NS.HTML);
  p.framesetOk = false;
  token.ackSelfClosing = true;
}
function imageStartTagInBody(p, token) {
  token.tagName = TAG_NAMES.IMG;
  token.tagID = TAG_ID.IMG;
  areaStartTagInBody(p, token);
}
function textareaStartTagInBody(p, token) {
  p._insertElement(token, NS.HTML);
  p.skipNextNewLine = true;
  p.tokenizer.state = TokenizerMode.RCDATA;
  p.originalInsertionMode = p.insertionMode;
  p.framesetOk = false;
  p.insertionMode = InsertionMode.TEXT;
}
function xmpStartTagInBody(p, token) {
  if (p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._closePElement();
  }
  p._reconstructActiveFormattingElements();
  p.framesetOk = false;
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function iframeStartTagInBody(p, token) {
  p.framesetOk = false;
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function rawTextStartTagInBody(p, token) {
  p._switchToTextParsing(token, TokenizerMode.RAWTEXT);
}
function selectStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
  p.framesetOk = false;
  p.insertionMode = p.insertionMode === InsertionMode.IN_TABLE || p.insertionMode === InsertionMode.IN_CAPTION || p.insertionMode === InsertionMode.IN_TABLE_BODY || p.insertionMode === InsertionMode.IN_ROW || p.insertionMode === InsertionMode.IN_CELL ? InsertionMode.IN_SELECT_IN_TABLE : InsertionMode.IN_SELECT;
}
function optgroupStartTagInBody(p, token) {
  if (p.openElements.currentTagId === TAG_ID.OPTION) {
    p.openElements.pop();
  }
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
}
function rbStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.RUBY)) {
    p.openElements.generateImpliedEndTags();
  }
  p._insertElement(token, NS.HTML);
}
function rtStartTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.RUBY)) {
    p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.RTC);
  }
  p._insertElement(token, NS.HTML);
}
function mathStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  adjustTokenMathMLAttrs(token);
  adjustTokenXMLAttrs(token);
  if (token.selfClosing) {
    p._appendElement(token, NS.MATHML);
  } else {
    p._insertElement(token, NS.MATHML);
  }
  token.ackSelfClosing = true;
}
function svgStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  adjustTokenSVGAttrs(token);
  adjustTokenXMLAttrs(token);
  if (token.selfClosing) {
    p._appendElement(token, NS.SVG);
  } else {
    p._insertElement(token, NS.SVG);
  }
  token.ackSelfClosing = true;
}
function genericStartTagInBody(p, token) {
  p._reconstructActiveFormattingElements();
  p._insertElement(token, NS.HTML);
}
function startTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.B:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      bStartTagInBody(p, token);
      break;
    }
    case TAG_ID.A: {
      aStartTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderStartTagInBody(p, token);
      break;
    }
    case TAG_ID.P:
    case TAG_ID.DL:
    case TAG_ID.OL:
    case TAG_ID.UL:
    case TAG_ID.DIV:
    case TAG_ID.DIR:
    case TAG_ID.NAV:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.DETAILS:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressStartTagInBody(p, token);
      break;
    }
    case TAG_ID.LI:
    case TAG_ID.DD:
    case TAG_ID.DT: {
      listItemStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BR:
    case TAG_ID.IMG:
    case TAG_ID.WBR:
    case TAG_ID.AREA:
    case TAG_ID.EMBED:
    case TAG_ID.KEYGEN: {
      areaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HR: {
      hrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RB:
    case TAG_ID.RTC: {
      rbStartTagInBody(p, token);
      break;
    }
    case TAG_ID.RT:
    case TAG_ID.RP: {
      rtStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PRE:
    case TAG_ID.LISTING: {
      preStartTagInBody(p, token);
      break;
    }
    case TAG_ID.XMP: {
      xmpStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SVG: {
      svgStartTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BASE:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.STYLE:
    case TAG_ID.TITLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.BGSOUND:
    case TAG_ID.BASEFONT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY: {
      bodyStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOBR: {
      nobrStartTagInBody(p, token);
      break;
    }
    case TAG_ID.MATH: {
      mathStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInBody(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInBody(p, token);
      break;
    }
    case TAG_ID.PARAM:
    case TAG_ID.TRACK:
    case TAG_ID.SOURCE: {
      paramStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IMAGE: {
      imageStartTagInBody(p, token);
      break;
    }
    case TAG_ID.BUTTON: {
      buttonStartTagInBody(p, token);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletStartTagInBody(p, token);
      break;
    }
    case TAG_ID.IFRAME: {
      iframeStartTagInBody(p, token);
      break;
    }
    case TAG_ID.SELECT: {
      selectStartTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION:
    case TAG_ID.OPTGROUP: {
      optgroupStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOEMBED:
    case TAG_ID.NOFRAMES: {
      rawTextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      framesetStartTagInBody(p, token);
      break;
    }
    case TAG_ID.TEXTAREA: {
      textareaStartTagInBody(p, token);
      break;
    }
    case TAG_ID.NOSCRIPT: {
      if (p.options.scriptingEnabled) {
        rawTextStartTagInBody(p, token);
      } else {
        genericStartTagInBody(p, token);
      }
      break;
    }
    case TAG_ID.PLAINTEXT: {
      plaintextStartTagInBody(p, token);
      break;
    }
    case TAG_ID.COL:
    case TAG_ID.TH:
    case TAG_ID.TD:
    case TAG_ID.TR:
    case TAG_ID.HEAD:
    case TAG_ID.FRAME:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP: {
      break;
    }
    default: {
      genericStartTagInBody(p, token);
    }
  }
}
function bodyEndTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BODY)) {
    p.insertionMode = InsertionMode.AFTER_BODY;
    if (p.options.sourceCodeLocationInfo) {
      const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();
      if (bodyElement) {
        p._setEndLocation(bodyElement, token);
      }
    }
  }
}
function htmlEndTagInBody(p, token) {
  if (p.openElements.hasInScope(TAG_ID.BODY)) {
    p.insertionMode = InsertionMode.AFTER_BODY;
    endTagAfterBody(p, token);
  }
}
function addressEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(tn);
  }
}
function formEndTagInBody(p) {
  const inTemplate = p.openElements.tmplCount > 0;
  const { formElement } = p;
  if (!inTemplate) {
    p.formElement = null;
  }
  if ((formElement || inTemplate) && p.openElements.hasInScope(TAG_ID.FORM)) {
    p.openElements.generateImpliedEndTags();
    if (inTemplate) {
      p.openElements.popUntilTagNamePopped(TAG_ID.FORM);
    } else if (formElement) {
      p.openElements.remove(formElement);
    }
  }
}
function pEndTagInBody(p) {
  if (!p.openElements.hasInButtonScope(TAG_ID.P)) {
    p._insertFakeElement(TAG_NAMES.P, TAG_ID.P);
  }
  p._closePElement();
}
function liEndTagInBody(p) {
  if (p.openElements.hasInListItemScope(TAG_ID.LI)) {
    p.openElements.generateImpliedEndTagsWithExclusion(TAG_ID.LI);
    p.openElements.popUntilTagNamePopped(TAG_ID.LI);
  }
}
function ddEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTagsWithExclusion(tn);
    p.openElements.popUntilTagNamePopped(tn);
  }
}
function numberedHeaderEndTagInBody(p) {
  if (p.openElements.hasNumberedHeaderInScope()) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilNumberedHeaderPopped();
  }
}
function appletEndTagInBody(p, token) {
  const tn = token.tagID;
  if (p.openElements.hasInScope(tn)) {
    p.openElements.generateImpliedEndTags();
    p.openElements.popUntilTagNamePopped(tn);
    p.activeFormattingElements.clearToLastMarker();
  }
}
function brEndTagInBody(p) {
  p._reconstructActiveFormattingElements();
  p._insertFakeElement(TAG_NAMES.BR, TAG_ID.BR);
  p.openElements.pop();
  p.framesetOk = false;
}
function genericEndTagInBody(p, token) {
  const tn = token.tagName;
  const tid = token.tagID;
  for (let i = p.openElements.stackTop; i > 0; i--) {
    const element = p.openElements.items[i];
    const elementId = p.openElements.tagIDs[i];
    if (tid === elementId && (tid !== TAG_ID.UNKNOWN || p.treeAdapter.getTagName(element) === tn)) {
      p.openElements.generateImpliedEndTagsWithExclusion(tid);
      if (p.openElements.stackTop >= i)
        p.openElements.shortenToLength(i);
      break;
    }
    if (p._isSpecialElement(element, elementId)) {
      break;
    }
  }
}
function endTagInBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.A:
    case TAG_ID.B:
    case TAG_ID.I:
    case TAG_ID.S:
    case TAG_ID.U:
    case TAG_ID.EM:
    case TAG_ID.TT:
    case TAG_ID.BIG:
    case TAG_ID.CODE:
    case TAG_ID.FONT:
    case TAG_ID.NOBR:
    case TAG_ID.SMALL:
    case TAG_ID.STRIKE:
    case TAG_ID.STRONG: {
      callAdoptionAgency(p, token);
      break;
    }
    case TAG_ID.P: {
      pEndTagInBody(p);
      break;
    }
    case TAG_ID.DL:
    case TAG_ID.UL:
    case TAG_ID.OL:
    case TAG_ID.DIR:
    case TAG_ID.DIV:
    case TAG_ID.NAV:
    case TAG_ID.PRE:
    case TAG_ID.MAIN:
    case TAG_ID.MENU:
    case TAG_ID.ASIDE:
    case TAG_ID.BUTTON:
    case TAG_ID.CENTER:
    case TAG_ID.FIGURE:
    case TAG_ID.FOOTER:
    case TAG_ID.HEADER:
    case TAG_ID.HGROUP:
    case TAG_ID.DIALOG:
    case TAG_ID.ADDRESS:
    case TAG_ID.ARTICLE:
    case TAG_ID.DETAILS:
    case TAG_ID.SEARCH:
    case TAG_ID.SECTION:
    case TAG_ID.SUMMARY:
    case TAG_ID.LISTING:
    case TAG_ID.FIELDSET:
    case TAG_ID.BLOCKQUOTE:
    case TAG_ID.FIGCAPTION: {
      addressEndTagInBody(p, token);
      break;
    }
    case TAG_ID.LI: {
      liEndTagInBody(p);
      break;
    }
    case TAG_ID.DD:
    case TAG_ID.DT: {
      ddEndTagInBody(p, token);
      break;
    }
    case TAG_ID.H1:
    case TAG_ID.H2:
    case TAG_ID.H3:
    case TAG_ID.H4:
    case TAG_ID.H5:
    case TAG_ID.H6: {
      numberedHeaderEndTagInBody(p);
      break;
    }
    case TAG_ID.BR: {
      brEndTagInBody(p);
      break;
    }
    case TAG_ID.BODY: {
      bodyEndTagInBody(p, token);
      break;
    }
    case TAG_ID.HTML: {
      htmlEndTagInBody(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formEndTagInBody(p);
      break;
    }
    case TAG_ID.APPLET:
    case TAG_ID.OBJECT:
    case TAG_ID.MARQUEE: {
      appletEndTagInBody(p, token);
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default: {
      genericEndTagInBody(p, token);
    }
  }
}
function eofInBody(p, token) {
  if (p.tmplInsertionModeStack.length > 0) {
    eofInTemplate(p, token);
  } else {
    stopParsing(p, token);
  }
}
function endTagInText(p, token) {
  var _a;
  if (token.tagID === TAG_ID.SCRIPT) {
    (_a = p.scriptHandler) === null || _a === void 0 ? void 0 : _a.call(p, p.openElements.current);
  }
  p.openElements.pop();
  p.insertionMode = p.originalInsertionMode;
}
function eofInText(p, token) {
  p._err(token, ERR.eofInElementThatCanContainOnlyText);
  p.openElements.pop();
  p.insertionMode = p.originalInsertionMode;
  p.onEof(token);
}
function characterInTable(p, token) {
  if (p.openElements.currentTagId !== void 0 && TABLE_STRUCTURE_TAGS.has(p.openElements.currentTagId)) {
    p.pendingCharacterTokens.length = 0;
    p.hasNonWhitespacePendingCharacterToken = false;
    p.originalInsertionMode = p.insertionMode;
    p.insertionMode = InsertionMode.IN_TABLE_TEXT;
    switch (token.type) {
      case TokenType.CHARACTER: {
        characterInTableText(p, token);
        break;
      }
      case TokenType.WHITESPACE_CHARACTER: {
        whitespaceCharacterInTableText(p, token);
        break;
      }
    }
  } else {
    tokenInTable(p, token);
  }
}
function captionStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p.activeFormattingElements.insertMarker();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_CAPTION;
}
function colgroupStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
}
function colStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertFakeElement(TAG_NAMES.COLGROUP, TAG_ID.COLGROUP);
  p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
  startTagInColumnGroup(p, token);
}
function tbodyStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertElement(token, NS.HTML);
  p.insertionMode = InsertionMode.IN_TABLE_BODY;
}
function tdStartTagInTable(p, token) {
  p.openElements.clearBackToTableContext();
  p._insertFakeElement(TAG_NAMES.TBODY, TAG_ID.TBODY);
  p.insertionMode = InsertionMode.IN_TABLE_BODY;
  startTagInTableBody(p, token);
}
function tableStartTagInTable(p, token) {
  if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
    p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
    p._resetInsertionMode();
    p._processStartTag(token);
  }
}
function inputStartTagInTable(p, token) {
  if (isHiddenInput(token)) {
    p._appendElement(token, NS.HTML);
  } else {
    tokenInTable(p, token);
  }
  token.ackSelfClosing = true;
}
function formStartTagInTable(p, token) {
  if (!p.formElement && p.openElements.tmplCount === 0) {
    p._insertElement(token, NS.HTML);
    p.formElement = p.openElements.current;
    p.openElements.pop();
  }
}
function startTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR: {
      tdStartTagInTable(p, token);
      break;
    }
    case TAG_ID.STYLE:
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    case TAG_ID.COL: {
      colStartTagInTable(p, token);
      break;
    }
    case TAG_ID.FORM: {
      formStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TABLE: {
      tableStartTagInTable(p, token);
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      tbodyStartTagInTable(p, token);
      break;
    }
    case TAG_ID.INPUT: {
      inputStartTagInTable(p, token);
      break;
    }
    case TAG_ID.CAPTION: {
      captionStartTagInTable(p, token);
      break;
    }
    case TAG_ID.COLGROUP: {
      colgroupStartTagInTable(p, token);
      break;
    }
    default: {
      tokenInTable(p, token);
    }
  }
}
function endTagInTable(p, token) {
  switch (token.tagID) {
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.TABLE)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.TABLE);
        p._resetInsertionMode();
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      break;
    }
    default: {
      tokenInTable(p, token);
    }
  }
}
function tokenInTable(p, token) {
  const savedFosterParentingState = p.fosterParentingEnabled;
  p.fosterParentingEnabled = true;
  modeInBody(p, token);
  p.fosterParentingEnabled = savedFosterParentingState;
}
function whitespaceCharacterInTableText(p, token) {
  p.pendingCharacterTokens.push(token);
}
function characterInTableText(p, token) {
  p.pendingCharacterTokens.push(token);
  p.hasNonWhitespacePendingCharacterToken = true;
}
function tokenInTableText(p, token) {
  let i = 0;
  if (p.hasNonWhitespacePendingCharacterToken) {
    for (; i < p.pendingCharacterTokens.length; i++) {
      tokenInTable(p, p.pendingCharacterTokens[i]);
    }
  } else {
    for (; i < p.pendingCharacterTokens.length; i++) {
      p._insertCharacters(p.pendingCharacterTokens[i]);
    }
  }
  p.insertionMode = p.originalInsertionMode;
  p._processToken(token);
}
var TABLE_VOID_ELEMENTS = /* @__PURE__ */ new Set([TAG_ID.CAPTION, TAG_ID.COL, TAG_ID.COLGROUP, TAG_ID.TBODY, TAG_ID.TD, TAG_ID.TFOOT, TAG_ID.TH, TAG_ID.THEAD, TAG_ID.TR]);
function startTagInCaption(p, token) {
  const tn = token.tagID;
  if (TABLE_VOID_ELEMENTS.has(tn)) {
    if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
      p.openElements.generateImpliedEndTags();
      p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
      p.activeFormattingElements.clearToLastMarker();
      p.insertionMode = InsertionMode.IN_TABLE;
      startTagInTable(p, token);
    }
  } else {
    startTagInBody(p, token);
  }
}
function endTagInCaption(p, token) {
  const tn = token.tagID;
  switch (tn) {
    case TAG_ID.CAPTION:
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.CAPTION)) {
        p.openElements.generateImpliedEndTags();
        p.openElements.popUntilTagNamePopped(TAG_ID.CAPTION);
        p.activeFormattingElements.clearToLastMarker();
        p.insertionMode = InsertionMode.IN_TABLE;
        if (tn === TAG_ID.TABLE) {
          endTagInTable(p, token);
        }
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TBODY:
    case TAG_ID.TD:
    case TAG_ID.TFOOT:
    case TAG_ID.TH:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      break;
    }
    default: {
      endTagInBody(p, token);
    }
  }
}
function startTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.COL: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default: {
      tokenInColumnGroup(p, token);
    }
  }
}
function endTagInColumnGroup(p, token) {
  switch (token.tagID) {
    case TAG_ID.COLGROUP: {
      if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    case TAG_ID.COL: {
      break;
    }
    default: {
      tokenInColumnGroup(p, token);
    }
  }
}
function tokenInColumnGroup(p, token) {
  if (p.openElements.currentTagId === TAG_ID.COLGROUP) {
    p.openElements.pop();
    p.insertionMode = InsertionMode.IN_TABLE;
    p._processToken(token);
  }
}
function startTagInTableBody(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      p.openElements.clearBackToTableBodyContext();
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_ROW;
      break;
    }
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableBodyContext();
      p._insertFakeElement(TAG_NAMES.TR, TAG_ID.TR);
      p.insertionMode = InsertionMode.IN_ROW;
      startTagInRow(p, token);
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasTableBodyContextInTableScope()) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
        startTagInTable(p, token);
      }
      break;
    }
    default: {
      startTagInTable(p, token);
    }
  }
}
function endTagInTableBody(p, token) {
  const tn = token.tagID;
  switch (token.tagID) {
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasInTableScope(tn)) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
      }
      break;
    }
    case TAG_ID.TABLE: {
      if (p.openElements.hasTableBodyContextInTableScope()) {
        p.openElements.clearBackToTableBodyContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE;
        endTagInTable(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH:
    case TAG_ID.TR: {
      break;
    }
    default: {
      endTagInTable(p, token);
    }
  }
}
function startTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TH:
    case TAG_ID.TD: {
      p.openElements.clearBackToTableRowContext();
      p._insertElement(token, NS.HTML);
      p.insertionMode = InsertionMode.IN_CELL;
      p.activeFormattingElements.insertMarker();
      break;
    }
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        startTagInTableBody(p, token);
      }
      break;
    }
    default: {
      startTagInTable(p, token);
    }
  }
}
function endTagInRow(p, token) {
  switch (token.tagID) {
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
      }
      break;
    }
    case TAG_ID.TABLE: {
      if (p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        endTagInTableBody(p, token);
      }
      break;
    }
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      if (p.openElements.hasInTableScope(token.tagID) || p.openElements.hasInTableScope(TAG_ID.TR)) {
        p.openElements.clearBackToTableRowContext();
        p.openElements.pop();
        p.insertionMode = InsertionMode.IN_TABLE_BODY;
        endTagInTableBody(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML:
    case TAG_ID.TD:
    case TAG_ID.TH: {
      break;
    }
    default: {
      endTagInTable(p, token);
    }
  }
}
function startTagInCell(p, token) {
  const tn = token.tagID;
  if (TABLE_VOID_ELEMENTS.has(tn)) {
    if (p.openElements.hasInTableScope(TAG_ID.TD) || p.openElements.hasInTableScope(TAG_ID.TH)) {
      p._closeTableCell();
      startTagInRow(p, token);
    }
  } else {
    startTagInBody(p, token);
  }
}
function endTagInCell(p, token) {
  const tn = token.tagID;
  switch (tn) {
    case TAG_ID.TD:
    case TAG_ID.TH: {
      if (p.openElements.hasInTableScope(tn)) {
        p.openElements.generateImpliedEndTags();
        p.openElements.popUntilTagNamePopped(tn);
        p.activeFormattingElements.clearToLastMarker();
        p.insertionMode = InsertionMode.IN_ROW;
      }
      break;
    }
    case TAG_ID.TABLE:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD:
    case TAG_ID.TR: {
      if (p.openElements.hasInTableScope(tn)) {
        p._closeTableCell();
        endTagInRow(p, token);
      }
      break;
    }
    case TAG_ID.BODY:
    case TAG_ID.CAPTION:
    case TAG_ID.COL:
    case TAG_ID.COLGROUP:
    case TAG_ID.HTML: {
      break;
    }
    default: {
      endTagInBody(p, token);
    }
  }
}
function startTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.OPTION: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.OPTGROUP: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.HR: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.INPUT:
    case TAG_ID.KEYGEN:
    case TAG_ID.TEXTAREA:
    case TAG_ID.SELECT: {
      if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
        p._resetInsertionMode();
        if (token.tagID !== TAG_ID.SELECT) {
          p._processStartTag(token);
        }
      }
      break;
    }
    case TAG_ID.SCRIPT:
    case TAG_ID.TEMPLATE: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInSelect(p, token) {
  switch (token.tagID) {
    case TAG_ID.OPTGROUP: {
      if (p.openElements.stackTop > 0 && p.openElements.currentTagId === TAG_ID.OPTION && p.openElements.tagIDs[p.openElements.stackTop - 1] === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      if (p.openElements.currentTagId === TAG_ID.OPTGROUP) {
        p.openElements.pop();
      }
      break;
    }
    case TAG_ID.OPTION: {
      if (p.openElements.currentTagId === TAG_ID.OPTION) {
        p.openElements.pop();
      }
      break;
    }
    case TAG_ID.SELECT: {
      if (p.openElements.hasInSelectScope(TAG_ID.SELECT)) {
        p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
        p._resetInsertionMode();
      }
      break;
    }
    case TAG_ID.TEMPLATE: {
      templateEndTagInHead(p, token);
      break;
    }
    default:
  }
}
function startTagInSelectInTable(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
    p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
    p._resetInsertionMode();
    p._processStartTag(token);
  } else {
    startTagInSelect(p, token);
  }
}
function endTagInSelectInTable(p, token) {
  const tn = token.tagID;
  if (tn === TAG_ID.CAPTION || tn === TAG_ID.TABLE || tn === TAG_ID.TBODY || tn === TAG_ID.TFOOT || tn === TAG_ID.THEAD || tn === TAG_ID.TR || tn === TAG_ID.TD || tn === TAG_ID.TH) {
    if (p.openElements.hasInTableScope(tn)) {
      p.openElements.popUntilTagNamePopped(TAG_ID.SELECT);
      p._resetInsertionMode();
      p.onEndTag(token);
    }
  } else {
    endTagInSelect(p, token);
  }
}
function startTagInTemplate(p, token) {
  switch (token.tagID) {
    // First, handle tags that can start without a mode change
    case TAG_ID.BASE:
    case TAG_ID.BASEFONT:
    case TAG_ID.BGSOUND:
    case TAG_ID.LINK:
    case TAG_ID.META:
    case TAG_ID.NOFRAMES:
    case TAG_ID.SCRIPT:
    case TAG_ID.STYLE:
    case TAG_ID.TEMPLATE:
    case TAG_ID.TITLE: {
      startTagInHead(p, token);
      break;
    }
    // Re-process the token in the appropriate mode
    case TAG_ID.CAPTION:
    case TAG_ID.COLGROUP:
    case TAG_ID.TBODY:
    case TAG_ID.TFOOT:
    case TAG_ID.THEAD: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE;
      p.insertionMode = InsertionMode.IN_TABLE;
      startTagInTable(p, token);
      break;
    }
    case TAG_ID.COL: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_COLUMN_GROUP;
      p.insertionMode = InsertionMode.IN_COLUMN_GROUP;
      startTagInColumnGroup(p, token);
      break;
    }
    case TAG_ID.TR: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_TABLE_BODY;
      p.insertionMode = InsertionMode.IN_TABLE_BODY;
      startTagInTableBody(p, token);
      break;
    }
    case TAG_ID.TD:
    case TAG_ID.TH: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_ROW;
      p.insertionMode = InsertionMode.IN_ROW;
      startTagInRow(p, token);
      break;
    }
    default: {
      p.tmplInsertionModeStack[0] = InsertionMode.IN_BODY;
      p.insertionMode = InsertionMode.IN_BODY;
      startTagInBody(p, token);
    }
  }
}
function endTagInTemplate(p, token) {
  if (token.tagID === TAG_ID.TEMPLATE) {
    templateEndTagInHead(p, token);
  }
}
function eofInTemplate(p, token) {
  if (p.openElements.tmplCount > 0) {
    p.openElements.popUntilTagNamePopped(TAG_ID.TEMPLATE);
    p.activeFormattingElements.clearToLastMarker();
    p.tmplInsertionModeStack.shift();
    p._resetInsertionMode();
    p.onEof(token);
  } else {
    stopParsing(p, token);
  }
}
function startTagAfterBody(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    startTagInBody(p, token);
  } else {
    tokenAfterBody(p, token);
  }
}
function endTagAfterBody(p, token) {
  var _a;
  if (token.tagID === TAG_ID.HTML) {
    if (!p.fragmentContext) {
      p.insertionMode = InsertionMode.AFTER_AFTER_BODY;
    }
    if (p.options.sourceCodeLocationInfo && p.openElements.tagIDs[0] === TAG_ID.HTML) {
      p._setEndLocation(p.openElements.items[0], token);
      const bodyElement = p.openElements.items[1];
      if (bodyElement && !((_a = p.treeAdapter.getNodeSourceCodeLocation(bodyElement)) === null || _a === void 0 ? void 0 : _a.endTag)) {
        p._setEndLocation(bodyElement, token);
      }
    }
  } else {
    tokenAfterBody(p, token);
  }
}
function tokenAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function startTagInFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.FRAMESET: {
      p._insertElement(token, NS.HTML);
      break;
    }
    case TAG_ID.FRAME: {
      p._appendElement(token, NS.HTML);
      token.ackSelfClosing = true;
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagInFrameset(p, token) {
  if (token.tagID === TAG_ID.FRAMESET && !p.openElements.isRootHtmlElementCurrent()) {
    p.openElements.pop();
    if (!p.fragmentContext && p.openElements.currentTagId !== TAG_ID.FRAMESET) {
      p.insertionMode = InsertionMode.AFTER_FRAMESET;
    }
  }
}
function startTagAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function endTagAfterFrameset(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    p.insertionMode = InsertionMode.AFTER_AFTER_FRAMESET;
  }
}
function startTagAfterAfterBody(p, token) {
  if (token.tagID === TAG_ID.HTML) {
    startTagInBody(p, token);
  } else {
    tokenAfterAfterBody(p, token);
  }
}
function tokenAfterAfterBody(p, token) {
  p.insertionMode = InsertionMode.IN_BODY;
  modeInBody(p, token);
}
function startTagAfterAfterFrameset(p, token) {
  switch (token.tagID) {
    case TAG_ID.HTML: {
      startTagInBody(p, token);
      break;
    }
    case TAG_ID.NOFRAMES: {
      startTagInHead(p, token);
      break;
    }
    default:
  }
}
function nullCharacterInForeignContent(p, token) {
  token.chars = REPLACEMENT_CHARACTER;
  p._insertCharacters(token);
}
function characterInForeignContent(p, token) {
  p._insertCharacters(token);
  p.framesetOk = false;
}
function popUntilHtmlOrIntegrationPoint(p) {
  while (p.treeAdapter.getNamespaceURI(p.openElements.current) !== NS.HTML && p.openElements.currentTagId !== void 0 && !p._isIntegrationPoint(p.openElements.currentTagId, p.openElements.current)) {
    p.openElements.pop();
  }
}
function startTagInForeignContent(p, token) {
  if (causesExit(token)) {
    popUntilHtmlOrIntegrationPoint(p);
    p._startTagOutsideForeignContent(token);
  } else {
    const current = p._getAdjustedCurrentElement();
    const currentNs = p.treeAdapter.getNamespaceURI(current);
    if (currentNs === NS.MATHML) {
      adjustTokenMathMLAttrs(token);
    } else if (currentNs === NS.SVG) {
      adjustTokenSVGTagName(token);
      adjustTokenSVGAttrs(token);
    }
    adjustTokenXMLAttrs(token);
    if (token.selfClosing) {
      p._appendElement(token, currentNs);
    } else {
      p._insertElement(token, currentNs);
    }
    token.ackSelfClosing = true;
  }
}
function endTagInForeignContent(p, token) {
  if (token.tagID === TAG_ID.P || token.tagID === TAG_ID.BR) {
    popUntilHtmlOrIntegrationPoint(p);
    p._endTagOutsideForeignContent(token);
    return;
  }
  for (let i = p.openElements.stackTop; i > 0; i--) {
    const element = p.openElements.items[i];
    if (p.treeAdapter.getNamespaceURI(element) === NS.HTML) {
      p._endTagOutsideForeignContent(token);
      break;
    }
    const tagName = p.treeAdapter.getTagName(element);
    if (tagName.toLowerCase() === token.tagName) {
      token.tagName = tagName;
      p.openElements.shortenToLength(i);
      break;
    }
  }
}

// node_modules/entities/dist/escape.js
var getCodePoint = typeof String.prototype.codePointAt === "function" ? (input, index) => input.codePointAt(index) : (
  // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
  (c, index) => (c.charCodeAt(index) & 64512) === 55296 ? (c.charCodeAt(index) - 55296) * 1024 + c.charCodeAt(index + 1) - 56320 + 65536 : c.charCodeAt(index)
);
function getEscaper(regex, map) {
  return function escape(data) {
    let match;
    let lastIndex = 0;
    let result = "";
    while (match = regex.exec(data)) {
      if (lastIndex !== match.index) {
        result += data.substring(lastIndex, match.index);
      }
      result += map.get(match[0].charCodeAt(0));
      lastIndex = match.index + 1;
    }
    return result + data.substring(lastIndex);
  };
}
var escapeAttribute = /* @__PURE__ */ getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
  [34, "&quot;"],
  [38, "&amp;"],
  [160, "&nbsp;"]
]));
var escapeText = /* @__PURE__ */ getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
  [38, "&amp;"],
  [60, "&lt;"],
  [62, "&gt;"],
  [160, "&nbsp;"]
]));

// node_modules/parse5/dist/serializer/index.js
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  TAG_NAMES.AREA,
  TAG_NAMES.BASE,
  TAG_NAMES.BASEFONT,
  TAG_NAMES.BGSOUND,
  TAG_NAMES.BR,
  TAG_NAMES.COL,
  TAG_NAMES.EMBED,
  TAG_NAMES.FRAME,
  TAG_NAMES.HR,
  TAG_NAMES.IMG,
  TAG_NAMES.INPUT,
  TAG_NAMES.KEYGEN,
  TAG_NAMES.LINK,
  TAG_NAMES.META,
  TAG_NAMES.PARAM,
  TAG_NAMES.SOURCE,
  TAG_NAMES.TRACK,
  TAG_NAMES.WBR
]);
function isVoidElement(node, options) {
  return options.treeAdapter.isElementNode(node) && options.treeAdapter.getNamespaceURI(node) === NS.HTML && VOID_ELEMENTS.has(options.treeAdapter.getTagName(node));
}
var defaultOpts = { treeAdapter: defaultTreeAdapter, scriptingEnabled: true };
function serialize(node, options) {
  const opts = { ...defaultOpts, ...options };
  if (isVoidElement(node, opts)) {
    return "";
  }
  return serializeChildNodes(node, opts);
}
function serializeChildNodes(parentNode, options) {
  let html = "";
  const container = options.treeAdapter.isElementNode(parentNode) && options.treeAdapter.getTagName(parentNode) === TAG_NAMES.TEMPLATE && options.treeAdapter.getNamespaceURI(parentNode) === NS.HTML ? options.treeAdapter.getTemplateContent(parentNode) : parentNode;
  const childNodes = options.treeAdapter.getChildNodes(container);
  if (childNodes) {
    for (const currentNode of childNodes) {
      html += serializeNode(currentNode, options);
    }
  }
  return html;
}
function serializeNode(node, options) {
  if (options.treeAdapter.isElementNode(node)) {
    return serializeElement(node, options);
  }
  if (options.treeAdapter.isTextNode(node)) {
    return serializeTextNode(node, options);
  }
  if (options.treeAdapter.isCommentNode(node)) {
    return serializeCommentNode(node, options);
  }
  if (options.treeAdapter.isDocumentTypeNode(node)) {
    return serializeDocumentTypeNode(node, options);
  }
  return "";
}
function serializeElement(node, options) {
  const tn = options.treeAdapter.getTagName(node);
  return `<${tn}${serializeAttributes(node, options)}>${isVoidElement(node, options) ? "" : `${serializeChildNodes(node, options)}</${tn}>`}`;
}
function serializeAttributes(node, { treeAdapter }) {
  let html = "";
  for (const attr of treeAdapter.getAttrList(node)) {
    html += " ";
    if (attr.namespace) {
      switch (attr.namespace) {
        case NS.XML: {
          html += `xml:${attr.name}`;
          break;
        }
        case NS.XMLNS: {
          if (attr.name !== "xmlns") {
            html += "xmlns:";
          }
          html += attr.name;
          break;
        }
        case NS.XLINK: {
          html += `xlink:${attr.name}`;
          break;
        }
        default: {
          html += `${attr.prefix}:${attr.name}`;
        }
      }
    } else {
      html += attr.name;
    }
    html += `="${escapeAttribute(attr.value)}"`;
  }
  return html;
}
function serializeTextNode(node, options) {
  const { treeAdapter } = options;
  const content = treeAdapter.getTextNodeContent(node);
  const parent = treeAdapter.getParentNode(node);
  const parentTn = parent && treeAdapter.isElementNode(parent) && treeAdapter.getTagName(parent);
  return parentTn && treeAdapter.getNamespaceURI(parent) === NS.HTML && hasUnescapedText(parentTn, options.scriptingEnabled) ? content : escapeText(content);
}
function serializeCommentNode(node, { treeAdapter }) {
  return `<!--${treeAdapter.getCommentNodeContent(node)}-->`;
}
function serializeDocumentTypeNode(node, { treeAdapter }) {
  return `<!DOCTYPE ${treeAdapter.getDocumentTypeNodeName(node)}>`;
}

// node_modules/parse5/dist/index.js
function parse(html, options) {
  return Parser.parse(html, options);
}

// page.ts
var PAGE_FILENAME = "thread-page.html";
var MAX_PAGE_BYTES = 5 * 1024 * 1024;
var VIEWER_TOKEN_TTL_MS = 2 * 60 * 60 * 1e3;
var UPLOAD_DIRNAME = "thread-page-uploads";
var MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
function safeUploadName(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 80) || "upload";
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
var CONFIRMATION_TTL_MS = 2 * 60 * 1e3;
function signConfirmationChallenge(payload, key) {
  const encoded = encodeJson(payload);
  const signature = createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
  return `${encoded}.${signature}`;
}
function isConfirmationChallenge(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value;
  return payload.v === 2 && payload.scope === "confirm" && typeof payload.threadId === "string" && /^[A-Za-z0-9_-]{3,128}$/.test(payload.threadId) && typeof payload.pageHash === "string" && /^[a-f0-9]{64}$/.test(payload.pageHash) && typeof payload.requestId === "string" && payload.requestId.length > 0 && payload.requestId.length <= 96 && typeof payload.method === "string" && payload.method.length > 0 && payload.method.length <= 96 && typeof payload.paramsHash === "string" && /^[a-f0-9]{64}$/.test(payload.paramsHash) && typeof payload.summary === "string" && payload.summary.length > 0 && payload.summary.length <= 512 && typeof payload.iat === "number" && Number.isSafeInteger(payload.iat) && typeof payload.exp === "number" && Number.isSafeInteger(payload.exp) && payload.iat <= now + 3e4 && payload.exp > now && payload.exp > payload.iat && payload.exp - payload.iat <= CONFIRMATION_TTL_MS;
}
function verifyConfirmationChallenge(token, key, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, suppliedSignature] = parts;
  try {
    const expected = createHmac("sha256", key).update(encoded, "ascii").digest();
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (supplied.byteLength !== expected.byteLength) return null;
    if (supplied.toString("base64url") !== suppliedSignature) return null;
    if (!timingSafeEqual(supplied, expected)) return null;
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    return isConfirmationChallenge(decoded, now) ? decoded : null;
  } catch {
    return null;
  }
}
function etagForHash(hash) {
  return `"${hash}"`;
}
function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function signPageToken(payload, key) {
  const encoded = encodeJson(payload);
  const signature = createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
  return `${encoded}.${signature}`;
}
function isPageTokenPayload(value, expectedScope, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value;
  return payload.v === 2 && payload.scope === expectedScope && typeof payload.threadId === "string" && /^[A-Za-z0-9_-]{3,128}$/.test(payload.threadId) && typeof payload.pageHash === "string" && /^[a-f0-9]{64}$/.test(payload.pageHash) && typeof payload.iat === "number" && Number.isSafeInteger(payload.iat) && typeof payload.exp === "number" && Number.isSafeInteger(payload.exp) && payload.iat <= now + 3e4 && payload.exp > now && payload.exp > payload.iat && payload.exp - payload.iat <= VIEWER_TOKEN_TTL_MS;
}
function verifyPageToken(token, key, expectedScope, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, suppliedSignature] = parts;
  try {
    const expected = createHmac("sha256", key).update(encoded, "ascii").digest();
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (supplied.byteLength !== expected.byteLength) return null;
    if (supplied.toString("base64url") !== suppliedSignature) return null;
    if (!timingSafeEqual(supplied, expected)) return null;
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    return isPageTokenPayload(decoded, expectedScope, now) ? decoded : null;
  } catch {
    return null;
  }
}
function jsonForInlineScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
var DOCUMENT_CSS = String.raw`
:root{color-scheme:light dark;--bg:#f7f7f5;--surface:#fff;--ink:#191a1d;--muted:#656a73;--line:#dedfe2;--accent:#315fc5;--warn:#a54312;font:16px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#ececef;--muted:#a7abb3;--line:#30333a;--accent:#91aff1;--warn:#efa879}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink)}.thread-page{width:min(100% - 2rem,46rem);margin:0 auto;padding:clamp(2rem,7vw,5rem) 0 7rem}header{padding-bottom:1.5rem;margin-bottom:2rem;border-bottom:1px solid var(--line)}h1,h2,h3{line-height:1.2;text-wrap:balance}h1{margin:0;font-size:clamp(1.8rem,6vw,2.6rem);letter-spacing:-.025em}h2{margin-top:2.5rem}p,li{color:var(--muted)}a{color:var(--accent)}img,video,canvas,svg{max-width:100%;height:auto}pre{overflow:auto;padding:1rem;border:1px solid var(--line);border-radius:.65rem;background:var(--surface)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}blockquote{margin-left:0;padding-left:1rem;border-left:3px solid var(--line)}.card,form{margin-top:1.5rem;padding:1.15rem;border:1px solid var(--line);border-radius:.75rem;background:var(--surface)}.needs-you{border-left:3px solid var(--warn);padding-left:1rem}.stale{margin:0 0 1.25rem;padding:.8rem 1rem;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:.65rem;color:var(--warn);background:color-mix(in srgb,var(--warn) 8%,var(--surface))}form>*+*{margin-top:1rem}fieldset{padding:0;border:0}legend,label{display:block;font-weight:600}label+label{margin-top:.65rem}label:has(>input[type=radio]),label:has(>input[type=checkbox]){display:flex;gap:.55rem;font-weight:400;color:var(--muted)}input,textarea,select,button{font:inherit}input[type=text],input[type=email],input[type=url],input[type=number],textarea,select{display:block;width:100%;margin-top:.4rem;padding:.55rem .65rem;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:.45rem}textarea{resize:vertical}button{padding:.55rem .85rem;border:1px solid var(--line);border-radius:.45rem;color:white;background:var(--accent);cursor:pointer}button+button{margin-left:.4rem}button:disabled,input:disabled,textarea:disabled,select:disabled{opacity:.55;cursor:not-allowed}[data-thread-page-status]{min-height:1.4em;margin:.75rem 0 0;font-size:.9rem;color:var(--muted)}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-thread-page-range]{display:inline-block;min-width:2.5rem;margin-left:.6rem;color:var(--ink);font-variant-numeric:tabular-nums}
.thread-page{width:min(calc(100% - 2rem),46rem);overflow-wrap:anywhere}
`;
var DOCUMENT_RUNTIME = String.raw`
const config=__THREAD_PAGE_CONFIG__;
const bridgeErrorCodes=new Set(["invalid_json","request_too_large","response_too_large","invalid_request","invalid_response","unsupported_version","unknown_method","invalid_params","stale_page","confirmation_required","confirmation_invalid","not_found","conflict","unavailable","cancelled","rate_limited","handler_error","invalid_result"]);
let dirty=false;
let customDirty=false;
let dirtySequence=0;
const dirtyFormVersions=new Map();
let bridgePort=null;
let requestSequence=0;
const pendingInvocations=new Map();
const queuedInvocationIds=[];
const pendingFormsById=new Map();
const pendingForms=new WeakSet();
const preparedRanges=new WeakSet();
let readOnly=Boolean(config.stale);
const sourceDisabled=new WeakSet();
function makeBridgeError(code,message){const error=new Error(message);error.name="ThreadPageBridgeError";Object.defineProperty(error,"code",{value:code,enumerable:true});return error}
function requestId(){requestSequence+=1;const random=globalThis.crypto&&typeof globalThis.crypto.randomUUID==="function"?globalThis.crypto.randomUUID():String(Date.now())+"-"+requestSequence;return "tp-"+random}
function exactKeys(value,wanted){if(!value||typeof value!=="object"||Array.isArray(value))return false;const keys=Object.keys(value);return keys.length===wanted.length&&wanted.every(function(key){return Object.prototype.hasOwnProperty.call(value,key)})}
function strictBridgeResponse(value){if(!value||typeof value!=="object"||Array.isArray(value)||value.v!==1||typeof value.id!=="string"||typeof value.ok!=="boolean")return false;if(value.ok===true)return exactKeys(value,["v","id","ok","result"]);return exactKeys(value,["v","id","ok","error"])&&exactKeys(value.error,["code","message"])&&bridgeErrorCodes.has(value.error.code)&&typeof value.error.message==="string"&&value.error.message.length>0&&value.error.message.length<=512}
function postPort(value){if(!bridgePort)return false;bridgePort.postMessage(value);return true}
function sendInvocation(id){const pending=pendingInvocations.get(id);if(!pending)return;try{postPort(pending.request)}catch(error){pendingInvocations.delete(id);pending.reject(makeBridgeError("invalid_request",error instanceof Error?error.message:"The request could not be sent"))}}
function flushInvocations(){while(queuedInvocationIds.length){const id=queuedInvocationIds.shift();if(id)sendInvocation(id)}}
function invoke(method,params){return new Promise(function(resolve,reject){const id=requestId();const request={v:1,id:id,method:method,params:params===undefined?null:params,pageRevision:config.pageRevision};pendingInvocations.set(id,{request:request,resolve:resolve,reject:reject});if(bridgePort)sendInvocation(id);else queuedInvocationIds.push(id)})}
function watch(method,params,listener,options){if(typeof listener!=="function")throw new TypeError("Thread Page watch needs a listener");const requested=options&&options.intervalMs;const interval=Number.isFinite(requested)?Math.max(2000,Math.min(300000,Math.round(requested))):8000;let stopped=false;let timer=null;let running=false;function schedule(delay){if(stopped)return;if(timer!==null)clearTimeout(timer);timer=setTimeout(tick,delay)}async function tick(){timer=null;if(stopped||running||document.visibilityState==="hidden")return;running=true;try{const value=await invoke(method,params);if(!stopped)listener(value,null)}catch(error){if(!stopped)listener(undefined,error)}finally{running=false;if(!stopped)schedule(interval)}}function visible(){if(stopped)return;if(document.visibilityState==="hidden"){if(timer!==null)clearTimeout(timer);timer=null}else schedule(0)}document.addEventListener("visibilitychange",visible);schedule(0);return function(){if(stopped)return;stopped=true;if(timer!==null)clearTimeout(timer);timer=null;document.removeEventListener("visibilitychange",visible)}}
function sendControl(kind,extra){if(!bridgePort)return false;try{bridgePort.postMessage(Object.assign({kind:kind},extra||{}));return true}catch{return false}}
function syncDirty(){const next=customDirty||dirtyFormVersions.size>0;if(next===dirty)return;dirty=next;sendControl(next?"thread-page:dirty":"thread-page:clean")}
function setDirty(next){customDirty=next!==false;syncDirty()}
function assetUrl(name){if(!config.assetBase)throw new Error("Thread Page assets are unavailable");const safe=String(name==null?"":name).replace(/^\.\//,"");if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(safe)||safe.includes(".."))throw new TypeError("Thread Page asset names may only use letters, digits, dot, dash, and underscore, with no path segments");return config.assetBase+encodeURIComponent(safe)}
const threadPage=Object.freeze({version:1,invoke:invoke,watch:watch,setDirty:setDirty,assetUrl:assetUrl});
Object.defineProperty(window,"threadPage",{value:threadPage,writable:false,configurable:false,enumerable:true});
function statusFor(form){let node=form.querySelector("[data-thread-page-status]");if(!node){node=document.createElement("p");node.setAttribute("data-thread-page-status","");node.setAttribute("role","status");form.appendChild(node)}return node}
// The text of an element minus anything nested that is not part of the question:
// controls it wraps, hints, and plugin-injected nodes. A label that wraps its own
// input ("How deep? <input>") must read as just the question, and a <select>'s
// option text must never become part of its name.
function labelText(node){if(!node||typeof node.cloneNode!=="function")return "";const clone=node.cloneNode(true);if(typeof clone.querySelectorAll==="function"){Array.prototype.forEach.call(clone.querySelectorAll("input,textarea,select,button,option,small,output,[data-thread-page-range],[data-thread-page-status]"),function(element){element.remove()})}return String(clone.textContent||"").replace(/\s+/g," ").trim()}
function labelFor(form,name,group){const control=group&&group[0]||Array.from(form.elements).find(function(item){return item&&item.name===name});if(!control)return name;const explicitLabel=control.dataset&&control.dataset.label;if(explicitLabel)return String(explicitLabel).trim();const fieldset=control.closest&&control.closest("fieldset");if(fieldset){const legend=fieldset.querySelector("legend");const legendText=labelText(legend);if(legendText)return legendText}const aria=control.getAttribute&&control.getAttribute("aria-label");if(aria)return aria.trim();const wrapped=control.closest&&control.closest("label");if(wrapped){const wrappedText=labelText(wrapped);if(wrappedText)return wrappedText}if(control.id){const explicit=Array.from(document.querySelectorAll("label[for]")).find(function(label){return label.htmlFor===control.id});const forText=labelText(explicit);if(forText)return forText}return name}
function collect(form,submitter){const controls=Array.from(form.elements).filter(function(item){return item&&typeof item.name==="string"&&item.name&&!item.disabled});const answers=[];const seen=new Set();if(submitter){const actionValue=submitter.value||submitter.textContent.trim();answers.push({name:submitter.name||"action",label:"Action",value:actionValue});if(submitter.name)seen.add(submitter.name)}for(const control of controls){const name=control.name;const type=String(control.type||"").toLowerCase();if(seen.has(name)||["button","submit","reset","image","file"].includes(type))continue;seen.add(name);const group=controls.filter(function(item){return item.name===name});let value;if(type==="checkbox"){value=group.length===1?Boolean(control.checked):group.filter(function(item){return item.checked}).map(function(item){return item.value})}else if(type==="radio"){const checked=group.find(function(item){return item.checked});value=checked?checked.value:""}else if(control instanceof HTMLSelectElement&&control.multiple){value=Array.from(control.selectedOptions).map(function(option){return option.value})}else if(group.length>1){value=group.map(function(item){return String(item.value||"")})}else{value=String(control.value||"")}answers.push({name:name,label:labelFor(form,name,group),value:value})}return answers}
function syncOfflineBanner(){if(!document.body)return;let banner=document.querySelector("[data-thread-page-offline=plugin]");if(readOnly&&!banner){banner=document.createElement("aside");banner.setAttribute("data-thread-page-offline","plugin");banner.setAttribute("role","status");banner.setAttribute("style","position:relative;z-index:2147483647;margin:0;padding:.75rem 1rem;border-bottom:1px solid currentColor;font:600 14px/1.4 system-ui;background:Canvas;color:CanvasText");banner.textContent="Offline copy — responses are disabled until the source host reconnects.";document.body.insertBefore(banner,document.body.firstChild)}else if(!readOnly&&banner){banner.remove()}}
function matches(root,selector){return root&&typeof root.matches==="function"&&root.matches(selector)}
function descendants(root,selector){return root&&typeof root.querySelectorAll==="function"?Array.from(root.querySelectorAll(selector)):[]}
function formsIn(root){const forms=descendants(root,"form");if(matches(root,"form"))forms.unshift(root);return forms}
function isManualForm(form){return Boolean(form&&typeof form.hasAttribute==="function"&&form.hasAttribute("data-thread-page-manual"))}
function autoFormsIn(root){return formsIn(root).filter(function(form){return !isManualForm(form)})}
function controlsIn(root){const selector="form input,form textarea,form select,form button";const controls=descendants(root,selector);if(matches(root,selector))controls.unshift(root);return controls}
function prepareRanges(form){descendants(form,'input[type="range"]').forEach(function(input){if(preparedRanges.has(input))return;preparedRanges.add(input);const output=document.createElement("output");output.setAttribute("data-thread-page-range","");const sync=function(){output.textContent=String(input.value)};input.addEventListener("input",sync);sync();input.insertAdjacentElement("afterend",output)})}
function prepareRoot(root){const forms=autoFormsIn(root);forms.forEach(function(form){form.noValidate=true;prepareRanges(form)});if(!readOnly)return;controlsIn(root).forEach(function(control){if(!control.disabled){sourceDisabled.add(control);control.disabled=true}});forms.forEach(function(form){statusFor(form).textContent="Offline copy — responses are disabled"})}
function applyReadOnly(next){readOnly=next;const forms=autoFormsIn(document);forms.forEach(function(form){form.noValidate=true});controlsIn(document).forEach(function(control){if(next){if(!control.disabled){sourceDisabled.add(control);control.disabled=true}}else if(sourceDisabled.has(control)){sourceDisabled.delete(control);control.disabled=false}});forms.forEach(function(form){const status=statusFor(form);if(next)status.textContent="Offline copy — responses are disabled";else if(status.textContent==="Offline copy — responses are disabled")status.textContent=""});syncOfflineBanner()}
function initialize(){prepareRoot(document);syncOfflineBanner()}
initialize();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});
if(typeof MutationObserver==="function"&&document.documentElement){const observer=new MutationObserver(function(records){records.forEach(function(record){Array.from(record.addedNodes||[]).forEach(prepareRoot)});syncOfflineBanner()});observer.observe(document.documentElement,{childList:true,subtree:true})}
function markFormDirty(event){const target=event&&event.target;const form=target&&typeof target.closest==="function"?target.closest("form"):null;if(!form||isManualForm(form))return;dirtySequence+=1;dirtyFormVersions.set(form,dirtySequence);syncDirty()}
document.addEventListener("input",markFormDirty,true);
document.addEventListener("change",markFormDirty,true);
function filesIn(form){const out=[];descendants(form,'input[type="file"]').forEach(function(input){if(input.disabled)return;Array.prototype.forEach.call(input.files||[],function(file){if(out.length<8)out.push({field:input.name||"file",file:file})})});return out}
document.addEventListener("submit",function(event){const form=event.target;if(!(form instanceof HTMLFormElement)||isManualForm(form))return;event.preventDefault();if(readOnly||pendingForms.has(form))return;const submissionId=requestId();const buttons=Array.from(form.querySelectorAll("button")).filter(function(button){return !button.disabled});const formVersion=dirtyFormVersions.get(form);pendingFormsById.set(submissionId,{form:form,buttons:buttons,formVersion:formVersion});pendingForms.add(form);const answers=collect(form,event.submitter);const files=filesIn(form);buttons.forEach(function(button){button.disabled=true});statusFor(form).textContent=files.length?"Uploading…":"Sending…";const heading=document.querySelector("h1");if(!sendControl("thread-page:submit",{submissionId:submissionId,pageHash:config.pageRevision,title:form.dataset.title||(heading?heading.textContent.trim():"Thread Page"),answers:answers,files:files})){pendingFormsById.delete(submissionId);pendingForms.delete(form);statusFor(form).textContent="Page connection is not ready";buttons.forEach(function(button){button.disabled=false})}},true);
function onPortMessage(event){const data=event&&event.data;if(!data||typeof data!=="object")return;if(data.kind==="thread-page:source-state"){applyReadOnly(Boolean(data.stale));return}if(data.kind==="thread-page:submit-progress"){const progressForm=pendingFormsById.get(data.submissionId);if(progressForm)statusFor(progressForm.form).textContent=String(data.message||"Working…").slice(0,120);return}if(data.kind==="thread-page:submit-result"){const pendingForm=pendingFormsById.get(data.submissionId);if(!pendingForm)return;pendingFormsById.delete(data.submissionId);pendingForms.delete(pendingForm.form);statusFor(pendingForm.form).textContent=data.ok?(data.message||"Sent"):(data.error||"Could not send");pendingForm.buttons.forEach(function(button){if(readOnly)sourceDisabled.add(button);else button.disabled=false});if(data.ok&&dirtyFormVersions.get(pendingForm.form)===pendingForm.formVersion){dirtyFormVersions.delete(pendingForm.form);syncDirty()}return}const possibleId=typeof data.id==="string"?data.id:"";const pending=pendingInvocations.get(possibleId);if(!pending)return;pendingInvocations.delete(possibleId);if(!strictBridgeResponse(data)){pending.reject(makeBridgeError("invalid_response","The Thread Page bridge returned an invalid response"));return}if(data.ok)pending.resolve(data.result);else pending.reject(makeBridgeError(data.error.code,data.error.message))}
function acceptPort(event){if(bridgePort||event.source!==parent||!event.data||event.data.kind!=="thread-page:connect"||event.data.version!==1||!event.ports||event.ports.length!==1)return;if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();bridgePort=event.ports[0];bridgePort.onmessage=onPortMessage;if(typeof bridgePort.start==="function")bridgePort.start();flushInvocations();if(dirty)sendControl("thread-page:dirty")}
window.addEventListener("message",acceptPort,true);
if(readOnly)applyReadOnly(true);
parent.postMessage({kind:"thread-page:ready",version:1},"*");
`;
function directHtmlChild(parent, tagName) {
  for (const child of parent.childNodes) {
    if (defaultTreeAdapter.isElementNode(child) && child.tagName === tagName && child.namespaceURI === "http://www.w3.org/1999/xhtml") {
      return child;
    }
  }
  return null;
}
function parseAuthoredDocument(source) {
  const browserSource = source.charCodeAt(0) === 65279 ? source.slice(1) : source;
  const document = parse(browserSource, {
    scriptingEnabled: true,
    sourceCodeLocationInfo: true
  });
  const html = directHtmlChild(document, "html");
  if (!html) return null;
  const head = directHtmlChild(html, "head");
  const body = directHtmlChild(html, "body");
  const frameset = directHtmlChild(html, "frameset");
  const hasHtmlDoctype = document.childNodes.some(
    (child) => defaultTreeAdapter.isDocumentTypeNode(child) && child.name.toLowerCase() === "html"
  );
  const hasAuthoredShell = [html, head, body, frameset].some(
    (element) => element?.sourceCodeLocation != null
  );
  if (!hasHtmlDoctype && !hasAuthoredShell) return null;
  return { document, injectionParent: head ?? body ?? frameset ?? html };
}
function injectKernel(authored, runtime, nonce, assetBase) {
  const script = defaultTreeAdapter.createElement(
    "script",
    authored.injectionParent.namespaceURI,
    [
      { name: "data-thread-page-kernel", value: "" },
      { name: "nonce", value: nonce }
    ]
  );
  defaultTreeAdapter.insertText(script, runtime);
  const nodes = assetBase ? [
    defaultTreeAdapter.createElement(
      "base",
      authored.injectionParent.namespaceURI,
      [{ name: "href", value: assetBase }]
    ),
    script
  ] : [script];
  const anchor = defaultTreeAdapter.getFirstChild(authored.injectionParent);
  for (const node of nodes) {
    if (anchor) {
      defaultTreeAdapter.insertBefore(authored.injectionParent, node, anchor);
    } else {
      defaultTreeAdapter.appendChild(authored.injectionParent, node);
    }
  }
  return serialize(authored.document);
}
function renderDocument(options) {
  const config = jsonForInlineScript({
    pageRevision: options.pageHash,
    stale: options.stale,
    assetBase: options.assetBase ?? null
  });
  const runtime = DOCUMENT_RUNTIME.replace("__THREAD_PAGE_CONFIG__", config);
  const kernel = `<script data-thread-page-kernel nonce="${escapeHtml(options.nonce)}">${runtime}</script>`;
  const authoredDocument = parseAuthoredDocument(options.fragment);
  if (authoredDocument) {
    return injectKernel(
      authoredDocument,
      runtime,
      options.nonce,
      options.assetBase
    );
  }
  const staleBanner = options.stale ? '<aside class="stale" data-thread-page-offline="plugin" role="status"><strong>Offline copy.</strong> The source host is unavailable. This cached page is read-only until it reconnects.</aside>' : "";
  const base = options.assetBase ? `<base href="${escapeHtml(options.assetBase)}">
` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Thread Page</title>
${base}<style nonce="${escapeHtml(options.nonce)}">${DOCUMENT_CSS}</style>
${kernel}
</head>
<body>
<div class="thread-page">${staleBanner}${options.fragment}</div>
</body>
</html>`;
}
var OUTER_CSS = String.raw`
:root{color-scheme:light dark;font:14px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#f7f7f5;--surface:#fff;--ink:#17181b;--muted:#676c75;--line:#dfe0e3;--accent:#315fc5;--warn:#a54312} @media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#eeeef0;--muted:#a5a9b1;--line:#30333a;--accent:#91aff1;--warn:#efa879}}*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--ink)}.shell{display:grid;grid-template-rows:auto 1fr;height:100%;min-height:100dvh}.bar{display:flex;align-items:center;gap:.75rem;min-height:2.5rem;padding:.45rem max(.7rem,env(safe-area-inset-right)) .45rem max(.7rem,env(safe-area-inset-left));border-bottom:1px solid var(--line);background:var(--surface)}.home{flex:none;color:var(--muted);text-decoration:none;font-weight:600;white-space:nowrap}.home:hover{color:var(--ink)}.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.status{margin-left:auto;color:var(--muted);text-align:right}.status[data-tone=warn]{color:var(--warn)}
.work{flex:none;display:none;align-items:center;gap:.4rem;color:var(--muted)}.work[data-visible=true]{display:inline-flex}.work .dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--accent)}@media(prefers-reduced-motion:no-preference){.work[data-visible=true] .dot{animation:tp-pulse 1.4s ease-in-out infinite}}@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:.25}}button{display:none;padding:.25rem .55rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}button[data-visible=true]{display:inline-block}iframe{display:block;width:100%;height:100%;border:0;background:var(--bg)}
dialog{margin:auto;max-width:min(30rem,calc(100vw - 2rem));padding:1.15rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;color:var(--ink);background:var(--surface)}dialog::backdrop{background:rgb(0 0 0 / .45)}dialog h2{margin:0 0 .5rem;font-size:1rem}dialog p{margin:0 0 1rem;color:var(--muted);overflow-wrap:anywhere}dialog .row{display:flex;gap:.5rem;justify-content:flex-end}dialog button{display:inline-block}dialog button[value=confirm]{color:#fff;background:var(--accent);border-color:var(--accent)}
`;
var OUTER_RUNTIME = String.raw`
const config=__THREAD_PAGE_CONFIG__;
const frame=document.querySelector("iframe");
const status=document.querySelector(".status");
const reloadButton=document.querySelector("button");
const bridgeErrorCodes=new Set(["invalid_json","request_too_large","response_too_large","invalid_request","invalid_response","unsupported_version","unknown_method","invalid_params","stale_page","confirmation_required","confirmation_invalid","not_found","conflict","unavailable","cancelled","rate_limited","handler_error","invalid_result"]);
let dirty=false;
let etag='"'+config.pageRevision+'"';
let polling=false;
let stopped=false;
let lastStale=Boolean(config.stale);
let timer=null;
let controller=null;
let framePort=null;
let awaitingReady=true;
function setStatus(text,warn){status.textContent=text||"";status.dataset.tone=warn?"warn":""}
/* The page you are reading is whatever was last saved, so the useful sentence is
   not "loading" but that another version is coming. Driven by a header on the
   revision poll the shell already makes, so no page and no agent implements it. */
function setWorking(state){const strip=document.querySelector(".work");if(!strip)return;const label=strip.querySelector(".what");const working=state==="working"&&Boolean(config.workingLabel);strip.dataset.visible=working?"true":"false";if(label)label.textContent=config.workingLabel||""}
function exactKeys(value,wanted){if(!value||typeof value!=="object"||Array.isArray(value))return false;const keys=Object.keys(value);return keys.length===wanted.length&&wanted.every(function(key){return Object.prototype.hasOwnProperty.call(value,key)})}
function validId(value){return typeof value==="string"&&value.length>=1&&value.length<=96&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)}
function safeId(value){return validId(value)?value:"invalid"}
function failure(id,code,message){return {v:1,id:safeId(id),ok:false,error:{code:code,message:message}}}
function strictBridgeRequest(value){return exactKeys(value,["v","id","method","params","pageRevision"])&&value.v===1&&validId(value.id)&&typeof value.method==="string"&&value.method.length>=3&&value.method.length<=96&&/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/.test(value.method)&&typeof value.pageRevision==="string"&&value.pageRevision===config.pageRevision}
function strictBridgeResponse(value,id){if(!value||typeof value!=="object"||Array.isArray(value)||value.v!==1||value.id!==id||typeof value.ok!=="boolean")return false;if(value.ok===true)return exactKeys(value,["v","id","ok","result"]);return exactKeys(value,["v","id","ok","error"])&&exactKeys(value.error,["code","message"])&&bridgeErrorCodes.has(value.error.code)&&typeof value.error.message==="string"&&value.error.message.length>0&&value.error.message.length<=512}
function closeFramePort(){if(framePort&&typeof framePort.close==="function")framePort.close();framePort=null}
function navigateFrame(url){closeFramePort();awaitingReady=true;frame.src=url}
function reloadFrame(){dirty=false;reloadButton.dataset.visible="false";navigateFrame(config.documentUrl+(config.documentUrl.includes("?")?"&":"?")+"reload="+Date.now())}
function schedule(delay){if(timer!==null)clearTimeout(timer);timer=null;if(!stopped&&document.visibilityState==="visible")timer=setTimeout(function(){timer=null;void poll()},delay)}
function pause(){if(timer!==null)clearTimeout(timer);timer=null;if(controller){controller.abort();controller=null}}
reloadButton.addEventListener("click",function(){location.reload()});
/* Navigation belongs to the trusted shell: the sandboxed frame cannot reach
   top-level context, and these destinations are built here from an id the
   server has already validated, never from page-supplied markup or a URL. */
function navigateTo(port,request){const params=request.params;const id=params&&typeof params.threadId==="string"?params.threadId:"";if(!/^[A-Za-z0-9_-]{3,128}$/.test(id)){port.postMessage(failure(request.id,"invalid_params","A valid threadId is required"));return}const url=request.method==="threads.openPage"?config.pageUrlTemplate.replace("__THREAD__",encodeURIComponent(id)):config.bbThreadUrlTemplate.replace("__THREAD__",encodeURIComponent(id));try{window.open(url,"_blank","noopener");port.postMessage({v:1,id:request.id,ok:true,result:{opened:true}})}catch(error){port.postMessage(failure(request.id,"unavailable",error instanceof Error?error.message:"Could not open that destination"))}}
/* Leaving bb entirely needs a confirmation the page cannot word, and the URL is
   re-parsed here rather than trusted as a string. */
async function openExternal(port,request){const params=request.params;const raw=params&&typeof params.url==="string"?params.url:"";let target=null;try{target=new URL(raw)}catch{target=null}if(!target||(target.protocol!=="http:"&&target.protocol!=="https:")){port.postMessage(failure(request.id,"invalid_params","Only http and https destinations can be opened"));return}const label=params&&typeof params.label==="string"?params.label:"";const summary="Leave bb and open "+(label?'\u201c'+label.slice(0,80)+'\u201d at ':"")+target.origin;if(!await confirmInChrome(summary)){port.postMessage(failure(request.id,"cancelled","You declined this action"));return}try{window.open(target.href,"_blank","noopener,noreferrer");port.postMessage({v:1,id:request.id,ok:true,result:{opened:true}})}catch(error){port.postMessage(failure(request.id,"unavailable",error instanceof Error?error.message:"Could not open that destination"))}}
async function relayBridge(port,request){if(!strictBridgeRequest(request)){port.postMessage(failure(request&&request.id,"invalid_request","Invalid Thread Page bridge request"));return}if(request.method==="threads.openPage"||request.method==="threads.openBb"){navigateTo(port,request);return}if(request.method==="navigation.openExternal"){void openExternal(port,request);return}try{const response=await fetch(config.bridgeUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:config.actionToken,request:request})});const body=await response.json().catch(function(){return null});
/* The server answers a confirmed method with a signed challenge and its own
   summary. We show that summary, never the page's. */
if(response.status===401&&body&&body.confirm&&typeof body.confirm.challenge==="string"&&typeof body.confirm.summary==="string"&&body.confirm.requestId===request.id){await relayConfirmedBridge(port,request,body.confirm.challenge,body.confirm.summary);return}
port.postMessage(strictBridgeResponse(body,request.id)?body:failure(request.id,"invalid_response","The Thread Page bridge returned an invalid response"))}catch(error){port.postMessage(failure(request.id,"unavailable",error instanceof Error?error.message:"The Thread Page bridge is unavailable"))}}
const MAX_UPLOAD_BYTES=24*1024*1024;
// bb's local auth requires an application/json body on non-GET requests, which
// is what forces the CORS preflight. The bytes therefore travel base64-encoded
// inside a JSON envelope rather than as a raw body.
function encodeBase64(buffer){const bytes=new Uint8Array(buffer);let binary="";const chunk=0x8000;for(let index=0;index<bytes.length;index+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(index,index+chunk));return btoa(binary)}
async function uploadOne(entry){if(!(entry&&entry.file&&typeof entry.file.size==="number"))throw new Error("Attachment is not a file");if(entry.file.size<=0)throw new Error("Attachment "+(entry.file.name||"file")+" is empty");if(entry.file.size>MAX_UPLOAD_BYTES)throw new Error("Attachment "+(entry.file.name||"file")+" is larger than 24 MiB");const content=encodeBase64(await entry.file.arrayBuffer());const response=await fetch(config.uploadUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:config.actionToken,name:String(entry.file.name||"upload"),content:content})});const body=await response.json().catch(function(){return null});if(!response.ok||!body||body.ok!==true)throw new Error((body&&body.error)||"Upload failed ("+response.status+")");return {field:String(entry.field||"file").slice(0,128),name:body.name,path:body.path,sizeBytes:body.sizeBytes}}
async function uploadAll(port,data){const entries=Array.isArray(data.files)?data.files.slice(0,8):[];const files=[];for(let index=0;index<entries.length;index+=1){port.postMessage({kind:"thread-page:submit-progress",submissionId:data.submissionId,message:"Uploading "+(index+1)+" of "+entries.length+"\u2026"});files.push(await uploadOne(entries[index]))}return files}
async function relaySubmit(port,data){try{const files=await uploadAll(port,data);if(files.length)port.postMessage({kind:"thread-page:submit-progress",submissionId:data.submissionId,message:"Sending\u2026"});const response=await fetch(config.submitUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:config.actionToken,submissionId:data.submissionId,pageHash:config.pageRevision,title:data.title,answers:data.answers,files:files})});const body=await response.json().catch(function(){return {ok:false,error:"Invalid server response"}});port.postMessage({kind:"thread-page:submit-result",submissionId:data.submissionId,ok:response.ok&&body.ok===true,message:body.delivery?"Sent ("+body.delivery+")":"Sent",error:body.error||("Request failed ("+response.status+")")})}catch(error){port.postMessage({kind:"thread-page:submit-result",submissionId:data.submissionId,ok:false,error:error instanceof Error?error.message:"Request failed"})}}
/* A confirmed action is described by the server and shown here, in trusted
   chrome the sandboxed page cannot draw over, click, or reword. The page never
   supplies this text and never sees the challenge. */
function confirmInChrome(summary){return new Promise(function(resolve){const dialog=document.querySelector("dialog");const text=dialog.querySelector("p");text.textContent=summary;let settled=false;function finish(value){if(settled)return;settled=true;dialog.removeEventListener("close",onClose);resolve(value)}function onClose(){finish(dialog.returnValue==="confirm")}dialog.addEventListener("close",onClose);dialog.returnValue="";if(typeof dialog.showModal==="function")dialog.showModal();else finish(false)})}
async function relayConfirmedBridge(port,request,challenge,summary){const approved=await confirmInChrome(summary);if(!approved){port.postMessage(failure(request.id,"cancelled","You declined this action"));return}try{const response=await fetch(config.bridgeUrl,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({actionToken:config.actionToken,request:request,confirmation:challenge})});const body=await response.json().catch(function(){return null});port.postMessage(strictBridgeResponse(body,request.id)?body:failure(request.id,"invalid_response","The Thread Page bridge returned an invalid response"))}catch(error){port.postMessage(failure(request.id,"unavailable",error instanceof Error?error.message:"The Thread Page bridge is unavailable"))}}
function onFramePortMessage(port,event){const data=event&&event.data;if(!data||typeof data!=="object")return;if(data.kind==="thread-page:dirty"){dirty=true;return}if(data.kind==="thread-page:clean"){dirty=false;return}if(data.kind==="thread-page:submit"){void relaySubmit(port,data);return}void relayBridge(port,data)}
function connectFrame(){const channel=new MessageChannel();const port=channel.port1;framePort=port;port.onmessage=function(event){onFramePortMessage(port,event)};if(typeof port.start==="function")port.start();frame.contentWindow.postMessage({kind:"thread-page:connect",version:1},"*",[channel.port2]);port.postMessage({kind:"thread-page:source-state",stale:lastStale})}
window.addEventListener("message",function(event){if(!awaitingReady||event.origin!=="null"||event.source!==frame.contentWindow||!event.data||event.data.kind!=="thread-page:ready"||event.data.version!==1)return;awaitingReady=false;connectFrame()});
async function poll(){if(stopped||polling||document.visibilityState!=="visible")return;if(Date.now()>=config.expiresAt-30000){if(dirty){stopped=true;setStatus("Session expiring — reload when ready",true);reloadButton.dataset.visible="true"}else location.reload();return}polling=true;controller=new AbortController();try{const response=await fetch(config.documentUrl,{method:"GET",credentials:"same-origin",cache:"no-store",headers:{"if-none-match":etag},signal:controller.signal});if(response.status===401){stopped=true;setStatus("Session expired — reload this page",true);reloadButton.dataset.visible="true";return}if(!response.ok&&response.status!==304){setStatus("Page unavailable",true);return}const stale=response.headers.get("x-thread-page-stale")==="true";setWorking(response.headers.get("x-thread-page-activity"));const next=response.headers.get("etag");if(stale!==lastStale){lastStale=stale;if(framePort)framePort.postMessage({kind:"thread-page:source-state",stale:stale});if(!dirty)reloadFrame()}if(stale)setStatus("Offline copy — read-only",true);else setStatus("",false);if(next&&next!==etag){if(dirty){setStatus("Page changed — reload when ready",true);reloadButton.dataset.visible="true"}else location.reload()}etag=next||etag}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setStatus("Cannot check for updates",true)}finally{controller=null;polling=false;schedule(10000)}}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")schedule(0);else pause()});
navigateFrame(config.documentUrl);
schedule(10000);
`;
function renderOuterPage(options) {
  const config = jsonForInlineScript({
    actionToken: options.actionToken,
    pageRevision: options.pageHash,
    expiresAt: options.expiresAt,
    documentUrl: options.documentUrl,
    submitUrl: options.submitUrl,
    uploadUrl: options.uploadUrl,
    bridgeUrl: options.bridgeUrl,
    pageUrlTemplate: options.pageUrlTemplate,
    bbThreadUrlTemplate: options.bbThreadUrlTemplate,
    workingLabel: options.workingLabel,
    stale: options.stale
  });
  const runtime = OUTER_RUNTIME.replace("__THREAD_PAGE_CONFIG__", config);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(options.title)}</title>
<style nonce="${escapeHtml(options.nonce)}">${OUTER_CSS}</style>
</head>
<body>
<div class="shell">
  <header class="bar">
    ${options.homeUrl ? `<a class="home" href="${escapeHtml(options.homeUrl)}" title="All sessions">\u2190 Sessions</a>` : ""}
    <span class="title">${escapeHtml(options.title)}</span>
    <span class="work" role="status" data-visible="${options.working && options.workingLabel ? "true" : "false"}"><span class="dot" aria-hidden="true"></span><span class="what">${escapeHtml(options.workingLabel)}</span></span>
    <span class="status" role="status"${options.stale ? ' data-tone="warn"' : ""}>${options.stale ? "Offline copy \u2014 read-only" : ""}</span>
    <button type="button" aria-label="Reload updated page">Reload</button>
  </header>
  <iframe title="${escapeHtml(options.title)}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
</div>
<dialog aria-labelledby="tp-confirm-title">
  <form method="dialog">
    <h2 id="tp-confirm-title">Confirm this action</h2>
    <p></p>
    <div class="row">
      <button value="cancel">Cancel</button>
      <button value="confirm">Confirm</button>
    </div>
  </form>
</dialog>
<script nonce="${escapeHtml(options.nonce)}">${runtime}</script>
</body>
</html>`;
}
function formatSubmissionMessage(submission) {
  const heading = submission.title.trim() || "Thread Page";
  const fields = submission.answers.map((answer) => {
    const label = answer.label.trim() || answer.name;
    const value = Array.isArray(answer.value) ? answer.value.length > 0 ? answer.value.join(", ") : "(left blank)" : typeof answer.value === "boolean" ? answer.value ? "Yes" : "No" : answer.value.length > 0 ? answer.value : "(left blank)";
    return `**${label}**
${value}`;
  });
  const attachments = submission.files.length ? [
    [
      "**Attached files**",
      ...submission.files.map(
        (file) => `- \`$BB_THREAD_STORAGE/${file.path}\` (${file.name}, ${file.sizeBytes} bytes)`
      ),
      "Read them from thread storage with your normal tools."
    ].join("\n")
  ] : [];
  return [
    `The user answered the form on your Thread Page \u2014 ${heading}.`,
    ...fields,
    ...attachments
  ].join("\n\n");
}
function formatThreadReplyMessage(title2, result) {
  const heading = title2?.trim() || "Interactive response";
  const serialized = JSON.stringify(result, null, 2) ?? "null";
  let longestBacktickRun = 0;
  for (const match of serialized.matchAll(/`+/g)) {
    longestBacktickRun = Math.max(longestBacktickRun, match[0].length);
  }
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return [
    `The user sent an interactive response from your Thread Page \u2014 ${heading}.`,
    `**Result**

${fence}json
${serialized}
${fence}`
  ].join("\n\n");
}
function parseSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value;
  if (typeof input.actionToken !== "string" || input.actionToken.length > 4096 || typeof input.submissionId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(input.submissionId) || typeof input.pageHash !== "string" || !/^[a-f0-9]{64}$/.test(input.pageHash) || typeof input.title !== "string" || input.title.length > 300 || !Array.isArray(input.answers) || input.answers.length > 64) {
    return null;
  }
  let total = input.title.length;
  const answers = [];
  for (const raw of input.answers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const answer = raw;
    if (typeof answer.name !== "string" || answer.name.length > 128 || typeof answer.label !== "string" || answer.label.length > 300 || !isAnswerValue(answer.value)) {
      return null;
    }
    const valueLength = Array.isArray(answer.value) ? answer.value.reduce((sum, item) => sum + item.length, 0) : typeof answer.value === "string" ? answer.value.length : 1;
    total += answer.name.length + answer.label.length + valueLength;
    if (total > 32e3) return null;
    answers.push({
      name: answer.name,
      label: answer.label,
      value: answer.value
    });
  }
  const files = [];
  if (input.files !== void 0) {
    if (!Array.isArray(input.files) || input.files.length > 8) return null;
    for (const raw of input.files) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const file = raw;
      if (typeof file.field !== "string" || file.field.length > 128 || typeof file.name !== "string" || file.name.length > 80 || file.name !== safeUploadName(file.name) || typeof file.path !== "string" || file.path.length > 300 || !file.path.startsWith(`${UPLOAD_DIRNAME}/`) || file.path.includes("..") || typeof file.sizeBytes !== "number" || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_UPLOAD_BYTES) {
        return null;
      }
      files.push({
        field: file.field,
        name: file.name,
        path: file.path,
        sizeBytes: file.sizeBytes
      });
    }
  }
  return {
    actionToken: input.actionToken,
    submissionId: input.submissionId,
    pageHash: input.pageHash,
    title: input.title,
    answers,
    files
  };
}
function isAnswerValue(value) {
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 8e3;
  return Array.isArray(value) && value.length <= 64 && value.every((item) => typeof item === "string" && item.length <= 2e3);
}

// theme.ts
var THEME_CSS = String.raw`
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

// authoring.ts
var DEFAULT_AGENT_INSTRUCTION = `# The page is the conversation

The user does not read chat. Every turn you write or update one HTML page, they
read it and reply from inside it, and their answer arrives as your next message.
Everything they need must be on that page, and every action they might take must
be possible from it \u2014 including the ones you would rather they did not choose. A
page they cannot answer from is a dead end. Chat carries the link and one line.

Start every turn with \`bb thread-page init\`. It prints the page path and link.
Read an existing page before editing it; saving publishes it immediately and an
open page reloads itself. Update it on every turn, including small ones. If init
says SKIP this thread is a helper \u2014 answer in chat and stay off the page. When
you spawn threads of your own, parent them to yourself so they stay helpers.

## Every page ends with a way to answer

Any <form> is wired automatically: answers arrive as your next message. Write
plain semantic HTML \u2014 it is already styled, and there is nothing to remember.
<fieldset><legend> names a group, a wrapping <label> names one control, <small>
is a hint, and several <button name value> give one-click answers.

Asking well is most of the work. Answering should cost a click, not a paragraph:
buttons and radios for decisions, checkboxes for multi-select, free text only
where the answer is genuinely open. A range needs a scale that means something
and is easier to drag than to type \u2014 never a vague 1-to-5. Nothing is ever
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
back to it automatically \u2014 you never write that link yourself. Home is an
ordinary page: it should list the user's sessions with the threads.snapshot
capability and let them open, continue, or start one.

If the user asks for a home page, or asks where their sessions are, run
\`bb thread-page home\` in the thread that should own it and then build that page
against \`bb thread-page guide\`. Check whether one already exists before making
a second.

A page needing more than prose and a form \u2014 a chart, a branch, cards to swipe, a
file, live session control \u2014 runs \`bb thread-page guide\` first.`;
var DEFAULT_PAGE_SEED = `<!doctype html>
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
    @scope (main), and colour and shape from var(--token) only \u2014 never a hex.
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
function renderHomeSeed(template, now = /* @__PURE__ */ new Date()) {
  const base = renderPageSeed(template, "Sessions", now);
  const bodyStart = base.indexOf('  <header class="brief-head">');
  const bodyEnd = base.indexOf("  </div>\n</body>");
  if (bodyStart < 0 || bodyEnd < 0 || bodyEnd <= bodyStart) {
    return base;
  }
  return base.slice(0, bodyStart) + DEFAULT_HOME_BODY + `
  <style>${DEFAULT_HOME_STYLE}</style>
  <script>${DEFAULT_HOME_SCRIPT}</script>

` + base.slice(bodyEnd);
}
function renderPageSeed(template, title2, now = /* @__PURE__ */ new Date()) {
  const date = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return template.replaceAll("{{TITLE}}", escapeHtml(title2)).replaceAll("{{DATE}}", escapeHtml(date));
}
var AUTHORING_GUIDE = `# Thread Pages authoring guide

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
- CSS :has() for simple branches \u2014 real different content, not a hidden field.
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

  grep -o '#[0-9a-fA-F]{3,8}' page.html   # inside your <style>: empty
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
no page writes that link. Home is an ordinary page \u2014 give it whatever design
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

// bridge.ts
var BRIDGE_PROTOCOL_VERSION = 1;
var BRIDGE_MAX_ID_LENGTH = 96;
var BRIDGE_MAX_METHOD_LENGTH = 96;
var BRIDGE_MAX_PAGE_REVISION_LENGTH = 128;
var BRIDGE_MAX_SERIALIZED_BYTES = 64 * 1024;
var BRIDGE_MAX_JSON_DEPTH = 16;
var BRIDGE_MAX_JSON_NODES = 1e4;
var BRIDGE_MAX_CONFIRMATION_TTL_MS = 5 * 6e4;
var BRIDGE_MAX_STORAGE_VALUE_BYTES = 32 * 1024;
var MAX_ERROR_MESSAGE_LENGTH = 512;
var MAX_PROMPT_LENGTH = 32 * 1024;
var MAX_RESULT_TEXT_LENGTH = 64 * 1024;
var MAX_TITLE_LENGTH = 240;
var MAX_ITEMS = 200;
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
var METHOD_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
var ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
var OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]*$/;
var STORAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
var UNSAFE_OBJECT_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var BRIDGE_ERROR_CODES = [
  "invalid_json",
  "request_too_large",
  "response_too_large",
  "invalid_request",
  "invalid_response",
  "unsupported_version",
  "unknown_method",
  "invalid_params",
  "stale_page",
  "confirmation_required",
  "confirmation_invalid",
  "not_found",
  "conflict",
  "unavailable",
  "cancelled",
  "rate_limited",
  "handler_error",
  "invalid_result"
];
function valid(value) {
  return { ok: true, value };
}
function invalid(path, message, code = "invalid_value") {
  return { ok: false, issues: [{ code, path, message }] };
}
function contractFailure(code, message, issues) {
  return {
    ok: false,
    error: { code, message: boundedErrorMessage(message) },
    ...issues ? { issues } : {}
  };
}
function boundedErrorMessage(message) {
  const normalized = message.trim() || "Bridge request failed";
  return normalized.length <= MAX_ERROR_MESSAGE_LENGTH ? normalized : `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}\u2026`;
}
function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}
function pathForKey(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}
function isCanonicalArrayIndex(key, length) {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}
function validateJsonValue(input, limits = {}) {
  const maxBytes = limits.maxBytes ?? BRIDGE_MAX_SERIALIZED_BYTES;
  const maxDepth = limits.maxDepth ?? BRIDGE_MAX_JSON_DEPTH;
  const maxNodes = limits.maxNodes ?? BRIDGE_MAX_JSON_NODES;
  const ancestors = /* @__PURE__ */ new Set();
  let nodes = 0;
  function visit(value, path, depth) {
    nodes += 1;
    if (nodes > maxNodes) {
      return {
        code: "too_large",
        path,
        message: `JSON value exceeds ${maxNodes} nodes`
      };
    }
    if (depth > maxDepth) {
      return {
        code: "too_deep",
        path,
        message: `JSON value exceeds depth ${maxDepth}`
      };
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? null : {
        code: "not_json_safe",
        path,
        message: "JSON numbers must be finite"
      };
    }
    if (typeof value !== "object") {
      return {
        code: "not_json_safe",
        path,
        message: `Unsupported JSON value type: ${typeof value}`
      };
    }
    if (ancestors.has(value)) {
      return {
        code: "not_json_safe",
        path,
        message: "Cyclic values are not JSON-safe"
      };
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const keys = Reflect.ownKeys(value);
        for (const key of keys) {
          if (typeof key === "symbol") {
            return {
              code: "not_json_safe",
              path,
              message: "Symbol properties are not JSON-safe"
            };
          }
          if (key !== "length" && !isCanonicalArrayIndex(key, value.length)) {
            return {
              code: "not_json_safe",
              path: pathForKey(path, key),
              message: "Arrays may not have extra properties"
            };
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(value, index)) {
            return {
              code: "not_json_safe",
              path: `${path}[${index}]`,
              message: "Sparse arrays are not JSON-safe"
            };
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            return {
              code: "not_json_safe",
              path: `${path}[${index}]`,
              message: "Array entries must be enumerable data properties"
            };
          }
          const issue2 = visit(descriptor.value, `${path}[${index}]`, depth + 1);
          if (issue2) return issue2;
        }
        return null;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return {
          code: "not_json_safe",
          path,
          message: "Only plain objects are JSON-safe"
        };
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") {
          return {
            code: "not_json_safe",
            path,
            message: "Symbol properties are not JSON-safe"
          };
        }
        if (UNSAFE_OBJECT_KEYS.has(key)) {
          return {
            code: "not_json_safe",
            path: pathForKey(path, key),
            message: "Unsafe object key"
          };
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return {
            code: "not_json_safe",
            path: pathForKey(path, key),
            message: "Object entries must be enumerable data properties"
          };
        }
        const issue2 = visit(descriptor.value, pathForKey(path, key), depth + 1);
        if (issue2) return issue2;
      }
      return null;
    } catch {
      return {
        code: "not_json_safe",
        path,
        message: "Value could not be safely inspected"
      };
    } finally {
      ancestors.delete(value);
    }
  }
  const issue = visit(input, "$", 0);
  if (issue) return { ok: false, issues: [issue] };
  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return invalid("$", "Value could not be serialized as JSON", "not_json_safe");
  }
  if (utf8Bytes(serialized) > maxBytes) {
    return invalid(
      "$",
      `Serialized JSON exceeds ${maxBytes} bytes`,
      "too_large"
    );
  }
  return valid(JSON.parse(serialized));
}
function decodeJsonInput(input, sizeCode) {
  let parsed = input;
  if (typeof input === "string") {
    if (utf8Bytes(input) > BRIDGE_MAX_SERIALIZED_BYTES) {
      return contractFailure(sizeCode, "Bridge message is too large");
    }
    try {
      parsed = JSON.parse(input);
    } catch {
      return contractFailure("invalid_json", "Bridge message is not valid JSON");
    }
  }
  const json = validateJsonValue(parsed);
  if (!json.ok) {
    const tooLarge = json.issues.some((entry) => entry.code === "too_large");
    return contractFailure(
      tooLarge ? sizeCode : sizeCode === "request_too_large" ? "invalid_request" : "invalid_response",
      tooLarge ? "Bridge message is too large" : "Bridge message is not strict JSON",
      json.issues
    );
  }
  return { ok: true, value: json.value };
}
function asObject(value, allowed, required, path = "$") {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return invalid(path, "Expected an object", "invalid_type");
  }
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      return invalid(pathForKey(path, key), "Unknown key", "unknown_key");
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return invalid(pathForKey(path, key), "Missing required key", "missing_key");
    }
  }
  return valid(value);
}
function stringValue(value, path, options) {
  if (typeof value !== "string") {
    return invalid(path, "Expected a string", "invalid_type");
  }
  const min = options.min ?? 0;
  if (value.length < min || value.length > options.max) {
    return invalid(
      path,
      `${options.label ?? "String"} length must be ${min}\u2013${options.max}`,
      "too_large"
    );
  }
  if (options.pattern && !options.pattern.test(value)) {
    return invalid(path, `${options.label ?? "String"} has an invalid format`);
  }
  return valid(value);
}
function booleanValue(value, path) {
  return typeof value === "boolean" ? valid(value) : invalid(path, "Expected a boolean", "invalid_type");
}
function integerValue(value, path, min, max) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    return invalid(path, `Expected an integer from ${min} to ${max}`);
  }
  return valid(value);
}
function enumValue(value, path, values) {
  return typeof value === "string" && values.includes(value) ? valid(value) : invalid(path, `Expected one of: ${values.join(", ")}`);
}
function entityId(value, path) {
  return stringValue(value, path, {
    min: 1,
    max: 128,
    pattern: ENTITY_ID_PATTERN,
    label: "Entity id"
  });
}
function nullableEntityId(value, path) {
  return value === null ? valid(null) : entityId(value, path);
}
function opaqueToken(value, path, max = 512) {
  return stringValue(value, path, {
    min: 1,
    max,
    pattern: OPAQUE_TOKEN_PATTERN,
    label: "Opaque token"
  });
}
function jsonValidator(parser) {
  return (input) => {
    const json = validateJsonValue(input);
    return json.ok ? parser(json.value) : json;
  };
}
function noParams(value) {
  if (value === null) return valid(null);
  const object = asObject(value, [], []);
  return object.ok ? valid(null) : object;
}
function decodeBridgeRequest(input) {
  const decoded = decodeJsonInput(input, "request_too_large");
  if (!decoded.ok) return decoded;
  const object = asObject(
    decoded.value,
    ["v", "id", "method", "params", "pageRevision"],
    ["v", "id", "method", "params", "pageRevision"]
  );
  if (!object.ok) {
    return contractFailure("invalid_request", "Invalid bridge request envelope", object.issues);
  }
  const value = object.value;
  if (value.v !== BRIDGE_PROTOCOL_VERSION) {
    return contractFailure("unsupported_version", "Unsupported bridge protocol version");
  }
  const id = stringValue(value.id, "$.id", {
    min: 1,
    max: BRIDGE_MAX_ID_LENGTH,
    pattern: ID_PATTERN,
    label: "Request id"
  });
  if (!id.ok) return contractFailure("invalid_request", "Invalid request id", id.issues);
  const method = stringValue(value.method, "$.method", {
    min: 3,
    max: BRIDGE_MAX_METHOD_LENGTH,
    pattern: METHOD_PATTERN,
    label: "Method name"
  });
  if (!method.ok) {
    return contractFailure("invalid_request", "Invalid method name", method.issues);
  }
  const revision = stringValue(value.pageRevision, "$.pageRevision", {
    min: 1,
    max: BRIDGE_MAX_PAGE_REVISION_LENGTH,
    pattern: ID_PATTERN,
    label: "Page revision"
  });
  if (!revision.ok) {
    return contractFailure("invalid_request", "Invalid page revision", revision.issues);
  }
  return {
    ok: true,
    value: {
      v: 1,
      id: id.value,
      method: method.value,
      params: value.params,
      pageRevision: revision.value
    }
  };
}
function isBridgeErrorCode(value) {
  return typeof value === "string" && BRIDGE_ERROR_CODES.includes(value);
}
function decodeBridgeResponse(input) {
  const decoded = decodeJsonInput(input, "response_too_large");
  if (!decoded.ok) return decoded;
  if (decoded.value === null || Array.isArray(decoded.value) || typeof decoded.value !== "object") {
    return contractFailure("invalid_response", "Invalid bridge response envelope");
  }
  const okValue = decoded.value.ok;
  if (typeof okValue !== "boolean") {
    return contractFailure("invalid_response", "Response ok flag must be boolean");
  }
  const expected = okValue ? asObject(decoded.value, ["v", "id", "ok", "result"], ["v", "id", "ok", "result"]) : asObject(decoded.value, ["v", "id", "ok", "error"], ["v", "id", "ok", "error"]);
  if (!expected.ok) {
    return contractFailure("invalid_response", "Invalid bridge response envelope", expected.issues);
  }
  if (expected.value.v !== 1) {
    return contractFailure("unsupported_version", "Unsupported bridge protocol version");
  }
  const id = stringValue(expected.value.id, "$.id", {
    min: 1,
    max: BRIDGE_MAX_ID_LENGTH,
    pattern: ID_PATTERN,
    label: "Response id"
  });
  if (!id.ok) return contractFailure("invalid_response", "Invalid response id", id.issues);
  if (okValue) {
    return {
      ok: true,
      value: { v: 1, id: id.value, ok: true, result: expected.value.result }
    };
  }
  const errorObject = asObject(expected.value.error, ["code", "message"], ["code", "message"], "$.error");
  if (!errorObject.ok) {
    return contractFailure("invalid_response", "Invalid bridge error", errorObject.issues);
  }
  if (!isBridgeErrorCode(errorObject.value.code)) {
    return contractFailure("invalid_response", "Unknown bridge error code");
  }
  const message = stringValue(errorObject.value.message, "$.error.message", {
    min: 1,
    max: MAX_ERROR_MESSAGE_LENGTH,
    label: "Error message"
  });
  if (!message.ok) {
    return contractFailure("invalid_response", "Invalid bridge error message", message.issues);
  }
  return {
    ok: true,
    value: {
      v: 1,
      id: id.value,
      ok: false,
      error: { code: errorObject.value.code, message: message.value }
    }
  };
}
function safeResponseId(id) {
  return typeof id === "string" && id.length >= 1 && id.length <= BRIDGE_MAX_ID_LENGTH && ID_PATTERN.test(id) ? id : "invalid";
}
function makeBridgeFailureResponse(id, code, message) {
  return {
    v: 1,
    id: safeResponseId(id),
    ok: false,
    error: { code, message: boundedErrorMessage(message) }
  };
}
function encodeBridgeResponse(response) {
  const decoded = decodeBridgeResponse(response);
  if (!decoded.ok) return decoded;
  const serialized = JSON.stringify(decoded.value);
  if (utf8Bytes(serialized) > BRIDGE_MAX_SERIALIZED_BYTES) {
    return contractFailure("response_too_large", "Bridge response is too large");
  }
  return { ok: true, value: serialized };
}
var EFFECTS = [
  "read",
  "navigation",
  "current-thread-write",
  "cross-thread-write",
  "destructive",
  "device"
];
var EFFECTS_REQUIRING_CONFIRMATION = /* @__PURE__ */ new Set([
  "cross-thread-write",
  "destructive",
  "device"
]);
function createCapabilityRegistry(specifications) {
  const byMethod = /* @__PURE__ */ new Map();
  const list = [];
  for (const original of specifications) {
    if (original.method.length < 3 || original.method.length > BRIDGE_MAX_METHOD_LENGTH || !METHOD_PATTERN.test(original.method)) {
      throw new TypeError(`Invalid bridge capability method: ${original.method}`);
    }
    if (byMethod.has(original.method)) {
      throw new TypeError(`Duplicate bridge capability method: ${original.method}`);
    }
    if (!EFFECTS.includes(original.effect)) {
      throw new TypeError(`Invalid effect for ${original.method}`);
    }
    if (original.confirmation !== "none" && original.confirmation !== "trusted-outer") {
      throw new TypeError(`Invalid confirmation policy for ${original.method}`);
    }
    if (EFFECTS_REQUIRING_CONFIRMATION.has(original.effect) && original.confirmation !== "trusted-outer") {
      throw new TypeError(
        `${original.method} must require trusted outer confirmation`
      );
    }
    if (original.method === "projects.create" && original.confirmation !== "trusted-outer") {
      throw new TypeError(
        "projects.create must require trusted outer confirmation"
      );
    }
    if (typeof original.description !== "string" || original.description.trim().length === 0 || original.description.length > 240) {
      throw new TypeError(`Invalid description for ${original.method}`);
    }
    if (typeof original.validateParams !== "function" || typeof original.validateResult !== "function" || original.summarize !== void 0 && typeof original.summarize !== "function") {
      throw new TypeError(`Invalid validators for ${original.method}`);
    }
    const specification = Object.freeze({ ...original });
    byMethod.set(specification.method, specification);
    list.push(specification);
  }
  const frozenList = Object.freeze(list.slice());
  return Object.freeze({
    get(method) {
      return byMethod.get(method);
    },
    list() {
      return frozenList;
    }
  });
}
var VALIDATED_INVOCATION = /* @__PURE__ */ Symbol("validated-thread-page-invocation");
function resolveBridgeInvocation(input, registry = strictParityCapabilityRegistry, expectedPageRevision) {
  const decoded = decodeBridgeRequest(input);
  if (!decoded.ok) return decoded;
  if (expectedPageRevision !== void 0 && decoded.value.pageRevision !== expectedPageRevision) {
    return contractFailure("stale_page", "The Thread Page revision has changed");
  }
  const capability = registry.get(decoded.value.method);
  if (!capability) {
    return contractFailure("unknown_method", "Unknown Thread Page capability");
  }
  const params = capability.validateParams(decoded.value.params);
  if (!params.ok) {
    return contractFailure(
      "invalid_params",
      `Invalid parameters for ${capability.method}`,
      params.issues
    );
  }
  const normalizedParams = validateJsonValue(params.value);
  if (!normalizedParams.ok) {
    return contractFailure(
      "invalid_params",
      `Parameter validator for ${capability.method} produced non-JSON data`,
      normalizedParams.issues
    );
  }
  const invocation = {
    request: decoded.value,
    capability,
    params: normalizedParams.value
  };
  Object.defineProperty(invocation, VALIDATED_INVOCATION, {
    enumerable: false,
    value: true
  });
  return { ok: true, value: Object.freeze(invocation) };
}
var TRUSTED_CONFIRMATION = /* @__PURE__ */ Symbol("trusted-outer-confirmation");
var CONFIRMED_REQUEST = /* @__PURE__ */ Symbol("confirmed-request-fingerprint");
function invocationFingerprint(invocation) {
  return JSON.stringify({
    id: invocation.request.id,
    method: invocation.request.method,
    params: invocation.request.params,
    pageRevision: invocation.request.pageRevision
  });
}
function createTrustedOuterConfirmation(invocation, options) {
  if (invocation[VALIDATED_INVOCATION] !== true) {
    throw new TypeError("Confirmation requires a validated bridge invocation");
  }
  if (!Number.isSafeInteger(options.confirmedAtMs) || !Number.isSafeInteger(options.expiresAtMs) || options.confirmedAtMs < 0 || options.expiresAtMs <= options.confirmedAtMs || options.expiresAtMs - options.confirmedAtMs > BRIDGE_MAX_CONFIRMATION_TTL_MS) {
    throw new TypeError("Invalid trusted confirmation lifetime");
  }
  const generated = invocation.capability.summarize?.(invocation.params) ?? invocation.capability.description;
  const summary = options.humanSummary ?? generated;
  if (typeof summary !== "string" || summary.trim().length === 0 || summary.length > 512) {
    throw new TypeError("Invalid trusted confirmation summary");
  }
  const confirmation = {
    source: "trusted-outer",
    requestId: invocation.request.id,
    method: invocation.request.method,
    pageRevision: invocation.request.pageRevision,
    confirmedAtMs: options.confirmedAtMs,
    expiresAtMs: options.expiresAtMs,
    humanSummary: summary
  };
  Object.defineProperties(confirmation, {
    [TRUSTED_CONFIRMATION]: { enumerable: false, value: true },
    [CONFIRMED_REQUEST]: {
      enumerable: false,
      value: invocationFingerprint(invocation)
    }
  });
  return Object.freeze(confirmation);
}
function authorizeBridgeInvocation(invocation, confirmation, nowMs) {
  if (invocation.capability.confirmation === "none") {
    return { ok: true, value: invocation };
  }
  if (typeof confirmation !== "object" || confirmation === null || confirmation[TRUSTED_CONFIRMATION] !== true) {
    return contractFailure(
      "confirmation_required",
      "This action requires confirmation in trusted Thread Page chrome"
    );
  }
  const trusted = confirmation;
  if (!Number.isSafeInteger(nowMs) || nowMs < trusted.confirmedAtMs || nowMs >= trusted.expiresAtMs || trusted.requestId !== invocation.request.id || trusted.method !== invocation.request.method || trusted.pageRevision !== invocation.request.pageRevision || trusted[CONFIRMED_REQUEST] !== invocationFingerprint(invocation)) {
    return contractFailure(
      "confirmation_invalid",
      "Trusted confirmation is expired or does not match this request"
    );
  }
  return { ok: true, value: invocation };
}
function completeBridgeInvocation(invocation, result) {
  const validated = invocation.capability.validateResult(result);
  if (!validated.ok) {
    return makeBridgeFailureResponse(
      invocation.request.id,
      "invalid_result",
      `Invalid result for ${invocation.capability.method}`
    );
  }
  const json = validateJsonValue(validated.value);
  if (!json.ok) {
    return makeBridgeFailureResponse(
      invocation.request.id,
      "invalid_result",
      `Result validator for ${invocation.capability.method} produced non-JSON data`
    );
  }
  const response = {
    v: 1,
    id: invocation.request.id,
    ok: true,
    result: json.value
  };
  const encoded = encodeBridgeResponse(response);
  return encoded.ok ? response : makeBridgeFailureResponse(
    invocation.request.id,
    "response_too_large",
    "Bridge response is too large"
  );
}
function title(value, path) {
  return stringValue(value, path, { max: MAX_TITLE_LENGTH, label: "Title" });
}
function prompt(value, path) {
  return stringValue(value, path, {
    min: 1,
    max: MAX_PROMPT_LENGTH,
    label: "Prompt"
  });
}
function timestamp(value, path) {
  return integerValue(value, path, 0, Number.MAX_SAFE_INTEGER);
}
function parseCapabilityDescriptor(value, path) {
  const object = asObject(value, ["method", "effect", "confirmation"], ["method", "effect", "confirmation"], path);
  if (!object.ok) return object;
  const method = stringValue(object.value.method, `${path}.method`, {
    min: 3,
    max: BRIDGE_MAX_METHOD_LENGTH,
    pattern: METHOD_PATTERN,
    label: "Method name"
  });
  if (!method.ok) return method;
  const effect = enumValue(object.value.effect, `${path}.effect`, EFFECTS);
  if (!effect.ok) return effect;
  const confirmation = enumValue(
    object.value.confirmation,
    `${path}.confirmation`,
    ["none", "trusted-outer"]
  );
  if (!confirmation.ok) return confirmation;
  return valid({ method: method.value, effect: effect.value, confirmation: confirmation.value });
}
function parseContextResult(value) {
  const root = asObject(value, ["protocolVersion", "thread", "page", "capabilities"], ["protocolVersion", "thread", "page", "capabilities"]);
  if (!root.ok) return root;
  if (root.value.protocolVersion !== 1) return invalid("$.protocolVersion", "Expected protocol version 1");
  const thread = asObject(root.value.thread, ["id", "title", "projectId"], ["id", "title", "projectId"], "$.thread");
  if (!thread.ok) return thread;
  const threadId = entityId(thread.value.id, "$.thread.id");
  if (!threadId.ok) return threadId;
  const threadTitle = title(thread.value.title, "$.thread.title");
  if (!threadTitle.ok) return threadTitle;
  const projectId = nullableEntityId(thread.value.projectId, "$.thread.projectId");
  if (!projectId.ok) return projectId;
  const page = asObject(root.value.page, ["revision", "readOnly"], ["revision", "readOnly"], "$.page");
  if (!page.ok) return page;
  const revision = stringValue(page.value.revision, "$.page.revision", {
    min: 1,
    max: BRIDGE_MAX_PAGE_REVISION_LENGTH,
    pattern: ID_PATTERN,
    label: "Page revision"
  });
  if (!revision.ok) return revision;
  const readOnly = booleanValue(page.value.readOnly, "$.page.readOnly");
  if (!readOnly.ok) return readOnly;
  if (!Array.isArray(root.value.capabilities) || root.value.capabilities.length > 64) {
    return invalid("$.capabilities", "Expected at most 64 capabilities");
  }
  const capabilities = [];
  for (let index = 0; index < root.value.capabilities.length; index += 1) {
    const item = parseCapabilityDescriptor(root.value.capabilities[index], `$.capabilities[${index}]`);
    if (!item.ok) return item;
    capabilities.push(item.value);
  }
  return valid({
    protocolVersion: 1,
    thread: { id: threadId.value, title: threadTitle.value, projectId: projectId.value },
    page: { revision: revision.value, readOnly: readOnly.value },
    capabilities
  });
}
function parseActivityParams(value) {
  const object = asObject(value, ["limit"], []);
  if (!object.ok) return object;
  const limit = object.value.limit === void 0 ? valid(8) : integerValue(object.value.limit, "$.limit", 1, 20);
  return limit.ok ? valid({ limit: limit.value }) : limit;
}
function parseActivityItem(value, path) {
  const object = asObject(
    value,
    ["kind", "done", "atMs", "label", "text"],
    ["kind", "done", "atMs", "label", "text"],
    path
  );
  if (!object.ok) return object;
  const kind = stringValue(object.value.kind, path + ".kind", {
    min: 1,
    max: 80,
    label: "Activity kind"
  });
  if (!kind.ok) return kind;
  const done = booleanValue(object.value.done, path + ".done");
  if (!done.ok) return done;
  const atMs = timestamp(object.value.atMs, path + ".atMs");
  if (!atMs.ok) return atMs;
  const label = stringValue(object.value.label, path + ".label", {
    min: 1,
    max: 80,
    label: "Activity label"
  });
  if (!label.ok) return label;
  const text = stringValue(object.value.text, path + ".text", {
    max: 200,
    label: "Activity text"
  });
  if (!text.ok) return text;
  return valid({
    kind: kind.value,
    done: done.value,
    atMs: atMs.value,
    label: label.value,
    text: text.value
  });
}
function parseActivityResult(value) {
  const object = asObject(
    value,
    ["state", "updatedAtMs", "items"],
    ["state", "updatedAtMs", "items"]
  );
  if (!object.ok) return object;
  const state = enumValue(
    object.value.state,
    "$.state",
    ["working", "idle", "waiting", "failed", "stopped"]
  );
  if (!state.ok) return state;
  const updatedAtMs = timestamp(object.value.updatedAtMs, "$.updatedAtMs");
  if (!updatedAtMs.ok) return updatedAtMs;
  if (!Array.isArray(object.value.items) || object.value.items.length > 20) {
    return invalid("$.items", "Expected at most 20 activity items");
  }
  const items = [];
  for (let index = 0; index < object.value.items.length; index += 1) {
    const item = parseActivityItem(
      object.value.items[index],
      "$.items[" + index + "]"
    );
    if (!item.ok) return item;
    items.push(item.value);
  }
  return valid({ state: state.value, updatedAtMs: updatedAtMs.value, items });
}
function parseSnapshotParams(value) {
  const object = asObject(value, ["projectId", "includeArchived", "limit", "cursor"], []);
  if (!object.ok) return object;
  const projectId = object.value.projectId === void 0 ? valid(null) : nullableEntityId(object.value.projectId, "$.projectId");
  if (!projectId.ok) return projectId;
  const includeArchived = object.value.includeArchived === void 0 ? valid(false) : booleanValue(object.value.includeArchived, "$.includeArchived");
  if (!includeArchived.ok) return includeArchived;
  const limit = object.value.limit === void 0 ? valid(100) : integerValue(object.value.limit, "$.limit", 1, MAX_ITEMS);
  if (!limit.ok) return limit;
  const cursor = object.value.cursor === void 0 || object.value.cursor === null ? valid(null) : opaqueToken(object.value.cursor, "$.cursor");
  if (!cursor.ok) return cursor;
  return valid({ projectId: projectId.value, includeArchived: includeArchived.value, limit: limit.value, cursor: cursor.value });
}
function parseThreadSnapshotItem(value, path) {
  const object = asObject(value, ["id", "title", "projectId", "parentThreadId", "status", "archived", "page", "updatedAtMs"], ["id", "title", "projectId", "parentThreadId", "status", "archived", "page", "updatedAtMs"], path);
  if (!object.ok) return object;
  const id = entityId(object.value.id, `${path}.id`);
  if (!id.ok) return id;
  const itemTitle = title(object.value.title, `${path}.title`);
  if (!itemTitle.ok) return itemTitle;
  const projectId = nullableEntityId(object.value.projectId, `${path}.projectId`);
  if (!projectId.ok) return projectId;
  const parentThreadId = nullableEntityId(object.value.parentThreadId, `${path}.parentThreadId`);
  if (!parentThreadId.ok) return parentThreadId;
  const status = enumValue(object.value.status, `${path}.status`, ["idle", "active", "waiting", "failed", "stopped"]);
  if (!status.ok) return status;
  const archived = booleanValue(object.value.archived, `${path}.archived`);
  if (!archived.ok) return archived;
  const page = asObject(object.value.page, ["available", "revision"], ["available", "revision"], `${path}.page`);
  if (!page.ok) return page;
  const available = booleanValue(page.value.available, `${path}.page.available`);
  if (!available.ok) return available;
  const revision = page.value.revision === null ? valid(null) : stringValue(page.value.revision, `${path}.page.revision`, { min: 1, max: BRIDGE_MAX_PAGE_REVISION_LENGTH, pattern: ID_PATTERN, label: "Page revision" });
  if (!revision.ok) return revision;
  const updatedAtMs = timestamp(object.value.updatedAtMs, `${path}.updatedAtMs`);
  if (!updatedAtMs.ok) return updatedAtMs;
  return valid({ id: id.value, title: itemTitle.value, projectId: projectId.value, parentThreadId: parentThreadId.value, status: status.value, archived: archived.value, page: { available: available.value, revision: revision.value }, updatedAtMs: updatedAtMs.value });
}
function parseSnapshotResult(value) {
  const object = asObject(value, ["threads", "nextCursor", "generatedAtMs"], ["threads", "nextCursor", "generatedAtMs"]);
  if (!object.ok) return object;
  if (!Array.isArray(object.value.threads) || object.value.threads.length > MAX_ITEMS) return invalid("$.threads", `Expected at most ${MAX_ITEMS} threads`);
  const threads = [];
  for (let index = 0; index < object.value.threads.length; index += 1) {
    const item = parseThreadSnapshotItem(object.value.threads[index], `$.threads[${index}]`);
    if (!item.ok) return item;
    threads.push(item.value);
  }
  const nextCursor = object.value.nextCursor === null ? valid(null) : opaqueToken(object.value.nextCursor, "$.nextCursor");
  if (!nextCursor.ok) return nextCursor;
  const generatedAtMs = timestamp(object.value.generatedAtMs, "$.generatedAtMs");
  if (!generatedAtMs.ok) return generatedAtMs;
  return valid({ threads, nextCursor: nextCursor.value, generatedAtMs: generatedAtMs.value });
}
function parseReplyParams(value) {
  const object = asObject(value, ["result", "mode", "title", "idempotencyKey"], ["result"]);
  if (!object.ok) return object;
  const result = validateJsonValue(object.value.result);
  if (!result.ok) return result;
  const mode = object.value.mode === void 0 ? valid("queue") : enumValue(object.value.mode, "$.mode", ["queue", "steer"]);
  if (!mode.ok) return mode;
  const replyTitle = object.value.title === void 0 ? void 0 : title(object.value.title, "$.title");
  if (replyTitle && !replyTitle.ok) return replyTitle;
  const idempotencyKey = object.value.idempotencyKey === void 0 ? void 0 : stringValue(object.value.idempotencyKey, "$.idempotencyKey", { min: 1, max: BRIDGE_MAX_ID_LENGTH, pattern: ID_PATTERN, label: "Idempotency key" });
  if (idempotencyKey && !idempotencyKey.ok) return idempotencyKey;
  return valid({ result: result.value, mode: mode.value, ...replyTitle ? { title: replyTitle.value } : {}, ...idempotencyKey ? { idempotencyKey: idempotencyKey.value } : {} });
}
function parseDeliveryResult(value) {
  const object = asObject(value, ["delivery", "duplicate"], ["delivery", "duplicate"]);
  if (!object.ok) return object;
  const delivery = enumValue(object.value.delivery, "$.delivery", ["started", "queued", "steered"]);
  if (!delivery.ok) return delivery;
  const duplicate = booleanValue(object.value.duplicate, "$.duplicate");
  if (!duplicate.ok) return duplicate;
  return valid({ delivery: delivery.value, duplicate: duplicate.value });
}
function parseContinueParams(value) {
  const object = asObject(value, ["threadId", "prompt", "mode"], ["threadId", "prompt"]);
  if (!object.ok) return object;
  const threadId = entityId(object.value.threadId, "$.threadId");
  if (!threadId.ok) return threadId;
  const text = prompt(object.value.prompt, "$.prompt");
  if (!text.ok) return text;
  const mode = object.value.mode === void 0 ? valid("queue") : enumValue(object.value.mode, "$.mode", ["queue", "steer"]);
  if (!mode.ok) return mode;
  return valid({ threadId: threadId.value, prompt: text.value, mode: mode.value });
}
function parseContinueResult(value) {
  const object = asObject(value, ["threadId", "delivery", "duplicate"], ["threadId", "delivery", "duplicate"]);
  if (!object.ok) return object;
  const threadId = entityId(object.value.threadId, "$.threadId");
  if (!threadId.ok) return threadId;
  const delivery = parseDeliveryResult({ delivery: object.value.delivery, duplicate: object.value.duplicate });
  if (!delivery.ok) return delivery;
  return valid({ threadId: threadId.value, ...delivery.value });
}
function optionalSafeName(value, path, max = 160) {
  return stringValue(value, path, { min: 1, max, pattern: /^[^\u0000-\u001f\u007f]+$/, label: "Name" });
}
function parseSpawnParams(value) {
  const object = asObject(value, ["projectId", "prompt", "title", "providerId", "model", "reasoningLevel"], ["projectId", "prompt"]);
  if (!object.ok) return object;
  const projectId = entityId(object.value.projectId, "$.projectId");
  if (!projectId.ok) return projectId;
  const text = prompt(object.value.prompt, "$.prompt");
  if (!text.ok) return text;
  const threadTitle = object.value.title === void 0 ? void 0 : title(object.value.title, "$.title");
  if (threadTitle && !threadTitle.ok) return threadTitle;
  const providerId = object.value.providerId === void 0 ? void 0 : entityId(object.value.providerId, "$.providerId");
  if (providerId && !providerId.ok) return providerId;
  const model = object.value.model === void 0 ? void 0 : optionalSafeName(object.value.model, "$.model");
  if (model && !model.ok) return model;
  const reasoningLevel = object.value.reasoningLevel === void 0 ? void 0 : entityId(object.value.reasoningLevel, "$.reasoningLevel");
  if (reasoningLevel && !reasoningLevel.ok) return reasoningLevel;
  return valid({ projectId: projectId.value, prompt: text.value, ...threadTitle ? { title: threadTitle.value } : {}, ...providerId ? { providerId: providerId.value } : {}, ...model ? { model: model.value } : {}, ...reasoningLevel ? { reasoningLevel: reasoningLevel.value } : {} });
}
function parseThreadTarget(value) {
  const object = asObject(value, ["threadId"], ["threadId"]);
  if (!object.ok) return object;
  const threadId = entityId(object.value.threadId, "$.threadId");
  return threadId.ok ? valid({ threadId: threadId.value }) : threadId;
}
function parseBooleanResult(key, value) {
  const object = asObject(value, [key], [key]);
  if (!object.ok) return object;
  const flag = booleanValue(object.value[key], `$.${key}`);
  if (!flag.ok) return flag;
  if (key === "opened") return valid({ opened: flag.value });
  if (key === "archived") return valid({ archived: flag.value });
  return valid({ stopped: flag.value });
}
function parseExternalHttpUrl(value, path) {
  const bounded = stringValue(value, path, {
    min: 1,
    max: 2048,
    pattern: /^[^\u0000-\u0020\u007f]+$/,
    label: "External URL"
  });
  if (!bounded.ok) return bounded;
  let parsed;
  try {
    parsed = new URL(bounded.value);
  } catch {
    return invalid(path, "Expected an absolute http or https URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" || !parsed.hostname || parsed.username !== "" || parsed.password !== "") {
    return invalid(path, "Expected an absolute http or https URL without credentials");
  }
  return valid(bounded.value);
}
function parseOpenExternalParams(value) {
  const object = asObject(value, ["url", "label"], ["url"]);
  if (!object.ok) return object;
  const url = parseExternalHttpUrl(object.value.url, "$.url");
  if (!url.ok) return url;
  const label = object.value.label === void 0 ? void 0 : stringValue(object.value.label, "$.label", {
    min: 1,
    max: 160,
    label: "Target label"
  });
  if (label && !label.ok) return label;
  return valid({ url: url.value, ...label ? { label: label.value } : {} });
}
function parseProjectChoice(value, path) {
  const object = asObject(value, ["id", "name", "kind"], ["id", "name", "kind"], path);
  if (!object.ok) return object;
  const id = entityId(object.value.id, `${path}.id`);
  if (!id.ok) return id;
  const name = title(object.value.name, `${path}.name`);
  if (!name.ok) return name;
  const kind = enumValue(object.value.kind, `${path}.kind`, ["standard", "personal"]);
  if (!kind.ok) return kind;
  return valid({ id: id.value, name: name.value, kind: kind.value });
}
function parseProjectsResult(value) {
  const object = asObject(value, ["projects"], ["projects"]);
  if (!object.ok) return object;
  if (!Array.isArray(object.value.projects) || object.value.projects.length > MAX_ITEMS) return invalid("$.projects", `Expected at most ${MAX_ITEMS} projects`);
  const projects = [];
  for (let index = 0; index < object.value.projects.length; index += 1) {
    const item = parseProjectChoice(object.value.projects[index], `$.projects[${index}]`);
    if (!item.ok) return item;
    projects.push(item.value);
  }
  return valid({ projects });
}
function parseBrowseParams(value) {
  const object = asObject(value, ["startProjectId"], []);
  if (!object.ok) return object;
  const startProjectId = object.value.startProjectId === void 0 || object.value.startProjectId === null ? valid(null) : entityId(object.value.startProjectId, "$.startProjectId");
  return startProjectId.ok ? valid({ startProjectId: startProjectId.value }) : startProjectId;
}
function parseBrowseResult(value) {
  const object = asObject(value, ["selection"], ["selection"]);
  if (!object.ok) return object;
  if (object.value.selection === null) return valid({ selection: null });
  const selection = asObject(object.value.selection, ["token", "displayPath", "hostName"], ["token", "displayPath", "hostName"], "$.selection");
  if (!selection.ok) return selection;
  const token = opaqueToken(selection.value.token, "$.selection.token");
  if (!token.ok) return token;
  const displayPath = stringValue(selection.value.displayPath, "$.selection.displayPath", { min: 1, max: 1024, label: "Display path" });
  if (!displayPath.ok) return displayPath;
  const hostName = title(selection.value.hostName, "$.selection.hostName");
  if (!hostName.ok) return hostName;
  return valid({ selection: { token: token.value, displayPath: displayPath.value, hostName: hostName.value } });
}
function parseCreateProjectParams(value) {
  const object = asObject(value, ["selectionToken", "name"], ["selectionToken"]);
  if (!object.ok) return object;
  const selectionToken = opaqueToken(object.value.selectionToken, "$.selectionToken");
  if (!selectionToken.ok) return selectionToken;
  const name = object.value.name === void 0 ? void 0 : title(object.value.name, "$.name");
  if (name && !name.ok) return name;
  return valid({ selectionToken: selectionToken.value, ...name ? { name: name.value } : {} });
}
function parseProviderChoice(value, path) {
  const object = asObject(value, ["id", "displayName", "available", "models"], ["id", "displayName", "available", "models"], path);
  if (!object.ok) return object;
  const id = entityId(object.value.id, `${path}.id`);
  if (!id.ok) return id;
  const displayName = title(object.value.displayName, `${path}.displayName`);
  if (!displayName.ok) return displayName;
  const available = booleanValue(object.value.available, `${path}.available`);
  if (!available.ok) return available;
  if (!Array.isArray(object.value.models) || object.value.models.length > MAX_ITEMS) return invalid(`${path}.models`, `Expected at most ${MAX_ITEMS} models`);
  const models = [];
  for (let index = 0; index < object.value.models.length; index += 1) {
    const model = asObject(object.value.models[index], ["id", "displayName"], ["id", "displayName"], `${path}.models[${index}]`);
    if (!model.ok) return model;
    const modelId = optionalSafeName(model.value.id, `${path}.models[${index}].id`);
    if (!modelId.ok) return modelId;
    const modelName = title(model.value.displayName, `${path}.models[${index}].displayName`);
    if (!modelName.ok) return modelName;
    models.push({ id: modelId.value, displayName: modelName.value });
  }
  return valid({ id: id.value, displayName: displayName.value, available: available.value, models });
}
function parseProvidersResult(value) {
  const object = asObject(value, ["providers"], ["providers"]);
  if (!object.ok) return object;
  if (!Array.isArray(object.value.providers) || object.value.providers.length > 64) return invalid("$.providers", "Expected at most 64 providers");
  const providers = [];
  for (let index = 0; index < object.value.providers.length; index += 1) {
    const item = parseProviderChoice(object.value.providers[index], `$.providers[${index}]`);
    if (!item.ok) return item;
    providers.push(item.value);
  }
  return valid({ providers });
}
function parseStorageKey(value, path = "$.key") {
  return stringValue(value, path, { min: 1, max: 128, pattern: STORAGE_KEY_PATTERN, label: "Storage key" });
}
function parseStorageGetParams(value) {
  const object = asObject(value, ["key"], ["key"]);
  if (!object.ok) return object;
  const key = parseStorageKey(object.value.key);
  return key.ok ? valid({ key: key.value }) : key;
}
function parseStorageGetResult(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object" || typeof value.found !== "boolean") return invalid("$.found", "Expected a boolean found flag");
  const object = value.found ? asObject(value, ["found", "value"], ["found", "value"]) : asObject(value, ["found"], ["found"]);
  if (!object.ok) return object;
  if (!value.found) return valid({ found: false });
  const stored = validateJsonValue(object.value.value, { maxBytes: BRIDGE_MAX_STORAGE_VALUE_BYTES, maxDepth: 12 });
  return stored.ok ? valid({ found: true, value: stored.value }) : stored;
}
function parseStorageSetParams(value) {
  const object = asObject(value, ["key", "value"], ["key", "value"]);
  if (!object.ok) return object;
  const key = parseStorageKey(object.value.key);
  if (!key.ok) return key;
  const stored = validateJsonValue(object.value.value, { maxBytes: BRIDGE_MAX_STORAGE_VALUE_BYTES, maxDepth: 12 });
  if (!stored.ok) return stored;
  return valid({ key: key.value, value: stored.value });
}
function parseStoredResult(value) {
  const object = asObject(value, ["stored"], ["stored"]);
  if (!object.ok) return object;
  const stored = booleanValue(object.value.stored, "$.stored");
  return stored.ok ? valid({ stored: stored.value }) : stored;
}
function parseVoiceParams(value) {
  const object = asObject(value, ["language", "prompt", "maxDurationSeconds"], []);
  if (!object.ok) return object;
  const language = object.value.language === void 0 ? void 0 : stringValue(object.value.language, "$.language", { min: 2, max: 64, pattern: /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, label: "Language" });
  if (language && !language.ok) return language;
  const voicePrompt = object.value.prompt === void 0 ? void 0 : stringValue(object.value.prompt, "$.prompt", { max: 1e3, label: "Transcription prompt" });
  if (voicePrompt && !voicePrompt.ok) return voicePrompt;
  const maxDurationSeconds = object.value.maxDurationSeconds === void 0 ? valid(120) : integerValue(object.value.maxDurationSeconds, "$.maxDurationSeconds", 1, 120);
  if (!maxDurationSeconds.ok) return maxDurationSeconds;
  return valid({ ...language ? { language: language.value } : {}, ...voicePrompt ? { prompt: voicePrompt.value } : {}, maxDurationSeconds: maxDurationSeconds.value });
}
function parseVoiceResult(value) {
  const object = asObject(value, ["text"], ["text"]);
  if (!object.ok) return object;
  const text = stringValue(object.value.text, "$.text", { max: MAX_RESULT_TEXT_LENGTH, label: "Transcription" });
  return text.ok ? valid({ text: text.value }) : text;
}
function excerpt(text) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= 80 ? singleLine : `${singleLine.slice(0, 79)}\u2026`;
}
var strictParitySpecs = [
  {
    method: "context.get",
    description: "Read the current Thread Page context and capability roster.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseContextResult)
  },
  {
    method: "thread.activity",
    description: "Read this thread's current state and recent presented activity.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseActivityParams),
    validateResult: jsonValidator(parseActivityResult)
  },
  {
    method: "threads.snapshot",
    description: "Read a bounded, projected snapshot of threads and page status.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseSnapshotParams),
    validateResult: jsonValidator(parseSnapshotResult)
  },
  {
    method: "thread.reply",
    description: "Reply to the Thread Page's owning thread.",
    effect: "current-thread-write",
    confirmation: "none",
    validateParams: jsonValidator(parseReplyParams),
    validateResult: jsonValidator(parseDeliveryResult)
  },
  {
    method: "threads.continue",
    description: "Send a prompt to another existing thread.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params) => `Continue thread ${params.threadId}: ${excerpt(params.prompt)}`,
    validateParams: jsonValidator(parseContinueParams),
    validateResult: jsonValidator(parseContinueResult)
  },
  {
    method: "threads.spawn",
    description: "Start a visible root thread in a selected project.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params) => `Start a thread in ${params.projectId}: ${excerpt(params.prompt)}`,
    validateParams: jsonValidator(parseSpawnParams),
    validateResult: jsonValidator((value) => {
      const object = asObject(value, ["threadId"], ["threadId"]);
      if (!object.ok) return object;
      const threadId = entityId(object.value.threadId, "$.threadId");
      return threadId.ok ? valid({ threadId: threadId.value }) : threadId;
    })
  },
  {
    method: "threads.openPage",
    description: "Open another Thread Page using trusted client navigation.",
    effect: "navigation",
    confirmation: "none",
    summarize: (params) => `Open the Thread Page for ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value))
  },
  {
    method: "threads.openBb",
    description: "Open a thread in the bb application.",
    effect: "navigation",
    confirmation: "none",
    summarize: (params) => `Open thread ${params.threadId} in bb`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value))
  },
  {
    method: "threads.stop",
    description: "Stop the selected thread's active provider runtime.",
    effect: "destructive",
    confirmation: "trusted-outer",
    summarize: (params) => `Stop thread ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("stopped", value))
  },
  {
    method: "threads.archive",
    description: "Archive a selected thread.",
    effect: "destructive",
    confirmation: "trusted-outer",
    summarize: (params) => `Archive thread ${params.threadId}`,
    validateParams: jsonValidator(parseThreadTarget),
    validateResult: jsonValidator((value) => parseBooleanResult("archived", value))
  },
  {
    method: "navigation.openExternal",
    description: "Open an external http or https URL through trusted client chrome.",
    effect: "navigation",
    confirmation: "trusted-outer",
    summarize: (params) => {
      const target = new URL(params.url);
      return `Open ${params.label ? `\u201C${params.label}\u201D at ` : ""}${target.origin}`;
    },
    validateParams: jsonValidator(parseOpenExternalParams),
    validateResult: jsonValidator((value) => parseBooleanResult("opened", value))
  },
  {
    method: "projects.list",
    description: "Read safe project choices without host or path details.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseProjectsResult)
  },
  {
    method: "projects.browse",
    description: "Open a trusted folder picker and return an opaque selection token.",
    effect: "device",
    confirmation: "trusted-outer",
    summarize: () => "Choose a project folder on this device",
    validateParams: jsonValidator(parseBrowseParams),
    validateResult: jsonValidator(parseBrowseResult)
  },
  {
    method: "projects.create",
    description: "Create a project from a trusted folder-picker selection.",
    effect: "cross-thread-write",
    confirmation: "trusted-outer",
    summarize: (params) => `Create project ${params.name ? `\u201C${params.name}\u201D` : "from the selected folder"}`,
    validateParams: jsonValidator(parseCreateProjectParams),
    validateResult: jsonValidator((value) => {
      const object = asObject(value, ["project"], ["project"]);
      if (!object.ok) return object;
      const project = parseProjectChoice(object.value.project, "$.project");
      return project.ok ? valid({ project: project.value }) : project;
    })
  },
  {
    method: "providers.list",
    description: "Read available provider and model choices.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(noParams),
    validateResult: jsonValidator(parseProvidersResult)
  },
  {
    method: "storage.get",
    description: "Read small JSON state scoped to the owning Thread Page.",
    effect: "read",
    confirmation: "none",
    validateParams: jsonValidator(parseStorageGetParams),
    validateResult: jsonValidator(parseStorageGetResult)
  },
  {
    method: "storage.set",
    description: "Write small JSON state scoped to the owning Thread Page.",
    effect: "current-thread-write",
    confirmation: "none",
    validateParams: jsonValidator(parseStorageSetParams),
    validateResult: jsonValidator(parseStoredResult)
  },
  {
    method: "voice.captureAndTranscribe",
    description: "Record and transcribe voice through trusted client chrome.",
    effect: "device",
    confirmation: "trusted-outer",
    summarize: () => "Allow this Thread Page to record and transcribe voice",
    validateParams: jsonValidator(parseVoiceParams),
    validateResult: jsonValidator(parseVoiceResult)
  }
];
var strictParityCapabilityRegistry = createCapabilityRegistry(strictParitySpecs);
function capabilityDescriptors(registry = strictParityCapabilityRegistry) {
  return registry.list().map(({ method, effect, confirmation }) => ({
    method,
    effect,
    confirmation
  }));
}

// server.ts
var MAX_SUBMISSION_BYTES = 64 * 1024;
var ASSET_DIRNAME = "thread-page-assets";
var ASSET_PREVIEW_TTL_MS = 10 * 60 * 1e3;
var MAX_CACHE_VALUE_BYTES = 240 * 1024;
var MAX_MEMORY_CACHE_BYTES = 8 * 1024 * 1024;
var MAX_MEMORY_CACHE_ENTRIES = 32;
var SUBMISSION_TTL_MS = 5 * 60 * 1e3;
var MAX_RECENT_SUBMISSIONS = 512;
var MAX_BRIDGE_BODY_BYTES = BRIDGE_MAX_SERIALIZED_BYTES + 8 * 1024;
var SIGNING_KEY_KV_KEY = "page-signing-key:v2";
var ENABLED_BRIDGE_METHODS = /* @__PURE__ */ new Set([
  "context.get",
  "thread.activity",
  "thread.reply",
  "threads.snapshot",
  "projects.list",
  "providers.list",
  "threads.continue",
  "threads.spawn",
  "threads.archive",
  "threads.stop",
  "threads.openPage",
  "threads.openBb",
  "navigation.openExternal",
  "storage.get",
  "storage.set",
  "projects.browse",
  "projects.create"
]);
var SELECTION_TTL_MS = 10 * 60 * 1e3;
var enabledBridgeRegistry = createCapabilityRegistry(
  strictParityCapabilityRegistry.list().filter((capability) => ENABLED_BRIDGE_METHODS.has(capability.method))
);
var PageNotFoundError = class extends Error {
  constructor() {
    super("Thread page has not been initialized");
    this.name = "PageNotFoundError";
  }
};
var PageTooLargeError = class extends Error {
  constructor() {
    super(`Thread page exceeds ${MAX_PAGE_BYTES} bytes`);
    this.name = "PageTooLargeError";
  }
};
var PageUnavailableError = class extends Error {
  constructor(options) {
    super("Thread page source is unavailable", options);
    this.name = "PageUnavailableError";
  }
};
function isValidThreadId(value) {
  return value !== null && /^[A-Za-z0-9_-]{3,128}$/.test(value);
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
var ACTIVITY_LABELS = {
  agentMessage: ["Writing", "Wrote"],
  reasoning: ["Thinking", "Thought"]
};
function activityState(thread) {
  const runtime = recordValue(thread.runtime);
  const display = typeof runtime?.displayStatus === "string" ? runtime.displayStatus : typeof thread.status === "string" ? thread.status : "idle";
  if (["active", "starting", "provisioning", "stopping"].includes(display)) {
    return "working";
  }
  if (display === "error") return "failed";
  if (thread.hasPendingInteraction === true) return "waiting";
  return "idle";
}
function activityItems(events, limit) {
  const out = [];
  for (const rawEvent of events) {
    const event = recordValue(rawEvent);
    if (!event) continue;
    const type = event.type;
    if (type !== "item/started" && type !== "item/completed") continue;
    const done = type === "item/completed";
    const data = recordValue(event.data);
    const item = recordValue(data?.item) ?? data;
    if (!item || typeof item.type !== "string") continue;
    const presentation = recordValue(item.presentation);
    const labels = recordValue(presentation?.label);
    const presented = labels?.[done ? "completed" : "pending"];
    const fallback = ACTIVITY_LABELS[item.type];
    const label = typeof presented === "string" ? presented : fallback ? fallback[done ? 1 : 0] : null;
    if (!label) continue;
    const detail = presentation?.title ?? item.command ?? item.text ?? item.name ?? "";
    const atMs = typeof event.createdAt === "number" && Number.isFinite(event.createdAt) ? Math.max(0, Math.trunc(event.createdAt)) : 0;
    out.push({
      kind: item.type.slice(0, 80),
      done,
      atMs,
      label: label.trim().slice(0, 80) || (done ? "Completed" : "Working"),
      text: String(detail).replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }
  out.reverse();
  return out.slice(-limit);
}
function snapshotStatus(thread) {
  const state = activityState(thread);
  if (state === "working") return "active";
  if (state === "failed") return "failed";
  if (state === "waiting") return "waiting";
  return "idle";
}
function isMissingFileError(error) {
  if (error && typeof error === "object") {
    const record = error;
    if (record.code === "ENOENT" || record.status === 404) return true;
  }
  return /\b(enoent|not found|does not exist|no such file)\b/i.test(
    errorText(error)
  );
}
function storageRoot(storageRootPath) {
  return storageRootPath.replace(/[\\/]+$/, "");
}
function pagePath(storageRootPath) {
  return `${storageRoot(storageRootPath)}/${PAGE_FILENAME}`;
}
function assetDirPath(storageRootPath) {
  return `${storageRoot(storageRootPath)}/${ASSET_DIRNAME}`;
}
function uploadDirPath(storageRootPath) {
  return `${storageRoot(storageRootPath)}/${UPLOAD_DIRNAME}`;
}
function cacheKey(threadId) {
  return `cache:${threadId}`;
}
function isEligibleThread(thread) {
  return thread.visibility === "visible" && thread.parentThreadId === null && thread.sourceThreadId === null && thread.archivedAt === null && thread.deletedAt === null;
}
function isCachedPage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value;
  return typeof entry.fragment === "string" && Buffer.byteLength(entry.fragment, "utf8") <= MAX_PAGE_BYTES && typeof entry.hash === "string" && /^[a-f0-9]{64}$/.test(entry.hash) && sha256Text(entry.fragment) === entry.hash && typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt);
}
function createPageStore(bb) {
  const memory = /* @__PURE__ */ new Map();
  let memoryBytes = 0;
  function cacheBytes(page) {
    return Buffer.byteLength(page.fragment, "utf8") + 128;
  }
  function retain(threadId, page) {
    const existing = memory.get(threadId);
    if (existing) {
      memoryBytes -= cacheBytes(existing);
      memory.delete(threadId);
    }
    memory.set(threadId, page);
    memoryBytes += cacheBytes(page);
    while (memory.size > MAX_MEMORY_CACHE_ENTRIES || memoryBytes > MAX_MEMORY_CACHE_BYTES) {
      const oldest = memory.keys().next().value;
      if (!oldest) break;
      const removed = memory.get(oldest);
      memory.delete(oldest);
      if (removed) memoryBytes -= cacheBytes(removed);
    }
  }
  async function remember(threadId, page) {
    const previous = memory.get(threadId);
    retain(threadId, page);
    if (previous?.hash === page.hash) return;
    if (Buffer.byteLength(JSON.stringify(page), "utf8") > MAX_CACHE_VALUE_BYTES) {
      bb.log.debug(
        `Thread Page ${threadId} is too large for the durable offline cache`
      );
      try {
        await bb.storage.kv.delete(cacheKey(threadId));
      } catch (error) {
        bb.log.warn(
          `Could not clear obsolete offline cache for ${threadId}: ${errorText(error)}`
        );
      }
      return;
    }
    try {
      await bb.storage.kv.set(cacheKey(threadId), page);
    } catch (error) {
      bb.log.warn(
        `Could not update offline cache for ${threadId}: ${errorText(error)}`
      );
    }
  }
  async function cached(threadId) {
    const resident = memory.get(threadId);
    if (resident) {
      retain(threadId, resident);
      return resident;
    }
    try {
      const stored = await bb.storage.kv.get(cacheKey(threadId));
      if (!isCachedPage(stored)) return null;
      retain(threadId, stored);
      return stored;
    } catch (error) {
      bb.log.warn(
        `Could not read offline cache for ${threadId}: ${errorText(error)}`
      );
      return null;
    }
  }
  async function load(threadId, signal) {
    try {
      const location = await bb.sdk.threads.storageLocation({
        threadId,
        signal
      });
      const file = await bb.sdk.files.read({
        hostId: location.hostId,
        path: pagePath(location.storageRootPath),
        rootPath: location.storageRootPath,
        signal
      });
      if (file.contentEncoding !== "utf8") {
        throw new Error("Thread page is not UTF-8 text");
      }
      if (file.sizeBytes > MAX_PAGE_BYTES || Buffer.byteLength(file.content, "utf8") > MAX_PAGE_BYTES) {
        throw new PageTooLargeError();
      }
      const hash = /^[a-f0-9]{64}$/i.test(file.sha256) ? file.sha256.toLowerCase() : sha256Text(file.content);
      const page = {
        fragment: file.content,
        hash,
        updatedAt: file.modifiedAtMs ?? Date.now()
      };
      await remember(threadId, page);
      return { ...page, stale: false };
    } catch (error) {
      if (error instanceof PageTooLargeError) throw error;
      if (isMissingFileError(error)) throw new PageNotFoundError();
      const fallback = await cached(threadId);
      if (fallback) return { ...fallback, stale: true };
      throw new PageUnavailableError({ cause: error });
    }
  }
  return { load, remember };
}
async function getSigningKey(bb) {
  try {
    const stored = await bb.storage.kv.get(SIGNING_KEY_KV_KEY);
    if (typeof stored === "string" && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      const decoded = Buffer.from(stored, "base64url");
      if (decoded.byteLength === 32) return decoded;
    }
  } catch (error) {
    bb.log.warn(`Could not read viewer signing key: ${errorText(error)}`);
  }
  const generated = randomBytes(32);
  try {
    await bb.storage.kv.set(SIGNING_KEY_KV_KEY, generated.toString("base64url"));
  } catch (error) {
    bb.log.warn(
      `Viewer sessions will reset on plugin reload: ${errorText(error)}`
    );
  }
  return generated;
}
function commonHeaders() {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "text/html; charset=utf-8",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  });
}
function outerHeaders(nonce) {
  const headers = commonHeaders();
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      "base-uri 'none'",
      "connect-src 'self'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "frame-src 'self'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`
    ].join("; ")
  );
  return headers;
}
function assetCspSource(assetBase, requestUrl) {
  if (!assetBase) return null;
  try {
    return new URL(assetBase, requestUrl).href;
  } catch {
    return null;
  }
}
function documentHeaders(_nonce, page, assetBase, activity) {
  const headers = commonHeaders();
  const assetSource = assetBase ? ` ${assetBase}` : "";
  headers.set(
    "content-security-policy",
    [
      "default-src 'none'",
      // The injected <base> must be allowed, but only for the confined preview.
      assetBase ? `base-uri ${assetBase}` : "base-uri 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      `img-src data: blob:${assetSource}`,
      `media-src data: blob:${assetSource}`,
      `font-src data:${assetSource}`,
      "sandbox allow-scripts allow-forms",
      `script-src 'unsafe-inline'${assetSource}`,
      "script-src-attr 'unsafe-inline'",
      `style-src 'unsafe-inline'${assetSource}`,
      "style-src-attr 'unsafe-inline'"
    ].join("; ")
  );
  if (page) {
    headers.set("etag", etagForHash(page.hash));
    headers.set("x-thread-page-stale", String(page.stale));
    if (activity) headers.set("x-thread-page-activity", activity);
    headers.set("x-thread-page-updated-at", String(page.updatedAt));
  }
  return headers;
}
function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
function parseBridgeEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value;
  const keys = Object.keys(input);
  const allowed = /* @__PURE__ */ new Set(["actionToken", "request", "confirmation"]);
  if (keys.length < 2 || keys.length > 3 || !keys.includes("actionToken") || !keys.includes("request") || keys.some((key) => !allowed.has(key)) || typeof input.actionToken !== "string" || input.actionToken.length > 4096) {
    return null;
  }
  const confirmation = input.confirmation;
  if (confirmation !== void 0 && confirmation !== null && (typeof confirmation !== "string" || confirmation.length > 4096)) {
    return null;
  }
  return {
    actionToken: input.actionToken,
    request: input.request,
    confirmation: typeof confirmation === "string" ? confirmation : null
  };
}
function requestIdFrom(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value.id : void 0;
}
function bridgeFailureStatus(code) {
  if (code === "unknown_method") return 404;
  if (code === "stale_page" || code === "conflict") return 409;
  if (code === "unavailable") return 503;
  if (code === "handler_error" || code === "invalid_result") return 500;
  return 400;
}
function stableJsonStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`
  ).join(",")}}`;
}
function errorPage(message, status) {
  const nonce = randomBytes(18).toString("base64url");
  const headers = documentHeaders(nonce);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thread Page</title><style nonce="${nonce}">body{max-width:42rem;margin:4rem auto;padding:0 1rem;font:16px/1.5 system-ui;color:CanvasText;background:Canvas}h1{font-size:1.4rem}</style></head><body><main><h1>Thread Page</h1><p>${escapeHtml(message)}</p></main></body></html>`,
    { status, headers }
  );
}
function errorStatus(error) {
  if (error instanceof PageNotFoundError) return 404;
  if (error instanceof PageTooLargeError) return 413;
  return 503;
}
function publicMessage(error) {
  if (error instanceof PageNotFoundError) {
    return "This thread has no page yet. Run `bb thread-page init` in the thread first.";
  }
  if (error instanceof PageTooLargeError) {
    return `The thread page is larger than ${MAX_PAGE_BYTES / 1024} KiB.`;
  }
  return "The thread page is unavailable. Reconnect its source host and try again.";
}
function parseIfNoneMatch(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim());
}
async function threadPagesPlugin(bb) {
  const settings = bb.settings.define({
    agentInstructions: {
      type: "boolean",
      label: "Agent initialization hint",
      description: "Tell each new agent session to initialize and directly edit its Thread Page.",
      default: false
    },
    workingLabel: {
      type: "string",
      label: "Working indicator text",
      description: "Shown in the page header while the thread is mid-turn, so a reader knows a new version is coming. Blank hides the indicator.",
      default: "Working \u2014 this is the last saved version"
    },
    homeThreadId: {
      type: "string",
      label: "Home page thread",
      description: "Thread whose page is the home page every other page links back to. Set it with `bb thread-page home`.",
      default: ""
    },
    pageSeedHtml: {
      type: "string",
      label: "New-page HTML seed",
      description: "Full HTML used only when bb thread-page init creates a missing page. {{TITLE}} is escaped and replaced.",
      experimental_multiline: true,
      default: DEFAULT_PAGE_SEED
    },
    agentInstructionText: {
      type: "string",
      label: "Agent instruction",
      description: "Short instruction injected into eligible new sessions when Agent initialization hint is enabled.",
      experimental_multiline: true,
      default: DEFAULT_AGENT_INSTRUCTION
    }
  });
  let currentSettings = await settings.get();
  settings.onChange((next) => {
    currentSettings = next;
  });
  bb.agents.configure((context) => {
    const base = { tools: [], skills: [] };
    const isRootOwnerThread = context.thread.parentThreadId === null && context.thread.sourceThreadId === null && context.origin.kind === null;
    return currentSettings.agentInstructions && isRootOwnerThread ? {
      ...base,
      instructions: currentSettings.agentInstructionText
    } : base;
  });
  const signingKey = await getSigningKey(bb);
  const pages = createPageStore(bb);
  const baseRoute = `/api/v1/plugins/${bb.pluginId}/http`;
  const folderSelections = /* @__PURE__ */ new Map();
  function pruneSelections(now) {
    for (const [token, selection] of folderSelections) {
      if (selection.expiresAt <= now) folderSelections.delete(token);
    }
    while (folderSelections.size > 32) {
      const oldest = folderSelections.keys().next().value;
      if (oldest === void 0) break;
      folderSelections.delete(oldest);
    }
  }
  let cachedOrigin = null;
  async function publicOrigin() {
    const now = Date.now();
    if (cachedOrigin && now - cachedOrigin.at < 3e4) {
      return cachedOrigin.origin;
    }
    let origin = null;
    try {
      const status = await bb.sdk.plugins.callRpc({
        pluginId: "connect",
        method: "status",
        input: null,
        // The Connect contract validates its own output; we only read two
        // fields, so an identity schema keeps zod out of this plugin.
        outputSchema: {
          parse: (value) => value
        }
      });
      if (status && status.state === "connected" && typeof status.url === "string") {
        origin = new URL(status.url).origin;
      }
    } catch {
      origin = null;
    }
    cachedOrigin = origin === null ? null : { at: now, origin };
    return origin;
  }
  async function pageAvailability(threadId) {
    try {
      const page = await pages.load(threadId);
      return { available: true, revision: page.hash };
    } catch {
      return { available: false, revision: null };
    }
  }
  const assetPreviews = /* @__PURE__ */ new Map();
  async function assetBaseUrl(threadId, signal) {
    const now = Date.now();
    const cached = assetPreviews.get(threadId);
    if (cached && cached.expiresAtMs - 3e4 > now) return cached.baseUrl;
    try {
      const location = await bb.sdk.threads.storageLocation({
        threadId,
        signal
      });
      const rootPath = assetDirPath(location.storageRootPath);
      const listed = await bb.sdk.files.list({
        hostId: location.hostId,
        path: rootPath,
        limit: 1,
        signal
      });
      if (!listed) return null;
      const preview = await bb.sdk.files.createPreview({
        hostId: location.hostId,
        rootPath,
        ttlMs: ASSET_PREVIEW_TTL_MS,
        signal
      });
      const baseUrl = preview.baseUrl.endsWith("/") ? preview.baseUrl : `${preview.baseUrl}/`;
      assetPreviews.set(threadId, {
        baseUrl,
        expiresAtMs: preview.expiresAtMs
      });
      if (assetPreviews.size > 64) {
        for (const [key, value] of assetPreviews) {
          if (value.expiresAtMs <= now) assetPreviews.delete(key);
        }
      }
      return baseUrl;
    } catch {
      return null;
    }
  }
  const recentSubmissions = /* @__PURE__ */ new Map();
  const recentReplies = /* @__PURE__ */ new Map();
  const viewerRates = /* @__PURE__ */ new Map();
  function acquireViewerRequest(threadId, actionToken, now) {
    for (const [key2, entry2] of viewerRates) {
      if (entry2.inFlight === 0 && now - entry2.touchedAt > VIEWER_TOKEN_TTL_MS) {
        viewerRates.delete(key2);
      }
    }
    const key = `${threadId}:${sha256Text(actionToken)}`;
    const current = viewerRates.get(key);
    const entry = current ?? { windowStartedAt: now, accepted: 0, inFlight: 0, touchedAt: now };
    if (now - entry.windowStartedAt >= 6e4) {
      entry.windowStartedAt = now;
      entry.accepted = 0;
    }
    if (entry.inFlight >= 4 || entry.accepted >= 30) return null;
    entry.accepted += 1;
    entry.inFlight += 1;
    entry.touchedAt = now;
    viewerRates.set(key, entry);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.inFlight = Math.max(0, entry.inFlight - 1);
      entry.touchedAt = Date.now();
    };
  }
  function pruneSubmissions(now) {
    for (const [key, entry] of recentSubmissions) {
      if (entry.expiresAt <= now) recentSubmissions.delete(key);
    }
    while (recentSubmissions.size >= MAX_RECENT_SUBMISSIONS) {
      const oldest = recentSubmissions.keys().next().value;
      if (!oldest) break;
      recentSubmissions.delete(oldest);
    }
  }
  function pruneReplies(now) {
    for (const [key, entry] of recentReplies) {
      if (entry.expiresAt <= now) recentReplies.delete(key);
    }
    while (recentReplies.size >= MAX_RECENT_SUBMISSIONS) {
      const oldest = recentReplies.keys().next().value;
      if (!oldest) break;
      recentReplies.delete(oldest);
    }
  }
  bb.cli.register({
    name: "thread-page",
    summary: "Initialize the directly editable HTML page for the current thread",
    commands: [
      {
        name: "init",
        summary: "Create the current thread's page if it does not exist",
        usage: "bb thread-page init"
      },
      {
        name: "guide",
        summary: "Print the optional authoring and bridge guide",
        usage: "bb thread-page guide"
      },
      {
        name: "home",
        summary: "Make this thread's page the home page every page links to",
        usage: "bb thread-page home [--clear]"
      }
    ],
    async run(argv, context) {
      if (argv.length === 1 && argv[0] === "guide") {
        return { exitCode: 0, stdout: `${AUTHORING_GUIDE}
` };
      }
      if (argv[0] === "home") {
        if (argv.length === 2 && argv[1] === "--clear") {
          await settings.experimental_set({ homeThreadId: null });
          return {
            exitCode: 0,
            stdout: "home: cleared \u2014 pages no longer show a Sessions link\n"
          };
        }
        if (argv.length !== 1) {
          return {
            exitCode: 2,
            stderr: "Usage: bb thread-page home [--clear]\n"
          };
        }
        if (!context.threadId) {
          return {
            exitCode: 2,
            stderr: "Run `bb thread-page home` from the thread that should be home.\n"
          };
        }
        await settings.experimental_set({ homeThreadId: context.threadId });
        let wrote = false;
        try {
          const location = await bb.sdk.threads.storageLocation({
            threadId: context.threadId,
            signal: context.signal
          });
          const home = renderHomeSeed(currentSettings.pageSeedHtml);
          const write = await bb.sdk.files.write({
            hostId: location.hostId,
            path: pagePath(location.storageRootPath),
            rootPath: location.storageRootPath,
            content: home,
            createParents: true,
            expectedSha256: null,
            mode: 384
          });
          if (write.outcome === "written") {
            wrote = true;
            await pages.remember(context.threadId, {
              fragment: home,
              hash: /^[a-f0-9]{64}$/i.test(write.sha256) ? write.sha256.toLowerCase() : sha256Text(home),
              updatedAt: Date.now()
            });
          }
        } catch (error) {
          bb.log.warn(
            `Could not seed the home page for ${context.threadId}: ${errorText(error)}`
          );
        }
        const origin = await publicOrigin();
        const homeRoute = `${baseRoute}/home`;
        return {
          exitCode: 0,
          stdout: [
            `home: ${context.threadId}`,
            `link: [Sessions](${origin ? `${origin}${homeRoute}` : homeRoute})`,
            "Every other page now shows a Sessions link back to this one.",
            wrote ? "state: NEW \u2014 a session hub grouped by project was written for you. Adjust it like any page." : "state: EXISTING \u2014 this thread already had a page; it was left alone. It should list threads with threads.snapshot.",
            ""
          ].join("\n")
        };
      }
      if (argv.length !== 1 || argv[0] !== "init") {
        return {
          exitCode: 2,
          stderr: "Usage: bb thread-page <init|guide|home>\n"
        };
      }
      if (!context.threadId) {
        return {
          exitCode: 0,
          stdout: "state: SKIP \u2014 no current root thread; answer normally without creating a page.\n"
        };
      }
      try {
        const thread = await bb.sdk.threads.get({
          threadId: context.threadId,
          signal: context.signal
        });
        if (!isEligibleThread(thread)) {
          return {
            exitCode: 0,
            stdout: "state: SKIP \u2014 not a current root owner thread; answer normally without creating a page.\n"
          };
        }
        const location = await bb.sdk.threads.storageLocation({
          threadId: context.threadId,
          signal: context.signal
        });
        const absolutePath = pagePath(location.storageRootPath);
        const title2 = thread.title ?? thread.titleFallback ?? "Thread Page";
        const fragment = renderPageSeed(currentSettings.pageSeedHtml, title2);
        if (Buffer.byteLength(fragment, "utf8") > MAX_PAGE_BYTES) {
          throw new PageTooLargeError();
        }
        const write = await bb.sdk.files.write({
          hostId: location.hostId,
          path: absolutePath,
          rootPath: location.storageRootPath,
          content: fragment,
          createParents: true,
          expectedSha256: null,
          mode: 384
        });
        let state;
        if (write.outcome === "written") {
          state = "created";
          await pages.remember(context.threadId, {
            fragment,
            hash: /^[a-f0-9]{64}$/i.test(write.sha256) ? write.sha256.toLowerCase() : sha256Text(fragment),
            updatedAt: Date.now()
          });
        } else {
          state = "existing";
          await pages.load(context.threadId, context.signal);
        }
        const route = `${baseRoute}/page?threadId=${encodeURIComponent(context.threadId)}`;
        const origin = await publicOrigin();
        const link = origin ? `${origin}${route}` : route;
        return {
          exitCode: 0,
          stdout: [
            `page: ${absolutePath}`,
            `link: [Open the Thread Page](${link})`,
            state === "created" ? "state: NEW \u2014 seeded; make this HTML app fit the task, keep a response path, then reply in chat only with the link." : "state: EXISTING \u2014 read before editing; update the HTML app every turn, keep a response path, then reply in chat only with the link.",
            "guide: bb thread-page guide  (only when the page needs custom UI, files, activity, or bridge methods)",
            ""
          ].join("\n")
        };
      } catch (error) {
        return {
          exitCode: 1,
          stderr: `Could not initialize Thread Page: ${errorText(error)}
`
        };
      }
    }
  });
  bb.http.route(
    "GET",
    "/page",
    async (context) => {
      const threadId = new URL(context.req.url).searchParams.get("threadId");
      if (!isValidThreadId(threadId)) {
        return errorPage("A valid threadId query parameter is required.", 400);
      }
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (!isEligibleThread(thread)) {
          return errorPage("Thread Pages are available only for current root threads.", 404);
        }
        const page = await pages.load(threadId);
        const now = Date.now();
        const renderPayload = {
          v: 2,
          scope: "render",
          threadId,
          pageHash: page.hash,
          iat: now,
          exp: now + VIEWER_TOKEN_TTL_MS
        };
        const actionPayload = {
          ...renderPayload,
          scope: "action"
        };
        const renderToken = signPageToken(renderPayload, signingKey);
        const actionToken = signPageToken(actionPayload, signingKey);
        const documentUrl = `${baseRoute}/document?render=${encodeURIComponent(renderToken)}`;
        const nonce = randomBytes(18).toString("base64url");
        const title2 = thread.title ?? thread.titleFallback ?? "Thread Page";
        const html = renderOuterPage({
          nonce,
          title: title2,
          actionToken,
          pageHash: page.hash,
          expiresAt: renderPayload.exp,
          documentUrl,
          submitUrl: `${baseRoute}/submit`,
          uploadUrl: `${baseRoute}/upload`,
          bridgeUrl: `${baseRoute}/bridge`,
          pageUrlTemplate: `${baseRoute}/page?threadId=__THREAD__`,
          bbThreadUrlTemplate: `/threads/__THREAD__`,
          // The home link is chrome, so every page gets it without the agent
          // writing one. Home itself gets no link back to itself.
          homeUrl: isValidThreadId(currentSettings.homeThreadId.trim()) && currentSettings.homeThreadId.trim() !== threadId ? `${baseRoute}/home` : null,
          working: activityState(thread) === "working",
          workingLabel: currentSettings.workingLabel,
          stale: page.stale
        });
        return new Response(html, { status: 200, headers: outerHeaders(nonce) });
      } catch (error) {
        return errorPage(publicMessage(error), errorStatus(error));
      }
    },
    { auth: "local" }
  );
  bb.http.route(
    "GET",
    "/home",
    async () => {
      const homeThreadId = currentSettings.homeThreadId.trim();
      if (!isValidThreadId(homeThreadId)) {
        return errorPage(
          "No home page is set yet. Run `bb thread-page home` in the thread whose page should be home.",
          404
        );
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: `${baseRoute}/page?threadId=${encodeURIComponent(homeThreadId)}`,
          "cache-control": "no-store, max-age=0"
        }
      });
    },
    { auth: "local" }
  );
  const serveDocument = async (context) => {
    const renderToken = new URL(context.req.url).searchParams.get("render");
    const payload = renderToken ? verifyPageToken(renderToken, signingKey, "render") : null;
    if (!payload) return errorPage("This page session is invalid or expired.", 401);
    try {
      const thread = await bb.sdk.threads.get({ threadId: payload.threadId });
      if (!isEligibleThread(thread)) {
        return errorPage("This thread no longer has an active Thread Page.", 404);
      }
      const page = await pages.load(payload.threadId);
      const nonce = randomBytes(18).toString("base64url");
      const assetBase = await assetBaseUrl(payload.threadId);
      const headers = documentHeaders(
        nonce,
        page,
        assetCspSource(assetBase, context.req.url),
        activityState(thread)
      );
      const etag = etagForHash(page.hash);
      const ifNoneMatch = context.req.header("if-none-match");
      const matches = parseIfNoneMatch(ifNoneMatch).some(
        (candidate) => candidate === etag || candidate === "*"
      );
      if (matches) return new Response(null, { status: 304, headers });
      if (ifNoneMatch) return new Response(null, { status: 200, headers });
      if (page.hash !== payload.pageHash) {
        return errorPage("This page changed. Reload the outer Thread Page.", 409);
      }
      const html = renderDocument({
        fragment: page.fragment,
        nonce,
        pageHash: page.hash,
        stale: page.stale,
        assetBase
      });
      return new Response(html, { status: 200, headers });
    } catch (error) {
      return errorPage(publicMessage(error), errorStatus(error));
    }
  };
  bb.http.route("GET", "/document", serveDocument, { auth: "local" });
  bb.http.route(
    "POST",
    "/upload",
    async (context) => {
      const maxBodyBytes = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 4096;
      const declared = Number(context.req.header("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > maxBodyBytes) {
        return jsonResponse(
          { ok: false, error: "Attachments must be smaller than 24 MiB" },
          413
        );
      }
      let envelope;
      try {
        const decoded = await context.req.json();
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
          throw new Error("not an object");
        }
        envelope = decoded;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const actionToken = typeof envelope.actionToken === "string" ? envelope.actionToken : "";
      const action = actionToken.length > 0 && actionToken.length <= 4096 ? verifyPageToken(actionToken, signingKey, "action") : null;
      if (!action) {
        return jsonResponse(
          { ok: false, error: "Page session is invalid or expired" },
          401
        );
      }
      if (typeof envelope.content !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.content) || envelope.content.length > maxBodyBytes) {
        return jsonResponse(
          { ok: false, error: "Attachment content must be base64" },
          400
        );
      }
      const now = Date.now();
      const releaseRequest = acquireViewerRequest(
        action.threadId,
        actionToken,
        now
      );
      if (!releaseRequest) {
        return jsonResponse(
          { ok: false, error: "Too many Thread Page requests; try again shortly" },
          429
        );
      }
      try {
        const thread = await bb.sdk.threads.get({ threadId: action.threadId });
        if (!isEligibleThread(thread)) {
          return jsonResponse(
            { ok: false, error: "This thread no longer accepts attachments" },
            409
          );
        }
        const body = Buffer.from(envelope.content, "base64");
        if (body.byteLength === 0) {
          return jsonResponse({ ok: false, error: "The file is empty" }, 400);
        }
        if (body.byteLength > MAX_UPLOAD_BYTES) {
          return jsonResponse(
            { ok: false, error: "Attachments must be smaller than 24 MiB" },
            413
          );
        }
        const name = safeUploadName(
          typeof envelope.name === "string" ? envelope.name : "upload"
        );
        const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
        const unique = randomBytes(3).toString("hex");
        const filename = `${stamp}-${unique}-${name}`;
        const location = await bb.sdk.threads.storageLocation({
          threadId: action.threadId
        });
        const directory = uploadDirPath(location.storageRootPath);
        await bb.sdk.files.write({
          hostId: location.hostId,
          path: `${directory}/${filename}`,
          rootPath: location.storageRootPath,
          content: body.toString("base64"),
          contentEncoding: "base64",
          createParents: true,
          expectedSha256: null,
          mode: 384
        });
        return jsonResponse({
          ok: true,
          name: filename,
          path: `${UPLOAD_DIRNAME}/${filename}`,
          sizeBytes: body.byteLength
        });
      } catch (error) {
        bb.log.warn(
          `Could not store a Thread Page upload for ${action.threadId}: ${errorText(error)}`
        );
        return jsonResponse(
          { ok: false, error: "The attachment could not be stored" },
          503
        );
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" }
  );
  bb.http.route(
    "POST",
    "/submit",
    async (context) => {
      const contentLength = Number(context.req.header("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_SUBMISSION_BYTES) {
        return jsonResponse({ ok: false, error: "Submission is too large" }, 413);
      }
      let raw;
      let decoded;
      try {
        raw = await context.req.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_SUBMISSION_BYTES) {
          return jsonResponse({ ok: false, error: "Submission is too large" }, 413);
        }
        decoded = JSON.parse(raw);
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const submission = parseSubmission(decoded);
      if (!submission) {
        return jsonResponse({ ok: false, error: "Invalid submission" }, 400);
      }
      const action = verifyPageToken(
        submission.actionToken,
        signingKey,
        "action"
      );
      if (!action) {
        return jsonResponse(
          { ok: false, error: "Page session is invalid or expired" },
          401
        );
      }
      if (submission.pageHash !== action.pageHash) {
        return jsonResponse(
          { ok: false, error: "This form belongs to an older page revision" },
          409
        );
      }
      const now = Date.now();
      const releaseRequest = acquireViewerRequest(
        action.threadId,
        submission.actionToken,
        now
      );
      if (!releaseRequest) {
        return jsonResponse(
          { ok: false, error: "Too many Thread Page requests; try again shortly" },
          429
        );
      }
      try {
        pruneSubmissions(now);
        const dedupeKey = `${action.threadId}:${submission.submissionId}`;
        const fingerprint = sha256Text(
          JSON.stringify({
            pageHash: submission.pageHash,
            title: submission.title,
            answers: submission.answers,
            files: submission.files
          })
        );
        const existing = recentSubmissions.get(dedupeKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            return jsonResponse(
              { ok: false, error: "Submission ID was reused with different answers" },
              409
            );
          }
          const repeated = await existing.outcome;
          return jsonResponse(repeated.body, repeated.status);
        }
        const outcome = (async () => {
          try {
            const thread = await bb.sdk.threads.get({ threadId: action.threadId });
            if (!isEligibleThread(thread)) {
              return {
                body: {
                  ok: false,
                  error: "This thread no longer accepts Thread Page responses"
                },
                status: 409
              };
            }
            const page = await pages.load(action.threadId);
            if (page.stale) {
              return {
                body: {
                  ok: false,
                  error: "The source host is offline; this cached page is read-only"
                },
                status: 503
              };
            }
            if (page.hash !== action.pageHash) {
              return {
                body: {
                  ok: false,
                  error: "This page changed; reload it before responding"
                },
                status: 409
              };
            }
            const sent = await bb.sdk.threads.send({
              threadId: action.threadId,
              mode: "queue-if-active",
              input: [
                {
                  type: "text",
                  text: formatSubmissionMessage(submission),
                  mentions: []
                }
              ]
            });
            return {
              body: { ok: true, delivery: sent.delivery },
              status: 200
            };
          } catch (error) {
            bb.log.warn(
              `Could not deliver Thread Page submission to ${action.threadId}: ${errorText(error)}`
            );
            return {
              body: {
                ok: false,
                error: "Could not deliver the response to this thread"
              },
              status: 503
            };
          }
        })();
        recentSubmissions.set(dedupeKey, {
          expiresAt: now + SUBMISSION_TTL_MS,
          fingerprint,
          outcome
        });
        const delivered = await outcome;
        return jsonResponse(delivered.body, delivered.status);
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" }
  );
  bb.http.route(
    "POST",
    "/bridge",
    async (context) => {
      const contentLength = Number(context.req.header("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_BRIDGE_BODY_BYTES) {
        return jsonResponse(
          makeBridgeFailureResponse(
            void 0,
            "request_too_large",
            "Bridge request is too large"
          ),
          413
        );
      }
      let decoded;
      try {
        const raw = await context.req.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_BRIDGE_BODY_BYTES) {
          return jsonResponse(
            makeBridgeFailureResponse(
              void 0,
              "request_too_large",
              "Bridge request is too large"
            ),
            413
          );
        }
        decoded = JSON.parse(raw);
      } catch {
        return jsonResponse(
          makeBridgeFailureResponse(
            void 0,
            "invalid_json",
            "Invalid JSON body"
          ),
          400
        );
      }
      const envelope = parseBridgeEnvelope(decoded);
      if (!envelope) {
        return jsonResponse(
          makeBridgeFailureResponse(
            void 0,
            "invalid_request",
            "Invalid bridge envelope"
          ),
          400
        );
      }
      const requestId = requestIdFrom(envelope.request);
      const action = verifyPageToken(
        envelope.actionToken,
        signingKey,
        "action"
      );
      if (!action) {
        return jsonResponse(
          makeBridgeFailureResponse(
            requestId,
            "invalid_request",
            "Page action session is invalid or expired"
          ),
          401
        );
      }
      const releaseRequest = acquireViewerRequest(
        action.threadId,
        envelope.actionToken,
        Date.now()
      );
      if (!releaseRequest) {
        return jsonResponse(
          makeBridgeFailureResponse(
            requestId,
            "rate_limited",
            "Too many Thread Page requests; try again shortly"
          ),
          429
        );
      }
      try {
        const resolved = resolveBridgeInvocation(
          envelope.request,
          enabledBridgeRegistry,
          action.pageHash
        );
        if (!resolved.ok) {
          return jsonResponse(
            makeBridgeFailureResponse(
              requestId,
              resolved.error.code,
              resolved.error.message
            ),
            bridgeFailureStatus(resolved.error.code)
          );
        }
        const nowForAuth = Date.now();
        let confirmation = null;
        if (resolved.value.capability.confirmation === "trusted-outer") {
          const paramsHash = sha256Text(
            stableJsonStringify(resolved.value.request.params)
          );
          if (envelope.confirmation === null) {
            const summary = (resolved.value.capability.summarize?.(
              resolved.value.params
            ) ?? resolved.value.capability.description).slice(0, 512);
            const challenge = signConfirmationChallenge(
              {
                v: 2,
                scope: "confirm",
                threadId: action.threadId,
                pageHash: action.pageHash,
                requestId: resolved.value.request.id,
                method: resolved.value.request.method,
                paramsHash,
                summary,
                iat: nowForAuth,
                exp: nowForAuth + CONFIRMATION_TTL_MS
              },
              signingKey
            );
            return jsonResponse(
              {
                confirm: {
                  requestId: resolved.value.request.id,
                  summary,
                  challenge
                }
              },
              401
            );
          }
          const verified = verifyConfirmationChallenge(
            envelope.confirmation,
            signingKey,
            nowForAuth
          );
          if (!verified || verified.threadId !== action.threadId || verified.pageHash !== action.pageHash || verified.requestId !== resolved.value.request.id || verified.method !== resolved.value.request.method || verified.paramsHash !== paramsHash) {
            return jsonResponse(
              makeBridgeFailureResponse(
                requestId,
                "confirmation_invalid",
                "Confirmation is expired or does not match this request"
              ),
              bridgeFailureStatus("confirmation_invalid")
            );
          }
          confirmation = createTrustedOuterConfirmation(resolved.value, {
            confirmedAtMs: verified.iat,
            expiresAtMs: verified.exp,
            humanSummary: verified.summary
          });
        }
        const authorized = authorizeBridgeInvocation(
          resolved.value,
          confirmation,
          nowForAuth
        );
        if (!authorized.ok) {
          return jsonResponse(
            makeBridgeFailureResponse(
              requestId,
              authorized.error.code,
              authorized.error.message
            ),
            bridgeFailureStatus(authorized.error.code)
          );
        }
        const invocation = authorized.value;
        try {
          const thread = await bb.sdk.threads.get({ threadId: action.threadId });
          if (!isEligibleThread(thread)) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "conflict",
                "This thread no longer accepts Thread Page actions"
              ),
              409
            );
          }
          const page = await pages.load(action.threadId);
          if (page.hash !== action.pageHash) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "stale_page",
                "The Thread Page revision has changed"
              ),
              409
            );
          }
          if (invocation.request.method === "context.get") {
            const response2 = completeBridgeInvocation(invocation, {
              protocolVersion: 1,
              thread: {
                id: thread.id,
                title: (thread.title ?? thread.titleFallback ?? "Thread Page").slice(
                  0,
                  240
                ),
                projectId: thread.projectId ?? null
              },
              page: { revision: page.hash, readOnly: page.stale },
              capabilities: capabilityDescriptors(enabledBridgeRegistry)
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "thread.activity") {
            const params2 = invocation.params;
            const events = await bb.sdk.threads.events.list({
              threadId: action.threadId,
              order: "desc",
              limit: "80",
              types: ["item/started", "item/completed"]
            });
            const response2 = completeBridgeInvocation(invocation, {
              state: activityState(thread),
              updatedAtMs: Math.max(0, Math.trunc(thread.updatedAt)),
              items: activityItems(events, params2.limit)
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "projects.list") {
            const projects = await bb.sdk.projects.list({
              includePersonal: true
            });
            const response2 = completeBridgeInvocation(invocation, {
              projects: projects.slice(0, 64).map((project) => ({
                id: project.id,
                name: project.name,
                kind: project.kind === "personal" ? "personal" : "standard"
              }))
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "threads.snapshot") {
            const params2 = invocation.params;
            const query = {
              ...params2.projectId ? { projectId: params2.projectId } : {},
              limit: params2.limit
            };
            const live = await bb.sdk.threads.list(query);
            const archived = params2.includeArchived ? await bb.sdk.threads.list({ ...query, archived: true }).catch(() => []) : [];
            const seen = /* @__PURE__ */ new Set();
            const listed = [...live, ...archived].filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            }).slice(0, params2.limit);
            const threads = await Promise.all(
              listed.map(async (item) => ({
                id: item.id,
                title: item.title ?? item.titleFallback ?? "Untitled",
                projectId: item.projectId ?? null,
                parentThreadId: item.parentThreadId ?? null,
                status: snapshotStatus(
                  item
                ),
                archived: item.archivedAt !== null,
                page: await pageAvailability(item.id),
                updatedAtMs: Math.max(0, Math.trunc(item.updatedAt))
              }))
            );
            const response2 = completeBridgeInvocation(invocation, {
              threads,
              nextCursor: null,
              generatedAtMs: Date.now()
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "threads.continue") {
            const params2 = invocation.params;
            if (params2.threadId === action.threadId) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "invalid_params",
                  "Use thread.reply for this page's own thread"
                ),
                400
              );
            }
            const target = await bb.sdk.threads.get({ threadId: params2.threadId }).catch(() => null);
            if (!target || target.deletedAt !== null) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That thread is not available"
                ),
                404
              );
            }
            const wasActive2 = target.status === "active" || target.status === "starting";
            const sent = await bb.sdk.threads.send({
              threadId: params2.threadId,
              mode: params2.mode === "steer" ? "steer-if-active" : "queue-if-active",
              input: [{ type: "text", text: params2.prompt, mentions: [] }]
            });
            const response2 = completeBridgeInvocation(invocation, {
              threadId: params2.threadId,
              delivery: sent.delivery === "queued" ? "queued" : params2.mode === "steer" && wasActive2 ? "steered" : "started",
              duplicate: false
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "projects.browse") {
            const location = await bb.sdk.threads.storageLocation({
              threadId: action.threadId
            });
            const picked = await bb.sdk.hosts.pickFolder({
              hostId: location.hostId,
              clientHostId: location.hostId
            });
            if (!picked.path) {
              const response3 = completeBridgeInvocation(invocation, {
                selection: null
              });
              return jsonResponse(response3, response3.ok ? 200 : 500);
            }
            const host = await bb.sdk.hosts.get({ hostId: location.hostId }).catch(() => null);
            const token = `sel.${randomBytes(18).toString("base64url")}`;
            pruneSelections(Date.now());
            folderSelections.set(token, {
              expiresAt: Date.now() + SELECTION_TTL_MS,
              threadId: action.threadId,
              hostId: location.hostId,
              path: picked.path
            });
            const response2 = completeBridgeInvocation(invocation, {
              selection: {
                token,
                displayPath: picked.path.replace(/^\/Users\/[^/]+/, "~"),
                hostName: host?.name ?? "this device"
              }
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "projects.create") {
            const params2 = invocation.params;
            pruneSelections(Date.now());
            const selection = folderSelections.get(params2.selectionToken);
            if (!selection || selection.threadId !== action.threadId) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That folder selection has expired; choose the folder again"
                ),
                404
              );
            }
            folderSelections.delete(params2.selectionToken);
            const created = await bb.sdk.projects.create({
              name: params2.name ?? selection.path.split("/").pop() ?? "New project",
              hostId: selection.hostId,
              path: selection.path
            });
            const response2 = completeBridgeInvocation(invocation, {
              project: {
                id: created.id,
                name: created.name,
                kind: created.kind === "personal" ? "personal" : "standard"
              }
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "storage.get" || invocation.request.method === "storage.set") {
            const params2 = invocation.params;
            const key = `state:${action.threadId}:${params2.key}`;
            if (invocation.request.method === "storage.get") {
              const stored = await bb.storage.kv.get(key);
              const response3 = completeBridgeInvocation(
                invocation,
                stored === void 0 ? { found: false } : { found: true, value: stored }
              );
              return jsonResponse(response3, response3.ok ? 200 : 500);
            }
            await bb.storage.kv.set(key, params2.value ?? null);
            const response2 = completeBridgeInvocation(invocation, {
              stored: true
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "providers.list") {
            const providers = await bb.sdk.providers.list();
            const models = await bb.sdk.providers.models().catch(() => []);
            const byProvider = /* @__PURE__ */ new Map();
            for (const model of models) {
              const providerId = typeof model.providerId === "string" ? model.providerId : null;
              const id = typeof model.id === "string" ? model.id : null;
              if (!providerId || !id) continue;
              const list = byProvider.get(providerId) ?? [];
              if (list.length < 32) {
                list.push({
                  id,
                  displayName: typeof model.displayName === "string" ? model.displayName : id
                });
              }
              byProvider.set(providerId, list);
            }
            const response2 = completeBridgeInvocation(invocation, {
              providers: providers.slice(0, 64).map((provider) => {
                const id = String(provider.id ?? "");
                return {
                  id,
                  displayName: String(
                    provider.displayName ?? provider.name ?? id
                  ),
                  available: provider.available !== false,
                  models: byProvider.get(id) ?? []
                };
              })
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "threads.spawn") {
            const params2 = invocation.params;
            const spawned = await bb.sdk.threads.spawn({
              projectId: params2.projectId,
              prompt: params2.prompt,
              ...params2.title ? { title: params2.title } : {},
              ...params2.providerId ? { providerId: params2.providerId } : {},
              ...params2.model ? { model: params2.model } : {},
              ...params2.reasoningLevel ? { reasoningLevel: params2.reasoningLevel } : {},
              // A thread the user asked a page to start is theirs, so it is a
              // visible root rather than a hidden helper of this thread.
              visibility: "visible"
            });
            const response2 = completeBridgeInvocation(invocation, {
              threadId: spawned.id
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (invocation.request.method === "threads.archive" || invocation.request.method === "threads.stop") {
            const params2 = invocation.params;
            const destructive = invocation.request.method === "threads.stop";
            if (destructive && params2.threadId === action.threadId) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "invalid_params",
                  "A page cannot stop its own thread"
                ),
                400
              );
            }
            const target = await bb.sdk.threads.get({ threadId: params2.threadId }).catch(() => null);
            if (!target || target.deletedAt !== null) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "not_found",
                  "That thread is not available"
                ),
                404
              );
            }
            if (destructive) {
              await bb.sdk.threads.stop({ threadId: params2.threadId });
              const response3 = completeBridgeInvocation(invocation, {
                stopped: true
              });
              return jsonResponse(response3, response3.ok ? 200 : 500);
            }
            await bb.sdk.threads.archive({ threadId: params2.threadId });
            const response2 = completeBridgeInvocation(invocation, {
              archived: true
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          if (page.stale) {
            return jsonResponse(
              makeBridgeFailureResponse(
                invocation.request.id,
                "unavailable",
                "The source host is offline; this cached page is read-only"
              ),
              503
            );
          }
          const params = invocation.params;
          const dedupeKey = `${action.threadId}:${params.idempotencyKey ?? invocation.request.id}`;
          const fingerprint = sha256Text(
            stableJsonStringify({
              pageRevision: page.hash,
              result: params.result,
              mode: params.mode,
              ...params.title === void 0 ? {} : { title: params.title }
            })
          );
          const now = Date.now();
          pruneReplies(now);
          const existing = recentReplies.get(dedupeKey);
          if (existing) {
            if (existing.fingerprint !== fingerprint) {
              return jsonResponse(
                makeBridgeFailureResponse(
                  invocation.request.id,
                  "conflict",
                  "Idempotency key was reused with a different reply"
                ),
                409
              );
            }
            const repeated = await existing.outcome;
            const response2 = completeBridgeInvocation(invocation, {
              ...repeated,
              duplicate: true
            });
            return jsonResponse(response2, response2.ok ? 200 : 500);
          }
          const wasActive = thread.status === "active" || thread.status === "starting";
          const outcome = (async () => {
            const sent = await bb.sdk.threads.send({
              threadId: action.threadId,
              mode: params.mode === "steer" ? "steer-if-active" : "queue-if-active",
              input: [
                {
                  type: "text",
                  text: formatThreadReplyMessage(params.title, params.result),
                  mentions: []
                }
              ]
            });
            const delivery = sent.delivery === "queued" ? "queued" : params.mode === "steer" && wasActive ? "steered" : "started";
            return { delivery, duplicate: false };
          })();
          recentReplies.set(dedupeKey, {
            expiresAt: now + SUBMISSION_TTL_MS,
            fingerprint,
            outcome
          });
          let delivered;
          try {
            delivered = await outcome;
          } catch (error) {
            if (recentReplies.get(dedupeKey)?.outcome === outcome) {
              recentReplies.delete(dedupeKey);
            }
            throw error;
          }
          const response = completeBridgeInvocation(invocation, delivered);
          return jsonResponse(response, response.ok ? 200 : 500);
        } catch (error) {
          bb.log.warn(
            `Could not execute Thread Page bridge request for ${action.threadId}: ${errorText(error)}`
          );
          return jsonResponse(
            makeBridgeFailureResponse(
              invocation.request.id,
              "handler_error",
              "Could not execute the Thread Page action"
            ),
            503
          );
        }
      } finally {
        releaseRequest();
      }
    },
    { auth: "local" }
  );
}
export {
  ENABLED_BRIDGE_METHODS,
  threadPagesPlugin as default
};
//# sourceMappingURL=server.js.map
