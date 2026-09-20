import * as pw from "playwright";
// Playwright's evaluate() runs with a simulated user gesture, so nothing is evaluated while the page loads.
for (const name of ["chromium", "firefox", "webkit"]) {
  const b = await pw[name].launch(); const p = await b.newPage();
  const navs = []; p.on("framenavigated", f => { if (f === p.mainFrame()) navs.push(f.url().includes("session=${process.env.TP_EMBEDDED_SESSION}") ? "B" : "host"); });
  await p.goto(`${process.env.BB_SERVER_URL || "http://127.0.0.1:38886"}/api/v1/plugins/thread-pages/http/page?session=${process.env.TP_HOST_SESSION}&path=t-embed.html`);
  await p.waitForTimeout(12000);
  const onLoad = navs.includes("B") ? "NAVIGATED AWAY" : "stayed";
  const embed = p.frameLocator(".stage iframe").frameLocator("#slot iframe");
  const res = navs.includes("B") ? "" : await embed.locator("#navres").textContent();
  if (!navs.includes("B")) { await embed.locator("#nav").click(); await p.waitForURL(/session=${process.env.TP_EMBEDDED_SESSION}/, { timeout: 8000 }).catch(() => {}); }
  console.log(`${name}: on load → ${onLoad} (${res}); after the reader's click → ${p.url().includes("${process.env.TP_EMBEDDED_SESSION}") ? "navigated to B" : "did not navigate"}`);
  await b.close();
}
