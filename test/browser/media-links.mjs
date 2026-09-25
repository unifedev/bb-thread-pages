/**
 * Browser pass for popups, own files, full screen, other sites' frames and
 * large media (spec 1.4, DECISIONS D33–D37), against `serve.ts` serving
 * verify/fixtures/10-media-links-embeds. Not part of the unit suite.
 *
 *   node test/browser/serve.ts <fixture-10-dir> 8790                     # loopback-like
 *   GATE=1 TLS=<dir> PROBE_SVG=1 node test/browser/serve.ts <dir> 8791   # Connect-like
 *   PLAYWRIGHT=/path/to/node_modules/playwright ENGINE=webkit BASE=https://localhost:8791 GATE=1 node test/browser/media-links.mjs
 *
 * GATE=1 logs in first (the stand-in for bb Connect's cookie). Everything a
 * browser does only on a click is done with a real click.
 */
const pw = await import(process.env.PLAYWRIGHT || "playwright");
const engine = process.env.ENGINE || "chromium";
const BASE = process.env.BASE || "http://localhost:8790";
const SESSION = process.env.SESSION || "thr_fixture10";
const GATED = process.env.GATE === "1";
const ROUTE = `${BASE}/api/v1/plugins/thread-pages/http`;
const FILES = `${BASE}/api/v1/threads/${SESSION}/thread-storage/files/`;
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass === null ? "NOTE" : pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await pw[engine].launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true, ignoreHTTPSErrors: true });
const shell = await context.newPage();
const pageErrors = [];
// The hostile checks below try to navigate the top window on purpose; WebKit reports the refusal as an error.
shell.on("pageerror", (error) => { if (!/allow-top-navigation/.test(error.message)) pageErrors.push(error.message); });
await shell.goto(GATED ? `${BASE}/login` : `${ROUTE}/page?session=${SESSION}`);
await shell.waitForLoadState("load");
const shellUrl = shell.url();
const frame = () => shell.frames().find((f) => f.url().includes("/document?")) ?? null;
const inner = shell.frameLocator(".stage iframe:not([data-incoming])");
await inner.locator("#verdict table").waitFor({ timeout: 15000 });

async function verdict(id, timeout = 25000) {
  // A check may be recorded more than once (a reader's click after the automatic run): the last row is current.
  const row = inner.locator("#verdict tr", { has: shell.locator(`td.id:text-is("${id}")`) }).last();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = await row.textContent().catch(() => null);
    if (text && !/UNKNOWN/.test(text)) return text.replace(/\s+/g, " ").trim();
    await sleep(300);
  }
  return (await row.textContent().catch(() => "(no row)"))?.replace(/\s+/g, " ").trim();
}

// --- self-checks of the fixture -----------------------------------------------
for (const id of ["A117", "A116", "A114", "A115"]) {
  const text = await verdict(id);
  ok(`fixture ${id}`, /\bPASS\b/.test(text) && !/\bFAIL\b/.test(text), text.slice(0, 220));
}
const video = await frame().evaluate(() => { const v = document.getElementById("big"); return { src: (v.currentSrc || "").slice(0, 12), duration: v.duration, marker: v.hasAttribute("data-thread-page-src") }; });
ok("A116 the video plays from a blob: URL the shell provided", video.src.startsWith("blob:") && !video.marker, JSON.stringify(video));

// --- links and popups -----------------------------------------------------------
async function expectPage(what, click, test) {
  const before = frame().url();
  try {
    const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 6000 }), click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    const url = popup.url();
    const detail = await test(popup, url);
    await popup.close();
    const stayed = frame()?.url() === before && shell.url() === shellUrl;
    const dialog = await shell.locator("dialog[open]").count();
    ok(what, detail.pass && stayed && dialog === 0, `${detail.why}; page stayed: ${stayed}; dialog: ${dialog}`);
  } catch (error) {
    ok(what, false, String(error.message).split("\n")[0]);
  }
}
async function expectDownload(what, click, name, bytes) {
  const before = frame().url();
  try {
    const [download] = await Promise.all([shell.waitForEvent("download", { timeout: 6000 }), click()]);
    const path = await download.path();
    const { statSync } = await import("node:fs");
    const size = path ? statSync(path).size : -1;
    const stayed = frame()?.url() === before;
    ok(what, download.suggestedFilename() === name && (bytes === undefined || size === bytes) && stayed, `saved as "${download.suggestedFilename()}", ${size} bytes; page stayed: ${stayed}`);
  } catch (error) {
    ok(what, false, String(error.message).split("\n")[0]);
  }
}

