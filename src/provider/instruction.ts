// Two instruction slots (DESIGN §B.5, D-bb-11, U35): the standing instruction on `agents.contributeInstructions`,
// the contributors' fragments on `agents.configure`, each cut by bb at 4,096 characters separately. Measured
// order (bb 0.45.0, server `resolveThreadRuntimeCommandConfig`): `configure` resolves first, then the prompt is
// assembled with the `contributeInstructions` section BEFORE the `configure` dynamic instructions, so the
// standing instruction must ride `contributeInstructions` to come first (04 R6.29). Registration happens once, at
// load; `inject` only replaces what the callbacks read. `contributeInstructions` must be synchronous, so the
// thread it is asked about is known from bb's thread events (`thread.created`, `thread.active`, …, whose
// ThreadResponse carries parentage, origin, visibility and archival) and from `configure`'s context, whichever
// came first; eligibility is decided when asked, not cached (BB-2).
import type { BbPluginApi, PluginAgentConfigurationContext } from "@get-bb/plugin-sdk";
import type { Placement, ProviderHost, SessionRecord } from "../../core/src/host/index.ts";
import { createHash } from "node:crypto";
import { sessionRecordOf, type ThreadLike } from "./session-record.ts";

/** `PLUGIN_AGENT_DYNAMIC_INSTRUCTIONS_MAX_CHARS` (host-policy.d.ts:1129): a literal 4096 in the types. */
export const BB_INSTRUCTION_CAP = 4096;
/** The slot the standing instruction rides: the one bb prints first. */
export const STANDING_SLOT = "contributeInstructions";
/** The slot the fragments share: bb prints it after the standing slot. */
export const FRAGMENTS_SLOT = "configure";
/** Declared in prompt order. */
export const SLOTS = [
  { name: STANDING_SLOT, cap: BB_INSTRUCTION_CAP },
  { name: FRAGMENTS_SLOT, cap: BB_INSTRUCTION_CAP },
] as const;
/** The thread events whose payload describes the thread; each refreshes what both slots know. */
const THREAD_EVENTS = ["thread.created", "thread.active", "thread.idle", "thread.failed", "thread.archived"] as const;

export interface InstructionParts { standing: string; fragments: { contributor: string; text: string }[] }

export interface InstructionDeps {
  /** The `agentInstructions` setting, read live. */
  enabled(): boolean;
  log: { warn(message: string): void };
}

export interface BbInstruction {
  instruction: ProviderHost["instruction"];
  /** What the last `inject` placed; null before the first. */
  placements(): Placement[] | null;
}

/**
 * The fragments joined in order, with each fragment's start offset. Each fragment already carries its one heading
 * naming the contributor and version (the core's `fragmentHeading`, 04 R6.29); nothing is added.
 */
export function joinFragments(fragments: readonly { contributor: string; text: string }[]): { text: string; starts: number[] } {
  let text = "";
  const starts: number[] = [];
  fragments.forEach((fragment, index) => {
    if (index > 0) text += "\n\n";
    starts.push(text.length);
    text += fragment.text;
  });
  return { text, starts };
}

export function placeFragments(fragments: readonly { contributor: string; text: string }[]): Placement[] {
  const { starts } = joinFragments(fragments);
  return fragments.map((fragment, index) => {
    const start = starts[index] ?? 0;
    const placed = Math.max(0, Math.min(fragment.text.length, BB_INSTRUCTION_CAP - start));
    return { slot: FRAGMENTS_SLOT, cap: BB_INSTRUCTION_CAP, chars: placed, cutAt: placed < fragment.text.length ? placed : null };
  });
}

/** What `configure` can see of a thread: parentage and origin; visibility and archival are not in the context (D-bb-23). */
export function recordFromConfigureContext(ctx: PluginAgentConfigurationContext): SessionRecord {
  return {
    id: ctx.thread.id,
    title: ctx.thread.title ?? "",
    workspaceId: ctx.project.id,
    parentSessionId: ctx.thread.parentThreadId,
    forkOfId: ctx.origin.kind === "fork" ? ctx.thread.sourceThreadId : null,
    state: "idle",
    waiting: null,
    visible: true,
    archived: false,
    startedAtMs: 0,
    turnEndedAtMs: null,
    updatedAtMs: 0,
  };
}

export function createBbInstruction(bb: BbPluginApi, deps: InstructionDeps): BbInstruction {
  let parts: (InstructionParts & { eligible: (session: SessionRecord) => boolean }) | null = null;
  let last: Placement[] | null = null;
  /** What is known of each thread: an event's record (complete) wins over `configure`'s context (no visibility, no archival). */
  const known = new Map<string, { record: SessionRecord; fromEvent: boolean }>();
  const warned = new Set<string>();
  let unknownWarned = false;

  for (const event of THREAD_EVENTS) {
    bb.events.on(event, ({ thread }) => {
      known.set(thread.id, { record: sessionRecordOf(thread as unknown as ThreadLike, []), fromEvent: true });
    });
  }
  bb.events.on("thread.deleted", ({ thread }) => void known.delete(thread.id));

  const eligibleNow = (record: SessionRecord): boolean => deps.enabled() && parts !== null && parts.eligible(record);

  // The fragments' slot. bb resolves `configure` first in a resolution, so this also makes the thread known to the
  // standing slot below.
  bb.agents.configure((ctx) => {
    const seen = known.get(ctx.thread.id);
    // bb resolves agent config only for a thread that can take a turn, so configure running proves the thread is
    // not archived now: an event's record keeps its visibility and parentage but not a stale `archived` (there is
    // no thread.unarchived event; BB-2b).
    const record = seen?.fromEvent ? { ...seen.record, archived: false } : recordFromConfigureContext(ctx);
    known.set(ctx.thread.id, { record, fromEvent: seen?.fromEvent === true });
    return parts && parts.fragments.length > 0 && eligibleNow(record) ? { tools: [], skills: [], instructions: joinFragments(parts.fragments).text } : { tools: [], skills: [] };
  });

  // The standing instruction's slot: the one bb prints first.
  bb.agents.contributeInstructions(({ threadId }) => {
    if (parts === null || !deps.enabled()) return null;
    const seen = known.get(threadId);
    if (!seen) {
      if (!unknownWarned) {
        unknownWarned = true;
        deps.log.warn(`instruction: the standing instruction is withheld for ${threadId}: the thread is not known yet (no thread event, no configure)`);
      }
      return null;
    }
    return eligibleNow(seen.record) ? parts.standing : null;
  });

  return {
    instruction: {
      slots: SLOTS.map((slot) => ({ ...slot })),
      async inject({ standing, fragments }, eligible) {
        parts = { standing, fragments, eligible };
        const placements: Placement[] = [
          { slot: STANDING_SLOT, cap: BB_INSTRUCTION_CAP, chars: Math.min(standing.length, BB_INSTRUCTION_CAP), cutAt: standing.length > BB_INSTRUCTION_CAP ? BB_INSTRUCTION_CAP : null },
          ...placeFragments(fragments),
        ];
        placements.forEach((placement, index) => {
          if (placement.cutAt === null) return;
          const fragment = index === 0 ? null : fragments[index - 1] ?? null;
          const label = fragment === null ? "the standing instruction" : `fragment ${fragment.contributor}`;
          const text = fragment === null ? standing : fragment.text;
          const key = `${label}:${createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16)}`;
          if (warned.has(key)) return;
          warned.add(key);
          deps.log.warn(`instruction: ${label} is cut by bb at ${placement.cutAt} of ${text.length} characters in slot "${placement.slot}"`);
        });
        last = placements;
        return { placements };
      },
    },
    placements: () => last,
  };
}
