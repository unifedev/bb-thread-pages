import * as pw from "playwright"; const chromium = pw[process.env.ENGINE || "chromium"];
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
const BASE = `${process.env.BB_SERVER_URL || "http://127.0.0.1:38886"}/api/v1/plugins/thread-pages/http`;
const ME = process.env.TP_HOST_SESSION, B = process.env.TP_EMBEDDED_SESSION;
if (!ME || !B) { console.error("set TP_HOST_SESSION and TP_EMBEDDED_SESSION; see README.md"); process.exit(64); }
const ROOT = `${process.env.HOME}/.bb/thread-storage`;
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2] || "ABC";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 700 } });

async function openShell(path) {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(`${BASE}/page?session=${ME}&path=${path}`);
  await page.evaluate(() => { window.__shellMarker = Math.random(); });
  return page;
}
const inner = (page) => page.frameLocator(".stage iframe:not([data-incoming])");

if (only.includes("A")) {
  const file = `${ROOT}/${ME}/t-refresh.html`;
  const original = readFileSync(file, "utf8");
  const page = await openShell("t-refresh.html");
  await inner(page).locator("#marker").waitFor();
  const before = await page.evaluate(() => ({ len: history.length, href: location.href, marker: window.__shellMarker }));
  const working = await page.locator("[data-shell-working]").getAttribute("data-visible");
  ok("A0 session is shown as working (precondition for the fast cadence)", working === "true", `data-visible=${working}`);
  // scroll the document, then rewrite it
  await inner(page).locator("body").evaluate(() => window.scrollTo(0, 700));
  await sleep(450);
  const samples = [];
  for (let run = 0; run < 4; run += 1) {
    const text = `R v${run + 2}`;
    const t0 = Date.now();
    writeFileSync(file, original.replace("R v1", text));
    await inner(page).locator("#marker", { hasText: text }).waitFor({ timeout: 8000 });
    samples.push(Date.now() - t0);
    await sleep(300 + run * 370);
  }
  ok("A1 rewritten document visible ≤ ~2.5 s after save while working", Math.max(...samples) <= 2700, `ms: ${samples.join(", ")}`);
  const after = await page.evaluate(() => ({ len: history.length, href: location.href, marker: window.__shellMarker, frames: document.querySelectorAll("iframe").length }));
  ok("A2 history.length and location.href unchanged by 4 refreshes; the shell was not reloaded", after.len === before.len && after.href === before.href && after.marker === before.marker, JSON.stringify({ before: before.len, after: after.len, frames: after.frames }));
  ok("A2b exactly one frame remains after the swaps", after.frames === 1);
  const scrollY = await inner(page).locator("body").evaluate(() => Math.round(window.scrollY));
  ok("A2c the document's scroll position survived the refreshes", Math.abs(scrollY - 700) <= 2, `scrollY=${scrollY}`);
  const ctx = await inner(page).locator("body").evaluate(async () => (await window.threadPage.invoke("context.get")).page.revision.length);
  ok("A2d the refreshed document's kernel is connected (context.get answers)", ctx === 64);
  // dirty
  await inner(page).locator("#typed").fill("half a thought");
  writeFileSync(file, original.replace("R v1", "R dirty-new"));
  await sleep(5000);
  const stillOld = await inner(page).locator("#marker").textContent();
  const typed = await inner(page).locator("#typed").inputValue();
  const status = await page.locator("[data-shell-status]").textContent();
  const reloadVisible = await page.locator("[data-shell-reload]").getAttribute("data-visible");
  ok("A3 a dirty page is not refreshed under the reader; the new version is offered", stillOld !== "R dirty-new" && typed === "half a thought" && /Page changed/.test(status) && reloadVisible === "true", `marker="${stillOld}" status="${status}"`);
  await page.locator("[data-shell-reload]").click();
  await inner(page).locator("#marker", { hasText: "R dirty-new" }).waitFor({ timeout: 8000 });
  const afterReload = await page.evaluate(() => ({ len: history.length, marker: window.__shellMarker }));
  ok("A3b accepting the offer shows it in place (shell not reloaded, no history entry)", afterReload.marker === before.marker && afterReload.len === before.len);
  // multi-document navigation still works: open another document by link semantics, then back
  await page.evaluate(() => history.length);
  writeFileSync(file, original);
  await page.close();
}

