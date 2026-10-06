/**
 * Browser pass for Thread Pages 1.9.0 (spec 1.7, DECISIONS D43–D45), against
 * `serve.ts` with the echo contributor, serving `pages/scope`:
 *
 * - D43: `app.html` takes its folder from its query and routes with its
 *   fragment; the query is kept on open, links, reload, back and forward.
 * - D44: `location.reload()` inside the frame reconnects.
 * - D45: seven tool documents loading at once are not refused.
 *
 *   ECHO=1 SESSION=thr_scope node test/browser/serve.ts test/browser/pages/scope 8796
 *   PLAYWRIGHT=/path/to/playwright/index.mjs ENGINE=chromium BASE=http://localhost:8796 node test/browser/params.mjs
 */
const pw = await import(process.env.PLAYWRIGHT || "playwright");
const engine = process.env.ENGINE || "chromium";
const BASE = process.env.BASE || "http://localhost:8796";
const SESSION = process.env.SESSION || "thr_scope";
const SHELL = `${BASE}/api/v1/plugins/thread-pages/http/page?session=${SESSION}`;
let failed = 0;
const ok = (name, pass, detail = "") => {
  if (!pass) failed += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${engine}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await pw[engine].launch();
const context = await browser.newContext();
const page = await context.newPage();
const docOf = (p) => p.frames().find((frame) => frame.url().includes("/document?"));
// A click that a broken build cannot crash: the checks after it report what happened.
const click = async (p, selector) => {
  try {
    await docOf(p)?.click(selector, { timeout: 5000 });
  } catch {
    // Reported by the check that follows.
  }
};
const address = () => new URL(page.url());
async function read(p = page, until = () => true) {
  for (let i = 0; i < 100; i += 1) {
    const frame = docOf(p);
    const values = frame
      ? await frame.evaluate(() => Object.fromEntries(["route", "scope", "echo", "burst", "loads"].map((id) => [id, document.getElementById(id)?.textContent ?? null]))).catch(() => null)
      : null;
    if (values && values.echo && until(values)) return { ...values, search: await frame.evaluate(() => location.search).catch(() => "") };
    await p.waitForTimeout(100);
  }
  return {};
}
const echoed = (values) => (values.echo && values.echo.startsWith("{") ? JSON.parse(values.echo) : values.echo);
const at = (route, scope) => (values) => values.route === route && echoed(values)?.scope === scope;

// 1. Opened from an address carrying the query and the app's route.
await page.goto(`${SHELL}&path=app.html?scope=clients/vela/q3-board#card-1`);
let values = await read(page, at("#card-1", "clients/vela/q3-board"));
ok("the address's query reaches the document as location.search", new URLSearchParams(values.search).get("scope") === "clients/vela/q3-board", values.search);
ok("the app scoped itself from it, and its fragment is its own route", values.route === "#card-1" && echoed(values)?.scope === "clients/vela/q3-board", `${values.route} ${values.echo}`);

// 2. The app routes with its fragment: the folder stays.
await click(page, "#card-2");
values = await read(page, at("#card-2", "clients/vela/q3-board"));
ok("the app's own route leaves the folder alone", values.route === "#card-2" && echoed(values)?.scope === "clients/vela/q3-board", `${values.route} ${values.echo}`);
await page.waitForTimeout(300);
ok("…and the address keeps the query beside the new route", address().searchParams.get("path") === "app.html?scope=clients/vela/q3-board" && address().hash === "#card-2", page.url());

// 3. Reload of the shell.
await page.reload();
values = await read(page, at("#card-2", "clients/vela/q3-board"));
ok("reload keeps the folder and the route", values.route === "#card-2" && echoed(values)?.scope === "clients/vela/q3-board", `${values.route} ${values.echo}`);

// 4. location.reload() inside the frame (D44): the shell answers it with its own document in a fresh frame,
// connected as any load is, at the same query and route.
for (const round of ["", "…again"]) {
  const before = docOf(page);
  await click(page, "#reload");
  let fresh = null;
  for (let i = 0; i < 100 && !fresh; i += 1) {
    const now = docOf(page);
    if (now && now !== before) fresh = now;
    else await page.waitForTimeout(100);
  }
  values = await read(page, at("#card-2", "clients/vela/q3-board"));
  ok(round || "location.reload() inside the frame comes back connected, in a fresh frame, at its query and route", Boolean(fresh) && docOf(page) === fresh && echoed(values)?.scope === "clients/vela/q3-board" && values.route === "#card-2", `${values.route} ${values.echo}`);
}

// 5. A link to the same app with another query, then back and forward.
await click(page, "#deck");
values = await read(page, at("#card-1", "decks/q3-pitch"));
ok("a link with another query opens the app for that folder", echoed(values)?.scope === "decks/q3-pitch" && new URLSearchParams(values.search).get("scope") === "decks/q3-pitch", `${values.search} ${values.echo}`);
await page.goBack();
values = await read(page, at("#card-2", "clients/vela/q3-board"));
ok("back returns to the first folder at its route", values.route === "#card-2" && echoed(values)?.scope === "clients/vela/q3-board", `${values.route} ${values.echo}`);
await page.goForward();
values = await read(page, at("#card-1", "decks/q3-pitch"));
ok("forward returns to the second", echoed(values)?.scope === "decks/q3-pitch", values.echo);

// 6. From another document's link.
await page.goto(SHELL);
await page.waitForTimeout(600);
await click(page, "#to-app");
values = await read(page, at("#card-1", "clients/vela/q3-board"));
ok("a link from another document carries query and fragment", echoed(values)?.scope === "clients/vela/q3-board" && values.route === "#card-1", `${values.search} ${values.route}`);
ok("…into the address", address().searchParams.get("path") === "app.html?scope=clients/vela/q3-board" && address().hash === "#card-1", page.url());

// 7. A query using the host's names is refused, not silently dropped.
const refused = await page.goto(`${SHELL}&path=app.html?session=thr_other`);
ok("an address whose query uses the host's names is refused", refused.status() === 400, String(refused.status()));

// 9. A frame navigated to an HTML file with no runtime gets no channel (review 1.9.0, finding 1): the shell
// loads its own document again, and the session receives nothing.
const sends = async () => (await (await fetch(`${BASE}/__stats`)).json()).calls.filter((call) => call.method === "sessions.send").length;
const sentBefore = await sends();
await page.goto(`${SHELL}&path=app.html?scope=clients/vela/q3-board#card-1`);
await read(page, at("#card-1", "clients/vela/q3-board"));
await click(page, "#leave");
await page.waitForTimeout(3000);
const foreign = page.frames().find((frame) => frame.url().includes("/thread-storage/files/foreign/"));
const foreignTitle = foreign ? await foreign.evaluate(() => document.title).catch(() => "gone") : "gone";
ok("a file with no runtime is never given the channel", foreignTitle !== "foreign: got the channel", foreignTitle);
ok("…and answers nothing to the session", (await sends()) === sentBefore, `${sentBefore} → ${await sends()}`);
values = await read(page, at("#card-1", "clients/vela/q3-board"));
ok("…and the shell shows its own document again, scoped and connected", echoed(values)?.scope === "clients/vela/q3-board" && values.route === "#card-1", `${values.route} ${values.echo}`);

// 10. A query-only link, and a link that keeps the current parameters (review findings 3 and 2).
await click(page, "#query-only");
values = await read(page, at("#card-9", "decks/q3-pitch"));
ok("a query-only link opens this document with the new query", echoed(values)?.scope === "decks/q3-pitch" && values.route === "#card-9" && (docOf(page)?.url() ?? "").includes("/document?"), `${values.search} ${values.route}`);
await click(page, "#keep");
values = await read(page, at("", "kept/folder"));
ok("a link built from location.search opens, the host's own parameters dropped", echoed(values)?.scope === "kept/folder" && address().searchParams.get("path") === "app.html?scope=kept/folder", `${values.search} ${page.url()}`);

// 11. An address typed with a raw & keeps every parameter, and is written back in the address's own form (finding 4).
await page.goto(`${SHELL}&path=app.html?scope=clients/vela/q3-board&view=grid#card-1`);
values = await read(page, at("#card-1", "clients/vela/q3-board"));
const typed = new URLSearchParams(values.search ?? "");
ok("a raw & in a typed address keeps every parameter", typed.get("scope") === "clients/vela/q3-board" && typed.get("view") === "grid", values.search);
await page.waitForTimeout(300);
ok("…and the address is written back inside path", address().searchParams.get("path") === "app.html?scope=clients/vela/q3-board&view=grid" && !address().searchParams.has("view"), page.url());

// 8. Seven tools load at once in one session, 60 calls each (D45): 420, under the session's 600 a minute.
await new Promise((resolve) => setTimeout(resolve, 61_000)); // a fresh minute for the session's budget
const tabs = await Promise.all(Array.from({ length: 7 }, () => context.newPage()));
await Promise.all(tabs.map((tab, index) => tab.goto(`${SHELL}&path=app.html?scope=tools/t${index}%26burst=60`)));
const bursts = await Promise.all(tabs.map((tab) => read(tab, (v) => Boolean(v.burst)).then((v) => (v.burst ? JSON.parse(v.burst) : null))));
const refusedCalls = bursts.reduce((sum, b) => sum + (b ? b.refused + b.failed : 60), 0);
ok("seven tools loading at once in one session are not refused", refusedCalls === 0, JSON.stringify(bursts));

await browser.close();
console.log(failed ? `${engine}: ${failed} failed` : `${engine}: all passed`);
process.exit(failed ? 1 : 0);
