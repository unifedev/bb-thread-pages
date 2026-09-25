/**
 * Browser pass for voice, text areas and files (spec 1.5, DECISIONS D38–D40),
 * against `serve.ts` serving `pages/voice` as one session's page, over the
 * unit tests' in-memory host (its transcriber answers a fixed text). Not part
 * of the unit suite.
 *
 *   SESSION=thr_voice node test/browser/serve.ts test/browser/pages/voice 8795
 *   PLAYWRIGHT=/path/to/node_modules/playwright ENGINE=chromium BASE=http://localhost:8795 node test/browser/voice.mjs
 *
 * Fake microphones: Chromium `--use-fake-device-for-media-stream
 * --use-fake-ui-for-media-stream`; Firefox `media.navigator.streams.fake` and
 * `media.navigator.permission.disabled`; WebKit `grantPermissions`.
 *
 * Playwright's `evaluate` — and the checks behind a locator's click — run with
 * a simulated user gesture in the frame they touch, which the browser
 * propagates to the shell. So the checks about the reader's activation click
 * by coordinates and evaluate nothing in the page while they wait.
 */
const pw = await import(process.env.PLAYWRIGHT || "playwright");
const engine = process.env.ENGINE || "chromium";
const BASE = process.env.BASE || "http://localhost:8795";
const SESSION = process.env.SESSION || "thr_voice";
const ROUTE = `${BASE}/api/v1/plugins/thread-pages/http`;
const TRANSCRIPT = "there";
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass === null ? "NOTE" : pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const set = (query) => fetch(`${BASE}/__set?${query}`).then((response) => response.json());
const stats = () => fetch(`${BASE}/__stats`).then((response) => response.json());
const callsOf = async (method) => (await stats()).calls.filter((entry) => entry.method === method);

const launch =
  engine === "chromium"
    ? { channel: "chromium", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }
    : engine === "firefox"
      ? { firefoxUserPrefs: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true } }
      : {};
const browser = await pw[engine].launch(launch);
const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
if (engine !== "firefox") await context.grantPermissions(["microphone"], { origin: BASE });
// Test hooks, in every frame before any script: the layer's shadow root open for inspection, and in
// the shell a record of its own activation whenever the page posts a probe.
await context.addInitScript(() => {
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    return attach.call(this, { ...init, mode: "open" });
  };
  if (window.top === window) {
    window.__probe = [];
    addEventListener("message", (event) => {
      const kind = event.data && event.data.kind;
      if (kind === "voice-pass:probe" || kind === "voice-pass:probe-idle") window.__probe.push({ kind, active: navigator.userActivation ? navigator.userActivation.isActive : null });
    });
  }
});

await set(`voice=on&transcribe=ok&attachFail=&reset=1&text=${TRANSCRIPT}`);
const shell = await context.newPage();
const pageErrors = [];
// A119 asks the page frame for the microphone on purpose; WebKit reports the refusal as an error.
shell.on("pageerror", (error) => {
  if (!/Permission policy 'Microphone'|Not allowed to call getUserMedia/.test(error.message)) pageErrors.push(error.message);
});
const bar = shell.locator("[data-shell-recorder]");
const done = shell.locator('[data-rec="done"]');
const barOpen = () => bar.evaluate((node) => !node.hidden);

async function open() {
  const response = await shell.goto(`${ROUTE}/page?session=${SESSION}`);
  // No locator waits here: they would give the page a gesture before the idle probe.
  await sleep(2_500);
  return response;
}
const pageFrame = () => shell.frames().find((frame) => frame.url().includes("/document?")) ?? null;
const embedFrame = () => pageFrame()?.childFrames()[0] ?? null;
/** Where an element of the page frame is on the screen, for a click that is only an input event. */
async function point(selector) {
  const frameBox = await shell.locator(".stage iframe:not([data-incoming])").boundingBox();
  const box = await pageFrame().locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, frameBox };
}
async function output(id, frame = pageFrame(), timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = await frame.evaluate((which) => document.getElementById(which).textContent, id).catch(() => "");
    if (text) return JSON.parse(text);
    await sleep(200);
  }
  return null;
}
async function clearOutput(id, frame = pageFrame()) {
  await frame.evaluate((which) => (document.getElementById(which).textContent = ""), id);
}
async function recordAndFinish(ms = 1_300) {
  await bar.waitFor({ state: "visible", timeout: 10_000 });
  await sleep(ms);
  await done.click();
  await bar.waitFor({ state: "hidden", timeout: 10_000 });
}

