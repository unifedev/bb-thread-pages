import type { BbPluginApi, PluginCliContext, PluginCliResult } from "@get-bb/plugin-sdk";
import { describeIneligible, ineligibleReason } from "../domain/eligibility.ts";
import { PageError, errorText } from "../domain/errors.ts";
import { isSessionId } from "../domain/ids.ts";
import { LIMITS } from "../domain/limits.ts";
import type { SessionRecord } from "../host/types.ts";
import { ENTRY_FILE, LEGACY_ENTRY_FILE, UPLOAD_DIR, entryPath, joinPath, legacyEntryPath } from "../pages/layout.ts";
import { homeUrl, pageUrl, type ServingContext } from "../serving/context.ts";
import { hasSeed, renderSeed } from "./seed/seed.ts";

/**
 * `bb thread-page init | home [--clear] | guide | status`. spec 06 §The command, RW-11
 */
export interface CliDeps {
  serving: ServingContext;
  guide: string;
  /** The exact instruction a new eligible session receives now, or null when none would. */
  effectiveInstruction(): string | null;
}

export function registerCli(bb: BbPluginApi, deps: CliDeps): void {
  bb.cli.register({
    name: "thread-page",
    summary: "The page this session writes for its reader: print its path and link, the authoring guide, make it home",
    commands: [
      { name: "init", summary: "Print this session's page path and link, and whether the page exists yet", usage: "bb thread-page init" },
      { name: "guide", summary: "Print the authoring guide (forms, files, documents, other services, capabilities, limits)", usage: "bb thread-page guide" },
      { name: "home", summary: "Make this session's page the home page every page links back to", usage: "bb thread-page home [--clear]" },
      { name: "status", summary: "Show settings, the instruction new sessions get, and this session's page", usage: "bb thread-page status" },
    ],
    async run(argv, context) {
      const [command, ...rest] = argv;
      try {
        switch (command) {
          case "init":
            return rest.length === 0 ? await init(deps, context) : usage();
          case "guide":
            return rest.length === 0 ? { exitCode: 0, stdout: `${deps.guide}\n` } : usage();
          case "home":
            if (rest.length === 0) return await home(deps, context);
            if (rest.length === 1 && rest[0] === "--clear") return await clearHome(deps);
            return usage("bb thread-page home [--clear]");
          case "status":
            return rest.length === 0 ? await status(deps, context) : usage();
          default:
            return usage();
        }
      } catch (error) {
        deps.serving.host.log.warn(`cli ${command ?? ""}: ${errorText(PageError.is(error) ? (error.cause ?? error) : error)}`);
        return { exitCode: 1, stderr: `Could not run thread-page ${command ?? ""}: ${errorText(error)}\n` };
      }
    },
  });
}

function usage(text = "bb thread-page <init|guide|home [--clear]|status>"): PluginCliResult {
  return { exitCode: 2, stderr: `Usage: ${text}\n` };
}

async function currentSession(deps: CliDeps, context: PluginCliContext): Promise<{ id: string; session: SessionRecord } | { skip: string }> {
  if (!context.threadId) return { skip: "no current session" };
  const session = await deps.serving.host.sessions.get(context.threadId);
  if (!session) return { skip: "the current session does not exist" };
  const reason = ineligibleReason(session);
  if (reason) return { skip: describeIneligible(reason) };
  return { id: session.id, session };
}

function skipLine(reason: string): PluginCliResult {
  return { exitCode: 0, stdout: `state: SKIP — ${reason}; this session has no page. Answer normally in chat and do not create one.\n` };
}

async function link(deps: CliDeps, path: string): Promise<string> {
  const origin = await deps.serving.host.origin.public();
  return origin ? `${origin}${path}` : path;
}

type PageState = "absent" | "created" | "existing";

interface PageReport {
  absolutePath: string;
  state: PageState;
  legacy: boolean;
  problem: string | null;
}

/** Where the page is and whether it exists, touching nothing. spec R6.10 */
async function inspectPage(deps: CliDeps, id: string): Promise<PageReport> {
  const { serving } = deps;
  const location = await serving.host.sessions.storage(id);
  const absolutePath = entryPath(location.rootPath);
  const legacyPath = legacyEntryPath(location.rootPath);
  const existence = await serving.host.files.exist(location.hostId, [absolutePath, legacyPath]);
  const state: PageState = existence[absolutePath] === true ? "existing" : "absent";
  let problem: string | null = null;
  if (state === "existing") {
    try {
      await serving.pages.load(id);
    } catch (error) {
      problem = PageError.is(error) ? error.message : errorText(error);
    }
  }
  return { absolutePath, state, legacy: existence[legacyPath] === true, problem };
}

/**
 * The product ships no starting file, so `init` creates a page only when an
 * operator configured one. spec R6.4, R6.18–R6.20
 */
async function ensurePage(deps: CliDeps, id: string, title: string): Promise<PageReport> {
  const { serving } = deps;
  const report = await inspectPage(deps, id);
  const template = serving.settings.current().pageSeedHtml;
  if (report.state !== "absent" || !hasSeed(template)) return report;
  const location = await serving.host.sessions.storage(id);
  const seed = renderSeed(template, title);
  const outcome = await serving.host.files.write(location, ENTRY_FILE, Buffer.from(seed, "utf8"), { onlyIfAbsent: true });
  if (outcome !== "written") return { ...report, state: "existing" };
  await serving.pages.remember(id, seed);
  return { ...report, state: "created" };
}

