import { describe, expect, it } from "vitest";
import { LIMITS } from "../../src/domain/limits.ts";
import { createOutcomeMemory } from "../../src/domain/submissions/idempotency.ts";
import { formatReplyMessage, formatSubmissionMessage } from "../../src/domain/submissions/message.ts";
import { parseSubmission } from "../../src/domain/submissions/parse.ts";
import { createRateLimiter } from "../../src/domain/rate-limit.ts";
import { isSafeRelativePath, isSafeUploadName, sanitizeUploadSuffix, uploadFileName } from "../../src/pages/layout.ts";
import { ineligibleReason } from "../../src/domain/eligibility.ts";
import { etagFor, ifNoneMatchMatches, revisionOf } from "../../src/domain/revision.ts";

const REV = "e".repeat(64);
const base = { actionToken: "tok", submissionId: "sub-1", pageRevision: REV, title: "Form A" };

describe("submissions", () => {
  it("parses blank, boolean and list answers and formats them explicitly", () => {
    const parsed = parseSubmission({
      ...base,
      answers: [
        { name: "action", label: "Action", value: "Submitted" },
        { name: "approach", label: "Which approach", value: "" },
        { name: "applies", label: "Which apply", value: ["alpha"] },
        { name: "urgent", label: "Is this urgent?", value: false },
        { name: "none", label: "Nothing", value: [] },
      ],
    });
    expect(parsed).not.toBeNull();
    const message = formatSubmissionMessage(parsed!);
    expect(message).toContain("The user answered the form on your Thread Page — Form A.");
    expect(message.indexOf("**Action**\nSubmitted")).toBeLessThan(message.indexOf("**Which approach**"));
    expect(message).toContain("**Which approach**\n(left blank)");
    expect(message).toContain("**Which apply**\nalpha");
    expect(message).toContain("**Is this urgent?**\nNo");
    expect(message).toContain("**Nothing**\n(left blank)");
  });

  it("rejects structurally invalid or oversized bodies", () => {
    expect(parseSubmission({ ...base, answers: [{ name: "a", label: "A", value: 1 }] })).toBeNull();
    expect(parseSubmission({ ...base, pageRevision: "short", answers: [] })).toBeNull();
    expect(parseSubmission({ ...base, submissionId: "bad id!", answers: [] })).toBeNull();
    expect(parseSubmission({ ...base, answers: [{ name: "a", label: "A", value: "x".repeat(LIMITS.answerValueChars + 1) }] })).toBeNull();
    expect(parseSubmission({ ...base, answers: Array.from({ length: LIMITS.answersPerSubmission + 1 }, () => ({ name: "a", label: "A", value: "" })) })).toBeNull();
  });

  it("only accepts host-named files under uploads/", () => {
    const name = uploadFileName("report.pdf", 1_700_000_000_000, "abcdef");
    expect(parseSubmission({ ...base, answers: [], files: [{ field: "f", name, path: `uploads/${name}`, sizeBytes: 10 }] })).not.toBeNull();
    expect(parseSubmission({ ...base, answers: [], files: [{ field: "f", name: "../x", path: "uploads/../x", sizeBytes: 10 }] })).toBeNull();
    expect(parseSubmission({ ...base, answers: [], files: [{ field: "f", name, path: `elsewhere/${name}`, sizeBytes: 10 }] })).toBeNull();
    expect(parseSubmission({ ...base, answers: [], files: [{ field: "f", name, path: `uploads/${name}`, sizeBytes: LIMITS.uploadFileBytes + 1 }] })).toBeNull();
    const message = formatSubmissionMessage(parseSubmission({ ...base, answers: [], files: [{ field: "f", name, path: `uploads/${name}`, sizeBytes: 10 }] })!);
    expect(message).toContain(`$BB_THREAD_STORAGE/uploads/${name}`);
  });

  it("fences a reply result safely", () => {
    const message = formatReplyMessage("Diagram", { note: "has ``` inside" });
    expect(message).toContain("````json");
    expect(message).not.toContain("Interactive response");
  });
});