// --- the reader's activation reaches the shell (R3.32a) ----------------------------------------
const response = await open();
const headers = response.headers();
ok("A120 the shell sends microphone=(self)", headers["permissions-policy"] === "camera=(), microphone=(self), geolocation=(), payment=(), usb=()", headers["permissions-policy"]);
const idle = await shell.evaluate(() => window.__probe.find((entry) => entry.kind === "voice-pass:probe-idle"));
ok("activation: the shell is not active when nobody pressed anything", idle && idle.active === false, JSON.stringify(idle));
const probe = await point("#probe");
const speakLate = await point("#speak-late");
const speak = await point("#speak");
// Let whatever activation the measuring above gave run out (5 s in Chromium and Firefox).
await sleep(6_000);
await shell.mouse.click(probe.x, probe.y);
await sleep(400);
const clicked = await shell.evaluate(() => window.__probe.filter((entry) => entry.kind === "voice-pass:probe").at(-1));
ok("activation: a click in the sandboxed page frame makes the shell's navigator.userActivation.isActive true", clicked && clicked.active === true, JSON.stringify(clicked));

// A call made 6 s after the click, from a timer: no activation left, no bar. A122a
await shell.mouse.click(speakLate.x, speakLate.y);
// Nothing is evaluated meanwhile, in the shell or the page: that would be a gesture. A bar that
// opened would still be open afterwards, since nobody closes it.
await sleep(8_000);
const lateBar = await barOpen();
const late = await output("voice-result");
ok("A122a a call without the reader's action is unavailable and opens no bar", late && late.ok === false && late.code === "unavailable" && /presses something/.test(late.message) && !lateBar, JSON.stringify(late));

// --- the page frame and the embed never get the microphone (A119) --------------------------------
const frameAllow = await shell.locator(".stage iframe:not([data-incoming])").getAttribute("allow");
await pageFrame().locator("#embed-box iframe").waitFor({ timeout: 10_000 });
const embedAllow = await pageFrame().locator("#embed-box iframe").getAttribute("allow");
ok("A119 neither frame's allow names the microphone", !/microphone/.test(frameAllow) && !/microphone/.test(embedAllow ?? ""), `${frameAllow} / ${embedAllow}`);
const docHeaders = await (await fetch(`${ROUTE}/document?session=${SESSION}`)).headers.get("permissions-policy");
ok("A119 the document sends microphone=()", docHeaders === "camera=(), microphone=(), geolocation=(), payment=(), usb=()", docHeaders);
for (const [label, frame] of [["page frame", pageFrame()], ["embed frame", embedFrame()]]) {
  const outcome = await frame.evaluate(() => navigator.mediaDevices ? navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => { stream.getTracks().forEach((track) => track.stop()); return "granted"; }, (error) => error.name) : "no mediaDevices").catch((error) => `threw ${error.message}`);
  ok(`A119 getUserMedia in the ${label} is refused`, outcome !== "granted", outcome);
}

