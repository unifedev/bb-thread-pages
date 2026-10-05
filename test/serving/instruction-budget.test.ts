import { describe, expect, it } from "vitest";
import type { Contributor } from "../../src/domain/capabilities/contributed.ts";
import { budgetWarnings, instructionBudget, joinInstruction, type ContributionSet } from "../../src/serving/contributions.ts";

const contributor = (id: string, instruction: string | null): Contributor => ({ id, version: "1", methods: [], instruction, guide: null });
const setOf = (...contributors: Contributor[]): ContributionSet => ({ contributors, get: () => undefined });

// spec R6.31, D42
describe("the instruction's budget", () => {
  it("measures each fragment where the host cuts the joined text", () => {
    const set = setOf(contributor("a", "x".repeat(40)), contributor("quiet", null), contributor("b", "y".repeat(40)));
    const standing = "s".repeat(100);
    const joined = joinInstruction(standing, set);
    const budget = instructionBudget(standing, set, 180);
    expect(budget.totalChars).toBe(joined.length);
    expect(budget.fragmentRoom).toBe(80);
    const [a, b] = budget.contributors;
    expect(a).toMatchObject({ id: "a", chars: 40, arrives: 40, cutAfter: null });
    // What arrives of b is exactly what of it lies before the cap in the joined text.
    expect(b!.arrives).toBe(joined.slice(0, 180).length - joined.indexOf("y".repeat(40)));
    expect(b!.arrives).toBeGreaterThan(0);
    expect(b!.cutAfter).toMatch(/^…?y+$/);
    expect(budgetWarnings(budget)).toEqual([expect.stringContaining(`fragment of b 1 is cut after ${b!.arrives} of 40 characters`)]);
  });

  it("says when a fragment does not arrive at all, and warns of nothing when the host cuts nothing", () => {
    const set = setOf(contributor("late", "z".repeat(10)));
    const budget = instructionBudget("s".repeat(200), set, 200);
    expect(budget.contributors[0]).toMatchObject({ arrives: 0 });
    expect(budgetWarnings(budget)[0]).toContain("does not reach sessions at all");
    const uncapped = instructionBudget("s".repeat(200), set, null);
    expect(uncapped).toMatchObject({ cap: null, fragmentRoom: null });
    expect(budgetWarnings(uncapped)).toEqual([]);
  });
});