describe("upload names", () => {
  it("are host-generated and never reader-chosen", () => {
    const name = uploadFileName("../../etc/passwd", 1_700_000_000_000, "0123456789");
    expect(name).toMatch(/^\d{8}-\d{6}-012345-passwd$/);
    expect(isSafeUploadName(name)).toBe(true);
    expect(sanitizeUploadSuffix("weird name (v2)+final.json")).toBe("weird_name__v2__final.json");
    expect(sanitizeUploadSuffix(".hidden")).toBe("hidden");
    expect(sanitizeUploadSuffix("")).toBe("upload");
  });

  it("checks relative paths", () => {
    expect(isSafeRelativePath("a/b/c.css")).toBe(true);
    expect(isSafeRelativePath("../a")).toBe(false);
    expect(isSafeRelativePath("/a")).toBe(false);
    expect(isSafeRelativePath("a//b")).toBe(false);
    expect(isSafeRelativePath("a\\b")).toBe(false);
    expect(isSafeRelativePath("a\0b")).toBe(false);
  });
});

describe("idempotency", () => {
  it("replays the same content, refuses different content, expires and bounds records", async () => {
    const memory = createOutcomeMemory<number>({ maxRecords: 2, ttlMs: 1000 });
    let produced = 0;
    const first = memory.remember("k", "fp", async () => ++produced, 0);
    expect(first.kind).toBe("fresh");
    if (first.kind === "conflict") throw new Error("unreachable");
    const replay = memory.remember("k", "fp", async () => ++produced, 10);
    expect(replay.kind).toBe("replay");
    expect(memory.remember("k", "other", async () => ++produced, 10).kind).toBe("conflict");
    await first.outcome;
    expect(produced).toBe(1);
    expect(memory.remember("k", "fp", async () => ++produced, 2000).kind).toBe("fresh");
    memory.remember("a", "fp", async () => 1, 2000);
    memory.remember("b", "fp", async () => 1, 2000);
    expect(memory.size()).toBeLessThanOrEqual(2);
  });

  it("forgets a failed attempt so the next try is fresh", async () => {
    const memory = createOutcomeMemory<number>();
    const failed = memory.remember("k", "fp", async () => Promise.reject(new Error("boom")), 0);
    if (failed.kind === "conflict") throw new Error("unreachable");
    await expect(failed.outcome).rejects.toThrow("boom");
    expect(memory.remember("k", "fp", async () => 1, 1).kind).toBe("fresh");
  });
});

describe("rate limiter", () => {
  it("bounds accepted requests per minute and concurrency per key", () => {
    const limiter = createRateLimiter({ perMinute: 3, concurrent: 2 });
    const a = limiter.acquire("p", 0);
    const b = limiter.acquire("p", 0);
    expect(a && b).toBeTruthy();
    expect(limiter.acquire("p", 0)).toBeNull();
    a!();
    expect(limiter.acquire("p", 0)).toBeTruthy();
    expect(limiter.acquire("p", 1)).toBeNull();
    expect(limiter.acquire("q", 1)).toBeTruthy();
    expect(limiter.acquire("p", 61_000)).toBeNull();
    b!();
    expect(limiter.acquire("p", 61_000)).toBeTruthy();
  });
});

describe("eligibility and revisions", () => {
  it("classifies sessions", () => {
    const facts = { visibility: "visible" as const, parentId: null, forkOfId: null, archived: false, deleted: false };
    expect(ineligibleReason(facts)).toBeNull();
    expect(ineligibleReason({ ...facts, visibility: "hidden" })).toBe("hidden");
    expect(ineligibleReason({ ...facts, parentId: "x" })).toBe("child");
    expect(ineligibleReason({ ...facts, forkOfId: "x" })).toBe("fork");
    expect(ineligibleReason({ ...facts, archived: true })).toBe("archived");
    expect(ineligibleReason({ ...facts, deleted: true, archived: true })).toBe("deleted");
  });

  it("uses the document digest as the entity tag", () => {
    const revision = revisionOf("<html></html>");
    expect(revision).toMatch(/^[a-f0-9]{64}$/);
    expect(revisionOf(Buffer.from("<html></html>"))).toBe(revision);
    expect(ifNoneMatchMatches(`"${revision}"`, etagFor(revision))).toBe(true);
    expect(ifNoneMatchMatches(`W/"${revision}", "x"`, etagFor(revision))).toBe(true);
    expect(ifNoneMatchMatches("*", etagFor(revision))).toBe(true);
    expect(ifNoneMatchMatches('"other"', etagFor(revision))).toBe(false);
    expect(ifNoneMatchMatches(undefined, etagFor(revision))).toBe(false);
  });
});
