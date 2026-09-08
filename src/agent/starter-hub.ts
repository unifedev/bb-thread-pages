/**
 * The starter home page: the `<main>` an agent drops into its page to get a
 * working session hub. It is the guide's worked example (§The home page) and
 * the shape a person gets when they ask for a home page.
 *
 * Design: dense and attention-first. A sticky bar with search and a view
 * toggle; projects that need the reader first; per project the sessions that
 * need attention plus the five most recent, with "Show 10 more" — the same
 * rule the host's own sidebar uses; one line per session with the state, the
 * title (opens the page, or the session in bb when there is no page), how
 * long ago, and the actions that matter: bb, Stop, Archive.
 */
export const STARTER_HUB_MAIN = String.raw`<div class="hub-bar">
  <input type="search" data-search placeholder="Find a session…  (press /)" aria-label="Find a session" autocomplete="off">
  <span class="hub-views" role="group" aria-label="View">
    <button type="button" data-view="attention" aria-pressed="true">Needs you</button>
    <button type="button" data-view="all" aria-pressed="false">All</button>
  </span>
  <button type="button" data-refresh title="Refresh">↻</button>
  <span class="hub-meta" data-meta></span>
</div>
<p data-error class="needs-you" hidden></p>
<div data-groups aria-live="polite"></div>
<p class="hub-foot">Rows follow bb: no archived sessions, sub-agents hidden, five per project then “more”. This page belongs to the session that built it; ask that session to change it.</p>

<style>
/* The hub is a list, so it takes the width the seed's prose does not need. */
.wrap { max-width: 68rem; }
@scope (main) {
  .hub-bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; padding: .6rem 0; background: var(--bg); border-bottom: var(--rule-w) solid var(--rule); }
  .hub-bar input[type="search"] { flex: 1 1 16rem; min-width: 0; margin: 0; padding: .45rem .6rem; font: inherit; font-size: .92rem; color: var(--ink); background: var(--surface); border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .7); }
  .hub-views { display: inline-flex; border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .7); overflow: hidden; }
  .hub-views button, .hub-bar > button { margin: 0; padding: .4rem .7rem; font: inherit; font-size: .85rem; font-weight: 600; color: var(--ink-2); background: var(--surface); border: 0; border-radius: 0; box-shadow: none; cursor: pointer; }
  .hub-views button[aria-pressed="true"] { color: var(--bg); background: var(--accent); }
  .hub-bar > button[data-refresh] { border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .7); }
  .hub-meta { margin-left: auto; font-size: .78rem; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .group { margin-top: 1rem; }
  .group-head { display: flex; align-items: baseline; gap: .6rem; padding: .3rem 0; border-bottom: var(--rule-w) solid var(--rule-soft); }
  .group-head h2 { margin: 0; font-size: .95rem; cursor: pointer; }
  .group-head .counts { font-size: .75rem; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .group-head .counts b { color: var(--ok); font-weight: 600; }
  .group-head .counts i { color: var(--accent); font-style: normal; font-weight: 600; }
  .group-head .counts s { color: var(--flag); text-decoration: none; font-weight: 600; }
  .group-head button { margin: 0 0 0 auto; padding: .15rem .55rem; font: inherit; font-size: .78rem; font-weight: 600; color: var(--accent); background: transparent; border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .6); box-shadow: none; cursor: pointer; }
  .row { display: grid; grid-template-columns: .6rem minmax(0, 1fr) auto auto; gap: .6rem; align-items: center; min-height: 2.1rem; padding: .1rem 0; border-bottom: var(--rule-w) solid var(--rule-soft); }
  .row .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--rule); }
  .row[data-status="working"] .dot { background: var(--ok); }
  .row[data-status="waiting"] .dot { background: var(--flag); }
  .row[data-status="failed"] .dot { background: var(--flag); box-shadow: 0 0 0 2px color-mix(in srgb, var(--flag) 35%, transparent); }
  .row[data-unread="true"] .dot { outline: 2px solid var(--accent); outline-offset: 1px; }
  @media (prefers-reduced-motion: no-preference) { .row[data-status="working"] .dot { animation: hub-pulse 1.4s ease-in-out infinite; } }
  @keyframes hub-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
  .row .title { margin: 0; padding: .2rem 0; font: inherit; font-size: .92rem; text-align: left; color: var(--ink); background: transparent; border: 0; border-radius: 0; box-shadow: none; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row[data-unread="true"] .title { font-weight: 700; }
  .row .title:hover, .row .title:focus-visible { color: var(--accent); }
  .row .when { font-size: .75rem; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .row .when em { font-style: normal; color: var(--flag); }
  .row .acts { display: flex; gap: .3rem; }
  .row .acts button { margin: 0; padding: .1rem .5rem; font: inherit; font-size: .75rem; font-weight: 600; color: var(--ink-2); background: transparent; border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .6); box-shadow: none; cursor: pointer; }
  .row .acts button:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .row .acts button[data-danger]:hover:not(:disabled) { color: var(--flag); border-color: var(--flag); }
  .more { margin: .3rem 0 0; padding: .2rem 0; font: inherit; font-size: .78rem; color: var(--accent); background: transparent; border: 0; box-shadow: none; cursor: pointer; }
  .starter { margin: .5rem 0 0; display: grid; gap: .4rem; }
  .starter textarea { width: 100%; min-height: 3.2rem; margin: 0; padding: .5rem .65rem; font: inherit; font-size: .88rem; line-height: 1.5; color: var(--ink); background: var(--surface); border: var(--rule-w) solid var(--rule); border-radius: calc(var(--radius) * .7); resize: vertical; }
  .starter textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .starter button { justify-self: start; margin: 0; padding: .4rem .9rem; font: inherit; font-size: .85rem; font-weight: 600; color: var(--bg); background: var(--accent); border: var(--rule-w) solid var(--accent); border-radius: calc(var(--radius) * .7); box-shadow: none; cursor: pointer; }
  .starter button:disabled { opacity: .6; cursor: default; }
  .starter .say { font-size: .78rem; color: var(--ink-3); }
  .empty { margin: .6rem 0; font-size: .85rem; color: var(--ink-3); }
  .hub-foot { margin-top: 1.5rem; font-size: .75rem; color: var(--ink-3); }
  @media (max-width: 40rem) { .row { grid-template-columns: .6rem minmax(0, 1fr) auto; } .row .when { display: none; } }
}
</style>

<script>
(async () => {
  const tp = window.threadPage;
  const $ = (s) => document.querySelector(s);
  const groupsEl = $("[data-groups]"), errorEl = $("[data-error]"), metaEl = $("[data-meta]"), searchEl = $("[data-search]");
  const PER_PROJECT = 5, MORE = 10;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const fail = (m) => { errorEl.hidden = false; errorEl.textContent = m; };
  // Needs you: running, waiting on you, or unread — a failed session only until you have looked at it.
  const needsYou = (s) => s.status === "working" || s.status === "waiting" || s.unread;
  const recency = (s) => Math.max(s.attentionAtMs || 0, s.updatedAtMs || 0);
  const ago = (ms) => { const d = Date.now() - ms; if (d < 60e3) return "now"; if (d < 3600e3) return Math.round(d / 60e3) + "m"; if (d < 86400e3) return Math.round(d / 3600e3) + "h"; return Math.round(d / 86400e3) + "d"; };

  let projects = [], sessions = [], prefs = { view: "attention", collapsed: {} };
  const expanded = {}, starters = new Set();

  async function loadPrefs() {
    try { const r = await tp.invoke("storage.get", { key: "home.prefs" }); if (r.found && r.value && typeof r.value === "object") prefs = { view: "attention", collapsed: {}, ...r.value }; } catch {}
  }
  const savePrefs = () => tp.invoke("storage.set", { key: "home.prefs", value: prefs }).catch(() => {});

  async function fetchAll() {
    const out = []; let cursor = null;
    for (let page = 0; page < 5; page += 1) {
      const r = await tp.invoke("sessions.snapshot", cursor ? { limit: 200, cursor } : { limit: 200 });
      out.push(...r.sessions); cursor = r.nextCursor; if (!cursor) break;
    }
    return out;
  }

  function act(label, run, danger) {
    const b = el("button", label); b.type = "button"; if (danger) b.dataset.danger = "";
    b.addEventListener("click", async (e) => { e.stopPropagation(); b.disabled = true;
      try { await run(); } catch (err) { if (err.code !== "cancelled") fail((err.code ? err.code + ": " : "") + err.message); }
      finally { b.disabled = false; } });
    return b;
  }

  function row(s) {
    const r = el("div", undefined, "row"); r.dataset.status = s.status; r.dataset.unread = String(!!s.unread);
    const title = el("button", s.title || "(untitled)", "title"); title.type = "button";
    title.title = s.page.available ? "Open its page" : "No page yet — opens the session in bb";
    title.addEventListener("click", () => tp.invoke(s.page.available ? "pages.open" : "sessions.openHost", { sessionId: s.id }).catch((e) => fail(e.message)));
    const when = el("span", undefined, "when");
    if (s.status === "failed") when.append(el("em", "failed · ")); else if (s.status === "waiting") when.append(el("em", "needs you · ")); else if (s.status === "working") when.append(el("em", "working · "));
    when.append(document.createTextNode(ago(recency(s))));
    const acts = el("span", undefined, "acts");
    if (s.page.available) acts.append(act("bb", () => tp.invoke("sessions.openHost", { sessionId: s.id })));
    if (s.status === "working") acts.append(act("Stop", async () => { await tp.invoke("sessions.stop", { sessionId: s.id }); await load(); }, true));
    acts.append(act(s.unread ? "Read" : "Unread", async () => { const r = await tp.invoke("sessions.markRead", { sessionId: s.id, read: !!s.unread }); s.unread = r.unread; render(); }));
    acts.append(act("Archive", async () => { await tp.invoke("sessions.archive", { sessionId: s.id }); sessions = sessions.filter((x) => x.id !== s.id); render(); }, true));
    r.append(el("span", undefined, "dot"), title, when, acts);
    return r;
  }

  function starter(project) {
    const box = el("div", undefined, "starter");
    const text = el("textarea"); text.placeholder = "What should the new session in " + project.name + " do? Say what to report and what not to change."; text.setAttribute("aria-label", text.placeholder);
    const say = el("span", undefined, "say");
    const go = act("Start session", async () => {
      const prompt = text.value.trim(); if (!prompt) { say.textContent = "Say what it should do."; return; }
      say.textContent = "Waiting for your confirmation…";
      try { await tp.invoke("sessions.start", { projectId: project.id, prompt }); say.textContent = "Started."; text.value = ""; starters.delete(project.id); await load(); }
      catch (e) { say.textContent = e.code === "cancelled" ? "Nothing started." : e.message; }
    });
    box.append(text, go, say);
    return box;
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const view = q ? "all" : prefs.view;
    groupsEl.textContent = "";
    let shown = 0, attention = 0;
    const byProject = new Map(projects.map((p) => [p.id, []]));
    for (const s of sessions) { if (byProject.has(s.projectId)) byProject.get(s.projectId).push(s); }
    const order = projects.slice().sort((a, b) => {
      const A = byProject.get(a.id), B = byProject.get(b.id);
      const na = A.filter(needsYou).length, nb = B.filter(needsYou).length;
      if ((na > 0) !== (nb > 0)) return na > 0 ? -1 : 1;
      return Math.max(0, ...B.map(recency)) - Math.max(0, ...A.map(recency));
    });
    for (const project of order) {
      const all = byProject.get(project.id).sort((a, b) => recency(b) - recency(a));
      attention += all.filter(needsYou).length;
      let list = q ? all.filter((s) => (s.title || "").toLowerCase().includes(q) || project.name.toLowerCase().includes(q)) : view === "attention" ? all.filter(needsYou) : all;
      if (view === "attention" && !q && list.length === 0) continue;
      const group = el("section", undefined, "group");
      const head = el("div", undefined, "group-head");
      const h = el("h2", project.name); h.title = "Collapse or expand";
      h.addEventListener("click", () => { prefs.collapsed[project.id] = !prefs.collapsed[project.id]; savePrefs(); render(); });
      const counts = el("span", undefined, "counts");
      const w = all.filter((s) => s.status === "working").length, u = all.filter((s) => s.unread).length, f = all.filter((s) => s.status === "waiting" || (s.status === "failed" && s.unread)).length;
      counts.append(document.createTextNode(all.length + " "));
      if (w) counts.append(el("b", w + " working ")); if (u) counts.append(el("i", u + " unread ")); if (f) counts.append(el("s", f + " need you"));
      const add = act("+ New", async () => { if (starters.has(project.id)) starters.delete(project.id); else starters.add(project.id); render(); });
      head.append(h, counts, add);
      group.append(head);
      if (!prefs.collapsed[project.id]) {
        let visible = list;
        if (view === "all" && !q) { const limit = PER_PROJECT + (expanded[project.id] || 0); visible = list.filter((s, i) => i < limit || needsYou(s)); }
        for (const s of visible) group.append(row(s));
        if (visible.length < list.length) { const more = el("button", "Show " + Math.min(MORE, list.length - visible.length) + " more of " + list.length, "more"); more.type = "button"; more.addEventListener("click", () => { expanded[project.id] = (expanded[project.id] || 0) + MORE; render(); }); group.append(more); }
        if (list.length === 0) group.append(el("p", q ? "No match." : "Nothing here.", "empty"));
        shown += visible.length;
      }
      if (starters.has(project.id)) group.append(starter(project));
      groupsEl.append(group);
    }
    if (!groupsEl.children.length) groupsEl.append(el("p", view === "attention" ? "Nothing needs you right now." : "No sessions.", "empty"));
    for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === prefs.view));
    metaEl.textContent = shown + " shown · " + attention + " need you · " + sessions.length + " total";
  }

  async function load() {
    try {
      errorEl.hidden = true;
      const [p, s] = await Promise.all([tp.invoke("projects.list"), fetchAll()]);
      projects = p.projects; sessions = s; render();
    } catch (e) { fail((e.code ? e.code + ": " : "") + e.message); }
  }

  for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => { prefs.view = b.dataset.view; savePrefs(); render(); });
  $("[data-refresh]").addEventListener("click", () => load());
  searchEl.addEventListener("input", render);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchEl && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); searchEl.focus(); }
    if (e.key === "Escape" && document.activeElement === searchEl) { searchEl.value = ""; render(); searchEl.blur(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });

  await loadPrefs();
  await load();
  tp.watch("session.activity", { limit: 1 }, () => load(), { intervalMs: 15000 });
})();
</script>`;

/** The starter hub indented for a Markdown code block. */
export function starterHubForGuide(): string {
  return STARTER_HUB_MAIN.split("\n")
    .map((line) => (line.length ? `    ${line}` : ""))
    .join("\n");
}
