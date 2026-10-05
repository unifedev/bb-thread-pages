/**
 * The plugin's own served output, in a real browser, with no bb: this
 * worktree's routes over the in-memory host of the unit tests, plus a stand-in
 * for bb's thread-storage file route, serving a fixture directory as one
 * session's page root.
 *
 *   node test/browser/serve.ts <fixture-dir> [port]
 *
 * GATE=1 imitates bb Connect's edge (B1-OWN-FILES.md): every request needs a
 * SameSite=Lax cookie, set by GET /login, and gets 401 without it — so a
 * request from the sandboxed frame, which carries no cookie, fails as it does
 * remotely. TLS=<dir> serves https with <dir>/key.pem and <dir>/cert.pem, so
 * `frame-src https:` and a Secure cookie are exercised as on the real origin.
 *
 * The file route answers like bb 0.43.4's: content type by extension,
 * `nosniff`, `content-security-policy: sandbox allow-scripts` on `.html` only,
 * no `Range`, no `content-disposition`. Not part of the unit suite.
 *
 * ECHO=1 adds a contributor, `echo.caller`, answering with the caller it was
 * given, for the scope pass (scope.mjs).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttps } from "node:https";
import { join, relative } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createPlugin } from "../../src/plugin.ts";
import { PageError } from "../../src/domain/errors.ts";
import { createFakeHost, fileKey, seedSession } from "../support/fake-host.ts";

const SESSION = process.env.SESSION ?? "thr_fixture10";
const directory = process.argv[2] ?? "";
const port = Number(process.argv[3] ?? 8790);
if (!directory) {
  console.error("usage: node test/browser/serve.ts <fixture-dir> [port]");
  process.exit(64);
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", json: "application/json", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4", pdf: "application/pdf", txt: "text/plain",
  xml: "application/xml", csv: "text/csv",
};

const fake = createFakePluginHost({ pluginId: "thread-pages", settings: {} });
const { host, state } = createFakeHost({ removable: process.env.REMOVABLE !== "0" });
// ECHO=1 installs a contributor whose one method answers with the caller it was given: the session and the scope. D41
if (process.env.ECHO === "1") {
  const nullable = { type: ["string", "null"] };
  state.contributors.push({
    id: "echo",
    declaration: { version: "1", methods: [{ name: "echo.caller", description: "Answers with the caller the host passed.", effect: "read", result: { type: "object", properties: { sessionId: nullable, scope: nullable }, additionalProperties: false } }] },
    answer: async (call) => ({ ok: true, result: { sessionId: call.caller.sessionId, scope: call.caller.scope } }),
  });
}

// `/__set` moves this clock on, so the host's answer about voice, kept a few seconds, is read again.
let skew = 0;
await createPlugin(fake.bb, { host, now: () => Date.now() + skew });
state.publicOrigin = null;
if (process.env.VOICE === "off") state.voiceConfigured = false;

function load(): void {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
  for (const file of walk(directory)) state.files.set(fileKey(SESSION, relative(directory, file)), readFileSync(file));
  // The fixtures' shared harness sits beside them; placed, it is copied in.
  const lib = join(directory, "..", "_lib", "verdict.js");
  try {
    state.files.set(fileKey(SESSION, "_lib/verdict.js"), readFileSync(lib));
  } catch {
    // Not a verify fixture.
  }
}
load();
// As verify/place.sh places a fixture at a page root: its shared harness beside it.
seedSession(state, SESSION, readFileSync(join(directory, "index.html"), "utf8").replaceAll("../_lib/verdict.js", "_lib/verdict.js"), { title: "Fixture 10", state: "working" });
// PROBE_SVG=1 adds an agent-written SVG that, opened on the host's origin, reads the shell with the reader's credential.
if (process.env.PROBE_SVG === "1") {
  const shell = `/api/v1/plugins/thread-pages/http/page?session=${SESSION}`;
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><title>probe:waiting</title><script><![CDATA[fetch(${JSON.stringify(shell)},{credentials:"include"}).then(r=>r.text()).then(t=>{document.querySelector("title").textContent="probe:"+((/actionToken&quot;:&quot;([^&]{12})/.exec(t)||[])[1]||"no token")}).catch(e=>{document.querySelector("title").textContent="probe:error "+e})]]></script></svg>`;
  state.files.set(fileKey(SESSION, "probe/evil.svg"), Buffer.from(probe));
}

const ROUTE = "/api/v1/plugins/thread-pages/http";
const FILES = `/api/v1/threads/${SESSION}/thread-storage/files/`;
const gate = process.env.GATE === "1";
const tls = process.env.TLS;
const counts = { gated: 0, files: 0 } as Record<string, number>;

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://x");
  const cookie = request.headers.cookie ?? "";
  if (url.pathname === "/login") {
    response.writeHead(302, { "set-cookie": `tp_gate=1; Path=/; HttpOnly; SameSite=Lax${tls ? "; Secure" : ""}`, location: `${ROUTE}/page?session=${SESSION}` });
    response.end();
    return;
  }
  if (url.pathname === "/__stats") {
    const watched = new Set(["voice.transcribe", "attachments.upload", "attachments.remove", "sessions.start", "sessions.send"]);
    const calls = state.calls.filter((entry) => watched.has(entry.method)).map((entry) => ({ method: entry.method, args: entry.args }));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ...counts, calls, logs: state.logs.slice(-40) }));
    return;
  }
  // Spec 1.5 switches for the voice pass: voice on or off, how transcription answers, which attachment fails.
  if (url.pathname === "/__set") {
    const voice = url.searchParams.get("voice");
    if (voice) state.voiceConfigured = voice === "on";
    const transcribe = url.searchParams.get("transcribe");
    if (transcribe === "ok") state.transcribeError = null;
    if (transcribe === "fail") state.transcribeError = new PageError("unavailable", "The recording could not be transcribed");
    if (transcribe === "large") state.transcribeError = new PageError("request_too_large", "The recording is longer than this host's transcription service accepts");
    const text = url.searchParams.get("text");
    if (text !== null) state.transcript = text;
    const longText = Number(url.searchParams.get("longText") ?? "0");
    if (longText > 0) state.transcript = "word ".repeat(Math.ceil(longText / 5)).slice(0, longText);
    if (url.searchParams.has("attachFail")) {
      const name = url.searchParams.get("attachFail") ?? "";
      state.attachFailure = name ? { name, error: new PageError("handler_error", "The host could not store the file") } : null;
    }
    if (url.searchParams.has("reset")) state.calls.length = 0;
    skew += 60_000;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (gate && !/(?:^|;\s*)tp_gate=1/.test(cookie)) {
    counts.gated = (counts.gated ?? 0) + 1;
    counts[`gated ${url.pathname}`] = (counts[`gated ${url.pathname}`] ?? 0) + 1;
    response.writeHead(401, { "content-type": "text/html" });
    response.end("<!doctype html><title>Sign in</title><p>Sign in (the stand-in for bb Connect's gate)");
    return;
  }
  if (url.pathname.startsWith(FILES)) {
    const path = decodeURIComponent(url.pathname.slice(FILES.length));
    const bytes = state.files.get(fileKey(SESSION, path));
    counts.files = (counts.files ?? 0) + 1;
    if (!bytes || path.split("/").includes("..")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"error":"not_found"}');
      return;
    }
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    const headers: Record<string, string> = { "content-type": TYPES[extension] ?? "application/octet-stream", "x-content-type-options": "nosniff", "content-length": String(bytes.byteLength), "cache-control": "private, no-cache" };
    if (extension === "html") headers["content-security-policy"] = "sandbox allow-scripts";
    // bb answers an opaque origin's fetch with 403 (X17); a subresource carries no Origin.
    if (request.headers.origin === "null") {
      response.writeHead(403, { "content-type": "application/json" });
      response.end('{"error":"forbidden_origin"}');
      return;
    }
    response.writeHead(200, headers);
    response.end(Buffer.from(bytes));
    return;
  }
  if (url.pathname.startsWith(ROUTE)) {
    const payload = request.method === "POST" ? await body(request) : undefined;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers[key] = value;
    const answer = await fake.harness.behavior.fetchHttp(request.method as "GET", `${url.pathname.slice(ROUTE.length)}${url.search}`, { headers, ...(payload ? { body: payload.toString("utf8") } : {}) });
    const out: Record<string, string> = {};
    answer.headers.forEach((value, key) => (out[key] = value));
    response.writeHead(answer.status, out);
    response.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  response.writeHead(404);
  response.end();
}

const listener = (request: IncomingMessage, response: ServerResponse) => {
  handle(request, response).catch((error) => {
    response.writeHead(500);
    response.end(String(error));
  });
};
const server = tls ? createHttps({ key: readFileSync(join(tls, "key.pem")), cert: readFileSync(join(tls, "cert.pem")) }, listener) : createHttp(listener);
server.listen(port, "127.0.0.1", () => {
  console.log(`${tls ? "https" : "http"}://localhost:${port}${gate ? "/login" : `${ROUTE}/page?session=${SESSION}`}`);
});