// Option D: a link to another site asks in the shell's dialog, then the shell opens the site as itself.
async function expectConfirmedPage(what, click, expected) {
  const before = frame().url();
  try {
    await click();
    const summary = await shell.locator("dialog[open] p").textContent({ timeout: 4000 });
    await sleep(500); // the confirm button is armed after 400 ms
    const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 6000 }), shell.locator("dialog[open] button[value=confirm]").click()]);
    // The shell reserves the tab during the Confirm click (about:blank), then sends it to the site.
    await popup.waitForURL((url) => url.protocol === "https:", { timeout: 10000 }).catch(() => undefined);
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    const url = popup.url();
    const origin = await popup.evaluate(() => self.origin).catch((error) => `ERR ${error.message}`);
    await popup.close();
    const stayed = frame()?.url() === before && shell.url() === shellUrl;
    ok(what, url.startsWith(expected) && origin === new URL(expected).origin && stayed, `dialog: "${summary}"; ${url}, origin ${origin} (unsandboxed); page stayed: ${stayed}`);
  } catch (error) {
    ok(what, false, String(error.message).split("\n")[0]);
  }
}
await expectConfirmedPage("A106 a link with no target asks, then opens the site as itself in a new tab", () => inner.locator("#plain").click(), "https://example.com");
await expectConfirmedPage("A106 a target=_blank link asks, then opens the site as itself in a new tab", () => inner.locator("#blank").click(), "https://www.wikipedia.org");
await expectPage("A107 window.open on a click opens a window that stays sandboxed (origin null)", () => inner.locator("#wopen").click(), async (popup, url) => {
  const origin = await popup.evaluate(() => self.origin).catch((error) => `ERR ${error.message}`);
  return { pass: url.startsWith("https://example.org") && origin === "null", why: `${url} origin ${origin}` };
});
ok("A107 fixture verdict", /PASS/.test(await verdict("A107", 5000)), await verdict("A107", 100));
await expectConfirmedPage("A108 navigation.openExternal on a click asks, then opens", () => inner.locator("#oext").click(), "https://example.net");
await expectDownload("A110 a blob: download the page builds is saved", () => inner.locator("#csv").click(), "rows.csv");
await expectDownload("A111 an own file with download is saved under the attribute's name", () => inner.locator("#dl").click(), "Fixture 10 clip.mp4", 2497769);
{
  // A headless browser has no PDF viewer: the new tab downloads it instead. What matters is the tab and its authorised request.
  const seen = [];
  const onResponse = (response) => { if (response.url().endsWith("files/report.pdf")) seen.push(`${response.status()} ${response.request().isNavigationRequest() ? "navigation" : "subresource"}`); };
  context.on("response", onResponse);
  await expectPage("A112 an own PDF opens in a new tab at the host's address, with the credential", () => inner.locator("#pdf").click(), async (popup) => {
    await sleep(1200);
    return { pass: seen.some((entry) => entry === "200 navigation"), why: `a new tab; responses: ${seen.join(", ") || "none"}` };
  });
  context.off("response", onResponse);
}
await expectPage("A112 an own text file with target=_blank opens in a new tab", () => inner.locator("#txt").click(), async (popup, url) => {
  const text = await popup.evaluate(() => document.body.innerText).catch(() => "");
  return { pass: url === `${FILES}files/notes.txt` && text.includes("Fixture 10"), why: `${url}: ${text.slice(0, 50)}` };
});
await expectDownload("A112 an own SVG is downloaded, never opened on the host's origin", () => inner.locator("#svg").click(), "drawing.svg");
{
  const before = frame().url();
  let opened = false;
  const onPage = () => (opened = true);
  context.on("page", onPage);
  await inner.locator("#outside").click();
  await sleep(1500);
  context.off("page", onPage);
  ok("A112 a link outside the page root does nothing", !opened && frame()?.url() === before, `opened: ${opened}`);
}
{
  const before = frame().url();
  const opened = [];
  const onPage = (popup) => opened.push(popup);
  context.on("page", onPage);
  await inner.locator("#mail").click().catch(() => undefined);
  await sleep(1500);
  context.off("page", onPage);
  for (const popup of opened) await popup.close().catch(() => undefined);
  ok("A109 a mailto: link goes to a popup of the handler; the page stays", frame()?.url() === before && shell.url() === shellUrl, `frame: ${frame()?.url().slice(-40)}; popups: ${opened.length}`);
}

// --- full screen ------------------------------------------------------------------
await inner.locator("#fs").click();
ok("A113 full screen in the page", /PASS/.test(await verdict("A113", 6000)), await verdict("A113", 100));
await sleep(2000);
const panel = inner.frameLocator("#slot iframe");
try {
  await panel.locator("#fs").click({ timeout: 8000 });
  await sleep(700);
  const text = await panel.locator("#out").textContent();
  ok("A113 full screen inside an embed", /PASS/.test(text), text);
} catch (error) {
  ok("A113 full screen inside an embed", false, String(error.message).split("\n")[0]);
}
await sleep(2000);

