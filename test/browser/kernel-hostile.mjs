/**
 * Hostile pages against the kernel's text-area controls and its port, and the
 * rows' placement under scrolling, in Chromium, Firefox and WebKit. Adapted
 * from the independent review's proofs of concept (26 September 2026). Needs
 * no bb: it serves this worktree's bundled kernel inside a sandboxed frame
 * whose parent plays the shell's handshake and logs what reaches its port.
 *
 *   PLAYWRIGHT=<…>/playwright/index.mjs node test/browser/kernel-hostile.mjs [chromium firefox webkit]
 */
import http from "node:http";
import { KERNEL_RUNTIME } from "../../src/generated/kernel-runtime.ts";

const pw = await import(process.env.PLAYWRIGHT || "playwright");
const engines = process.argv.slice(2).length ? process.argv.slice(2) : ["chromium", "firefox", "webkit"];
const PORT = Number(process.env.PORT || 8767);
const K = `<script data-config='{"pageRevision":"r1","stale":false}' src="/kernel.js"></script>`;
const OPEN = `<script>const a=Element.prototype.attachShadow;Element.prototype.attachShadow=function(i){return a.call(this,{...i,mode:"open"})}</script>`;
const TEXTAREA = `<textarea id="t" style="position:absolute;left:50px;top:50px;width:300px;height:100px;resize:none;color:#123"></textarea>`;

const pages = {
  // C1: a synthetic handshake, then the page listens for the genuine one to steal the shell's port.
  handshake: `${K}<script>
    const ch = new MessageChannel();
    addEventListener("message", (e) => { if (e.isTrusted && e.data && e.data.kind === "thread-page:connect" && e.ports.length) { e.ports[0].postMessage({ kind: "thread-page:record", id: "tp-record-1-abcdef", purpose: "dictate", control: true }); parent.postMessage({ kind: "poc", got: "the shell's port" }, "*"); } });
    dispatchEvent(new MessageEvent("message", { source: parent, data: { kind: "thread-page:connect", version: 1 }, ports: [ch.port2] }));
  </script>`,
  // C2: a patched postMessage, and an invoke whose params make the original throw.
  fallback: `${K}<script>
    const orig = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (m, t) { if (!window.stolen) { window.stolen = this; orig.call(this, { kind: "thread-page:record", id: "tp-record-1-abcdef", purpose: "dictate", control: true }); parent.postMessage({ kind: "poc", got: "port via the TypeError fallback" }, "*"); } try { return orig.call(this, m, t); } catch (e) {} };
    setTimeout(() => threadPage.invoke("context.get", { get x() { throw new TypeError("boom"); } }).catch(() => {}), 300);
  </script>`,
  // I1a: a script's Tab after every real key, so a real Enter would land on Dictate.
  tab: `${K}<input id="i" style="position:absolute;left:10px;top:5px">${TEXTAREA}<script>
    addEventListener("keydown", (e) => { if (e.isTrusted && e.key === "Enter") document.getElementById("t").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); }, true);
  </script>`,
  // I1b: a custom element of the layer's old tag name, to read its closed root through ElementInternals.
  internals: `${K}<script>
    customElements.define("thread-page-controls", class extends HTMLElement { constructor() { super(); window.internals = this.attachInternals(); } });
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, o) { const node = create.call(this, tag, o); (window.made ||= []).push(node); return node; };
  </script>${TEXTAREA}<script>
    setTimeout(() => { const root = window.internals && internals.shadowRoot; const leaked = (window.made || []).some((n) => n.getRootNode && n.getRootNode() !== document && n.getRootNode() !== n); parent.postMessage({ kind: "poc", got: "internals " + !!root + ", nodes " + leaked }, "*"); }, 500);
  </script>`,
  // I1c: a transparent top-layer popover over the field; the click passes through to the hidden microphone.
  overlay: `${K}<body style="margin:0">${TEXTAREA}<div id="p" popover="manual" style="margin:0;position:fixed;inset:0 auto auto 0;width:400px;height:200px;background:transparent;pointer-events:none;border:0"></div>
    <script>setTimeout(() => document.getElementById("p").showPopover(), 300);</script></body>`,
  // I1c: the whole document filtered invisible; the controls are still hit-testable.
  filtered: `<style>html{filter:opacity(0)}</style>${K}<body style="margin:0">${TEXTAREA}</body>`,
  // Control: a plain page, where a real press on Dictate is the control.
  plain: `${K}<body style="margin:0">${TEXTAREA}</body>`,
};