// --- the capability (A121–A123) -------------------------------------------------------------------
await clearOutput("voice-result");
await sleep(6_000);
await set("reset=1");
await shell.mouse.click(speak.x, speak.y);
await bar.waitFor({ state: "visible", timeout: 10_000 });
const waveform = await shell.locator("[data-shell-recorder] canvas").boundingBox();
ok("A121 the bar opens in the shell with a waveform, Cancel and Done", waveform !== null && (await shell.locator('[data-rec="cancel"]').isVisible()) && (await done.isVisible()));
await sleep(1_300);
ok("A121 nothing reaches the transcriber before Done", (await callsOf("voice.transcribe")).length === 0);
await done.click();
const answered = await output("voice-result");
ok("A123 Done resolves with the host's transcript and, with keepAudio, the recording", answered && answered.ok && answered.text === TRANSCRIPT && /^audio\//.test(answered.audioType ?? "") && answered.audioSize > 0, JSON.stringify(answered));
const sentAudio = (await callsOf("voice.transcribe"))[0];
ok("A123 the recording went to the transcriber once, with the page's context", sentAudio && sentAudio.args[0].prompt === "the page asked" && sentAudio.args[0].size > 0, JSON.stringify(sentAudio?.args[0]));
ok("A120 the shell records in this engine", Boolean(sentAudio), sentAudio?.args[0].mimeType);

// Escape and Cancel. A122
for (const how of ["Escape", "Cancel"]) {
  await clearOutput("voice-result");
  await pageFrame().locator("#speak").click();
  await bar.waitFor({ state: "visible", timeout: 10_000 });
  await sleep(1_200);
  if (how === "Escape") await shell.keyboard.press("Escape");
  else await shell.locator('[data-rec="cancel"]').click();
  const cancelled = await output("voice-result");
  ok(`A122 ${how} rejects with cancelled and sends nothing`, cancelled && cancelled.code === "cancelled" && (await callsOf("voice.transcribe")).length === 1, JSON.stringify(cancelled));
}

// One at a time, questions included, and Too short. A122a
await clearOutput("voice-result");
await pageFrame().locator("#speak").click();
await bar.waitFor({ state: "visible", timeout: 10_000 });
const second = await pageFrame().evaluate(() => window.threadPage.invoke("voice.captureAndTranscribe", {}).then(() => "ok", (error) => error.code));
const question = await pageFrame().evaluate(() => window.threadPage.invoke("navigation.openExternal", { url: "https://example.com/" }).then(() => "ok", (error) => error.code));
ok("A122a a second bar, and a confirmation, are declined while the bar is open", second === "unavailable" && question === "cancelled" && !(await shell.locator("dialog[open]").count()), `${second} / ${question}`);
await done.click();
const shortText = await shell.locator("[data-rec-status]").textContent();
const short = await output("voice-result");
ok("A122a Done under 1 s says Too short, sends nothing and is cancelled", shortText === "Too short" && short && short.code === "cancelled" && (await callsOf("voice.transcribe")).length === 1, `${shortText} / ${JSON.stringify(short)}`);

// --- the text-area controls (A126, A127, A130a) ---------------------------------------------------
const layer = await pageFrame().evaluate(() => {
  const host = document.documentElement.lastElementChild;
  const field = document.getElementById("notes");
  const dictate = host.shadowRoot.querySelector('button[aria-label="Dictate"]');
  const attach = host.shadowRoot.querySelector('button[aria-label="Attach files"]');
  const f = field.getBoundingClientRect();
  const d = dictate.getBoundingClientRect();
  const a = attach.getBoundingClientRect();
  const svg = dictate.querySelector("svg").getBoundingClientRect();
  const style = getComputedStyle(dictate);
  return {
    tag: host.tagName.toLowerCase(),
    inBody: document.body.contains(host),
    hostDisplay: getComputedStyle(host).display,
    corner: d.left >= f.left && a.right <= f.right && d.top >= f.top && d.bottom <= f.bottom && a.right > f.right - 40 && d.bottom > f.bottom - 34,
    size: [Math.round(d.width), Math.round(d.height), Math.round(svg.width), Math.round(svg.height)],
    color: style.color,
    fieldColor: getComputedStyle(field).color,
    opacity: style.opacity,
    background: style.backgroundColor,
    visible: !dictate.hidden && !attach.hidden,
  };
});
ok("A130a the layer's host is the last child of <html>, outside <body>, and page rules do not hide it", layer.tag === "thread-page-controls" && !layer.inBody && layer.hostDisplay === "block", JSON.stringify(layer));
ok("A126 Dictate and Attach files sit over the bottom-right corner, 16 px icons, in the field's colour, untouched by page rules on button, svg and *", layer.visible && layer.corner && layer.size.join() === "24,24,16,16" && layer.color === layer.fieldColor && layer.opacity === "0.55" && !/255, 0, 0/.test(layer.background), JSON.stringify(layer));
const untouched = await pageFrame().evaluate(() => document.getElementById("notes").outerHTML);
ok("A126 the field's markup is as authored", untouched === '<textarea name="notes" id="notes"></textarea>', untouched);
const loose = await pageFrame().evaluate(() => {
  const host = document.documentElement.lastElementChild;
  const groups = [...host.shadowRoot.querySelectorAll(".group")];
  return groups.map((group) => [...group.querySelectorAll("button")].filter((button) => !button.hidden).map((button) => button.getAttribute("aria-label")).join("+") + (group.hidden ? " (hidden)" : ""));
});
ok("A131 a text area outside any form shows Dictate only", loose.includes("Dictate"), JSON.stringify(loose));
// Tab order. A130a
await pageFrame().locator("#notes").focus();
await shell.keyboard.press("Tab");
const tab1 = await pageFrame().evaluate(() => document.documentElement.lastElementChild.shadowRoot.activeElement?.getAttribute("aria-label") ?? document.activeElement?.id);
await shell.keyboard.press("Tab");
const tab2 = await pageFrame().evaluate(() => document.documentElement.lastElementChild.shadowRoot.activeElement?.getAttribute("aria-label") ?? document.activeElement?.id);
await shell.keyboard.press("Tab");
const tab3 = await pageFrame().evaluate(() => document.activeElement?.id || document.activeElement?.name || document.activeElement?.tagName);
ok("A130a Tab from the field reaches Dictate, then Attach files, then what follows", tab1 === "Dictate" && tab2 === "Attach files" && tab3 === "voice", `${tab1} → ${tab2} → ${tab3}`);

// --- Dictate (A128) -------------------------------------------------------------------------------
await set("reset=1");
await pageFrame().evaluate(() => {
  const field = document.getElementById("notes");
  field.value = "Hello world";
  field.focus();
  field.setSelectionRange(5, 5);
  window.__events = [];
  field.addEventListener("input", () => window.__events.push("input"));
  field.addEventListener("change", () => window.__events.push("change"));
});
await pageFrame().locator('button[aria-label="Dictate"]').first().click();
await recordAndFinish();
await sleep(300);
const dictated = await pageFrame().evaluate(() => ({ value: document.getElementById("notes").value, events: window.__events }));
const dictatePrompt = (await callsOf("voice.transcribe"))[0]?.args[0].prompt;
ok("A128 dictation inserts at the caret with a separating space and fires input and change", dictated.value === `Hello ${TRANSCRIPT} world` && dictated.events.join() === "input,change", JSON.stringify(dictated));
ok("A128 the text before the caret went as context", dictatePrompt === "Hello", dictatePrompt);

// --- Attach, paste, drop (A129, A130, A130a) -----------------------------------------------------
const afterBefore = await pageFrame().locator("#after").boundingBox();
const chooser = shell.waitForEvent("filechooser");
await pageFrame().locator('button[aria-label="Attach files"]').first().click();
await (await chooser).setFiles([
  { name: "shot.png", mimeType: "image/png", buffer: Buffer.from("PNGDATA") },
  { name: "memo.ogg", mimeType: "audio/ogg", buffer: Buffer.from("OGGDATA") },
]);
const pasted = await pageFrame().evaluate(() => {
  const field = document.getElementById("notes");
  const make = () => {
    const transfer = new DataTransfer();
    return transfer;
  };
  const paste = make();
  paste.items.add(new File(["pasted"], "pasted.txt", { type: "text/plain" }));
  let pasteEvent;
  try {
    pasteEvent = new ClipboardEvent("paste", { clipboardData: paste, bubbles: true, cancelable: true });
  } catch {
    pasteEvent = null;
  }
  // Some engines keep a script-built paste event's files to themselves; a real paste carries them.
  const usable = Boolean(pasteEvent && pasteEvent.clipboardData && pasteEvent.clipboardData.files.length > 0);
  if (usable) field.dispatchEvent(pasteEvent);
  const drop = make();
  drop.items.add(new File(["dropped"], "dropped.txt", { type: "text/plain" }));
  field.dispatchEvent(new DragEvent("drop", { dataTransfer: drop, bubbles: true, cancelable: true }));
  return usable;
});
await sleep(300);
const chips = await pageFrame().evaluate(() => [...document.documentElement.lastElementChild.shadowRoot.querySelectorAll(".chip span")].map((node) => node.textContent));
ok("A130 files chosen, pasted and dropped are listed under the field", chips.some((text) => text.startsWith("shot.png")) && chips.some((text) => text.startsWith("memo.ogg")) && chips.some((text) => text.startsWith("dropped.txt")) && (!pasted || chips.some((text) => text.startsWith("pasted.txt"))), `${JSON.stringify(chips)}${pasted ? "" : " (this engine cannot build a paste event with files)"}`);
const afterAfter = await pageFrame().locator("#after").boundingBox();
ok("A130a the attachment list takes no layout space", afterBefore.y === afterAfter.y && afterBefore.x === afterAfter.x, `${afterBefore.y} → ${afterAfter.y}`);
await pageFrame().locator('button[aria-label="Remove dropped.txt"]').click();
await set("reset=1");
await pageFrame().locator("#send").click();
await pageFrame().locator("[data-thread-page-status]").filter({ hasText: /Sent|fail|larger|Could/ }).waitFor({ timeout: 15_000 });
const sentMessage = (await callsOf("sessions.send")).at(-1)?.args[1] ?? "";
ok("A129 the text area's files arrive beside its text, the audio one with its transcript, the removed one not at all", /Attached here:\n- `\$BB_THREAD_STORAGE\/uploads\/\d{8}-\d{6}-[a-f0-9]{6}-shot\.png`/.test(sentMessage) && /memo\.ogg[^\n]*\n  Transcript: there/.test(sentMessage) && !/dropped\.txt/.test(sentMessage), sentMessage.slice(0, 600));

// --- the audio capture input (A133) --------------------------------------------------------------
for (const failing of [false, true]) {
  await set(`reset=1&transcribe=${failing ? "fail" : "ok"}`);
  await pageFrame().evaluate(() => {
    document.getElementById("notes").value = "";
  });
  await pageFrame().locator("#voice").click();
  await recordAndFinish(1_400);
  const files = await pageFrame().evaluate(() => [...document.getElementById("voice").files].map((file) => `${file.name} ${file.type} ${file.size}`));
  await pageFrame().locator("#send").click();
  await sleep(2_500);
  const message = (await callsOf("sessions.send")).at(-1)?.args[1] ?? "";
  const expected = failing ? /recording-\d{8}-\d{6}\.(webm|ogg|m4a)[^\n]*\n  Transcript missing/ : /recording-\d{8}-\d{6}\.(webm|ogg|m4a)[^\n]*\n  Transcript: there/;
  ok(`A133 on desktop the audio input records in the shell's bar and the answer carries ${failing ? "that the transcript is missing" : "the transcript"}`, files.length === 1 && expected.test(message), `${files.join()} | ${message.slice(-300)}`);
}
await set("transcribe=ok");

// --- inside an embed (A131) ------------------------------------------------------------------------
const inner = embedFrame();
const innerControls = await inner.evaluate(() => {
  const host = document.documentElement.lastElementChild;
  const group = host.shadowRoot.querySelector(".group");
  return [...group.querySelectorAll("button")].filter((button) => !button.hidden).map((button) => button.getAttribute("aria-label"));
});
ok("A131 inside an embed a text area shows Dictate and no Attach", innerControls.join() === "Dictate", JSON.stringify(innerControls));
await inner.locator('button[aria-label="Dictate"]').click();
await recordAndFinish();
await sleep(400);
const innerValue = await inner.evaluate(() => document.getElementById("inner").value);
ok("A131 dictation inside an embed works, through the embedding page's shell", innerValue === TRANSCRIPT, innerValue);
await inner.locator("#inner-speak").click();
await sleep(1_000);
const innerVoice = await inner.evaluate(() => document.getElementById("inner-result").textContent);
ok("R4.48 the embedded page's own voice capability is unavailable", innerVoice === "unavailable" && !(await barOpen()), innerVoice);

// --- files with sessions.start (A134, A135) ------------------------------------------------------
await set("reset=1&attachFail=");
await pageFrame().locator("#pick").setInputFiles([
  { name: "screenshot.png", mimeType: "image/png", buffer: Buffer.from("PNG!!") },
  { name: "build.log", mimeType: "text/plain", buffer: Buffer.from("log") },
]);
await pageFrame().locator("#start-files").click();
const dialog = shell.locator("dialog[open] p");
await dialog.waitFor({ timeout: 10_000 });
const summary = await dialog.textContent();
ok("A134 the confirmation names each file with its size", summary.includes("“screenshot.png” (5 bytes)") && summary.includes("“build.log” (3 bytes)"), summary);
ok("A134 nothing is uploaded before Confirm", (await callsOf("attachments.upload")).length === 0);
await sleep(500);
await shell.locator('dialog[open] button[value="confirm"]').click();
const started = await output("start-result");
const uploads = await callsOf("attachments.upload");
const start = (await callsOf("sessions.start")).at(-1);
ok("A134 after Confirm the files are native attachments of the new session's prompt (image as image)", started?.ok && uploads.length === 2 && start?.args[0].attachments?.map((entry) => entry.kind).join() === "image,file", `${JSON.stringify(started)} ${JSON.stringify(start?.args[0].attachments)}`);
await clearOutput("start-result");
await pageFrame().locator("#start-files").click();
await dialog.waitFor({ timeout: 10_000 });
await shell.locator('dialog[open] button[value="cancel"]').click();
const declined = await output("start-result");
ok("A135 declining uploads nothing and is cancelled", declined?.code === "cancelled" && (await callsOf("attachments.upload")).length === 2, JSON.stringify(declined));
await set("attachFail=build.log");
await clearOutput("start-result");
await pageFrame().locator("#start-files").click();
await dialog.waitFor({ timeout: 10_000 });
await sleep(500);
await shell.locator('dialog[open] button[value="confirm"]').click();
const failed = await output("start-result");
ok("A135 a failed upload starts nothing, removes what was stored, and names the file", failed?.code === "handler_error" && /build\.log/.test(failed.message) && (await callsOf("sessions.start")).length === 1 && (await callsOf("attachments.remove")).length === 1, JSON.stringify(failed));
await set("attachFail=");

// --- voice unavailable (A124) ---------------------------------------------------------------------
await set("voice=off");
await open();
const offControls = await pageFrame().evaluate(() => {
  const host = document.documentElement.lastElementChild;
  return [...host.shadowRoot.querySelectorAll(".group")].map((group) => [...group.querySelectorAll("button")].filter((button) => !button.hidden && !group.hidden).map((button) => button.getAttribute("aria-label")).join("+"));
});
ok("A124 with no transcription configured text areas show no Dictate", !offControls.some((labels) => labels.includes("Dictate")), JSON.stringify(offControls));
await pageFrame().locator("#speak").click();
const off = await output("voice-result");
ok("A124 the call is unavailable, with the reason, before any bar", off?.code === "unavailable" && /not set up/.test(off.message) && !(await barOpen()), JSON.stringify(off));
const roster = await pageFrame().evaluate(() => window.threadPage.invoke("context.get").then((value) => value.capabilities.find((entry) => entry.method === "voice.captureAndTranscribe")));
ok("A124 context.get still lists the method, confirmation required", roster?.confirmation === "required", JSON.stringify(roster));
const picker = shell.waitForEvent("filechooser", { timeout: 5_000 }).then(() => true, () => false);
await pageFrame().locator("#voice").click();
ok("A133 with voice unavailable the audio input is a file picker", (await picker) && !(await barOpen()));
await set("voice=on");

ok("no page errors in the shell", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
const failures = results.filter((entry) => entry.pass === false);
console.log(`\n${engine}: ${results.filter((entry) => entry.pass).length} passed, ${failures.length} failed`);
process.exit(failures.length > 0 ? 1 : 0);
