// The verbatim standing instruction of 04 §The text with `{init}`/`{guide}`/`{root}` filled; `instructionParts(...)` → `{ standing, fragments }`; `createInjector(ctx)` hands the parts to the provider and keeps its placements (04 R6.14–R6.17, R6.29, R6.31).
import type { Contributor } from "../domain/capabilities/contributed.ts";
import type { Placement, SessionRecord } from "../host/provider.ts";
import type { ServingContext } from "../serving/context.ts";

/**
 * 04 §The text, verbatim (U54). Three placeholders are the host's words: its
 * spellings of `{init}` and `{guide}`, and `{root}`, the page's folder as the
 * host names it. Principles only: no example, no page shape, no styling
 * (04 R6.16a); what the short text leaves out is the guide's (R6.24).
 * spec 04 §The text, R6.14–R6.17
 */
export const STANDING_INSTRUCTION_TEMPLATE = `# Your page

The person reads your page, not the chat. Every turn, rewrite one HTML page whole from what is true now; they answer in it, and the answer arrives as your next message. In chat, give only the page's link.

Run \`{init}\` at the start and whenever you lose the page's path. Your page is \`index.html\` in {root}. If init says SKIP, you are a helper: answer in chat and stay off the page.

## The page itself

Build it for this task, not a generic one: what you did, decisions that are theirs (options and your recommendation), what only they can supply. Conclusion first, concise. It must read on a phone and in dark mode. Every <form> answers you; blank is an answer; end with one form holding an empty text field for anything else.

Before relying on anything beyond one HTML file, run \`{guide}\`.`;

/** The host's spelling of each command role (04 §Command roles: the role names are normative, the binary is the host's), and its words for the page's folder. */
export interface CommandSpellings {
  init: string;
  guide: string;
  status: string;
  home: string;
  grants: string;
  /** The page's folder in the host's words, for `{root}` (04 §The text, U54): a host names its variable, or the line `init` prints. */
  root: string;
}

/** Fills `{init}`, `{guide}`, `{root}` (04 §The text) and the other roles' placeholders in any instruction text, the built-in one or an operator's. 04 R6.15 */
export function fillPlaceholders(text: string, commands: CommandSpellings): string {
  return text.replaceAll("{init}", commands.init).replaceAll("{guide}", commands.guide).replaceAll("{root}", commands.root).replaceAll("{status}", commands.status).replaceAll("{home}", commands.home).replaceAll("{grants}", commands.grants);
}

/** The built-in standing instruction with the host's words filled. Under 800 bytes around the placeholders (asserted by test). 04 §The text */
export function standingInstruction(commands: CommandSpellings): string {
  return fillPlaceholders(STANDING_INSTRUCTION_TEMPLATE, commands);
}

/** The heading a contributor's fragment rides under, so the agent reads it as part of one instruction. 04 R6.29 */
export function fragmentHeading(contributor: Pick<Contributor, "id" | "version">): string {
  return `## ${contributor.id} ${contributor.version}`;
}

export interface InstructionFragment {
  contributor: string;
  text: string;
}

export interface InstructionParts {
  standing: string;
  fragments: InstructionFragment[];
}

/**
 * What the provider places: the standing instruction (the operator's text
 * with the placeholders filled, else the built-in text; DR-4) and one
 * fragment per contributor that declares one, in registration order, each
 * under a heading naming the contributor. The standing text names no
 * contributor. spec 04 §The standing instruction, R6.29; 06 R-P14
 */
export function instructionParts(args: { commands: CommandSpellings; contributors: readonly Contributor[]; instructionText: string | null }): InstructionParts {
  const standing = args.instructionText === null ? standingInstruction(args.commands) : fillPlaceholders(args.instructionText, args.commands);
  const fragments: InstructionFragment[] = [];
  for (const contributor of args.contributors) {
    if (contributor.instruction === null) continue;
    fragments.push({ contributor: contributor.id, text: `${fragmentHeading(contributor)}\n\n${contributor.instruction}` });
  }
  return { standing, fragments };
}

/** One part as the provider placed it, for `status`. 04 R6.31 */
export interface PlacedPart {
  /** `standing`, or the contributor's id. */
  part: string;
  /** The contributor's version, for fragments. */
  version: string | null;
  text: string;
  placement: Placement | null;
}

export interface InjectionReport {
  /** Null when the instruction is off: nothing was handed to the provider. 04 R6.14 */
  parts: PlacedPart[] | null;
  placements: readonly Placement[];
}

/** Injects the instruction into the provider and remembers what it placed. One instance per server (DR-33). */
export interface InstructionInjector {
  /** Reads live settings and the current contributors, hands the parts to the provider when enabled, returns the report. 04 R6.14–R6.15; 06 R-P14 */
  inject(): Promise<InjectionReport>;
  /** The last report, or null before the first injection. */
  last(): InjectionReport | null;
}

/** The eligibility rule every host applies: the provider's own. 06 R-P1 */
export function eligibilityOf(ctx: ServingContext): (session: SessionRecord) => boolean {
  return (session) => ctx.provider.sessions.isEligible(session);
}

/**
 * The one owner of injection: `mountPages` calls `inject()` at mount and on
 * a contributor change, `PagesServer.reinject()` after a settings change,
 * and `status` to print what a session starting now receives. When a
 * fragment does not arrive whole the operator is told once per fragment and
 * version in the log; the fragment is neither refused nor shortened.
 * spec 04 R6.14–R6.15, R6.29, R6.31; 06 R-P14
 */
export function createInjector(ctx: ServingContext): InstructionInjector {
  const warned = new Set<string>();
  let last: InjectionReport | null = null;
  return {
    async inject() {
      const settings = ctx.settings();
      if (!settings.instructionEnabled) {
        last = { parts: null, placements: [] };
        return last;
      }
      const contributors = (await ctx.contributions.current()).contributors;
      const parts = instructionParts({ commands: ctx.commands, contributors, instructionText: settings.instructionText });
      const { placements } = await ctx.provider.instruction.inject(parts, eligibilityOf(ctx));
      const placed: PlacedPart[] = [{ part: "standing", version: null, text: parts.standing, placement: placements[0] ?? null }];
      parts.fragments.forEach((fragment, index) => {
        const contributor = contributors.find((candidate) => candidate.id === fragment.contributor);
        const placement = placements[index + 1] ?? null;
        placed.push({ part: fragment.contributor, version: contributor?.version ?? null, text: fragment.text, placement });
        if (placement && placement.cutAt !== null) {
          const key = `${fragment.contributor}@${contributor?.version ?? ""}`;
          if (!warned.has(key)) {
            warned.add(key);
            ctx.log.warn(`instruction: the fragment of ${fragment.contributor} ${contributor?.version ?? ""} is cut at ${placement.cutAt} of ${placement.chars} characters in slot "${placement.slot}" (cap ${placement.cap ?? "none"})`);
          }
        }
      });
      last = { parts: placed, placements };
      return last;
    },
    last: () => last,
  };
}