if (only.includes("C")) {
  const dir = `${ROOT}/${ME}/_tparts`;
  if (existsSync(`${dir}/015.html`)) unlinkSync(`${dir}/015.html`);
  const page = await openShell("t-parts.html");
  await inner(page).locator(".part").first().waitFor();
  const texts = async () => (await inner(page).locator("#main .part").allTextContents()).map((t) => t.trim());
  ok("C1 parts render in name order", JSON.stringify(await texts()) === JSON.stringify(["part 01", "part 02"]), JSON.stringify(await texts()));
  const img = await inner(page).locator("#dot").evaluate((el) => ({ w: el.naturalWidth, src: el.src.slice(0, 22) }));
  ok("C1b a part's relative image resolved from the part's directory and was carried", img.w === 8 && img.src.startsWith("data:image/svg+xml"), JSON.stringify(img));
  const marker = await page.evaluate(() => window.__shellMarker);
  const t0 = Date.now();
  writeFileSync(`${dir}/015.html`, '<section class="part">part 015 (added)</section>\n');
  await inner(page).locator(".part", { hasText: "part 015" }).waitFor({ timeout: 8000 });
  ok("C2 adding a part file changes the revision and refreshes the reader in place", JSON.stringify(await texts()) === JSON.stringify(["part 01", "part 015 (added)", "part 02"]) && (await page.evaluate(() => window.__shellMarker)) === marker, `${Date.now() - t0} ms; ${JSON.stringify(await texts())}`);
  const refused = await inner(page).locator("#refused link[rel=thread-page-include]").count();
  const bodyText = await inner(page).locator("body").textContent();
  ok("C3 a ../ include and a non-part include are refused (left as written)", refused === 2, `links left: ${refused}`);
  ok("C3b a symlinked part (→ /etc/hosts) is not included", !/localhost|127\.0\.0\.1/.test(bodyText));
  const direct = await context.request.get(`${BASE}/document?session=${ME}&path=_tparts/01.html`);
  ok("C4 a part is not a navigable document", direct.status() === 400, `status ${direct.status()}`);
  unlinkSync(`${dir}/015.html`);
  await page.close();
}