const layouts = {
  // The ordinary page: the document scrolls, and the row moves with it on the compositor.
  page: `<style>body{margin:0}</style><div style="height:300px"></div><textarea id="t" style="width:300px;height:100px"></textarea><div style="height:3000px"></div>`,
  body: `<style>html{overflow:hidden;height:100%}body{margin:0;height:100%;overflow:auto}</style><div style="height:300px"></div><textarea id="t" style="width:300px;height:100px"></textarea><div style="height:3000px"></div>`,
  main: `<style>html,body{height:100%;margin:0}main{height:100%;overflow:auto}</style><main id="s"><div style="height:300px"></div><textarea id="t" style="width:300px;height:100px"></textarea><div style="height:3000px"></div></main>`,
  sticky: `<style>body{margin:0}footer{position:sticky;bottom:0;background:#eee;padding:8px}</style><div style="height:3000px"></div><footer><textarea id="t" style="width:300px;height:60px"></textarea></footer><div style="height:600px"></div>`,
};

/** Pages for the row's shape, not its scrolling. */
const rows = {
  rtl: `<form dir="rtl"><textarea id="t" style="width:300px;height:100px;resize:none"></textarea></form>`,
  narrow: `<form><textarea id="t" style="width:90px;height:60px;resize:none"></textarea></form>`,
};

const server = http
  .createServer((request, response) => {
    const url = new URL(request.url, "http://x");
    if (url.pathname === "/kernel.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(KERNEL_RUNTIME);
      return;
    }
    const name = url.pathname.slice(1);
    response.setHeader("content-type", "text/html");
    if (pages[name]) return response.end(`<!doctype html><html><head></head>${pages[name]}</html>`);
    const layout = layouts[name] ?? rows[name];
    if (layout) return response.end(`<!doctype html><html><head>${OPEN}${K}</head><body>${layout}</body></html>`);
    if (name === "top") {
      return response.end(`<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="width:900px;height:700px;border:0" src="/${url.searchParams.get("p")}"></iframe><script>
        window.log = [];
        addEventListener("message", (e) => {
          if (e.data && e.data.kind === "thread-page:ready" && !window.port) {
            const ch = new MessageChannel();
            ch.port1.onmessage = (m) => log.push(m.data);
            e.source.postMessage({ kind: "thread-page:connect", version: 1 }, "*", [ch.port2]);
            ch.port1.postMessage({ kind: "thread-page:voice", available: true });
            window.port = ch.port1;
          } else if (e.data && e.data.kind === "poc") log.push({ poc: e.data.got });
        });
      </script></body>`);
    }
    response.statusCode = 404;
    response.end();
  })
  .listen(PORT);

const results = [];
const ok = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * The Dictate control's centre: a 300×100 field at 50,50 (2 px padding, 1 px border, no resize handle)
 * outside any form, so the row holds Dictate alone, at the field's inner right edge less 3 px.
 */
const MIC = { x: 50 + 1 + 304 - 3 - 12, y: 50 + 1 + 104 - 3 - 12 };

