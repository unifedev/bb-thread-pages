import { escapeHtml } from "../domain/html/escape.ts";
import { PAGE_FRAME_ALLOW, PAGE_SANDBOX } from "../domain/sandbox.ts";
import { SHELL_RUNTIME } from "../generated/shell-runtime.ts";
import { EMPTY_PAGE_STATUS, type ShellConfig } from "../runtime/shared/protocol.ts";

/**
 * The trusted shell document: title bar, home link, working indicator,
 * status, reload control, the sandboxed frame and the confirmation dialog.
 * Identical wherever the page is read. spec R2.14–R2.16
 */
export interface ShellView {
  nonce: string;
  title: string;
  homeUrl: string | null;
  working: boolean;
  /** The bar's own actions on the shown session: pin in the host, open its conversation, read mark, archive. Null for the built-in home. */
  chrome: { hostUrl: string; pinned: boolean; unread: boolean } | null;
  config: ShellConfig;
}

const SHELL_CSS = `
:root{color-scheme:light dark;font:14px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#f7f7f5;--surface:#fff;--ink:#17181b;--muted:#676c75;--line:#dfe0e3;--accent:#315fc5;--warn:#a54312}
@media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#eeeef0;--muted:#a5a9b1;--line:#30333a;--accent:#91aff1;--warn:#efa879}}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--ink)}
.shell{display:grid;grid-template-rows:auto 1fr;height:100%;min-height:100dvh}
 .bar{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;min-height:2.5rem;padding:.45rem max(.7rem,env(safe-area-inset-right)) .45rem max(.7rem,env(safe-area-inset-left));border-bottom:1px solid var(--line);background:var(--surface)}
 .home{flex:none;color:var(--muted);text-decoration:none;font-weight:600;white-space:nowrap}.home:hover{color:var(--ink)}
 .title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.status{margin-left:auto;color:var(--muted);text-align:right}.status[data-tone=warn]{color:var(--warn)}
.work{flex:none;display:none;align-items:center;gap:.4rem;color:var(--muted)}.work[data-visible=true]{display:inline-flex}
.work .dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--accent)}
@media(prefers-reduced-motion:no-preference){.work[data-visible=true] .dot{animation:tp-pulse 1.4s ease-in-out infinite}}
@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:.25}}
 button.reload{display:none;padding:.25rem .55rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}button.reload[data-visible=true]{display:inline-block}
.acts{flex:none;display:flex;align-items:center;gap:.35rem}
.acts[data-enabled=false]{opacity:.45;pointer-events:none}
.act{display:inline-flex;align-items:center;justify-content:center;min-width:1.6rem;padding:.25rem .5rem;border:1px solid var(--line);border-radius:.4rem;color:var(--muted);background:var(--bg);cursor:pointer;font:inherit;font-size:.8rem;line-height:1.25;text-decoration:none;white-space:nowrap}
.act:hover{color:var(--ink);border-color:var(--muted)}
.act[data-on=true]{color:var(--accent);border-color:var(--accent)}
.act:disabled{opacity:.5;cursor:default}
 .act-warn:hover{color:var(--warn);border-color:var(--warn)}
 @media(max-width:34rem){.work .word{display:none}.status{font-size:.8rem}.acts{order:9;margin-left:auto}}
/* Two frames can share the stage: a refreshed document loads behind the shown one. spec R2.18a */
.stage{position:relative;min-height:0}
iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:var(--bg)}
iframe[data-incoming]{visibility:hidden}
.grants{flex:none}
dialog.grants-list ul{list-style:none;margin:0 0 1rem;padding:0;display:grid;gap:.4rem}
dialog.grants-list li{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
dialog.grants-list li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog{margin:auto;max-width:min(30rem,calc(100vw - 2rem));padding:1.15rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;color:var(--ink);background:var(--surface)}
dialog::backdrop{background:rgb(0 0 0 / .45)}dialog h2{margin:0 0 .5rem;font-size:1rem}dialog p{margin:0 0 1rem;color:var(--muted);overflow-wrap:anywhere}
dialog .row{display:flex;gap:.5rem;justify-content:flex-end}dialog button{padding:.4rem .8rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}
dialog button[value=confirm]{color:#fff;background:var(--accent);border-color:var(--accent)}
dialog p{white-space:pre-line}
/* The recording bar: shell chrome over the stage, where the page cannot draw. spec R3.32 */
.rec{position:absolute;left:50%;bottom:max(.75rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;width:min(34rem,calc(100% - 1.5rem));display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;grid-template-areas:"mic wave time cancel done" "status status status status status";align-items:center;gap:.35rem .6rem;padding:.6rem .75rem;border:1px solid var(--line);border-radius:.75rem;background:var(--surface);color:var(--ink);box-shadow:0 10px 30px rgb(0 0 0 / .2);outline:none}
.rec[hidden]{display:none}.rec:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rec svg{width:16px;height:16px;flex:none}
.rec-mic{grid-area:mic;display:inline-flex;color:var(--muted)}.rec[data-state=recording] .rec-mic{color:var(--warn)}
@media(prefers-reduced-motion:no-preference){.rec[data-state=recording] .rec-mic{animation:tp-pulse 1.4s ease-in-out infinite}}
.rec-wave{grid-area:wave;display:block;width:100%;height:28px;color:var(--accent)}
.rec-time{grid-area:time;color:var(--muted);font-variant-numeric:tabular-nums}
.rec-status{grid-area:status;min-height:1.1em;color:var(--muted);font-size:.8rem}.rec[data-state=short] .rec-status{color:var(--warn);font-weight:600}
.rec-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .7rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer;font:inherit}
.rec-btn[data-rec=cancel]{grid-area:cancel}.rec-btn[data-rec=done],.rec-btn[data-rec=record]{grid-area:done;color:#fff;background:var(--accent);border-color:var(--accent)}.rec-btn[hidden]{display:none}
.rec-btn:disabled{opacity:.5;cursor:default}
@media(max-width:26rem){.rec{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"mic wave time" "status status status" "cancel cancel done"}.rec-btn{justify-content:center}}
`;