if (only.includes("B")) {
  const bFile = `${ROOT}/${B}/index.html`;
  const bOriginal = readFileSync(bFile, "utf8").replace(/B v\d+/, "B v1");
  writeFileSync(bFile, bOriginal);
  execSync(`bb thread-page grants --revoke-all`);
  execSync(`bb plugin config thread-pages set embedAnswerGrants true`);
  const page = await openShell("t-embed.html");
  const host = inner(page);
  const embed = host.frameLocator("#slot iframe");
  await embed.locator("#marker", { hasText: "B v1" }).waitFor({ timeout: 10000 });
  ok("B1 the embed shows the second session's page", true);
  const sandboxes = await host.locator("iframe").evaluateAll((els) => els.map((el) => ({ id: el.id, sandbox: el.getAttribute("sandbox"), allow: el.getAttribute("allow"), src: el.getAttribute("src") })));
  ok("B1b every embed frame is sandbox=\"allow-scripts allow-forms\", including the author's wider iframe", sandboxes.length === 2 && sandboxes.every((s) => s.sandbox === "allow-scripts allow-forms" && !s.allow && !s.src), JSON.stringify(sandboxes));
  await host.frameLocator("#own").locator("#marker", { hasText: "B second" }).waitFor({ timeout: 10000 });
  ok("B1c a second embed (another document of that page, author's own iframe) shows too", true);
  await embed.locator("#probe", { hasText: "origin" }).waitFor();
  const probe = JSON.parse(await embed.locator("#probe").textContent());
  ok("B3a inside the embed: context.get names the EMBEDDED session; storage and sessions.send are unavailable; parent DOM blocked; opaque origin", probe.session === B && probe.storage === "unavailable" && probe.send === "unavailable" && probe.parentDom === "blocked" && probe.origin === "null", JSON.stringify(probe));
  // follow a change without the host page reloading
  const hostLoadedAt = await host.locator("body").evaluate(() => window.__hostLoadedAt);
  const histAtStart = await page.evaluate(() => history.length);
  await embed.locator("body").evaluate(() => window.scrollTo(0, 300));
  await sleep(500);
  const t0 = Date.now();
  writeFileSync(bFile, bOriginal.replace("B v1", "B v2"));
  await embed.locator("#marker", { hasText: "B v2" }).waitFor({ timeout: 15000 });
  const followMs = Date.now() - t0;
  const sameHost = (await host.locator("body").evaluate(() => window.__hostLoadedAt)) === hostLoadedAt;
  ok("B2 the embed follows a changed file without the host page reloading, adding no history entry", sameHost && (await page.evaluate(() => history.length)) === histAtStart, `${followMs} ms (embedded session idle → 10 s cadence); history ${histAtStart} → ${await page.evaluate(() => history.length)}`);
  await sleep(400);
  const embedScroll = await embed.locator("body").evaluate(() => Math.round(window.scrollY));
  ok("B2b the embed kept its scroll position across the refresh", Math.abs(embedScroll - 300) <= 2, `scrollY=${embedScroll}`);

  // first answer → grant dialog once
  const note = `embed answer ${Date.now()}`;
  await embed.locator("textarea[name=note]").fill(note);
  await embed.locator("button[name=action]").click();
  const dialog = page.locator("dialog:not([data-shell-grants-dialog])");
  await dialog.locator("p").filter({ hasText: "send your answers" }).waitFor({ timeout: 8000 });
  const summary = await dialog.locator("p").textContent();
  const heading = await dialog.locator("h2").textContent();
  ok("B4 first answer shows ONE grant dialog in trusted chrome naming both pages", summary.includes(`(${B})`) && /send your answers to/.test(summary) && /Allow answers/.test(heading), summary.slice(0, 140));
  await sleep(600);
  await dialog.locator("button[value=confirm]").click();
  await embed.locator("[data-thread-page-status]", { hasText: /^Sent/ }).waitFor({ timeout: 10000 });
  const status1 = await embed.locator("[data-thread-page-status]").textContent();
  ok("B4b after allowing, the form inside the embed says it was sent, worded as on its own page", /^Sent \((queued|started)\)$/.test(status1), status1);
  const grantsButton = await page.locator("[data-shell-grants]").textContent();
  ok("B4c the grant is listed in the shell bar", /Answers → 1/.test(grantsButton), grantsButton);

  // second answer → no dialog
  await sleep(1500);
  const note2 = `second answer ${Date.now()}`;
  await embed.locator("textarea[name=note]").fill(note2);
  await embed.locator("button[name=action]").click();
  await embed.locator("[data-thread-page-status]", { hasText: /^Sent/ }).waitFor({ timeout: 10000 });
  const dialogOpen = await dialog.evaluate((el) => el.open);
  ok("B5 the second answer shows no dialog", dialogOpen === false);

  // the message arrived in the EMBEDDED session, worded as a submission from its own page
  await sleep(1500);
  const expected = `The user answered the form on your Thread Page — Fixture form.\n\n**Action**\nSend it\n\n**Your note**\n${note}`;
  let timeline = "";
  try { timeline = execSync(`bb thread messages ${B} --json --all`, { encoding: "utf8", maxBuffer: 1 << 26 }); } catch (e) { timeline = String(e.stdout || ""); }
  writeFileSync("/tmp/b-timeline.json", timeline);
  ok("B6 the answer arrived in the embedded session with the exact own-page wording", timeline.includes(JSON.stringify(expected).slice(1, -1)) || timeline.includes(expected), `looked for: ${JSON.stringify(expected).slice(0, 90)}…`);
  let mine = "";
  try { mine = execSync(`bb thread messages ${ME} --json --all || true`, { encoding: "utf8", maxBuffer: 1 << 26 }); } catch {}
  ok("B6b …and NOT in the host page's session", !mine.includes(note));

  // hostile: the answer path cannot reach a session this page has no grant for / no token for
  const forged = await host.locator("body").evaluate(() => window.__hostile("forged"));
  ok("B8a hostile: a forged answer token is refused", forged.error === "confirmation_invalid", JSON.stringify(forged));
  const named = await host.locator("body").evaluate(() => window.__hostile("never-read"));
  ok("B8b hostile: naming a session in the call is refused (no such parameter)", named.error === "invalid_params", JSON.stringify(named));
  const pending = host.locator("body").evaluate(() => window.__hostile("other-target"));
  await dialog.locator("p").filter({ hasText: "send your answers" }).waitFor({ timeout: 8000 });
  const otherSummary = await dialog.locator("p").textContent();
  await dialog.locator("button[value=cancel]").click();
  const other = await pending;
  ok("B8c hostile: a session it read but was never granted needs the reader — the dialog names the REAL target; declined = cancelled, nothing sent", other.error === "cancelled" && !(otherSummary.split("send your answers to")[1] || "").includes(`(${B})`), `${JSON.stringify(other)} · “${otherSummary.slice(0, 110)}…”`);

  // setting off → no dialog at all
  execSync(`bb thread-page grants --revoke-all`);
  execSync(`bb plugin config thread-pages set embedAnswerGrants false`);
  await sleep(1200);
  await embed.locator("textarea[name=note]").fill(`setting off ${Date.now()}`);
  await embed.locator("button[name=action]").click();
  await embed.locator("[data-thread-page-status]", { hasText: /^Sent/ }).waitFor({ timeout: 10000 });
  ok("B7 with the setting off: delivered with no dialog", (await dialog.evaluate((el) => el.open)) === false);
  execSync(`bb plugin config thread-pages set embedAnswerGrants true`);

  // dirty embed is not refreshed; update offered inside it
  await embed.locator("textarea[name=note]").fill("typing, do not refresh me");
  writeFileSync(bFile, bOriginal.replace("B v1", "B v3"));
  await embed.locator('[data-thread-page-update="host"]').waitFor({ timeout: 15000 });
  const keptText = await embed.locator("textarea[name=note]").inputValue();
  const keptMarker = await embed.locator("#marker").textContent();
  ok("B9 an embed being typed into is not refreshed; the update is offered inside it", keptText === "typing, do not refresh me" && keptMarker === "B v2", `marker=${keptMarker}`);
  await embed.locator('[data-thread-page-update="host"] button').click();
  await embed.locator("#marker", { hasText: "B v3" }).waitFor({ timeout: 8000 });
  ok("B9b accepting the offer refreshes the embed", true);
  // link inside the embed opens its other document in the embed
  const histBefore = await page.evaluate(() => history.length);
  await embed.locator('a[href="second.html"]').click();
  await embed.locator("#marker", { hasText: "B second" }).waitFor({ timeout: 8000 });
  ok("B10 a relative .html link inside the embed opens that document in the embed, no history entry", (await page.evaluate(() => history.length)) === histBefore);
  writeFileSync(bFile, bOriginal);
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync("/tmp/live-results.json", JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