/** Tells the agent where home is and how a reader gets one of their own. */
async function homeLine(deps: CliDeps, current: string): Promise<string> {
  const home = deps.serving.settings.current().homeSessionId;
  if (isSessionId(home) && home === current) return "home: this page is the home page; every other page links back to it.";
  const url = await link(deps, homeUrl(deps.serving.routeBase));
  if (isSessionId(home)) return `home: ${url}  (every page links back to it; you never write that link)`;
  return `home: ${url}  — the built-in home page, since no page is designated. If the reader wants a home of their own, build it in a session dedicated to it and run \`bb thread-page home\` there.`;
}

const STATE_LINES: Record<PageState, string> = {
  absent: "state: NEW — no page yet. Write the whole document at the path above; nothing is provided to fill in. Then reply in chat with only the link.",
  created: "state: NEW — created from the operator's starting file; it is yours to rewrite for this task. Then reply in chat with only the link.",
  existing: "state: EXISTING — read it before editing; update it this turn, keep a way to answer, then reply in chat with only the link.",
};

async function init(deps: CliDeps, context: PluginCliContext): Promise<PluginCliResult> {
  const current = await currentSession(deps, context);
  if ("skip" in current) return skipLine(current.skip);
  const { absolutePath, state, legacy, problem } = await ensurePage(deps, current.id, current.session.title);
  const url = await link(deps, pageUrl(deps.serving.routeBase, current.id));
  const lines = [
    `page: ${absolutePath}`,
    `link: [Open the Thread Page](${url})`,
    STATE_LINES[state],
    `site: files beside ${ENTRY_FILE} are served relatively (nested paths included), other .html files are documents of the page; ${UPLOAD_DIR}/ holds what the reader attaches.`,
    "guide: bb thread-page guide  (controls anywhere on the page, your own files and documents, other services and servers, live session state, starting sessions, limits)",
    await homeLine(deps, current.id),
  ];
  if (problem) lines.push(`warning: the existing page cannot be served — ${problem}`);
  if (legacy) lines.push(`note: a ${LEGACY_ENTRY_FILE} from the previous plugin version is beside it; it is not served. Move what you want from it into ${ENTRY_FILE}.`);
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function home(deps: CliDeps, context: PluginCliContext): Promise<PluginCliResult> {
  const current = await currentSession(deps, context);
  if ("skip" in current) return { exitCode: 2, stderr: `Cannot make this session home: ${current.skip}. Run it from a visible root session.\n` };
  const { serving } = deps;
  const previous = serving.settings.current().homeSessionId;
  const lines: string[] = [];
  if (isSessionId(previous) && previous !== current.id) {
    const other = await serving.host.sessions.get(previous).catch(() => null);
    lines.push(`warning: home was ${other ? `“${other.title}” (${previous})` : previous}; it now points here instead.`);
  }
  const { state } = await inspectPage(deps, current.id);
  await serving.settings.set({ homeSessionId: current.id });
  const url = await link(deps, homeUrl(serving.routeBase));
  lines.push(
    `home: ${current.id}`,
    `link: [Sessions](${url})`,
    "Every other page now shows a “← Sessions” link back to this one, instead of to the built-in home page.",
    state === "existing"
      ? "state: EXISTING — this session's page was left untouched."
      : "state: NO PAGE YET — write this session's page; every other page links back to it. See bb thread-page guide §The home page.",
  );
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function clearHome(deps: CliDeps): Promise<PluginCliResult> {
  await deps.serving.settings.set({ homeSessionId: null });
  return { exitCode: 0, stdout: "home: cleared — pages link to the built-in home page again.\n" };
}

async function status(deps: CliDeps, context: PluginCliContext): Promise<PluginCliResult> {
  const { serving } = deps;
  const settings = serving.settings.current();
  const instruction = deps.effectiveInstruction();
  const lines = [
    "# Thread Pages status",
    "",
    `agentInstructions: ${settings.agentInstructions ? "on" : "off"}`,
    `pageSeedHtml: ${hasSeed(settings.pageSeedHtml) ? `set (${settings.pageSeedHtml.length} characters) — init starts new pages from it` : "(empty — init creates no file; the agent writes the whole page)"}`,
    `workingLabel: ${settings.workingLabel ? JSON.stringify(settings.workingLabel) : "(blank — indicator hidden)"}`,
    `homeSessionId: ${settings.homeSessionId || "(none — pages link to the built-in home page)"}`,
    `site strategy: ${serving.site.name}`,
    `limits: entry ${LIMITS.entryDocumentBytes / (1024 * 1024)} MiB, upload ${LIMITS.uploadFileBytes / (1024 * 1024)} MiB × ${LIMITS.uploadsPerForm}, rate ${LIMITS.ratePerMinute}/min`,
    "",
    "## Instruction a new eligible session receives now",
    "",
    instruction ?? "(none — agentInstructions is off)",
  ];
  const current = await currentSession(deps, context);
  lines.push("", "## This session");
  if ("skip" in current) {
    lines.push(`no page: ${current.skip}`);
  } else {
    const location = await serving.host.sessions.storage(current.id);
    lines.push(`page: ${joinPath(location.rootPath, ENTRY_FILE)}`, `link: ${await link(deps, pageUrl(serving.routeBase, current.id))}`);
    try {
      const page = await serving.pages.load(current.id);
      lines.push(`revision: ${page.revision}${page.stale ? " (offline copy)" : ""}`);
    } catch (error) {
      lines.push(`revision: ${PageError.is(error) ? error.message : errorText(error)}`);
    }
  }
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}
