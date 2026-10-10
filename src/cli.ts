// bb.cli.register("pages") → `bb pages <role>` → the handlers the core registered (DESIGN §B.6, D-bb-2).
import { PLUGIN_CLI_OUTPUT_MAX_BYTES, type BbPluginApi, type PluginCliResult } from "@get-bb/plugin-sdk";
import type { CommandHandler } from "./provider/command.ts";
import { errorText } from "./provider/errors.ts";

export const CLI_NAME = "pages";
export const USAGE = "Usage: bb pages <init|guide|home [--clear]|status|grants [--revoke <from> <to> | --revoke-all]>\n";

export const ROLE_INFO = [
  { name: "init", summary: "Print this session's page path and link, and whether the page exists yet", usage: "bb pages init" },
  { name: "guide", summary: "Print the authoring guide (forms, files, documents, other services, capabilities, limits)", usage: "bb pages guide" },
  { name: "home", summary: "Make this session's page the one the home address serves; --clear returns to the built-in home page", usage: "bb pages home [--clear]" },
  { name: "status", summary: "Show settings, the instruction new sessions get with its placements, and this session's page", usage: "bb pages status" },
  { name: "grants", summary: "List or revoke what pages may answer other sessions from an embed", usage: "bb pages grants [--revoke <from> <to> | --revoke-all]" },
] as const;

export interface CliDeps {
  handlers: ReadonlyMap<string, CommandHandler>;
  log: { warn(message: string): void };
}

export function registerCli(bb: BbPluginApi, deps: CliDeps): void {
  bb.cli.register({
    name: CLI_NAME,
    summary: "The page this session writes for its reader: path and link, the authoring guide, home, status, grants",
    commands: ROLE_INFO.map((r) => ({ ...r })),
    async run(argv, ctx): Promise<PluginCliResult> {
      const [role, ...args] = argv;
      const handler = role ? deps.handlers.get(role) : undefined;
      if (!role || !handler) return { exitCode: 2, stderr: USAGE };
      try {
        const out = await handler({ sessionId: ctx.threadId ?? null, args });
        let text = role === "init" ? `plugin: ${bb.pluginId}\n${out.text}` : out.text; // a transcript shows which plugin answered
        text = text.endsWith("\n") ? text : `${text}\n`;
        return out.exit === 0 ? { exitCode: 0, stdout: bounded(text) } : { exitCode: 1, stderr: bounded(text) };
      } catch (error) {
        deps.log.warn(`cli ${role}: ${errorText(error)}`);
        return { exitCode: 1, stderr: `Could not run bb pages ${role}: ${errorText(error)}\n` };
      }
    },
  });
}

/** bb refuses stdout+stderr over `PLUGIN_CLI_OUTPUT_MAX_BYTES` outright; a cut with a trailing note is the lesser loss. */
export function bounded(text: string, cap: number = PLUGIN_CLI_OUTPUT_MAX_BYTES): string {
  if (Buffer.byteLength(text, "utf8") <= cap) return text;
  const note = `\n[cut by bb at ${cap} bytes]\n`;
  const room = Math.max(0, cap - Buffer.byteLength(note, "utf8"));
  return `${Buffer.from(text, "utf8").subarray(0, room).toString("utf8").replace(/�+$/, "")}${note}`;
}
