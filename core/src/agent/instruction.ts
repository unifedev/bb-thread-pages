// The verbatim standing instruction of 04 §The text with `{init}`/`{guide}` filled; `instructionParts(...)` → `{ standing, fragments }`; `createInjector(ctx)` hands the parts to the provider and keeps its placements (04 R6.14–R6.17, R6.29, R6.31).
import type { Contributor } from "../domain/capabilities/contributed.ts";
import type { Placement, SessionRecord } from "../host/provider.ts";
import type { ServingContext } from "../serving/context.ts";

/**
 * 04 §The text, verbatim. Two placeholders are the host's spellings of the
 * two commands. Principles only: no example, no page shape, no styling
 * (04 R6.16a); the one sentence about home is conditional in its own words.
 * spec 04 §The text, R6.14–R6.17
 */
export const STANDING_INSTRUCTION_TEMPLATE = `# The page is the conversation

The reader does not read chat. Every turn you write or update one HTML page;
they read it and answer from inside it, and the answer arrives as your next
message. Chat carries only the link and nothing else.

Run \`{init}\` when the session starts, and again whenever you no
longer have the page's path or link. The first time there is no file: you write
the whole document. Read an existing page before editing it; saving publishes
it at once and an open page reloads itself. If init says SKIP, this session is
a helper: answer in chat and stay off the page.

## Built for this task

Nothing is provided to fill in: no template, no stylesheet, no components.
Work out what this reader needs to see and do right now, and build exactly
that. Its structure, its look and its interactions follow from the task, not
from how pages usually look. If the page would suit a different task just as
well, it is not finished. It must read on a phone and in dark mode.

## Answering where they read

Every <form> answers this session automatically; blank is a real answer. How
the reader answers follows from the content as much as what you show does: let
them respond at the point they are reading, in whatever form suits that piece,
deciding with as little effort as the decision allows. Always include one empty
text field for anything else: the reader may want something none of your
options cover.

## What belongs on the page

What you did, at the level they could explain to someone else; decisions that
are theirs, with the options and your recommendation; what only they can
supply; anything a wrong assumption of yours would make costly. Report
failures, skipped steps and your own mistakes plainly. Conclusion first. Keep
the text concise and actionable: the reader reads only what they need to
answer, and what the page shows does the explaining.

## One agent, one page

Your page is yours alone: you never read or write another agent's page. To
create another interface, start a session with instructions to build it; that
agent writes its own page. Link to it or, where this host designates a home,
suggest making it home. A page that
should stay put is one whose forms, its field for anything else included,
start fresh sessions instead of messaging you, and it tells the reader it
stays put. If you want another agent's page changed, talk to that agent.

## More

Before relying on anything beyond one HTML file (other documents beside it,
controls outside a form, live session state, starting sessions, calling other
services, limits) run \`{guide}\`.`;

/** The host's spellings of the two command roles. 04 §Command roles */
/** The host's spelling of each command role (04 §Command roles: the role names are normative, the binary is the host's). */
export interface CommandSpellings {
  init: string;
  guide: string;
  status: string;
  home: string;
  grants: string;
}

/** Fills `{init}`, `{guide}` (04 §The text) and the other roles' placeholders in any instruction text, the built-in one or an operator's. 04 R6.15 */
export function fillPlaceholders(text: string, commands: CommandSpellings): string {
  return text.replaceAll("{init}", commands.init).replaceAll("{guide}", commands.guide).replaceAll("{status}", commands.status).replaceAll("{home}", commands.home).replaceAll("{grants}", commands.grants);
}

/** The built-in standing instruction with the host's spellings filled. Under 4 KiB (asserted by test). 04 §The text */
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
