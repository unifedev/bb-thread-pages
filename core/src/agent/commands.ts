// `init`, `guide`, `status`, `home`, `grants` as `(ctx: CommandContext) => Promise<CommandResult>` over a `ServingContext`; `createCommands(ctx)` and `registerCommands(ctx)` (04 §Command roles, R6.3–R6.13, R6.30, R6.31).
import { ENTRY_DOCUMENT } from "../domain/document-path.ts";
import { PageError, errorText } from "../domain/errors.ts";
import { isSessionId } from "../domain/ids.ts";
import { LIMITS, mebibytes } from "../domain/limits.ts";
import { ProviderError, type SessionRecord } from "../host/provider.ts";
import type { ServingContext } from "../serving/context.ts";
import { buildGuide, type GuideInput } from "./guide.ts";
import { createInjector, type InjectionReport, type InstructionInjector, type PlacedPart } from "./instruction.ts";
import { hasSeed, renderSeed } from "./seed.ts";

export type CommandRole = "init" | "guide" | "status" | "home" | "grants";

export interface CommandContext {
  /** Null when the provider cannot tell which session runs the command; `init` then answers SKIP with the reason. 06 R-P15 */
  sessionId: string | null;
  /** The role's own flags: `home: ["--clear"]`; `grants: ["--revoke", "<from>", "<to>"] | ["--revoke-all"]`. */
  args: string[];
}

