import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { revisionOf } from "../../src/domain/revision.ts";
import { mintActionToken, verifyActionToken } from "../../src/domain/tokens/action-token.ts";
import { fileKey, seedSession } from "../support/fake-host.ts";
import { loadPlugin, PAGE, ROUTE_BASE, type PluginFixture } from "../support/plugin.ts";

// What a hostile page can and cannot do once a page has several documents and
// home ships built in. The rows from before 1.3.0 are covered where they live
// (tokens, bridge, routes); these are the ones several documents added.
// spec 03 §What a hostile page can and cannot do, A30, R1.12c

let fixture: PluginFixture;

const SECOND = PAGE.replace("Test page", "Second");
const SECRET = PAGE.replace("Test page", "Secret of another session");

beforeEach(async () => {
  fixture = await loadPlugin();
  seedSession(fixture.state, "thr_a", PAGE);
  seedSession(fixture.state, "thr_b", PAGE);
  fixture.state.files.set(fileKey("thr_a", "second.html"), Buffer.from(SECOND));
  fixture.state.files.set(fileKey("thr_b", "second.html"), Buffer.from(SECRET));
  fixture.state.files.set(fileKey("thr_b", "secret.html"), Buffer.from(SECRET));
});

afterEach(() => fixture.dispose());

function token(session = "thr_a", revision = revisionOf(PAGE), path: string | null = null, now = fixture.clock.now): string {
  return mintActionToken({ session, revision, path, now }, fixture.serving.signingKey).token;
}

async function exchange(body: Record<string, unknown>, query = ""): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fixture.post(`${ROUTE_BASE}/document-session${query}`, body);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function shellToken(html: string): string {
  const match = /&quot;actionToken&quot;:&quot;([^&]+)&quot;/.exec(html);
  expect(match, "the shell carries a token").not.toBeNull();
  return match![1]!;
}

describe("a hostile page", () => {
  it("never receives the shell's token in any document it runs as", async () => {
    const cases: [string, string][] = [
      [`${ROUTE_BASE}/page?session=thr_a`, `${ROUTE_BASE}/document?session=thr_a`],
      [`${ROUTE_BASE}/page?session=thr_a&path=second.html`, `${ROUTE_BASE}/document?session=thr_a&path=second.html`],
      [`${ROUTE_BASE}/home`, `${ROUTE_BASE}/home-document`],
    ];
    for (const [shellUrl, documentUrl] of cases) {
      const secret = shellToken(await (await fixture.get(shellUrl)).text());
      const document = await (await fixture.get(documentUrl)).text();
      expect(document, documentUrl).toContain("data-thread-page-kernel");
      expect(document, documentUrl).not.toContain(secret);
    }
  });

  it("cannot exchange a token for another session's document, whatever the request names", async () => {
    expect((await exchange({ actionToken: token(), path: "secret.html" })).status).toBe(404);
    for (const [body, query] of [
      [{ actionToken: token(), path: "second.html", session: "thr_b" }, ""],
      [{ actionToken: token(), path: "second.html" }, "?session=thr_b"],
    ] as const) {
      const answer = await exchange(body, query);
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ pageRevision: revisionOf(SECOND), documentUrl: `${ROUTE_BASE}/document?session=thr_a&path=second.html` });
      expect(verifyActionToken(answer.body.actionToken as string, fixture.serving.signingKey, fixture.clock.now)).toMatchObject({ session: "thr_a", path: "second.html" });
    }
  });

  it("cannot act on one document with a token bound to another", async () => {
    const second = (await exchange({ actionToken: token(), path: "second.html" })).body;
    const onEntry = await fixture.post(`${ROUTE_BASE}/submit`, { actionToken: second.actionToken, submissionId: "x-1", pageRevision: revisionOf(PAGE), title: "T", answers: [] });
    expect(onEntry.status).toBe(409);
    expect(await onEntry.json()).toMatchObject({ code: "stale_page" });
    // The entry document's token, presented with the other document's revision.
    const onSecond = await fixture.post(`${ROUTE_BASE}/submit`, { actionToken: token("thr_a", revisionOf(SECOND)), submissionId: "x-2", pageRevision: revisionOf(SECOND), title: "T", answers: [] });
    expect(onSecond.status).toBe(409);
    expect(await onSecond.json()).toMatchObject({ code: "stale_page" });
    expect(fixture.state.calls.filter((call) => call.method === "sessions.send")).toHaveLength(0);
  });

  it("cannot exchange for anything that is not a document of its page, or with an expired token", async () => {
    for (const path of ["uploads/x.html", "data.json", "/etc/x.html", "a/../../x.html", "https://evil.example/x.html", "", 42, null]) {
      expect((await exchange({ actionToken: token(), path })).status, String(path)).toBe(400);
    }
    const expired = token("thr_a", revisionOf(PAGE), null, fixture.clock.now - LIMITS.actionTokenMs - 1);
    expect((await exchange({ actionToken: expired, path: "second.html" })).status).toBe(401);
  });
});
