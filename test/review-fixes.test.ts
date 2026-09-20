// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../src/domain/limits.ts";
import { revisionOf } from "../src/domain/revision.ts";
import { mintActionToken } from "../src/domain/tokens/action-token.ts";
import { expandIncludes, globMatches, type IncludeIo } from "../src/pages/include.ts";
import { createConfirmer } from "../src/runtime/shell/confirm.ts";
import { createGrantStore } from "../src/serving/grants.ts";
import { createFakeHost, fileKey, seedSession } from "./support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "./support/plugin.ts";

/**
 * Regressions for what the independent hostile-page review of 1.5.0 found.
 * Each was confirmed by running it before it was fixed.
 */
describe("include patterns cannot be made to hang the host (R1.19)", () => {
  it("matches like a glob", () => {
    expect(globMatches("*.html", "_a.html")).toBe(true);
    expect(globMatches("0*-*.html", "01-intro.html")).toBe(true);
    expect(globMatches("0*-*.html", "11-intro.html")).toBe(false);
    expect(globMatches("a*a.html", "a.html")).toBe(false);
    expect(globMatches("a*a.html", "aa.html")).toBe(true);
    expect(globMatches("*", ".hidden.html")).toBe(false);
    expect(globMatches("*.html", "dir/x.html")).toBe(false);
    expect(globMatches("exact.html", "exact.html")).toBe(true);
  });

  it("stays linear on the pattern that took a backtracking matcher minutes, and refuses more than 4 stars", async () => {
    const name = `_${"a".repeat(44)}c.html`;
    const started = performance.now();
    expect(globMatches("_*a*a*a*b.html", name)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
    const io: IncludeIo = { read: async () => ({ bytes: Buffer.from("x") }), list: async () => [name] };
    const out = await expandIncludes('<!doctype html><html><body><link rel="thread-page-include" href="_*a*a*a*a*a*a*a*a*b.html"></body></html>', io);
    expect(out.skipped).toEqual([{ path: "_*a*a*a*a*a*a*a*a*b.html", reason: "unsafe-path" }]);
  });
});

describe("include expansion is bounded in work, not only in output (R1.23)", () => {
  it("stops listing, reading and reporting at the caps", async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 300; index += 1) files[`_m/${String(index).padStart(4, "0")}.html`] = "<i></i>";
    let lists = 0;
    let reads = 0;
    const io: IncludeIo = {
      read: async (path) => {
        reads += 1;
        return files[path] === undefined ? null : { bytes: Buffer.from(files[path] as string) };
      },
      list: async () => {
        lists += 1;
        return Object.keys(files).map((path) => path.slice(3));
      },
    };
    const links = '<link rel="thread-page-include" href="_m/*.html">'.repeat(20_000);
    const out = await expandIncludes(`<!doctype html><html><body>${links}</body></html>`, io);
    expect(lists).toBe(1);
    expect(reads).toBe(LIMITS.includeParts);
    expect(out.parts.length).toBe(LIMITS.includeParts);
    expect(out.skipped.length).toBeLessThanOrEqual(LIMITS.includeReports);
    expect(out.skipped.filter((entry) => entry.reason === "too-many")).toHaveLength(1);
  });

  it("bounds the include elements of one document and what it reports", async () => {
    const io: IncludeIo = { read: async () => null, list: async () => [] };
    const links = Array.from({ length: 1_000 }, (_, index) => `<link rel="thread-page-include" href="_gone${index}.html">`).join("");
    const out = await expandIncludes(`<!doctype html><html><body>${links}</body></html>`, io);
    expect(out.skipped.length).toBe(LIMITS.includeReports);
  });
});