export interface CommandResult {
  text: string;
  exit: 0 | 1;
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>;

export interface CommandOptions {
  /** The server's injector, so `status` prints the placements the provider returned; a fresh one when absent. 04 R6.31 */
  injector?: InstructionInjector;
}

export const COMMAND_ROLES: readonly CommandRole[] = ["init", "guide", "status", "home", "grants"];

/** The exact first lines of `init`. 08 A01, A02, A53; DESIGN §B.5 */
export const INIT_LINES = Object.freeze({
  new: (path: string) => `NEW      — no page yet; write the whole document at ${path}`,
  seeded: (path: string) => `NEW      — created from the operator's seed at ${path}; rewrite it for this task`,
  existing: (path: string) => `EXISTING — the page exists at ${path}; read it before editing`,
  skip: (reason: string) => `SKIP     — this session has no page: ${reason}. Answer in chat and stay off the page.`,
});

type Current = { kind: "session"; record: SessionRecord } | { kind: "skip"; reason: string };

/** Why a session is ineligible, in the agent's terms; the provider's rule decides, this names the visible cause. 06 R-P1, 04 R6.5 */
export function ineligibleReason(record: SessionRecord): string {
  if (record.archived) return "it is archived";
  if (record.parentSessionId !== null) return "it is a sub-agent session";
  if (record.forkOfId !== null) return "it is a fork";
  if (!record.visible) return "it is hidden";
  return "the host reports it ineligible";
}

/** The reader's URL of a page: the host's origin and base, or the path alone when the host reports no origin (DESIGN P22). 04 R6.7 */
export async function pageUrl(ctx: ServingContext, sessionId: string): Promise<{ url: string; relative: boolean }> {
  const origin = await ctx.serving.origin();
  const path = `${ctx.serving.base()}/page?session=${encodeURIComponent(sessionId)}`;
  return origin ? { url: `${origin}${path}`, relative: false } : { url: path, relative: true };
}

async function homeUrl(ctx: ServingContext): Promise<string> {
  const origin = await ctx.serving.origin();
  const path = `${ctx.serving.base()}/home`;
  return origin ? `${origin}${path}` : path;
}

/** Everything the guide is generated from, read from the host now. 04 R6.25 */
export async function guideInputFrom(ctx: ServingContext): Promise<GuideInput> {
  const { provider } = ctx;
  const [contributions, workspaces, providers, voice] = await Promise.all([
    ctx.contributions.current(),
    provider.workspaces.list().catch(() => []),
    provider.providers ? provider.providers.list().catch(() => null) : Promise.resolve(null),
    provider.voice ? provider.voice.status().catch(() => null) : Promise.resolve(null),
  ]);
  return {
    registry: ctx.registry,
    contributors: contributions.contributors,
    limits: LIMITS,
    defaults: { providers, workspaceEnvironments: workspaces.some((workspace) => workspace.environments !== undefined) },
    voice,
    attachments: provider.attachments !== undefined,
    strategy: ctx.strategy.kind,
    commands: ctx.commands,
  };
}

/** Builds the five roles over one context. DESIGN §B.5 */
export function createCommands(ctx: ServingContext, options: CommandOptions = {}): Record<CommandRole, CommandHandler> {
  const injector = options.injector ?? createInjector(ctx);

  async function current(sessionId: string | null): Promise<Current> {
    if (sessionId === null) return { kind: "skip", reason: "no current session" };
    if (!isSessionId(sessionId)) return { kind: "skip", reason: "the session id is not one this host issues" };
    let access;
    try {
      access = await ctx.sessionFor(sessionId);
    } catch (error) {
      if (PageError.is(error) && error.code === "not_found") return { kind: "skip", reason: "the session does not exist" };
      throw error;
    }
    if (access.kind !== "session") return { kind: "skip", reason: "the built-in home page is not a session" };
    if (!access.eligible) return { kind: "skip", reason: ineligibleReason(access.record) };
    return { kind: "session", record: access.record };
  }

  /** Where the page is, touching nothing. 04 R6.6, R6.10 */
  async function locate(id: string): Promise<{ path: string; root: string; exists: boolean }> {
    const storage = await ctx.provider.sessions.storage(id);
    return { path: storage.pathForAgent(ENTRY_DOCUMENT), root: storage.pathForAgent(""), exists: await ctx.pages.available(id) };
  }

  /** Creates the page from the operator's seed, only when one is configured and the entry document is absent. 04 R6.4, R6.18–R6.21 */
  async function seedIfConfigured(record: SessionRecord): Promise<"created" | "existing" | "absent"> {
    const seed = ctx.settings().seed;
    if (!hasSeed(seed)) return "absent";
    const bytes = new TextEncoder().encode(renderSeed(seed, record.title));
    try {
      await ctx.provider.files.write(record.id, ENTRY_DOCUMENT, bytes, { onlyIfAbsent: true });
    } catch (error) {
      if (error instanceof ProviderError && error.code === "conflict") return "existing";
      throw error;
    }
    await ctx.pages.forget(record.id);
    return "created";
  }

  const init: CommandHandler = async ({ sessionId }) => {
    const found = await current(sessionId);
    if (found.kind === "skip") return { text: `${INIT_LINES.skip(found.reason)}\n`, exit: 0 };
    const { record } = found;
    const located = await locate(record.id);
    let state: "new" | "seeded" | "existing" = located.exists ? "existing" : "new";
    if (state === "new") {
      const seeded = await seedIfConfigured(record);
      if (seeded === "created") state = "seeded";
      else if (seeded === "existing") state = "existing";
    }
    const { url, relative } = await pageUrl(ctx, record.id);
    const lines = [INIT_LINES[state](located.path), `URL: ${url}`, `Root: ${located.root}`];
    if (relative) lines.push("The URL is a path on this host's own address; open it there.");
    if (state !== "existing" && record.clearedFromId) lines.push(`Cleared from: ${(await pageUrl(ctx, record.clearedFromId)).url}`);
    if (state === "existing") {
      try {
        await ctx.pages.load(record.id);
      } catch (error) {
        lines.push(`Warning: the page cannot be served: ${errorText(error)}`);
      }
    }
    return { text: `${lines.join("\n")}\n`, exit: 0 };
  };

  const guide: CommandHandler = async () => ({ text: buildGuide(await guideInputFrom(ctx)), exit: 0 });

  const home: CommandHandler = async ({ sessionId, args }) => {
    if (args.length === 1 && args[0] === "--clear") {
      await ctx.home.clear();
      return { text: "home: cleared — the home address serves the built-in home page again.\n", exit: 0 };
    }
    if (args.length > 0) return { text: "Usage: home [--clear]\n", exit: 1 };
    const found = await current(sessionId);
    if (found.kind === "skip") return { text: `Cannot make this session home: ${found.reason}. Run it from a visible root session.\n`, exit: 1 };
    const { record } = found;
    const lines: string[] = [];
    const previous = await ctx.home.get();
    if (previous !== null && previous !== record.id) {
      const other = await ctx.provider.sessions.get(previous).catch(() => null);
      lines.push(`Warning: home was ${other ? `“${other.title}” (${previous})` : `${previous} (no longer exists)`}; it now points here instead.`);
    }
    await ctx.home.set(record.id);
    const exists = await ctx.pages.available(record.id);
    lines.push(`home: ${record.id}`, `URL: ${await homeUrl(ctx)}`, exists ? "The page was left untouched; the home address now serves it instead of the built-in home page (which stays at home?builtin=1)." : "No page yet: write this session's page; the home address then serves it instead of the built-in home page (which stays at home?builtin=1).");
    return { text: `${lines.join("\n")}\n`, exit: 0 };
  };

  const grants: CommandHandler = async ({ args }) => {
    if (args.length === 3 && args[0] === "--revoke" && isSessionId(args[1]) && isSessionId(args[2])) {
      const removed = await ctx.grants.revoke(args[1], args[2]);
      return { text: `revoked: ${removed ? 1 : 0}\n`, exit: 0 };
    }
    if (args.length === 1 && args[0] === "--revoke-all") {
      const removed = await ctx.grants.revokeAll();
      return { text: `revoked: ${removed}\n`, exit: 0 };
    }
    if (args.length > 0) return { text: "Usage: grants [--revoke <page-session> <target-session> | --revoke-all]\n", exit: 1 };
    const pairs = await ctx.grants.listAll();
    const name = async (id: string): Promise<string> => {
      const record = await ctx.provider.sessions.get(id).catch(() => null);
      return record ? `${record.title} (${id})` : id;
    };
    const lines = [
      "# Pages that may answer another session from an embed",
      `embedAnswerGrants: ${ctx.settings().embedAnswerGrants ? "on — the reader is asked once per pair" : "off — nobody is asked; the pairs below are kept but not consulted"}`,
      "",
    ];
    if (pairs.length === 0) lines.push("(none)");
    for (const pair of pairs) {
      lines.push(`${await name(pair.from)} → ${await name(pair.to)}   granted ${iso(pair.grantedAtMs)}   last answered ${pair.lastAnsweredAtMs === null ? "never" : iso(pair.lastAnsweredAtMs)}   ${pair.count} answer${pair.count === 1 ? "" : "s"}`);
    }
    lines.push("", "Revoke one: --revoke <page-session> <target-session>; all: --revoke-all. The reader can do the same from the home page.");
    return { text: `${lines.join("\n")}\n`, exit: 0 };
  };

  const status: CommandHandler = async ({ sessionId }) => {
    const settings = ctx.settings();
    const contributions = await ctx.contributions.current();
    const report = await injector.inject();
    const homeId = await ctx.home.get();
    const lines = [
      "# Pages status",
      "",
      `instructionEnabled: ${settings.instructionEnabled ? "on" : "off"}`,
      `instructionText: ${settings.instructionText === null ? "built-in" : `custom (${settings.instructionText.length} characters)`}`,
      `workingLabel: ${settings.workingLabel ? JSON.stringify(settings.workingLabel) : "(blank — indicator hidden)"}`,
      `seed: ${hasSeed(settings.seed) ? `set (${settings.seed.length} characters) — init starts new pages from it` : "(none — init creates no file; the agent writes the whole page)"}`,
      `embedAnswerGrants: ${settings.embedAnswerGrants ? "on" : "off"}`,
      `audioInputDeviceId: ${settings.audioInputDeviceId ?? "(default)"}`,
      `home: ${homeId ?? "(none — the home address serves the built-in home page)"}`,
      `site strategy: ${ctx.strategy.kind}`,
      `contributors: ${contributions.contributors.length === 0 ? "(none registered)" : contributions.contributors.map((contributor) => `${contributor.id} ${contributor.version}: ${contributor.methods.map((method) => `${method.method} (${method.effect})`).join(", ") || "no methods"}`).join("; ")}`,
      `instruction slots: ${ctx.provider.instruction.slots.map((slot) => `${slot.name} (${slot.cap === null ? "no cap" : `cap ${slot.cap}`})`).join(", ") || "(none declared)"}`,
      "",
      "## Instruction a new eligible session receives now",
      "",
      ...instructionLines(report),
    ];
    lines.push("", "## This session");
    const found = await current(sessionId);
    if (found.kind === "skip") {
      lines.push(`no page: ${found.reason}`);
    } else {
      const located = await locate(found.record.id);
      lines.push(`page: ${located.path}`, `URL: ${(await pageUrl(ctx, found.record.id)).url}`);
      if (!located.exists) {
        lines.push("not written yet");
      } else {
        try {
          const page = await ctx.pages.load(found.record.id);
          lines.push(`revision: ${page.revision}${page.stale ? " (offline copy)" : ""}${page.archived ? " (archived, read-only)" : ""}`);
          lines.push(`carried into the document: ${page.site.resolved} file${page.site.resolved === 1 ? "" : "s"} (parts and own files)`);
          for (const file of page.site.skipped.slice(0, LIMITS.includeReports)) lines.push(`not carried: ${file.path} (${file.reason})`);
          for (const file of page.site.deferred.slice(0, LIMITS.includeReports)) lines.push(`fetched by the shell (large media): ${file.path} (${mebibytes(file.bytes)})`);
        } catch (error) {
          lines.push(`revision: cannot be served — ${errorText(error)}`);
        }
      }
    }
    return { text: `${lines.join("\n")}\n`, exit: 0 };
  };

  return { init, guide, status, home, grants };
}

/** Registers the five roles through the provider; returns them for a host that routes a CLI itself. 06 R-P15 */
export function registerCommands(ctx: ServingContext, options: CommandOptions = {}): Record<CommandRole, CommandHandler> {
  const commands = createCommands(ctx, options);
  for (const role of COMMAND_ROLES) ctx.provider.command.register(role, commands[role]);
  return commands;
}

/** The placements, one line per part, then the text per slot as placed. 04 R6.31; 08 A146, A147, A176 */
function instructionLines(report: InjectionReport): string[] {
  if (report.parts === null) return ["(none — instructionEnabled is off; no fragment is injected either)"];
  const lines: string[] = [];
  const perSlot = new Map<string, number>();
  for (const part of report.parts) {
    const placement = part.placement;
    const label = part.part === "standing" ? "standing instruction" : `fragment ${part.part}${part.version ? ` ${part.version}` : ""}`;
    if (!placement) {
      lines.push(`${label}: ${part.text.length} characters, no placement reported by the provider`);
      continue;
    }
    const cap = placement.cap === null ? "no cap" : `of ${placement.cap}`;
    const cut = placement.cutAt === null ? "arrives whole" : `CUT at ${placement.cutAt}: sessions read up to "${lastWords(part.text.slice(0, placement.cutAt))}"`;
    lines.push(`${label} → slot "${placement.slot}": ${placement.chars} characters ${cap}, ${cut}`);
    perSlot.set(placement.slot, (perSlot.get(placement.slot) ?? 0) + 1);
  }
  const standing = report.parts[0];
  if (standing?.placement && standing.placement.cap !== null && (perSlot.get(standing.placement.slot) ?? 0) > 1) {
    lines.push(`slot "${standing.placement.slot}" leaves ${Math.max(0, standing.placement.cap - standing.placement.chars)} characters for the fragments together`);
  }
  lines.push("");
  const slots = new Map<string, PlacedPart[]>();
  for (const part of report.parts) {
    const slot = part.placement?.slot ?? "(unplaced)";
    slots.set(slot, [...(slots.get(slot) ?? []), part]);
  }
  for (const [slot, parts] of slots) {
    lines.push(`### Slot "${slot}"`, "");
    lines.push(parts.map((part) => (part.placement?.cutAt === null || part.placement === null ? part.text : part.text.slice(0, part.placement.cutAt))).join("\n\n"));
    lines.push("");
  }
  return lines;
}

function lastWords(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.slice(-6).join(" ");
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
