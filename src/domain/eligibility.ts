/**
 * Which sessions may own a page. spec 01 §Eligibility
 *
 * A session is eligible when it is visible (not an internal helper), a root
 * (not a child, not a fork) and live (not archived, not deleted).
 */
export interface EligibilityFacts {
  readonly visibility: "visible" | "hidden";
  readonly parentId: string | null;
  readonly forkOfId: string | null;
  readonly archived: boolean;
  readonly deleted: boolean;
}

export type IneligibleReason = "hidden" | "child" | "fork" | "archived" | "deleted";

export function ineligibleReason(facts: EligibilityFacts): IneligibleReason | null {
  if (facts.deleted) return "deleted";
  if (facts.archived) return "archived";
  if (facts.visibility !== "visible") return "hidden";
  if (facts.parentId !== null) return "child";
  if (facts.forkOfId !== null) return "fork";
  return null;
}

export function isEligible(facts: EligibilityFacts): boolean {
  return ineligibleReason(facts) === null;
}

export function describeIneligible(reason: IneligibleReason): string {
  switch (reason) {
    case "hidden":
      return "this session is a hidden helper";
    case "child":
      return "this session is a child of another session";
    case "fork":
      return "this session is a fork of another session";
    case "archived":
      return "this session is archived";
    case "deleted":
      return "this session is deleted";
  }
}
