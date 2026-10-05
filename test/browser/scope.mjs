/**
 * Browser pass for a document's scope and fragment (DECISIONS D41): one
 * generic document, `tool.html`, takes its folder from its fragment, scopes
 * its calls to it, and a contributor that echoes its caller shows what the
 * host passed. Checks that the fragment reaches the document when the address
 * carries it, on reload, from a link, on back and forward, and when the
 * document changes it; that a query does not; and that every contributed call
 * carries the scope; and that an app a loader swaps in keeps both. Not part of
 * the unit suite.
 *
 *   ECHO=1 SESSION=thr_scope node test/browser/serve.ts test/browser/pages/scope 8796
 *   PLAYWRIGHT=/path/to/node_modules/playwright ENGINE=chromium BASE=http://localhost:8796 node test/browser/scope.mjs
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
const page = await (await browser.newContext()).newPage();
const doc = () => page.frames().find((frame) => frame.url().includes("/document?"));
async function read() {
  // The shown document, once it has reported what the echo answered.
  for (let i = 0; i < 80; i += 1) {
    const frame = doc();
    if (frame) {
      const values = await frame
        .evaluate(() => Object.fromEntries(["hash", "search", "scope", "echo", "refused"].map((id) => [id, document.getElementById(id)?.textContent ?? null])))
        .catch(() => null);
      if (values && values.echo) return values;
    }
    await page.waitForTimeout(100);
  }
  return {};
}
const settle = async (expectHash) => {
  for (let i = 0; i < 80; i += 1) {
    const values = await read();
    if (values.hash === expectHash && echoed(values)?.scope === (expectHash.slice(1) || null)) return values;
    await page.waitForTimeout(100);
  }
  return read();
};
const echoed = (values) => (values.echo && values.echo.startsWith("{") ? JSON.parse(values.echo) : values.echo);
const address = () => new URL(page.url());

// 1. Opened from an address that carries the fragment.
await page.goto(`${SHELL}&path=tool.html#clients/vela/q3-board`);
let values = await settle("#clients/vela/q3-board");
ok("the address's fragment reaches the document", values.hash === "#clients/vela/q3-board", values.hash);
ok("the document scoped itself from it", values.scope === "clients/vela/q3-board", values.scope);
ok("the contributor received the session and the scope", JSON.stringify(echoed(values)) === JSON.stringify({ sessionId: SESSION, scope: "clients/vela/q3-board" }), values.echo);
ok("a scope with .. throws a TypeError in the page", values.refused === "TypeError", values.refused);

// 2. Reload.
await page.reload();
values = await settle("#clients/vela/q3-board");
ok("reload keeps the fragment", values.hash === "#clients/vela/q3-board" && echoed(values).scope === "clients/vela/q3-board", `${values.hash} ${values.echo}`);

// 2b. The reader's address changes only its fragment (a link to this page at another folder, or the
// address edited): a same-document navigation for the shell, which opens the document at it.
await page.goto(`${SHELL}&path=tool.html#clients/other`);
values = await settle("#clients/other");
ok("the address's fragment changed alone reaches the document", values.hash === "#clients/other" && echoed(values).scope === "clients/other", `${values.hash} ${values.echo}`);
await page.goBack();
values = await settle("#clients/vela/q3-board");
ok("…and back returns to the previous one", values.hash === "#clients/vela/q3-board" && echoed(values).scope === "clients/vela/q3-board", `${values.hash} ${values.echo}`);

// 3. The same document at another fragment: no reload, the address follows.
const frameBefore = doc();
await frameBefore.click("#to-deck");
values = await settle("#decks/q3-pitch");
ok("a link to itself at another fragment rescopes in place", values.hash === "#decks/q3-pitch" && echoed(values).scope === "decks/q3-pitch", `${values.hash} ${values.echo}`);
ok("…without reloading the document", doc() === frameBefore);
await page.waitForTimeout(300);
ok("the shell's address follows the document's fragment", address().hash === "#decks/q3-pitch", page.url());

// 4. Back and forward.
await page.goBack();
values = await settle("#clients/vela/q3-board");
ok("back returns to the previous fragment", values.hash === "#clients/vela/q3-board" && echoed(values).scope === "clients/vela/q3-board", `${values.hash} ${values.echo}`);
await page.waitForTimeout(300);
ok("…and the address follows", address().hash === "#clients/vela/q3-board", page.url());
await page.goForward();
values = await settle("#decks/q3-pitch");
ok("forward returns to the later fragment", values.hash === "#decks/q3-pitch", values.hash);
await page.reload();
values = await settle("#decks/q3-pitch");
ok("reload after the document changed its fragment returns there", values.hash === "#decks/q3-pitch" && echoed(values).scope === "decks/q3-pitch", values.hash);

// 5. From another document's link.
await page.goto(SHELL);
await page.waitForTimeout(500);
await doc().click("#to-board");
values = await settle("#clients/vela/q3-board");
ok("a link from another document carries its fragment", values.hash === "#clients/vela/q3-board" && echoed(values).scope === "clients/vela/q3-board", `${values.hash} ${values.echo}`);
ok("…into the address", address().searchParams.get("path") === "tool.html" && address().hash === "#clients/vela/q3-board", page.url());
await page.goBack();
await page.waitForTimeout(800);
ok("back to the index drops the fragment", !address().searchParams.has("path") && address().hash === "", page.url());
await page.goForward();
values = await settle("#clients/vela/q3-board");
ok("forward to the tool restores it", values.hash === "#clients/vela/q3-board", values.hash);

// 6. A link without a fragment, and a query, after one with: nothing sticks.
await page.goto(SHELL);
await page.waitForTimeout(500);
await doc().click("#to-plain");
values = await settle("");
ok("a link without a fragment opens with none, and no scope", values.hash === "" && echoed(values).scope === null, `${values.hash} ${values.echo}`);
await page.goto(SHELL);
await page.waitForTimeout(500);
await doc().click("#to-query");
values = await settle("");
ok("a query in a link is not carried (documented)", values.search === "no folder", values.search);

// 7a. Back and forward across a frame swap (review 1.8.0, finding 1): the document moves to another
// fragment, then another document opens, then Back and Forward retrace every step.
await page.goto(`${SHELL}&path=tool.html#clients/vela/q3-board`);
await settle("#clients/vela/q3-board");
await doc().click("#to-deck");
await settle("#decks/q3-pitch");
await page.waitForTimeout(300);
await doc().click("#to-index");
await page.waitForTimeout(1200);
ok("after a fragment change, another document opens", !address().searchParams.has("path"), page.url());
await page.goBack();
values = await settle("#decks/q3-pitch");
ok("Back across the swap returns to the moved fragment", values.hash === "#decks/q3-pitch" && echoed(values).scope === "decks/q3-pitch" && address().hash === "#decks/q3-pitch", `${values.hash} ${page.url()}`);
await page.goBack();
values = await settle("#clients/vela/q3-board");
ok("Back again returns to the fragment before it", values.hash === "#clients/vela/q3-board" && echoed(values).scope === "clients/vela/q3-board" && address().hash === "#clients/vela/q3-board", `${values.hash} ${page.url()}`);
await page.goForward();
values = await settle("#decks/q3-pitch");
ok("Forward returns to the moved fragment", values.hash === "#decks/q3-pitch" && address().hash === "#decks/q3-pitch", `${values.hash} ${page.url()}`);
await page.goForward();
await page.waitForTimeout(1200);
ok("Forward again returns to the other document", !address().searchParams.has("path") && address().hash === "", page.url());

// 7b. A bare #… link stays in the document (finding 3): the <base> would send it to the page's folder.
await page.goto(`${SHELL}&path=tool.html#clients/vela/q3-board`);
await settle("#clients/vela/q3-board");
await doc().click("#to-bare");
values = await settle("#clients/bare");
ok("a bare #… link moves within the document", values.hash === "#clients/bare" && echoed(values).scope === "clients/bare" && doc()?.url().includes("/document?"), `${values.hash} ${doc()?.url()}`);
await page.waitForTimeout(300);
ok("…and the address follows", address().hash === "#clients/bare", page.url());

// 7c. From script, clicking such a link is a Back step that lasts, as the guide says.
await doc().evaluate(() => document.getElementById("to-deck").click());
values = await settle("#decks/q3-pitch");
await page.waitForTimeout(300);
await doc().click("#to-index");
await page.waitForTimeout(1200);
await page.goBack();
values = await settle("#decks/q3-pitch");
await page.goBack();
values = await settle("#clients/bare");
ok("link.click() from script makes a Back step that outlives the document", values.hash === "#clients/bare" && address().hash === "#clients/bare", `${values.hash} ${page.url()}`);

// 7. A generic loader that swaps in an app's markup keeps the scope for the app's own scripts and keeps
// the kernel: it keeps its head (the host's <base> and runtime) and replaces the body. `document.open`
// would erase the kernel's listeners, so links would leave the page; loader.html#…/write shows that.
await page.goto(`${SHELL}&path=loader.html#clients/vela/q3-board/swap`);
await page.waitForTimeout(2500);
const loaded = JSON.parse((await doc().evaluate(() => document.title)) || "{}");
ok("an app swapped in by a loader sees the scope", loaded.appSaw?.scope === "clients/vela/q3-board/swap" && loaded.echo?.scope === "clients/vela/q3-board/swap", JSON.stringify(loaded));
await doc().click("#link");
await page.waitForTimeout(1500);
ok("…and its links still open in place", !address().searchParams.has("path"), page.url());

await browser.close();
console.log(failed ? `${engine}: ${failed} failed` : `${engine}: all passed`);
process.exit(failed ? 1 : 0);