/** Line icons for the recording bar, drawn in the text colour. */
const ICON = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
const MIC_ICON = ICON('<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>');
const CANCEL_ICON = ICON('<path d="M6 6l12 12M18 6L6 18"/>');
const DONE_ICON = ICON('<path d="M5 12.5l4.5 4.5L19 7"/>');

/** The recording bar, hidden until a recording is asked for. spec R3.32, R5.68 */
const RECORDER = `<section class="rec" data-shell-recorder hidden tabindex="-1" aria-label="Voice recording" aria-describedby="tp-rec-status">
    <span class="rec-mic">${MIC_ICON}</span>
    <canvas class="rec-wave" width="400" height="56" aria-hidden="true"></canvas>
    <span class="rec-time" data-rec-time aria-hidden="true">0:00</span>
    <span class="rec-status" id="tp-rec-status" data-rec-status role="status" aria-live="polite"></span>
    <button type="button" class="rec-btn" data-rec="cancel">${CANCEL_ICON}Cancel</button>
    <button type="button" class="rec-btn" data-rec="record" hidden>${MIC_ICON}Record</button>
    <button type="button" class="rec-btn" data-rec="done">${DONE_ICON}Done</button>
  </section>`;

function initialStatus(config: ShellConfig): string {
  if (config.stale) return "Offline copy — read-only";
  if (config.empty) return EMPTY_PAGE_STATUS;
  return config.notice ?? "";
}

export function renderShell(view: ShellView): string {
  const title = escapeHtml(view.title);
  const nonce = escapeHtml(view.nonce);
  const config = escapeHtml(JSON.stringify(view.config));
  const working = view.working && view.config.workingLabel ? "true" : "false";
  const warn = view.config.stale || (!view.config.empty && view.config.notice !== null);
  const acts = view.chrome
    ? `<span class="acts" data-shell-acts data-enabled="${view.config.stale ? "false" : "true"}">
      <button type="button" class="act" data-act="pin" data-on="${view.chrome.pinned}" aria-pressed="${view.chrome.pinned}" title="${view.chrome.pinned ? "Pinned in bb" : "Pin in bb"}">${view.chrome.pinned ? "★" : "☆"}</button>
      <a class="act" href="${escapeHtml(view.chrome.hostUrl)}" title="Open this session in bb">bb</a>
      <button type="button" class="act" data-act="read" data-on="${view.chrome.unread}" title="${view.chrome.unread ? "Mark read" : "Mark unread"}">${view.chrome.unread ? "Read" : "Unread"}</button>
      <button type="button" class="act act-warn" data-act="archive" title="Archive this session">Archive</button>
    </span>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style nonce="${nonce}">${SHELL_CSS}</style>
</head>
<body>
<div class="shell">
  <header class="bar">
    ${view.homeUrl ? `<a class="home" href="${escapeHtml(view.homeUrl)}" title="All sessions">← Sessions</a>` : ""}
    <span class="title">${title}</span>
    <span class="work" role="status" data-shell-working data-visible="${working}"><span class="dot" aria-hidden="true"></span><span class="word">${escapeHtml(view.config.workingLabel)}</span></span>
    <span class="status" role="status" data-shell-status${warn ? ' data-tone="warn"' : ""}>${escapeHtml(initialStatus(view.config))}</span>
    <button type="button" class="act grants" data-shell-grants hidden></button>
    ${acts}
    <button type="button" class="reload" data-shell-reload aria-label="Reload updated page">Reload</button>
  </header>
  <div class="stage"><iframe title="${title}" sandbox="${PAGE_SANDBOX}" allow="${PAGE_FRAME_ALLOW}" referrerpolicy="no-referrer"></iframe>
  ${RECORDER}</div>
</div>
<dialog aria-labelledby="tp-confirm-title">
  <form method="dialog">
    <h2 id="tp-confirm-title">Confirm this action</h2>
    <p></p>
    <div class="row">
      <button type="button" value="cancel">Cancel</button>
      <button type="button" value="confirm">Confirm</button>
    </div>
  </form>
</dialog>
<dialog class="grants-list" data-shell-grants-dialog aria-labelledby="tp-grants-title">
  <h2 id="tp-grants-title">This page may send your answers to</h2>
  <p>You allowed each of these once, when you first answered that session from inside this page. Revoke one and you are asked again next time.</p>
  <ul></ul>
  <div class="row"><button type="button" value="close">Close</button></div>
</dialog>
<script nonce="${nonce}" data-config="${config}">${SHELL_RUNTIME}</script>
</body>
</html>`;
}
