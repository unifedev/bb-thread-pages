import { describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { checkScope, isCanonicalScope } from "../../src/domain/scope.ts";
import { checkDocumentQuery, documentFragment, splitDocumentUrl } from "../../src/domain/document-path.ts";

// spec R5.81–R5.86, R1.12f, D41
describe("a document's scope", () => {
  it("is a relative folder path inside the session's folder, or none", () => {
    expect(checkScope("clients/vela/q3-board")).toEqual({ ok: true, scope: "clients/vela/q3-board" });
    expect(checkScope("decks/q3 pitch/")).toEqual({ ok: true, scope: "decks/q3 pitch" });
    expect(checkScope("a.b/..c/c..")).toEqual({ ok: true, scope: "a.b/..c/c.." });
    expect(checkScope("Zürich/计划")).toEqual({ ok: true, scope: "Zürich/计划" });
    for (const none of [null, undefined, ""]) expect(checkScope(none)).toEqual({ ok: true, scope: null });
  });

  it("refuses anything absolute, climbing, empty-segmented, or not text", () => {
    const refused = ["/", "/etc", "//server/share", "C:\\x", "C:/x", "c:x", "~", "~/x", "..", "../x", "a/..", "a/../b", ".", "./a", "a/.", "a//b", "a\\b", "a\u0000b", "a\nb", "a\u0085b", "/a/"];
    for (const value of refused) expect(checkScope(value).ok, JSON.stringify(value)).toBe(false);
    for (const value of [1, true, {}, [], ["a"]]) expect(checkScope(value).ok).toBe(false);
    expect(checkScope("x".repeat(LIMITS.scopeChars)).ok).toBe(true);
    expect(checkScope("x".repeat(LIMITS.scopeChars + 1)).ok).toBe(false);
    expect(checkScope(Array(LIMITS.scopeSegments).fill("a").join("/")).ok).toBe(true);
    expect(checkScope(Array(LIMITS.scopeSegments + 1).fill("a").join("/")).ok).toBe(false);
  });

  it("crosses the wire only in its canonical form", () => {
    expect(isCanonicalScope("a/b")).toBe(true);
    for (const value of ["a/b/", "", null, "../a", 3]) expect(isCanonicalScope(value)).toBe(false);
  });
});

describe("a document's fragment", () => {
  it("is # and at least one character, within the limit; anything else is none", () => {
    expect(documentFragment("#clients/vela/q3-board")).toBe("#clients/vela/q3-board");
    for (const value of ["", "#", "x", null, 3, `#${"x".repeat(LIMITS.fragmentChars)}`]) expect(documentFragment(value)).toBe("");
  });
});

// R1.12g, D43
describe("a document's query", () => {
  it("is ? and what a query may hold, none of the host's names, within the limit", () => {
    expect(checkDocumentQuery("?scope=clients/vela/q3-board&view=grid")).toEqual({ ok: true, query: "?scope=clients/vela/q3-board&view=grid" });
    for (const none of [undefined, null, "", "?"]) expect(checkDocumentQuery(none)).toEqual({ ok: true, query: "" });
    for (const bad of ["scope=x", "?a#b", "?a b", "?a\nb", "?session=x", "?x=1&path=y", 3, `?${"x".repeat(LIMITS.documentQueryChars)}`]) {
      expect(checkDocumentQuery(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    // A name that only contains a host name is the document's own.
    expect(checkDocumentQuery("?sessionId=1&subpath=2").ok).toBe(true);
  });

  it("is split from a document URL at its first ?", () => {
    expect(splitDocumentUrl("tool.html?scope=a?b")).toEqual({ path: "tool.html", query: "?scope=a?b" });
    expect(splitDocumentUrl("tool.html")).toEqual({ path: "tool.html", query: "" });
  });
});
