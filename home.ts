/**
 * The default home page.
 *
 * Written by `bb thread-page home`, and an ordinary Thread Page afterwards: the
 * owning agent can redesign any part of it on request. It is long because it is
 * written once and read rarely, and because a weak default would push every user
 * into rebuilding it.
 *
 * The design decision that matters: sessions are grouped, and a group is not
 * hard-wired to a project. A group is a label, a look, and a set of project ids,
 * stored in this page's own scoped storage. The default grouping is one group
 * per project because that is what a new user expects, but the same page renders
 * "Work", "Side projects", or anything else the user asks for, and a project can
 * appear in more than one group. Each group carries its own `data-world`, which
 * re-resolves the design tokens for that subtree — so a project genuinely looks
 * different without a second document or a second stylesheet.
 */
export const DEFAULT_HOME_BODY = String.raw`  <header class="brief-head">
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

export const DEFAULT_HOME_STYLE = String.raw`@scope (main) {
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

export const DEFAULT_HOME_SCRIPT = String.raw`(() => {
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