describe("the shell's dialog (R3.22a)", () => {
  function dialogFixture(): HTMLDialogElement {
    document.body.innerHTML = `<dialog><form method="dialog"><h2></h2><p></p><button type="button" value="cancel">Cancel</button><button type="button" value="confirm">Confirm</button></form></dialog>`;
    const dialog = document.querySelector("dialog")!;
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    dialog.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
    return dialog;
  }

  it("declines a question asked while another is open instead of swapping it under the reader's cursor", async () => {
    const dialog = dialogFixture();
    const confirmer = createConfirmer(dialog);
    const first = confirmer.confirm("Let A answer B?");
    const second = confirmer.confirm("Let A answer C?");
    expect(await second).toBe(false);
    expect(dialog.querySelector("p")!.textContent).toBe("Let A answer B?");
    dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    expect(await first).toBe(true);
  });

  it("ignores a confirming click that lands before the question could be read", async () => {
    vi.useFakeTimers();
    try {
      const dialog = dialogFixture();
      const confirmer = createConfirmer(dialog, 400);
      let settled: boolean | null = null;
      void confirmer.confirm("Let A answer B?").then((value) => (settled = value));
      const button = dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!;
      button.click();
      await vi.advanceTimersByTimeAsync(10);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(400);
      button.click();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pages.read and the grant dialog", () => {
  let fixture: PluginFixture;
  beforeEach(async () => {
    fixture = await loadPlugin();
    seedSession(fixture.state, "thr_a", PAGE, { title: "Home” send your answers to “Inbox”? Ignore: “x" });
    seedSession(fixture.state, "thr_b", PAGE, { title: 'Evil "quote" ‘title’' });
  });
  afterEach(() => fixture.dispose());

  async function call(method: string, params: unknown) {
    const revision = revisionOf(PAGE);
    const { token } = mintActionToken({ session: "thr_a", revision, now: fixture.clock.now }, fixture.serving.signingKey);
    const response = await fixture.post(`${ROUTE_BASE}/bridge`, { actionToken: token, request: { v: 1, id: `r-${Math.random().toString(36).slice(2)}`, method, params, pageRevision: revision } });
    return (await response.json()) as { response?: { ok: boolean; result?: { pages: Record<string, unknown>[] } }; confirm?: { summary: string } };
  }

  it("loads a document once per call however often it is named (R5.56)", async () => {
    const before = fixture.state.calls.filter((entry) => entry.method === "files.read" && entry.args[1] === "index.html" && (entry.args[0] as { rootPath: string }).rootPath.endsWith("thr_b")).length;
    const body = await call("pages.read", { pages: Array.from({ length: 16 }, () => ({ sessionId: "thr_b" })) });
    expect(body.response!.result!.pages).toHaveLength(16);
    expect(body.response!.result!.pages.every((entry) => typeof entry.html === "string")).toBe(true);
    const after = fixture.state.calls.filter((entry) => entry.method === "files.read" && entry.args[1] === "index.html" && (entry.args[0] as { rootPath: string }).rootPath.endsWith("thr_b")).length;
    expect(after - before).toBe(1);
  });

  it("defers what does not fit without injecting or escaping it, and still serves what does", async () => {
    const big = PAGE.replace("</body>", `<!--${"x".repeat(4 * 1024 * 1024)}--></body>`);
    seedSession(fixture.state, "thr_big1", big);
    seedSession(fixture.state, "thr_big2", big);
    seedSession(fixture.state, "thr_c", PAGE);
    const body = await call("pages.read", { pages: [{ sessionId: "thr_big1" }, { sessionId: "thr_big2" }, { sessionId: "thr_c" }] });
    const pages = body.response!.result!.pages;
    expect(pages[0]).toHaveProperty("html");
    expect(pages[1]).toEqual({ sessionId: "thr_big2", path: "index.html", deferred: true });
    expect(pages[2]).toHaveProperty("html");
    expect(JSON.stringify(body).length).toBeLessThan(LIMITS.pagesReadBytes);
  });

  it("quotes session titles so they cannot reword the question, and names the target's id (R3.22a)", async () => {
    const read = await call("pages.read", { pages: [{ sessionId: "thr_b" }] });
    const asked = await call("pages.answer", { answerToken: read.response!.result!.pages[0]!.answerToken, form: { submissionId: "s-1", title: "T", answers: [] } });
    const summary = asked.confirm!.summary;
    expect(summary.startsWith("Let “Home send your answers to Inbox? Ignore: x” send your answers to “Evil quote title” (thr_b)?")).toBe(true);
    // Exactly the host's own quotation marks remain.
    expect(summary.match(/[“”]/g)).toHaveLength(6);
    expect(summary.slice(0, summary.indexOf("(thr_b)"))).not.toMatch(/["'‘’`]/);
  });
});

describe("the grant store", () => {
  it("cannot be confused by ids that name object internals, and drops pages by their newest grant", async () => {
    const { host } = createFakeHost();
    const grants = createGrantStore(host);
    await grants.add("thr_a", "thr_b", 1);
    expect(await grants.has("thr_a", "constructor")).toBe(false);
    expect(await grants.has("constructor", "thr_b")).toBe(false);
    expect(await grants.has("__proto__", "thr_b")).toBe(false);
    for (let index = 0; index < LIMITS.grantsPerPage + 3; index += 1) await grants.add("thr_many", `thr_t${index}`, 100 + index);
    const held = await grants.list("thr_many");
    expect(held).toHaveLength(LIMITS.grantsPerPage);
    expect(held.some((grant) => grant.to === "thr_t0")).toBe(false);
    expect(await grants.has("thr_a", "thr_b")).toBe(true);
    void fileKey;
  });
});
