import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { DEFAULT_AGENT_INSTRUCTION } from "../agent/instruction.ts";
import { DEFAULT_PAGE_SEED } from "../agent/seed/seed.ts";

/**
 * The five settings and nothing more. spec 07
 *
 * Read live: a change applies to the next request without a restart (R7.5).
 * Neither the seed nor the instruction ever touches an existing page (R7.1).
 */
export interface Settings {
  readonly agentInstructions: boolean;
  readonly agentInstructionText: string;
  readonly pageSeedHtml: string;
  readonly workingLabel: string;
  readonly homeSessionId: string;
}

export const DEFAULT_WORKING_LABEL = "Working — this is the last saved version";

export interface LiveSettings {
  current(): Settings;
  set(values: Partial<{ [K in keyof Settings]: Settings[K] | null }>): Promise<Settings>;
}

export async function defineSettings(bb: BbPluginApi): Promise<LiveSettings> {
  const handle = bb.settings.define({
    agentInstructions: {
      type: "boolean",
      label: "Agent instructions",
      description: "Inject the standing Thread Pages instruction into every eligible new session.",
      default: false,
    },
    agentInstructionText: {
      type: "string",
      label: "Agent instruction text",
      description: "What eligible new sessions receive when Agent instructions is on. Changing it affects future sessions only.",
      experimental_multiline: true,
      default: DEFAULT_AGENT_INSTRUCTION,
    },
    pageSeedHtml: {
      type: "string",
      label: "New-page seed",
      description: "The complete HTML a new page starts from. {{TITLE}} is replaced, escaped. Existing pages are never rewritten.",
      experimental_multiline: true,
      default: DEFAULT_PAGE_SEED,
    },
    workingLabel: {
      type: "string",
      label: "Working indicator text",
      description: "Shown in the page header while the owning session is mid-turn. Blank hides the indicator.",
      default: DEFAULT_WORKING_LABEL,
    },
    homeSessionId: {
      type: "string",
      label: "Home page session",
      description: "The session whose page is home; every other page links back to it. Set with `bb thread-page home`.",
      default: "",
    },
  });
  let current = normalize(await handle.get());
  handle.onChange((next) => {
    current = normalize(next);
  });
  return {
    current: () => current,
    async set(values) {
      current = normalize(await handle.experimental_set(values));
      return current;
    },
  };
}

function normalize(values: { agentInstructions: boolean; agentInstructionText: string; pageSeedHtml: string; workingLabel: string; homeSessionId: string }): Settings {
  return {
    agentInstructions: values.agentInstructions === true,
    agentInstructionText: values.agentInstructionText,
    pageSeedHtml: values.pageSeedHtml,
    workingLabel: values.workingLabel.trim(),
    homeSessionId: values.homeSessionId.trim(),
  };
}
