// The shell document template (nonce CSP, `microphone=(self)`, elements the runtime expects) — identical wherever a page is read, and drawing no chrome around the page (05 R2.14–R2.16, R3.5, R3.6; DESIGN §F.2; U49).
import { escapeAttribute, escapeHtml } from "../domain/html/escape.ts";
import { SHELL_RUNTIME } from "../generated/shell-runtime.ts";
import type { ShellConfig } from "../runtime/shared/protocol.ts";

export interface ShellView {
  nonce: string;
  config: ShellConfig;
}

/** The shell's own style: one block under the nonce, nothing from the page. The frame fills the viewport; the notice strip has no height until it has text. 05 R3.6; U49 */
const SHELL_CSS = `:root{color-scheme:light dark;font:14px/1.4 system-ui,sans-serif;--bg:#f7f7f5;--surface:#fff;--ink:#17181b;--muted:#676c75;--line:#dfe0e3;--accent:#315fc5;--warn:#a54312}
@media(prefers-color-scheme:dark){:root{--bg:#111216;--surface:#191b20;--ink:#eeeef0;--muted:#a5a9b1;--line:#30333a;--accent:#91aff1;--warn:#efa879}}
*{box-sizing:border-box}html,body{height:100%;margin:0;background:var(--bg);color:var(--ink)}
body{display:grid;grid-template-rows:1fr auto;min-height:100dvh}
#tp-frame-host{position:relative;min-height:0}
#tp-frame-host iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:var(--bg)}
#tp-notice{display:none;padding:.45rem max(.7rem,env(safe-area-inset-right)) max(.45rem,env(safe-area-inset-bottom)) max(.7rem,env(safe-area-inset-left));border-top:1px solid var(--line);background:var(--surface);color:var(--warn)}
#tp-notice[data-visible=true]{display:block}#tp-notice a{color:var(--accent);margin-left:.5rem}
dialog{margin:auto;max-width:min(30rem,calc(100vw - 2rem));padding:1.15rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;color:var(--ink);background:var(--surface)}
dialog::backdrop{background:rgb(0 0 0 / .45)}dialog p{white-space:pre-line;overflow-wrap:anywhere}
dialog button{padding:.25rem .55rem;border:1px solid var(--line);border-radius:.4rem;color:var(--ink);background:var(--bg);cursor:pointer;font:inherit;line-height:1.25}
#tp-recorder{position:absolute;left:50%;bottom:max(.75rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;width:min(34rem,calc(100% - 1.5rem));padding:.6rem .75rem;border:1px solid var(--line);border-radius:.75rem;background:var(--surface)}
#tp-recorder[hidden]{display:none}
`;

/**
 * The trusted shell: the frame host (the runtime creates the sandboxed
 * frame), the notice strip, the dialog and the recording bar. Nothing is
 * drawn around the page; `<title>` alone carries the session's title. Its
 * one script carries `ShellConfig` in a data attribute; no reader-specific
 * text, the same everywhere. 05 R2.14–R2.16, R3.3; U49
 */
export function renderShell(view: ShellView): string {
  const title = escapeHtml(view.config.title);
  const nonce = escapeAttribute(view.nonce);
  const config = escapeAttribute(JSON.stringify(view.config));
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
<main id="tp-frame-host">
  <section id="tp-recorder" hidden tabindex="-1" aria-label="Voice recording"></section>
</main>
<p id="tp-notice" role="status" aria-live="polite"></p>
<dialog id="tp-dialog" aria-labelledby="tp-dialog-title"><h2 id="tp-dialog-title">Confirm this action</h2><p></p><div class="row"></div></dialog>
<script nonce="${nonce}" data-config="${config}">${SHELL_RUNTIME}</script>
</body>
</html>
`;
}
