import { escapeHtml } from "../domain/html/escape.ts";
import { SHELL_RUNTIME } from "../generated/shell-runtime.ts";
import type { ShellConfig } from "../runtime/shared/protocol.ts";

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
  config: ShellConfig;
}

const SHELL_CSS = `
:root{color-scheme:light dark;font:14px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#f7f7f5;--surface:#fff;--ink:#17181b;--muted:#676c75;--line:#dfe0e3;--accent:#315fc5;--warn:#a54312}
@media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#eeeef0;--muted:#a5a9b1;--line:#30333a;--accent:#91aff1;--warn:#efa879}}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--ink)}
.shell{display:grid;grid-template-rows:auto 1fr;height:100%;min-height:100dvh}
.bar{display:flex;align-items:center;gap:.75rem;min-height:2.5rem;padding:.45rem max(.7rem,env(safe-area-inset-right)) .45rem max(.7rem,env(safe-area-inset-left));border-bottom:1px solid var(--line);background:var(--surface)}
.home{flex:none;color:var(--muted);text-decoration:none;font-weight:600;white-space:nowrap}.home:hover{color:var(--ink)}
.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.status{margin-left:auto;color:var(--muted);text-align:right}.status[data-tone=warn]{color:var(--warn)}
.work{flex:none;display:none;align-items:center;gap:.4rem;color:var(--muted)}.work[data-visible=true]{display:inline-flex}
.work .dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--accent)}
@media(prefers-reduced-motion:no-preference){.work[data-visible=true] .dot{animation:tp-pulse 1.4s ease-in-out infinite}}
@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:.25}}
button.reload{display:none;padding:.25rem .55rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}button.reload[data-visible=true]{display:inline-block}
iframe{display:block;width:100%;height:100%;border:0;background:var(--bg)}
dialog{margin:auto;max-width:min(30rem,calc(100vw - 2rem));padding:1.15rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;color:var(--ink);background:var(--surface)}
dialog::backdrop{background:rgb(0 0 0 / .45)}dialog h2{margin:0 0 .5rem;font-size:1rem}dialog p{margin:0 0 1rem;color:var(--muted);overflow-wrap:anywhere}
dialog .row{display:flex;gap:.5rem;justify-content:flex-end}dialog button{padding:.4rem .8rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer}
dialog button[value=confirm]{color:#fff;background:var(--accent);border-color:var(--accent)}
`;

export function renderShell(view: ShellView): string {
  const title = escapeHtml(view.title);
  const nonce = escapeHtml(view.nonce);
  const config = escapeHtml(JSON.stringify(view.config));
  const working = view.working && view.config.workingLabel ? "true" : "false";
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
    <span class="work" role="status" data-shell-working data-visible="${working}"><span class="dot" aria-hidden="true"></span><span>${escapeHtml(view.config.workingLabel)}</span></span>
    <span class="status" role="status" data-shell-status${view.config.stale ? ' data-tone="warn"' : ""}>${view.config.stale ? "Offline copy — read-only" : ""}</span>
    <button type="button" class="reload" data-shell-reload aria-label="Reload updated page">Reload</button>
  </header>
  <iframe title="${title}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
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
<script nonce="${nonce}" data-config="${config}">${SHELL_RUNTIME}</script>
</body>
</html>`;
}