for (const engine of engines) {
  const browser = await pw[engine].launch(engine === "chromium" ? { channel: "chromium" } : {});
  const run = async (name, act) => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`http://localhost:${PORT}/top?p=${name}`);
    await page.waitForTimeout(900);
    await act(page);
    await page.waitForTimeout(400);
    const log = await page.evaluate(() => window.log);
    await page.close();
    return log.filter((entry) => entry.poc || entry.kind === "thread-page:record").map((entry) => (entry.poc ? `POC ${entry.poc}` : `record control=${entry.control === true}`));
  };
  const handshake = await run("handshake", async () => undefined);
  ok(`${engine}: a synthetic handshake gets no port, and the genuine one never reaches the page`, handshake.length === 0, JSON.stringify(handshake));
  const fallback = await run("fallback", async () => undefined);
  ok(`${engine}: a throwing original is not retried through the page's postMessage`, fallback.length === 0, JSON.stringify(fallback));
  const tab = await run("tab", async (page) => {
    await page.mouse.click(20, 12);
    await page.keyboard.type("x");
    await page.keyboard.press("Enter");
  });
  ok(`${engine}: a script's Tab does not put Dictate under the reader's Enter`, tab.length === 0, JSON.stringify(tab));
  const internals = await run("internals", async () => undefined);
  ok(`${engine}: the layer's nodes stay out of the page's reach (no custom-element internals, no patched createElement)`, internals.length === 1 && internals[0] === "POC internals false, nodes false", JSON.stringify(internals));
  const overlay = await run("overlay", async (page) => page.mouse.click(MIC.x, MIC.y));
  ok(`${engine}: under a top-layer overlay a press on Dictate is not the control (armed path)`, overlay.length === 1 && overlay[0] === "record control=false", JSON.stringify(overlay));
  const filtered = await run("filtered", async (page) => page.mouse.click(MIC.x, MIC.y));
  ok(`${engine}: on a filtered-away page a press on Dictate is not the control`, filtered.length === 1 && filtered[0] === "record control=false", JSON.stringify(filtered));
  const plain = await run("plain", async (page) => page.mouse.click(MIC.x, MIC.y));
  ok(`${engine}: on a plain page the reader's press on Dictate is the control`, plain.length === 1 && plain[0] === "record control=true", JSON.stringify(plain));

  // Placement: scripted scrolling, each frame, in the three layouts.
  for (const name of Object.keys(layouts)) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://localhost:${PORT}/${name}`);
    await page.evaluate(() => {
      const ch = new MessageChannel();
      window.postMessage({ kind: "thread-page:connect", version: 1 }, "*", [ch.port2]);
      ch.port1.postMessage({ kind: "thread-page:voice", available: true });
      window.__p = ch.port1;
    });
    await page.waitForTimeout(500);
    const scripted = await page.evaluate(async (layout) => {
      const scroller = layout === "body" ? document.body : layout === "main" ? document.getElementById("s") : document.scrollingElement;
      // The ordinary page's row is never hidden by scrolling: it moves with the document.
      scroller.scrollTop = layout === "sticky" ? 0 : 100;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const root = document.documentElement.lastElementChild.shadowRoot;
      const field = document.getElementById("t");
      const group = root.querySelector(".group");
      const offset = () => ({ x: group.getBoundingClientRect().right - field.getBoundingClientRect().right, y: group.getBoundingClientRect().bottom - field.getBoundingClientRect().bottom });
      const rest = offset();
      let worst = 0;
      let hiddenFrames = 0;
      for (let step = 0; step < 20; step += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (group.hidden) hiddenFrames += 1;
        else worst = Math.max(worst, Math.abs(offset().y - rest.y), Math.abs(offset().x - rest.x));
        scroller.scrollTop += step < 10 ? 30 : -30;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      const settled = !group.hidden && Math.abs(offset().y - rest.y) <= 2 && Math.abs(offset().x - rest.x) <= 2;
      return { worst, hiddenFrames, settled };
    }, name);
    ok(`${engine}: ${name} scroller, scripted, never off by more than 2 px while shown, and back in place after`, scripted.worst <= 2 && scripted.settled, JSON.stringify(scripted));

    // Real wheel over the field, sampled every frame.
    const sampling = page.evaluate(async () => {
      const root = document.documentElement.lastElementChild.shadowRoot;
      const field = document.getElementById("t");
      const group = root.querySelector(".group");
      const offset = () => ({ x: group.getBoundingClientRect().right - field.getBoundingClientRect().right, y: group.getBoundingClientRect().bottom - field.getBoundingClientRect().bottom });
      const rest = offset();
      let worst = 0;
      let hiddenFrames = 0;
      for (let frame = 0; frame < 50; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (group.hidden) hiddenFrames += 1;
        else worst = Math.max(worst, Math.abs(offset().y - rest.y), Math.abs(offset().x - rest.x));
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { worst, hiddenFrames, settled: !group.hidden };
    });
    await page.mouse.move(200, 300);
    for (let turn = 0; turn < 6; turn += 1) await page.mouse.wheel(0, turn < 3 ? 120 : -120);
    const wheeled = await sampling;
    ok(`${engine}: ${name} scroller, real wheel, never off by more than 2 px while shown, and shown again after`, wheeled.worst <= 2 && wheeled.settled, JSON.stringify(wheeled));
    await page.close();
  }
  // Right-to-left: the row mirrors to the field's bottom-left. A narrow field names its files by count.
  for (const name of Object.keys(rows)) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://localhost:${PORT}/${name}`);
    await page.evaluate(() => {
      const ch = new MessageChannel();
      window.postMessage({ kind: "thread-page:connect", version: 1 }, "*", [ch.port2]);
      ch.port1.postMessage({ kind: "thread-page:voice", available: true });
      window.__p = ch.port1;
    });
    await page.waitForTimeout(500);
    await page.locator('input[type="file"]').setInputFiles(["alpha.txt", "beta.txt", "gamma.txt"].map((file) => ({ name: file, mimeType: "text/plain", buffer: Buffer.from("x") })));
    await page.waitForTimeout(300);
    const row = await page.evaluate(() => {
      const root = document.documentElement.lastElementChild.shadowRoot;
      const field = document.getElementById("t").getBoundingClientRect();
      const group = root.querySelector(".group");
      const box = group.getBoundingClientRect();
      const more = group.querySelector("button.more");
      const chips = [...group.querySelectorAll(".chips .chip")].length;
      return { fieldLeft: Math.round(field.left), fieldRight: Math.round(field.right), left: Math.round(box.left), right: Math.round(box.right), inside: box.left >= field.left - 1 && box.right <= field.right + 1, chips, more: more.hidden ? "" : more.textContent };
    });
    if (name === "rtl") ok(`${engine}: right-to-left, the row sits at the field's bottom-left`, row.inside && row.left - row.fieldLeft <= 6, JSON.stringify(row));
    else ok(`${engine}: a narrow field keeps the row inside and names its files by count`, row.inside && row.chips === 0 && row.more === "3 files", JSON.stringify(row));
    await page.close();
  }
  await browser.close();
}
server.close();
const failed = results.filter((pass) => !pass).length;
console.log(`\nkernel-hostile: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