// --- openExternal without a click still asks -------------------------------------------
{
  await frame().evaluate(() => new Promise((resolve) => setTimeout(() => {
    window.__late = "pending";
    window.threadPage.invoke("navigation.openExternal", { url: "https://example.com/late" }).then(() => (window.__late = "opened"), (error) => (window.__late = error.code));
    resolve();
  }, 6500)));
  await sleep(1200);
  const dialog = await shell.locator("dialog[open] p").textContent().catch(() => null);
  if (dialog) await shell.locator("dialog[open] button[value=cancel]").click();
  await sleep(500);
  const late = await frame().evaluate(() => window.__late);
  ok("A108 openExternal without a click shows the host's confirmation", Boolean(dialog) && late === "cancelled", `dialog: ${dialog}; result: ${late}`);
}

// --- openExternal refuses this host's own origin (R5.32a, A118) ------------------------
{
  const answer = await frame().evaluate(async (url) => {
    try { await window.threadPage.invoke("navigation.openExternal", { url }); return "opened"; } catch (error) { return `${error.code}: ${error.message}`; }
  }, `${BASE}/api/v1/threads/${SESSION}/thread-storage/files/files/drawing.svg`);
  const dialog = await shell.locator("dialog[open]").count();
  ok("A118 navigation.openExternal refuses this host's own origin, before any dialog", answer.startsWith("invalid_params") && dialog === 0, `${answer.slice(0, 90)}; dialog: ${dialog}`);
}

// --- hostile page ---------------------------------------------------------------------
{
  const result = await frame().evaluate(() => {
    try {
      window.top.location.href = "https://example.com/?hijack";
      return "no throw";
    } catch (error) {
      return `threw ${error.name}`;
    }
  });
  await sleep(800);
  ok("A117 the page cannot navigate the top window", result.startsWith("threw") && shell.url() === shellUrl, result);
}
{
  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 6000 }),
    inner.locator("body").evaluate((_, url) => { window.__shellPopup = window.open(url); }, `${ROUTE}/page?session=${SESSION}`),
  ]);
  await popup.waitForLoadState("load").catch(() => undefined);
  const reach = await frame().evaluate(() => {
    const out = [];
    try { out.push(`document:${typeof window.__shellPopup.document.body}`); } catch (error) { out.push(`document:${error.name}`); }
    try { out.push(`token:${String(window.__shellPopup.document.querySelector("script[data-config]"))}`); } catch (error) { out.push(`token:${error.name}`); }
    return out.join(" ");
  });
  const popupOrigin = await popup.evaluate(() => self.origin).catch((error) => `ERR ${error.message}`);
  ok("A117 a popup of the host's shell cannot be reached from the page, and is itself sandboxed", /document:SecurityError/.test(reach) && /token:SecurityError/.test(reach) && popupOrigin === "null", `${reach}; popup origin ${popupOrigin}`);
  await popup.close();
}
if (process.env.PROBE_SVG === "1") {
  try {
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 6000 }),
      inner.locator("body").evaluate((_, url) => window.open(url), `${FILES}probe/evil.svg`),
    ]);
    await popup.waitForLoadState("load").catch(() => undefined);
    await sleep(1500);
    const title = await popup.evaluate(() => document.querySelector("title")?.textContent ?? "").catch((error) => `EVAL ${error.message}`);
    const origin = await popup.evaluate(() => self.origin).catch((error) => `ERR ${error.message}`);
    const token = /^probe:[A-Za-z0-9_-]{12}$/.test(title);
    ok("X37 an agent-written SVG opened by the page gets no host authority (popup origin null, no token)", origin === "null" && !token, `origin ${origin}; title: ${title}`);
    await popup.close();
  } catch (error) {
    ok("X37 SVG probe", false, String(error.message).split("\n")[0]);
  }
}

const stats = await (await context.request.get(`${BASE}/__stats`)).json().catch(() => ({}));
const bare = Object.entries(stats).filter(([key]) => key.startsWith("gated /api/v1/threads/"));
if (GATED) ok("no own-file request from the frame hit the gate (nothing depends on a credential it lacks)", bare.length === 0, JSON.stringify(bare));
ok("no page errors in the shell", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
const failed = results.filter((result) => result.pass === false);
console.log(`\n${engine} ${BASE}${GATED ? " (gated)" : ""}: ${results.filter((r) => r.pass === true).length} pass, ${failed.length} fail`);
process.exit(failed.length > 0 ? 1 : 0);
